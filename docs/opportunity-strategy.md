# Angie — opportunity strategy engine

Angie now builds practical **marketing opportunity plans**, not just lead
qualification explanations. The strategy knowledge lives in versioned, testable
config so it's grounded and editable — the model provides language, the config
provides the substance.

## Grounded inputs (config, not prompts)

- `web/src/lib/service-catalog.ts` — the Micah Amari service catalog
  (`SERVICE_CATALOG_VERSION`). Each service carries idealBusinessTypes,
  useful/disqualifying signals, goals, deliverables, outreach angles, and the
  evidence required before a specific claim.
- `web/src/lib/industry-playbooks.ts` — per-category playbooks
  (`PLAYBOOK_VERSION`) with goals, high-value services, campaign/content ideas,
  outreach angles, and evidence needed. `playbookForCategory()` selects the most
  specific match (implants/cosmetic before general dental).
- `web/src/lib/service-match.ts` — `matchServices()` ranks services from the
  **signals we actually store** (no website, review volume, rating, contact on
  file) plus the playbook. Deterministic and unit-tested; disqualified services
  (e.g. website optimization with no site) are dropped.

## Output structure

`action: "strategy"` returns: Opportunity Snapshot · What We Know (grounded
facts) · Best Service Matches · Marketing Opportunities · Campaign Ideas
(name/concept/audience/channel/goal/deliverables) · Recommended Outreach
Approach · Conversation Starter · What to Research Next · Suggested Next Step ·
30-Day Plan. The card (`strategy-card.tsx`) keeps facts, ideas, and research
visually separate and collapses the deeper sections.

**Depth** via `depth`: `quick` · `full` · `campaign` · `thirty_day`.
**Focus** via `focus`: `organic_social` · `paid_ads` · `website` · `creative` ·
`cheaper` · `pitch`. Both are set by the intent classifier or the card's
follow-up buttons (More creative / Focus organic / Focus paid ads / 30-day plan
/ Draft email).

## Facts vs. recommendations vs. research

Every plan separates **What We Know** (grounded), **Marketing Opportunities /
Campaign Ideas** (proposed), and **What to Research Next** (verify first). Angie
never diagnoses a website/ads/social it hasn't reviewed — it frames them as worth
reviewing. **Internal qualification and data-completeness scores never appear in
strategy or prospect-facing output** (`buildSalesFacts` omits them; data gaps are
translated into salesperson actions).

## Comparison

`action: "comparison"` compares leads across service fit, likely value, outreach
difficulty, campaign potential, evidence, and a recommended priority
(`comparison-card.tsx`).

## Multi-channel outreach

`action: "email"` accepts a `channel`: email · linkedin · instagram · facebook ·
call_opener · voicemail · mailed_note · video_audit · proposal · campaign_teaser
· follow_up. Tone/focus modifiers still apply, and outreach never invents
observations or mentions internal scores.

## Intents

The `converse` classifier now also routes: `opportunity_strategy`,
`service_match`, `channel_plan`, `campaign_ideas`, `follow_up_plan`,
`lead_comparison`, `research_request` — alongside the existing search / refine /
lead-question / outreach / export.

## Future research compatibility

Strategy inputs come only from stored lead data + qualification data + the
service catalog + playbooks. The structure leaves room to add real research
sources later (website/social/ads/SEO signals) without a rewrite; until then,
Angie never pretends external research has occurred.

## Tests

`npm test` in `web`: `service-match.test.ts` (signal derivation, matching,
disqualification, playbook boosting, catalog integrity, playbook selection) and
`strategy-card.test.tsx` (section rendering, collapse, follow-up actions).
