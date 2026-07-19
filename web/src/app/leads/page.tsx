"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";

import AppShell from "@/components/app-shell";
import { db } from "@/lib/firebase";

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
  validationStatus?: string;
  pipelineStage?: string;
};

type WebsiteInfo = {
  href: string;
  label: string;
};

function cleanWebsite(url?: string): WebsiteInfo | null {
  if (!url) {
    return null;
  }

  try {
    const href = url.startsWith("http") ? url : `https://${url}`;

    const parsedUrl = new URL(href);

    return {
      href,
      label: parsedUrl.hostname.replace(/^www\./, ""),
    };
  } catch {
    return {
      href: url,
      label: url,
    };
  }
}

function formatPhone(phone?: string): string {
  if (!phone) {
    return "—";
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

function getBusinessName(lead: Lead): string {
  return (
    lead.businessName ?? lead.companyName ?? lead.name ?? "Unnamed business"
  );
}

function getStatusLabel(lead: Lead): string {
  if (lead.pipelineStage === "sales_ready") {
    return "Sales Ready";
  }

  if (lead.validationStatus === "needs_review") {
    return "Needs Review";
  }

  if (lead.validationStatus === "suppressed") {
    return "Suppressed";
  }

  return lead.validationStatus ?? "Ready";
}

function getStatusClasses(lead: Lead): string {
  if (lead.validationStatus === "needs_review") {
    return "bg-amber-100 text-amber-800";
  }

  if (lead.validationStatus === "suppressed") {
    return "bg-slate-200 text-ink";
  }

  return "bg-emerald-100 text-emerald-800";
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadLeads() {
      try {
        // Only Vera-approved leads belong on this page. Sorting happens in
        // memory rather than with orderBy, because an orderBy on businessName
        // would silently drop any lead document missing that field.
        const leadsQuery = query(
          collection(db, "leads"),
          where("pipelineStage", "==", "sales_ready"),
        );

        const snapshot = await getDocs(leadsQuery);

        const loadedLeads = snapshot.docs.map((leadDocument) => ({
          id: leadDocument.id,
          ...leadDocument.data(),
        })) as Lead[];

        loadedLeads.sort((first, second) =>
          getBusinessName(first).localeCompare(getBusinessName(second)),
        );

        setLeads(loadedLeads);
      } catch (caughtError) {
        const message =
          caughtError instanceof Error
            ? caughtError.message
            : "Leads could not be loaded.";

        setError(message);
      } finally {
        setLoading(false);
      }
    }

    void loadLeads();
  }, []);

  const filteredLeads = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();

    if (!searchTerm) {
      return leads;
    }

    return leads.filter((lead) => {
      const searchableText = [
        lead.businessName,
        lead.companyName,
        lead.name,
        lead.phone,
        lead.website,
        lead.city,
        lead.state,
        lead.industry,
        lead.category,
        lead.validationStatus,
        lead.pipelineStage,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(searchTerm);
    });
  }, [leads, search]);

  return (
    <AppShell
      title="Sales Ready Leads"
      description="Search and browse processed leads."
    >
      <section className="rounded-2xl border border-line bg-surface shadow-sm">
        <div className="border-b border-line p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-muted">
                Available leads
              </p>

              <p className="mt-1 text-2xl font-bold text-ink">
                {filteredLeads.length}
              </p>
            </div>

            <div className="w-full sm:max-w-md">
              <label htmlFor="lead-search" className="sr-only">
                Search businesses
              </label>

              <input
                id="lead-search"
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                }}
                placeholder="Search businesses, phone, city, or industry..."
                className="w-full rounded-xl border border-line-strong bg-surface px-4 py-3 text-sm outline-none transition placeholder:text-faint focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-sm text-muted">Loading leads...</div>
        ) : null}

        {error ? (
          <div className="m-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {!loading && !error ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-subtle">
                <tr className="border-b border-line">
                  <th className="px-5 py-4 text-left font-semibold text-ink">
                    Business
                  </th>

                  <th className="px-5 py-4 text-left font-semibold text-ink">
                    Phone
                  </th>

                  <th className="px-5 py-4 text-left font-semibold text-ink">
                    Website
                  </th>

                  <th className="px-5 py-4 text-left font-semibold text-ink">
                    City
                  </th>

                  <th className="px-5 py-4 text-left font-semibold text-ink">
                    Industry
                  </th>

                  <th className="px-5 py-4 text-left font-semibold text-ink">
                    Status
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredLeads.map((lead, index) => {
                  const website = cleanWebsite(lead.website);

                  return (
                    <tr
                      key={lead.id}
                      className={[
                        "border-b border-line",
                        "transition hover:bg-canvas",
                        index % 2 === 0 ? "bg-surface" : "bg-subtle/60",
                      ].join(" ")}
                    >
                      <td className="max-w-xs px-5 py-4 align-top">
                        <p className="truncate font-semibold text-ink">
                          {getBusinessName(lead)}
                        </p>
                      </td>

                      <td className="whitespace-nowrap px-5 py-4 align-top text-ink">
                        {formatPhone(lead.phone)}
                      </td>

                      <td className="max-w-xs px-5 py-4 align-top">
                        {website ? (
                          <a
                            href={website.href}
                            target="_blank"
                            rel="noreferrer"
                            className="block truncate font-medium text-blue-700 hover:underline"
                            title={website.href}
                          >
                            {website.label}
                          </a>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </td>

                      <td className="whitespace-nowrap px-5 py-4 align-top text-ink">
                        {lead.city || "—"}
                      </td>

                      <td className="max-w-xs px-5 py-4 align-top text-ink">
                        <span className="block truncate">
                          {lead.industry ?? lead.category ?? "—"}
                        </span>
                      </td>

                      <td className="whitespace-nowrap px-5 py-4 align-top">
                        <span
                          className={[
                            "inline-flex rounded-full",
                            "px-3 py-1 text-xs font-semibold",
                            getStatusClasses(lead),
                          ].join(" ")}
                        >
                          {getStatusLabel(lead)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {filteredLeads.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted">
                No leads matched your search.
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
