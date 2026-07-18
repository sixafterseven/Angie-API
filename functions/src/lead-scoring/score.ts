/*
 * The Micah Amari Lead Qualification Engine — pure, deterministic scoring.
 *
 * scoreLead() reads only the fields a Firestore lead actually has, never invents
 * missing business information, and classifies uncertainty as "Needs Review"
 * rather than suppressing. It performs no I/O and is fully reproducible: the
 * same inputs always yield the same result. The writer stamps `scoredAt`.
 *
 * Signals NOT present in Firestore today (business_status/permanently-closed,
 * verified, subtypes, photos_count, geo lat/long, revenue) are recorded as
 * unavailable and never faked.
 */

import {
  DEFAULT_SCORING_CONFIG,
  ScoringConfig,
} from './config';
import {
  LeadInput,
  QualificationBand,
  QualificationReason,
  ScoreContext,
  ScoreResult,
} from './types';

const UNAVAILABLE_SIGNALS = [
  'business_status(permanently_closed)',
  'verified',
  'subtypes',
  'photos_count',
  'geo_lat_lng',
  'revenue',
];

function norm(value?: string | null): string {
  return (value ?? '').trim().toLowerCase();
}

function has(value?: string | null): boolean {
  return norm(value).length > 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function tierPoints(
    value: number | null | undefined,
    tiers: { min: number; points: number }[],
): number {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 0;
  }
  for (const tier of tiers) {
    if (value >= tier.min) {
      return tier.points;
    }
  }
  return 0;
}

/** Returns the Industry Fit weight for a category, or null if not a target industry. */
function industryWeight(category: string, config: ScoringConfig): number | null {
  const c = norm(category);
  if (!c) {
    return null;
  }
  for (const industry of config.industries) {
    if (industry.match.some((token) => c.includes(token))) {
      return industry.weight;
    }
  }
  return null;
}

function nameMatchesAny(name: string | undefined, list: string[]): string | null {
  const n = norm(name);
  if (!n) {
    return null;
  }
  for (const entry of list) {
    if (n.includes(entry)) {
      return entry;
    }
  }
  return null;
}

function bandForScore(score: number, config: ScoringConfig): QualificationBand {
  for (const b of config.bands) {
    if (score >= b.min) {
      return b.band as QualificationBand;
    }
  }
  return 'Poor Fit';
}

function recommendedAction(band: QualificationBand): string {
  switch (band) {
    case 'Priority Lead':
      return 'Call now — top-priority outreach.';
    case 'Strong Lead':
      return 'Add to this week\'s call list.';
    case 'Possible Lead':
      return 'Queue for outreach; personalize using rating and reviews.';
    case 'Low Priority':
      return 'Low priority — revisit only if capacity allows.';
    case 'Poor Fit':
      return 'Do not pursue — not a fit.';
    case 'Needs Review':
      return 'Human review required before outreach (see warnings).';
    default:
      return 'Human review required.';
  }
}

/**
 * Scores a lead against the qualification configuration.
 *
 * @param {LeadInput} lead The lead fields (from Firestore).
 * @param {ScoringConfig} config Versioned scoring configuration.
 * @param {ScoreContext} context Batch-level hints (duplicate / conflict).
 * @return {ScoreResult} Component scores, band, reason codes, and score inputs.
 */
export function scoreLead(
    lead: LeadInput,
    config: ScoringConfig = DEFAULT_SCORING_CONFIG,
    context: ScoreContext = {},
): ScoreResult {
  const reasons: QualificationReason[] = [];
  const warnings: string[] = [];

  // ---------- Industry Fit (max 25) ----------
  const weight = industryWeight(lead.category ?? '', config);
  let fitScore = 0;
  if (!has(lead.category)) {
    warnings.push('CATEGORY_MISSING');
    reasons.push({code: 'FIT_UNKNOWN', text: 'No category on record; industry fit unknown.'});
  } else if (weight === null) {
    reasons.push({code: 'FIT_UNAPPROVED', text: `Category "${lead.category}" is not a target industry.`, points: 0});
  } else {
    fitScore = weight;
    reasons.push({code: 'FIT_MATCH', text: `Target industry "${lead.category}" (${weight}/25).`, points: weight});
  }
  fitScore = clamp(fitScore, 0, config.componentMax.fit);

  // ---------- Business Validity & Data Quality (max 20) ----------
  let dataQualityScore = 0;
  if (has(lead.phone)) dataQualityScore += 4;
  if (has(lead.website)) dataQualityScore += 4;
  if (has(lead.email)) dataQualityScore += 3;
  const addressComplete = has(lead.city) && has(lead.state) && (has(lead.postalCode) || has(lead.street));
  if (addressComplete) dataQualityScore += 5;
  const hasIdentifier = has(lead.placeId) || has(lead.googleId) || has(lead.cid);
  if (hasIdentifier) dataQualityScore += 4;
  dataQualityScore = clamp(dataQualityScore, 0, config.componentMax.dataQuality);
  if ((lead.reviewReasons?.length ?? 0) > 0) {
    warnings.push('HAS_REVIEW_REASONS');
  }
  reasons.push({code: 'DATA_QUALITY', text: `Data completeness ${dataQualityScore}/20.`, points: dataQualityScore});

  // ---------- Market Presence (max 20) ----------
  const ratingPts = tierPoints(lead.rating, config.ratingTiers);
  const reviewPts = tierPoints(lead.reviewCount, config.reviewVolumeTiers);
  const marketPresenceScore = clamp(ratingPts + reviewPts, 0, config.componentMax.marketPresence);
  if (lead.rating === null || lead.rating === undefined) warnings.push('RATING_UNAVAILABLE');
  if (lead.reviewCount === null || lead.reviewCount === undefined) warnings.push('REVIEW_COUNT_UNAVAILABLE');
  reasons.push({code: 'MARKET_PRESENCE', text: `Rating/reviews presence ${marketPresenceScore}/20.`, points: marketPresenceScore});

  // ---------- Value / Engagement Potential (max 20) — engagement only, NO revenue ----------
  const engagementPts = tierPoints(lead.reviewCount, config.engagementTiers);
  const qualityPts = tierPoints(lead.rating, [
    {min: 4.5, points: 6},
    {min: 4.0, points: 4},
    {min: 0, points: 0},
  ]);
  const industryBump = weight !== null && weight >= 23 ? 2 : 0;
  const valuePotentialScore = clamp(engagementPts + qualityPts + industryBump, 0, config.componentMax.valuePotential);
  reasons.push({
    code: 'VALUE_POTENTIAL',
    text: `Engagement potential ${valuePotentialScore}/20 (from reviews/rating; no revenue inferred).`,
    points: valuePotentialScore,
  });

  // ---------- Accessibility (max 15) ----------
  let accessibilityScore = 0;
  if (has(lead.phone)) accessibilityScore += 5;
  if (has(lead.email)) accessibilityScore += 3;
  if (has(lead.website)) accessibilityScore += 3;
  if (has(lead.emailGreetingName)) accessibilityScore += 2;
  if (has(lead.address) || addressComplete) accessibilityScore += 2;
  accessibilityScore = clamp(accessibilityScore, 0, config.componentMax.accessibility);
  reasons.push({code: 'ACCESSIBILITY', text: `Reachability ${accessibilityScore}/15.`, points: accessibilityScore});

  let overall = clamp(
      fitScore + dataQualityScore + marketPresenceScore + valuePotentialScore + accessibilityScore,
      0,
      config.maxScore,
  );

  // ---------- Penalties / routing ----------
  let forcedBand: QualificationBand | null = null;
  let needsReview = false;

  // Invalid record → Poor Fit (hard).
  const validation = norm(lead.validationStatus);
  if (validation === 'suppressed') {
    warnings.push('INVALID_SUPPRESSED');
    reasons.push({code: 'INVALID', text: 'Record was suppressed during validation.'});
    forcedBand = 'Poor Fit';
    overall = Math.min(overall, 10);
  }
  if (!has(lead.businessName)) {
    warnings.push('MISSING_BUSINESS_NAME');
    forcedBand = 'Poor Fit';
    overall = Math.min(overall, 10);
  }
  if (!hasIdentifier && !has(lead.phone) && !has(lead.website) && !has(lead.email)) {
    warnings.push('NO_IDENTIFIERS_OR_CONTACT');
    needsReview = true;
  }

  // Government / non-commercial → Poor Fit.
  const govMatch =
    nameMatchesAny(lead.category, config.governmentKeywords) ||
    nameMatchesAny(lead.businessName, config.governmentKeywords);
  if (govMatch) {
    warnings.push('GOVERNMENT_OR_NONCOMMERCIAL');
    reasons.push({code: 'GOVERNMENT', text: `Appears government/non-commercial ("${govMatch}").`});
    forcedBand = 'Poor Fit';
  }

  // Chain / franchise → Needs Review (ownership never inferred from name).
  const chainMatch = nameMatchesAny(lead.businessName, config.chains);
  if (chainMatch) {
    warnings.push('POSSIBLE_NATIONAL_CHAIN');
    reasons.push({code: 'CHAIN', text: `Name matches national chain "${chainMatch}" — confirm ownership.`});
    needsReview = true;
  }
  const franchiseMatch = nameMatchesAny(lead.businessName, config.franchises);
  if (franchiseMatch) {
    warnings.push('UNCERTAIN_FRANCHISE_OWNERSHIP');
    reasons.push({code: 'FRANCHISE', text: `Name matches franchise "${franchiseMatch}" — ownership uncertain.`});
    needsReview = true;
  }

  // Duplicate / conflicting identifiers (batch-provided).
  if (context.duplicateOf) {
    warnings.push('POSSIBLE_DUPLICATE');
    reasons.push({code: 'DUPLICATE', text: `Possible duplicate of ${context.duplicateOf}.`});
    needsReview = true;
  }
  if (context.identifierConflict) {
    warnings.push('CONFLICTING_IDENTIFIERS');
    reasons.push({code: 'ID_CONFLICT', text: 'Identifiers conflict across records.'});
    needsReview = true;
  }

  // Geography — active only when a target is configured.
  const geoActive = config.targetGeography.states.length > 0 || config.targetGeography.cities.length > 0 || config.targetGeography.postalPrefixes.length > 0;
  if (geoActive) {
    const inState = config.targetGeography.states.map(norm).includes(norm(lead.state));
    const inCity = config.targetGeography.cities.map(norm).includes(norm(lead.city));
    const inPostal = config.targetGeography.postalPrefixes.some((p) => norm(lead.postalCode).startsWith(norm(p)));
    if (has(lead.state) || has(lead.city) || has(lead.postalCode)) {
      if (!inState && !inCity && !inPostal) {
        warnings.push('OUTSIDE_TARGET_GEOGRAPHY');
        reasons.push({code: 'OUT_OF_AREA', text: 'Outside the configured target geography.'});
        overall = Math.max(0, overall - 15);
      }
    } else {
      warnings.push('GEOGRAPHY_UNKNOWN');
    }
  }

  // Needs Review overrides the numeric band.
  let qualificationBand: QualificationBand;
  if (needsReview) {
    qualificationBand = 'Needs Review';
  } else if (forcedBand) {
    qualificationBand = forcedBand;
  } else {
    qualificationBand = bandForScore(overall, config);
  }

  const scoreInputs: Record<string, unknown> = {
    category: lead.category ?? null,
    industryWeight: weight,
    rating: lead.rating ?? null,
    reviewCount: lead.reviewCount ?? null,
    hasPhone: has(lead.phone),
    hasWebsite: has(lead.website),
    hasEmail: has(lead.email),
    hasGreetingName: has(lead.emailGreetingName),
    addressComplete,
    hasIdentifier,
    validationStatus: lead.validationStatus ?? null,
    state: lead.state ?? null,
    city: lead.city ?? null,
    duplicateOf: context.duplicateOf ?? null,
    identifierConflict: Boolean(context.identifierConflict),
    unavailableSignals: UNAVAILABLE_SIGNALS,
  };

  return {
    fitScore,
    dataQualityScore,
    marketPresenceScore,
    valuePotentialScore,
    accessibilityScore,
    overallQualificationScore: overall,
    qualificationBand,
    qualificationReasons: reasons,
    qualificationWarnings: warnings,
    recommendedNextAction: recommendedAction(qualificationBand),
    scoringVersion: config.version,
    scoreInputs,
  };
}

/**
 * Maps a score result to the additive fields written onto a lead document.
 * `scoredAt` is stamped by the writer (serverTimestamp), not here, so the pure
 * scorer stays deterministic. Raw Outscraper fields are never touched.
 *
 * @param {ScoreResult} result The pure score result.
 * @return {Record<string, unknown>} The derived fields to merge onto the lead.
 */
export function toLeadScoreFields(result: ScoreResult): Record<string, unknown> {
  return {
    fitScore: result.fitScore,
    dataQualityScore: result.dataQualityScore,
    marketPresenceScore: result.marketPresenceScore,
    valuePotentialScore: result.valuePotentialScore,
    accessibilityScore: result.accessibilityScore,
    overallQualificationScore: result.overallQualificationScore,
    qualificationBand: result.qualificationBand,
    qualificationReasons: result.qualificationReasons,
    qualificationWarnings: result.qualificationWarnings,
    recommendedNextAction: result.recommendedNextAction,
    scoringVersion: result.scoringVersion,
    scoreInputs: result.scoreInputs,
  };
}
