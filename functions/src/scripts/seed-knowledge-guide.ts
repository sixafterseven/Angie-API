/*
 * Seeds the "Micah Amari Lead Qualification Guide — Version 1.0" into the
 * knowledge system as a knowledgeSources document + its Storage original.
 *
 * NOTE: this depends on the knowledge system (PR #12: the knowledgeSources
 * collection, its rules, and the ingestion function) being deployed. Until then
 * this is a standalone script — running --execute writes the doc + file via the
 * Admin SDK, but raw-text ingestion won't run until the knowledgeIngestion
 * function is deployed. Dry-run by default.
 */

import {readFileSync} from 'fs';
import {join} from 'path';

import {getApps, initializeApp} from 'firebase-admin/app';
import {FieldValue, getFirestore} from 'firebase-admin/firestore';
import {getStorage} from 'firebase-admin/storage';

const EXECUTE_FLAG = '--execute';

const SLUG = 'lead-qualification-guide-v1';
const CATEGORY = 'sales';
const SUBCATEGORY = 'qualification';
const FILENAME = 'lead-qualification-guide-v1.md';
const STORAGE_PATH = `knowledge/${CATEGORY}/${SUBCATEGORY}/${FILENAME}`;
const OWNER = 'admin7@sixafterseven.com';

// From functions/lib/scripts/*.js up to the repo root, then docs/.
const GUIDE_PATH = join(__dirname, '../../../docs/lead-qualification-guide-v1.md');

function getAdminApp() {
  const existing = getApps();

  return existing.length ? existing[0] : initializeApp();
}

async function main(): Promise<void> {
  const execute = process.argv.slice(2).includes(EXECUTE_FLAG);

  console.log('Angie OS — seed Lead Qualification Guide into knowledgeSources');
  console.log('=============================================================');
  console.log(
      execute ?
        'MODE: EXECUTE — the knowledge document + file WILL be written.' :
        'MODE: DRY RUN — no writes.',
  );

  const markdown = readFileSync(GUIDE_PATH, 'utf8');

  console.log('');
  console.log(`  Storage:   ${STORAGE_PATH} (${markdown.length} chars)`);
  console.log(`  Firestore: knowledgeSources/${SLUG}`);
  console.log('');

  if (!execute) {
    console.log('Dry run complete. Re-run with --execute to write.');
    console.log(
        'Requires the knowledge system (PR #12) deployed for ingestion to run.',
    );
    return;
  }

  const db = getFirestore(getAdminApp());

  // Upload the original so the ingestion function can extract its text.
  await getStorage(getAdminApp()).bucket().file(STORAGE_PATH).save(markdown, {
    contentType: 'text/plain',
  });

  const now = FieldValue.serverTimestamp();

  await db.collection('knowledgeSources').doc(SLUG).set({
    title: 'Micah Amari Lead Qualification Guide — Version 1.0',
    slug: SLUG,
    description: 'How Angie OS qualifies and scores leads (ma-lead-score-v1).',
    category: CATEGORY,
    subcategory: SUBCATEGORY,
    documentType: 'guide',
    storagePath: STORAGE_PATH,
    mimeType: 'text/plain',
    status: 'draft',
    version: 1,
    sourceVersion: 1,
    isAuthoritative: true,
    allowedAgents: ['Angie'],
    tags: ['lead-qualification', 'scoring', 'ma-lead-score-v1'],
    industries: [],
    relatedSources: [],
    priority: 100,
    confidence: 1,
    expiresAt: null,
    owner: OWNER,
    collectionId: null,
    domain: 'sales',
    importance: 'required',
    effectiveDate: null,
    reviewDate: null,
    createdBy: OWNER,
    updatedBy: OWNER,
    processingStatus: 'pending',
    processedVersion: null,
    fileGeneration: null,
    contentHash: null,
    lastProcessedAt: null,
    processingError: null,
    createdAt: now,
    updatedAt: now,
  }, {merge: true});

  console.log('Done. knowledgeSources/lead-qualification-guide-v1 written (pending ingestion).');
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
}
