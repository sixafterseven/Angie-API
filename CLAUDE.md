# CLAUDE.md

## Project

**Angie OS** is Micah Amari's internal lead-processing and sales-assistance application.

The immediate MVP is intentionally narrow:

1. An employee signs in.
2. An employee uploads an XLSX lead spreadsheet.
3. Firebase processes the upload automatically.
4. A cleaned workbook is created.
5. Sales-ready leads are written to Firestore.
6. Employees can browse those leads.
7. Employees can ask Angie to find leads, build call lists, draft outreach, and suggest simple sales strategy.

Do not redesign the product or broaden the scope unless explicitly asked.

## Repository

GitHub: `sixafterseven/Angie-API`

Main branch: `main`

Frontend root: `web`

Firebase Functions root: `functions`

Always work on a feature branch unless explicitly told otherwise. Do not push directly to `main`.

## Current Stack

Frontend:
- Next.js
- App Router
- TypeScript
- Tailwind CSS
- Firebase Web SDK
- Firebase Authentication
- Firebase App Hosting
- Lucide React

Backend:
- Firebase Cloud Functions, 2nd generation
- TypeScript
- Firestore
- Firebase Storage
- ExcelJS
- OpenAI API

Deployment:
- GitHub-connected Firebase App Hosting
- App Hosting live branch: `main`
- App root: `web`
- Firebase project: `micah-amari-angie-os`

## Current Working MVP

These pieces already work and must not be broken:

- Google sign-in
- Next.js routes
- Firebase App Hosting
- XLSX upload from the dashboard
- Firebase Storage upload
- Firestore batch creation
- Clara intake stage
- Calvin cleaning stage
- Vera validation stage
- Cleaned workbook generation
- Cleaned workbook upload to Firebase Storage
- Sales-ready leads written to Firestore
- Live batches page
- Live leads page
- Ask Angie API route
- Ask Angie lead search
- OpenAI API integration

## Current Routes

- `/` redirects to `/login`
- `/login`
- `/dashboard`
- `/upload`
- `/batches`
- `/leads`
- `/ask-angie`
- `/api/ask-angie`

## Canonical Firestore Collections

Do not rename these:

- `batches`
- `jobs`
- `leads`
- `agentRuns`
- `batchSummaries`
- `users`
- `activities`
- `reports`

Legacy test collections may still exist:
- `agent_runs`
- `batch_summaries`
- `job`

Do not build new features against legacy collection names.

## Storage Structure

- `raw/{batchId}/{originalFilename}`
- `cleaned/{batchId}/{cleanedWorkbookFilename}`

Do not move existing files without a migration plan.

## Processing Pipeline

Employee uploads XLSX
→ Firebase Storage
→ `registerRawUpload`
→ Clara intake job
→ `processClaraIntakeJob`
→ Calvin cleaning job
→ `processCalvinCleaningJob`
→ cleaned workbook in Storage
→ Vera validation job
→ `processVeraValidationJob`
→ sales-ready leads in Firestore
→ Angie

## Worker Responsibilities

### Clara
- Register uploaded files.
- Validate required metadata.
- Create the Calvin job.
- Never modify the original upload.

### Calvin
- Open XLSX files from Firebase Storage.
- Preserve original source data.
- Normalize common fields.
- Remove blank rows.
- Identify exact duplicates.
- Add system metadata.
- Create a cleaned workbook.
- Upload the cleaned workbook.
- Create the Vera job.

Expected cleaned workbook tabs:
- README
- Batch Manifest
- Raw Combined
- Cleaned Leads
- Duplicate Review
- Needs Review
- Processing Log

### Vera
- Read Calvin's cleaned workbook.
- Validate usable leads.
- Publish approved leads to Firestore.
- Mark incomplete leads for review.
- Suppress only clearly unusable records.
- Mark the batch `sales_ready`.

### Angie
- Search sales-ready leads.
- Return grounded lead lists.
- Apply plain-language filters.
- Build call lists.
- Draft simple outreach.
- Suggest basic sales strategy.
- Never invent leads.
- Never claim data exists when it does not.
- Base answers on Firestore lead data.

## Completed Batch State

A completed batch should include:

- `currentStage: sales_ready`
- `currentOwner: Angie`
- `status: complete`

## Canonical Lead Shape

Historical documents may be incomplete, so use safe fallbacks.

Preferred fields:

- `leadId`
- `batchId`
- `businessName`
- `emailGreetingName`
- `phone`
- `website`
- `email`
- `address`
- `street`
- `city`
- `state`
- `postalCode`
- `category`
- `industry`
- `rating`
- `reviewCount`
- `placeId`
- `googleId`
- `cid`
- `googleMapsUrl`
- `validationStatus`
- `pipelineStage`
- `currentOwner`
- `priority`
- `reviewReasons`
- `sourceFilePath`
- `sourceRowNumber`
- `createdAt`
- `updatedAt`

Common fallbacks:
- business name: `businessName`, `companyName`, `name`
- industry: `industry`, `category`

## Ask Angie

API route: `web/src/app/api/ask-angie/route.ts`

Page: `web/src/app/ask-angie/page.tsx`

Current behavior:
1. User enters a plain-language lead request.
2. OpenAI converts it into structured JSON filters.
3. Firestore leads are loaded.
4. Matching leads are displayed.

Current filter concepts:
- `industry`
- `city`
- `state`
- `website`
- `phone`
- `limit`

Do not allow the model to generate arbitrary Firestore queries.

Treat OpenAI output as untrusted input. Validate and normalize all returned filters.

## Immediate Product Priority

Build the shortest path to daily usefulness.

Next improvements:
1. Improve Ask Angie so employees can search, apply limits, select leads, build a call list, draft outreach, and create a basic sales strategy.
2. Keep all generated output grounded in selected Firestore leads.
3. Fix any remaining black-screen, auth-loading, or stale-rollout issues.

Do not build campaign management, proposals, advanced CRM features, or new departments yet.

## Non-Goals

Do not add unless explicitly requested:
- New frameworks
- Database replacements
- Separate CRM platform
- Deep enrichment system
- Campaign automation
- Proposal builder
- Email sending
- Social media automation
- Complex agent orchestration
- Multi-tenant architecture
- Fancy analytics
- Companies/contacts migration
- New collection naming scheme
- Broad redesign
- Large UI rewrite
- New backend language
- Vector database
- RAG system
- Background research agents
- New microservices

## Security

Never commit:
- `.env`
- `.env.local`
- service-account JSON files
- OpenAI API keys
- Firebase Admin private keys
- download tokens
- access tokens

The OpenAI key is `OPENAI_API_KEY` and must remain server-side. Never prefix it with `NEXT_PUBLIC_`.

Do not weaken production rules without explicit approval.

## Coding Rules

- Use TypeScript.
- Keep the existing architecture.
- Prefer complete working changes over broad refactors.
- Do not rename routes, collections, functions, or fields unless required.
- Preserve current behavior unless explicitly changing it.
- Use defensive null handling.
- Do not assume every Firestore document has the same fields.
- Validate OpenAI output.
- Keep user-facing errors readable.
- Avoid giant abstractions.
- Avoid unnecessary dependencies.
- Avoid premature optimization.
- Avoid broad style changes.
- Reuse existing Firebase initialization.
- Never expose server secrets to the browser.

## UI Direction

Keep the current visual direction:
- Dark left sidebar
- White content cards
- Slate color system
- Rounded corners
- Simple internal-tool layout
- Clear spacing
- Minimal animation
- Practical before pretty

Do not redesign the brand unless explicitly asked.

## Required Checks Before Commit

Frontend:

```bash
cd web
npm run build
```

Functions:

```bash
cd functions
npm run lint
npm run build
```

Do not commit code that fails the relevant build.

## Git Workflow

1. Pull latest `main`.
2. Create a feature branch.
3. Make the smallest complete change.
4. Run the relevant build.
5. Commit with a clear message.
6. Push the branch.
7. Open a pull request.
8. Include what changed, files changed, test results, and known limitations.

Do not force-push unless explicitly approved. Do not commit generated workbooks.

## First Task for Claude

Read this file before changing anything.

Then:
1. Inspect the repository.
2. Confirm the current build succeeds.
3. Create a feature branch.
4. Improve Ask Angie so employees can search leads, select leads, build a call list, draft a simple outreach email, and create a simple sales strategy.
5. Keep all generated content grounded in selected Firestore leads.
6. Validate all OpenAI output.
7. Run `npm run build` in `web`.
8. Submit a pull request with a concise summary and test results.

Keep the implementation narrow, production-conscious, and immediately useful.
