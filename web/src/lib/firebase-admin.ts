import { App, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import type { DecodedIdToken } from "firebase-admin/auth";

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
 * Verifies the Firebase ID token on an incoming request.
 *
 * Throws AuthError when the token is missing, malformed, expired, or revoked.
 */
export async function requireUser(request: Request): Promise<DecodedIdToken> {
  const header = request.headers.get("authorization") ?? "";

  const match = /^Bearer\s+(.+)$/i.exec(header.trim());

  if (!match) {
    throw new AuthError("You must be signed in to use Angie.");
  }

  try {
    return await getAuth(getAdminApp()).verifyIdToken(match[1], true);
  } catch {
    throw new AuthError("Your session expired. Sign in again.");
  }
}
