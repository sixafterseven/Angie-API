import { App, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import type { DecodedIdToken } from "firebase-admin/auth";

import {
  isActiveUserRecord,
  normalizeEmail,
  UNAUTHORIZED_MESSAGE,
  UserRecord,
  USERS_COLLECTION,
} from "@/lib/user-access";

/**
 * Raised when a request does not carry a usable Firebase ID token.
 * The API route turns this into a 401 with a readable message.
 */
export class AuthError extends Error {}

/**
 * The Admin SDK is initialized lazily so that `next build` — which imports
 * route modules without any credentials present — never fails.
 */
function getAdminApp(): App {
  const existing = getApps();

  if (existing.length) {
    return existing[0];
  }

  return initializeApp({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
}

export function getAdminDb() {
  return getFirestore(getAdminApp());
}

/**
 * Verifies the Firebase ID token on an incoming request and confirms the
 * caller is an approved, active employee.
 *
 * Membership is checked here as well as in the browser because this route reads
 * Firestore through the Admin SDK, which bypasses security rules. Without this
 * check, a signed-in but unapproved account could still reach lead data by
 * calling the API directly. The Admin SDK read below also bypasses rules, so it
 * sees the `users` document regardless of the client read restrictions.
 *
 * Throws AuthError when the token is missing, malformed, expired, revoked, or
 * belongs to an account without an active `users` document.
 */
export async function requireUser(request: Request): Promise<DecodedIdToken> {
  const header = request.headers.get("authorization") ?? "";

  const match = /^Bearer\s+(.+)$/i.exec(header.trim());

  if (!match) {
    throw new AuthError("You must be signed in to use Angie.");
  }

  let decoded: DecodedIdToken;

  try {
    decoded = await getAuth(getAdminApp()).verifyIdToken(match[1], true);
  } catch {
    throw new AuthError("Your session expired. Sign in again.");
  }

  const normalized = normalizeEmail(decoded.email);

  if (!normalized) {
    throw new AuthError(UNAUTHORIZED_MESSAGE);
  }

  const snapshot = await getAdminDb()
    .collection(USERS_COLLECTION)
    .doc(normalized)
    .get();

  if (!isActiveUserRecord(snapshot.data() as UserRecord | undefined)) {
    throw new AuthError(UNAUTHORIZED_MESSAGE);
  }

  return decoded;
}
