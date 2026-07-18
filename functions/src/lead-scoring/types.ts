/*
 * Types for the Micah Amari Lead Qualification Engine (ma-lead-score-v1).
 */

/** The subset of a Firestore lead the scorer is allowed to read. */
export interface LeadInput {
  leadId?: string;
  businessName?: string;
  emailGreetingName?: string;
  phone?: string;
  website?: string;
  email?: string;
  address?: string;
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  category?: string;
  rating?: number | null;
  reviewCount?: number | null;
  placeId?: string;
  googleId?: string;
  cid?: string;
  googleMapsUrl?: string;
  validationStatus?: string;
  pipelineStage?: string;
  reviewReasons?: string[];
}

/**
 * Batch-level hints the pure scorer cannot derive from a single lead. The batch
 * scorer computes these (duplicate / identifier-conflict detection) and passes
 * them in; the per-lead trigger leaves them empty.
 */
export interface ScoreContext {
  duplicateOf?: string | null;
  identifierConflict?: boolean;
}

export type QualificationBand =
  | 'Priority Lead'
  | 'Strong Lead'
  | 'Possible Lead'
  | 'Low Priority'
  | 'Poor Fit'
  | 'Needs Review';

/** A machine code plus a human-readable explanation Ask Angie can surface. */
export interface QualificationReason {
  code: string;
  text: string;
  points?: number;
}

export interface ScoreResult {
  fitScore: number;
  dataQualityScore: number;
  marketPresenceScore: number;
  valuePotentialScore: number;
  accessibilityScore: number;
  overallQualificationScore: number;
  qualificationBand: QualificationBand;
  qualificationReasons: QualificationReason[];
  qualificationWarnings: string[];
  recommendedNextAction: string;
  scoringVersion: string;
  /**
   * Exactly which field values were used, and which signals were unavailable.
   * Persisted so a score is fully reproducible and auditable.
   */
  scoreInputs: Record<string, unknown>;
}
