"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { Search, Sparkles } from "lucide-react";

import AppShell from "@/components/app-shell";
import { LeadCard } from "@/components/lead-card";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  TextInput,
} from "@/components/ui";
import { auth, db } from "@/lib/firebase";
import {
  AngieAction,
  AngieFilters,
  MAX_ACTION_LEADS,
  MAX_EMAIL_LEADS,
  resolveLimit,
} from "@/lib/angie-filters";
import { COPY, loadingLine } from "@/lib/brand";
import {
  Lead,
  formatPhone,
  getBusinessName,
  getLocationLabel,
  getWebsiteHref,
  matchesFilters,
} from "@/lib/leads";

type CallListLead = {
  leadId: string;
  businessName: string;
  phone: string;
  city: string;
  state: string;
  category: string;
};

type DraftedEmail = {
  leadId: string;
  businessName: string;
  subject: string;
  body: string;
};

type AngieOutput =
  | { kind: "call_list"; leads: CallListLead[]; guidance: string }
  | { kind: "email"; emails: DraftedEmail[] }
  | { kind: "strategy"; strategy: string };

/** Calls the Angie API with the signed-in user's Firebase ID token. */
async function callAngie(body: Record<string, unknown>): Promise<unknown> {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error("Your session expired. Sign in again.");
  }

  const token = await currentUser.getIdToken();

  const response = await fetch("/api/ask-angie", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
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

  return payload;
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

const examples = [
  "Orthodontists in Atlanta",
  "Medical spas with strong reviews",
  "Chiropractors without a website",
  "Give me 20 leads in Georgia",
];

const actionLabels: Record<AngieAction, string> = {
  call_list: COPY.buildCallList,
  email: COPY.writeEmail,
  strategy: COPY.buildStrategy,
};

export default function AskAngiePage() {
  const [question, setQuestion] = useState("");
  const [results, setResults] = useState<Lead[]>([]);
  const [filters, setFilters] = useState<AngieFilters | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState("");

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [runningAction, setRunningAction] = useState<AngieAction | null>(null);
  const [actionError, setActionError] = useState("");
  const [output, setOutput] = useState<AngieOutput | null>(null);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (output || actionError) {
      outputRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [output, actionError]);

  const allSelected =
    results.length > 0 && results.every((lead) => selectedSet.has(lead.id));

  function resetActions() {
    setSelectedIds([]);
    setOutput(null);
    setActionError("");
  }

  function toggleLead(leadId: string) {
    setSelectedIds((current) =>
      current.includes(leadId)
        ? current.filter((id) => id !== leadId)
        : [...current, leadId],
    );
  }

  function toggleAll() {
    setSelectedIds(allSelected ? [] : results.map((lead) => lead.id));
  }

  async function copyContact(lead: Lead) {
    try {
      await navigator.clipboard.writeText(contactBlock(lead));
      setCopiedId(lead.id);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // Clipboard can be blocked; fail quietly rather than throwing.
    }
  }

  async function askAngie(submittedQuestion: string) {
    const trimmedQuestion = submittedQuestion.trim();

    if (!trimmedQuestion) {
      return;
    }

    setQuestion(trimmedQuestion);
    setLoading(true);
    setHasSearched(true);
    setError("");
    setResults([]);
    resetActions();

    try {
      const payload = (await callAngie({ question: trimmedQuestion })) as {
        filters?: AngieFilters;
      };

      const parsedFilters = payload.filters ?? {};
      setFilters(parsedFilters);

      const snapshot = await getDocs(
        query(collection(db, "leads"), where("pipelineStage", "==", "sales_ready")),
      );

      const allLeads = snapshot.docs.map((leadDocument) => ({
        id: leadDocument.id,
        ...leadDocument.data(),
      })) as Lead[];

      const matchingLeads = allLeads.filter((lead) =>
        matchesFilters(lead, parsedFilters),
      );

      setResults(matchingLeads.slice(0, resolveLimit(parsedFilters)));
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : COPY.genericError,
      );
    } finally {
      setLoading(false);
    }
  }

  async function runAction(action: AngieAction) {
    if (!selectedIds.length || runningAction) {
      return;
    }

    setRunningAction(action);
    setActionError("");
    setOutput(null);

    try {
      const payload = (await callAngie({
        action,
        leadIds: selectedIds,
      })) as Record<string, unknown>;

      if (action === "call_list") {
        setOutput({
          kind: "call_list",
          leads: (payload.leads as CallListLead[]) ?? [],
          guidance: String(payload.guidance ?? ""),
        });
      } else if (action === "email") {
        setOutput({ kind: "email", emails: (payload.emails as DraftedEmail[]) ?? [] });
      } else {
        setOutput({ kind: "strategy", strategy: String(payload.strategy ?? "") });
      }
    } catch (caughtError) {
      setActionError(
        caughtError instanceof Error ? caughtError.message : COPY.genericError,
      );
    } finally {
      setRunningAction(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void askAngie(question);
  }

  const selectionCount = selectedIds.length;
  const overEmailLimit = selectionCount > MAX_EMAIL_LEADS;
  const overActionLimit = selectionCount > MAX_ACTION_LEADS;
  const activeFilters = filters ? Object.entries(filters) : [];

  return (
    <AppShell title="Ask Angie" description="Find leads, then put Angie to work on them.">
      <Card className="p-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search
              size={18}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint"
            />
            <TextInput
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder={COPY.askPlaceholder}
              className="pl-11"
              aria-label="Ask Angie for leads"
            />
          </div>

          <Button type="submit" busy={loading} disabled={loading || !question.trim()}>
            {!loading ? <Sparkles size={16} /> : null}
            {loading ? COPY.askButtonBusy : COPY.askButton}
          </Button>
        </form>

        <div className="mt-5 flex flex-wrap gap-2">
          {examples.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => void askAngie(example)}
              disabled={loading}
              className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent hover:bg-accent-soft hover:text-accent-strong disabled:opacity-50"
            >
              {example}
            </button>
          ))}
        </div>
      </Card>

      {activeFilters.length > 0 ? (
        <Card className="mt-6 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">
            Angie understood
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {activeFilters.map(([key, value]) => (
              <Chip key={key}>
                {key}: {String(value)}
              </Chip>
            ))}
          </div>
        </Card>
      ) : null}

      {/* Results */}
      <div className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-ink">Results</h2>
            <p className="mt-0.5 text-sm text-muted">
              {loading
                ? loadingLine(question.length)
                : hasSearched
                  ? `${results.length} lead${results.length === 1 ? "" : "s"}${
                      selectionCount ? ` · ${selectionCount} selected` : ""
                    }`
                  : COPY.noSearchYet}
            </p>
          </div>

          {results.length ? (
            <Button type="button" variant="secondary" size="sm" onClick={toggleAll}>
              {allSelected ? "Clear selection" : "Select all"}
            </Button>
          ) : null}
        </div>

        {/* Action bar */}
        {selectionCount ? (
          <Card className="mt-4 flex flex-wrap items-center gap-2 p-4">
            {(Object.keys(actionLabels) as AngieAction[]).map((action) => {
              const blocked = action === "email" ? overEmailLimit : overActionLimit;
              return (
                <Button
                  key={action}
                  type="button"
                  size="sm"
                  busy={runningAction === action}
                  disabled={Boolean(runningAction) || blocked}
                  onClick={() => void runAction(action)}
                >
                  {actionLabels[action]}
                </Button>
              );
            })}
            <Button type="button" variant="ghost" size="sm" onClick={resetActions}>
              {COPY.newConversation}
            </Button>

            {overActionLimit ? (
              <p className="text-xs text-caution">
                Pick {MAX_ACTION_LEADS} leads or fewer to run an action.
              </p>
            ) : overEmailLimit ? (
              <p className="text-xs text-caution">
                Drafting outreach is capped at {MAX_EMAIL_LEADS} leads.
              </p>
            ) : null}
          </Card>
        ) : null}

        {error ? (
          <Card className="mt-4 border-critical/30 bg-critical-soft p-4">
            <p className="text-sm text-critical">{error}</p>
          </Card>
        ) : null}

        {!loading && hasSearched && !error && results.length === 0 ? (
          <Card className="mt-4">
            <EmptyState title={COPY.emptyResults} hint={COPY.emptyResultsHint} />
          </Card>
        ) : null}

        {results.length ? (
          <div className="mt-4 space-y-3">
            {results.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                selected={selectedSet.has(lead.id)}
                onToggle={() => toggleLead(lead.id)}
                onCopyContact={() => void copyContact(lead)}
                copied={copiedId === lead.id}
              />
            ))}
          </div>
        ) : null}
      </div>

      <div ref={outputRef} className="scroll-mt-6" />

      {actionError ? (
        <Card className="mt-6 border-critical/30 bg-critical-soft p-4">
          <p className="text-sm text-critical">{actionError}</p>
        </Card>
      ) : null}

      {output ? (
        <Card className="mt-6 p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-ink">{actionLabels[output.kind]}</h2>
            <button
              type="button"
              onClick={() => setOutput(null)}
              className="text-xs font-semibold text-muted transition hover:text-ink"
            >
              Dismiss
            </button>
          </div>

          {output.kind === "call_list" ? (
            <div className="mt-4">
              {output.guidance ? (
                <p className="whitespace-pre-wrap rounded-xl bg-subtle p-4 text-sm leading-6 text-ink">
                  {output.guidance}
                </p>
              ) : null}

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-subtle text-left">
                    <tr className="border-b border-line">
                      <th className="px-4 py-3 font-semibold text-muted">#</th>
                      <th className="px-4 py-3 font-semibold text-muted">Business</th>
                      <th className="px-4 py-3 font-semibold text-muted">Phone</th>
                      <th className="px-4 py-3 font-semibold text-muted">Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {output.leads.map((lead, index) => (
                      <tr key={lead.leadId} className="border-b border-line last:border-0">
                        <td className="px-4 py-3 text-faint">{index + 1}</td>
                        <td className="px-4 py-3 font-medium text-ink">
                          {lead.businessName || "Unnamed business"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-ink">
                          {formatPhone(lead.phone)}
                        </td>
                        <td className="px-4 py-3 text-ink">
                          {[lead.city, lead.state].filter(Boolean).join(", ") || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {output.kind === "email" ? (
            <div className="mt-4 space-y-4">
              {output.emails.map((email) => (
                <div key={email.leadId} className="rounded-xl border border-line p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-faint">
                    {email.businessName || "Unnamed business"}
                  </p>
                  <p className="mt-2 font-semibold text-ink">{email.subject}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">
                    {email.body}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          {output.kind === "strategy" ? (
            <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-muted">
              {output.strategy}
            </p>
          ) : null}
        </Card>
      ) : null}
    </AppShell>
  );
}
