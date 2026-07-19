/**
 * Lead export — column mapping + CSV generation.
 *
 * Columns are the sales-useful subset (not every internal field). Values come
 * straight from stored lead data, so an export can never contain generated or
 * invented content. Phone / ZIP / IDs are emitted as text so spreadsheets do
 * not mangle them. PR 3 adds XLSX (via SheetJS) and an export scope menu on top
 * of this same column mapping.
 */

import * as XLSX from "xlsx";

import {
  Lead,
  getBusinessName,
  getIndustry,
  getReasonTexts,
  getWarningLabels,
} from "./leads";

export type ExportColumn = { header: string; value: (lead: Lead) => string };
export type ExportFormat = "csv" | "xlsx";

/** The export scopes offered in the menu. */
export type ExportScope =
  | { kind: "current" }
  | { kind: "selected" }
  | { kind: "top"; n: number };

/** Resolves a scope to the actual leads to export. */
export function scopeLeads(
  scope: ExportScope,
  current: Lead[],
  selected: Lead[],
): Lead[] {
  if (scope.kind === "selected") {
    return selected;
  }
  if (scope.kind === "top") {
    return current.slice(0, Math.max(0, scope.n));
  }
  return current;
}

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

function triggerDownload(blob: Blob, filename: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Triggers a browser download of a CSV file. */
export function downloadCsv(leads: Lead[], summary: string): void {
  const csv = toCsv(leads);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, exportFilename(summary, new Date().toISOString(), "csv"));
}

/**
 * Builds an XLSX worksheet from the same column mapping. Text-preserved columns
 * (phone / ZIP / ids) are written as explicit string cells so SheetJS does not
 * coerce them to numbers and drop leading zeros.
 */
export function buildWorkbook(leads: Lead[]): XLSX.WorkBook {
  const rows = buildRows(leads);
  const sheet = XLSX.utils.aoa_to_sheet(rows);

  const textCols = EXPORT_COLUMNS.map((c, i) => (TEXT_COLUMNS.has(c.header) ? i : -1)).filter(
    (i) => i >= 0,
  );

  // Force text type on preserved columns (skip the header row).
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
  for (let r = 1; r <= range.e.r; r += 1) {
    for (const c of textCols) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[addr];
      if (cell && cell.v !== "" && cell.v != null) {
        cell.t = "s";
        cell.v = String(cell.v);
      }
    }
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Leads");
  return workbook;
}

/** Triggers a browser download of an XLSX file. */
export function downloadXlsx(leads: Lead[], summary: string): void {
  const workbook = buildWorkbook(leads);
  const out = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const blob = new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  triggerDownload(blob, exportFilename(summary, new Date().toISOString(), "xlsx"));
}

/** Download in the requested format. Returns the number of leads exported. */
export function downloadLeads(
  leads: Lead[],
  summary: string,
  format: ExportFormat,
): number {
  if (!leads.length) {
    return 0;
  }
  if (format === "xlsx") {
    downloadXlsx(leads, summary);
  } else {
    downloadCsv(leads, summary);
  }
  return leads.length;
}
