/*
 * Bootstrap/admin script: seed the Angie OS `users` collection.
 *
 * Creates or updates the initial approved employees. Dry-run by default; only
 * writes when passed --execute. It touches only the users listed below and
 * never deletes anything.
 *
 * The email list here is one-time provisioning DATA, not an authorization
 * allowlist — nothing in the running app reads it. After this runs, membership
 * is managed by editing documents in the users collection.
 *
 * Run instructions are at the bottom of this file and in the pull request.
 */

import {getApps, initializeApp} from 'firebase-admin/app';
import {FieldValue, getFirestore} from 'firebase-admin/firestore';

import {normalizeEmail, USERS_COLLECTION} from '../user-access';

const EXECUTE_FLAG = '--execute';

interface SeedUser {
  email: string;
  active: boolean;
  role: string;
  displayName: string;
}

/*
 * The initial approved employees. Edit a user's document in Firestore (or
 * re-run this script) to change membership later.
 */
const SEED_USERS: SeedUser[] = [
  {email: 'jason@micahamari.com', active: true, role: 'admin', displayName: 'Jason'},
  {email: 'kris@micahamari.com', active: true, role: 'staff', displayName: 'Kris'},
  {email: 'oreonna@micahamari.com', active: true, role: 'staff', displayName: 'Oreonna'},
  {email: 'alexa@micahamari.com', active: true, role: 'staff', displayName: 'Alexa'},
];

/** Reuses the initialized Admin app when the script is imported more than once. */
function getAdminApp() {
  const existing = getApps();

  return existing.length ? existing[0] : initializeApp();
}

async function main(): Promise<void> {
  const execute = process.argv.slice(2).includes(EXECUTE_FLAG);

  console.log('Angie OS — bootstrap users collection');
  console.log('=====================================');
  console.log(
      execute ?
        'MODE: EXECUTE — the users collection WILL be written.' :
        'MODE: DRY RUN — no changes will be made.',
  );
  console.log('');

  const db = getFirestore(getAdminApp());

  const planned: string[] = [];

  for (const seed of SEED_USERS) {
    const docId = normalizeEmail(seed.email);

    const ref = db.collection(USERS_COLLECTION).doc(docId);
    const snapshot = await ref.get();

    const action = snapshot.exists ? 'UPDATE' : 'CREATE';

    planned.push(
        `  ${action}  ${docId}  ` +
        `(active=${seed.active}, role=${seed.role}, displayName=${seed.displayName})`,
    );

    if (!execute) {
      continue;
    }

    // Never overwrite createdAt on an existing document.
    const base = {
      email: docId,
      active: seed.active,
      role: seed.role,
      displayName: seed.displayName,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (snapshot.exists) {
      await ref.set(base, {merge: true});
    } else {
      await ref.set({...base, createdAt: FieldValue.serverTimestamp()});
    }
  }

  console.log(execute ? 'Applied changes:' : 'Planned changes:');
  console.log(planned.join('\n'));
  console.log('');

  if (!execute) {
    console.log('Dry run complete. No documents were written.');
    console.log(`Re-run with ${EXECUTE_FLAG} to apply the changes above.`);
    return;
  }

  console.log(`Done. ${SEED_USERS.length} user document(s) written.`);
}

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
 *   1. Authenticate the Admin SDK against the project:
 *        export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *        export GOOGLE_CLOUD_PROJECT=micah-amari-angie-os
 *      (or `gcloud auth application-default login` + `gcloud config set project ...`)
 *
 *   2. Build:
 *        npm run build
 *
 *   3. Dry run (prints planned changes, writes nothing):
 *        node lib/scripts/bootstrap-users.js
 *
 *   4. Apply:
 *        node lib/scripts/bootstrap-users.js --execute
 *
 * The service account needs Firestore write access (e.g. Cloud Datastore User).
 */
