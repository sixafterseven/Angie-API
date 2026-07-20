import { describe, it, expect } from "vitest";

import { deriveSignals, matchServices } from "./service-match";
import { playbookForCategory } from "./industry-playbooks";
import { SERVICE_CATALOG } from "./service-catalog";

describe("deriveSignals", () => {
  it("reads only signals that are present; unknowns stay false", () => {
    const s = deriveSignals({ website: "x.com", rating: 4.8, reviewCount: 120 });
    expect(s.hasWebsite).toBe(true);
    expect(s.noWebsite).toBe(false);
    expect(s.strongRating).toBe(true);
    expect(s.manyReviews).toBe(true);
    // No rating/reviews on file → do not fabricate low/high signals.
    const empty = deriveSignals({});
    expect(empty.lowRating).toBe(false);
    expect(empty.strongRating).toBe(false);
    expect(empty.lowReviews).toBe(false);
    expect(empty.manyReviews).toBe(false);
    expect(empty.noWebsite).toBe(true);
  });
});

describe("matchServices", () => {
  it("recommends website design for a no-website practice", () => {
    const pb = playbookForCategory("Dentist");
    const matches = matchServices({ category: "Dentist" }, pb);
    expect(matches.some((m) => m.name === "Website Design")).toBe(true);
  });

  it("drops services disqualified by a present signal (no site → no optimization)", () => {
    const pb = playbookForCategory("Dentist");
    const noSite = matchServices({ category: "Dentist" }, pb);
    expect(noSite.some((m) => m.name === "Website Optimization")).toBe(false);

    const withSite = matchServices({ category: "Dentist", website: "x.com" }, pb);
    // Optimization is now eligible for a site that exists.
    const all = matchServices({ category: "Dentist", website: "x.com" }, pb, 20);
    expect(all.some((m) => m.name === "Website Optimization")).toBe(true);
    expect(withSite.length).toBeGreaterThan(0);
  });

  it("boosts services in the industry playbook", () => {
    const pb = playbookForCategory("Dental implant");
    const matches = matchServices(
      { category: "Dental implant specialist", rating: 4.7, reviewCount: 90 },
      pb,
    );
    // Paid social is a high-value implant service — should rank near the top.
    expect(matches[0]).toBeTruthy();
    expect(matches.some((m) => m.name === "Paid Social Advertising")).toBe(true);
  });

  it("reasons are grounded — every reason ties to a real signal or the playbook", () => {
    const pb = playbookForCategory("Medical spa");
    const matches = matchServices(
      { category: "Medical spa", rating: 4.6, reviewCount: 150, email: "a@b.com" },
      pb,
    );
    for (const m of matches) {
      for (const reason of m.reasons) {
        expect(reason.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("service catalog integrity", () => {
  it("every playbook service id exists in the catalog", () => {
    const ids = new Set(SERVICE_CATALOG.map((s) => s.serviceId));
    for (const category of ["Dentist", "Orthodontist", "Medical spa", "Chiropractor"]) {
      const pb = playbookForCategory(category);
      expect(pb).not.toBeNull();
      for (const id of pb!.relevantServiceIds) {
        expect(ids.has(id)).toBe(true);
      }
    }
  });
});

describe("playbookForCategory", () => {
  it("selects specific playbooks before general dental", () => {
    expect(playbookForCategory("Orthodontist")?.key).toBe("orthodontists");
    expect(playbookForCategory("Dental implant specialist")?.key).toBe("dental-implants");
    expect(playbookForCategory("Dentist")?.key).toBe("dentists");
    expect(playbookForCategory("Medical spa")?.key).toBe("medical-spas");
  });

  it("returns null for an unknown category", () => {
    expect(playbookForCategory("Bakery")).toBeNull();
    expect(playbookForCategory(undefined)).toBeNull();
  });
});
