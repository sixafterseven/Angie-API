/*
 * Versioned scoring configuration for the Micah Amari Lead Qualification Engine.
 *
 * All weights, thresholds, and heuristic lists live here — nothing is scattered
 * as constants through the scoring code. Bump SCORING_VERSION and re-run the
 * batch rescore script to apply a configuration change.
 */

export const SCORING_VERSION = 'ma-lead-score-v2';

/** Tunable target-geography configuration (Atlanta metro / Georgia). */
export interface GeographyConfig {
  /** Two-letter codes that are in-market. Anything else is out of market. */
  eligibleStates: string[];
  atlantaMetro: {
    cities: string[];
    postalPrefixes: string[];
  };
}

export interface IndustryWeight {
  /** Substrings matched (case-insensitive) against the lead's category. */
  match: string[];
  /** Industry Fit points (0..25). */
  weight: number;
}

export interface ScoringConfig {
  version: string;
  maxScore: number;
  componentMax: {
    fit: number;
    dataQuality: number;
    marketPresence: number;
    valuePotential: number;
    accessibility: number;
  };
  industries: IndustryWeight[];
  bands: { min: number; band: string }[];
  geography: GeographyConfig;
  /** Known national chains — a name match routes to Needs Review, never auto-suppress. */
  chains: string[];
  /** Known franchise brands — a name match routes to Needs Review (ownership not decided). */
  franchises: string[];
  /** Category/name keywords that mark government or non-commercial entities. */
  governmentKeywords: string[];
  ratingTiers: { min: number; points: number }[];
  reviewVolumeTiers: { min: number; points: number }[];
  engagementTiers: { min: number; points: number }[];
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  version: SCORING_VERSION,
  maxScore: 100,
  componentMax: {
    fit: 25,
    dataQuality: 20,
    marketPresence: 20,
    valuePotential: 20,
    accessibility: 15,
  },

  // Order matters: the first match wins, so put more specific categories first.
  industries: [
    {match: ['orthodont'], weight: 25},
    {match: ['cosmetic dentist'], weight: 25},
    {match: ['medical spa', 'medspa', 'med spa'], weight: 25},
    {match: ['dental implant', 'periodont'], weight: 23},
    {match: ['senior care', 'assisted living', 'home care'], weight: 21},
    {match: ['chiropract'], weight: 19},
    // Generic dentist LAST so cosmetic/implant/ortho match first.
    {match: ['dentist', 'dental'], weight: 18},
  ],

  bands: [
    {min: 80, band: 'Priority Lead'},
    {min: 65, band: 'Strong Lead'},
    {min: 50, band: 'Possible Lead'},
    {min: 30, band: 'Low Priority'},
    {min: 0, band: 'Poor Fit'},
  ],

  geography: {
    eligibleStates: ['ga'],
    atlantaMetro: {
      cities: [
        'atlanta', 'marietta', 'alpharetta', 'roswell', 'sandy springs',
        'smyrna', 'decatur', 'dunwoody', 'kennesaw', 'duluth', 'lawrenceville',
        'johns creek', 'brookhaven', 'peachtree corners', 'norcross', 'tucker',
        'stone mountain', 'east point', 'college park', 'mableton', 'austell',
        'powder springs', 'woodstock', 'acworth', 'suwanee', 'snellville',
        'buford', 'cumming', 'canton', 'fayetteville', 'stockbridge',
        'mcdonough', 'conyers', 'douglasville', 'union city', 'forest park',
        'riverdale', 'morrow', 'jonesboro', 'doraville', 'chamblee', 'vinings',
        'lilburn', 'grayson', 'loganville', 'hiram', 'dallas',
      ],
      postalPrefixes: ['300', '301', '302', '303'],
    },
  },

  chains: [
    'aspen dental',
    'western dental',
    'pacific dental',
    'heartland dental',
    'great expressions',
    'smile brands',
    'comfort dental',
  ],

  franchises: [
    'the joint chiropractic',
    'the joint',
    'joint chiropractic',
    'massage envy',
    'amazing lash',
    'european wax',
    'sono bello',
    'ideal image',
  ],

  governmentKeywords: [
    'city hall',
    'county',
    'government',
    'municipal',
    'police',
    'fire department',
    'sheriff',
    'courthouse',
    'public school',
    'school district',
    'dmv',
    'post office',
    'library',
    'veterans affairs',
    'department of',
  ],

  ratingTiers: [
    {min: 4.5, points: 8},
    {min: 4.0, points: 6},
    {min: 3.5, points: 3},
    {min: 0, points: 0},
  ],

  reviewVolumeTiers: [
    {min: 150, points: 12},
    {min: 50, points: 10},
    {min: 10, points: 8},
    {min: 1, points: 4},
    {min: 0, points: 0},
  ],

  engagementTiers: [
    {min: 100, points: 12},
    {min: 25, points: 9},
    {min: 1, points: 5},
    {min: 0, points: 0},
  ],
};
