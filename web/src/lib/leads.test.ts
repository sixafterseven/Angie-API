import { describe, it, expect } from "vitest";

import {
  Lead,
  applyRefinement,
  formatPhone,
  getBandTone,
  getReasonTexts,
  getWarningLabels,
  industryMatches,
  isChain,
  matchesFilters,
  sortLeads,
} from "./leads";

function lead(partial: Partial<Lead>): Lead {
  return { id: "L1", ...partial };
}

describe("industryMatches", () => {
  it("matches the raw category directly", () => {
    expect(industryMatches("Orthodontist", "orthodontist")).toBe(true);
  });

  it("matches dentist against dental-family categories", () => {
    expect(industryMatches("Orthodontist", "dentist")).toBe(true);
    expect(industryMatches("Dental clinic", "dentist")).toBe(true);
  });

  it("matches a plural query against a singular category", () => {
    expect(industryMatches("Dentist", "dentists")).toBe(true);
  });

  it("does not match an unrelated category", () => {
    expect(industryMatches("Restaurant", "dentist")).toBe(false);
  });
});

describe("matchesFilters", () => {
  const gaLead = lead({
    city: "Atlanta",
    state: "GA",
    category: "Orthodontist",
    website: "x.com",
    phone: "5551234567",
    geographyStatus: "in_market",
  });

  it("keeps a lead that satisfies every filter", () => {
    expect(matchesFilters(gaLead, { industry: "dentist", state: "ga" })).toBe(true);
  });

  it("drops a lead in the wrong city", () => {
    expect(matchesFilters(gaLead, { city: "savannah" })).toBe(false);
  });

  it("honors has-no-website", () => {
    expect(matchesFilters(gaLead, { website: false })).toBe(false);
    expect(matchesFilters(lead({ geographyStatus: "in_market" }), { website: false })).toBe(true);
  });

  it("excludes out-of-market leads by default", () => {
    const ny = lead({ state: "NY", geographyStatus: "out_of_market" });
    expect(matchesFilters(ny, {})).toBe(false);
  });

  it("includes out-of-market leads when explicitly requested", () => {
    const ny = lead({ state: "NY", geographyStatus: "out_of_market" });
    expect(matchesFilters(ny, { includeOutOfMarket: true })).toBe(true);
  });
});

describe("formatPhone", () => {
  it("formats a 10-digit number", () => {
    expect(formatPhone("5551234567")).toBe("(555) 123-4567");
  });

  it("formats an 11-digit number with country code", () => {
    expect(formatPhone("15551234567")).toBe("(555) 123-4567");
  });

  it("handles a missing phone", () => {
    expect(formatPhone(undefined)).toBe("No phone");
  });
});

describe("qualification helpers", () => {
  it("maps bands to tones", () => {
    expect(getBandTone("Priority Lead")).toBe("priority");
    expect(getBandTone("Needs Review")).toBe("review");
    expect(getBandTone("Poor Fit")).toBe("poor");
    expect(getBandTone(undefined)).toBe("poor");
  });

  it("dedupes and bounds reason texts", () => {
    const l = lead({
      qualificationReasons: [
        { code: "A", text: "Good reviews" },
        { code: "B", text: "Good reviews" },
        { code: "C", text: "Has a website" },
        { code: "D", text: "In market" },
        { code: "E", text: "Extra reason" },
      ],
    });
    expect(getReasonTexts(l)).toEqual(["Good reviews", "Has a website", "In market"]);
  });

  it("turns warning codes into readable labels", () => {
    const l = lead({ qualificationWarnings: ["OUT_OF_MARKET", "POSSIBLE_DUPLICATE"] });
    expect(getWarningLabels(l)).toEqual([
      "Outside the target market",
      "Possible duplicate",
    ]);
  });
});

describe("refinement filters", () => {
  const chain = lead({
    id: "chain",
    rating: 4.9,
    reviewCount: 500,
    qualificationWarnings: ["POSSIBLE_NATIONAL_CHAIN"],
    geographyStatus: "in_market",
  });
  const solo = lead({
    id: "solo",
    rating: 4.2,
    reviewCount: 80,
    geographyStatus: "in_market",
  });
  const weak = lead({ id: "weak", rating: 3.1, reviewCount: 4, geographyStatus: "in_market" });

  it("detects a national chain", () => {
    expect(isChain(chain)).toBe(true);
    expect(isChain(solo)).toBe(false);
  });

  it("excludeChains drops chains but keeps independents", () => {
    expect(matchesFilters(chain, { excludeChains: true })).toBe(false);
    expect(matchesFilters(solo, { excludeChains: true })).toBe(true);
  });

  it("minRating drops lower-rated and unrated leads", () => {
    expect(matchesFilters(solo, { minRating: 4 })).toBe(true);
    expect(matchesFilters(weak, { minRating: 4 })).toBe(false);
    expect(matchesFilters(lead({ geographyStatus: "in_market" }), { minRating: 4 })).toBe(false);
  });
});

describe("sortLeads", () => {
  const a = lead({ id: "a", rating: 4.0, reviewCount: 10, overallQualificationScore: 60 });
  const b = lead({ id: "b", rating: 4.8, reviewCount: 5, overallQualificationScore: 90 });
  const c = lead({ id: "c", rating: 4.5, reviewCount: 200, overallQualificationScore: 75 });

  it("sorts by score descending by default key", () => {
    expect(sortLeads([a, b, c], "score").map((l) => l.id)).toEqual(["b", "c", "a"]);
  });

  it("sorts by rating and by reviews", () => {
    expect(sortLeads([a, b, c], "rating").map((l) => l.id)).toEqual(["b", "c", "a"]);
    expect(sortLeads([a, b, c], "reviews").map((l) => l.id)).toEqual(["c", "a", "b"]);
  });

  it("is a no-op without a sort key", () => {
    expect(sortLeads([a, b, c]).map((l) => l.id)).toEqual(["a", "b", "c"]);
  });
});

describe("applyRefinement", () => {
  const base: Lead[] = [
    lead({ id: "1", city: "Atlanta", state: "GA", overallQualificationScore: 90, geographyStatus: "in_market" }),
    lead({ id: "2", city: "Savannah", state: "GA", overallQualificationScore: 80, geographyStatus: "in_market" }),
    lead({ id: "3", city: "Atlanta", state: "GA", overallQualificationScore: 70, geographyStatus: "in_market" }),
    lead({ id: "ny", city: "New York", state: "NY", overallQualificationScore: 99, geographyStatus: "out_of_market" }),
  ];

  it("filters, sorts, and limits together", () => {
    const out = applyRefinement(base, { city: "atlanta", sort: "score", limit: 1 });
    expect(out.map((l) => l.id)).toEqual(["1"]);
  });

  it("keeps out-of-market leads excluded through refinement", () => {
    const out = applyRefinement(base, { sort: "score" });
    expect(out.some((l) => l.id === "ny")).toBe(false);
  });
});
