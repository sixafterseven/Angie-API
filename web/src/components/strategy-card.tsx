/**
 * Structured sales playbook card. Renders the grounded strategy sections with a
 * clear hierarchy and subtle icons — never a wall of text.
 */
"use client";

import {
  Compass,
  Wrench,
  Lightbulb,
  Gift,
  MessageSquare,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { ReactNode } from "react";

export type Strategy = {
  opportunitySnapshot: string;
  fixFirst: string[];
  whyItMatters: string;
  recommendedOffer: string;
  conversationStarter: string;
  watchOuts: string[];
  nextStep: string;
};

function Section({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent-strong">
        <span className="text-accent">{icon}</span>
        {title}
      </div>
      <div className="mt-1.5 text-sm leading-6 text-ink">{children}</div>
    </section>
  );
}

export function StrategyCard({ strategy }: { strategy: Strategy }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="space-y-4">
        {strategy.opportunitySnapshot ? (
          <Section icon={<Compass size={14} />} title="Opportunity Snapshot">
            {strategy.opportunitySnapshot}
          </Section>
        ) : null}

        {strategy.fixFirst.length ? (
          <Section icon={<Wrench size={14} />} title="What We'd Fix First">
            <ul className="space-y-1">
              {strategy.fixFirst.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" />
                  {item}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {strategy.whyItMatters ? (
          <Section icon={<Lightbulb size={14} />} title="Why This Matters">
            {strategy.whyItMatters}
          </Section>
        ) : null}

        {strategy.recommendedOffer ? (
          <Section icon={<Gift size={14} />} title="Recommended Offer">
            {strategy.recommendedOffer}
          </Section>
        ) : null}

        {strategy.conversationStarter ? (
          <Section icon={<MessageSquare size={14} />} title="Conversation Starter">
            <p className="rounded-xl bg-accent-soft px-3 py-2 italic text-accent-strong">
              &ldquo;{strategy.conversationStarter}&rdquo;
            </p>
          </Section>
        ) : null}

        {strategy.watchOuts.length ? (
          <Section icon={<AlertTriangle size={14} />} title="Watch-Outs">
            <ul className="space-y-1">
              {strategy.watchOuts.map((item) => (
                <li key={item} className="flex gap-2 text-muted">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-caution" />
                  {item}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {strategy.nextStep ? (
          <Section icon={<ArrowRight size={14} />} title="Suggested Next Step">
            {strategy.nextStep}
          </Section>
        ) : null}
      </div>
    </div>
  );
}
