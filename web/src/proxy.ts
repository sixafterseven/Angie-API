import { NextRequest, NextResponse } from "next/server";

/**
 * Canonical-host redirect — OPT-IN and off by default.
 *
 * When `CANONICAL_REDIRECT=1` is set on the production backend (and only there),
 * a request arriving on the Firebase-generated App Hosting host is 308-redirected
 * to the canonical `NEXT_PUBLIC_APP_URL` (https://angie.micahamari.com), so there
 * is one canonical production URL.
 *
 * Safety: it does nothing unless the flag is set, never touches localhost or the
 * canonical host itself (no loop), and only matches Firebase-generated hosts.
 * Set the flag ONLY on the production backend — never in apphosting.yaml — so
 * preview deployments (which also run on *.run.app) are never redirected.
 */

const CANONICAL = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
const ENABLED =
  process.env.CANONICAL_REDIRECT === "1" && CANONICAL.startsWith("https://");

const FIREBASE_GENERATED_HOST = /\.(run\.app|hosted\.app|web\.app|firebaseapp\.com)$/i;

export function proxy(request: NextRequest) {
  if (!ENABLED) {
    return NextResponse.next();
  }

  const host = request.headers.get("host") ?? "";
  const canonicalHost = new URL(CANONICAL).host;

  if (!host || host === canonicalHost || !FIREBASE_GENERATED_HOST.test(host)) {
    return NextResponse.next();
  }

  const target = new URL(
    request.nextUrl.pathname + request.nextUrl.search,
    CANONICAL,
  );

  return NextResponse.redirect(target, 308);
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico).*)"],
};
