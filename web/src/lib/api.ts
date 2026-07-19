/**
 * Small authenticated fetch helper. Attaches the signed-in user's Firebase ID
 * token and unwraps JSON + error messages consistently.
 */
import { auth } from "./firebase";

export async function authedFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("Your session expired. Sign in again.");
  }

  const token = await currentUser.getIdToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : "Angie could not complete that request.";
    throw new Error(message);
  }

  return (payload ?? {}) as T;
}
