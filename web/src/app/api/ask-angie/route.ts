import OpenAI from "openai";
import { NextResponse } from "next/server";

import { AuthError, getAdminDb, requireUser } from "@/lib/firebase-admin";
import {
  AngieAction,
  MAX_ACTION_LEADS,
  MAX_EMAIL_LEADS,
  MAX_QUESTION_LENGTH,
  parseAngieFilters,
  sanitizeLeadIds,
} from "@/lib/angie-filters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "gpt-5";

/** Only leads Vera approved are ever eligible for Angie. */
const SALES_READY_STAGE = "sales_ready";

type GroundedLead = {
  leadId: string;
  businessName: string;
  emailGreetingName: string;
  phone: string;
  website: string;
  city: string;
  state: string;
  category: string;
  rating: number | null;
  reviewCount: number | null;
  qualificationBand: string;
  overallQualificationScore: number | null;
  recommendedNextAction: string;
  qualificationReasons: string[];
};

let client: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not configured.");
    }

    client = new OpenAI({ apiKey });
  }

  return client;
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Loads the selected leads from Firestore.
 *
 * The browser only ever sends lead IDs. The facts handed to the model come
 * from Firestore, never from the request body, so a tampered client cannot
 * ground generated output in invented businesses.
 */
async function loadSalesReadyLeads(leadIds: string[]): Promise<GroundedLead[]> {
  const db = getAdminDb();

  const refs = leadIds.map((leadId) => db.collection("leads").doc(leadId));

  const snapshots = await db.getAll(...refs);

  const leads: GroundedLead[] = [];

  for (const snapshot of snapshots) {
    if (!snapshot.exists) {
      continue;
    }

    const data = snapshot.data() ?? {};

    if (data.pipelineStage !== SALES_READY_STAGE) {
      continue;
    }

    leads.push({
      leadId: snapshot.id,
      businessName:
        readString(data.businessName) ||
        readString(data.companyName) ||
        readString(data.name),
      emailGreetingName: readString(data.emailGreetingName),
      phone: readString(data.phone),
      website: readString(data.website),
      city: readString(data.city),
      state: readString(data.state),
      category: readString(data.category) || readString(data.industry),
      rating: readNumber(data.rating),
      reviewCount: readNumber(data.reviewCount),
      qualificationBand: readString(data.qualificationBand),
      overallQualificationScore: readNumber(data.overallQualificationScore),
      recommendedNextAction: readString(data.recommendedNextAction),
      qualificationReasons: readReasonTexts(data.qualificationReasons),
    });
  }

  return leads;
}

/**
 * Pulls the human-readable reason strings out of a lead's qualificationReasons
 * array (each entry is {code, text, points}). Bounded so the facts stay compact.
 */
function readReasonTexts(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) =>
      entry && typeof entry === "object" && "text" in entry
        ? readString((entry as { text: unknown }).text)
        : "",
    )
    .filter(Boolean)
    .slice(0, 3);
}

/**
 * Renders the only facts the model is allowed to use.
 */
function buildLeadFacts(leads: GroundedLead[]): string {
  return leads
    .map((lead) => {
      const parts = [
        `leadId: ${lead.leadId}`,
        `business: ${lead.businessName || "unknown"}`,
      ];

      if (lead.emailGreetingName) {
        parts.push(`greeting name: ${lead.emailGreetingName}`);
      }

      if (lead.category) {
        parts.push(`category: ${lead.category}`);
      }

      if (lead.city || lead.state) {
        parts.push(`location: ${[lead.city, lead.state].filter(Boolean).join(", ")}`);
      }

      if (lead.phone) {
        parts.push(`phone: ${lead.phone}`);
      }

      if (lead.website) {
        parts.push(`website: ${lead.website}`);
      }

      if (lead.rating !== null) {
        parts.push(`rating: ${lead.rating}`);
      }

      if (lead.reviewCount !== null) {
        parts.push(`reviews: ${lead.reviewCount}`);
      }

      if (lead.qualificationBand) {
        const score =
          lead.overallQualificationScore !== null
            ? ` ${lead.overallQualificationScore}/100`
            : "";
        parts.push(`qualification: ${lead.qualificationBand}${score}`);
      }

      if (lead.recommendedNextAction) {
        parts.push(`recommended action: ${lead.recommendedNextAction}`);
      }

      if (lead.qualificationReasons.length) {
        parts.push(`why: ${lead.qualificationReasons.join("; ")}`);
      }

      return `- ${parts.join(" | ")}`;
    })
    .join("\n");
}

const GROUNDING_RULES = [
  "Use ONLY the lead facts provided below.",
  "Never invent a business, phone number, website, rating, or location.",
  "If a fact is missing, say it is missing rather than guessing.",
].join("\n");

/** Shared Micah Amari voice, reused by strategy + outreach generation. */
const VOICE_RULES = [
  "Voice: relaxed, smart, warm, lightly witty, confident but never corporate.",
  "Ban this language entirely: elevate your brand, amplify your presence, unlock",
  "your potential, strategic solutions, take it to the next level, dominate your",
  "market, bring your vision to life, and any generic agency/consulting phrasing.",
  "No fake compliments. Do not claim Angie inspected a website or anything else",
  "she has not — website quality has NOT been researched, so never diagnose a",
  "website problem. When only lead-database facts are available, use careful",
  'language: "worth reviewing", "may be an opportunity", "could be stronger",',
  '"would benefit from a closer look". Keep any humor light and occasional.',
].join("\n");

async function generateText(prompt: string): Promise<string> {
  const response = await getOpenAI().responses.create({
    model: MODEL,
    input: prompt,
  });

  return response.output_text ?? "";
}

/** Model prose is untrusted: enforce a string and a hard length cap. */
function sanitizeGenerated(value: unknown, maxLength: number): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

async function handleSearch(body: Record<string, unknown>) {
  const question = readString(body.question);

  if (!question) {
    return badRequest("Ask Angie a question first.");
  }

  if (question.length > MAX_QUESTION_LENGTH) {
    return badRequest(
      `Keep your request under ${MAX_QUESTION_LENGTH} characters.`,
    );
  }

  const rawText = await generateText(`
You are Angie, a sales lead assistant.

Convert the user's request into a JSON object of search filters.

Return ONLY JSON. No commentary, no markdown fences.

Allowed fields (omit any field the user did not ask for):

industry           string  - the kind of business, e.g. "dentist"
city               string  - a city name, e.g. "atlanta"
state              string  - a two-letter US state code, e.g. "ga"
website            boolean - true means has a website, false means has none
phone              boolean - true means has a phone, false means has none
limit              number  - how many leads the user asked for, 1 to 100
includeOutOfMarket boolean - true ONLY when the user explicitly wants leads
                             outside the target market (out-of-market /
                             suppressed). Out-of-market leads are hidden by
                             default, so omit this field otherwise.

Examples:

User: Show me dentists in Atlanta
{"industry":"dentist","city":"atlanta"}

User: Businesses without websites
{"website":false}

User: Give me 20 leads in Georgia
{"state":"ga","limit":20}

User: Include out-of-market leads too
{"includeOutOfMarket":true}

User request:

${question}
`);

  return NextResponse.json({ filters: parseAngieFilters(rawText) });
}

const CONVERSE_INTENTS = [
  "new_search",
  "refine",
  "lead_question",
  "strategy",
  "outreach",
  "export",
  "smalltalk",
] as const;

type ConverseIntent = (typeof CONVERSE_INTENTS)[number];

/**
 * The conversational brain: classifies one user turn into an intent plus, for
 * search/refine, a validated filter delta, plus a short reply in Angie's voice.
 *
 * The reply is friendly wrapping only — the app fills real counts and renders
 * real leads, so a hallucinated number in the reply can never reach the result
 * list. Filters are validated by parseAngieFilters, so the model cannot emit an
 * arbitrary query.
 */
async function handleConverse(body: Record<string, unknown>) {
  const message = readString(body.message);

  if (!message) {
    return badRequest("Type a message for Angie first.");
  }

  if (message.length > MAX_QUESTION_LENGTH) {
    return badRequest(`Keep it under ${MAX_QUESTION_LENGTH} characters.`);
  }

  const context = (body.context ?? {}) as Record<string, unknown>;
  const hasResults = Boolean(context.hasResults);
  const activeSummary = readString(context.activeSummary) || "none yet";
  const selectedCount = readNumber(context.selectedCount) ?? 0;
  const resultCount = readNumber(context.resultCount) ?? 0;

  const rawText = await generateText(`
You are Angie, a warm, sharp sales assistant for Micah Amari. Classify the
user's latest message into one intent and return ONLY JSON (no markdown fences):

{"intent": "...", "filters": { ... }, "reply": "..."}

Intents:
- new_search   : the user wants a fresh set of leads (a new industry/place/criteria, or "start over")
- refine       : narrow, sort, or limit the CURRENT set (city/rating/sort/limit/no-website/no-chains/add-phone)
- lead_question: a question about a specific lead or why one ranks where it does
- strategy     : wants a sales strategy / game plan for the current or selected leads
- outreach     : wants outreach emails drafted for the current or selected leads
- export       : wants to download / export the list
- smalltalk    : greeting or unclear

For new_search and refine, put any of these validated filter fields in "filters"
(omit the rest). For refine, include ONLY the fields that change:
  industry(string) city(string) state(2-letter) website(bool) phone(bool)
  minRating(number 0-5) excludeChains(bool) sort("score"|"rating"|"reviews")
  limit(number 1-100) includeOutOfMarket(bool)
For other intents use "filters": {}.

"reply": one or two sentences in Angie's voice. Do NOT state counts, numbers, or
specific business facts — the app fills those in. Keep it warm and brief.

Current context:
- active result set: ${activeSummary}
- results on screen: ${resultCount}
- selected leads: ${selectedCount}
- has an active result set: ${hasResults ? "yes" : "no"}

User message:
${message}
`);

  const withoutFences = rawText.replace(/\`\`\`(?:json)?/gi, "").trim();
  const start = withoutFences.indexOf("{");
  const end = withoutFences.lastIndexOf("}");

  let parsed: Record<string, unknown> = {};
  if (start >= 0 && end > start) {
    try {
      parsed = JSON.parse(withoutFences.slice(start, end + 1));
    } catch {
      parsed = {};
    }
  }

  const rawIntent = readString(parsed.intent) as ConverseIntent;
  const intent: ConverseIntent = CONVERSE_INTENTS.includes(rawIntent)
    ? rawIntent
    : "smalltalk";

  const filters = parseAngieFilters(JSON.stringify(parsed.filters ?? {}));
  const reply = sanitizeGenerated(parsed.reply, 400);

  return NextResponse.json({ intent, filters, reply });
}

/**
 * Answers a grounded question about specific leads. Facts come only from the
 * Firestore documents named by leadIds, so Angie cannot invent details.
 */
async function handleAnswer(body: Record<string, unknown>) {
  const message = readString(body.message);

  if (!message) {
    return badRequest("Ask a question first.");
  }

  const leadIds = sanitizeLeadIds(body.leadIds, MAX_ACTION_LEADS);

  if (!leadIds.length) {
    return badRequest("Angie needs at least one lead in view to answer that.");
  }

  const leads = await loadSalesReadyLeads(leadIds);

  if (!leads.length) {
    return badRequest("Those leads are no longer available.");
  }

  const answer = await generateText(`
You are Angie, a sales assistant for Micah Amari.

${GROUNDING_RULES}
If the answer is not in the facts, say you do not have that detail.

Answer the user's question in at most 90 words, plain and specific. No markdown
headings.

Question:
${message}

Lead facts:
${buildLeadFacts(leads)}
`);

  return NextResponse.json({ answer: sanitizeGenerated(answer, 1200) });
}

async function handleAction(action: AngieAction, body: Record<string, unknown>) {
  const maxLeads = action === "email" ? MAX_EMAIL_LEADS : MAX_ACTION_LEADS;

  const leadIds = sanitizeLeadIds(body.leadIds, maxLeads);

  if (!leadIds.length) {
    return badRequest("Select at least one lead first.");
  }

  const leads = await loadSalesReadyLeads(leadIds);

  if (!leads.length) {
    return badRequest("None of the selected leads are sales-ready.");
  }

  const facts = buildLeadFacts(leads);

  if (action === "call_list") {
    // The list itself is built from Firestore, not by the model, so every
    // phone number on it is real. The model only contributes guidance.
    const ordered = [...leads].sort((first, second) => {
      const ratingGap = (second.rating ?? 0) - (first.rating ?? 0);

      if (ratingGap !== 0) {
        return ratingGap;
      }

      const reviewGap = (second.reviewCount ?? 0) - (first.reviewCount ?? 0);

      if (reviewGap !== 0) {
        return reviewGap;
      }

      return first.businessName.localeCompare(second.businessName);
    });

    const guidance = await generateText(`
You are Angie, a sales assistant for Micah Amari.

${GROUNDING_RULES}

Write a short call-list briefing for a salesperson, at most 120 words.
Cover: what these businesses have in common, who to call first and why, and
one opening line that would work across the list.
Plain text. No markdown headings.

Lead facts:
${facts}
`);

    return NextResponse.json({
      action,
      leads: ordered,
      guidance: sanitizeGenerated(guidance, 2000),
    });
  }

  if (action === "strategy") {
    const rawText = await generateText(`
You are Angie, a sales assistant for Micah Amari.

${GROUNDING_RULES}
${VOICE_RULES}

Write a practical sales playbook for this set of leads as ONE JSON object of
this exact shape (no markdown fences):

{
  "opportunitySnapshot": "2-3 sentences: what stands out about these leads",
  "fixFirst": ["3-5 short, concrete priorities"],
  "whyItMatters": "2-3 sentences in plain English tied to these businesses",
  "recommendedOffer": "the most relevant Micah Amari service/package, 1-2 sentences",
  "conversationStarter": "one natural opening line a salesperson could use",
  "watchOuts": ["1-3 things uncertain, missing, or worth verifying"],
  "nextStep": "one concrete next action"
}

Ground every claim in the facts. Keep it specific, not generic.

Lead facts:
${facts}
`);

    return NextResponse.json({ action, strategy: parseStrategy(rawText) });
  }

  // Draft one email per selected lead, keyed by leadId so each draft can be
  // tied back to a real Firestore record. An optional modifier adjusts tone or
  // focus without inventing new observations.
  const rawText = await generateText(`
You are Angie, a sales assistant for Micah Amari.

${GROUNDING_RULES}
${VOICE_RULES}
${modifierInstruction(readString(body.modifier))}

Draft one short outreach email for EACH lead below. Address the recipient by
their greeting name when given, otherwise the business name. Keep each body
under 120 words: warm, concise, observant, low-pressure, human — not pushy, no
long intro, no jargon. When website quality is unknown, frame it as an
invitation to review opportunities, not a diagnosis.

Return ONLY a JSON object of this exact shape, no markdown fences:

{"emails":[{"leadId":"...","subject":"...","previewText":"...","body":"...","cta":"...","toneLabel":"..."}]}

- previewText: a short inbox preview line (under 90 chars)
- cta: the low-pressure next step
- toneLabel: 1-3 words describing the tone (e.g. "Warm & direct")
Use the leadId values exactly as given. Include every lead exactly once.

Lead facts:
${facts}
`);

  const emails = parseEmails(rawText, leads);

  if (!emails.length) {
    return NextResponse.json(
      { error: "Angie could not draft usable emails. Try again." },
      { status: 502 },
    );
  }

  return NextResponse.json({ action, emails });
}

/** Turns a tone/focus modifier code into a one-line instruction. */
function modifierInstruction(modifier: string): string {
  switch (modifier) {
    case "warmer":
      return "Adjustment: make it noticeably warmer and friendlier.";
    case "shorter":
      return "Adjustment: make it shorter — trim to the essentials.";
    case "direct":
      return "Adjustment: make it more direct and to the point.";
    case "focus_website":
      return "Adjustment: center it on the website/online experience — as an invitation to review, never a diagnosis.";
    case "focus_branding":
      return "Adjustment: center it on branding and presentation.";
    case "focus_reviews":
      return "Adjustment: center it on their reviews and reputation.";
    default:
      return "";
  }
}

type StrategyOutput = {
  opportunitySnapshot: string;
  fixFirst: string[];
  whyItMatters: string;
  recommendedOffer: string;
  conversationStarter: string;
  watchOuts: string[];
  nextStep: string;
};

/** Validates the model's strategy JSON into safe, bounded fields. */
function parseStrategy(rawText: string): StrategyOutput {
  const withoutFences = rawText.replace(/\`\`\`(?:json)?/gi, "").trim();
  const start = withoutFences.indexOf("{");
  const end = withoutFences.lastIndexOf("}");

  let parsed: Record<string, unknown> = {};
  if (start >= 0 && end > start) {
    try {
      parsed = JSON.parse(withoutFences.slice(start, end + 1));
    } catch {
      parsed = {};
    }
  }

  const list = (value: unknown, max: number): string[] =>
    Array.isArray(value)
      ? value
          .map((v) => sanitizeGenerated(v, 240))
          .filter(Boolean)
          .slice(0, max)
      : [];

  const result: StrategyOutput = {
    opportunitySnapshot: sanitizeGenerated(parsed.opportunitySnapshot, 600),
    fixFirst: list(parsed.fixFirst, 5),
    whyItMatters: sanitizeGenerated(parsed.whyItMatters, 600),
    recommendedOffer: sanitizeGenerated(parsed.recommendedOffer, 400),
    conversationStarter: sanitizeGenerated(parsed.conversationStarter, 400),
    watchOuts: list(parsed.watchOuts, 3),
    nextStep: sanitizeGenerated(parsed.nextStep, 300),
  };

  // Fallback: if the model returned prose instead of JSON, don't render an empty
  // card — surface the cleaned text as the snapshot so there is always content.
  const empty =
    !result.opportunitySnapshot &&
    !result.fixFirst.length &&
    !result.whyItMatters &&
    !result.recommendedOffer &&
    !result.conversationStarter &&
    !result.watchOuts.length &&
    !result.nextStep;
  if (empty) {
    result.opportunitySnapshot = sanitizeGenerated(withoutFences || rawText, 900);
  }

  return result;
}

type DraftedEmail = {
  leadId: string;
  businessName: string;
  subject: string;
  previewText: string;
  body: string;
  cta: string;
  toneLabel: string;
};

/**
 * Validates the model's email JSON.
 *
 * A draft is kept only when its leadId matches a lead we actually loaded from
 * Firestore, which prevents the model from inventing a recipient.
 */
function parseEmails(rawText: string, leads: GroundedLead[]): DraftedEmail[] {
  const withoutFences = rawText.replace(/```(?:json)?/gi, "").trim();

  const start = withoutFences.indexOf("{");
  const end = withoutFences.lastIndexOf("}");

  if (start < 0 || end <= start) {
    return [];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(withoutFences.slice(start, end + 1));
  } catch {
    return [];
  }

  if (!parsed || typeof parsed !== "object") {
    return [];
  }

  const entries = (parsed as Record<string, unknown>).emails;

  if (!Array.isArray(entries)) {
    return [];
  }

  const leadsById = new Map(leads.map((lead) => [lead.leadId, lead]));

  const drafts: DraftedEmail[] = [];
  const used = new Set<string>();

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const candidate = entry as Record<string, unknown>;

    const leadId = readString(candidate.leadId);

    const lead = leadsById.get(leadId);

    // Silently drop any draft addressed to a lead we did not send.
    if (!lead || used.has(leadId)) {
      continue;
    }

    const subject = sanitizeGenerated(candidate.subject, 200);
    const body = sanitizeGenerated(candidate.body, 2000);

    if (!subject || !body) {
      continue;
    }

    used.add(leadId);

    drafts.push({
      leadId,
      businessName: lead.businessName,
      subject,
      previewText: sanitizeGenerated(candidate.previewText, 160),
      body,
      cta: sanitizeGenerated(candidate.cta, 200),
      toneLabel: sanitizeGenerated(candidate.toneLabel, 40) || "Warm & direct",
    });
  }

  return drafts;
}

export async function POST(request: Request) {
  try {
    await requireUser(request);

    const body: unknown = await request.json().catch(() => null);

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return badRequest("Angie could not read that request.");
    }

    const payload = body as Record<string, unknown>;

    const action = readString(payload.action);

    if (!action || action === "search") {
      return await handleSearch(payload);
    }

    if (action === "converse") {
      return await handleConverse(payload);
    }

    if (action === "answer") {
      return await handleAnswer(payload);
    }

    if (action === "call_list" || action === "email" || action === "strategy") {
      return await handleAction(action, payload);
    }

    return badRequest("Angie does not support that action.");
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    console.error("Ask Angie request failed:", error);

    return NextResponse.json(
      { error: "Angie could not complete that request. Try again." },
      { status: 500 },
    );
  }
}
