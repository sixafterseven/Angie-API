/**
 * Shared constants and helpers for the Firestore-backed user directory.
 *
 * The authoritative allowlist now lives in the Firestore `users` collection —
 * one document per approved employee, keyed by lowercase email. This module
 * holds only the pure pieces both the browser and the server need: the
 * collection name, the normalization rule, the active-record test, and the
 * user-facing messages. It imports no Firebase package so it is safe on either
 * runtime.
 *
 * There is no hardcoded list of emails anywhere in the app; add or remove an
 * employee by editing their `users` document (see the bootstrap script).
 */

export const USERS_COLLECTION = "users";

/** Shown to anyone whose Google account is not an approved, active employee. */
export const UNAUTHORIZED_MESSAGE =
  "This Google account is not authorized to access Angie OS.";

/**
 * Set by AppShell before it bounces a rejected user to /login, so the login
 * page knows to explain why they were sent back.
 */
export const ACCESS_DENIED_KEY = "angie-os:access-denied";

/** The fields an Angie OS user document is expected to carry. */
export type UserRecord = {
  email?: string;
  active?: boolean;
  role?: string;
  displayName?: string;
};

/**
 * Reduces an email to its canonical form: trimmed and lowercased.
 *
 * This is the value used as the `users` document ID, so both the lookup key and
 * the stored key pass through it.
 */
export function normalizeEmail(email?: string | null): string {
  return (email ?? "").trim().toLowerCase();
}

/**
 * Reports whether a loaded user document represents an approved, active
 * employee. A missing document or `active !== true` is never approved — there
 * is no domain-level shortcut.
 */
export function isActiveUserRecord(data: UserRecord | null | undefined): boolean {
  return Boolean(data) && data?.active === true;
}
