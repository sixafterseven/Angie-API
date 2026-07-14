/*
 * The approved employee allowlist for Angie OS sign-in.
 *
 * This is the authoritative list. It is enforced server-side by the
 * enforceEmployeeAllowlist blocking function in index.ts, which runs inside
 * Firebase Authentication before a sign-in is allowed to complete.
 *
 * The web app carries the same list in web/src/lib/authorized-emails.ts and
 * firestore.rules / storage.rules carry it again. Those are defence in depth,
 * not the boundary: a Cloud Functions package cannot import from the Next.js
 * app, and the rules language cannot import TypeScript. When you add an
 * employee, update all four places.
 */

import {logger} from 'firebase-functions';
import {HttpsError} from 'firebase-functions/v2/identity';

export const APPROVED_EMPLOYEE_EMAILS = [
  'jason@micahamari.com',
  'admin7@sixafterseven.com',
];

/*
 * Surfaced to the browser by Firebase Auth when a sign-in is rejected.
 */
export const UNAUTHORIZED_MESSAGE =
  'This Google account is not authorized to access Angie OS.';

const approvedEmails = new Set(
    APPROVED_EMPLOYEE_EMAILS.map((email) => email.trim().toLowerCase()),
);

/**
 * Reports whether an email address belongs to an approved employee.
 *
 * Deliberately an exact allowlist rather than a domain check: a new Google
 * account on an approved domain must not be able to grant itself access. A
 * missing or empty address is never approved.
 *
 * @param {string | null | undefined} email Address from the auth event.
 * @return {boolean} True only for an approved employee address.
 */
export function isApprovedEmployeeEmail(email?: string | null): boolean {
  if (!email) {
    return false;
  }

  return approvedEmails.has(email.trim().toLowerCase());
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

/**
 * The beforeSignIn decision.
 *
 * Throws HttpsError('permission-denied') for any account that is not an
 * approved employee, which Firebase Authentication turns into a failed sign-in.
 * Returns normally for an approved employee.
 *
 * Kept separate from the trigger registration in index.ts because a
 * BlockingFunction is an Express handler and cannot be invoked directly, so
 * this is the unit under test.
 *
 * @param {SignInAttempt} event The blocking event from Firebase Auth.
 */
export function assertApprovedEmployeeSignIn(event: SignInAttempt): void {
  const email = event.data?.email;

  if (!isApprovedEmployeeEmail(email)) {
    // The address itself is not logged, only its domain, to avoid writing an
    // unapproved person's email address into the function logs.
    logger.warn('Blocked sign-in for an unapproved account.', {
      emailDomain: email ? email.split('@').pop() : 'no-email',
      uid: event.data?.uid,
    });

    throw new HttpsError('permission-denied', UNAUTHORIZED_MESSAGE);
  }

  logger.info('Approved employee signed in.', {
    uid: event.data?.uid,
  });
}
