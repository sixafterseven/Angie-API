/**
 * Client-side check of the signed-in user against the Firestore `users`
 * collection.
 *
 * Used by the login page and AppShell to confirm the current account is an
 * approved, active employee. Firestore rules let a signed-in user read only
 * their own `users` document, which is exactly what this reads.
 */

import { doc, getDoc } from "firebase/firestore";

import { db } from "@/lib/firebase";
import {
  isActiveUserRecord,
  normalizeEmail,
  UserRecord,
  USERS_COLLECTION,
} from "@/lib/user-access";

/**
 * Returns true when the given email has an active `users` document.
 *
 * Fails closed: any missing document, inactive flag, or read error resolves to
 * false, so a user is never treated as approved on uncertainty.
 */
export async function verifyActiveEmployee(
  email?: string | null,
): Promise<boolean> {
  const normalized = normalizeEmail(email);

  if (!normalized) {
    return false;
  }

  try {
    const snapshot = await getDoc(doc(db, USERS_COLLECTION, normalized));

    if (!snapshot.exists()) {
      return false;
    }

    return isActiveUserRecord(snapshot.data() as UserRecord);
  } catch (error) {
    console.error("Could not verify employee access:", error);
    return false;
  }
}
