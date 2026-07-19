/**
 * Editable outreach card. Shows the structured email (subject, preview, body,
 * CTA, tone), supports inline editing before copy, and offers tone/focus
 * controls that regenerate the draft — grounded, never inventing observations.
 */
"use client";

import { useState } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui";
import { useToast } from "@/components/toast";

export type DraftedEmail = {
  leadId: string;
  businessName: string;
  subject: string;
  previewText: string;
  body: string;
  cta: string;
  toneLabel: string;
};

export type OutreachModifier =
  | "regenerate"
  | "warmer"
  | "shorter"
  | "direct"
  | "focus_website"
  | "focus_branding"
  | "focus_reviews";

const CONTROLS: Array<{ id: OutreachModifier; label: string }> = [
  { id: "warmer", label: "Warmer" },
  { id: "shorter", label: "Shorter" },
  { id: "direct", label: "More direct" },
  { id: "focus_website", label: "Focus: website" },
  { id: "focus_branding", label: "Focus: branding" },
  { id: "focus_reviews", label: "Focus: reviews" },
];

export function OutreachCard({
  email,
  busy,
  onRegenerate,
}: {
  email: DraftedEmail;
  busy: boolean;
  onRegenerate: (leadId: string, modifier: OutreachModifier) => void;
}) {
  const { notify } = useToast();
  const [subject, setSubject] = useState(email.subject);
  const [body, setBody] = useState(email.body);
  const [copied, setCopied] = useState(false);

  async function copy() {
    const text = `Subject: ${subject}\n\n${body}${email.cta ? `\n\n${email.cta}` : ""}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      notify("Email copied to clipboard");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-faint">
          {email.businessName || "Unnamed business"}
        </p>
        {email.toneLabel ? (
          <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent-strong">
            {email.toneLabel}
          </span>
        ) : null}
      </div>

      <label className="mt-3 block text-xs font-medium text-muted">
        Subject
        <input
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm font-semibold text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
        />
      </label>

      {email.previewText ? (
        <p className="mt-2 text-xs italic text-faint">Preview: {email.previewText}</p>
      ) : null}

      <label className="mt-3 block text-xs font-medium text-muted">
        Body
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={6}
          className="mt-1 w-full resize-y rounded-lg border border-line bg-canvas px-3 py-2 text-sm leading-6 text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
        />
      </label>

      {email.cta ? (
        <p className="mt-2 rounded-lg bg-subtle px-3 py-2 text-sm text-ink">
          <span className="font-semibold">CTA: </span>
          {email.cta}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={copy}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          busy={busy}
          disabled={busy}
          onClick={() => onRegenerate(email.leadId, "regenerate")}
        >
          <RefreshCw size={14} />
          Regenerate
        </Button>
        <span className="mx-1 h-4 w-px bg-line" />
        {CONTROLS.map((control) => (
          <button
            key={control.id}
            type="button"
            disabled={busy}
            onClick={() => onRegenerate(email.leadId, control.id)}
            className="rounded-full border border-line px-3 py-1 text-xs font-medium text-muted transition hover:border-accent hover:bg-accent-soft hover:text-accent-strong disabled:opacity-50"
          >
            {control.label}
          </button>
        ))}
      </div>
    </div>
  );
}
