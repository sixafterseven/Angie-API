/*
 * Tests for the Firestore-backed sign-in decision.
 *
 * The beforeSignIn decision takes an injected user-lookup, so the full approval
 * matrix is tested here against an in-memory users store — no emulator, no new
 * dependency. Run with:
 *
 *   npm test
 */

const test = require('node:test');
const assert = require('node:assert/strict');

/*
 * index.ts registers a Storage trigger at module load, which needs a bucket
 * name. Provide the standard unit-testing config before requiring it. Nothing
 * here contacts Firebase.
 */
process.env.GCLOUD_PROJECT = 'micah-amari-angie-os';
process.env.FIREBASE_CONFIG = JSON.stringify({
  projectId: 'micah-amari-angie-os',
  storageBucket: 'micah-amari-angie-os.firebasestorage.app',
});

const {
  assertApprovedEmployeeSignIn,
  isActiveUserRecord,
  normalizeEmail,
  UNAUTHORIZED_MESSAGE,
} = require('../lib/user-access');

const {enforceEmployeeAllowlist} = require('../lib/index');

/*
 * In-memory stand-in for the users collection, keyed by normalized email. The
 * decision normalizes before it calls the lookup, so keys here are normalized.
 */
const USERS = new Map([
  ['jason@micahamari.com', {email: 'jason@micahamari.com', active: true, role: 'admin'}],
  ['kris@micahamari.com', {email: 'kris@micahamari.com', active: true, role: 'staff'}],
  ['oreonna@micahamari.com', {email: 'oreonna@micahamari.com', active: true, role: 'staff'}],
  ['alexa@micahamari.com', {email: 'alexa@micahamari.com', active: true, role: 'staff'}],
  ['inactive@micahamari.com', {email: 'inactive@micahamari.com', active: false, role: 'staff'}],
]);

const lookup = async (email) => USERS.get(email) ?? null;

/*
 * Runs the real beforeSignIn decision the way the trigger does and reports the
 * outcome.
 */
async function signIn(email, lookupFn = lookup) {
  try {
    await assertApprovedEmployeeSignIn({data: {uid: 'test-uid', email}}, lookupFn);
    return {allowed: true};
  } catch (error) {
    return {allowed: false, code: error.code, message: error.message};
  }
}

test('all four approved active users may sign in', async () => {
  for (const email of [
    'jason@micahamari.com',
    'kris@micahamari.com',
    'oreonna@micahamari.com',
    'alexa@micahamari.com',
  ]) {
    assert.deepEqual(await signIn(email), {allowed: true}, email);
  }
});

test('an approved but inactive user is rejected', async () => {
  const result = await signIn('inactive@micahamari.com');

  assert.equal(result.allowed, false);
  assert.equal(result.code, 'permission-denied');
  assert.match(result.message, /not authorized to access Angie OS/);
});

test('an unknown Gmail account is rejected', async () => {
  const result = await signIn('attacker@gmail.com');

  assert.equal(result.allowed, false);
  assert.equal(result.code, 'permission-denied');
});

test('an unknown @micahamari.com address is rejected', async () => {
  // No domain shortcut: sharing a domain with an employee is not enough.
  const result = await signIn('someoneelse@micahamari.com');

  assert.equal(result.allowed, false);
  assert.equal(result.code, 'permission-denied');
});

test('a missing / null / empty email is rejected without a lookup', async () => {
  for (const email of [null, undefined, '', '   ']) {
    // A throwing lookup proves the decision rejects before ever calling it.
    const result = await signIn(email, async () => {
      throw new Error('lookup should not be called for a missing email');
    });

    assert.equal(result.allowed, false, String(email));
    assert.equal(result.code, 'permission-denied', String(email));
  }
});

test('a mixed-case email is normalized and matched', async () => {
  assert.equal((await signIn('JASON@MicahAmari.com')).allowed, true);
});

test('an email with surrounding whitespace is normalized and matched', async () => {
  assert.equal((await signIn('  alexa@sixafterseven.com ')).allowed, false);
  assert.equal((await signIn('  alexa@micahamari.com ')).allowed, true);
});

test('the decision fails closed when the lookup throws', async () => {
  const result = await signIn('jason@micahamari.com', async () => {
    throw new Error('firestore unavailable');
  });

  assert.equal(result.allowed, false);
  assert.equal(result.code, 'permission-denied');
});

test('helper units behave as expected', () => {
  assert.equal(normalizeEmail('  Foo@Bar.COM '), 'foo@bar.com');
  assert.equal(normalizeEmail(null), '');
  assert.equal(isActiveUserRecord({active: true}), true);
  assert.equal(isActiveUserRecord({active: false}), false);
  assert.equal(isActiveUserRecord(null), false);
  assert.equal(isActiveUserRecord(undefined), false);
  assert.equal(
      UNAUTHORIZED_MESSAGE,
      'This Google account is not authorized to access Angie OS.',
  );
});

test('the trigger is registered as a beforeSignIn blocking function', () => {
  assert.equal(typeof enforceEmployeeAllowlist, 'function');

  const endpoint = enforceEmployeeAllowlist.__endpoint;

  assert.ok(endpoint, 'trigger has no endpoint metadata');
  assert.equal(endpoint.platform, 'gcfv2');
  assert.equal(endpoint.region[0], 'us-east1');
  assert.equal(
      endpoint.blockingTrigger.eventType,
      'providers/cloud.auth/eventTypes/user.beforeSignIn',
  );
});
