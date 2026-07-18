/**
 * Centralized application URL / origin configuration.
 *
 * One source of truth for the canonical production URL. Any absolute link the
 * app builds (email links, exports, callback URLs, future agent links) should
 * use APP_URL rather than a hardcoded host, so switching domains never means
 * hunting through the code.
 *
 * Production sets NEXT_PUBLIC_APP_URL=https://angie.micahamari.com (via App
 * Hosting env). When unset, it falls back to localhost for development/test.
 */

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

/** The canonical app URL. `https://angie.micahamari.com` in production. */
export const APP_URL = stripTrailingSlash(
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
);

/**
 * Origins allowed to call the app (for any future CORS need). Defaults to just
 * APP_URL; set ALLOWED_ORIGINS to a comma-separated list to widen it.
 */
export const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? APP_URL)
  .split(",")
  .map((origin) => stripTrailingSlash(origin.trim()))
  .filter(Boolean);

export function isAllowedOrigin(origin: string | null | undefined): boolean {
  if (!origin) {
    return false;
  }

  return ALLOWED_ORIGINS.includes(stripTrailingSlash(origin));
}

/** Builds an absolute URL under the canonical app origin. */
export function appUrl(path = "/"): string {
  return `${APP_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
