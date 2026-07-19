import { describe, it, expect } from "vitest";

import {
  Lead,
  formatPhone,
  getBandTone,
  getReasonTexts,
  getWarningLabels,
  industryMatches,
  matchesFilters,
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
