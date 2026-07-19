"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signInWithPopup, signOut, User } from "firebase/auth";
import { LogIn } from "lucide-react";

import { auth, googleProvider } from "@/lib/firebase";
import {
  ACCESS_DENIED_KEY,
  isApprovedEmployee,
  UNAUTHORIZED_MESSAGE,
} from "@/lib/authorized-emails";

export default function LoginPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      /*
       * AppShell sets this flag when it bounces an unapproved account off a
       * protected page. It is read inside the auth callback rather than in the
       * effect body, which keeps the message out of the prerendered HTML and
       * avoids a synchronous setState during the effect.
       */
      if (window.sessionStorage.getItem(ACCESS_DENIED_KEY)) {
        window.sessionStorage.removeItem(ACCESS_DENIED_KEY);
        setError(UNAUTHORIZED_MESSAGE);
      }

      // Catches a restored session for an account that has since been removed
      // from the allowlist.
      if (currentUser && !isApprovedEmployee(currentUser.email)) {
        await signOut(auth);

        setUser(null);
        setLoading(false);
        setError(UNAUTHORIZED_MESSAGE);
        return;
      }

      setUser(currentUser);
      setLoading(false);

      if (currentUser) {
        router.replace("/dashboard");
      }
    });

    return unsubscribe;
  }, [router]);

  async function handleGoogleSignIn() {
    setSigningIn(true);
    setError("");

    try {
      const credential = await signInWithPopup(auth, googleProvider);

      // Google sign-in itself is unchanged; approval is checked immediately
      // afterwards, before the user reaches any part of the app.
      if (!isApprovedEmployee(credential.user.email)) {
        await signOut(auth);

        setUser(null);
        setError(UNAUTHORIZED_MESSAGE);
        return;
      }

      router.replace("/dashboard");
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Google sign-in failed.";

      setError(message);
    } finally {
      setSigningIn(false);
    }
  }

  if (loading || user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted">Loading Angie OS...</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <section className="w-full max-w-md rounded-2xl bg-surface p-8 shadow-lg">
        <div className="mb-8">
          <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-muted">
            Micah Amari
          </p>

          <h1 className="text-3xl font-bold text-ink">Angie OS</h1>

          <p className="mt-3 text-muted">
            Sign in to upload leads, monitor processing, and work with Angie.
          </p>
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={signingIn}
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-accent px-5 py-3 font-semibold text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
        >
          <LogIn size={20} />

          {signingIn ? "Signing in..." : "Continue with Google"}
        </button>

        {error ? (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </section>
    </main>
  );
}
