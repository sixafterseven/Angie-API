"use client";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";

import AppShell from "@/components/app-shell";
import { auth, db } from "@/lib/firebase";

type DashboardStats = {
  batches: number;
  processing: number;
  completed: number;
  leads: number;
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    batches: 0,
    processing: 0,
    completed: 0,
    leads: 0,
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      const [batchSnapshot, leadSnapshot] = await Promise.all([
        getDocs(collection(db, "batches")),
        getDocs(collection(db, "leads")),
      ]);

      const batchRows = batchSnapshot.docs.map((document) => document.data());

      setStats({
        batches: batchRows.length,
        processing: batchRows.filter((batch) => batch.status === "in_progress")
          .length,
        completed: batchRows.filter((batch) => batch.status === "complete")
          .length,
        leads: leadSnapshot.size,
      });

      setLoading(false);
    }

    void loadDashboard();
  }, []);

  const firstName = auth.currentUser?.displayName?.split(" ")[0] ?? "there";

  const cards = [
    ["Total Batches", stats.batches],
    ["Processing", stats.processing],
    ["Completed", stats.completed],
    ["Sales-Ready Leads", stats.leads],
  ];

  return (
    <AppShell
      title={`Good to see you, ${firstName}`}
      description="Here is what Angie OS has ready."
    >
      <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <article
            key={String(label)}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <p className="text-sm font-medium text-slate-500">{label}</p>

            <p className="mt-3 text-4xl font-bold text-slate-950">
              {loading ? "—" : value}
            </p>
          </article>
        ))}
      </section>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Ready to work</h2>

        <p className="mt-2 text-sm text-slate-600">
          Upload a workbook, review processed leads, or ask Angie to build a
          lead list.
        </p>
      </section>
    </AppShell>
  );
}
