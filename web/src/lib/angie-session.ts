/**
 * Conversational session state for Ask Angie.
 *
 * Two things live here, deliberately separate (per the product spec):
 *   - `messages`: the display transcript (user / Angie bubbles).
 *   - `SessionState`: structured state the refinement logic reads/writes —
 *     active filters, sort, the active + selected lead ids, last intent, and
 *     the last generated strategy/outreach.
 *
 * Persistence is client-side only (sessionStorage), so a refresh keeps the
 * conversation but nothing is written to Firestore. The base lead set is always
 * re-fetched fresh from Firestore and the active set re-derived from filters,
 * so the conversation can never drift from real data.
 */

import { AngieFilters, LeadSort } from "./angie-filters";

export type AngieIntent =
  | "new_search"
  | "refine"
  | "lead_question"
  | "strategy"
  | "outreach"
  | "export"
  | "smalltalk";

/** A single displayed chat message. `data` carries structured payloads. */
export type ChatMessage = {
  id: string;
  role: "user" | "angie";
  text: string;
  kind?: "text" | "results" | "strategy" | "email" | "call_list" | "export";
  data?: unknown;
  createdAt: number;
};

/** Structured conversation state, separate from the display transcript. */
export type SessionState = {
  sessionId: string;
  userId: string;
  createdAt: number;
  updatedAt: number;
  title: string;
  status: "active";
  activeFilters: AngieFilters;
  activeSort?: LeadSort;
  activeSearchSummary: string;
  activeLeadIds: string[];
  selectedLeadIds: string[];
  lastIntent?: AngieIntent;
  lastGeneratedStrategy?: string;
  lastGeneratedOutreach?: unknown;
};

const STORAGE_KEY = "angie-os:conversation";

/** Current epoch millis. Module-level so callers stay render-pure. */
export function nowMs(): number {
  return Date.now();
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

export function createSession(userId: string): SessionState {
  const now = Date.now();
  return {
    sessionId: newId(),
    userId,
    createdAt: now,
    updatedAt: now,
    title: "New conversation",
    status: "active",
    activeFilters: {},
    activeSearchSummary: "",
    activeLeadIds: [],
    selectedLeadIds: [],
  };
}

export function makeMessage(
  role: ChatMessage["role"],
  text: string,
  kind: ChatMessage["kind"] = "text",
  data?: unknown,
): ChatMessage {
  return { id: newId(), role, text, kind, data, createdAt: Date.now() };
}

/** Human-readable label for one active filter, for chips and summaries. */
export function filterLabel(key: keyof AngieFilters, value: unknown): string {
  switch (key) {
    case "industry":
      return `Industry: ${value}`;
    case "city":
      return `City: ${value}`;
    case "state":
      return `State: ${String(value).toUpperCase()}`;
    case "website":
      return value ? "Has a website" : "No website";
    case "phone":
      return value ? "Has a phone" : "No phone";
    case "minRating":
      return `Rating ≥ ${value}`;
    case "excludeChains":
      return "No national chains";
    case "includeOutOfMarket":
      return "Incl. out-of-market";
    case "sort":
      return `Sorted by ${value}`;
    case "limit":
      return `Top ${value}`;
    default:
      return `${key}: ${value}`;
  }
}

/** The active filters as [key, label] pairs, skipping empty/default values. */
export function filterChips(filters: AngieFilters): Array<{
  key: keyof AngieFilters;
  label: string;
}> {
  return (Object.keys(filters) as Array<keyof AngieFilters>)
    .filter((key) => {
      const value = filters[key];
      return value !== undefined && value !== null && value !== "";
    })
    .map((key) => ({ key, label: filterLabel(key, filters[key]) }));
}

/** A one-line summary of the current filters ("orthodontists in Atlanta"). */
export function summarizeFilters(filters: AngieFilters): string {
  const chips = filterChips(filters);
  return chips.length ? chips.map((c) => c.label).join(" · ") : "all sales-ready leads";
}

/** Merge refinement deltas onto the current filters (deltas win). */
export function mergeFilters(
  current: AngieFilters,
  delta: AngieFilters,
): AngieFilters {
  return { ...current, ...delta };
}

/** Drop a single filter key (chip removal). */
export function removeFilter(
  filters: AngieFilters,
  key: keyof AngieFilters,
): AngieFilters {
  const next = { ...filters };
  delete next[key];
  return next;
}

/* --------------------------------------------------------- persistence */

type PersistShape = { state: SessionState; messages: ChatMessage[] };

export function loadPersisted(): PersistShape | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as PersistShape;
    if (!parsed?.state?.sessionId) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function savePersisted(state: SessionState, messages: ChatMessage[]): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state, messages }),
    );
  } catch {
    // Storage full or blocked — degrade to in-memory only.
  }
}

export function clearPersisted(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/* ------------------------------------------- reopen-a-saved-list handoff */

const OPEN_LIST_KEY = "angie-os:open-list";

export type OpenListPayload = {
  name: string;
  leadIds: string[];
  searchSummary: string;
  filters: AngieFilters;
  sort?: LeadSort;
};

/** Stash a saved list for Ask Angie to pick up after navigation. */
export function saveOpenList(payload: OpenListPayload): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(OPEN_LIST_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

/** Read and CLEAR the pending saved list (one-shot handoff). */
export function takeOpenList(): OpenListPayload | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(OPEN_LIST_KEY);
    if (!raw) {
      return null;
    }
    window.sessionStorage.removeItem(OPEN_LIST_KEY);
    return JSON.parse(raw) as OpenListPayload;
  } catch {
    return null;
  }
}

/** Build a session that re-enters a saved list (with its filters/summary). */
export function sessionFromList(
  userId: string,
  payload: OpenListPayload,
): SessionState {
  const base = createSession(userId);
  return {
    ...base,
    title: payload.name,
    activeFilters: payload.filters ?? {},
    activeSort: payload.sort,
    activeSearchSummary: payload.searchSummary || payload.name,
    activeLeadIds: payload.leadIds,
    lastIntent: "new_search",
  };
}
