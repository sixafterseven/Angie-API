/*
 * Turns a raw sign-in error into a message that is safe to show a user.
 *
 * When the beforeSignIn blocking function rejects an account, Firebase surfaces
 * it as an auth/internal-error whose message embeds the Cloud Function URL and
 * the raw 403 body. That must never reach the UI. This module maps the
 * authorization signals to one clean sentence, maps common benign failures to
 * friendly text, and falls back to a generic message for anything unrecognized
 * so no raw Firebase string is ever displayed.
 *
 * The caller is responsible for logging the original error to the console for
 * debugging; classifyAuthError intentionally returns only display text.
 */

import { UNAUTHORIZED_MESSAGE } from "@/lib/user-access";

const GENERIC_MESSAGE = "Sign-in could not be completed. Please try again.";

/*
 * Substrings that indicate the blocking function (or an equivalent
 * authorization layer) refused the sign-in. Matched case-insensitively.
 * "forceEmployee" also covers "enforceEmployeeAllowlist"; both are listed for
 * clarity and in case the function is ever renamed.
 */
const UNAUTHORIZED_SIGNALS = [
  "permission-denied",
  "permission_denied",
  "forbidden",
  "403",
  "blocking_function",
  "forceemployee",
  "enforceemployeeallowlist",
];

/*
 * Firebase auth error codes that are benign and unrelated to authorization.
 * These keep a specific, readable message instead of the generic fallback.
 */
const BENIGN_MESSAGES: Record<string, string> = {
  "auth/popup-closed-by-user": "Sign-in was cancelled.",
  "auth/cancelled-popup-request": "Sign-in was cancelled.",
  "auth/popup-blocked":
    "Your browser blocked the sign-in popup. Allow popups and try again.",
  "auth/network-request-failed":
    "Network error during sign-in. Check your connection and try again.",
  "auth/too-many-requests":
    "Too many sign-in attempts. Wait a moment and try again.",
  "auth/user-disabled": "This account has been disabled.",
};

function readCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    return String((error as { code: unknown }).code ?? "").toLowerCase();
  }

  return "";
}

function readMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "";
}

/**
 * Returns the user-facing message for a caught sign-in error.
 *
 * @param {unknown} error The error thrown by signInWithPopup or a follow-up
 *   allowlist check.
 * @return {string} A message safe to render. Never contains a URL, a stack, or
 *   a raw Firebase payload.
 */
export function classifyAuthError(error: unknown): string {
  const code = readCode(error);
  const haystack = `${code} ${readMessage(error)}`.toLowerCase();

  // auth/internal-error is how Firebase wraps a blocking-function rejection,
  // so on its own it is treated as an authorization failure.
  if (code === "auth/internal-error") {
    return UNAUTHORIZED_MESSAGE;
  }

  if (UNAUTHORIZED_SIGNALS.some((signal) => haystack.includes(signal))) {
    return UNAUTHORIZED_MESSAGE;
  }

  if (code in BENIGN_MESSAGES) {
    return BENIGN_MESSAGES[code];
  }

  return GENERIC_MESSAGE;
}
