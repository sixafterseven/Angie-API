"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs, query, where } from "firebase/firestore";
import { FolderOpen, ListMusic, Pencil, Trash2 } from "lucide-react";

import AppShell from "@/components/app-shell";
import { Button, Card, EmptyState, Spinner } from "@/components/ui";
import { Modal } from "@/components/modal";
import { ExportMenu } from "@/components/export-menu";
import { useToast } from "@/components/toast";
import { db } from "@/lib/firebase";
import { Lead } from "@/lib/leads";
import { SavedList } from "@/lib/saved-lists";
import {
  deleteSavedList,
  fetchSavedLists,
  renameSavedList,
} from "@/lib/saved-lists-client";
import { saveOpenList } from "@/lib/angie-session";

function formatDate(ms: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

export default function SavedListsPage() {
  const router = useRouter();
  const { notify } = useToast();

  const [lists, setLists] = useState<SavedList[]>([]);
  const [byId, setById] = useState<Map<string, Lead>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [renaming, setRenaming] = useState<SavedList | null>(null);
  const [renameValue, setRenameValue] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [saved, snapshot] = await Promise.all([
          fetchSavedLists(),
          getDocs(query(collection(db, "leads"), where("pipelineStage", "==", "sales_ready"))),
        ]);
        if (cancelled) return;
        setLists(saved);
        const map = new Map<string, Lead>();
        snapshot.docs.forEach((d) => map.set(d.id, { id: d.id, ...d.data() } as Lead));
        setById(map);
      } catch (caughtError) {
        if (!cancelled) {
          setError(caughtError instanceof Error ? caughtError.message : "Could not load your lists.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const resolve = useMemo(
    () => (ids: string[]) => ids.map((id) => byId.get(id)).filter(Boolean) as Lead[],
    [byId],
  );

  function openList(list: SavedList) {
    saveOpenList({
      name: list.name,
      leadIds: list.leadIds,
      searchSummary: list.searchSummary,
      filters: list.filters,
      sort: list.sort,
    });
    router.push("/ask-angie");
  }

  async function submitRename() {
    if (!renaming || !renameValue.trim()) return;
    try {
      const updated = await renameSavedList(renaming.listId, renameValue.trim());
      setLists((current) =>
        current.map((l) => (l.listId === updated.listId ? updated : l)),
      );
      notify("List renamed");
    } catch (caughtError) {
      notify(caughtError instanceof Error ? caughtError.message : "Rename failed", "info");
    } finally {
      setRenaming(null);
    }
  }

  async function remove(list: SavedList) {
    try {
      await deleteSavedList(list.listId);
      setLists((current) => current.filter((l) => l.listId !== list.listId));
      notify("List deleted");
    } catch (caughtError) {
      notify(caughtError instanceof Error ? caughtError.message : "Delete failed", "info");
    }
  }

  return (
    <AppShell title="Saved Lists" description="Your lead lists — reopen, refine, or download any time.">
      {loading ? (
        <Spinner label="Loading your lists…" />
      ) : error ? (
        <Card className="border-critical/30 bg-critical-soft p-4">
          <p className="text-sm text-critical">{error}</p>
        </Card>
      ) : lists.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ListMusic size={28} />}
            title="No saved lists yet."
            hint="In Ask Angie, pull up some leads and hit “Save this list” — they'll show up here."
            action={
              <Button type="button" onClick={() => router.push("/ask-angie")}>
                Go to Ask Angie
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {lists.map((list) => {
            const leads = resolve(list.leadIds);
            return (
              <Card key={list.listId} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-ink">{list.name}</h3>
                    <p className="mt-0.5 text-sm text-muted">
                      {list.leadIds.length} lead{list.leadIds.length === 1 ? "" : "s"}
                      {list.searchSummary ? ` · ${list.searchSummary}` : ""}
                    </p>
                  </div>
                </div>

                <p className="mt-2 text-xs text-faint">
                  Created {formatDate(list.createdAt)}
                  {list.updatedAt && list.updatedAt !== list.createdAt
                    ? ` · Updated ${formatDate(list.updatedAt)}`
                    : ""}
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" onClick={() => openList(list)}>
                    <FolderOpen size={14} />
                    Open
                  </Button>
                  <ExportMenu current={leads} selected={[]} summary={list.name} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setRenaming(list);
                      setRenameValue(list.name);
                    }}
                  >
                    <Pencil size={14} />
                    Rename
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(list)}
                  >
                    <Trash2 size={14} />
                    Delete
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={Boolean(renaming)} onClose={() => setRenaming(null)} title="Rename list">
        <input
          value={renameValue}
          onChange={(event) => setRenameValue(event.target.value)}
          className="w-full rounded-xl border border-line-strong bg-surface px-4 py-3 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
          autoFocus
        />
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setRenaming(null)}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={submitRename} disabled={!renameValue.trim()}>
            Save
          </Button>
        </div>
      </Modal>
    </AppShell>
  );
}
