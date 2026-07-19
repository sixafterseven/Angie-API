"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { RotateCcw, Save, Send } from "lucide-react";

import AppShell from "@/components/app-shell";
import { LeadCard } from "@/components/lead-card";
import { ChatBubble, ThinkingBubble } from "@/components/chat";
import { StrategyCard, Strategy } from "@/components/strategy-card";
import {
  OutreachCard,
  DraftedEmail,
  OutreachModifier,
} from "@/components/outreach-card";
import { ExportMenu } from "@/components/export-menu";
import { SaveListModal } from "@/components/save-list-modal";
import { Button, Chip, TextInput } from "@/components/ui";
import { useToast } from "@/components/toast";
import { auth, db } from "@/lib/firebase";
import { AngieFilters, MAX_ACTION_LEADS, MAX_EMAIL_LEADS } from "@/lib/angie-filters";
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
  sessionFromList,
  summarizeFilters,
  takeOpenList,
} from "@/lib/angie-session";

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

/** Pure state transform for a search/refine (module-level → render-pure). */
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

const STARTERS = [
  "Orthodontists in Atlanta",
  "Medical spas with strong reviews",
  "Chiropractors without a website",
];

export default function AskAngiePage() {
  const { notify } = useToast();

  const [baseLeads, setBaseLeads] = useState<Lead[]>([]);
  const [baseLoaded, setBaseLoaded] = useState(false);
  const [baseError, setBaseError] = useState("");

  const [session, setSession] = useState<SessionState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [regenBusy, setRegenBusy] = useState<string[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);

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
      const openList = takeOpenList();
      const persisted = loadPersisted();
      if (!cancelled) {
        const uid = auth.currentUser?.uid ?? "anon";
        if (openList) {
          const restored = sessionFromList(uid, openList);
          setSession(restored);
          setMessages([
            makeMessage(
              "angie",
              `Reopened “${openList.name}” — ${openList.leadIds.length} lead${
                openList.leadIds.length === 1 ? "" : "s"
              }. Refine away, or ask me to work them.`,
              "results",
              { leadIds: openList.leadIds },
            ),
          ]);
        } else if (persisted) {
          setSession(persisted.state);
          setMessages(persisted.messages);
        } else {
          setSession(createSession(uid));
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
        if (!cancelled) setBaseError("Angie couldn't reach your leads. Refresh and try again.");
      } finally {
        if (!cancelled) setBaseLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (session) savePersisted(session, messages);
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [session, messages]);

  function pushMessage(message: ChatMessage) {
    setMessages((current) => [...current, message]);
  }

  const activeLeads = useMemo(
    () => (session?.activeLeadIds ?? []).map((id) => byId.get(id)).filter(Boolean) as Lead[],
    [session?.activeLeadIds, byId],
  );
  const selectedLeads = useMemo(
    () => (session?.selectedLeadIds ?? []).map((id) => byId.get(id)).filter(Boolean) as Lead[],
    [session?.selectedLeadIds, byId],
  );

  function actionLeadIds(state: SessionState, cap: number): string[] {
    const ids = state.selectedLeadIds.length ? state.selectedLeadIds : state.activeLeadIds;
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
      notify("Contact copied");
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      /* clipboard blocked */
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
    setSession(createSession(auth.currentUser?.uid ?? "anon"));
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

  async function runStrategy(ids: string[]) {
    const { strategy } = (await callAngie({ action: "strategy", leadIds: ids })) as {
      strategy: Strategy;
    };
    pushMessage(makeMessage("angie", "Here's the game plan.", "strategy", { strategy }));
    setSession((c) => (c ? { ...c, lastGeneratedStrategy: JSON.stringify(strategy) } : c));
  }

  async function runOutreach(ids: string[]) {
    const { emails } = (await callAngie({ action: "email", leadIds: ids })) as {
      emails: DraftedEmail[];
    };
    pushMessage(
      makeMessage("angie", "Drafted these — edit or fine-tune the tone.", "email", {
        emails: emails ?? [],
      }),
    );
    setSession((c) => (c ? { ...c, lastGeneratedOutreach: emails } : c));
  }

  /** Per-card action: run strategy/outreach for a single lead. */
  async function cardAction(leadId: string, kind: "strategy" | "outreach") {
    if (thinking) return;
    setThinking(true);
    try {
      if (kind === "strategy") await runStrategy([leadId]);
      else await runOutreach([leadId]);
    } catch (caughtError) {
      pushMessage(makeMessage("angie", caughtError instanceof Error ? caughtError.message : COPY.genericError));
    } finally {
      setThinking(false);
    }
  }

  /** Regenerate a single email in-place with a tone/focus modifier. */
  async function regenerateEmail(messageId: string, leadId: string, modifier: OutreachModifier) {
    if (regenBusy.includes(leadId)) return;
    setRegenBusy((b) => [...b, leadId]);
    try {
      const { emails } = (await callAngie({
        action: "email",
        leadIds: [leadId],
        modifier: modifier === "regenerate" ? "" : modifier,
      })) as { emails: DraftedEmail[] };
      const fresh = emails?.[0];
      if (fresh) {
        setMessages((current) =>
          current.map((message) => {
            if (message.id !== messageId || message.kind !== "email") return message;
            const data = message.data as { emails: DraftedEmail[] };
            return {
              ...message,
              data: {
                emails: data.emails.map((e) => (e.leadId === leadId ? fresh : e)),
              },
            };
          }),
        );
        notify("Draft updated");
      }
    } catch (caughtError) {
      notify(caughtError instanceof Error ? caughtError.message : COPY.genericError, "info");
    } finally {
      setRegenBusy((b) => b.filter((id) => id !== leadId));
    }
  }

  async function send(raw: string) {
    const message = raw.trim();
    if (!message || thinking || !session) return;

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
      })) as { intent: AngieIntent; filters: AngieFilters; reply: string };

      if (reply) pushMessage(makeMessage("angie", reply));

      if (intent === "new_search" || (intent === "refine" && !hasResults)) {
        const next = computeSearch(baseLeads, state, filters ?? {}, nowMs(), "new_search");
        setSession(next);
        pushMessage(resultsMessage(next, "Here's what I found —"));
      } else if (intent === "refine") {
        const merged = mergeFilters(state.activeFilters, filters ?? {});
        const next = computeSearch(baseLeads, state, merged, nowMs(), "refine");
        setSession(next);
        pushMessage(resultsMessage(next, "Refined —"));
      } else if (intent === "lead_question") {
        const ids = actionLeadIds(state, MAX_ACTION_LEADS);
        if (!ids.length) {
          pushMessage(makeMessage("angie", "Pull up some leads first and I'll dig in."));
        } else {
          const { answer } = (await callAngie({ action: "answer", message, leadIds: ids })) as {
            answer: string;
          };
          pushMessage(makeMessage("angie", answer || "I don't have that detail on file."));
        }
      } else if (intent === "strategy") {
        const ids = actionLeadIds(state, MAX_ACTION_LEADS);
        if (!ids.length) pushMessage(makeMessage("angie", "Give me a list first and I'll build a plan."));
        else await runStrategy(ids);
      } else if (intent === "outreach") {
        const ids = actionLeadIds(state, MAX_EMAIL_LEADS);
        if (!ids.length) pushMessage(makeMessage("angie", "Point me at some leads and I'll draft outreach."));
        else await runOutreach(ids);
      } else if (intent === "export") {
        if (!activeLeads.length) pushMessage(makeMessage("angie", "Nothing to export yet — search first."));
        else pushMessage(makeMessage("angie", "Use “Download this list” above to grab a CSV or Excel file."));
      }
    } catch (caughtError) {
      pushMessage(makeMessage("angie", caughtError instanceof Error ? caughtError.message : COPY.genericError));
    } finally {
      setThinking(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(input);
  }

  const chips = session ? filterChips(session.activeFilters) : [];
  const hasActive = (session?.activeLeadIds.length ?? 0) > 0;

  return (
    <AppShell title="Ask Angie" description="Chat your way to the right leads.">
      {/* Context bar: filters, export, save, reset */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {chips.length ? (
          <>
            <span className="text-xs font-semibold uppercase tracking-wide text-faint">Active</span>
            {chips.map((chip) => (
              <Chip key={chip.key} onRemove={() => removeChip(chip.key)} removeLabel={`Remove ${chip.label}`}>
                {chip.label}
              </Chip>
            ))}
          </>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          {hasActive ? (
            <>
              <ExportMenu current={activeLeads} selected={selectedLeads} summary={session?.activeSearchSummary ?? ""} />
              <Button type="button" variant="secondary" size="sm" onClick={() => setSaveOpen(true)}>
                <Save size={14} />
                Save this list
              </Button>
            </>
          ) : null}
          <button
            type="button"
            onClick={startFresh}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-muted transition hover:text-accent"
          >
            <RotateCcw size={13} />
            {COPY.newConversation}
          </button>
        </div>
      </div>

      {/* Transcript */}
      <div className="space-y-5">
        {messages.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface p-6">
            <p className="text-sm text-ink">
              Hey — I&rsquo;m Angie. Tell me what kind of leads you&rsquo;re after and I&rsquo;ll pull
              them up. Then we can refine, build a call list, draft outreach, or map out a plan — just
              keep talking.
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
              regenBusy={regenBusy}
              onToggle={toggleLead}
              onCopy={copyContact}
              onCardAction={cardAction}
              onRegenerate={regenerateEmail}
            />
          </ChatBubble>
        ))}

        {thinking ? <ThinkingBubble /> : null}
        {baseError ? <p className="text-sm text-critical">{baseError}</p> : null}
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
          placeholder={hasActive ? "Refine, ask, or say “draft outreach for the top 3”…" : COPY.askPlaceholder}
          aria-label="Message Angie"
          disabled={!baseLoaded}
        />
        <Button type="submit" busy={thinking} disabled={thinking || !input.trim()}>
          <Send size={16} />
          <span className="hidden sm:inline">Send</span>
        </Button>
      </form>

      {session ? (
        <SaveListModal
          open={saveOpen}
          onClose={() => setSaveOpen(false)}
          defaultName={session.activeSearchSummary || "New list"}
          currentLeadIds={session.activeLeadIds}
          selectedLeadIds={session.selectedLeadIds}
          searchSummary={session.activeSearchSummary}
          filters={session.activeFilters}
          sort={session.activeSort}
        />
      ) : null}
    </AppShell>
  );
}

/* ----------------------------------------------------- message rendering */

function MessageBody({
  message,
  byId,
  selectedSet,
  copiedId,
  regenBusy,
  onToggle,
  onCopy,
  onCardAction,
  onRegenerate,
}: {
  message: ChatMessage;
  byId: Map<string, Lead>;
  selectedSet: Set<string>;
  copiedId: string | null;
  regenBusy: string[];
  onToggle: (id: string) => void;
  onCopy: (lead: Lead) => void;
  onCardAction: (leadId: string, kind: "strategy" | "outreach") => void;
  onRegenerate: (messageId: string, leadId: string, modifier: OutreachModifier) => void;
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
                onStrategy={(id) => onCardAction(id, "strategy")}
                onOutreach={(id) => onCardAction(id, "outreach")}
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  if (message.kind === "strategy") {
    const strategy = (message.data as { strategy: Strategy })?.strategy;
    return (
      <div>
        <p>{message.text}</p>
        {strategy ? (
          <div className="mt-3">
            <StrategyCard strategy={strategy} />
          </div>
        ) : null}
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
            <OutreachCard
              key={email.leadId}
              email={email}
              busy={regenBusy.includes(email.leadId)}
              onRegenerate={(leadId, modifier) => onRegenerate(message.id, leadId, modifier)}
            />
          ))}
        </div>
      </div>
    );
  }

  return <p className="whitespace-pre-wrap">{message.text}</p>;
}
