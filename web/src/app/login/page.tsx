"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signInWithPopup, User } from "firebase/auth";
import { LogIn } from "lucide-react";

import { auth, googleProvider } from "@/lib/firebase";

export default function LoginPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
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
      await signInWithPopup(auth, googleProvider);
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
        <p className="text-sm text-slate-500">Loading Angie OS...</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        <div className="mb-8">
          <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-slate-500">
            Micah Amari
          </p>

          <h1 className="text-3xl font-bold text-slate-950">Angie OS</h1>

          <p className="mt-3 text-slate-600">
            Sign in to upload leads, monitor processing, and work with Angie.
          </p>
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={signingIn}
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
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
