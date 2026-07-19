/**
 * Shared lead shape, display helpers, and deterministic filter logic.
 *
 * One source of truth used by the result cards, the conversational refinement,
 * and export. Everything here is pure (no React, no Firebase) so it can be unit
 * tested directly. Historical documents may be missing fields, so every helper
 * is defensive.
 */

import { AngieFilters, toStateCode } from "./angie-filters";

/** A qualification reason/warning entry as written by the scoring engine. */
export type QualificationReason = {
  code?: string;
  text?: string;
  points?: number;
};

/** The subset of a Firestore lead the UI reads. All fields optional. */
export type Lead = {
  id: string;
  businessName?: string;
  companyName?: string;
  name?: string;
  emailGreetingName?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  industry?: string;
  category?: string;
  rating?: number;
  reviewCount?: number;
  googleMapsUrl?: string;
  placeId?: string;
  batchId?: string;
  // Qualification + geography (written by the Lead Qualification Engine).
  qualificationBand?: string;
  overallQualificationScore?: number;
  recommendedNextAction?: string;
  qualificationReasons?: QualificationReason[];
  qualificationWarnings?: string[];
  geographyStatus?: string;
  geographyReason?: string;
  marketTier?: string;
  isInTargetMarket?: boolean;
  pipelineStage?: string;
};

export function normalize(value?: string): string {
  return value?.trim().toLowerCase() ?? "";
}

export function getBusinessName(lead: Lead): string {
  return lead.businessName ?? lead.companyName ?? lead.name ?? "Unnamed business";
}

export function getIndustry(lead: Lead): string {
  return lead.industry ?? lead.category ?? "";
}

export function formatPhone(phone?: string): string {
  if (!phone) {
    return "No phone";
  }

  const digits = phone.replace(/\D/g, "");

  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  return phone;
}

export function getWebsiteHref(website?: string): string {
  if (!website) {
    return "#";
  }

  return website.startsWith("http") ? website : `https://${website}`;
}

export function getWebsiteLabel(website?: string): string {
  if (!website) {
    return "No website";
  }

  try {
    return new URL(getWebsiteHref(website)).hostname.replace(/^www\./, "");
  } catch {
    return website;
  }
}

export function getLocationLabel(lead: Lead): string {
  return [lead.city, lead.state].filter(Boolean).join(", ");
}

/** Human-readable reason strings, deduped and bounded. */
export function getReasonTexts(lead: Lead, max = 3): string[] {
  if (!Array.isArray(lead.qualificationReasons)) {
    return [];
  }

  const seen = new Set<string>();
  const out: string[] = [];

  for (const entry of lead.qualificationReasons) {
    const text = typeof entry?.text === "string" ? entry.text.trim() : "";
    // GEOGRAPHY reasons are surfaced separately; skip the raw scoring dump.
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    out.push(text);
    if (out.length >= max) {
      break;
    }
  }

  return out;
}

/** Warning codes turned into short readable phrases. */
const WARNING_LABELS: Record<string, string> = {
  OUT_OF_MARKET: "Outside the target market",
  LOCATION_NEEDS_REVIEW: "Location needs review",
  POSSIBLE_DUPLICATE: "Possible duplicate",
  CONFLICTING_IDENTIFIERS: "Conflicting identifiers",
  POSSIBLE_NATIONAL_CHAIN: "Might be a national chain",
  UNCERTAIN_FRANCHISE_OWNERSHIP: "Franchise — ownership unclear",
  GOVERNMENT_OR_NONCOMMERCIAL: "Government / non-commercial",
  INVALID_SUPPRESSED: "Marked unusable",
  RATING_UNAVAILABLE: "No rating on file",
  REVIEW_COUNT_UNAVAILABLE: "No review count on file",
  NO_IDENTIFIERS_OR_CONTACT: "No contact details on file",
};

export function getWarningLabels(lead: Lead, max = 3): string[] {
  if (!Array.isArray(lead.qualificationWarnings)) {
    return [];
  }

  return lead.qualificationWarnings
    .filter((code): code is string => typeof code === "string")
    .map((code) => WARNING_LABELS[code] ?? code.toLowerCase().replace(/_/g, " "))
    .slice(0, max);
}

/** Visual tone for a qualification band. */
export type BandTone = "priority" | "strong" | "possible" | "low" | "poor" | "review";

export function getBandTone(band?: string): BandTone {
  switch (normalize(band)) {
    case "priority lead":
      return "priority";
    case "strong lead":
      return "strong";
    case "possible lead":
      return "possible";
    case "low priority":
      return "low";
    case "needs review":
      return "review";
    default:
      return "poor";
  }
}

/**
 * Terms that should match each other even when they share no word stem.
 * Google categorizes dental specialties under their own names.
 */
const INDUSTRY_SYNONYM_GROUPS: string[][] = [
  [
    "dentist",
    "dental",
    "orthodontist",
    "orthodontics",
    "periodontist",
    "endodontist",
    "prosthodontist",
    "oral surgeon",
  ],
  ["chiropractor", "chiropractic"],
  ["medical spa", "medspa", "med spa", "medical aesthetics"],
];

export function expandSynonyms(term: string): string[] {
  const group = INDUSTRY_SYNONYM_GROUPS.find((g) =>
    g.some((t) => term.includes(t) || (term.length >= 4 && t.includes(term))),
  );

  return group ? Array.from(new Set([term, ...group])) : [term];
}

function termMatchesIndustry(lead: string, term: string): boolean {
  if (lead.includes(term)) {
    return true;
  }

  const leadWords = lead.split(/[^a-z0-9]+/).filter(Boolean);

  return term
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .some((word) => {
      const stem = word.slice(0, Math.max(4, word.length - 3));
      return stem.length >= 4 && leadWords.some((w) => w.startsWith(stem));
    });
}

export function industryMatches(leadIndustry: string | undefined, filter: string): boolean {
  const lead = normalize(leadIndustry);
  const wanted = normalize(filter);

  if (!wanted || lead.includes(wanted)) {
    return true;
  }

  return expandSynonyms(wanted).some((term) => termMatchesIndustry(lead, term));
}

/**
 * Deterministic client-side filter. Suppressed / out-of-market leads are hidden
 * unless the filter explicitly opts them in.
 */
export function matchesFilters(lead: Lead, filters: AngieFilters): boolean {
  if (filters.industry && !industryMatches(getIndustry(lead), filters.industry)) {
    return false;
  }

  if (filters.city && !normalize(lead.city).includes(normalize(filters.city))) {
    return false;
  }

  if (filters.state && toStateCode(lead.state) !== toStateCode(filters.state)) {
    return false;
  }

  if (filters.website === true && !lead.website) {
    return false;
  }

  if (filters.website === false && Boolean(lead.website)) {
    return false;
  }

  if (filters.phone === true && !lead.phone) {
    return false;
  }

  if (filters.phone === false && Boolean(lead.phone)) {
    return false;
  }

  if (!filters.includeOutOfMarket && lead.geographyStatus === "out_of_market") {
    return false;
  }

  return true;
}
