/**
 * Saved lead lists CRUD.
 *
 * All access goes through the Admin SDK after requireUser(), scoped to the
 * caller's uid — so the existing "client writes denied" Firestore rules stay
 * intact and no rules change is needed. Ownership is enforced on every mutation.
 */
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { AuthError, getAdminDb, requireUser } from "@/lib/firebase-admin";
import { SavedList, validateListInput } from "@/lib/saved-lists";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLLECTION = "savedLists";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function toMillis(value: unknown): number {
  if (value && typeof value === "object" && "toMillis" in value) {
    try {
      return (value as { toMillis: () => number }).toMillis();
    } catch {
      return 0;
    }
  }
  return typeof value === "number" ? value : 0;
}

function serialize(id: string, data: FirebaseFirestore.DocumentData): SavedList {
  return {
    listId: id,
    userId: String(data.userId ?? ""),
    name: String(data.name ?? ""),
    leadIds: Array.isArray(data.leadIds) ? (data.leadIds as string[]) : [],
    searchSummary: String(data.searchSummary ?? ""),
    filters: (data.filters ?? {}) as SavedList["filters"],
    sort: data.sort as SavedList["sort"],
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
  };
}

/** GET — all of the caller's lists, newest first. */
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const db = getAdminDb();

    const snapshot = await db
      .collection(COLLECTION)
      .where("userId", "==", user.uid)
      .orderBy("updatedAt", "desc")
      .get();

    const lists = snapshot.docs.map((doc) => serialize(doc.id, doc.data()));
    return NextResponse.json({ lists });
  } catch (error) {
    return handleError(error);
  }
}

/** POST — create a new list from the current/selected leads. */
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const body: unknown = await request.json().catch(() => null);

    const input = validateListInput(body);
    if (!input) {
      return badRequest("Give the list a name and at least one lead.");
    }

    const db = getAdminDb();
    const ref = await db.collection(COLLECTION).add({
      userId: user.uid,
      name: input.name,
      leadIds: input.leadIds,
      searchSummary: input.searchSummary ?? "",
      filters: input.filters ?? {},
      sort: input.sort ?? null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const created = await ref.get();
    return NextResponse.json({ list: serialize(ref.id, created.data() ?? {}) });
  } catch (error) {
    return handleError(error);
  }
}

/** PATCH — rename a list the caller owns. */
export async function PATCH(request: Request) {
  try {
    const user = await requireUser(request);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

    const listId = typeof body?.listId === "string" ? body.listId : "";
    const name = typeof body?.name === "string" ? body.name.replace(/\s+/g, " ").trim().slice(0, 80) : "";

    if (!listId || !name) {
      return badRequest("A list id and a new name are required.");
    }

    const db = getAdminDb();
    const ref = db.collection(COLLECTION).doc(listId);
    const snapshot = await ref.get();

    if (!snapshot.exists || snapshot.data()?.userId !== user.uid) {
      return NextResponse.json({ error: "List not found." }, { status: 404 });
    }

    await ref.update({ name, updatedAt: FieldValue.serverTimestamp() });
    const updated = await ref.get();
    return NextResponse.json({ list: serialize(ref.id, updated.data() ?? {}) });
  } catch (error) {
    return handleError(error);
  }
}

/** DELETE — remove a list the caller owns (listId in the query string). */
export async function DELETE(request: Request) {
  try {
    const user = await requireUser(request);
    const listId = new URL(request.url).searchParams.get("listId") ?? "";

    if (!listId) {
      return badRequest("A list id is required.");
    }

    const db = getAdminDb();
    const ref = db.collection(COLLECTION).doc(listId);
    const snapshot = await ref.get();

    if (!snapshot.exists || snapshot.data()?.userId !== user.uid) {
      return NextResponse.json({ error: "List not found." }, { status: 404 });
    }

    await ref.delete();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}

function handleError(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  console.error("Saved lists request failed:", error);
  return NextResponse.json(
    { error: "Angie could not complete that request. Try again." },
    { status: 500 },
  );
}
