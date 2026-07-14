# CLAUDE.md

## Scope

These instructions apply to the `web/` Next.js application.

Read the repository-root `CLAUDE.md` first.

Do not redesign the application or replace the existing stack.

## Frontend Stack

- Next.js
- App Router
- TypeScript
- Tailwind CSS
- Firebase Web SDK
- Firebase Authentication
- Firestore
- Firebase Storage
- Firebase App Hosting
- Lucide React
- OpenAI API through server routes only

## Existing Structure

Important files and routes:

- `src/app/login/page.tsx`
- `src/app/dashboard/page.tsx`
- `src/app/upload/page.tsx`
- `src/app/batches/page.tsx`
- `src/app/leads/page.tsx`
- `src/app/ask-angie/page.tsx`
- `src/app/api/ask-angie/route.ts`
- `src/components/app-shell.tsx`
- `src/lib/firebase.ts`

Keep these routes and components unless a change is explicitly required.

## Current User Flow

Login
→ Upload XLSX
→ Firebase pipeline runs
→ View batches
→ Browse leads
→ Ask Angie

Do not add steps unless explicitly asked.

## UI Rules

Keep the existing visual direction:
- Dark left sidebar
- White content cards
- Slate palette
- Rounded corners
- Simple internal-tool layout
- Clear spacing
- Minimal animation
- Functional before decorative

Do not redesign the sidebar, navigation, or page structure unless explicitly requested.

Do not introduce a new component library.

Use existing Tailwind patterns.

## Authentication

Use the existing Firebase Authentication setup.

Protected pages should:
- wait for auth state to resolve
- redirect signed-out users to `/login`
- avoid infinite loading screens
- show a readable error if auth resolution fails

Do not expose secrets in client components.

## Firebase Usage

Use the existing exports from `src/lib/firebase.ts`.

Do not initialize Firebase again in page components.

Use safe Firestore fallbacks because historical lead documents may not share identical fields.

Business-name fallbacks:
- `businessName`
- `companyName`
- `name`

Industry fallbacks:
- `industry`
- `category`

## Ask Angie Rules

The OpenAI key must remain server-side.

Use `OPENAI_API_KEY`.

Never use `NEXT_PUBLIC_OPENAI_API_KEY`.

API route: `src/app/api/ask-angie/route.ts`

Client page: `src/app/ask-angie/page.tsx`

Treat all OpenAI responses as untrusted.

Validate filter fields and values.

Do not allow arbitrary Firestore query generation.

All generated call lists, outreach, and strategy must be grounded in selected or returned Firestore leads.

Never invent companies, contacts, phone numbers, websites, ratings, or locations.

## Immediate Frontend Task

Improve Ask Angie without broadening the product.

Add:
1. Lead selection in search results.
2. Select all / clear selection.
3. Actions:
   - Build Call List
   - Draft Email
   - Create Strategy
4. Generated output shown on the page.
5. Output grounded only in selected Firestore leads.
6. Clear loading and error states.

Do not build campaigns, proposals, email sending, or a full CRM.

## Coding Rules

- Use TypeScript.
- Prefer complete working files over scattered snippets.
- Keep components reasonably small.
- Use defensive null handling.
- Keep user-facing errors readable.
- Avoid unnecessary dependencies.
- Avoid broad refactors.
- Avoid changing working routes.
- Avoid rewriting the app shell.
- Avoid adding global state unless necessary.
- Do not fetch OpenAI directly from the browser.
- Use server routes for OpenAI calls.

## Required Check

Before committing frontend changes:

```bash
npm run build
```

Do not commit if the build fails.

## Git

Work on a feature branch.

Suggested branch:

```text
feature/ask-angie-actions
```

Commit only the files needed for the task.

Open a pull request with:
- summary
- changed files
- build result
- manual test result
- known limitations
