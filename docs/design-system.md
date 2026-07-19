# Angie OS — design system (v1)

Shared visual language for the Micah Amari internal tools. New screens compose
these tokens and primitives rather than restyling from scratch.

## Tokens

Defined in `web/src/app/globals.css` under `@theme inline`, so each becomes a
Tailwind utility (`bg-canvas`, `text-ink`, `border-line`, `bg-accent`, …).

| Group | Tokens |
|---|---|
| Surfaces | `canvas`, `surface`, `subtle`, `sunk` |
| Text | `ink`, `muted`, `faint` |
| Lines | `line`, `line-strong` |
| Accent (warm clay) | `accent`, `accent-strong`, `accent-soft` |
| Shell (sidebar) | `shell`, `shell-line` |
| Status | `positive`, `caution`, `critical` (+ `-soft` variants) |

Palette is warm-neutral and editorial — "surfer meets southern belle," still a
serious tool. Brand fonts (Geist) now actually apply (previously overridden to
Arial in `globals.css`).

## Primitives (`web/src/components/ui.tsx`)

`Button` (primary / secondary / ghost / danger, `sm`/`md`, `busy`), `Card`,
`QualificationBadge`, `Chip` (optionally removable), `TextInput`, `EmptyState`,
`Spinner`. All carry visible focus rings and adequate touch targets.

## Lead data + voice

- `web/src/lib/leads.ts` — the shared `Lead` type, display helpers (name, phone,
  website, location), qualification helpers (reason/warning text, band tone), and
  the deterministic `matchesFilters` used by search, refinement, and export.
  Pure and unit-tested (`leads.test.ts`, run with `npm test` in `web`).
- `web/src/lib/brand.ts` — Micah Amari microcopy (button labels, empty/loading
  lines) so voice stays consistent.

## Result presentation (`web/src/components/lead-card.tsx`)

Each lead reads as: name · category · location, qualification badge + score,
contact row, "Why Angie likes this lead," watch-outs, a recommended next move,
and actions (select, copy contact, map, email). No raw JSON or DB language.

## Not yet in this version

Conversational refinement, active-filter removal, and export land in the next
two PRs; the strategy/outreach output redesign lands with export.
