/**
 * Validation and normalization for Angie.
 *
 * Everything OpenAI returns is untrusted input. Nothing in this file trusts a
 * key, a type, or a value that the model produced. Unknown keys are dropped,
 * values are coerced to the expected type, and numbers are clamped.
 *
 * This module is imported by both the browser and the API route, so it must
 * not import firebase-admin or any server-only package.
 */

export type AngieFilters = {
  industry?: string;
  city?: string;
  state?: string;
  website?: boolean;
  phone?: boolean;
  limit?: number;
};

export type AngieAction = "call_list" | "email" | "strategy";

/** The only filter keys Angie is ever allowed to produce. */
const ALLOWED_FILTER_KEYS = [
  "industry",
  "city",
  "state",
  "website",
  "phone",
  "limit",
] as const;

export const MAX_QUESTION_LENGTH = 500;
export const DEFAULT_LEAD_LIMIT = 25;
export const MAX_LEAD_LIMIT = 100;

/** Selecting more than this for a generated action is refused. */
export const MAX_ACTION_LEADS = 25;

/** Drafting an email for every selected lead gets expensive; cap it lower. */
export const MAX_EMAIL_LEADS = 10;

const STATE_CODES_BY_NAME: Record<string, string> = {
  alabama: "al",
  alaska: "ak",
  arizona: "az",
  arkansas: "ar",
  california: "ca",
  colorado: "co",
  connecticut: "ct",
  delaware: "de",
  "district of columbia": "dc",
  florida: "fl",
  georgia: "ga",
  hawaii: "hi",
  idaho: "id",
  illinois: "il",
  indiana: "in",
  iowa: "ia",
  kansas: "ks",
  kentucky: "ky",
  louisiana: "la",
  maine: "me",
  maryland: "md",
  massachusetts: "ma",
  michigan: "mi",
  minnesota: "mn",
  mississippi: "ms",
  missouri: "mo",
  montana: "mt",
  nebraska: "ne",
  nevada: "nv",
  "new hampshire": "nh",
  "new jersey": "nj",
  "new mexico": "nm",
  "new york": "ny",
  "north carolina": "nc",
  "north dakota": "nd",
  ohio: "oh",
  oklahoma: "ok",
  oregon: "or",
  pennsylvania: "pa",
  "rhode island": "ri",
  "south carolina": "sc",
  "south dakota": "sd",
  tennessee: "tn",
  texas: "tx",
  utah: "ut",
  vermont: "vt",
  virginia: "va",
  washington: "wa",
  "west virginia": "wv",
  wisconsin: "wi",
  wyoming: "wy",
};

const STATE_CODES = new Set(Object.values(STATE_CODES_BY_NAME));

/**
 * Reduces a state name or abbreviation to a two-letter code.
 *
 * Vera writes the `state` field from the source `state_code` column, so leads
 * hold "GA" while a user (or the model) may say "Georgia". Both sides of a
 * comparison are run through this so the two forms match.
 */
export function toStateCode(value?: string): string {
  const cleaned = value?.trim().toLowerCase() ?? "";

  if (!cleaned) {
    return "";
  }

  if (STATE_CODES.has(cleaned)) {
    return cleaned;
  }

  return STATE_CODES_BY_NAME[cleaned] ?? cleaned;
}

function sanitizeText(value: unknown, maxLength = 60): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const cleaned = value.replace(/\s+/g, " ").trim().slice(0, maxLength);

  return cleaned ? cleaned.toLowerCase() : undefined;
}

function sanitizeBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return undefined;
}

function sanitizeLimit(value: unknown): number | undefined {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(numeric)) {
    return undefined;
  }

  const rounded = Math.floor(numeric);

  if (rounded < 1) {
    return undefined;
  }

  return Math.min(rounded, MAX_LEAD_LIMIT);
}

/**
 * Pulls the first JSON object out of a model response.
 *
 * The model sometimes wraps JSON in markdown fences or adds a sentence of
 * commentary, so a bare JSON.parse on the raw text is not safe.
 */
function extractJson(rawText: string): unknown {
  if (typeof rawText !== "string") {
    return null;
  }

  const withoutFences = rawText.replace(/```(?:json)?/gi, "").trim();

  const start = withoutFences.indexOf("{");
  const end = withoutFences.lastIndexOf("}");

  if (start < 0 || end <= start) {
    return null;
  }

  try {
    return JSON.parse(withoutFences.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Turns raw model text into a filter object that is safe to run against leads.
 *
 * Unparseable output yields an empty filter set rather than an exception, so a
 * bad generation degrades into "no filters" instead of a 500.
 */
export function parseAngieFilters(rawText: string): AngieFilters {
  const parsed = extractJson(rawText);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }

  const candidate = parsed as Record<string, unknown>;

  const filters: AngieFilters = {};

  for (const key of ALLOWED_FILTER_KEYS) {
    if (!(key in candidate)) {
      continue;
    }

    const value = candidate[key];

    if (value === null || value === undefined) {
      continue;
    }

    if (key === "industry" || key === "city") {
      const text = sanitizeText(value);

      if (text) {
        filters[key] = text;
      }

      continue;
    }

    if (key === "state") {
      const text = sanitizeText(value);

      if (text) {
        filters.state = toStateCode(text);
      }

      continue;
    }

    if (key === "website" || key === "phone") {
      const flag = sanitizeBoolean(value);

      if (flag !== undefined) {
        filters[key] = flag;
      }

      continue;
    }

    if (key === "limit") {
      const limit = sanitizeLimit(value);

      if (limit !== undefined) {
        filters.limit = limit;
      }
    }
  }

  return filters;
}

/**
 * Resolves the effective result limit for a filter set.
 */
export function resolveLimit(filters: AngieFilters): number {
  return filters.limit ?? DEFAULT_LEAD_LIMIT;
}

/**
 * Validates a list of lead IDs supplied by the browser.
 *
 * These become Firestore document IDs, so anything containing a slash or
 * exceeding Firestore's ID length is rejected outright.
 */
export function sanitizeLeadIds(value: unknown, maxCount: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();

  for (const entry of value) {
    if (typeof entry !== "string") {
      continue;
    }

    const trimmed = entry.trim();

    if (!trimmed || trimmed.length > 1500 || trimmed.includes("/")) {
      continue;
    }

    seen.add(trimmed);

    if (seen.size >= maxCount) {
      break;
    }
  }

  return [...seen];
}
