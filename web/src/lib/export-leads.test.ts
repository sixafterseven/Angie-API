import { describe, it, expect } from "vitest";

import { Lead } from "./leads";
import { EXPORT_COLUMNS, buildRows, exportFilename, toCsv } from "./export-leads";

const sample: Lead = {
  id: "L1",
  businessName: "Bright Smiles, PC",
  category: "Orthodontist",
  city: "Atlanta",
  state: "GA",
  postalCode: "03033",
  phone: "5551234567",
  email: "hi@bright.com",
  website: "bright.com",
  rating: 4.8,
  reviewCount: 210,
  overallQualificationScore: 92,
  qualificationBand: "Priority Lead",
  recommendedNextAction: "Call now",
  geographyStatus: "in_market",
  marketTier: "tier_1_atlanta_metro",
  batchId: "BAT-20260712-007",
};

describe("export columns", () => {
  it("uses the sales-useful column set", () => {
    const headers = EXPORT_COLUMNS.map((c) => c.header);
    expect(headers).toContain("Business Name");
    expect(headers).toContain("Qualification Band");
    expect(headers).toContain("Market Tier");
    expect(headers).not.toContain("placeId");
    expect(headers).not.toContain("scoringVersion");
  });

  it("maps a lead into a full row", () => {
    const [header, row] = buildRows([sample]);
    expect(header[0]).toBe("Business Name");
    expect(row[header.indexOf("City")]).toBe("Atlanta");
    expect(row[header.indexOf("Qualification Score")]).toBe("92");
  });
});

describe("toCsv", () => {
  it("quotes fields containing commas", () => {
    const csv = toCsv([sample]);
    expect(csv).toContain('"Bright Smiles, PC"');
  });

  it("forces phone and ZIP to text so leading zeros survive", () => {
    const csv = toCsv([sample]);
    // The ="..." text guard is itself CSV-escaped, so it appears double-quoted.
    expect(csv).toContain('"=""5551234567"""');
    expect(csv).toContain('"=""03033"""');
    expect(csv).toContain('"=""BAT-20260712-007"""');
  });

  it("has one header row plus one row per lead", () => {
    const csv = toCsv([sample, { ...sample, id: "L2" }]);
    expect(csv.split("\r\n")).toHaveLength(3);
  });
});

describe("exportFilename", () => {
  it("builds a slugged, dated filename", () => {
    expect(exportFilename("Industry: orthodontist · City: atlanta", "2026-07-19T10:00:00Z", "csv")).toBe(
      "micah-amari-leads-industry-orthodontist-city-atlanta-2026-07-19.csv",
    );
  });

  it("handles an empty summary", () => {
    expect(exportFilename("", "2026-07-19T00:00:00Z", "xlsx")).toBe(
      "micah-amari-leads-2026-07-19.xlsx",
    );
  });
});
