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
import { matchServices, ServiceMatch } from "@/lib/service-match";
import { playbookForCategory, IndustryPlaybook } from "@/lib/industry-playbooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "gpt-5";

/** Only leads Vera approved are ever eligible for Angie. */
const SALES_READY_STAGE = "sales_ready";

type GroundedLead = {
  leadId: string;
  businessName: string;
  emailGreetingName: string;
  email: string;
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
      email: readString(data.email),
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

/**
 * Sales-useful facts for strategy — deliberately EXCLUDES internal qualification
 * and completeness scores. Those are for our own triage; they must never drive
 * or appear in prospect-facing strategy or outreach. Data gaps are expressed as
 * salesperson actions instead.
 */
function buildSalesFacts(leads: GroundedLead[]): string {
  return leads
    .map((lead) => {
      const parts = [`business: ${lead.businessName || "unknown"}`];
      if (lead.category) parts.push(`type: ${lead.category}`);
      if (lead.city || lead.state) {
        parts.push(`location: ${[lead.city, lead.state].filter(Boolean).join(", ")}`);
      }
      parts.push(`website: ${lead.website ? "on file" : "none on file"}`);
      parts.push(`phone: ${lead.phone ? "on file" : "none on file"}`);
      parts.push(`email: ${lead.email ? "on file" : "none on file"}`);
      if (lead.rating !== null) parts.push(`rating: ${lead.rating}`);
      if (lead.reviewCount !== null) parts.push(`reviews: ${lead.reviewCount}`);
      return `- ${parts.join(" | ")}`;
    })
    .join("\n");
}

/** Renders the deterministic service matches + playbook as grounded input. */
function buildStrategyInputs(
  matches: ServiceMatch[],
  playbook: IndustryPlaybook | null,
): string {
  const lines: string[] = [];
  if (matches.length) {
    lines.push("Ranked service matches (from our catalog, based on stored signals):");
    matches.forEach((m) => {
      lines.push(`- ${m.name}${m.reasons.length ? ` — ${m.reasons.join("; ")}` : ""}`);
    });
  }
  if (playbook) {
    lines.push(`\nIndustry playbook: ${playbook.label}`);
    lines.push(`- common goals: ${playbook.commonGoals.join(", ")}`);
    lines.push(`- high-value services: ${playbook.highValueServices.join(", ")}`);
    lines.push(`- organic content themes: ${playbook.organicContentThemes.join(", ")}`);
    lines.push(`- paid campaign ideas: ${playbook.paidCampaignIdeas.join(", ")}`);
    lines.push(`- lead-gen ideas: ${playbook.leadGenIdeas.join(", ")}`);
    lines.push(`- evidence needed before specifics: ${playbook.evidenceNeeded.join(", ")}`);
  }
  return lines.join("\n") || "(no catalog match — reason from the business type)";
}

/** Micah Amari service catalog + playbooks are the grounded strategy inputs. */
const STRATEGY_DEPTHS = ["quick", "full", "campaign", "thirty_day"] as const;
type StrategyDepth = (typeof STRATEGY_DEPTHS)[number];

function strategyDepth(value: string): StrategyDepth {
  return (STRATEGY_DEPTHS as readonly string[]).includes(value)
    ? (value as StrategyDepth)
    : "full";
}

/** Turns a focus modifier code into a one-line instruction. */
function strategyFocus(focus: string): string {
  switch (focus) {
    case "organic_social":
      return "Focus the plan on organic social media.";
    case "paid_ads":
      return "Focus the plan on paid advertising (paid social / Google Ads).";
    case "website":
      return "Focus the plan on website / landing pages / conversion.";
    case "creative":
      return "Make the campaign ideas more creative and memorable.";
    case "cheaper":
      return "Frame a lean, lower-cost starter offer.";
    case "pitch":
      return "Frame it as a short pitch a salesperson could deliver.";
    default:
      return focus ? `Emphasis: ${focus}.` : "";
  }
}

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
  "opportunity_strategy",
  "service_match",
  "channel_plan",
  "campaign_ideas",
  "follow_up_plan",
  "lead_comparison",
  "research_request",
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

{"intent": "...", "filters": { ... }, "reply": "...", "depth": "...", "focus": "...", "channel": "..."}

Intents:
- new_search   : a fresh set of leads (a new industry/place/criteria, or "start over")
- refine       : narrow, sort, or limit the CURRENT set (city/rating/sort/limit/no-website/no-chains/add-phone)
- lead_question: a question about a specific lead or why one ranks where it does
- strategy / opportunity_strategy : a marketing opportunity plan for the current or selected leads
- service_match : which Micah Amari services fit these leads
- channel_plan  : which marketing channels fit (organic social, paid ads, website, email…)
- campaign_ideas: specific campaign concepts
- follow_up_plan: follow-up / nurture messaging or a 30-day plan
- lead_comparison: compare two or more leads as opportunities
- research_request: what to research/verify before contacting
- outreach     : draft outreach (email or another channel) for the current/selected leads
- export       : download / export the list
- smalltalk    : greeting or unclear

For strategy-family intents, optionally set:
- "depth": "quick" | "full" | "campaign" | "thirty_day"  (thirty_day for "30-day plan")
- "focus": "organic_social" | "paid_ads" | "website" | "creative" | "cheaper" | "pitch"
For outreach, optionally set "channel": "email" | "linkedin" | "instagram" | "facebook" |
  "call_opener" | "voicemail" | "mailed_note" | "video_audit" | "proposal" | "campaign_teaser" | "follow_up"

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
  const depth = sanitizeGenerated(parsed.depth, 20);
  const focus = sanitizeGenerated(parsed.focus, 30);
  const channel = sanitizeGenerated(parsed.channel, 30);

  return NextResponse.json({ intent, filters, reply, depth, focus, channel });
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
    const depth = strategyDepth(readString(body.depth));
    const focus = readString(body.focus);
    const primary = leads[0];
    const playbook = playbookForCategory(primary.category);
    const matches = matchServices(
      {
        category: primary.category,
        website: primary.website,
        rating: primary.rating ?? undefined,
        reviewCount: primary.reviewCount ?? undefined,
        phone: primary.phone,
      },
      playbook,
    );
    const inputs = buildStrategyInputs(matches, playbook);

    const depthNote =
      depth === "quick"
        ? "QUICK TAKE: keep it brief — snapshot, top 1-2 service matches, one next step; other arrays may be short or empty."
        : depth === "thirty_day"
          ? "30-DAY PLAN: also fill thirtyDayPlan with 4 weekly entries (week, focus)."
          : depth === "campaign"
            ? "CAMPAIGN PLAN: go deeper on campaignIdeas (3-4), lighter elsewhere."
            : "FULL STRATEGY: fill every section.";

    const rawText = await generateText(`
You are Angie, a marketing strategist and sales assistant for Micah Amari.

${GROUNDING_RULES}
${VOICE_RULES}
${depthNote}
${strategyFocus(focus)}

Build a practical marketing OPPORTUNITY plan (not just a call recommendation).
Separate what is KNOWN from what is a PROPOSED idea from what NEEDS RESEARCH.
Never state an assumption as a fact. You have NOT reviewed their website, ads,
or social — so never diagnose those; frame them as worth reviewing. Do NOT
mention internal qualification or data-completeness scores; translate any data
gaps into salesperson actions (e.g. "confirm the best decision-maker").

Return ONE JSON object of this exact shape (no markdown fences):
{
  "opportunitySnapshot": "why this business may be worth pursuing (2-3 sentences)",
  "whatWeKnow": ["only grounded facts from the lead data below"],
  "serviceMatches": [{"name":"Micah Amari service","why":"why it may fit"}],
  "marketingOpportunities": ["practical areas worth exploring — organic social, paid ads, website, email, branding, content, reviews, referral"],
  "campaignIdeas": [{"name":"...","concept":"...","audience":"...","channel":"...","goal":"...","deliverables":["..."]}],
  "outreachApproach": {"channel":"phone|email|LinkedIn|Instagram|Facebook|mailed note|video audit|custom mockup","reasoning":"why that channel"},
  "conversationStarter": "a natural, low-pressure opener",
  "researchNext": ["what to verify before a stronger recommendation"],
  "nextStep": "one practical action for the salesperson",
  "thirtyDayPlan": [{"week":"Week 1","focus":"..."}]
}
Prefer the ranked service matches and playbook ideas below; explain why each fits.

Grounded strategy inputs:
${inputs}

Lead facts:
${buildSalesFacts(leads)}
`);

    return NextResponse.json({ action, strategy: parseStrategy(rawText, depth) });
  }

  if (action === "comparison") {
    const rawText = await generateText(`
You are Angie, a marketing strategist for Micah Amari.

${GROUNDING_RULES}
${VOICE_RULES}
Do not surface internal qualification/completeness scores.

Compare these leads as marketing opportunities. Return ONE JSON object
(no markdown fences):
{
  "rows": [{"name":"...","serviceFit":"...","likelyValue":"...","outreachDifficulty":"...","campaignPotential":"...","evidence":"what we'd still verify","priority":"high|medium|low"}],
  "recommendation": "which to prioritize and why (2-3 sentences)"
}

Lead facts:
${buildSalesFacts(leads)}
`);

    return NextResponse.json({ action, comparison: parseComparison(rawText) });
  }

  // Draft one message per selected lead, keyed by leadId so each draft can be
  // tied back to a real Firestore record. An optional modifier adjusts tone or
  // focus, and channel picks the format — without inventing new observations.
  const channel = channelInstruction(readString(body.channel));
  const rawText = await generateText(`
You are Angie, a sales assistant for Micah Amari.

${GROUNDING_RULES}
${VOICE_RULES}
${modifierInstruction(readString(body.modifier))}
${channel.instruction}

Draft one ${channel.label} for EACH lead below. Address the recipient by their
greeting name when given, otherwise the business name. Keep it short: warm,
concise, observant, low-pressure, human — not pushy, no long intro, no jargon.
When website quality is unknown, frame it as an invitation to review
opportunities, not a diagnosis. Never mention internal scores.

Return ONLY a JSON object of this exact shape, no markdown fences:

{"emails":[{"leadId":"...","subject":"...","previewText":"...","body":"...","cta":"...","toneLabel":"..."}]}

- subject: a subject line for email, otherwise a short label for the ${channel.label}
- previewText: a short preview line (under 90 chars)
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
/** Picks the outreach channel format. Defaults to a cold email. */
function channelInstruction(channel: string): { label: string; instruction: string } {
  switch (channel) {
    case "linkedin":
      return { label: "LinkedIn message", instruction: "Format: a brief LinkedIn connection message." };
    case "instagram":
      return { label: "Instagram DM", instruction: "Format: a casual, respectful Instagram DM." };
    case "facebook":
      return { label: "Facebook message", instruction: "Format: a friendly Facebook page message." };
    case "call_opener":
      return { label: "call opener", instruction: "Format: a 2-3 sentence phone opener a rep can say." };
    case "voicemail":
      return { label: "voicemail script", instruction: "Format: a short, natural voicemail script." };
    case "mailed_note":
      return { label: "mailed note", instruction: "Format: a short hand-written-style mailed note." };
    case "video_audit":
      return { label: "video-audit script", instruction: "Format: a short script for a friendly video audit (no fake findings — invite a look)." };
    case "proposal":
      return { label: "proposal introduction", instruction: "Format: a warm proposal intro paragraph." };
    case "campaign_teaser":
      return { label: "campaign teaser", instruction: "Format: a one-idea campaign teaser." };
    case "follow_up":
      return { label: "follow-up email", instruction: "Format: a light follow-up assuming a prior touch." };
    default:
      return { label: "outreach email", instruction: "" };
  }
}

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
  depth: string;
  opportunitySnapshot: string;
  whatWeKnow: string[];
  serviceMatches: Array<{ name: string; why: string }>;
  marketingOpportunities: string[];
  campaignIdeas: Array<{
    name: string;
    concept: string;
    audience: string;
    channel: string;
    goal: string;
    deliverables: string[];
  }>;
  outreachApproach: { channel: string; reasoning: string };
  conversationStarter: string;
  researchNext: string[];
  nextStep: string;
  thirtyDayPlan: Array<{ week: string; focus: string }>;
};

function extractJsonObject(rawText: string): { parsed: Record<string, unknown>; clean: string } {
  const clean = rawText.replace(/\`\`\`(?:json)?/gi, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return { parsed: JSON.parse(clean.slice(start, end + 1)), clean };
    } catch {
      return { parsed: {}, clean };
    }
  }
  return { parsed: {}, clean };
}

const strList = (value: unknown, max: number): string[] =>
  Array.isArray(value)
    ? value.map((v) => sanitizeGenerated(v, 240)).filter(Boolean).slice(0, max)
    : [];

/** Validates the model's strategy JSON into safe, bounded fields. */
function parseStrategy(rawText: string, depth: string): StrategyOutput {
  const { parsed, clean } = extractJsonObject(rawText);

  const serviceMatches = Array.isArray(parsed.serviceMatches)
    ? parsed.serviceMatches
        .map((m) => {
          const o = (m ?? {}) as Record<string, unknown>;
          return { name: sanitizeGenerated(o.name, 80), why: sanitizeGenerated(o.why, 240) };
        })
        .filter((m) => m.name)
        .slice(0, 5)
    : [];

  const campaignIdeas = Array.isArray(parsed.campaignIdeas)
    ? parsed.campaignIdeas
        .map((c) => {
          const o = (c ?? {}) as Record<string, unknown>;
          return {
            name: sanitizeGenerated(o.name, 90),
            concept: sanitizeGenerated(o.concept, 300),
            audience: sanitizeGenerated(o.audience, 160),
            channel: sanitizeGenerated(o.channel, 80),
            goal: sanitizeGenerated(o.goal, 160),
            deliverables: strList(o.deliverables, 5),
          };
        })
        .filter((c) => c.name)
        .slice(0, 4)
    : [];

  const outreach = (parsed.outreachApproach ?? {}) as Record<string, unknown>;
  const thirtyDayPlan = Array.isArray(parsed.thirtyDayPlan)
    ? parsed.thirtyDayPlan
        .map((w) => {
          const o = (w ?? {}) as Record<string, unknown>;
          return { week: sanitizeGenerated(o.week, 40), focus: sanitizeGenerated(o.focus, 240) };
        })
        .filter((w) => w.week || w.focus)
        .slice(0, 6)
    : [];

  const result: StrategyOutput = {
    depth,
    opportunitySnapshot: sanitizeGenerated(parsed.opportunitySnapshot, 600),
    whatWeKnow: strList(parsed.whatWeKnow, 6),
    serviceMatches,
    marketingOpportunities: strList(parsed.marketingOpportunities, 8),
    campaignIdeas,
    outreachApproach: {
      channel: sanitizeGenerated(outreach.channel, 40),
      reasoning: sanitizeGenerated(outreach.reasoning, 300),
    },
    conversationStarter: sanitizeGenerated(parsed.conversationStarter, 400),
    researchNext: strList(parsed.researchNext, 6),
    nextStep: sanitizeGenerated(parsed.nextStep, 300),
    thirtyDayPlan,
  };

  // Fallback: if the model returned prose instead of JSON, never render empty.
  if (!result.opportunitySnapshot && !result.serviceMatches.length && !result.marketingOpportunities.length) {
    result.opportunitySnapshot = sanitizeGenerated(clean || rawText, 900);
  }

  return result;
}

type ComparisonOutput = {
  rows: Array<{
    name: string;
    serviceFit: string;
    likelyValue: string;
    outreachDifficulty: string;
    campaignPotential: string;
    evidence: string;
    priority: string;
  }>;
  recommendation: string;
};

function parseComparison(rawText: string): ComparisonOutput {
  const { parsed } = extractJsonObject(rawText);
  const rows = Array.isArray(parsed.rows)
    ? parsed.rows
        .map((r) => {
          const o = (r ?? {}) as Record<string, unknown>;
          return {
            name: sanitizeGenerated(o.name, 80),
            serviceFit: sanitizeGenerated(o.serviceFit, 160),
            likelyValue: sanitizeGenerated(o.likelyValue, 120),
            outreachDifficulty: sanitizeGenerated(o.outreachDifficulty, 120),
            campaignPotential: sanitizeGenerated(o.campaignPotential, 160),
            evidence: sanitizeGenerated(o.evidence, 200),
            priority: sanitizeGenerated(o.priority, 20),
          };
        })
        .filter((r) => r.name)
        .slice(0, 6)
    : [];
  return { rows, recommendation: sanitizeGenerated(parsed.recommendation, 500) };
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

    if (
      action === "call_list" ||
      action === "email" ||
      action === "strategy" ||
      action === "comparison"
    ) {
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
