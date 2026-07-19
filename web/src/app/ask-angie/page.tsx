"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { RotateCcw, Send } from "lucide-react";

import AppShell from "@/components/app-shell";
import { LeadCard } from "@/components/lead-card";
import { ChatBubble, ThinkingBubble } from "@/components/chat";
import { Button, Chip, TextInput } from "@/components/ui";
import { auth, db } from "@/lib/firebase";
import {
  AngieFilters,
  MAX_ACTION_LEADS,
  MAX_EMAIL_LEADS,
} from "@/lib/angie-filters";
import { COPY } from "@/lib/brand";
import {
  Lead,
  applyRefinement,
  formatPhone,
  getBusinessName,
  getLocationLabel,
  getWebsiteHref,
} from "@/lib/leads";
import {
  AngieIntent,
  ChatMessage,
  SessionState,
  clearPersisted,
  createSession,
  filterChips,
  loadPersisted,
  makeMessage,
  mergeFilters,
  nowMs,
  removeFilter,
  savePersisted,
  summarizeFilters,
} from "@/lib/angie-session";
import { downloadCsv } from "@/lib/export-leads";

type DraftedEmail = {
  leadId: string;
  businessName: string;
  subject: string;
  body: string;
};

async function callAngie(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("Your session expired. Sign in again.");
  }
  const token = await currentUser.getIdToken();
  const response = await fetch("/api/ask-angie", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : COPY.genericError;
    throw new Error(message);
  }
  return (payload ?? {}) as Record<string, unknown>;
}

/**
 * Pure state transform for a search/refine (module-level so it never runs
 * during render). Timestamps are passed in from the calling event handler.
 */
function computeSearch(
  baseLeads: Lead[],
  state: SessionState,
  filters: AngieFilters,
  now: number,
  intent: "new_search" | "refine",
): SessionState {
  const refined = applyRefinement(baseLeads, filters);
  return {
    ...state,
    activeFilters: filters,
    activeSort: filters.sort,
    activeSearchSummary: summarizeFilters(filters),
    activeLeadIds: refined.map((lead) => lead.id),
    lastIntent: intent,
    updatedAt: now,
  };
}

function contactBlock(lead: Lead): string {
  return [
    getBusinessName(lead),
    formatPhone(lead.phone),
    lead.email || "",
    lead.website ? getWebsiteHref(lead.website) : "",
    getLocationLabel(lead),
  ]
    .filter(Boolean)
    .join("\n");
}

const STARTERS = [
  "Orthodontists in Atlanta",
  "Medical spas with strong reviews",
  "Chiropractors without a website",
];

export default function AskAngiePage() {
  const [baseLeads, setBaseLeads] = useState<Lead[]>([]);
  const [baseLoaded, setBaseLoaded] = useState(false);
  const [baseError, setBaseError] = useState("");

  const [session, setSession] = useState<SessionState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => {
    const map = new Map<string, Lead>();
    baseLeads.forEach((lead) => map.set(lead.id, lead));
    return map;
  }, [baseLeads]);

  const selectedSet = useMemo(
    () => new Set(session?.selectedLeadIds ?? []),
    [session?.selectedLeadIds],
  );

  // Load the full sales-ready set once, and restore any persisted conversation.
  // All setState happens inside the async task so nothing runs synchronously in
  // the effect body.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const persisted = loadPersisted();
      if (!cancelled) {
        if (persisted) {
          setSession(persisted.state);
          setMessages(persisted.messages);
        } else {
          setSession(createSession(auth.currentUser?.uid ?? "anon"));
        }
      }

      try {
        const snapshot = await getDocs(
          query(collection(db, "leads"), where("pipelineStage", "==", "sales_ready")),
        );
        if (!cancelled) {
          setBaseLeads(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Lead[]);
        }
      } catch {
        if (!cancelled) {
          setBaseError("Angie couldn't reach your leads. Refresh and try again.");
        }
      } finally {
        if (!cancelled) {
          setBaseLoaded(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Persist + autoscroll whenever the transcript or state changes.
  useEffect(() => {
    if (session) {
      savePersisted(session, messages);
    }
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [session, messages]);

  function pushMessage(message: ChatMessage) {
    setMessages((current) => [...current, message]);
  }

  function activeLeads(state: SessionState): Lead[] {
    return state.activeLeadIds.map((id) => byId.get(id)).filter(Boolean) as Lead[];
  }

  /** Leads an action should run on: the selection if any, else the active set. */
  function actionLeadIds(state: SessionState, cap: number): string[] {
    const ids = state.selectedLeadIds.length
      ? state.selectedLeadIds
      : state.activeLeadIds;
    return ids.slice(0, cap);
  }

  function toggleLead(leadId: string) {
    if (!session) return;
    const has = session.selectedLeadIds.includes(leadId);
    setSession({
      ...session,
      selectedLeadIds: has
        ? session.selectedLeadIds.filter((id) => id !== leadId)
        : [...session.selectedLeadIds, leadId],
      updatedAt: nowMs(),
    });
  }

  async function copyContact(lead: Lead) {
    try {
      await navigator.clipboard.writeText(contactBlock(lead));
      setCopiedId(lead.id);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  function resultsMessage(state: SessionState, note: string): ChatMessage {
    const count = state.activeLeadIds.length;
    const text = count
      ? `${note} ${count} lead${count === 1 ? "" : "s"} — ${state.activeSearchSummary}.`
      : COPY.emptyResults;
    return makeMessage("angie", text, "results", { leadIds: state.activeLeadIds });
  }

  function startFresh() {
    clearPersisted();
    const fresh = createSession(auth.currentUser?.uid ?? "anon");
    setSession(fresh);
    setMessages([]);
    setInput("");
  }

  function removeChip(key: keyof AngieFilters) {
    if (!session) return;
    const filters = removeFilter(session.activeFilters, key);
    const next = computeSearch(baseLeads, session, filters, nowMs(), "refine");
    setSession(next);
    pushMessage(resultsMessage(next, "Dropped that filter —"));
  }

  async function send(raw: string) {
    const message = raw.trim();
    if (!message || thinking || !session) {
      return;
    }

    setInput("");
    pushMessage(makeMessage("user", message));
    setThinking(true);

    const state = session;
    const hasResults = state.activeLeadIds.length > 0;

    try {
      const { intent, filters, reply } = (await callAngie({
        action: "converse",
        message,
        context: {
          hasResults,
          activeSummary: state.activeSearchSummary || "none yet",
          selectedCount: state.selectedLeadIds.length,
          resultCount: state.activeLeadIds.length,
        },
      })) as {
        intent: AngieIntent;
        filters: AngieFilters;
        reply: string;
      };

      if (reply) {
        pushMessage(makeMessage("angie", reply));
      }

      if (intent === "new_search") {
        const next = computeSearch(baseLeads, state, filters ?? {}, nowMs(), "new_search");
        setSession(next);
        pushMessage(resultsMessage(next, "Here's what I found —"));
      } else if (intent === "refine") {
        if (!hasResults) {
          const next = computeSearch(baseLeads, state, filters ?? {}, nowMs(), "new_search");
          setSession(next);
          pushMessage(resultsMessage(next, "Here's what I found —"));
        } else {
          const merged = mergeFilters(state.activeFilters, filters ?? {});
          const next = computeSearch(baseLeads, state, merged, nowMs(), "refine");
          setSession(next);
          pushMessage(resultsMessage(next, "Refined —"));
        }
      } else if (intent === "lead_question") {
        const ids = actionLeadIds(state, MAX_ACTION_LEADS);
        if (!ids.length) {
          pushMessage(
            makeMessage("angie", "Pull up some leads first and I'll dig in."),
          );
        } else {
          const { answer } = (await callAngie({
            action: "answer",
            message,
            leadIds: ids,
          })) as { answer: string };
          pushMessage(makeMessage("angie", answer || "I don't have that detail on file."));
        }
      } else if (intent === "strategy") {
        const ids = actionLeadIds(state, MAX_ACTION_LEADS);
        if (!ids.length) {
          pushMessage(makeMessage("angie", "Give me a list first and I'll build a plan."));
        } else {
          const { strategy } = (await callAngie({
            action: "strategy",
            leadIds: ids,
          })) as { strategy: string };
          pushMessage(makeMessage("angie", "Here's the game plan.", "strategy", { strategy }));
          setSession((c) => (c ? { ...c, lastGeneratedStrategy: strategy } : c));
        }
      } else if (intent === "outreach") {
        const ids = actionLeadIds(state, MAX_EMAIL_LEADS);
        if (!ids.length) {
          pushMessage(makeMessage("angie", "Point me at some leads and I'll draft outreach."));
        } else {
          const { emails } = (await callAngie({
            action: "email",
            leadIds: ids,
          })) as { emails: DraftedEmail[] };
          pushMessage(
            makeMessage("angie", "Drafted these — tweak away.", "email", { emails: emails ?? [] }),
          );
          setSession((c) => (c ? { ...c, lastGeneratedOutreach: emails } : c));
        }
      } else if (intent === "export") {
        const leads = activeLeads(state);
        if (!leads.length) {
          pushMessage(makeMessage("angie", "Nothing to export yet — search first."));
        } else {
          downloadCsv(leads, state.activeSearchSummary);
          pushMessage(
            makeMessage(
              "angie",
              `Downloading ${leads.length} lead${leads.length === 1 ? "" : "s"} as CSV.`,
            ),
          );
        }
      }
      // smalltalk: the reply above is enough.
    } catch (caughtError) {
      pushMessage(
        makeMessage(
          "angie",
          caughtError instanceof Error ? caughtError.message : COPY.genericError,
        ),
      );
    } finally {
      setThinking(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(input);
  }

  const chips = session ? filterChips(session.activeFilters) : [];

  return (
    <AppShell title="Ask Angie" description="Chat your way to the right leads.">
      {/* Active-filter bar */}
      {chips.length ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-faint">
            Active
          </span>
          {chips.map((chip) => (
            <Chip
              key={chip.key}
              onRemove={() => removeChip(chip.key)}
              removeLabel={`Remove ${chip.label}`}
            >
              {chip.label}
            </Chip>
          ))}
          <button
            type="button"
            onClick={startFresh}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-muted transition hover:text-accent"
          >
            <RotateCcw size={13} />
            {COPY.newConversation}
          </button>
        </div>
      ) : (
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={startFresh}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-muted transition hover:text-accent"
          >
            <RotateCcw size={13} />
            {COPY.newConversation}
          </button>
        </div>
      )}

      {/* Transcript */}
      <div className="space-y-5">
        {messages.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface p-6">
            <p className="text-sm text-ink">
              Hey — I&rsquo;m Angie. Tell me what kind of leads you&rsquo;re after and
              I&rsquo;ll pull them up. Then we can refine, build a call list, draft
              outreach, or map out a plan — just keep talking.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {STARTERS.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => void send(starter)}
                  disabled={!baseLoaded}
                  className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent hover:bg-accent-soft hover:text-accent-strong disabled:opacity-50"
                >
                  {starter}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((message) => (
          <ChatBubble key={message.id} role={message.role}>
            <MessageBody
              message={message}
              byId={byId}
              selectedSet={selectedSet}
              copiedId={copiedId}
              onToggle={toggleLead}
              onCopy={copyContact}
            />
          </ChatBubble>
        ))}

        {thinking ? <ThinkingBubble /> : null}
        {baseError ? (
          <p className="text-sm text-critical">{baseError}</p>
        ) : null}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <form
        onSubmit={handleSubmit}
        className="sticky bottom-0 mt-6 flex items-center gap-2 border-t border-line bg-canvas/90 py-4 backdrop-blur"
      >
        <TextInput
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={
            session?.activeLeadIds.length
              ? "Refine, ask, or say \"draft outreach for the top 3\"…"
              : COPY.askPlaceholder
          }
          aria-label="Message Angie"
          disabled={!baseLoaded}
        />
        <Button type="submit" busy={thinking} disabled={thinking || !input.trim()}>
          <Send size={16} />
          <span className="hidden sm:inline">Send</span>
        </Button>
      </form>
    </AppShell>
  );
}

/* ----------------------------------------------------- message rendering */

function MessageBody({
  message,
  byId,
  selectedSet,
  copiedId,
  onToggle,
  onCopy,
}: {
  message: ChatMessage;
  byId: Map<string, Lead>;
  selectedSet: Set<string>;
  copiedId: string | null;
  onToggle: (id: string) => void;
  onCopy: (lead: Lead) => void;
}) {
  if (message.kind === "results") {
    const ids = (message.data as { leadIds: string[] })?.leadIds ?? [];
    const leads = ids.map((id) => byId.get(id)).filter(Boolean) as Lead[];
    return (
      <div>
        <p>{message.text}</p>
        {leads.length ? (
          <div className="mt-3 space-y-3">
            {leads.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                selected={selectedSet.has(lead.id)}
                onToggle={() => onToggle(lead.id)}
                onCopyContact={() => onCopy(lead)}
                copied={copiedId === lead.id}
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  if (message.kind === "strategy") {
    const strategy = (message.data as { strategy: string })?.strategy ?? "";
    return (
      <div>
        <p>{message.text}</p>
        <div className="mt-3 rounded-2xl border border-line bg-surface p-4">
          <p className="whitespace-pre-wrap text-sm leading-6 text-muted">{strategy}</p>
        </div>
      </div>
    );
  }

  if (message.kind === "email") {
    const emails = (message.data as { emails: DraftedEmail[] })?.emails ?? [];
    return (
      <div>
        <p>{message.text}</p>
        <div className="mt-3 space-y-3">
          {emails.map((email) => (
            <div key={email.leadId} className="rounded-2xl border border-line bg-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-faint">
                {email.businessName || "Unnamed business"}
              </p>
              <p className="mt-1.5 font-semibold text-ink">{email.subject}</p>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-muted">
                {email.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return <p className="whitespace-pre-wrap">{message.text}</p>;
}
