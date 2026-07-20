/**
 * Opportunity strategy card. Renders the grounded marketing plan in scannable,
 * collapsible sections (facts vs. ideas vs. research stay visually separate) and
 * offers follow-up actions that keep the conversation going.
 */
"use client";

import { ReactNode, useState } from "react";
import {
  Compass,
  CircleCheck,
  Sparkles,
  Megaphone,
  Rocket,
  Send,
  Search,
  ArrowRight,
  Calendar,
  Copy,
  Check,
  ChevronDown,
} from "lucide-react";

import { Button } from "@/components/ui";
import { useToast } from "@/components/toast";

export type Strategy = {
  depth?: string;
  opportunitySnapshot: string;
  whatWeKnow: string[];
  serviceMatches: Array<{ name: string; why: string }>;
  marketingOpportunities: string[];
  campaignIdeas: Array<{
    name: string;
    concept: string;
    audience: string;
    channel: string;
    goal: string;
    deliverables: string[];
  }>;
  outreachApproach: { channel: string; reasoning: string };
  conversationStarter: string;
  researchNext: string[];
  nextStep: string;
  thirtyDayPlan: Array<{ week: string; focus: string }>;
};

export type StrategyAction =
  | { kind: "focus"; value: string }
  | { kind: "depth"; value: string }
  | { kind: "email" };

function strategyToText(s: Strategy): string {
  const lines: string[] = [];
  const add = (h: string, body: string) => body && lines.push(`${h}\n${body}\n`);
  add("Opportunity Snapshot", s.opportunitySnapshot);
  add("What We Know", s.whatWeKnow.map((x) => `• ${x}`).join("\n"));
  add("Best Service Matches", s.serviceMatches.map((m) => `• ${m.name} — ${m.why}`).join("\n"));
  add("Marketing Opportunities", s.marketingOpportunities.map((x) => `• ${x}`).join("\n"));
  add("Campaign Ideas", s.campaignIdeas.map((c) => `• ${c.name}: ${c.concept} (${c.channel})`).join("\n"));
  add(
    "Recommended Outreach",
    s.outreachApproach.channel ? `${s.outreachApproach.channel} — ${s.outreachApproach.reasoning}` : "",
  );
  add("Conversation Starter", s.conversationStarter);
  add("What to Research Next", s.researchNext.map((x) => `• ${x}`).join("\n"));
  add("Suggested Next Step", s.nextStep);
  return lines.join("\n");
}

function SectionHead({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent-strong">
      <span className="text-accent">{icon}</span>
      {title}
    </div>
  );
}

export function StrategyCard({
  strategy,
  busy,
  onAction,
}: {
  strategy: Strategy;
  busy?: boolean;
  onAction?: (action: StrategyAction) => void;
}) {
  const { notify } = useToast();
  const [copied, setCopied] = useState(false);
  const [showMore, setShowMore] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(strategyToText(strategy));
      setCopied(true);
      notify("Strategy copied");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="space-y-4">
        {strategy.opportunitySnapshot ? (
          <section>
            <SectionHead icon={<Compass size={14} />} title="Opportunity Snapshot" />
            <p className="mt-1.5 text-sm leading-6 text-ink">{strategy.opportunitySnapshot}</p>
          </section>
        ) : null}

        {strategy.whatWeKnow.length ? (
          <section>
            <SectionHead icon={<CircleCheck size={14} />} title="What We Know" />
            <ul className="mt-1.5 space-y-1">
              {strategy.whatWeKnow.map((f) => (
                <li key={f} className="flex gap-2 text-sm text-ink">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-positive" />
                  {f}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {strategy.serviceMatches.length ? (
          <section>
            <SectionHead icon={<Sparkles size={14} />} title="Best Service Matches" />
            <div className="mt-2 space-y-2">
              {strategy.serviceMatches.map((m) => (
                <div key={m.name} className="rounded-xl bg-subtle px-3 py-2">
                  <p className="text-sm font-semibold text-ink">{m.name}</p>
                  <p className="text-sm text-muted">{m.why}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {strategy.marketingOpportunities.length ? (
          <section>
            <SectionHead icon={<Megaphone size={14} />} title="Marketing Opportunities" />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {strategy.marketingOpportunities.map((o) => (
                <span key={o} className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent-strong">
                  {o}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        {showMore ? (
          <>
            {strategy.campaignIdeas.length ? (
              <section>
                <SectionHead icon={<Rocket size={14} />} title="Campaign Ideas" />
                <div className="mt-2 space-y-2">
                  {strategy.campaignIdeas.map((c) => (
                    <div key={c.name} className="rounded-xl border border-line p-3">
                      <p className="text-sm font-semibold text-ink">{c.name}</p>
                      <p className="mt-0.5 text-sm text-muted">{c.concept}</p>
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-faint">
                        {c.channel ? <span>Channel: {c.channel}</span> : null}
                        {c.audience ? <span>Audience: {c.audience}</span> : null}
                        {c.goal ? <span>Goal: {c.goal}</span> : null}
                      </div>
                      {c.deliverables.length ? (
                        <p className="mt-1 text-xs text-muted">Deliverables: {c.deliverables.join(", ")}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {strategy.thirtyDayPlan.length ? (
              <section>
                <SectionHead icon={<Calendar size={14} />} title="30-Day Plan" />
                <div className="mt-2 space-y-1.5">
                  {strategy.thirtyDayPlan.map((w) => (
                    <div key={w.week} className="flex gap-3 text-sm">
                      <span className="w-16 shrink-0 font-semibold text-accent-strong">{w.week}</span>
                      <span className="text-ink">{w.focus}</span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {strategy.outreachApproach.channel ? (
              <section>
                <SectionHead icon={<Send size={14} />} title="Recommended Outreach" />
                <p className="mt-1.5 text-sm text-ink">
                  <span className="font-semibold">{strategy.outreachApproach.channel}</span>
                  {strategy.outreachApproach.reasoning ? ` — ${strategy.outreachApproach.reasoning}` : ""}
                </p>
              </section>
            ) : null}

            {strategy.conversationStarter ? (
              <section>
                <SectionHead icon={<Sparkles size={14} />} title="Conversation Starter" />
                <p className="mt-1.5 rounded-xl bg-accent-soft px-3 py-2 text-sm italic text-accent-strong">
                  &ldquo;{strategy.conversationStarter}&rdquo;
                </p>
              </section>
            ) : null}

            {strategy.researchNext.length ? (
              <section>
                <SectionHead icon={<Search size={14} />} title="What to Research Next" />
                <ul className="mt-1.5 space-y-1">
                  {strategy.researchNext.map((r) => (
                    <li key={r} className="flex gap-2 text-sm text-muted">
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-caution" />
                      {r}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {strategy.nextStep ? (
              <section>
                <SectionHead icon={<ArrowRight size={14} />} title="Suggested Next Step" />
                <p className="mt-1.5 text-sm text-ink">{strategy.nextStep}</p>
              </section>
            ) : null}
          </>
        ) : null}

        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-muted transition hover:text-accent"
        >
          <ChevronDown size={14} className={showMore ? "rotate-180 transition" : "transition"} />
          {showMore ? "Show less" : "Campaigns, outreach, research & 30-day plan"}
        </button>
      </div>

      {onAction ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
          <Button type="button" variant="secondary" size="sm" onClick={copy}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button type="button" variant="secondary" size="sm" busy={busy} disabled={busy} onClick={() => onAction({ kind: "email" })}>
            Draft email
          </Button>
          {(
            [
              { label: "More creative", a: { kind: "focus", value: "creative" } },
              { label: "Focus organic", a: { kind: "focus", value: "organic_social" } },
              { label: "Focus paid ads", a: { kind: "focus", value: "paid_ads" } },
              { label: "30-day plan", a: { kind: "depth", value: "thirty_day" } },
            ] as Array<{ label: string; a: StrategyAction }>
          ).map((b) => (
            <button
              key={b.label}
              type="button"
              disabled={busy}
              onClick={() => onAction(b.a)}
              className="rounded-full border border-line px-3 py-1 text-xs font-medium text-muted transition hover:border-accent hover:bg-accent-soft hover:text-accent-strong disabled:opacity-50"
            >
              {b.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
