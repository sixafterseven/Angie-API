/**
 * Saved lead lists — shared types and validation.
 *
 * A saved list is a lightweight "playlist" of leads: a name, the lead ids, and
 * the search context (summary/filters/sort) so it can be reopened and refined
 * again in Ask Angie. Persistence goes through the API (Admin SDK), so the
 * all-client-writes-denied Firestore posture is unchanged.
 *
 * The pure validators here are used by the API route and unit-tested directly.
 */

import { AngieFilters, LeadSort, parseAngieFilters } from "./angie-filters";

export const MAX_LIST_NAME = 80;
export const MAX_LIST_LEADS = 500;

export type SavedList = {
  listId: string;
  userId: string;
  name: string;
  leadIds: string[];
  searchSummary: string;
  filters: AngieFilters;
  sort?: LeadSort;
  createdAt: number;
  updatedAt: number;
};

/** What the client sends to create/update a list. */
export type SavedListInput = {
  name: string;
  leadIds: string[];
  searchSummary?: string;
  filters?: AngieFilters;
  sort?: LeadSort;
};

export function sanitizeName(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_LIST_NAME);
}

export function sanitizeLeadIdList(value: unknown): string[] {
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
    if (seen.size >= MAX_LIST_LEADS) {
      break;
    }
  }
  return [...seen];
}

const ALLOWED_SORTS: LeadSort[] = ["score", "rating", "reviews"];

/**
 * Validates and normalizes a create/update payload. Returns null when the
 * payload is unusable (no name, or no leads). Filters run through the same
 * allowlist validator used everywhere else, so a client cannot smuggle in
 * arbitrary fields.
 */
export function validateListInput(body: unknown): SavedListInput | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const candidate = body as Record<string, unknown>;

  const name = sanitizeName(candidate.name);
  const leadIds = sanitizeLeadIdList(candidate.leadIds);

  if (!name || !leadIds.length) {
    return null;
  }

  const filters = parseAngieFilters(JSON.stringify(candidate.filters ?? {}));

  const rawSort = typeof candidate.sort === "string" ? candidate.sort : "";
  const sort = (ALLOWED_SORTS as string[]).includes(rawSort)
    ? (rawSort as LeadSort)
    : undefined;

  const searchSummary =
    typeof candidate.searchSummary === "string"
      ? candidate.searchSummary.trim().slice(0, 200)
      : "";

  return { name, leadIds, searchSummary, filters, sort };
}
