import {initializeApp} from 'firebase-admin/app';
import {FieldValue, getFirestore, Timestamp} from 'firebase-admin/firestore';
import {getStorage} from 'firebase-admin/storage';
import {logger} from 'firebase-functions';
import {setGlobalOptions} from 'firebase-functions/v2';
import {
  onDocumentCreated,
  onDocumentWritten,
} from 'firebase-functions/v2/firestore';
import {onSchedule} from 'firebase-functions/v2/scheduler';
import {onObjectFinalized} from 'firebase-functions/v2/storage';
import ExcelJS from 'exceljs';
import {tmpdir} from 'os';
import {join} from 'path';
import {unlink} from 'fs/promises';

import {SCORING_VERSION} from './lead-scoring/config';
import {scoreLead, toLeadScoreFields} from './lead-scoring/score';
import {LeadInput} from './lead-scoring/types';

initializeApp();

setGlobalOptions({
  region: 'us-east1',
  maxInstances: 10,
});

const db = getFirestore();

/*
 * Lead Qualification Engine — auto-score a lead whenever it is written.
 *
 * Idempotent: it acts only when the lead is not already scored at the current
 * SCORING_VERSION. Writing the derived fields re-fires this trigger, which then
 * sees the current version and no-ops, so there is no loop. Per-lead only — the
 * batch rescore script adds cross-record duplicate/conflict detection.
 *
 * Only additive `*Score` / `qualification*` fields are written (merge); the raw
 * Outscraper/Vera fields are never overwritten.
 */
export const scoreLeadOnWrite = onDocumentWritten(
    {
      document: 'leads/{leadId}',
      region: 'us-east1',
      retry: false,
    },
    async (event) => {
      const after = event.data?.after;

      if (!after || !after.exists) {
        return;
      }

      const data = after.data() ?? {};

      if (data.scoringVersion === SCORING_VERSION) {
        return;
      }

      const result = scoreLead(data as LeadInput);

      await after.ref.set(
          {
            ...toLeadScoreFields(result),
            scoredAt: FieldValue.serverTimestamp(),
          },
          {merge: true},
      );

      logger.info('Lead scored.', {
        leadId: event.params.leadId,
        band: result.qualificationBand,
        score: result.overallQualificationScore,
      });
    },
);

const ALLOWED_EXTENSIONS = new Set(['csv', 'xlsx', 'xls', 'pdf']);

type RawUploadPath = {
  batchId: string;
  filename: string;
  extension: string;
};

type IntakeJob = {
  jobId?: string;
  batchId?: string;
  runId?: string;
  jobType?: string;
  assignedTo?: string;
  assignedBy?: string;
  status?: string;
  priority?: string;
  sourceFilePath?: string;
  sourceBucket?: string;
  sourceFileName?: string;
  sourceFileType?: string;
  storageGeneration?: string;
  errorCount?: number;
  warningCount?: number;
};

type CleaningJob = {
  jobId?: string;
  batchId?: string;
  jobType?: string;
  assignedTo?: string;
  assignedBy?: string;
  status?: string;
  priority?: string;
  sourceFilePath?: string;
  sourceBucket?: string;
  sourceFileName?: string;
  sourceFileType?: string;
  outputPath?: string;
  errorCount?: number;
  warningCount?: number;
};

type CleaningStats = {
  inputRows: number;
  outputRows: number;
  blankRowsRemoved: number;
  exactDuplicatesFound: number;
  needsReviewCount: number;
};

type ValidationJob = {
  jobId?: string;
  batchId?: string;
  jobType?: string;
  assignedTo?: string;
  assignedBy?: string;
  status?: string;
  priority?: string;
  sourceFilePath?: string;
  sourceBucket?: string;
  sourceFileName?: string;
  sourceFileType?: string;
  outputPath?: string;
  errorCount?: number;
  warningCount?: number;
};

type LeadValidationStatus = 'approved' | 'needs_review' | 'suppressed';

type VeraStats = {
  totalRows: number;
  approvedCount: number;
  needsReviewCount: number;
  suppressedCount: number;
};

/**
 * Creates Vera's validation run document ID.
 *
 * @param batchId Angie OS batch identifier.
 * @return Vera agent-run identifier.
 */
function buildVeraRunId(batchId: string): string {
  return `VERA-${batchId}-001`;
}

/**
 * Finds a column index from a list of possible names.
 *
 * @param headers Normalized worksheet headings.
 * @param candidates Possible heading names.
 * @return Zero-based column index or -1.
 */
function findHeaderIndex(headers: string[], candidates: string[]): number {
  const normalizedHeaders = headers.map((header) =>
    header.trim().toLowerCase(),
  );

  for (const candidate of candidates) {
    const index = normalizedHeaders.indexOf(candidate.toLowerCase());

    if (index >= 0) {
      return index;
    }
  }

  return -1;
}

/**
 * Safely returns a row value by zero-based array index.
 *
 * @param values Row values.
 * @param index Zero-based column index.
 * @return Trimmed cell string.
 */
function getRowValue(values: string[], index: number): string {
  if (index < 0 || index >= values.length) {
    return '';
  }

  return values[index]?.trim() ?? '';
}

/**
 * Creates manageable chunks for Firestore batched writes.
 *
 * @param values Values to split.
 * @param size Maximum items in each chunk.
 * @return Chunked arrays.
 */
function chunkArray<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

/**
 * Creates Vera's validation job ID.
 *
 * @param batchId Angie OS batch identifier.
 * @return Vera validation job identifier.
 */
function buildVeraJobId(batchId: string): string {
  return `JOB-${batchId}-VERA-001`;
}

/**
 * Creates Calvin's agent-run document ID.
 *
 * @param batchId Angie OS batch identifier.
 * @return Calvin agent-run identifier.
 */
function buildCalvinAgentRunId(batchId: string): string {
  return `CALVIN-${batchId}-001`;
}

/**
 * Converts a cell value into a safe trimmed string.
 *
 * @param value Excel cell value.
 * @return Normalized string.
 */
function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string') {
      return value.text.trim();
    }

    if ('result' in value) {
      return String(value.result ?? '').trim();
    }

    return String(value).trim();
  }

  return String(value).trim();
}

/**
 * Converts a heading into a stable column name.
 *
 * @param value Original heading.
 * @param index Column index.
 * @return Normalized heading.
 */
function normalizeHeading(value: string, index: number): string {
  const normalized = value
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s/-]/g, '');

  return normalized || `Column ${index}`;
}

/**
 * Normalizes a phone number without inventing missing information.
 *
 * @param value Original phone value.
 * @return Normalized phone value.
 */
function normalizePhone(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return '';
  }

  const digits = trimmed.replace(/\D/g, '');

  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-` + digits.slice(6);
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return (
      `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-` + digits.slice(7)
    );
  }

  return trimmed;
}

/**
 * Normalizes website values.
 *
 * @param value Original website value.
 * @return Normalized website value.
 */
function normalizeWebsite(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return '';
  }

  const withoutTrailingSlash = trimmed.replace(/\/+$/, '');

  if (
    withoutTrailingSlash.startsWith('http://') ||
    withoutTrailingSlash.startsWith('https://')
  ) {
    return withoutTrailingSlash;
  }

  return `https://${withoutTrailingSlash}`;
}

/**
 * Normalizes email values.
 *
 * @param value Original email value.
 * @return Normalized email value.
 */
function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Determines whether a row contains no meaningful values.
 *
 * @param values Row values.
 * @return True when the row is blank.
 */
function isBlankRow(values: string[]): boolean {
  return values.every((value) => value.trim() === '');
}

/**
 * Parses an Angie OS raw-upload Storage path.
 *
 * Expected format:
 * raw/BAT-YYYYMMDD-###/filename.extension
 *
 * @param objectName Full Firebase Storage object path.
 * @return Parsed upload information or null.
 */
function parseRawUploadPath(objectName: string): RawUploadPath | null {
  const match = objectName.match(
      /^raw\/(BAT-\d{8}-\d{3})\/([^/]+)\.([A-Za-z0-9]+)$/,
  );

  if (!match) {
    return null;
  }

  return {
    batchId: match[1],
    filename: `${match[2]}.${match[3]}`,
    extension: match[3].toLowerCase(),
  };
}

/**
 * Creates Clara's intake job ID for a batch.
 *
 * @param batchId Angie OS batch identifier.
 * @return Clara intake job identifier.
 */
function buildClaraJobId(batchId: string): string {
  return `JOB-${batchId}-CLARA-001`;
}

/**
 * Creates Calvin's first-pass cleaning job ID.
 *
 * @param batchId Angie OS batch identifier.
 * @return Calvin cleaning job identifier.
 */
function buildCalvinJobId(batchId: string): string {
  return `JOB-${batchId}-CALVIN-001`;
}

/**
 * Extracts the final filename from a Storage object path.
 *
 * @param storagePath Complete Storage object path.
 * @return Filename portion of the path.
 */
function getFilenameFromPath(storagePath: string): string {
  const parts = storagePath.split('/');
  return parts[parts.length - 1] || storagePath;
}

/**
 * Creates a run ID for Clara.
 *
 * @param batchId Angie OS batch identifier.
 * @return Clara run identifier.
 */
function buildClaraRunId(batchId: string): string {
  return `RUN-${batchId.replace('BAT-', '')}-CLARA-001`;
}

/**
 * Creates a run ID for Calvin.
 *
 * @param batchId Angie OS batch identifier.
 * @return Calvin run identifier.
 */
function buildCalvinRunId(batchId: string): string {
  return `RUN-${batchId.replace('BAT-', '')}-CALVIN-001`;
}

/**
 * Registers raw files uploaded to Angie OS Storage.
 *
 * This function does not inspect or clean the source data. It creates:
 *
 * - one batch record
 * - one Clara intake job
 * - one upload audit record
 */
export const registerRawUpload = onObjectFinalized(
    {
      retry: false,
      memory: '256MiB',
      timeoutSeconds: 60,
    },
    async (event) => {
      const object = event.data;
      const objectName = object.name;

      if (!objectName) {
        logger.warn('Storage event did not include an object name.');
        return;
      }

      const parsed = parseRawUploadPath(objectName);

      // Firebase Storage may create folder placeholder objects.
      // Files outside the Angie raw-upload naming structure are ignored.
      if (!parsed) {
        logger.info('Ignoring file outside Angie raw-upload structure.', {
          objectName,
        });
        return;
      }

      const {batchId, filename, extension} = parsed;

      const storageGeneration = object.generation ?? 'unknown-generation';

      const uploadEventId = `${batchId}_${storageGeneration}`;

      const batchRef = db.collection('batches').doc(batchId);

      const claraJobId = buildClaraJobId(batchId);

      const claraJobRef = db.collection('jobs').doc(claraJobId);

      const uploadRunRef = db
          .collection('agentRuns')
          .doc(`UPLOAD-${uploadEventId}`);

      if (!ALLOWED_EXTENSIONS.has(extension)) {
        await db.runTransaction(async (transaction) => {
          const existingRun = await transaction.get(uploadRunRef);

          if (existingRun.exists) {
            logger.info('Rejected upload event was already registered.', {
              batchId,
              objectName,
              storageGeneration,
            });
            return;
          }

          transaction.set(
              batchRef,
              {
                batchId,
                batchName: filename.replace(/\.[^.]+$/, ''),
                version: 1,
                originalFilename: filename,
                rawFilePath: objectName,
                rawBucket: object.bucket,
                storageGeneration,
                contentType: object.contentType ?? null,
                fileExtension: extension,
                fileSizeBytes: object.size ? Number(object.size) : null,

                sourcePlatform: 'unknown',
                sourceType: 'unknown',
                industry: 'unknown',
                geography: 'unknown',
                recordCount: null,

                currentStage: 'raw_upload_rejected',
                currentOwner: 'Angie',
                nextOwner: null,
                status: 'needs_human_review',
                priority: 'normal',

                errorCount: 1,
                warningCount: 0,

                notes: `Unsupported upload extension: ${extension}`,

                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
              },
              {
                merge: true,
              },
          );

          transaction.create(uploadRunRef, {
            runId: uploadRunRef.id,
            batchId,
            jobId: null,
            eventType: 'raw_upload_rejected',
            agent: 'system',
            status: 'failed',
            sourceFilePath: objectName,
            storageGeneration,
            error: `Unsupported extension: ${extension}`,
            createdAt: FieldValue.serverTimestamp(),
          });
        });

        logger.warn('Rejected unsupported raw upload.', {
          batchId,
          objectName,
          extension,
        });

        return;
      }

      await db.runTransaction(async (transaction) => {
        const existingRun = await transaction.get(uploadRunRef);
        const existingBatch = await transaction.get(batchRef);
        const existingJob = await transaction.get(claraJobRef);

        // Cloud events can occasionally be delivered more than once.
        if (existingRun.exists) {
          logger.info('Upload event was already registered.', {
            batchId,
            objectName,
            storageGeneration,
          });
          return;
        }

        // Do not silently reuse a Batch ID for a different upload.
        if (existingBatch.exists || existingJob.exists) {
          transaction.create(uploadRunRef, {
            runId: uploadRunRef.id,
            batchId,
            jobId: existingJob.exists ? claraJobId : null,
            eventType: 'duplicate_batch_upload',
            agent: 'system',
            status: 'blocked',
            sourceFilePath: objectName,
            storageGeneration,
            error: `Batch or Clara job already exists for ${batchId}.`,
            createdAt: FieldValue.serverTimestamp(),
          });

          transaction.set(
              batchRef,
              {
                status: 'needs_human_review',
                currentStage: 'duplicate_batch_review',
                errorCount: FieldValue.increment(1),
                notes:
              'A new Storage upload attempted to reuse ' +
              'an existing Batch ID.',
                updatedAt: FieldValue.serverTimestamp(),
              },
              {
                merge: true,
              },
          );

          return;
        }

        transaction.create(batchRef, {
          batchId,
          batchName: filename.replace(/\.[^.]+$/, ''),
          version: 1,
          originalFilename: filename,
          rawFilePath: objectName,
          rawBucket: object.bucket,
          storageGeneration,
          contentType: object.contentType ?? null,
          fileExtension: extension,
          fileSizeBytes: object.size ? Number(object.size) : null,

          sourcePlatform: 'unknown',
          sourceType: 'unknown',
          industry: 'unknown',
          geography: 'unknown',
          searchTerms: [],
          recordCount: null,

          currentStage: 'raw_uploaded',
          currentOwner: 'Clara',
          nextOwner: 'Calvin',
          status: 'pending_intake',
          priority: 'normal',

          errorCount: 0,
          warningCount: 0,

          notes: 'Raw file registered by Storage upload trigger.',

          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        transaction.create(claraJobRef, {
          jobId: claraJobId,
          batchId,
          runId: buildClaraRunId(batchId),

          jobType: 'intake_registration',
          assignedTo: 'Clara',
          assignedBy: 'system',
          status: 'assigned',
          priority: 'normal',

          sourceFilePath: objectName,
          sourceBucket: object.bucket,
          sourceFileName: filename,
          sourceFileType: extension.toUpperCase(),
          storageGeneration,

          requiredOutput: [
            'validate_source_file',
            'complete_batch_metadata',
            'create_calvin_cleaning_job',
          ],

          successCriteria: [
            'Source file exists in Storage',
            'Batch metadata is updated',
            'Source file remains untouched',
            'Exactly one Calvin cleaning job is created',
          ],

          failureConditions: [
            'Source file unavailable',
            'Duplicate Batch ID conflict',
            'Unsupported file format',
            'Required batch record missing',
          ],

          errorCount: 0,
          warningCount: 0,

          notes: 'Created automatically from raw Storage upload.',

          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          startedAt: null,
          completedAt: null,
        });

        transaction.create(uploadRunRef, {
          runId: uploadRunRef.id,
          batchId,
          jobId: claraJobId,
          eventType: 'raw_upload_registered',
          agent: 'system',
          status: 'complete',
          sourceFilePath: objectName,
          storageGeneration,
          createdAt: FieldValue.serverTimestamp(),
        });
      });

      logger.info('Raw Angie upload registered.', {
        batchId,
        jobId: claraJobId,
        objectName,
      });
    },
);

/**
 * Processes new Clara intake jobs.
 *
 * This function validates the source file, completes the deterministic
 * intake handoff, marks Clara's job complete, and creates Calvin's
 * first-pass cleaning job.
 */
export const processClaraIntakeJob = onDocumentCreated(
    {
      document: 'jobs/{jobId}',
      region: 'us-east1',
      retry: false,
      memory: '256MiB',
      timeoutSeconds: 60,
    },
    async (event) => {
      const snapshot = event.data;

      if (!snapshot) {
        logger.warn('Clara intake trigger received no document snapshot.');
        return;
      }

      const jobId = event.params.jobId;
      const job = snapshot.data() as IntakeJob;

      // Every newly created job reaches this trigger.
      // Only Clara intake jobs belong to this function.
      if (
        job.assignedTo !== 'Clara' ||
      job.jobType !== 'intake_registration' ||
      job.status !== 'assigned'
      ) {
        logger.info('Ignoring non-Clara intake job.', {
          jobId,
          assignedTo: job.assignedTo,
          jobType: job.jobType,
          status: job.status,
        });
        return;
      }

      const batchId = job.batchId;
      const sourceFilePath = job.sourceFilePath;
      const sourceBucket = job.sourceBucket;

      if (!batchId || !sourceFilePath || !sourceBucket) {
        await snapshot.ref.set(
            {
              status: 'blocked',
              errorCount: FieldValue.increment(1),
              notes:
            'Clara intake blocked: batchId, sourceFilePath, ' +
            'or sourceBucket is missing.',
              updatedAt: FieldValue.serverTimestamp(),
            },
            {
              merge: true,
            },
        );

        logger.error('Clara intake job is missing required fields.', {
          jobId,
          batchId,
          sourceFilePath,
          sourceBucket,
        });

        return;
      }

      const batchRef = db.collection('batches').doc(batchId);

      const calvinJobId = buildCalvinJobId(batchId);

      const calvinJobRef = db.collection('jobs').doc(calvinJobId);

      const claraRunRef = db.collection('agentRuns').doc(`CLARA-${batchId}-001`);

      const storageFile = getStorage().bucket(sourceBucket).file(sourceFilePath);

      let fileExists = false;

      try {
        const existsResult = await storageFile.exists();
        fileExists = existsResult[0];
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);

        await db.runTransaction(async (transaction) => {
          const batchSnapshot = await transaction.get(batchRef);
          const currentJobSnapshot = await transaction.get(snapshot.ref);
          const runSnapshot = await transaction.get(claraRunRef);

          if (!currentJobSnapshot.exists) {
            return;
          }

          transaction.set(
              snapshot.ref,
              {
                status: 'blocked',
                errorCount: FieldValue.increment(1),
                notes: `Clara could not inspect the source file: ${reason}`,
                updatedAt: FieldValue.serverTimestamp(),
              },
              {
                merge: true,
              },
          );

          if (batchSnapshot.exists) {
            transaction.set(
                batchRef,
                {
                  currentStage: 'intake_blocked',
                  currentOwner: 'Clara',
                  nextOwner: null,
                  status: 'blocked',
                  errorCount: FieldValue.increment(1),
                  notes: 'Clara could not access the raw Storage object.',
                  updatedAt: FieldValue.serverTimestamp(),
                },
                {
                  merge: true,
                },
            );
          }

          if (!runSnapshot.exists) {
            transaction.create(claraRunRef, {
              runId: claraRunRef.id,
              batchId,
              jobId,
              agent: 'Clara',
              eventType: 'intake_registration',
              status: 'blocked',
              sourceFilePath,
              error: reason,
              createdAt: FieldValue.serverTimestamp(),
            });
          }
        });

        logger.error('Clara could not inspect the Storage file.', {
          batchId,
          jobId,
          sourceFilePath,
          reason,
        });

        return;
      }

      if (!fileExists) {
        await db.runTransaction(async (transaction) => {
          const batchSnapshot = await transaction.get(batchRef);
          const currentJobSnapshot = await transaction.get(snapshot.ref);
          const runSnapshot = await transaction.get(claraRunRef);

          if (!currentJobSnapshot.exists) {
            return;
          }

          transaction.set(
              snapshot.ref,
              {
                status: 'blocked',
                errorCount: FieldValue.increment(1),
                notes:
              `Clara intake blocked: source file not found at ` +
              `${sourceFilePath}.`,
                updatedAt: FieldValue.serverTimestamp(),
              },
              {
                merge: true,
              },
          );

          if (batchSnapshot.exists) {
            transaction.set(
                batchRef,
                {
                  currentStage: 'intake_blocked',
                  currentOwner: 'Clara',
                  nextOwner: null,
                  status: 'blocked',
                  errorCount: FieldValue.increment(1),
                  notes: `Source file was not found at ${sourceFilePath}.`,
                  updatedAt: FieldValue.serverTimestamp(),
                },
                {
                  merge: true,
                },
            );
          }

          if (!runSnapshot.exists) {
            transaction.create(claraRunRef, {
              runId: claraRunRef.id,
              batchId,
              jobId,
              agent: 'Clara',
              eventType: 'intake_registration',
              status: 'blocked',
              sourceFilePath,
              error: `Source file not found: ${sourceFilePath}`,
              createdAt: FieldValue.serverTimestamp(),
            });
          }
        });

        logger.error('Clara could not locate the source file.', {
          batchId,
          jobId,
          sourceFilePath,
        });

        return;
      }

      let metadata;

      try {
        const metadataResult = await storageFile.getMetadata();
        metadata = metadataResult[0];
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);

        await snapshot.ref.set(
            {
              status: 'blocked',
              errorCount: FieldValue.increment(1),
              notes: `Clara could not read file metadata: ${reason}`,
              updatedAt: FieldValue.serverTimestamp(),
            },
            {
              merge: true,
            },
        );

        logger.error('Clara could not read source-file metadata.', {
          batchId,
          jobId,
          sourceFilePath,
          reason,
        });

        return;
      }

      await db.runTransaction(async (transaction) => {
      // Firestore requires all transaction reads before writes.
        const batchSnapshot = await transaction.get(batchRef);
        const currentJobSnapshot = await transaction.get(snapshot.ref);
        const calvinJobSnapshot = await transaction.get(calvinJobRef);
        const existingRunSnapshot = await transaction.get(claraRunRef);

        if (!batchSnapshot.exists) {
          throw new Error(`Batch ${batchId} does not exist.`);
        }

        if (!currentJobSnapshot.exists) {
          throw new Error(`Clara job ${jobId} does not exist.`);
        }

        const currentJobData = currentJobSnapshot.data() as IntakeJob;

        // Firestore events may be delivered more than once.
        if (existingRunSnapshot.exists || currentJobData.status === 'complete') {
          logger.info('Clara intake job was already processed.', {
            batchId,
            jobId,
          });
          return;
        }

        if (currentJobData.status !== 'assigned') {
          logger.info('Clara intake job is no longer assigned.', {
            batchId,
            jobId,
            status: currentJobData.status,
          });
          return;
        }

        if (calvinJobSnapshot.exists) {
          throw new Error(
              `Calvin job ${calvinJobId} already exists unexpectedly.`,
          );
        }

        const metadataFilename = getFilenameFromPath(
            metadata.name ?? sourceFilePath,
        );

        const sourceFilename = job.sourceFileName ?? metadataFilename;

        const fileExtension =
        job.sourceFileType ??
        sourceFilename.split('.').pop()?.toUpperCase() ??
        null;

        transaction.set(
            batchRef,
            {
              originalFilename: sourceFilename,
              rawFilePath: sourceFilePath,
              rawBucket: sourceBucket,
              storageGeneration:
            job.storageGeneration ?? metadata.generation ?? null,
              contentType: metadata.contentType ?? null,
              fileSizeBytes: metadata.size ? Number(metadata.size) : null,

              currentStage: 'cleaning_assigned',
              currentOwner: 'Calvin',
              nextOwner: 'Vera',
              status: 'in_progress',

              notes:
            'Clara intake completed. First-pass cleaning ' +
            'assigned to Calvin.',

              updatedAt: FieldValue.serverTimestamp(),
            },
            {
              merge: true,
            },
        );

        transaction.set(
            snapshot.ref,
            {
              status: 'complete',
              startedAt: FieldValue.serverTimestamp(),
              completedAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),

              notes:
            'Intake registration completed. ' + 'Calvin cleaning job created.',
            },
            {
              merge: true,
            },
        );

        transaction.create(calvinJobRef, {
          jobId: calvinJobId,
          batchId,
          runId: buildCalvinRunId(batchId),

          jobType: 'first_pass_cleaning',
          assignedTo: 'Calvin',
          assignedBy: 'Clara',
          status: 'assigned',
          priority: currentJobData.priority ?? 'normal',

          sourceFilePath,
          sourceBucket,
          sourceFileName: sourceFilename,
          sourceFileType: fileExtension,
          storageGeneration: job.storageGeneration ?? metadata.generation ?? null,

          outputPath: `cleaned/${batchId}/`,

          requiredOutput: [
            'cleaned_workbook',
            'readme_tab',
            'batch_manifest_tab',
            'raw_combined_tab',
            'cleaned_leads_tab',
            'duplicate_review_tab',
            'needs_review_tab',
            'processing_log_tab',
          ],

          successCriteria: [
            'Original source file remains unchanged',
            'Cleaned workbook is created',
            'Original columns are preserved',
            'Duplicate Review tab exists',
            'Needs Review tab exists',
            'Processing Log tab exists',
          ],

          failureConditions: [
            'Source file unavailable',
            'Source file unreadable',
            'Batch record mismatch',
            'Unsupported spreadsheet structure',
            'Output destination unavailable',
          ],

          errorCount: 0,
          warningCount: 0,

          notes: 'Created automatically by Clara intake processing.',

          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          startedAt: null,
          completedAt: null,
        });

        transaction.create(claraRunRef, {
          runId: claraRunRef.id,
          batchId,
          jobId,
          nextJobId: calvinJobId,
          agent: 'Clara',
          eventType: 'intake_registration',
          status: 'complete',
          sourceFilePath,
          sourceFileName: sourceFilename,
          sourceFileType: fileExtension,
          fileSizeBytes: metadata.size ? Number(metadata.size) : null,
          createdAt: FieldValue.serverTimestamp(),
        });
      });

      logger.info('Clara intake completed and Calvin job assigned.', {
        batchId,
        jobId,
        calvinJobId,
        sourceFilePath,
      });
    },
);
/**
 * Processes Calvin first-pass cleaning jobs.
 */
export const processCalvinCleaningJob = onDocumentCreated(
    {
      document: 'jobs/{jobId}',
      region: 'us-east1',
      retry: false,
      memory: '1GiB',
      timeoutSeconds: 540,
    },
    async (event) => {
      const snapshot = event.data;

      if (!snapshot) {
        logger.warn('Calvin trigger received no job snapshot.');
        return;
      }

      const jobId = event.params.jobId;
      const job = snapshot.data() as CleaningJob;

      if (
        job.assignedTo !== 'Calvin' ||
      job.jobType !== 'first_pass_cleaning' ||
      job.status !== 'assigned'
      ) {
        logger.info('Ignoring non-Calvin cleaning job.', {
          jobId,
          assignedTo: job.assignedTo,
          jobType: job.jobType,
          status: job.status,
        });
        return;
      }

      const batchId = job.batchId;
      const sourceFilePath = job.sourceFilePath;
      const sourceBucket = job.sourceBucket;
      const sourceFileType = job.sourceFileType?.toUpperCase();

      if (!batchId || !sourceFilePath || !sourceBucket) {
        await snapshot.ref.set(
            {
              status: 'blocked',
              errorCount: FieldValue.increment(1),
              notes:
            'Calvin blocked: missing batchId, sourceFilePath, ' +
            'or sourceBucket.',
              updatedAt: FieldValue.serverTimestamp(),
            },
            {merge: true},
        );

        return;
      }

      if (sourceFileType !== 'XLSX') {
        await snapshot.ref.set(
            {
              status: 'blocked',
              errorCount: FieldValue.increment(1),
              notes:
            `Calvin v1 currently supports XLSX files only. ` +
            `Received ${sourceFileType ?? 'unknown'}.`,
              updatedAt: FieldValue.serverTimestamp(),
            },
            {merge: true},
        );

        return;
      }

      const bucket = getStorage().bucket(sourceBucket);
      const sourceFile = bucket.file(sourceFilePath);

      const localSourcePath = join(tmpdir(), `${batchId}-source.xlsx`);

      const localOutputPath = join(tmpdir(), `${batchId}-cleaned-v1.xlsx`);

      const outputFileName = `${batchId}_Cleaned_v1.xlsx`;
      const outputStoragePath = `cleaned/${batchId}/${outputFileName}`;

      const batchRef = db.collection('batches').doc(batchId);
      const calvinRunRef = db
          .collection('agentRuns')
          .doc(buildCalvinAgentRunId(batchId));

      const veraJobId = buildVeraJobId(batchId);
      const veraJobRef = db.collection('jobs').doc(veraJobId);

      try {
        await snapshot.ref.set(
            {
              status: 'in_progress',
              startedAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
              notes: 'Calvin first-pass cleaning started.',
            },
            {merge: true},
        );

        await sourceFile.download({
          destination: localSourcePath,
        });

        const sourceWorkbook = new ExcelJS.Workbook();
        await sourceWorkbook.xlsx.readFile(localSourcePath);

        if (sourceWorkbook.worksheets.length === 0) {
          throw new Error('Source workbook contains no worksheets.');
        }

        const sourceSheet = sourceWorkbook.worksheets[0];

        if (sourceSheet.rowCount < 1) {
          throw new Error('Source worksheet is empty.');
        }

        const outputWorkbook = new ExcelJS.Workbook();

        outputWorkbook.creator = 'Angie OS - Calvin';
        outputWorkbook.created = new Date();

        const readmeSheet = outputWorkbook.addWorksheet('README');
        const manifestSheet = outputWorkbook.addWorksheet('Batch Manifest');
        const rawSheet = outputWorkbook.addWorksheet('Raw Combined');
        const cleanedSheet = outputWorkbook.addWorksheet('Cleaned Leads');
        const duplicateSheet = outputWorkbook.addWorksheet('Duplicate Review');
        const reviewSheet = outputWorkbook.addWorksheet('Needs Review');
        const logSheet = outputWorkbook.addWorksheet('Processing Log');

        readmeSheet.addRows([
          ['Angie OS First-Pass Cleaned Workbook'],
          ['Batch ID', batchId],
          ['Source File', job.sourceFileName ?? sourceFilePath],
          ['Processed By', 'Calvin'],
          [
            'Purpose',
            'Preserves raw data and creates a cleaned operational view.',
          ],
          [
            'Important',
            'Rows requiring judgment are flagged rather than deleted.',
          ],
        ]);

        manifestSheet.addRows([
          ['Field', 'Value'],
          ['Batch ID', batchId],
          ['Job ID', jobId],
          ['Source File', job.sourceFileName ?? sourceFilePath],
          ['Source Storage Path', sourceFilePath],
          ['Output Storage Path', outputStoragePath],
          ['Processing Stage', 'Cleaning Complete'],
          ['Processed By', 'Calvin'],
          ['Processed At', new Date().toISOString()],
        ]);

        sourceSheet.eachRow(
            {
              includeEmpty: true,
            },
            (row) => {
              const values: Array<string | number | boolean> = [];

              for (
                let columnIndex = 1;
                columnIndex <= sourceSheet.columnCount;
                columnIndex += 1
              ) {
                const cellValue = row.getCell(columnIndex).value;

                if (
                  typeof cellValue === 'number' ||
              typeof cellValue === 'boolean'
                ) {
                  values.push(cellValue);
                } else {
                  values.push(cellToString(cellValue));
                }
              }

              rawSheet.addRow(values);
            },
        );

        const originalHeaders: string[] = [];

        for (
          let columnIndex = 1;
          columnIndex <= sourceSheet.columnCount;
          columnIndex += 1
        ) {
          originalHeaders.push(
              normalizeHeading(
                  cellToString(sourceSheet.getRow(1).getCell(columnIndex).value),
                  columnIndex,
              ),
          );
        }

        const systemHeaders = [
          'Lead ID',
          'Batch ID',
          'Import Date',
          'Current Stage',
          'Current Owner',
          'Next Owner',
          'Priority',
          'Status',
          'Processing Notes',
          'Needs Review',
        ];

        cleanedSheet.addRow([...originalHeaders, ...systemHeaders]);

        duplicateSheet.addRow([
          'Original Row Number',
          'Duplicate Of Row',
          'Duplicate Key',
          ...originalHeaders,
        ]);

        reviewSheet.addRow([
          'Original Row Number',
          'Review Reasons',
          ...originalHeaders,
        ]);

        const seenRows = new Map<string, number>();

        const stats: CleaningStats = {
          inputRows: Math.max(sourceSheet.rowCount - 1, 0),
          outputRows: 0,
          blankRowsRemoved: 0,
          exactDuplicatesFound: 0,
          needsReviewCount: 0,
        };

        for (let rowIndex = 2; rowIndex <= sourceSheet.rowCount; rowIndex += 1) {
          const sourceRow = sourceSheet.getRow(rowIndex);
          const values: string[] = [];

          for (
            let columnIndex = 1;
            columnIndex <= originalHeaders.length;
            columnIndex += 1
          ) {
            const heading = originalHeaders[columnIndex - 1].toLowerCase();

            let value = cellToString(sourceRow.getCell(columnIndex).value);

            if (heading.includes('phone')) {
              value = normalizePhone(value);
            } else if (heading.includes('website') || heading === 'site') {
              value = normalizeWebsite(value);
            } else if (heading.includes('email')) {
              value = normalizeEmail(value);
            } else {
              value = value.trim();
            }

            values.push(value);
          }

          if (isBlankRow(values)) {
            stats.blankRowsRemoved += 1;
            continue;
          }

          const duplicateKey = JSON.stringify(
              values.map((value) => value.toLowerCase()),
          );

          const originalMatch = seenRows.get(duplicateKey);

          if (originalMatch !== undefined) {
            stats.exactDuplicatesFound += 1;

            duplicateSheet.addRow([
              rowIndex,
              originalMatch,
              duplicateKey,
              ...values,
            ]);

            continue;
          }

          seenRows.set(duplicateKey, rowIndex);

          const reviewReasons: string[] = [];

          const businessNameIndex = originalHeaders.findIndex((header) => {
            const normalized = header.toLowerCase();

            return (
              normalized === 'name' ||
            normalized.includes('business name') ||
            normalized.includes('company name')
            );
          });

          if (businessNameIndex >= 0 && !values[businessNameIndex]) {
            reviewReasons.push('Missing business name');
          }

          const phoneIndexes = originalHeaders
              .map((header, index) => ({
                header: header.toLowerCase(),
                index,
              }))
              .filter((item) => item.header.includes('phone'));

          const hasPhone = phoneIndexes.some((item) =>
            values[item.index]?.trim(),
          );

          const websiteIndexes = originalHeaders
              .map((header, index) => ({
                header: header.toLowerCase(),
                index,
              }))
              .filter(
                  (item) => item.header.includes('website') || item.header === 'site',
              );

          const hasWebsite = websiteIndexes.some((item) =>
            values[item.index]?.trim(),
          );

          if (!hasPhone && !hasWebsite) {
            reviewReasons.push('Missing both phone number and website');
          }

          const needsReview = reviewReasons.length > 0;

          if (needsReview) {
            stats.needsReviewCount += 1;

            reviewSheet.addRow([rowIndex, reviewReasons.join('; '), ...values]);
          }

          stats.outputRows += 1;

          const leadId = `LEAD-${batchId}-${String(stats.outputRows).padStart(6, '0')}`;

          cleanedSheet.addRow([
            ...values,
            leadId,
            batchId,
            new Date().toISOString().slice(0, 10),
            'cleaning_complete',
            'Vera',
            'Enzo',
            'normal',
          needsReview ? 'needs_review' : 'ready_for_validation',
          reviewReasons.join('; '),
          needsReview ? 'Yes' : 'No',
          ]);
        }

        logSheet.addRows([
          ['Metric', 'Value'],
          ['Input Rows', stats.inputRows],
          ['Cleaned Rows', stats.outputRows],
          ['Blank Rows Removed', stats.blankRowsRemoved],
          ['Exact Duplicates Found', stats.exactDuplicatesFound],
          ['Needs Review', stats.needsReviewCount],
          ['Source Sheet', sourceSheet.name],
          ['Source Columns', sourceSheet.columnCount],
          ['Completed At', new Date().toISOString()],
        ]);

        for (const worksheet of outputWorkbook.worksheets) {
          worksheet.views = [
            {
              state: 'frozen',
              ySplit: 1,
            },
          ];

          worksheet.getRow(1).font = {
            bold: true,
          };
        }

        await outputWorkbook.xlsx.writeFile(localOutputPath);

        await bucket.upload(localOutputPath, {
          destination: outputStoragePath,
          metadata: {
            contentType:
            'application/vnd.openxmlformats-officedocument.' +
            'spreadsheetml.sheet',
            metadata: {
              batchId,
              jobId,
              generatedBy: 'Calvin',
              version: '1',
            },
          },
        });

        await db.runTransaction(async (transaction) => {
          const batchSnapshot = await transaction.get(batchRef);
          const currentJobSnapshot = await transaction.get(snapshot.ref);
          const veraJobSnapshot = await transaction.get(veraJobRef);
          const existingRunSnapshot = await transaction.get(calvinRunRef);

          if (!batchSnapshot.exists) {
            throw new Error(`Batch ${batchId} does not exist.`);
          }

          if (!currentJobSnapshot.exists) {
            throw new Error(`Calvin job ${jobId} does not exist.`);
          }

          if (existingRunSnapshot.exists) {
            logger.info('Calvin job already finalized.', {
              batchId,
              jobId,
            });
            return;
          }

          if (veraJobSnapshot.exists) {
            throw new Error(`Vera job ${veraJobId} already exists unexpectedly.`);
          }

          transaction.set(
              batchRef,
              {
                currentStage: 'validation_assigned',
                currentOwner: 'Vera',
                nextOwner: 'Enzo',
                status: 'in_progress',
                cleanedFilePath: outputStoragePath,
                cleanedFileName: outputFileName,
                cleanedRecordCount: stats.outputRows,
                duplicateCount: stats.exactDuplicatesFound,
                needsReviewCount: stats.needsReviewCount,
                updatedAt: FieldValue.serverTimestamp(),
                notes: 'Calvin cleaning completed. Validation assigned to Vera.',
              },
              {merge: true},
          );

          transaction.set(
              snapshot.ref,
              {
                status: 'complete',
                completedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
                outputFilePath: outputStoragePath,
                outputFileName,
                outputRecordCount: stats.outputRows,
                duplicateCount: stats.exactDuplicatesFound,
                needsReviewCount: stats.needsReviewCount,
                notes: 'First-pass cleaning completed successfully.',
              },
              {merge: true},
          );

          transaction.create(veraJobRef, {
            jobId: veraJobId,
            batchId,
            jobType: 'validation',
            assignedTo: 'Vera',
            assignedBy: 'Calvin',
            status: 'assigned',
            priority: job.priority ?? 'normal',
            sourceFilePath: outputStoragePath,
            sourceBucket,
            sourceFileName: outputFileName,
            sourceFileType: 'XLSX',
            outputPath: `validated/${batchId}/`,
            errorCount: 0,
            warningCount: 0,
            notes: 'Created automatically after Calvin cleaning.',
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            startedAt: null,
            completedAt: null,
          });

          transaction.create(calvinRunRef, {
            runId: calvinRunRef.id,
            batchId,
            jobId,
            nextJobId: veraJobId,
            agent: 'Calvin',
            eventType: 'first_pass_cleaning',
            status: 'complete',
            sourceFilePath,
            outputFilePath: outputStoragePath,
            inputRows: stats.inputRows,
            outputRows: stats.outputRows,
            duplicateCount: stats.exactDuplicatesFound,
            needsReviewCount: stats.needsReviewCount,
            createdAt: FieldValue.serverTimestamp(),
          });
        });

        logger.info('Calvin cleaning completed and Vera job assigned.', {
          batchId,
          jobId,
          veraJobId,
          outputStoragePath,
          stats,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);

        logger.error('Calvin cleaning failed.', {
          batchId,
          jobId,
          reason,
        });

        await snapshot.ref.set(
            {
              status: 'blocked',
              errorCount: FieldValue.increment(1),
              updatedAt: FieldValue.serverTimestamp(),
              notes: `Calvin cleaning failed: ${reason}`,
            },
            {merge: true},
        );

        await batchRef.set(
            {
              currentStage: 'cleaning_blocked',
              currentOwner: 'Calvin',
              nextOwner: null,
              status: 'blocked',
              errorCount: FieldValue.increment(1),
              updatedAt: FieldValue.serverTimestamp(),
              notes: `Calvin cleaning failed: ${reason}`,
            },
            {merge: true},
        );
      } finally {
        await Promise.allSettled([
          unlink(localSourcePath),
          unlink(localOutputPath),
        ]);
      }
    },
);
/**
 * Processes Vera validation jobs and publishes usable leads to Firestore.
 */
export const processVeraValidationJob = onDocumentCreated(
    {
      document: 'jobs/{jobId}',
      region: 'us-east1',
      retry: false,
      memory: '1GiB',
      timeoutSeconds: 540,
    },
    async (event) => {
      const snapshot = event.data;

      if (!snapshot) {
        logger.warn('Vera trigger received no job snapshot.');
        return;
      }

      const jobId = event.params.jobId;
      const job = snapshot.data() as ValidationJob;

      if (
        job.assignedTo !== 'Vera' ||
      job.jobType !== 'validation' ||
      job.status !== 'assigned'
      ) {
        logger.info('Ignoring non-Vera validation job.', {
          jobId,
          assignedTo: job.assignedTo,
          jobType: job.jobType,
          status: job.status,
        });

        return;
      }

      const batchId = job.batchId;
      const sourceFilePath = job.sourceFilePath;
      const sourceBucket = job.sourceBucket;
      const sourceFileType = job.sourceFileType?.toUpperCase();

      if (!batchId || !sourceFilePath || !sourceBucket) {
        await snapshot.ref.set(
            {
              status: 'blocked',
              errorCount: FieldValue.increment(1),
              notes:
            'Vera blocked: missing batchId, sourceFilePath, ' +
            'or sourceBucket.',
              updatedAt: FieldValue.serverTimestamp(),
            },
            {merge: true},
        );

        return;
      }

      if (sourceFileType !== 'XLSX') {
        await snapshot.ref.set(
            {
              status: 'blocked',
              errorCount: FieldValue.increment(1),
              notes:
            `Vera v1 supports XLSX files only. Received ` +
            `${sourceFileType ?? 'unknown'}.`,
              updatedAt: FieldValue.serverTimestamp(),
            },
            {merge: true},
        );

        return;
      }

      const bucket = getStorage().bucket(sourceBucket);
      const sourceFile = bucket.file(sourceFilePath);

      const localSourcePath = join(tmpdir(), `${batchId}-vera-source.xlsx`);

      const batchRef = db.collection('batches').doc(batchId);
      const summaryRef = db.collection('batchSummaries').doc(batchId);

      const veraRunRef = db.collection('agentRuns').doc(buildVeraRunId(batchId));

      /*
       * Lead documents are written before the finalization transaction runs,
       * so a redelivered event would rewrite every lead in the batch. Because
       * each lead is merged with a fresh createdAt, that replay would reset
       * createdAt and overwrite any later edit to validationStatus,
       * pipelineStage, currentOwner, or priority.
       *
       * The completed-run marker is the authority on whether this batch was
       * already validated, so it is checked before any work begins. The
       * matching guard inside the finalization transaction is kept as a
       * backstop for two deliveries racing each other.
       */
      const existingVeraRun = await veraRunRef.get();

      if (existingVeraRun.exists) {
        logger.info('Vera already validated this batch. Skipping replay.', {
          batchId,
          jobId,
        });

        return;
      }

      try {
        await snapshot.ref.set(
            {
              status: 'in_progress',
              startedAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
              notes: 'Vera validation started.',
            },
            {merge: true},
        );

        await sourceFile.download({
          destination: localSourcePath,
        });

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(localSourcePath);

        const cleanedSheet = workbook.getWorksheet('Cleaned Leads');

        if (!cleanedSheet) {
          throw new Error('Cleaned Leads worksheet was not found.');
        }

        if (cleanedSheet.rowCount < 2) {
          throw new Error('Cleaned Leads worksheet contains no lead rows.');
        }

        const headers: string[] = [];

        for (
          let columnIndex = 1;
          columnIndex <= cleanedSheet.columnCount;
          columnIndex += 1
        ) {
          headers.push(
              cellToString(cleanedSheet.getRow(1).getCell(columnIndex).value),
          );
        }

        const nameIndex = findHeaderIndex(headers, [
          'name',
          'business name',
          'company name',
        ]);

        const emailNameIndex = findHeaderIndex(headers, [
          'name_for_emails',
          'email greeting name',
        ]);

        const phoneIndex = findHeaderIndex(headers, ['phone', 'phone number']);

        const websiteIndex = findHeaderIndex(headers, ['website', 'site']);

        const emailIndex = findHeaderIndex(headers, ['email', 'email address']);

        const addressIndex = findHeaderIndex(headers, [
          'address',
          'full address',
        ]);

        const streetIndex = findHeaderIndex(headers, [
          'street',
          'street address',
        ]);

        const cityIndex = findHeaderIndex(headers, ['city']);

        const stateIndex = findHeaderIndex(headers, ['state_code', 'state']);

        const postalCodeIndex = findHeaderIndex(headers, [
          'postal_code',
          'zip',
          'zip code',
        ]);

        const categoryIndex = findHeaderIndex(headers, ['category', 'type']);

        const ratingIndex = findHeaderIndex(headers, ['rating']);

        const reviewCountIndex = findHeaderIndex(headers, [
          'reviews',
          'review count',
        ]);

        const placeIdIndex = findHeaderIndex(headers, ['place_id', 'place id']);

        const googleIdIndex = findHeaderIndex(headers, [
          'google_id',
          'google id',
        ]);

        const cidIndex = findHeaderIndex(headers, ['cid']);

        const locationLinkIndex = findHeaderIndex(headers, [
          'location_link',
          'google maps url',
        ]);

        const leadIdIndex = findHeaderIndex(headers, ['lead id']);

        const needsReviewIndex = findHeaderIndex(headers, ['needs review']);

        const processingNotesIndex = findHeaderIndex(headers, [
          'processing notes',
        ]);

        if (nameIndex < 0 || leadIdIndex < 0) {
          throw new Error('Required name or Lead ID column is missing.');
        }

        const leadsToWrite: Array<{
        leadId: string;
        data: Record<string, unknown>;
      }> = [];

        const stats: VeraStats = {
          totalRows: 0,
          approvedCount: 0,
          needsReviewCount: 0,
          suppressedCount: 0,
        };

        for (let rowIndex = 2; rowIndex <= cleanedSheet.rowCount; rowIndex += 1) {
          const worksheetRow = cleanedSheet.getRow(rowIndex);
          const values: string[] = [];

          for (
            let columnIndex = 1;
            columnIndex <= headers.length;
            columnIndex += 1
          ) {
            values.push(cellToString(worksheetRow.getCell(columnIndex).value));
          }

          if (isBlankRow(values)) {
            continue;
          }

          stats.totalRows += 1;

          const businessName = getRowValue(values, nameIndex);
          const phone = getRowValue(values, phoneIndex);
          const website = getRowValue(values, websiteIndex);
          const email = getRowValue(values, emailIndex);

          const existingNeedsReview =
          getRowValue(values, needsReviewIndex).toLowerCase() === 'yes';

          const reviewReasons: string[] = [];

          if (!businessName) {
            reviewReasons.push('Missing business name');
          }

          if (!phone && !website && !email) {
            reviewReasons.push('No phone, website, or email available');
          }

          if (existingNeedsReview) {
            const existingNotes = getRowValue(values, processingNotesIndex);

            reviewReasons.push(existingNotes || 'Flagged during cleaning');
          }

          let validationStatus: LeadValidationStatus;

          if (!businessName) {
            validationStatus = 'suppressed';
            stats.suppressedCount += 1;
          } else if (reviewReasons.length > 0) {
            validationStatus = 'needs_review';
            stats.needsReviewCount += 1;
          } else {
            validationStatus = 'approved';
            stats.approvedCount += 1;
          }

          let leadId = getRowValue(values, leadIdIndex);

          if (!leadId) {
            leadId = `LEAD-${batchId}-${String(rowIndex - 1).padStart(6, '0')}`;
          }

          const ratingText = getRowValue(values, ratingIndex);

          const reviewCountText = getRowValue(values, reviewCountIndex);

          const rating = ratingText ? Number(ratingText) : null;

          const reviewCount = reviewCountText ? Number(reviewCountText) : null;

          leadsToWrite.push({
            leadId,
            data: {
              leadId,
              batchId,

              businessName,
              emailGreetingName: getRowValue(values, emailNameIndex),

              phone,
              website,
              email,

              address: getRowValue(values, addressIndex),

              street: getRowValue(values, streetIndex),

              city: getRowValue(values, cityIndex),

              state: getRowValue(values, stateIndex),

              postalCode: getRowValue(values, postalCodeIndex),

              category: getRowValue(values, categoryIndex),

              rating: Number.isFinite(rating) ? rating : null,

              reviewCount: Number.isFinite(reviewCount) ? reviewCount : null,

              placeId: getRowValue(values, placeIdIndex),

              googleId: getRowValue(values, googleIdIndex),

              cid: getRowValue(values, cidIndex),

              googleMapsUrl: getRowValue(values, locationLinkIndex),

              validationStatus,

              pipelineStage:
              validationStatus === 'approved' ?
                'sales_ready' :
                validationStatus,

              currentOwner:
              validationStatus === 'approved' ? 'Angie' : 'Human Review',

              priority: job.priority ?? 'normal',

              reviewReasons,

              sourceFilePath,
              sourceRowNumber: rowIndex,

              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            },
          });
        }

        /*
       * Firestore batched writes have operation limits, so leads are
       * written in smaller groups rather than one enormous batch.
       */
        const leadChunks = chunkArray(leadsToWrite, 400);

        for (const leadChunk of leadChunks) {
          const firestoreBatch = db.batch();

          for (const lead of leadChunk) {
            const leadRef = db.collection('leads').doc(lead.leadId);

            firestoreBatch.set(leadRef, lead.data, {merge: true});
          }

          await firestoreBatch.commit();
        }

        await db.runTransaction(async (transaction) => {
          const batchSnapshot = await transaction.get(batchRef);

          const jobSnapshot = await transaction.get(snapshot.ref);

          const summarySnapshot = await transaction.get(summaryRef);

          const runSnapshot = await transaction.get(veraRunRef);

          if (!batchSnapshot.exists) {
            throw new Error(`Batch ${batchId} does not exist.`);
          }

          if (!jobSnapshot.exists) {
            throw new Error(`Vera job ${jobId} does not exist.`);
          }

          if (runSnapshot.exists) {
            logger.info('Vera job already finalized.', {
              batchId,
              jobId,
            });

            return;
          }

          transaction.set(
              batchRef,
              {
                currentStage: 'sales_ready',
                currentOwner: 'Angie',
                nextOwner: null,
                status: 'complete',

                approvedLeadCount: stats.approvedCount,

                validationNeedsReviewCount: stats.needsReviewCount,

                suppressedLeadCount: stats.suppressedCount,

                updatedAt: FieldValue.serverTimestamp(),

                notes:
              'Vera validation completed. ' +
              'Approved leads are available to Angie.',
              },
              {merge: true},
          );

          transaction.set(
              snapshot.ref,
              {
                status: 'complete',
                completedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),

                approvedCount: stats.approvedCount,

                needsReviewCount: stats.needsReviewCount,

                suppressedCount: stats.suppressedCount,

                notes: 'Validation completed and leads published.',
              },
              {merge: true},
          );

          if (!summarySnapshot.exists) {
            transaction.create(summaryRef, {
              batchId,
              sourceFilePath,

              totalRows: stats.totalRows,

              approvedCount: stats.approvedCount,

              needsReviewCount: stats.needsReviewCount,

              suppressedCount: stats.suppressedCount,

              status: 'sales_ready',
              completedBy: 'Vera',

              createdAt: FieldValue.serverTimestamp(),

              updatedAt: FieldValue.serverTimestamp(),
            });
          } else {
            transaction.set(
                summaryRef,
                {
                  totalRows: stats.totalRows,

                  approvedCount: stats.approvedCount,

                  needsReviewCount: stats.needsReviewCount,

                  suppressedCount: stats.suppressedCount,

                  status: 'sales_ready',
                  completedBy: 'Vera',

                  updatedAt: FieldValue.serverTimestamp(),
                },
                {merge: true},
            );
          }

          transaction.create(veraRunRef, {
            runId: veraRunRef.id,
            batchId,
            jobId,
            agent: 'Vera',
            eventType: 'validation',
            status: 'complete',
            sourceFilePath,

            totalRows: stats.totalRows,

            approvedCount: stats.approvedCount,

            needsReviewCount: stats.needsReviewCount,

            suppressedCount: stats.suppressedCount,

            createdAt: FieldValue.serverTimestamp(),
          });
        });

        logger.info('Vera validation completed and leads published.', {
          batchId,
          jobId,
          stats,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);

        logger.error('Vera validation failed.', {
          batchId,
          jobId,
          reason,
        });

        await snapshot.ref.set(
            {
              status: 'blocked',
              errorCount: FieldValue.increment(1),
              updatedAt: FieldValue.serverTimestamp(),
              notes: `Vera validation failed: ${reason}`,
            },
            {merge: true},
        );

        await batchRef.set(
            {
              currentStage: 'validation_blocked',
              currentOwner: 'Vera',
              nextOwner: null,
              status: 'blocked',
              errorCount: FieldValue.increment(1),
              updatedAt: FieldValue.serverTimestamp(),
              notes: `Vera validation failed: ${reason}`,
            },
            {merge: true},
        );
      } finally {
        await Promise.allSettled([unlink(localSourcePath)]);
      }
    },
);

/*
 * Pipeline sweeper — recovers jobs orphaned at status 'assigned'.
 *
 * The Clara/Calvin/Vera processors are onDocumentCreated triggers: they act
 * only on a job's creation event. If that event is ever dropped (for example
 * the functions were unavailable when the job was written), the job sits at
 * 'assigned' forever, because onDocumentCreated never replays a missed event.
 * This is exactly what stranded three dental batches mid-pipeline.
 *
 * This scheduled function finds such stale jobs and re-emits their creation
 * event (delete then recreate with identical fields), which the matching
 * processor then picks up. The processors are idempotent, so re-emitting a job
 * that actually did run is harmless.
 *
 * Safety:
 *  - Only 'assigned' jobs are touched; in_progress / complete / blocked jobs
 *    are never modified.
 *  - A job is re-emitted only once its updatedAt is older than
 *    STALE_THRESHOLD_MS, so a freshly created job that is still processing is
 *    never disturbed.
 *  - Re-emits are capped at MAX_SWEEPS. A job that keeps failing is marked
 *    'blocked' for manual review rather than retried forever.
 */
const STALE_THRESHOLD_MS = 5 * 60 * 1000;
const MAX_SWEEPS = 3;

export const sweepStuckJobs = onSchedule(
    {
      schedule: 'every 5 minutes',
      region: 'us-east1',
      memory: '256MiB',
      timeoutSeconds: 120,
    },
    async () => {
      const now = Date.now();

      const snapshot = await db
          .collection('jobs')
          .where('status', '==', 'assigned')
          .get();

      if (snapshot.empty) {
        logger.info('Pipeline sweeper: no assigned jobs.');
        return;
      }

      let reemitted = 0;
      let blocked = 0;
      let skipped = 0;

      for (const doc of snapshot.docs) {
        const data = doc.data();

        // Age gate: never disturb a job that may still be in flight. A healthy
        // job goes assigned -> complete in seconds, so anything older than the
        // threshold and still 'assigned' is genuinely stuck.
        const stamp = data.updatedAt ?? data.createdAt;
        const stampMs = stamp instanceof Timestamp ? stamp.toMillis() : 0;

        if (stampMs && now - stampMs < STALE_THRESHOLD_MS) {
          skipped += 1;
          continue;
        }

        const sweepCount =
          typeof data.sweepCount === 'number' ? data.sweepCount : 0;

        // Give up after repeated attempts rather than looping forever on a job
        // that cannot make progress.
        if (sweepCount >= MAX_SWEEPS) {
          await doc.ref.set(
              {
                status: 'blocked',
                updatedAt: FieldValue.serverTimestamp(),
                notes:
                  `Pipeline sweeper: still unprocessed after ${MAX_SWEEPS} ` +
                  'attempts. Marked blocked for manual review.',
              },
              {merge: true},
          );
          blocked += 1;
          logger.error('Pipeline sweeper blocked a job after max retries.', {
            jobId: doc.id,
            batchId: data.batchId,
            assignedTo: data.assignedTo,
            jobType: data.jobType,
          });
          continue;
        }

        // Re-emit the creation event: delete, then recreate with identical
        // fields so onDocumentCreated fires and the matching processor runs.
        // createdAt is preserved; updatedAt is refreshed so the age gate does
        // not immediately re-sweep the recreated job.
        const fields = {
          ...data,
          sweepCount: sweepCount + 1,
          lastSweptAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };

        try {
          await doc.ref.delete();
          await doc.ref.set(fields);
          reemitted += 1;
          logger.info('Pipeline sweeper re-emitted a stuck job.', {
            jobId: doc.id,
            batchId: data.batchId,
            assignedTo: data.assignedTo,
            jobType: data.jobType,
            attempt: sweepCount + 1,
          });
        } catch (error) {
          logger.error('Pipeline sweeper failed to re-emit a job.', {
            jobId: doc.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      logger.info('Pipeline sweeper finished.', {
        assigned: snapshot.size,
        reemitted,
        blocked,
        skipped,
      });
    },
);
