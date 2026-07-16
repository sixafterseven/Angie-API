/**
 * Shared constants and helpers for the Firestore-backed user directory.
 *
 * The authoritative allowlist lives in the Firestore `users` collection — one
 * document per approved employee, keyed by lowercase email, with an `active`
 * flag and a `permissions` map. This module holds only the pure pieces both the
 * browser and the server need; it imports no Firebase package so it is safe on
 * either runtime.
 *
 * There is no hardcoded list of emails anywhere in the app. Employees are
 * managed by writing the `users` collection (admin-only script / callable /
 * future admin UI), never by editing code.
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

/** The permission flags a user document may carry. */
export type UserPermissions = {
  knowledgeRead?: boolean;
  knowledgeWrite?: boolean;
  knowledgeApprove?: boolean;
  manageAgents?: boolean;
  emailSend?: boolean;
  campaignLaunch?: boolean;
};

export type PermissionName = keyof UserPermissions;

/** The fields an Angie OS user document is expected to carry. */
export type UserRecord = {
  email?: string;
  active?: boolean;
  role?: string;
  displayName?: string;
  permissions?: UserPermissions;
};

/**
 * Reduces an email to its canonical form: trimmed and lowercased. This is the
 * value used as the `users` document ID.
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

/**
 * Reports whether an active user holds a given permission.
 */
export function hasPermission(
  data: UserRecord | null | undefined,
  name: PermissionName,
): boolean {
  return isActiveUserRecord(data) && data?.permissions?.[name] === true;
}
