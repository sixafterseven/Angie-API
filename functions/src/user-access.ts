/*
 * Firestore-backed user access for Angie OS (Cloud Functions side).
 *
 * The authoritative allowlist is the Firestore `users` collection — one
 * document per approved employee, keyed by lowercase email, with an `active`
 * flag and a `permissions` map. There is no hardcoded list of emails here;
 * membership and permissions are data in Firestore. This module holds the
 * normalization rule, the active/permission tests, and the Admin SDK lookup.
 */

import type {Firestore} from 'firebase-admin/firestore';

export const USERS_COLLECTION = 'users';

/** The permission flags a user document may carry. */
export interface UserPermissions {
  knowledgeRead?: boolean;
  knowledgeWrite?: boolean;
  knowledgeApprove?: boolean;
  manageAgents?: boolean;
  emailSend?: boolean;
  campaignLaunch?: boolean;
}

export type PermissionName = keyof UserPermissions;

/** The fields an Angie OS user document is expected to carry. */
export interface UserRecord {
  email?: string;
  active?: boolean;
  role?: string;
  displayName?: string;
  permissions?: UserPermissions;
}

/**
 * Reduces an email to its canonical form: trimmed and lowercased. This is the
 * value used as the users document ID.
 *
 * @param {string | null | undefined} email Raw email.
 * @return {string} Normalized email, or '' when absent.
 */
export function normalizeEmail(email?: string | null): string {
  return (email ?? '').trim().toLowerCase();
}

/**
 * Reports whether a loaded user document is an approved, active employee.
 *
 * @param {UserRecord | null | undefined} data The document data, or null.
 * @return {boolean} True only when the document exists and active === true.
 */
export function isActiveUserRecord(
    data: UserRecord | null | undefined,
): boolean {
  return Boolean(data) && data?.active === true;
}

/**
 * Reports whether an active user holds a given permission.
 *
 * @param {UserRecord | null | undefined} data The user document.
 * @param {PermissionName} name The permission to check.
 * @return {boolean} True only when the user is active and the flag is true.
 */
export function hasPermission(
    data: UserRecord | null | undefined,
    name: PermissionName,
): boolean {
  return isActiveUserRecord(data) && data?.permissions?.[name] === true;
}

/**
 * Loads a user document by normalized email.
 *
 * @param {Firestore} db Admin Firestore instance.
 * @param {string} email Email to look up (normalized internally).
 * @return {Promise<UserRecord | null>} The record, or null when absent.
 */
export async function lookupUser(
    db: Firestore,
    email: string,
): Promise<UserRecord | null> {
  const normalized = normalizeEmail(email);

  if (!normalized) {
    return null;
  }

  const snapshot = await db.collection(USERS_COLLECTION).doc(normalized).get();

  return snapshot.exists ? (snapshot.data() as UserRecord) : null;
}
