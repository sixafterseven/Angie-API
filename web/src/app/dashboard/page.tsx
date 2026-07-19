"use client";

import { useEffect, useState } from "react";
import {
  collection,
  getCountFromServer,
  getDocs,
  query,
  where,
} from "firebase/firestore";

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
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadDashboard() {
      try {
        // The sales-ready count is a server-side aggregate, so the dashboard
        // no longer downloads every lead just to count them.
        const [batchSnapshot, salesReadyCount] = await Promise.all([
          getDocs(collection(db, "batches")),
          getCountFromServer(
            query(
              collection(db, "leads"),
              where("pipelineStage", "==", "sales_ready"),
            ),
          ),
        ]);

        const batchRows = batchSnapshot.docs.map((document) => document.data());

        setStats({
          batches: batchRows.length,
          processing: batchRows.filter(
            (batch) => batch.status === "in_progress",
          ).length,
          completed: batchRows.filter((batch) => batch.status === "complete")
            .length,
          leads: salesReadyCount.data().count,
        });
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Angie OS could not load your dashboard.",
        );
      } finally {
        setLoading(false);
      }
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
      {error ? (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <article
            key={String(label)}
            className="rounded-2xl border border-line bg-surface p-6 shadow-sm"
          >
            <p className="text-sm font-medium text-muted">{label}</p>

            <p className="mt-3 text-4xl font-bold text-ink">
              {loading ? "—" : value}
            </p>
          </article>
        ))}
      </section>

      <section className="mt-8 rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Ready to work</h2>

        <p className="mt-2 text-sm text-muted">
          Upload a workbook, review processed leads, or ask Angie to build a
          lead list.
        </p>
      </section>
    </AppShell>
  );
}
