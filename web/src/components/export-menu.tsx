/**
 * "Download This List" — scope + format chooser. Shows the estimated record
 * count, exports the active set (or selection / top-N) as CSV or XLSX straight
 * from stored lead data, and confirms with a toast.
 */
"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";

import { Button } from "@/components/ui";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Lead } from "@/lib/leads";
import {
  ExportFormat,
  ExportScope,
  downloadLeads,
  scopeLeads,
} from "@/lib/export-leads";

type ScopeOption = { id: string; label: string; scope: ExportScope };

export function ExportMenu({
  current,
  selected,
  summary,
}: {
  current: Lead[];
  selected: Lead[];
  summary: string;
}) {
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const [scopeId, setScopeId] = useState("current");
  const [customN, setCustomN] = useState(10);

  const options: ScopeOption[] = useMemo(
    () => [
      { id: "current", label: `Current results (${current.length})`, scope: { kind: "current" } },
      { id: "selected", label: `Selected leads (${selected.length})`, scope: { kind: "selected" } },
      { id: "top5", label: "Top 5", scope: { kind: "top", n: 5 } },
      { id: "top10", label: "Top 10", scope: { kind: "top", n: 10 } },
      { id: "top25", label: "Top 25", scope: { kind: "top", n: 25 } },
      { id: "custom", label: "Custom top N", scope: { kind: "top", n: customN } },
    ],
    [current.length, selected.length, customN],
  );

  const activeScope =
    options.find((option) => option.id === scopeId)?.scope ?? { kind: "current" };
  const estimated = scopeLeads(activeScope, current, selected).length;

  function run(format: ExportFormat) {
    const leads = scopeLeads(activeScope, current, selected);
    const count = downloadLeads(leads, summary, format);
    if (count === 0) {
      notify("Nothing to export in that scope", "info");
      return;
    }
    notify(`Downloaded ${count} lead${count === 1 ? "" : "s"} as ${format.toUpperCase()}`);
    setOpen(false);
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={!current.length && !selected.length}
      >
        <Download size={14} />
        Download this list
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Download this list">
        <fieldset className="space-y-2">
          <legend className="sr-only">Choose what to export</legend>
          {options.map((option) => (
            <label
              key={option.id}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line px-3 py-2 text-sm text-ink has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
            >
              <input
                type="radio"
                name="export-scope"
                checked={scopeId === option.id}
                onChange={() => setScopeId(option.id)}
                className="accent-accent"
              />
              {option.label}
              {option.id === "custom" ? (
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={customN}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => {
                    setCustomN(Math.max(1, Math.min(500, Number(event.target.value) || 1)));
                    setScopeId("custom");
                  }}
                  className="ml-auto w-20 rounded-md border border-line bg-canvas px-2 py-1 text-sm"
                />
              ) : null}
            </label>
          ))}
        </fieldset>

        <p className="mt-4 text-sm text-muted">
          About to export <span className="font-semibold text-ink">{estimated}</span>{" "}
          lead{estimated === 1 ? "" : "s"}.
        </p>

        <div className="mt-4 flex gap-2">
          <Button type="button" onClick={() => run("csv")} disabled={estimated === 0}>
            CSV
          </Button>
          <Button type="button" onClick={() => run("xlsx")} disabled={estimated === 0}>
            Excel
          </Button>
        </div>
      </Modal>
    </>
  );
}
