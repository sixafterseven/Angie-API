/**
 * Lead comparison card. Compares leads as marketing opportunities across service
 * fit, likely value, outreach difficulty, campaign potential, and evidence, with
 * a recommended priority — grounded, no internal scores.
 */
"use client";

export type Comparison = {
  rows: Array<{
    name: string;
    serviceFit: string;
    likelyValue: string;
    outreachDifficulty: string;
    campaignPotential: string;
    evidence: string;
    priority: string;
  }>;
  recommendation: string;
};

const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-positive-soft text-positive",
  medium: "bg-accent-soft text-accent-strong",
  low: "bg-subtle text-muted",
};

export function ComparisonCard({ comparison }: { comparison: Comparison }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
              <th className="py-2 pr-4 font-semibold">Business</th>
              <th className="py-2 pr-4 font-semibold">Service fit</th>
              <th className="py-2 pr-4 font-semibold">Likely value</th>
              <th className="py-2 pr-4 font-semibold">Outreach</th>
              <th className="py-2 pr-4 font-semibold">Campaign</th>
              <th className="py-2 pr-4 font-semibold">Verify</th>
              <th className="py-2 font-semibold">Priority</th>
            </tr>
          </thead>
          <tbody>
            {comparison.rows.map((r) => (
              <tr key={r.name} className="border-b border-line align-top last:border-0">
                <td className="py-2.5 pr-4 font-semibold text-ink">{r.name}</td>
                <td className="py-2.5 pr-4 text-muted">{r.serviceFit}</td>
                <td className="py-2.5 pr-4 text-muted">{r.likelyValue}</td>
                <td className="py-2.5 pr-4 text-muted">{r.outreachDifficulty}</td>
                <td className="py-2.5 pr-4 text-muted">{r.campaignPotential}</td>
                <td className="py-2.5 pr-4 text-muted">{r.evidence}</td>
                <td className="py-2.5">
                  <span
                    className={[
                      "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                      PRIORITY_STYLES[r.priority.toLowerCase()] ?? "bg-subtle text-muted",
                    ].join(" ")}
                  >
                    {r.priority || "—"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {comparison.recommendation ? (
        <p className="mt-4 rounded-xl bg-accent-soft px-3 py-2 text-sm text-accent-strong">
          <span className="font-semibold">Recommendation: </span>
          {comparison.recommendation}
        </p>
      ) : null}
    </div>
  );
}
