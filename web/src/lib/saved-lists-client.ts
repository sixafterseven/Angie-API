/**
 * Client-side saved-list operations. Thin wrappers over the /api/saved-lists
 * endpoints (which do the Admin-SDK writes and ownership checks).
 */
import { AngieFilters, LeadSort } from "./angie-filters";
import { authedFetch } from "./api";
import { SavedList } from "./saved-lists";

export async function fetchSavedLists(): Promise<SavedList[]> {
  const { lists } = await authedFetch<{ lists: SavedList[] }>("/api/saved-lists");
  return lists ?? [];
}

export async function createSavedList(input: {
  name: string;
  leadIds: string[];
  searchSummary: string;
  filters: AngieFilters;
  sort?: LeadSort;
}): Promise<SavedList> {
  const { list } = await authedFetch<{ list: SavedList }>("/api/saved-lists", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return list;
}

export async function renameSavedList(listId: string, name: string): Promise<SavedList> {
  const { list } = await authedFetch<{ list: SavedList }>("/api/saved-lists", {
    method: "PATCH",
    body: JSON.stringify({ listId, name }),
  });
  return list;
}

export async function deleteSavedList(listId: string): Promise<void> {
  await authedFetch(`/api/saved-lists?listId=${encodeURIComponent(listId)}`, {
    method: "DELETE",
  });
}
