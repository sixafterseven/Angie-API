/*
 * Tests for the server-side sign-in allowlist.
 *
 * Uses the built-in node:test runner against the compiled output in lib/, so
 * no test framework dependency is added. Run with:
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
  isApprovedEmployeeEmail,
  APPROVED_EMPLOYEE_EMAILS,
  UNAUTHORIZED_MESSAGE,
} = require('../lib/employee-allowlist');

const {enforceEmployeeAllowlist} = require('../lib/index');

/*
 * Runs the real beforeSignIn decision the way Firebase Authentication does and
 * reports the outcome.
 *
 * The exported trigger is a BlockingFunction, which is an Express (req, res)
 * handler and cannot be called with an auth event, so the decision itself is
 * the unit under test. A separate test below asserts the trigger is wired to
 * that decision.
 */
function signIn(email) {
  try {
    assertApprovedEmployeeSignIn({data: {uid: 'test-uid', email}});
    return {allowed: true};
  } catch (error) {
    return {
      allowed: false,
      code: error.code,
      message: error.message,
    };
  }
}

test('both approved employees may sign in', () => {
  assert.deepEqual(APPROVED_EMPLOYEE_EMAILS, [
    'jason@micahamari.com',
    'admin7@sixafterseven.com',
  ]);

  for (const email of APPROVED_EMPLOYEE_EMAILS) {
    assert.equal(isApprovedEmployeeEmail(email), true, email);
    assert.deepEqual(signIn(email), {allowed: true}, email);
  }
});

test('approved employees are matched case-insensitively and trimmed', () => {
  for (const email of ['JASON@MicahAmari.com', '  admin7@SixAfterSeven.com ']) {
    assert.equal(isApprovedEmployeeEmail(email), true, email);
    assert.equal(signIn(email).allowed, true, email);
  }
});

test('an unapproved Gmail account is rejected', () => {
  assert.equal(isApprovedEmployeeEmail('attacker@gmail.com'), false);

  const result = signIn('attacker@gmail.com');

  assert.equal(result.allowed, false);
  assert.equal(result.code, 'permission-denied');
  assert.match(result.message, /not authorized to access Angie OS/);
});

test('an unapproved @micahamari.com address is rejected', () => {
  // No domain-wide access: sharing a domain with an approved employee is not
  // enough to sign in.
  assert.equal(isApprovedEmployeeEmail('someoneelse@micahamari.com'), false);

  const result = signIn('someoneelse@micahamari.com');

  assert.equal(result.allowed, false);
  assert.equal(result.code, 'permission-denied');
  assert.match(result.message, /not authorized to access Angie OS/);
});

test('an unapproved @sixafterseven.com address is rejected', () => {
  assert.equal(isApprovedEmployeeEmail('someoneelse@sixafterseven.com'), false);

  const result = signIn('someoneelse@sixafterseven.com');

  assert.equal(result.allowed, false);
  assert.equal(result.code, 'permission-denied');
  assert.match(result.message, /not authorized to access Angie OS/);
});

test('a null, undefined, empty or missing email is rejected', () => {
  for (const email of [null, undefined, '', '   ']) {
    assert.equal(isApprovedEmployeeEmail(email), false, String(email));

    const result = signIn(email);

    assert.equal(result.allowed, false, String(email));
    assert.equal(result.code, 'permission-denied', String(email));
  }

  // An event carrying no data at all must be denied, not crash with a
  // TypeError.
  let result;

  try {
    assertApprovedEmployeeSignIn({});
    result = {allowed: true};
  } catch (error) {
    result = {allowed: false, code: error.code};
  }

  assert.equal(result.allowed, false);
  assert.equal(result.code, 'permission-denied');
});

test('the rejection message is the one the UI shows', () => {
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
  assert.equal(endpoint.blockingTrigger.eventType, 'providers/cloud.auth/eventTypes/user.beforeSignIn');
});
