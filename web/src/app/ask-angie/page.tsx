"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { ArrowUpRight, Loader2, Search } from "lucide-react";

import AppShell from "@/components/app-shell";
import { auth, db } from "@/lib/firebase";
import {
  AngieAction,
  AngieFilters,
  MAX_ACTION_LEADS,
  MAX_EMAIL_LEADS,
  resolveLimit,
  toStateCode,
} from "@/lib/angie-filters";

type Lead = {
  id: string;
  businessName?: string;
  companyName?: string;
  name?: string;
  phone?: string;
  website?: string;
  city?: string;
  state?: string;
  industry?: string;
  category?: string;
  rating?: number;
  reviewCount?: number;
  geographyStatus?: string;
  isInTargetMarket?: boolean;
};

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

function getBusinessName(lead: Lead): string {
  return (
    lead.businessName ?? lead.companyName ?? lead.name ?? "Unnamed business"
  );
}

function normalize(value?: string): string {
  return value?.trim().toLowerCase() ?? "";
}

function formatPhone(phone?: string): string {
  if (!phone) {
    return "No phone";
  }

  const digits = phone.replace(/\D/g, "");

  if (digits.length === 10) {
    return (
      `(${digits.slice(0, 3)}) ` + `${digits.slice(3, 6)}-${digits.slice(6)}`
    );
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return (
      `(${digits.slice(1, 4)}) ` + `${digits.slice(4, 7)}-${digits.slice(7)}`
    );
  }

  return phone;
}

function getWebsiteLabel(website?: string): string {
  if (!website) {
    return "No website";
  }

  try {
    const url = website.startsWith("http") ? website : `https://${website}`;

    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return website;
  }
}

function getWebsiteHref(website?: string): string {
  if (!website) {
    return "#";
  }

  return website.startsWith("http") ? website : `https://${website}`;
}

function matchesFilters(lead: Lead, filters: AngieFilters): boolean {
  const leadIndustry = normalize(lead.industry ?? lead.category);

  if (filters.industry && !leadIndustry.includes(normalize(filters.industry))) {
    return false;
  }

  if (filters.city && !normalize(lead.city).includes(normalize(filters.city))) {
    return false;
  }

  // Leads store the source `state_code`, so both sides are reduced to a code.
  if (filters.state && toStateCode(lead.state) !== toStateCode(filters.state)) {
    return false;
  }

  if (filters.website === true && !lead.website) {
    return false;
  }

  if (filters.website === false && Boolean(lead.website)) {
    return false;
  }

  if (filters.phone === true && !lead.phone) {
    return false;
  }

  if (filters.phone === false && Boolean(lead.phone)) {
    return false;
  }

  // Suppressed / out-of-market leads are hidden unless explicitly requested.
  if (!filters.includeOutOfMarket && lead.geographyStatus === "out_of_market") {
    return false;
  }

  return true;
}

/**
 * Calls the Angie API with the signed-in user's Firebase ID token.
 */
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
        : "Angie could not complete that request.";

    throw new Error(message);
  }

  return payload;
}

const examples = [
  "Show me dentists in Atlanta",
  "Show me medical spas",
  "Find businesses without websites",
  "Show me chiropractors with phone numbers",
  "Give me 20 leads in Georgia",
];

const actionLabels: Record<AngieAction, string> = {
  call_list: "Build Call List",
  email: "Draft Email",
  strategy: "Create Strategy",
};

export default function AskAngiePage() {
  const [question, setQuestion] = useState("");
  const [results, setResults] = useState<Lead[]>([]);
  const [filters, setFilters] = useState<AngieFilters | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState("");

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [runningAction, setRunningAction] = useState<AngieAction | null>(null);
  const [actionError, setActionError] = useState("");
  const [output, setOutput] = useState<AngieOutput | null>(null);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  // On mobile the generated output/error renders below the whole results list,
  // so bring it into view as soon as it appears — otherwise it looks like
  // nothing happened.
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

      // Only Vera-approved leads are searchable.
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
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Angie could not complete the search.";

      setError(message);
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
        setOutput({
          kind: "email",
          emails: (payload.emails as DraftedEmail[]) ?? [],
        });
      } else {
        setOutput({
          kind: "strategy",
          strategy: String(payload.strategy ?? ""),
        });
      }
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Angie could not complete that action.";

      setActionError(message);
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

  return (
    <AppShell
      title="Ask Angie"
      description="Search your sales-ready leads using plain English."
    >
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-3 sm:flex-row"
        >
          <div className="relative flex-1">
            <Search
              size={19}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            />

            <input
              type="text"
              value={question}
              onChange={(event) => {
                setQuestion(event.target.value);
              }}
              placeholder="Show me dentists in Atlanta..."
              className="w-full rounded-xl border border-slate-300 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : null}

            {loading ? "Searching..." : "Ask Angie"}
          </button>
        </form>

        <div className="mt-5 flex flex-wrap gap-2">
          {examples.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                void askAngie(example);
              }}
              disabled={loading}
              className="rounded-full border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-slate-950 hover:bg-slate-50 hover:text-slate-950 disabled:opacity-50"
            >
              {example}
            </button>
          ))}
        </div>
      </section>

      {filters && Object.keys(filters).length > 0 ? (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Angie understood
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(filters).map(([key, value]) => (
              <span
                key={key}
                className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700"
              >
                {key}: {String(value)}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-950">Results</h2>

              <p className="mt-1 text-sm text-slate-500">
                {loading
                  ? "Angie is searching your leads."
                  : `${results.length} lead${
                      results.length === 1 ? "" : "s"
                    } found${
                      selectionCount ? ` • ${selectionCount} selected` : ""
                    }`}
              </p>
            </div>

            {results.length ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={toggleAll}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-950 hover:text-slate-950"
                >
                  {allSelected ? "Clear selection" : "Select all"}
                </button>

                {selectionCount ? (
                  <button
                    type="button"
                    onClick={resetActions}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-950 hover:text-slate-950"
                  >
                    Reset
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          {selectionCount ? (
            <div className="flex flex-wrap items-center gap-2">
              {(Object.keys(actionLabels) as AngieAction[]).map((action) => {
                const blocked =
                  action === "email" ? overEmailLimit : overActionLimit;

                return (
                  <button
                    key={action}
                    type="button"
                    onClick={() => {
                      void runAction(action);
                    }}
                    disabled={Boolean(runningAction) || blocked}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {runningAction === action ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : null}

                    {actionLabels[action]}
                  </button>
                );
              })}

              {overActionLimit ? (
                <p className="text-xs text-amber-700">
                  Select {MAX_ACTION_LEADS} leads or fewer to run an action.
                </p>
              ) : overEmailLimit ? (
                <p className="text-xs text-amber-700">
                  Drafting email is limited to {MAX_EMAIL_LEADS} leads.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="m-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {!loading && hasSearched && !error && results.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-medium text-slate-800">
              No matching leads found.
            </p>

            <p className="mt-2 text-sm text-slate-500">
              Try broadening the location or industry.
            </p>
          </div>
        ) : null}

        {results.map((lead) => {
          const selected = selectedSet.has(lead.id);

          return (
            <article
              key={lead.id}
              className={[
                "grid gap-4 border-b border-slate-200 px-6 py-5 transition",
                "last:border-b-0 md:grid-cols-[auto_minmax(0,1.5fr)_minmax(0,1fr)_auto]",
                selected ? "bg-slate-50" : "hover:bg-slate-50",
              ].join(" ")}
            >
              <label className="flex items-start pt-1">
                <span className="sr-only">Select {getBusinessName(lead)}</span>

                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => {
                    toggleLead(lead.id);
                  }}
                  className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-slate-950"
                />
              </label>

              <div className="min-w-0">
                <h3 className="truncate font-semibold text-slate-950">
                  {getBusinessName(lead)}
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  {[lead.city, lead.state, lead.industry ?? lead.category]
                    .filter(Boolean)
                    .join(" • ") || "Location unavailable"}
                </p>
              </div>

              <div className="text-sm">
                <p className="text-slate-700">{formatPhone(lead.phone)}</p>

                {lead.website ? (
                  <a
                    href={getWebsiteHref(lead.website)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block truncate font-medium text-blue-700 hover:underline"
                  >
                    {getWebsiteLabel(lead.website)}
                  </a>
                ) : (
                  <p className="mt-1 text-slate-400">No website</p>
                )}
              </div>

              {lead.website ? (
                <a
                  href={getWebsiteHref(lead.website)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open ${getBusinessName(lead)} website`}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 text-slate-600 transition hover:border-slate-950 hover:text-slate-950"
                >
                  <ArrowUpRight size={18} />
                </a>
              ) : null}
            </article>
          );
        })}
      </section>

      {/* Scroll anchor so generated output/errors are brought into view. */}
      <div ref={outputRef} className="scroll-mt-6" />

      {actionError ? (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {actionError}
        </div>
      ) : null}

      {output ? (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-950">
              {actionLabels[output.kind]}
            </h2>

            <button
              type="button"
              onClick={() => {
                setOutput(null);
              }}
              className="text-xs font-semibold text-slate-500 hover:text-slate-950"
            >
              Dismiss
            </button>
          </div>

          {output.kind === "call_list" ? (
            <div className="mt-4">
              {output.guidance ? (
                <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                  {output.guidance}
                </p>
              ) : null}

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr className="border-b border-slate-200">
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">
                        #
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">
                        Business
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">
                        Phone
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">
                        Location
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {output.leads.map((lead, index) => (
                      <tr
                        key={lead.leadId}
                        className="border-b border-slate-200 last:border-b-0"
                      >
                        <td className="px-4 py-3 text-slate-500">
                          {index + 1}
                        </td>

                        <td className="px-4 py-3 font-medium text-slate-950">
                          {lead.businessName || "Unnamed business"}
                        </td>

                        <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                          {formatPhone(lead.phone)}
                        </td>

                        <td className="px-4 py-3 text-slate-700">
                          {[lead.city, lead.state].filter(Boolean).join(", ") ||
                            "—"}
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
                <article
                  key={email.leadId}
                  className="rounded-xl border border-slate-200 p-4"
                >
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {email.businessName || "Unnamed business"}
                  </p>

                  <p className="mt-2 font-semibold text-slate-950">
                    {email.subject}
                  </p>

                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {email.body}
                  </p>
                </article>
              ))}
            </div>
          ) : null}

          {output.kind === "strategy" ? (
            <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {output.strategy}
            </p>
          ) : null}
        </section>
      ) : null}
    </AppShell>
  );
}
