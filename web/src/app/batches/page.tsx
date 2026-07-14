"use client";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";

import AppShell from "@/components/app-shell";
import { db } from "@/lib/firebase";

type Batch = {
  id: string;
  originalFilename?: string;
  status?: string;
  currentStage?: string;
  currentOwner?: string;
  recordCount?: number;
  approvedLeadCount?: number;
  createdAt?: {
    seconds?: number;
  };
};

export default function BatchesPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadBatches() {
      try {
        const snapshot = await getDocs(collection(db, "batches"));

        const rows = snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data(),
        })) as Batch[];

        rows.sort((a, b) => {
          return (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0);
        });

        setBatches(rows);
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Batches could not be loaded.",
        );
      } finally {
        setLoading(false);
      }
    }

    void loadBatches();
  }, []);

  return (
    <AppShell title="Batches" description="Monitor uploaded lead batches.">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <p className="p-6 text-sm text-slate-500">Loading batches...</p>
        ) : null}

        {error ? (
          <p className="m-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {!loading && !error ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="border-b border-slate-200">
                  <th className="px-5 py-4 text-left">Batch</th>
                  <th className="px-5 py-4 text-left">File</th>
                  <th className="px-5 py-4 text-left">Status</th>
                  <th className="px-5 py-4 text-left">Stage</th>
                  <th className="px-5 py-4 text-left">Owner</th>
                  <th className="px-5 py-4 text-right">Leads</th>
                </tr>
              </thead>

              <tbody>
                {batches.map((batch) => (
                  <tr
                    key={batch.id}
                    className="border-b border-slate-200 hover:bg-slate-50"
                  >
                    <td className="px-5 py-4 font-semibold">{batch.id}</td>

                    <td className="max-w-xs truncate px-5 py-4">
                      {batch.originalFilename ?? "—"}
                    </td>

                    <td className="px-5 py-4">{batch.status ?? "—"}</td>

                    <td className="px-5 py-4">{batch.currentStage ?? "—"}</td>

                    <td className="px-5 py-4">{batch.currentOwner ?? "—"}</td>

                    <td className="px-5 py-4 text-right">
                      {batch.approvedLeadCount ?? batch.recordCount ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
