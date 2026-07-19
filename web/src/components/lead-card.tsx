/**
 * The lead result card. Makes it immediately clear who the business is, where
 * it is, how to reach it, why it qualified, what to watch out for, and what
 * Angie recommends doing next — grounded entirely in stored lead fields.
 */
"use client";

import { useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  MapPin,
  MessageSquare,
  Phone,
  Sparkles,
  Star,
} from "lucide-react";

import {
  Lead,
  formatPhone,
  getBandTone,
  getBusinessName,
  getIndustry,
  getLocationLabel,
  getReasonTexts,
  getWarningLabels,
  getWebsiteHref,
  getWebsiteLabel,
} from "@/lib/leads";
import { Button, QualificationBadge } from "@/components/ui";

export function LeadCard({
  lead,
  selected,
  onToggle,
  onCopyContact,
  copied,
  onStrategy,
  onOutreach,
}: {
  lead: Lead;
  selected: boolean;
  onToggle: () => void;
  onCopyContact: () => void;
  copied: boolean;
  onStrategy?: (leadId: string) => void;
  onOutreach?: (leadId: string) => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const name = getBusinessName(lead);
  const industry = getIndustry(lead);
  const location = getLocationLabel(lead);
  const reasons = getReasonTexts(lead);
  const warnings = getWarningLabels(lead);
  const hasWebsite = Boolean(lead.website);
  const address = lead.address ?? lead.street ?? "";

  return (
    <article
      className={[
        "rounded-2xl border bg-surface p-5 transition",
        selected
          ? "border-accent/50 ring-1 ring-accent/30"
          : "border-line hover:border-line-strong",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <label className="flex cursor-pointer items-center pt-1">
          <span className="sr-only">Select {name}</span>
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            className="h-4 w-4 cursor-pointer rounded border-line-strong accent-accent"
          />
        </label>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold text-ink">{name}</h3>
              <p className="mt-0.5 text-sm text-muted">
                {[industry, location].filter(Boolean).join(" · ") ||
                  "Location unavailable"}
              </p>
            </div>

            {lead.qualificationBand ? (
              <QualificationBadge
                band={lead.qualificationBand}
                tone={getBandTone(lead.qualificationBand)}
                score={
                  typeof lead.overallQualificationScore === "number"
                    ? lead.overallQualificationScore
                    : undefined
                }
              />
            ) : null}
          </div>

          {/* Contact row */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
            <span className="inline-flex items-center gap-1.5 text-ink">
              <Phone size={14} className="text-faint" />
              {formatPhone(lead.phone)}
            </span>

            {hasWebsite ? (
              <a
                href={getWebsiteHref(lead.website)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
              >
                {getWebsiteLabel(lead.website)}
                <ArrowUpRight size={13} />
              </a>
            ) : (
              <span className="text-faint">No website</span>
            )}

            {typeof lead.rating === "number" ? (
              <span className="inline-flex items-center gap-1 text-muted">
                <Star size={13} className="text-caution" />
                {lead.rating}
                {typeof lead.reviewCount === "number"
                  ? ` (${lead.reviewCount})`
                  : ""}
              </span>
            ) : null}
          </div>

          {/* Why Angie likes it */}
          {reasons.length ? (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-faint">
                Why Angie likes this lead
              </p>
              <ul className="mt-1 space-y-0.5">
                {reasons.map((reason) => (
                  <li key={reason} className="flex gap-1.5 text-sm text-muted">
                    <Check size={14} className="mt-0.5 shrink-0 text-positive" />
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Watch-outs */}
          {warnings.length ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {warnings.map((warning) => (
                <span
                  key={warning}
                  className="rounded-full bg-caution-soft px-2.5 py-0.5 text-xs font-medium text-caution"
                >
                  {warning}
                </span>
              ))}
            </div>
          ) : null}

          {/* Recommended next move */}
          {lead.recommendedNextAction ? (
            <p className="mt-3 rounded-xl bg-subtle px-3 py-2 text-sm text-ink">
              <span className="font-semibold">Next move: </span>
              {lead.recommendedNextAction}
            </p>
          ) : null}

          {/* Progressive detail disclosure */}
          {showDetails ? (
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl bg-subtle px-3 py-2.5 text-sm">
              {address ? (
                <>
                  <dt className="text-faint">Address</dt>
                  <dd className="text-ink">{address}</dd>
                </>
              ) : null}
              {lead.email ? (
                <>
                  <dt className="text-faint">Email</dt>
                  <dd className="text-ink">{lead.email}</dd>
                </>
              ) : null}
              {lead.marketTier ? (
                <>
                  <dt className="text-faint">Market</dt>
                  <dd className="text-ink">
                    {lead.marketTier.replace(/_/g, " ")}
                  </dd>
                </>
              ) : null}
            </dl>
          ) : null}

          {/* Actions */}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant={selected ? "secondary" : "primary"}
              size="sm"
              onClick={onToggle}
            >
              {selected ? "Selected" : "Add to selection"}
            </Button>

            {onStrategy ? (
              <Button type="button" variant="secondary" size="sm" onClick={() => onStrategy(lead.id)}>
                <Sparkles size={14} />
                Game plan
              </Button>
            ) : null}

            {onOutreach ? (
              <Button type="button" variant="secondary" size="sm" onClick={() => onOutreach(lead.id)}>
                <MessageSquare size={14} />
                Draft outreach
              </Button>
            ) : null}

            <Button type="button" variant="ghost" size="sm" onClick={onCopyContact}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy contact"}
            </Button>

            {lead.googleMapsUrl ? (
              <a
                href={lead.googleMapsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-muted transition hover:bg-subtle hover:text-ink"
              >
                <MapPin size={14} />
                Map
              </a>
            ) : null}

            {(address || lead.email || lead.marketTier) ? (
              <button
                type="button"
                onClick={() => setShowDetails((v) => !v)}
                aria-expanded={showDetails}
                className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold text-muted transition hover:text-ink"
              >
                <ChevronDown
                  size={14}
                  className={showDetails ? "rotate-180 transition" : "transition"}
                />
                Details
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
