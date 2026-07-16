/*
 * Firestore-backed user access for Angie OS.
 *
 * The authoritative allowlist is the Firestore `users` collection — one
 * document per approved employee, keyed by lowercase email, with an `active`
 * flag. This module holds the normalization rule, the active-record test, the
 * Admin SDK lookup, and the beforeSignIn decision used by the blocking function
 * in index.ts.
 *
 * There is no hardcoded list of emails here; membership is data in Firestore.
 */

import {logger} from 'firebase-functions';
import {HttpsError} from 'firebase-functions/v2/identity';
import type {Firestore} from 'firebase-admin/firestore';

export const USERS_COLLECTION = 'users';

/*
 * Surfaced to the browser by Firebase Auth when a sign-in is rejected.
 */
export const UNAUTHORIZED_MESSAGE =
  'This Google account is not authorized to access Angie OS.';

/** The fields an Angie OS user document is expected to carry. */
export interface UserRecord {
  email?: string;
  active?: boolean;
  role?: string;
  displayName?: string;
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

/*
 * The shape this handler needs from a Firebase Authentication blocking event.
 * AuthBlockingEvent satisfies it structurally; declaring it this way keeps the
 * decision testable without constructing a full auth event.
 */
export interface SignInAttempt {
  data?: {
    email?: string;
    uid?: string;
  };
}

/** Loads a user record by already-normalized email, or null. */
export type UserLookup = (email: string) => Promise<UserRecord | null>;

/**
 * The beforeSignIn decision.
 *
 * Allows sign-in only when the email resolves to an existing users document
 * with active === true. Rejects missing, inactive, unknown, or malformed
 * accounts with HttpsError('permission-denied'), which Firebase Authentication
 * turns into a failed sign-in. Fails closed if the lookup itself errors.
 *
 * The lookup is injected so the decision can be unit-tested without Firestore.
 *
 * @param {SignInAttempt} event The blocking event from Firebase Auth.
 * @param {UserLookup} lookup Resolves a users record by normalized email.
 */
export async function assertApprovedEmployeeSignIn(
    event: SignInAttempt,
    lookup: UserLookup,
): Promise<void> {
  const email = normalizeEmail(event.data?.email);

  if (!email) {
    logger.warn('Blocked sign-in: missing email.', {uid: event.data?.uid});

    throw new HttpsError('permission-denied', UNAUTHORIZED_MESSAGE);
  }

  let record: UserRecord | null;

  try {
    record = await lookup(email);
  } catch (error) {
    // Fail closed: never allow a sign-in we could not verify.
    logger.error('Blocked sign-in: user lookup failed.', {
      emailDomain: email.split('@').pop(),
      error: error instanceof Error ? error.message : String(error),
    });

    throw new HttpsError('permission-denied', UNAUTHORIZED_MESSAGE);
  }

  if (!isActiveUserRecord(record)) {
    // Only the domain is logged, never the full unapproved address.
    logger.warn('Blocked sign-in for an unapproved or inactive account.', {
      emailDomain: email.split('@').pop(),
      uid: event.data?.uid,
      found: Boolean(record),
    });

    throw new HttpsError('permission-denied', UNAUTHORIZED_MESSAGE);
  }

  logger.info('Approved active employee signed in.', {uid: event.data?.uid});
}
