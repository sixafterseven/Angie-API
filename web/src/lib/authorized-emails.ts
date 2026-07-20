/**
 * The single source of truth for who may use Angie OS.
 *
 * Everything that needs to know whether an account is approved imports from
 * here: the login page, the AppShell auth wrapper, and the Ask Angie API
 * route. Do not copy this list anywhere else in the app.
 *
 * This module is imported by both the browser and the server, so it must not
 * import firebase, firebase-admin, or any other runtime-specific package.
 *
 * Note: firestore.rules and storage.rules carry the same list, because the
 * rules language cannot import from TypeScript. When you add an employee here,
 * add them there too and redeploy the rules.
 */

export const APPROVED_EMPLOYEE_EMAILS = [
  "jason@micahamari.com",
  "admin7@sixafterseven.com",
  "kris@micahamari.com",
  "alexa@micahamari.com",
  "oreonna@micahamari.com",
];

/** Shown to anyone who signs in with a Google account that is not approved. */
export const UNAUTHORIZED_MESSAGE =
  "This Google account is not authorized to access Angie OS.";

/**
 * Set by AppShell before it bounces a rejected user to /login, so the login
 * page knows to explain why they were sent back.
 */
export const ACCESS_DENIED_KEY = "angie-os:access-denied";

const approvedEmails = new Set(
  APPROVED_EMPLOYEE_EMAILS.map((email) => email.trim().toLowerCase()),
);

/**
 * Returns true only for an approved employee address.
 *
 * Deliberately an exact allowlist, not a domain check: a new Google account on
 * an approved domain must not be able to grant itself access.
 */
export function isApprovedEmployee(email?: string | null): boolean {
  if (!email) {
    return false;
  }

  return approvedEmails.has(email.trim().toLowerCase());
}
