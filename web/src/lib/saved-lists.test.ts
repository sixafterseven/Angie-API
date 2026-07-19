import { describe, it, expect } from "vitest";

import {
  MAX_LIST_LEADS,
  sanitizeLeadIdList,
  sanitizeName,
  validateListInput,
} from "./saved-lists";

describe("sanitizeName", () => {
  it("collapses whitespace and trims", () => {
    expect(sanitizeName("  Atlanta   ortho  ")).toBe("Atlanta ortho");
  });
  it("rejects non-strings", () => {
    expect(sanitizeName(42)).toBe("");
  });
});

describe("sanitizeLeadIdList", () => {
  it("keeps valid ids and dedupes", () => {
    expect(sanitizeLeadIdList(["a", "a", "b"])).toEqual(["a", "b"]);
  });
  it("drops ids with slashes or that are non-strings", () => {
    expect(sanitizeLeadIdList(["ok", "bad/id", 5, ""])).toEqual(["ok"]);
  });
  it("caps the number of ids", () => {
    const many = Array.from({ length: MAX_LIST_LEADS + 50 }, (_, i) => `id-${i}`);
    expect(sanitizeLeadIdList(many)).toHaveLength(MAX_LIST_LEADS);
  });
});

describe("validateListInput", () => {
  it("accepts a well-formed payload and validates filters", () => {
    const input = validateListInput({
      name: "My list",
      leadIds: ["L1", "L2"],
      searchSummary: "Atlanta orthodontists",
      filters: { industry: "orthodontist", bogus: "x" },
      sort: "rating",
    });
    expect(input).not.toBeNull();
    expect(input?.name).toBe("My list");
    expect(input?.leadIds).toEqual(["L1", "L2"]);
    expect(input?.sort).toBe("rating");
    // Unknown filter keys are stripped by the allowlist validator.
    expect(input?.filters).toEqual({ industry: "orthodontist" });
  });

  it("rejects a payload with no name", () => {
    expect(validateListInput({ name: "  ", leadIds: ["L1"] })).toBeNull();
  });

  it("rejects a payload with no leads", () => {
    expect(validateListInput({ name: "x", leadIds: [] })).toBeNull();
  });

  it("ignores an invalid sort value", () => {
    const input = validateListInput({ name: "x", leadIds: ["L1"], sort: "nonsense" });
    expect(input?.sort).toBeUndefined();
  });
});
