"use client";

import {ReactNode, useEffect, useState} from "react";
import Link from "next/link";
import {usePathname, useRouter} from "next/navigation";
import {onAuthStateChanged, signOut, User} from "firebase/auth";
import {
  Bot,
  Database,
  FileUp,
  LayoutDashboard,
  LogOut,
  Users,
} from "lucide-react";

import {auth} from "@/lib/firebase";

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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (currentUser) => {
        if (!currentUser) {
          router.replace("/login");
          return;
        }

        setUser(currentUser);
        setCheckingAuth(false);
      }
    );

    return unsubscribe;
  }, [router]);

  async function handleSignOut() {
    await signOut(auth);
    router.replace("/login");
  }

  if (checkingAuth) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950">
        <p className="text-sm text-slate-400">
          Opening Angie OS...
        </p>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-slate-950 text-white lg:flex">
        <div className="border-b border-slate-800 px-6 py-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
            Micah Amari
          </p>

          <h1 className="mt-2 text-2xl font-bold">
            Angie OS
          </h1>

          <p className="mt-1 text-sm text-slate-400">
            Sales Operations
          </p>
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
                  active ?
                    "bg-white text-slate-950" :
                    "text-slate-300 hover:bg-slate-900 hover:text-white",
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
              {user?.displayName || "Micah Amari Employee"}
            </p>

            <p className="truncate text-xs text-slate-400">
              {user?.email}
            </p>
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
            <h2 className="text-2xl font-bold tracking-tight">
              {title}
            </h2>

            {description ? (
              <p className="mt-1 text-sm text-slate-500">
                {description}
              </p>
            ) : null}
          </div>
        </header>

        <main className="mx-auto max-w-7xl p-6 lg:p-10">
          {children}
        </main>
      </div>
    </div>
  );
}