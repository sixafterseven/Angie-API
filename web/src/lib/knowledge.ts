/**
 * Knowledge system shared types + validation.
 *
 * Pure module — no Firebase import — so it is safe on the browser and the
 * server. It defines the shapes of `knowledgeSources`, `researchReports`, and
 * `knowledgeCollections`, and validates them before a write. The registration
 * flow is: a `knowledgeWrite` user uploads a file to
 * `knowledge/{category}/{subcategory}/{filename}`, then creates a
 * `knowledgeSources/{slug}` document built + validated here (and enforced again
 * by Firestore rules). No embeddings, chunking, retrieval, or RAG here.
 */

export type KnowledgeStatus = "draft" | "active" | "archived";
export type ProcessingStatus = "pending" | "processing" | "ready" | "failed";

export const KNOWLEDGE_DOMAINS = [
  "company",
  "sales",
  "marketing",
  "operations",
  "industries",
  "research",
  "other",
] as const;
export type KnowledgeDomain = (typeof KNOWLEDGE_DOMAINS)[number];

export const KNOWLEDGE_IMPORTANCE = [
  "required",
  "recommended",
  "optional",
  "reference",
] as const;
export type KnowledgeImportance = (typeof KNOWLEDGE_IMPORTANCE)[number];

export const DOCUMENT_TYPES = [
  "policy",
  "playbook",
  "script",
  "faq",
  "guide",
  "template",
  "reference",
  "other",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/**
 * MIME types the ingestion function can extract raw text from in this phase.
 * PDF/DOCX/etc. are intentionally excluded — those sources will be marked
 * `failed` until a parser is added.
 */
export const SUPPORTED_INGEST_MIME_TYPES = [
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export type KnowledgeSource = {
  title: string;
  slug: string;
  description: string;
  category: string;
  subcategory: string;
  documentType: DocumentType;
  storagePath: string;
  mimeType: string;
  status: KnowledgeStatus;
  version: number;
  isAuthoritative: boolean;
  allowedAgents: string[];
  tags: string[];
  industries: string[];
  priority: number;
  effectiveDate: string | null;
  reviewDate: string | null;
  createdBy: string;
  updatedBy: string;
  owner: string;
  confidence: number | null;
  expiresAt: string | null;
  relatedSources: string[];
  collectionId: string | null;
  domain: KnowledgeDomain;
  importance: KnowledgeImportance;
  sourceVersion: number;
  processedVersion: number | null;
  fileGeneration: string | null;
  contentHash: string | null;
  processingStatus: ProcessingStatus;
  processingError: string | null;
};

export type ResearchReport = {
  title: string;
  slug: string;
  summary: string;
  findings: string;
  sources: string[];
  industry: string;
  geography: string;
  researchType: string;
  confidence: number;
  status: KnowledgeStatus;
  expiresAt: string | null;
  createdBy: string;
  updatedBy: string;
};

export type KnowledgeCollection = {
  collectionId: string;
  name: string;
  slug: string;
  description: string;
  parentId: string | null;
};

export type ValidationResult = { ok: boolean; errors: string[] };

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,80}$/;

/** Turns a title into a candidate slug. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** The canonical Storage path for a knowledge source original. */
export function knowledgeStoragePath(
  category: string,
  subcategory: string,
  filename: string,
): string {
  return `knowledge/${category}/${subcategory}/${filename}`;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

export function validateKnowledgeSource(input: unknown): ValidationResult {
  const errors: string[] = [];
  const d = (input ?? {}) as Record<string, unknown>;

  if (!isNonEmptyString(d.title) || (d.title as string).length > 200) {
    errors.push("title must be a non-empty string up to 200 chars");
  }
  if (typeof d.slug !== "string" || !SLUG_RE.test(d.slug)) {
    errors.push("slug must match ^[a-z0-9][a-z0-9-]{1,80}$");
  }
  if (!isNonEmptyString(d.category)) errors.push("category is required");
  if (!isNonEmptyString(d.subcategory)) errors.push("subcategory is required");
  if (!DOCUMENT_TYPES.includes(d.documentType as DocumentType)) {
    errors.push(`documentType must be one of ${DOCUMENT_TYPES.join(", ")}`);
  }
  if (
    typeof d.storagePath !== "string" ||
    d.storagePath !==
      knowledgeStoragePath(
        String(d.category),
        String(d.subcategory),
        String(d.storagePath).split("/").slice(3).join("/"),
      )
  ) {
    errors.push(
      "storagePath must be knowledge/{category}/{subcategory}/{filename}",
    );
  }
  if (!isNonEmptyString(d.mimeType)) errors.push("mimeType is required");
  if (!["draft", "active", "archived"].includes(d.status as string)) {
    errors.push("status must be draft|active|archived");
  }
  if (!Number.isInteger(d.version) || (d.version as number) < 1) {
    errors.push("version must be an integer >= 1");
  }
  if (!Number.isInteger(d.sourceVersion) || (d.sourceVersion as number) < 1) {
    errors.push("sourceVersion must be an integer >= 1");
  }
  if (typeof d.isAuthoritative !== "boolean") {
    errors.push("isAuthoritative must be a boolean");
  }
  if (!isStringArray(d.allowedAgents)) errors.push("allowedAgents must be string[]");
  if (!isStringArray(d.tags)) errors.push("tags must be string[]");
  if (!isStringArray(d.industries)) errors.push("industries must be string[]");
  if (!isStringArray(d.relatedSources)) errors.push("relatedSources must be string[]");
  if (typeof d.priority !== "number" || !Number.isFinite(d.priority)) {
    errors.push("priority must be a finite number");
  }
  if (
    d.confidence !== null &&
    d.confidence !== undefined &&
    (typeof d.confidence !== "number" ||
      d.confidence < 0 ||
      d.confidence > 1)
  ) {
    errors.push("confidence must be null or a number in [0,1]");
  }
  if (!KNOWLEDGE_DOMAINS.includes(d.domain as KnowledgeDomain)) {
    errors.push(`domain must be one of ${KNOWLEDGE_DOMAINS.join(", ")}`);
  }
  if (!KNOWLEDGE_IMPORTANCE.includes(d.importance as KnowledgeImportance)) {
    errors.push(`importance must be one of ${KNOWLEDGE_IMPORTANCE.join(", ")}`);
  }
  if (
    !["pending", "processing", "ready", "failed"].includes(
      d.processingStatus as string,
    )
  ) {
    errors.push("processingStatus must be pending|processing|ready|failed");
  }
  if (!isNonEmptyString(d.createdBy)) errors.push("createdBy is required");
  if (!isNonEmptyString(d.updatedBy)) errors.push("updatedBy is required");
  if (!isNonEmptyString(d.owner)) errors.push("owner is required");

  return { ok: errors.length === 0, errors };
}

export function validateResearchReport(input: unknown): ValidationResult {
  const errors: string[] = [];
  const d = (input ?? {}) as Record<string, unknown>;

  if (!isNonEmptyString(d.title)) errors.push("title is required");
  if (typeof d.slug !== "string" || !SLUG_RE.test(d.slug)) {
    errors.push("slug must match ^[a-z0-9][a-z0-9-]{1,80}$");
  }
  if (typeof d.summary !== "string") errors.push("summary must be a string");
  if (!isStringArray(d.sources)) errors.push("sources must be string[]");
  if (typeof d.industry !== "string") errors.push("industry must be a string");
  if (typeof d.geography !== "string") errors.push("geography must be a string");
  if (!isNonEmptyString(d.researchType)) errors.push("researchType is required");
  if (
    typeof d.confidence !== "number" ||
    d.confidence < 0 ||
    d.confidence > 1
  ) {
    errors.push("confidence must be a number in [0,1]");
  }
  if (!["draft", "active", "archived"].includes(d.status as string)) {
    errors.push("status must be draft|active|archived");
  }
  if (!isNonEmptyString(d.createdBy)) errors.push("createdBy is required");
  if (!isNonEmptyString(d.updatedBy)) errors.push("updatedBy is required");

  return { ok: errors.length === 0, errors };
}

export function validateKnowledgeCollection(input: unknown): ValidationResult {
  const errors: string[] = [];
  const d = (input ?? {}) as Record<string, unknown>;

  if (!isNonEmptyString(d.name)) errors.push("name is required");
  if (typeof d.slug !== "string" || !SLUG_RE.test(d.slug)) {
    errors.push("slug must match ^[a-z0-9][a-z0-9-]{1,80}$");
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Builds a draft knowledge source with the immutable/system fields stamped, for
 * the registration flow. The caller supplies the file-derived and editorial
 * fields; this fills status/version/processingStatus/audit fields.
 */
export function buildKnowledgeSourceDraft(params: {
  title: string;
  slug?: string;
  description?: string;
  category: string;
  subcategory: string;
  documentType: DocumentType;
  filename: string;
  mimeType: string;
  domain: KnowledgeDomain;
  importance: KnowledgeImportance;
  isAuthoritative?: boolean;
  allowedAgents?: string[];
  tags?: string[];
  industries?: string[];
  priority?: number;
  confidence?: number | null;
  relatedSources?: string[];
  collectionId?: string | null;
  effectiveDate?: string | null;
  reviewDate?: string | null;
  expiresAt?: string | null;
  userEmail: string;
}): KnowledgeSource {
  const slug = params.slug ?? slugify(params.title);

  return {
    title: params.title,
    slug,
    description: params.description ?? "",
    category: params.category,
    subcategory: params.subcategory,
    documentType: params.documentType,
    storagePath: knowledgeStoragePath(
      params.category,
      params.subcategory,
      params.filename,
    ),
    mimeType: params.mimeType,
    status: "draft",
    version: 1,
    isAuthoritative: params.isAuthoritative ?? false,
    allowedAgents: params.allowedAgents ?? [],
    tags: params.tags ?? [],
    industries: params.industries ?? [],
    priority: params.priority ?? 0,
    effectiveDate: params.effectiveDate ?? null,
    reviewDate: params.reviewDate ?? null,
    createdBy: params.userEmail,
    updatedBy: params.userEmail,
    owner: params.userEmail,
    confidence: params.confidence ?? null,
    expiresAt: params.expiresAt ?? null,
    relatedSources: params.relatedSources ?? [],
    collectionId: params.collectionId ?? null,
    domain: params.domain,
    importance: params.importance,
    sourceVersion: 1,
    processedVersion: null,
    fileGeneration: null,
    contentHash: null,
    processingStatus: "pending",
    processingError: null,
  };
}
