/**
 * Lead export — column mapping + CSV generation.
 *
 * Columns are the sales-useful subset (not every internal field). Values come
 * straight from stored lead data, so an export can never contain generated or
 * invented content. Phone / ZIP / IDs are emitted as text so spreadsheets do
 * not mangle them. PR 3 adds XLSX (via SheetJS) and an export scope menu on top
 * of this same column mapping.
 */

import {
  Lead,
  getBusinessName,
  getIndustry,
  getReasonTexts,
  getWarningLabels,
} from "./leads";

export type ExportColumn = { header: string; value: (lead: Lead) => string };

export const EXPORT_COLUMNS: ExportColumn[] = [
  { header: "Business Name", value: (l) => getBusinessName(l) },
  { header: "Category", value: (l) => getIndustry(l) },
  { header: "Address", value: (l) => l.address ?? l.street ?? "" },
  { header: "City", value: (l) => l.city ?? "" },
  { header: "State", value: (l) => l.state ?? "" },
  { header: "ZIP", value: (l) => l.postalCode ?? "" },
  { header: "Phone", value: (l) => l.phone ?? "" },
  { header: "Email", value: (l) => l.email ?? "" },
  { header: "Website", value: (l) => l.website ?? "" },
  { header: "Google Maps URL", value: (l) => l.googleMapsUrl ?? "" },
  { header: "Rating", value: (l) => (typeof l.rating === "number" ? String(l.rating) : "") },
  {
    header: "Review Count",
    value: (l) => (typeof l.reviewCount === "number" ? String(l.reviewCount) : ""),
  },
  {
    header: "Qualification Score",
    value: (l) =>
      typeof l.overallQualificationScore === "number"
        ? String(l.overallQualificationScore)
        : "",
  },
  { header: "Qualification Band", value: (l) => l.qualificationBand ?? "" },
  { header: "Qualification Reasons", value: (l) => getReasonTexts(l, 5).join("; ") },
  { header: "Qualification Warnings", value: (l) => getWarningLabels(l, 5).join("; ") },
  { header: "Recommended Next Action", value: (l) => l.recommendedNextAction ?? "" },
  { header: "Geography Status", value: (l) => l.geographyStatus ?? "" },
  { header: "Market Tier", value: (l) => l.marketTier ?? "" },
  { header: "Source Batch", value: (l) => l.batchId ?? "" },
];

/** Fields that must survive as text (leading zeros, long ids). */
const TEXT_COLUMNS = new Set(["Phone", "ZIP", "Source Batch"]);

function csvCell(value: string, header: string): string {
  const text = value ?? "";
  // Force text so Excel keeps "30303" / a leading-zero ZIP / a long id intact.
  const forced = TEXT_COLUMNS.has(header) && text ? `="${text.replace(/"/g, '""')}"` : text;
  if (/[",\n]/.test(forced)) {
    return `"${forced.replace(/"/g, '""')}"`;
  }
  return forced;
}

export function buildRows(leads: Lead[]): string[][] {
  const header = EXPORT_COLUMNS.map((c) => c.header);
  const body = leads.map((lead) => EXPORT_COLUMNS.map((c) => c.value(lead)));
  return [header, ...body];
}

export function toCsv(leads: Lead[]): string {
  const header = EXPORT_COLUMNS.map((c) => c.header);
  const lines = [header.map((h) => csvCell(h, "")).join(",")];
  for (const lead of leads) {
    lines.push(EXPORT_COLUMNS.map((c) => csvCell(c.value(lead), c.header)).join(","));
  }
  return lines.join("\r\n");
}

/** Slug like "micah-amari-leads-orthodontists-atlanta-2026-07-19". */
export function exportFilename(summary: string, dateIso: string, ext: string): string {
  const slug = summary
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const date = dateIso.slice(0, 10);
  return `micah-amari-leads${slug ? `-${slug}` : ""}-${date}.${ext}`;
}

/** Triggers a browser download of a CSV file. */
export function downloadCsv(leads: Lead[], summary: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const csv = toCsv(leads);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = exportFilename(summary, new Date().toISOString(), "csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
