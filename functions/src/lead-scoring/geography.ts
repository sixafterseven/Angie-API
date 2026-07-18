/*
 * Target-geography evaluation for the Lead Qualification Engine.
 *
 * Business rule (v2):
 *   - Atlanta metro  -> Tier 1, in market (eligible)
 *   - Other Georgia  -> Tier 2, in market (eligible)
 *   - Outside Georgia -> out of market (suppressed, never deleted)
 *   - Missing / ambiguous state -> Needs Review
 *
 * Raw location fields are read but never modified.
 */

import {GeographyConfig} from './config';

export type GeographyStatus = 'in_market' | 'out_of_market' | 'needs_review';
export type MarketTier = 'tier_1_atlanta_metro' | 'tier_2_georgia' | null;

export interface GeographyResult {
  geographyStatus: GeographyStatus;
  geographyReason: string;
  marketTier: MarketTier;
  isInTargetMarket: boolean;
}

/** US state/territory names to their two-letter codes (for validity + resolution). */
const STATE_NAME_TO_CODE: Record<string, string> = {
  'alabama': 'al', 'alaska': 'ak', 'arizona': 'az', 'arkansas': 'ar', 'california': 'ca',
  'colorado': 'co', 'connecticut': 'ct', 'delaware': 'de',
  'district of columbia': 'dc', 'florida': 'fl', 'georgia': 'ga', 'hawaii': 'hi',
  'idaho': 'id', 'illinois': 'il', 'indiana': 'in', 'iowa': 'ia', 'kansas': 'ks',
  'kentucky': 'ky', 'louisiana': 'la', 'maine': 'me', 'maryland': 'md',
  'massachusetts': 'ma', 'michigan': 'mi', 'minnesota': 'mn', 'mississippi': 'ms',
  'missouri': 'mo', 'montana': 'mt', 'nebraska': 'ne', 'nevada': 'nv',
  'new hampshire': 'nh', 'new jersey': 'nj', 'new mexico': 'nm',
  'new york': 'ny', 'north carolina': 'nc', 'north dakota': 'nd', 'ohio': 'oh',
  'oklahoma': 'ok', 'oregon': 'or', 'pennsylvania': 'pa', 'rhode island': 'ri',
  'south carolina': 'sc', 'south dakota': 'sd', 'tennessee': 'tn', 'texas': 'tx',
  'utah': 'ut', 'vermont': 'vt', 'virginia': 'va', 'washington': 'wa',
  'west virginia': 'wv', 'wisconsin': 'wi', 'wyoming': 'wy',
  'puerto rico': 'pr',
};

const STATE_CODES = new Set(Object.values(STATE_NAME_TO_CODE));

/**
 * Resolves a state value to its two-letter code, or null when the value is
 * empty or not a recognizable US state (i.e. ambiguous).
 *
 * @param {string | undefined} state Raw state value.
 * @return {string | null} Lowercase two-letter code, or null.
 */
export function resolveStateCode(state?: string): string | null {
  const s = (state ?? '').trim().toLowerCase();

  if (!s) {
    return null;
  }
  if (STATE_CODES.has(s)) {
    return s;
  }

  return STATE_NAME_TO_CODE[s] ?? null;
}

function norm(value?: string): string {
  return (value ?? '').trim().toLowerCase();
}

/**
 * Classifies a lead's market geography. Never mutates the lead.
 *
 * @param {{state?: string; city?: string; postalCode?: string}} lead Location fields.
 * @param {GeographyConfig} config Tunable geography configuration.
 * @return {GeographyResult} Status, tier, market flag, and a human reason.
 */
export function evaluateGeography(
    lead: {state?: string; city?: string; postalCode?: string},
    config: GeographyConfig,
): GeographyResult {
  const code = resolveStateCode(lead.state);
  const city = norm(lead.city);
  const postal = norm(lead.postalCode);

  if (!code) {
    const anyLocation = Boolean(norm(lead.state) || city || postal);

    return {
      geographyStatus: 'needs_review',
      marketTier: null,
      isInTargetMarket: false,
      geographyReason: anyLocation ?
        'Ambiguous or unrecognized state — routed to review.' :
        'Missing state/location — routed to review.',
    };
  }

  if (!config.eligibleStates.includes(code)) {
    return {
      geographyStatus: 'out_of_market',
      marketTier: null,
      isInTargetMarket: false,
      geographyReason: `Outside target geography (state ${code.toUpperCase()}).`,
    };
  }

  const inMetro =
    config.atlantaMetro.cities.includes(city) ||
    config.atlantaMetro.postalPrefixes.some((p) => postal.startsWith(p));

  if (inMetro) {
    return {
      geographyStatus: 'in_market',
      marketTier: 'tier_1_atlanta_metro',
      isInTargetMarket: true,
      geographyReason: 'Atlanta metro — Tier 1 (eligible).',
    };
  }

  return {
    geographyStatus: 'in_market',
    marketTier: 'tier_2_georgia',
    isInTargetMarket: true,
    geographyReason: 'Georgia outside Atlanta metro — Tier 2 (eligible).',
  };
}
