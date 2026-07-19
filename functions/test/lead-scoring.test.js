/*
 * Unit tests for the Micah Amari Lead Qualification Engine (pure scorer).
 * Runs against the compiled output in lib/. Run with: npm test
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {scoreLead} = require('../lib/lead-scoring/score');
const {SCORING_VERSION} = require('../lib/lead-scoring/config');

const STRONG = {
  businessName: 'Bright Smiles Orthodontics',
  emailGreetingName: 'Dr. Bright',
  phone: '(555) 123-4567',
  website: 'brightsmiles.com',
  email: 'hi@brightsmiles.com',
  address: '123 Main St, Atlanta, GA 30303',
  street: '123 Main St',
  city: 'Atlanta',
  state: 'GA',
  postalCode: '30303',
  category: 'Orthodontist',
  rating: 4.8,
  reviewCount: 220,
  placeId: 'ChIJabc',
  googleId: '0x1',
  cid: '99',
  validationStatus: 'approved',
};

function warningCodes(result) {
  return result.qualificationWarnings;
}

test('strong lead scores near 100 and lands Priority Lead', () => {
  const r = scoreLead(STRONG);
  assert.equal(r.fitScore, 25);
  assert.equal(r.overallQualificationScore, 100);
  assert.equal(r.qualificationBand, 'Priority Lead');
  assert.equal(r.scoringVersion, SCORING_VERSION);
  assert.match(r.recommendedNextAction, /Call now/);
});

test('weak lead (unapproved industry, thin data) is Poor Fit', () => {
  const r = scoreLead({
    businessName: 'Joe\'s Diner',
    phone: '(555) 000-0000',
    city: 'Atlanta',
    state: 'GA',
    postalCode: '30303',
    category: 'Restaurant',
    rating: 3.0,
    reviewCount: 5,
  });
  assert.equal(r.fitScore, 0);
  assert.ok(r.overallQualificationScore < 30, `expected <30, got ${r.overallQualificationScore}`);
  assert.equal(r.qualificationBand, 'Poor Fit');
});

test('duplicate (batch hint) routes to Needs Review', () => {
  const r = scoreLead(STRONG, undefined, {duplicateOf: 'LEAD-001'});
  assert.equal(r.qualificationBand, 'Needs Review');
  assert.ok(warningCodes(r).includes('POSSIBLE_DUPLICATE'));
});

test('conflicting identifiers (batch hint) routes to Needs Review', () => {
  const r = scoreLead(STRONG, undefined, {identifierConflict: true});
  assert.equal(r.qualificationBand, 'Needs Review');
  assert.ok(warningCodes(r).includes('CONFLICTING_IDENTIFIERS'));
});

test('national chain name routes to Needs Review, never auto-suppressed', () => {
  const r = scoreLead({...STRONG, businessName: 'Aspen Dental of Atlanta'});
  assert.equal(r.qualificationBand, 'Needs Review');
  assert.ok(warningCodes(r).includes('POSSIBLE_NATIONAL_CHAIN'));
  assert.notEqual(r.qualificationBand, 'Poor Fit');
});

test('franchise name routes to Needs Review (ownership not decided from name)', () => {
  const r = scoreLead({...STRONG, category: 'Medical spa', businessName: 'Massage Envy Buckhead'});
  assert.equal(r.qualificationBand, 'Needs Review');
  assert.ok(warningCodes(r).includes('UNCERTAIN_FRANCHISE_OWNERSHIP'));
});

test('permanently-closed signal is unavailable — recorded, never faked or auto-suppressed', () => {
  const r = scoreLead(STRONG);
  assert.ok(
      r.scoreInputs.unavailableSignals.some((s) => s.includes('business_status')),
      'business_status must be listed as an unavailable signal',
  );
  // A healthy lead is NOT suppressed just because we cannot check closed status.
  assert.notEqual(r.qualificationBand, 'Poor Fit');
});

test('missing rating/reviews score 0, never negative, and are flagged', () => {
  const r = scoreLead({...STRONG, rating: null, reviewCount: null});
  assert.equal(r.marketPresenceScore, 0);
  assert.ok(r.marketPresenceScore >= 0);
  assert.ok(r.valuePotentialScore >= 0);
  assert.ok(warningCodes(r).includes('RATING_UNAVAILABLE'));
  assert.ok(warningCodes(r).includes('REVIEW_COUNT_UNAVAILABLE'));
});

test('record with no contact and no identifiers routes to Needs Review', () => {
  const r = scoreLead({businessName: 'Ghost Clinic', category: 'Chiropractor'});
  assert.equal(r.qualificationBand, 'Needs Review');
  assert.ok(warningCodes(r).includes('NO_IDENTIFIERS_OR_CONTACT'));
});

test('suppressed validation status is Poor Fit', () => {
  const r = scoreLead({...STRONG, validationStatus: 'suppressed'});
  assert.equal(r.qualificationBand, 'Poor Fit');
  assert.ok(warningCodes(r).includes('INVALID_SUPPRESSED'));
});

test('government/non-commercial category is Poor Fit', () => {
  const r = scoreLead({...STRONG, businessName: 'County Health Department', category: 'Government office'});
  assert.equal(r.qualificationBand, 'Poor Fit');
  assert.ok(warningCodes(r).includes('GOVERNMENT_OR_NONCOMMERCIAL'));
});

test('no revenue is inferred; value potential is engagement-based and additive fields are present', () => {
  const r = scoreLead(STRONG);
  const valueReason = r.qualificationReasons.find((x) => x.code === 'VALUE_POTENTIAL');
  assert.match(valueReason.text, /no revenue inferred/i);
  assert.ok(!('revenue' in r), 'scorer must not produce a revenue field');
  for (const f of ['fitScore', 'dataQualityScore', 'marketPresenceScore', 'valuePotentialScore', 'accessibilityScore', 'overallQualificationScore', 'scoreInputs', 'geographyStatus', 'geographyReason', 'marketTier', 'isInTargetMarket']) {
    assert.ok(f in r, `${f} must be present`);
  }
});

test('Atlanta metro lead is Tier 1, in market', () => {
  const r = scoreLead(STRONG);
  assert.equal(r.geographyStatus, 'in_market');
  assert.equal(r.marketTier, 'tier_1_atlanta_metro');
  assert.equal(r.isInTargetMarket, true);
});

test('Georgia lead outside Atlanta metro is Tier 2, in market', () => {
  const r = scoreLead({
    ...STRONG,
    city: 'Savannah',
    state: 'GA',
    postalCode: '31401',
    address: '1 Bay St, Savannah, GA 31401',
  });
  assert.equal(r.geographyStatus, 'in_market');
  assert.equal(r.marketTier, 'tier_2_georgia');
  assert.equal(r.isInTargetMarket, true);
  assert.notEqual(r.qualificationBand, 'Poor Fit');
});

test('New York lead is out of market — suppressed to Poor Fit, never deleted', () => {
  const r = scoreLead({
    ...STRONG,
    city: 'New York',
    state: 'NY',
    postalCode: '10001',
    address: '1 Broadway, New York, NY 10001',
  });
  assert.equal(r.geographyStatus, 'out_of_market');
  assert.equal(r.marketTier, null);
  assert.equal(r.isInTargetMarket, false);
  assert.equal(r.qualificationBand, 'Poor Fit');
  assert.ok(warningCodes(r).includes('OUT_OF_MARKET'));
});

test('missing-location lead routes to Needs Review', () => {
  const r = scoreLead({
    ...STRONG,
    city: '',
    state: '',
    postalCode: '',
    address: '',
  });
  assert.equal(r.geographyStatus, 'needs_review');
  assert.equal(r.marketTier, null);
  assert.equal(r.isInTargetMarket, false);
  assert.equal(r.qualificationBand, 'Needs Review');
  assert.ok(warningCodes(r).includes('LOCATION_NEEDS_REVIEW'));
});

test('scoring is deterministic (same input -> same output)', () => {
  assert.deepEqual(scoreLead(STRONG), scoreLead(STRONG));
});
