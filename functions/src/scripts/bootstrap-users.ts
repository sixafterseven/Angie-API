/*
 * Bootstrap/admin script: one-time provisioning of the Angie OS `users`
 * collection.
 *
 * Creates or updates the initial approved employees with their role and
 * permissions. Dry-run by default; only writes when passed --execute. It
 * touches only the users listed below and never deletes anything.
 *
 * THIS IS ONE-TIME PROVISIONING, NOT ONGOING EMPLOYEE MANAGEMENT. After launch,
 * add / deactivate / re-permission employees by writing the `users` collection
 * through an admin-only script, a secure callable function, or a future admin
 * UI (all via the Admin SDK). Do not treat editing SEED_USERS as the way to
 * manage access — code is not the operational source of authorization.
 *
 * The email list here is provisioning DATA, not a runtime allowlist — nothing
 * in the running app reads it.
 */

import {getApps, initializeApp} from 'firebase-admin/app';
import {FieldValue, getFirestore} from 'firebase-admin/firestore';

import {normalizeEmail, UserPermissions, USERS_COLLECTION} from '../user-access';

const EXECUTE_FLAG = '--execute';

interface SeedUser {
  email: string;
  active: boolean;
  role: string;
  displayName: string;
  permissions: UserPermissions;
}

const ALL_PERMISSIONS: UserPermissions = {
  knowledgeRead: true,
  knowledgeWrite: true,
  knowledgeApprove: true,
  manageAgents: true,
  emailSend: true,
  campaignLaunch: true,
};

/*
 * The currently-active production employees. These are exactly the accounts the
 * live app authorizes today (previously the hardcoded allowlist), seeded as
 * admins so switching authorization to the users collection locks no one out.
 * Add further employees through the operational tooling described above, not here.
 */
const SEED_USERS: SeedUser[] = [
  {
    email: 'jason@micahamari.com',
    active: true,
    role: 'admin',
    displayName: 'Jason',
    permissions: ALL_PERMISSIONS,
  },
  {
    email: 'admin7@sixafterseven.com',
    active: true,
    role: 'admin',
    displayName: 'Admin',
    permissions: ALL_PERMISSIONS,
  },
];

/** Reuses the initialized Admin app when the script is imported more than once. */
function getAdminApp() {
  const existing = getApps();

  return existing.length ? existing[0] : initializeApp();
}

async function main(): Promise<void> {
  const execute = process.argv.slice(2).includes(EXECUTE_FLAG);

  console.log('Angie OS — bootstrap users collection (one-time provisioning)');
  console.log('============================================================');
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
        `(active=${seed.active}, role=${seed.role}, all permissions)`,
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
      permissions: seed.permissions,
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
 *   2. Build:  npm run build
 *   3. Dry run (writes nothing):  node lib/scripts/bootstrap-users.js
 *   4. Apply:  node lib/scripts/bootstrap-users.js --execute
 *
 * Run this BEFORE deploying the users-collection rules and web app, so the
 * current employees exist and no one is locked out. The service account needs
 * Firestore write access (e.g. Cloud Datastore User).
 */
