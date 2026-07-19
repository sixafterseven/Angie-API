# Ask Angie — conversation model (PR 2)

Ask Angie is a chat, not a one-shot form. It remembers the current result set and
takes natural follow-ups.

## State (client-side, sessionStorage)

Two things are kept separate (`web/src/lib/angie-session.ts`):

- **Transcript** (`ChatMessage[]`) — what's shown: user / Angie bubbles. Angie
  bubbles can embed result cards, a strategy, or drafted emails.
- **`SessionState`** — structured: `activeFilters`, `activeSort`,
  `activeSearchSummary`, `activeLeadIds`, `selectedLeadIds`, `lastIntent`,
  `lastGenerated{Strategy,Outreach}`, plus `sessionId/userId/createdAt/updatedAt/
  title/status`.

Both persist to `sessionStorage`, so a refresh keeps the conversation. Nothing is
written to Firestore (no rules/index changes). The base lead set is always
re-fetched fresh from Firestore and the active set re-derived from filters, so
the conversation can't drift from real data.

## Intent routing

Each turn is classified by `POST /api/ask-angie` (`action: "converse"`) into one
intent, with a validated filter delta and a short reply:

| Intent | Behavior |
|---|---|
| `new_search` | Replace active filters; derive the active set. |
| `refine` | Merge the delta onto current filters; re-derive (deterministic, client-side). |
| `lead_question` | Grounded answer over the active/selected leads (`action: "answer"`). |
| `strategy` | `action: "strategy"` over selection (or active set). |
| `outreach` | `action: "email"` over selection (or active set). |
| `export` | Download the active set as CSV. |
| `smalltalk` | Reply only. |

Refinement is **deterministic**: the model only produces a validated filter delta
(`parseAngieFilters`), and the client applies `applyRefinement` (filter → sort →
limit) over the fresh base set. The model never queries Firestore or invents
leads; replies never carry counts (the app fills real numbers).

Supported refinement filters: `industry, city, state, website, phone, minRating,
excludeChains, sort (score|rating|reviews), limit, includeOutOfMarket`.

## Grounding

- Out-of-market / suppressed leads stay excluded through every refinement unless
  the user explicitly opts in (`includeOutOfMarket`).
- Lead questions answer only from the named leads' stored facts; missing facts are
  reported as missing.

## Reset

"Start fresh" clears `sessionStorage` and creates a new session — no filters,
selection, or messages carry over.

## Export

`export` intent (or the download control) writes a CSV of the active set with the
sales column set (`web/src/lib/export-leads.ts`); phone/ZIP/batch id are forced to
text. XLSX + an export scope menu land in PR 3.

## Tests

`npm test` in `web`: `leads.test.ts` (matching, refinement, sort), 
`angie-session.test.ts` (merge/remove/reset/summary), `export-leads.test.ts`
(columns, CSV text-safety, filenames).
