# Ask Angie — product features (PR 3)

Completes the product layer: full export, saved lists, structured strategy and
outreach, refined lead cards, and a full-app brand pass. Builds on the design
system (PR 1) and conversational experience (PR 2).

## Export

`web/src/lib/export-leads.ts` + `web/src/components/export-menu.tsx`.

- **Formats:** CSV (hand-rolled) and XLSX (SheetJS).
- **Scopes:** Current results · Selected leads · Top 5 / 10 / 25 / Custom N.
- The menu shows the **estimated record count** before download and confirms
  with a toast.
- **Columns** are the sales-useful set only (Business Name … Source Batch) — no
  internal fields. Phone / ZIP / Source Batch are forced to text so leading
  zeros and long ids survive in Excel.
- Export reads **only stored lead data** (the active conversational set, current
  filters/sort/limit, or the selection) — never model-generated text.
- Filenames: `micah-amari-leads-<summary>-<yyyy-mm-dd>.{csv,xlsx}`.
- Empty scopes are handled cleanly (no file, an info toast).

## Saved lists

`web/src/app/api/saved-lists/route.ts`, `web/src/lib/saved-lists.ts`,
`web/src/app/saved-lists/page.tsx`.

- A saved list is a lightweight "playlist": `name`, `leadIds`, `searchSummary`,
  `filters`, `sort`, timestamps, scoped to `userId`.
- **CRUD goes through the API (Admin SDK) after `requireUser()`**, scoped to the
  caller's uid — so the existing "all client writes denied" Firestore rules are
  **unchanged**. Ownership is enforced on every read/mutate.
- Save the current results or just the selection; reopen (re-enters Ask Angie
  with the list's filters/summary so you can keep refining); rename; download;
  delete.
- **Firestore index (must be deployed):** `savedLists` composite index on
  `userId ASC, updatedAt DESC` — added to `firestore.indexes.json`. Deploy with
  `firebase deploy --only firestore:indexes`. No rules change.

## Strategy card

`web/src/components/strategy-card.tsx`; endpoint returns validated JSON.

Structured sections: Opportunity Snapshot · What We'd Fix First · Why This
Matters · Recommended Offer · Conversation Starter · Watch-Outs · Suggested Next
Step. Micah Amari voice (relaxed, specific, lightly witty; banned agency
clichés). Grounded — never diagnoses a website (no website research exists);
uses careful language ("worth reviewing", "may be an opportunity").

## Outreach card

`web/src/components/outreach-card.tsx`; endpoint returns structured emails.

Fields: Subject · Preview Text · Body · CTA · Tone Label. **Inline editing** of
subject/body before copy. Controls: Copy · Regenerate · Warmer · Shorter · More
Direct · Focus website / branding / reviews. Adjustments regenerate grounded in
the same lead facts and never invent observations; when website quality is
unknown, outreach is framed as an invitation, not a diagnosis.

## Lead card

`web/src/components/lead-card.tsx` — name · category · city/state, qualification
badge + score, rating/reviews, phone/website, "Why Angie likes this lead,"
watch-outs, recommended next step, and per-card actions (Select · Game plan ·
Draft outreach · Copy contact · Map · Details disclosure).

## Tests

`npm test` in `web` (59): export scope/columns/CSV+XLSX text-safety/filenames,
saved-list validation, strategy section rendering, outreach rendering + inline
editing + tone controls + fact preservation + busy state, plus the PR 1–2 suites.
