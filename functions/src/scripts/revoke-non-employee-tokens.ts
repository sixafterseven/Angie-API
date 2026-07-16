/*
 * One-time admin script: revoke refresh tokens for every non-employee.
 *
 * What it does
 * ------------
 * 1. Lists every Firebase Authentication user.
 * 2. Leaves the approved employee accounts untouched.
 * 3. Revokes refresh tokens for everyone else, which forces their existing
 *    sessions to expire the next time a token is refreshed.
 * 4. Never deletes a user.
 *
 * It is dry-run by default and prints a full summary. It only makes changes
 * when passed --execute.
 *
 * The approved list is imported from employee-allowlist.ts so this script and
 * the beforeSignIn blocking function stay in agreement — the list is not
 * duplicated here.
 *
 * Run instructions are at the bottom of this file and in the pull request.
 */

import {getApps, initializeApp} from 'firebase-admin/app';
import {getAuth, UserRecord} from 'firebase-admin/auth';

import {
  APPROVED_EMPLOYEE_EMAILS,
  isApprovedEmployeeEmail,
} from '../employee-allowlist';

const EXECUTE_FLAG = '--execute';

/** Reuses the initialized Admin app when the script is imported more than once. */
function getAdminApp() {
  const existing = getApps();

  return existing.length ? existing[0] : initializeApp();
}

/**
 * Loads every Firebase Auth user, following pagination to the end.
 *
 * @return {Promise<UserRecord[]>} All users in the project.
 */
async function listAllUsers(): Promise<UserRecord[]> {
  const auth = getAuth(getAdminApp());

  const users: UserRecord[] = [];

  let pageToken: string | undefined = undefined;

  do {
    const page = await auth.listUsers(1000, pageToken);

    users.push(...page.users);

    pageToken = page.pageToken;
  } while (pageToken);

  return users;
}

/**
 * Describes a user for the summary without dumping the whole record.
 *
 * @param {UserRecord} user A Firebase Auth user.
 * @return {string} A short, readable label.
 */
function describe(user: UserRecord): string {
  const email = user.email ? user.email : '(no email)';

  return `${email}  [uid: ${user.uid}]`;
}

async function main(): Promise<void> {
  const execute = process.argv.slice(2).includes(EXECUTE_FLAG);

  console.log('Angie OS — revoke refresh tokens for non-employees');
  console.log('==================================================');
  console.log(
      execute ?
        'MODE: EXECUTE — refresh tokens WILL be revoked.' :
        'MODE: DRY RUN — no changes will be made.',
  );
  console.log('');
  console.log('Approved employees (kept active):');

  for (const email of APPROVED_EMPLOYEE_EMAILS) {
    console.log(`  - ${email}`);
  }

  console.log('');

  const users = await listAllUsers();

  const keep = users.filter((user) => isApprovedEmployeeEmail(user.email));
  const revoke = users.filter((user) => !isApprovedEmployeeEmail(user.email));

  console.log(`Total users found: ${users.length}`);
  console.log(`  Keep active:     ${keep.length}`);
  console.log(`  Revoke tokens:   ${revoke.length}`);
  console.log('');

  console.log('Accounts that will be KEPT active:');

  if (keep.length === 0) {
    console.log('  (none matched the allowlist)');
  } else {
    for (const user of keep) {
      console.log(`  KEEP    ${describe(user)}`);
    }
  }

  console.log('');
  console.log('Accounts whose refresh tokens will be REVOKED:');

  if (revoke.length === 0) {
    console.log('  (none — every user is on the allowlist)');
  } else {
    for (const user of revoke) {
      console.log(`  REVOKE  ${describe(user)}`);
    }
  }

  console.log('');

  if (!execute) {
    console.log(
        'Dry run complete. No tokens were revoked and no users were changed.',
    );
    console.log(`Re-run with ${EXECUTE_FLAG} to apply the revocations above.`);
    return;
  }

  if (revoke.length === 0) {
    console.log('Nothing to revoke. Done.');
    return;
  }

  console.log('Executing revocations...');

  const auth = getAuth(getAdminApp());

  let succeeded = 0;
  const failures: string[] = [];

  for (const user of revoke) {
    try {
      // revokeRefreshTokens invalidates existing sessions on next refresh. It
      // never deletes the account.
      await auth.revokeRefreshTokens(user.uid);

      succeeded += 1;

      console.log(`  revoked  ${describe(user)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      failures.push(`${describe(user)} — ${message}`);

      console.error(`  FAILED   ${describe(user)} — ${message}`);
    }
  }

  console.log('');
  console.log('Revocation summary:');
  console.log(`  Succeeded: ${succeeded}`);
  console.log(`  Failed:    ${failures.length}`);

  if (failures.length > 0) {
    console.log('');
    console.log('Failures:');

    for (const failure of failures) {
      console.log(`  - ${failure}`);
    }

    // Signal a non-zero exit so the operator notices partial completion.
    process.exitCode = 1;
  }
}

// Only run when invoked directly (node lib/scripts/revoke-non-employee-tokens.js),
// never on import.
if (require.main === module) {
  main().catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
}

/*
 * How to run
 * ----------
 * From the functions/ directory:
 *
 *   1. Authenticate the Admin SDK against the project. Either:
 *        export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *      or, if you have the gcloud CLI:
 *        gcloud auth application-default login
 *        gcloud config set project micah-amari-angie-os
 *      Also set the project id the Admin SDK should target:
 *        export GOOGLE_CLOUD_PROJECT=micah-amari-angie-os
 *
 *   2. Build:
 *        npm run build
 *
 *   3. Dry run (prints the summary, changes nothing):
 *        node lib/scripts/revoke-non-employee-tokens.js
 *
 *   4. Apply the revocations:
 *        node lib/scripts/revoke-non-employee-tokens.js --execute
 *
 * The service account must have permission to manage Firebase Auth users
 * (for example the Firebase Authentication Admin role).
 */
