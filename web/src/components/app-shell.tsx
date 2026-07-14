"use client";

import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import {
  Bot,
  Database,
  FileUp,
  LayoutDashboard,
  LogOut,
  Users,
} from "lucide-react";

import { auth } from "@/lib/firebase";
import { ACCESS_DENIED_KEY, isApprovedEmployee } from "@/lib/authorized-emails";

type AppShellProps = {
  children: ReactNode;
  title: string;
  description?: string;
};

const navigation = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    name: "Upload Leads",
    href: "/upload",
    icon: FileUp,
  },
  {
    name: "Batches",
    href: "/batches",
    icon: Database,
  },
  {
    name: "Leads",
    href: "/leads",
    icon: Users,
  },
  {
    name: "Ask Angie",
    href: "/ask-angie",
    icon: Bot,
  },
];

export default function AppShell({
  children,
  title,
  description,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    let finished = false;

    const timeout = window.setTimeout(() => {
      if (!finished) {
        setAuthError(
          "Authentication took too long. Refresh the page or sign in again.",
        );
        setCheckingAuth(false);
      }
    }, 8000);

    const unsubscribe = onAuthStateChanged(
      auth,
      async (currentUser) => {
        finished = true;
        window.clearTimeout(timeout);

        if (!currentUser) {
          setCheckingAuth(false);
          router.replace("/login");
          return;
        }

        /*
         * Every protected page mounts AppShell, so this runs on login, on
         * refresh, and on any bookmarked URL. An account that is not on the
         * allowlist is signed straight back out and returned to /login, which
         * reads the flag below to explain why.
         */
        if (!isApprovedEmployee(currentUser.email)) {
          window.sessionStorage.setItem(ACCESS_DENIED_KEY, "1");

          await signOut(auth);

          setUser(null);
          setCheckingAuth(false);
          router.replace("/login");
          return;
        }

        setUser(currentUser);
        setCheckingAuth(false);
      },
      (error) => {
        finished = true;
        window.clearTimeout(timeout);

        console.error("Firebase authentication error:", error);

        setAuthError(
          "Angie OS could not verify your login. Please sign in again.",
        );
        setCheckingAuth(false);
      },
    );

    return () => {
      finished = true;
      window.clearTimeout(timeout);
      unsubscribe();
    };
  }, [router]);

  async function handleSignOut() {
    await signOut(auth);
    router.replace("/login");
  }

  if (checkingAuth) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="rounded-2xl border border-slate-200 bg-white px-8 py-6 shadow-sm">
          <p className="text-sm font-medium text-slate-700">
            Opening Angie OS...
          </p>
        </div>
      </main>
    );
  }

  if (authError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <section className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-bold text-slate-950">Login problem</h1>

          <p className="mt-3 text-sm leading-6 text-slate-600">{authError}</p>

          <button
            type="button"
            onClick={() => {
              router.replace("/login");
            }}
            className="mt-6 w-full rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Return to login
          </button>
        </section>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-slate-950 text-white lg:flex">
        <div className="border-b border-slate-800 px-6 py-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
            Micah Amari
          </p>

          <h1 className="mt-2 text-2xl font-bold">Angie OS</h1>

          <p className="mt-1 text-sm text-slate-400">Sales Operations</p>
        </div>

        <nav className="flex-1 space-y-1 p-4">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "flex items-center gap-3 rounded-xl px-4 py-3",
                  "text-sm font-medium transition",
                  active
                    ? "bg-white text-slate-950"
                    : "text-slate-300 hover:bg-slate-900 hover:text-white",
                ].join(" ")}
              >
                <Icon size={19} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-800 p-4">
          <div className="mb-3 px-3">
            <p className="truncate text-sm font-medium">
              {user.displayName || "Micah Amari Employee"}
            </p>

            <p className="truncate text-xs text-slate-400">{user.email}</p>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-300 transition hover:bg-slate-900 hover:text-white"
          >
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="border-b border-slate-200 bg-white px-6 py-5 lg:px-10">
          <div className="mx-auto max-w-7xl">
            <h2 className="text-2xl font-bold tracking-tight">{title}</h2>

            {description ? (
              <p className="mt-1 text-sm text-slate-500">{description}</p>
            ) : null}
          </div>
        </header>

        <main className="mx-auto max-w-7xl p-6 lg:p-10">{children}</main>
      </div>
    </div>
  );
}
