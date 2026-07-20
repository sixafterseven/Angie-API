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

  // Persist on any session/transcript change...
  useEffect(() => {
    if (session) savePersisted(session, messages);
  }, [session, messages]);

  // ...but only autoscroll when a new message arrives or Angie starts thinking —
  // NOT when the session changes for other reasons (e.g. selecting a lead).
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, thinking]);

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

  function toggleAll() {
    if (!session) return;
    const allSelected =
      activeLeads.length > 0 && activeLeads.every((lead) => selectedSet.has(lead.id));
    setSession({
      ...session,
      selectedLeadIds: allSelected ? [] : activeLeads.map((lead) => lead.id),
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

  const allSelected =
    activeLeads.length > 0 && activeLeads.every((lead) => selectedSet.has(lead.id));

  // Until Angie has pulled leads, keep it a single, focused conversation so it's
  // obvious where to talk. Once there are results, split into results + chat.
  const twoPane = hasActive;

  return (
    <AppShell
      title="Ask Angie"
      description={
        twoPane
          ? "Your leads are on the left — keep talking to refine or work them."
          : "Tell Angie what you're looking for."
      }
    >
      <div
        className={
          twoPane
            ? "lg:grid lg:grid-cols-[minmax(320px,380px)_1fr] lg:items-start lg:gap-6"
            : ""
        }
      >
        {/* LEFT — results panel (only once there are results) */}
        {twoPane ? (
        <aside className="mb-6 lg:mb-0 lg:sticky lg:top-6 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold text-ink">Results</h2>
              <p className="text-sm text-muted">
                {hasActive
                  ? `${activeLeads.length} lead${activeLeads.length === 1 ? "" : "s"}${
                      selectedLeads.length ? ` · ${selectedLeads.length} selected` : ""
                    }`
                  : "No results yet"}
              </p>
            </div>
            {hasActive ? (
              <Button type="button" variant="ghost" size="sm" onClick={toggleAll}>
                {allSelected ? "Clear" : "Select all"}
              </Button>
            ) : null}
          </div>

          {chips.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {chips.map((chip) => (
                <Chip key={chip.key} onRemove={() => removeChip(chip.key)} removeLabel={`Remove ${chip.label}`}>
                  {chip.label}
                </Chip>
              ))}
            </div>
          ) : null}

          {hasActive ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <ExportMenu current={activeLeads} selected={selectedLeads} summary={session?.activeSearchSummary ?? ""} />
              <Button type="button" variant="secondary" size="sm" onClick={() => setSaveOpen(true)}>
                <Save size={14} />
                Save
              </Button>
            </div>
          ) : null}

          <div className="mt-4 space-y-3">
            {activeLeads.length ? (
              activeLeads.map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  selected={selectedSet.has(lead.id)}
                  onToggle={() => toggleLead(lead.id)}
                  onCopyContact={() => void copyContact(lead)}
                  copied={copiedId === lead.id}
                  onStrategy={(id) => cardAction(id, "strategy")}
                  onOutreach={(id) => cardAction(id, "outreach")}
                />
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-line-strong bg-surface p-6 text-center">
                <p className="text-sm text-muted">
                  Ask Angie for leads and they&rsquo;ll show up here — pick the ones you want, then
                  export, save, or work them.
                </p>
              </div>
            )}
          </div>
        </aside>
        ) : null}

        {/* RIGHT — conversation (centered on its own until results appear) */}
        <div className={twoPane ? "flex min-w-0 flex-col" : "mx-auto flex min-w-0 max-w-2xl flex-col"}>
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={startFresh}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-muted transition hover:text-accent"
            >
              <RotateCcw size={13} />
              {COPY.newConversation}
            </button>
          </div>

          <div className="mt-2 space-y-5">
            {messages.length === 0 ? (
              <div className="rounded-2xl border border-line bg-surface p-6">
                <p className="text-sm text-ink">
                  Hey — I&rsquo;m Angie. Type what kind of leads you&rsquo;re after in the box below
                  and I&rsquo;ll pull them up. From there we can refine, build a call list, draft
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
                  regenBusy={regenBusy}
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
        </div>
      </div>

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
  regenBusy,
  onRegenerate,
}: {
  message: ChatMessage;
  regenBusy: string[];
  onRegenerate: (messageId: string, leadId: string, modifier: OutreachModifier) => void;
}) {
  // Result cards live in the left results panel now; in the chat, a results turn
  // is just Angie's narration ("Here's what I found — 12 leads…").
  if (message.kind === "results") {
    return <p className="whitespace-pre-wrap">{message.text}</p>;
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
