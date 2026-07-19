import { describe, it, expect } from "vitest";

import {
  createSession,
  filterChips,
  mergeFilters,
  removeFilter,
  summarizeFilters,
} from "./angie-session";

describe("createSession", () => {
  it("starts empty and active", () => {
    const s = createSession("user-1");
    expect(s.userId).toBe("user-1");
    expect(s.status).toBe("active");
    expect(s.activeFilters).toEqual({});
    expect(s.activeLeadIds).toEqual([]);
    expect(s.selectedLeadIds).toEqual([]);
  });

  it("gives distinct sessions distinct ids", () => {
    expect(createSession("u").sessionId).not.toBe(createSession("u").sessionId);
  });
});

describe("mergeFilters / removeFilter", () => {
  it("merges deltas over the current filters", () => {
    const merged = mergeFilters(
      { industry: "dentist", city: "atlanta" },
      { city: "marietta", minRating: 4 },
    );
    expect(merged).toEqual({ industry: "dentist", city: "marietta", minRating: 4 });
  });

  it("removes a single filter key without touching the rest", () => {
    const next = removeFilter({ industry: "dentist", city: "atlanta" }, "city");
    expect(next).toEqual({ industry: "dentist" });
  });

  it("reset semantics: a fresh session shares nothing with prior filters", () => {
    const prior = { industry: "dentist", city: "atlanta" };
    const fresh = createSession("u");
    expect(fresh.activeFilters).toEqual({});
    expect(fresh.activeFilters).not.toBe(prior);
  });
});

describe("filterChips / summarizeFilters", () => {
  it("labels active filters and skips empties", () => {
    const chips = filterChips({ industry: "dentist", state: "ga", excludeChains: true });
    const labels = chips.map((c) => c.label);
    expect(labels).toContain("Industry: dentist");
    expect(labels).toContain("State: GA");
    expect(labels).toContain("No national chains");
  });

  it("summarizes to a readable string", () => {
    expect(summarizeFilters({ industry: "orthodontist", city: "atlanta" })).toBe(
      "Industry: orthodontist · City: atlanta",
    );
    expect(summarizeFilters({})).toBe("all sales-ready leads");
  });
});
