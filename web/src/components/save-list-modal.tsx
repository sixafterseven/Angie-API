/**
 * "Save This List" flow — a small naming modal that saves the current results
 * or the current selection as a reusable list.
 */
"use client";

import { useState } from "react";

import { Button, TextInput } from "@/components/ui";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { AngieFilters, LeadSort } from "@/lib/angie-filters";
import { createSavedList } from "@/lib/saved-lists-client";

export function SaveListModal({
  open,
  onClose,
  defaultName,
  currentLeadIds,
  selectedLeadIds,
  searchSummary,
  filters,
  sort,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  defaultName: string;
  currentLeadIds: string[];
  selectedLeadIds: string[];
  searchSummary: string;
  filters: AngieFilters;
  sort?: LeadSort;
  onSaved?: () => void;
}) {
  const { notify } = useToast();
  const [name, setName] = useState(defaultName);
  const [scope, setScope] = useState<"current" | "selected">(
    selectedLeadIds.length ? "selected" : "current",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const leadIds = scope === "selected" ? selectedLeadIds : currentLeadIds;

  async function save() {
    if (!name.trim() || !leadIds.length || saving) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      await createSavedList({ name: name.trim(), leadIds, searchSummary, filters, sort });
      notify("List saved");
      onSaved?.();
      onClose();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not save the list.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Save this list">
      <label className="block text-xs font-medium text-muted">
        List name
        <TextInput
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Atlanta orthodontists — round 1"
          className="mt-1"
          autoFocus
        />
      </label>

      {selectedLeadIds.length ? (
        <div className="mt-3 flex gap-2 text-sm">
          {(["current", "selected"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setScope(option)}
              className={[
                "rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
                scope === option
                  ? "border-accent bg-accent-soft text-accent-strong"
                  : "border-line text-muted hover:border-accent",
              ].join(" ")}
            >
              {option === "current"
                ? `Current results (${currentLeadIds.length})`
                : `Selected (${selectedLeadIds.length})`}
            </button>
          ))}
        </div>
      ) : null}

      {error ? <p className="mt-3 text-sm text-critical">{error}</p> : null}

      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          busy={saving}
          disabled={saving || !name.trim() || !leadIds.length}
          onClick={save}
        >
          Save list
        </Button>
      </div>
    </Modal>
  );
}
