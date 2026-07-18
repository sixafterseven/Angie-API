# Production Domain — angie.micahamari.com

Make `https://angie.micahamari.com` the one canonical production URL for the
**existing** Firebase App Hosting app. This does **not** create a second app or
duplicate the backend — same Firebase project (`micah-amari-angie-os`), same
Firestore, Storage, Cloud Functions, auth, and Ask Angie API.

The codebase carries no hardcoded app URLs (all navigation is relative, sign-in
uses `signInWithPopup` which returns to the app's own origin, `authDomain` comes
from env). So the code side is just centralized config; the rest is DNS + Console
setup you must perform. **Do not consider the domain live until the verification
checklist at the bottom passes.**

---

## What the code change provides
- `web/src/lib/app-config.ts` — `APP_URL`, `ALLOWED_ORIGINS`, `appUrl()`. Single
  source for any absolute link. Production reads `NEXT_PUBLIC_APP_URL`; dev/test
  fall back to `http://localhost:3000`.
- `web/src/proxy.ts` — **opt-in** canonical redirect (off unless
  `CANONICAL_REDIRECT=1`). Never touches localhost/preview by default.

## Manual steps (in order — I cannot perform these)

### 1. App Hosting environment variables
Set on the **production backend** (Firebase Console → App Hosting → your backend →
Settings → Environment, or via an `apphosting.yaml`):

```
NEXT_PUBLIC_APP_URL = https://angie.micahamari.com
ALLOWED_ORIGINS     = https://angie.micahamari.com
```

Keep the existing `NEXT_PUBLIC_FIREBASE_*` and the `OPENAI_API_KEY` secret exactly
as they are. If you adopt an `apphosting.yaml`, it must include the full set so the
build doesn't lose them — template:

```yaml
# web/apphosting.yaml
runConfig:
  minInstances: 0
env:
  - variable: NEXT_PUBLIC_APP_URL
    value: https://angie.micahamari.com
    availability: [BUILD, RUNTIME]
  - variable: ALLOWED_ORIGINS
    value: https://angie.micahamari.com
    availability: [BUILD, RUNTIME]
  # Keep these — copy the current values from the backend config:
  - variable: NEXT_PUBLIC_FIREBASE_API_KEY
    value: <current value>
    availability: [BUILD, RUNTIME]
  - variable: NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
    value: micah-amari-angie-os.firebaseapp.com
    availability: [BUILD, RUNTIME]
  - variable: NEXT_PUBLIC_FIREBASE_PROJECT_ID
    value: micah-amari-angie-os
    availability: [BUILD, RUNTIME]
  - variable: NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
    value: micah-amari-angie-os.firebasestorage.app
    availability: [BUILD, RUNTIME]
  - variable: NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
    value: <current value>
    availability: [BUILD, RUNTIME]
  - variable: NEXT_PUBLIC_FIREBASE_APP_ID
    value: <current value>
    availability: [BUILD, RUNTIME]
  - variable: OPENAI_API_KEY
    secret: OPENAI_API_KEY   # keep in Cloud Secret Manager, never a plaintext value
    availability: [RUNTIME]
```
This repo intentionally does **not** commit `apphosting.yaml`, to avoid altering the
working backend's environment without a deliberate, reviewed change. The zero-risk
alternative is to add just the two new vars in the Console (additive).

### 2. Add the custom domain
Firebase Console → **App Hosting** → your backend → **Add custom domain** →
`angie.micahamari.com`. Firebase will display the exact DNS records to add.

### 3. DNS (at micahamari.com's DNS provider)
Add **only** records for the `angie` host, using the exact values Firebase shows in
step 2. It is typically:

| Type | Host / Name | Value | Notes |
|---|---|---|---|
| `A` (and/or `AAAA`) or `CNAME` | `angie` | *(the IPs / target Firebase shows)* | the app record |
| `TXT` | `angie` (or `_acme-challenge.angie`) | *(the token Firebase shows)* | domain verification |

**Exact values come from the Console — do not guess IPs.** Do **NOT** modify the apex
(`micahamari.com`), `MX`, `www`, or any other subdomain — the main site and email are
untouched.

### 4. Firebase Authentication authorized domains
Console → **Authentication → Settings → Authorized domains** → **Add domain** →
`angie.micahamari.com`. (Sign-in fails on an unauthorized domain.)

### 5. Google OAuth
Google Cloud Console → **APIs & Services → Credentials** → the OAuth 2.0 client →
**Authorized JavaScript origins** → add `https://angie.micahamari.com`. Redirect URIs
do not need changing — the popup flow uses the `*.firebaseapp.com` auth handler.

### 6. Canonical redirect (optional)
To bounce the Firebase-generated URL to the custom domain, set `CANONICAL_REDIRECT=1`
on the **production backend only** (not in `apphosting.yaml`, so previews stay
unaffected). The middleware then 308-redirects Firebase hosts → `angie.micahamari.com`.

### 7. App Check / CSP
Neither is configured today. No change required. If a Content-Security-Policy is added
later, include `angie.micahamari.com` and the Firebase auth/storage origins.

---

## Verification checklist — the domain is NOT "live" until ALL pass
- [ ] `angie.micahamari.com` resolves (DNS propagated).
- [ ] HTTPS certificate is active (no browser warning).
- [ ] Login works; logout returns to `/login`.
- [ ] Google sign-in popup completes and returns to `angie.micahamari.com`.
- [ ] Ask Angie API (`/api/ask-angie`) responds for a signed-in employee.
- [ ] File upload to `raw/{batchId}/…` works.
- [ ] Firestore reads (leads/batches) and Storage downloads work.
- [ ] No mixed-content or CORS errors in the console.
- [ ] Existing authorized employees can sign in.
- [ ] Desktop and mobile routes load.
- [ ] (If enabled) the Firebase-generated URL redirects to `angie.micahamari.com` with no loop.
