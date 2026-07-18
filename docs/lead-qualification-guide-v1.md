# Micah Amari Lead Qualification Guide — Version 1.0

`scoringVersion: ma-lead-score-v1`

This guide explains how Angie OS turns a raw imported lead into a qualification
score and band. It is a **transparent, deterministic, first-pass** system: it
scores only on facts already in Firestore, never invents missing business
information, and sends anything uncertain to **Needs Review** instead of quietly
discarding it.

---

## 1. Ideal Customer Profile (ICP)

An ideal Micah Amari lead is an **independently-owned, in-market, patient-facing
practice** in a high-value health/wellness or cosmetic-services category, with:

- a clear, single-location business identity (not a national chain or government body),
- real market presence (a solid Google rating and a meaningful number of reviews),
- reachable contact channels (phone, and ideally email/website), and
- a named contact for personalized outreach.

## 2. Target industries (Industry Fit, max 25 pts)

| Industry (matched on the lead's `category`) | Fit points |
|---|---|
| Orthodontist | 25 |
| Cosmetic dentist | 25 |
| Medical spa / med spa | 25 |
| Dental implants / periodontist | 23 |
| Senior care agency (incl. assisted living, home care) | 21 |
| Chiropractor | 19 |
| General dentist / dental | 18 |
| Other approved industries | configurable |
| Unapproved industries | 0 |

Weights live in the versioned config (`functions/src/lead-scoring/config.ts`).
Because Outscraper `subtypes` are **not** persisted to Firestore, a generic
"Dentist" category scores at the general-dentist tier even if the practice is
actually cosmetic — it is never *upgraded* on a guess.

## 3. Scoring criteria (100 points total)

| Component | Max | Signals used (Firestore fields) |
|---|---|---|
| Industry Fit | 25 | `category` → industry-weight table |
| Business Validity & Data Quality | 20 | presence of `phone`, `website`, `email`, a complete address, ≥1 Google identifier (`placeId`/`googleId`/`cid`); plus `validationStatus`, `reviewReasons` |
| Market Presence | 20 | `rating`, `reviewCount` (tiered) |
| Revenue & Engagement Potential | 20 | **engagement only** — `reviewCount` volume + `rating` quality + a small high-value-industry bump. **No revenue is estimated.** |
| Accessibility | 15 | `phone`, `email`, `website`, `emailGreetingName`, address |

## 4. Qualification bands

| Overall score | Band | Meaning |
|---|---|---|
| 80–100 | **Priority Lead** | Best-fit, ready to work now |
| 65–79 | **Strong Lead** | Work this week |
| 50–64 | **Possible Lead** | Worth outreach with personalization |
| 30–49 | **Low Priority** | Revisit only with capacity |
| below 30 | **Poor Fit** | Do not pursue |
| any | **Needs Review** | Uncertain/conflicting — a human decides (overrides the numeric band) |

## 5. Suppression rules (→ Poor Fit)

A lead is scored as **Poor Fit** (not deleted) when it is clearly unusable:

- `validationStatus === 'suppressed'` (invalid record).
- Missing `businessName`.
- Category or name indicates a **government / non-commercial** entity
  (city hall, county, police/fire, public school, DMV, library, "department of …", etc.).

Nothing is auto-deleted; suppression only sets the band.

## 6. Needs Review rules (uncertain → human decides)

The band becomes **Needs Review** — never auto-suppressed — when:

- the lead has **no contact channel and no identifier** (can't be confidently judged),
- a batch run flags it as a **possible duplicate** (shared Google identifier) or a
  **conflicting identifier** (same id → different business names),
- the name matches a **national chain** or a **franchise brand** (ownership is uncertain).

## 7. Chain & franchise treatment

- A **national-chain** name match (config list) → warning + **Needs Review**.
- A **franchise-brand** name match (config list) → warning + **Needs Review**.
- **Ownership is never inferred from the business name alone** — a franchise/chain name
  routes to review so a person can confirm whether the location is independently owned.
  It is never automatically approved *or* suppressed on the name.

## 8. Evidence standards

- **Only stored facts are used.** The scorer reads a fixed set of Firestore fields and
  records the exact values it used in `scoreInputs`, so every score is reproducible.
- **Unknown is not negative.** A missing `rating`/`reviewCount` scores 0 for that
  component and raises a warning — it never subtracts points or invents a value.
- **No revenue inference.** There is no revenue signal in the data; the "Revenue &
  Engagement Potential" component measures *engagement* (reviews/rating) only and says so.

## 9. Research boundaries (what v1 does NOT do)

v1 uses no deep website research, SEO/social/ad analysis, or revenue estimates. It also
**cannot detect permanently-closed businesses**, `verified` status, `subtypes`,
`photos_count`, or precise geography — those Outscraper signals are not persisted to
Firestore today. Each is listed in `scoreInputs.unavailableSignals` and is **never faked**.
Activating permanently-closed detection would require adding `business_status` to the
Vera import mapping (separate work). Target geography is configurable but **unset in v1**
(it records each lead's location but applies no penalty until a target is configured).

## 10. Recommended actions by band

| Band | Recommended next action |
|---|---|
| Priority Lead | Call now — top-priority outreach. |
| Strong Lead | Add to this week's call list. |
| Possible Lead | Queue for outreach; personalize using rating and reviews. |
| Low Priority | Low priority — revisit only if capacity allows. |
| Poor Fit | Do not pursue — not a fit. |
| Needs Review | Human review required before outreach (see warnings). |

---

## Derived fields written to each lead (additive — raw fields untouched)

`fitScore, dataQualityScore, marketPresenceScore, valuePotentialScore,
accessibilityScore, overallQualificationScore, qualificationBand,
qualificationReasons (code + text), qualificationWarnings, recommendedNextAction,
scoringVersion, scoredAt, scoreInputs`.

## Rescoring

Change any weight/threshold in the config (and bump `SCORING_VERSION` for a version
change), rebuild, then run `node lib/scripts/rescore-leads.js --execute`. New leads are
scored automatically on write; the batch script rescoring existing leads and adds
cross-record duplicate/conflict detection.
