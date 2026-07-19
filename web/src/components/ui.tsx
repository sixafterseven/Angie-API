/**
 * Micah Amari UI primitives — the shared vocabulary for buttons, cards, badges,
 * inputs, and states. New screens compose these instead of restyling from
 * scratch, so the brand stays consistent and accessible (focus rings, contrast,
 * touch targets).
 */
"use client";

import { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";

import { BandTone } from "@/lib/leads";

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* ----------------------------------------------------------------- Button */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold " +
  "transition focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-accent/40 focus-visible:ring-offset-1 " +
  "disabled:cursor-not-allowed disabled:opacity-50";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white hover:bg-accent-strong",
  secondary:
    "border border-line-strong bg-surface text-ink hover:border-ink/40 hover:bg-subtle",
  ghost: "text-muted hover:bg-subtle hover:text-ink",
  danger: "bg-critical text-white hover:brightness-95",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "px-3.5 py-2 text-xs",
  md: "px-5 py-3 text-sm",
};

export function Button({
  variant = "primary",
  size = "md",
  busy = false,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  busy?: boolean;
}) {
  return (
    <button
      className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      {...rest}
    >
      {busy ? <Loader2 size={size === "sm" ? 14 : 18} className="animate-spin" /> : null}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------- Card */

export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cx(
        "rounded-2xl border border-line bg-surface shadow-[0_1px_2px_rgba(32,28,25,0.04)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ Badge */

const BAND_STYLES: Record<BandTone, string> = {
  priority: "bg-accent-soft text-accent-strong",
  strong: "bg-positive-soft text-positive",
  possible: "bg-subtle text-ink",
  low: "bg-sunk text-muted",
  review: "bg-caution-soft text-caution",
  poor: "bg-critical-soft text-critical",
};

export function QualificationBadge({
  band,
  tone,
  score,
}: {
  band: string;
  tone: BandTone;
  score?: number;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
        BAND_STYLES[tone],
      )}
    >
      {band}
      {typeof score === "number" ? (
        <span className="opacity-70">{score}</span>
      ) : null}
    </span>
  );
}

export function Chip({
  children,
  onRemove,
  removeLabel,
}: {
  children: ReactNode;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-subtle px-3 py-1 text-xs font-medium text-ink">
      {children}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel ?? "Remove filter"}
          className="rounded-full text-faint transition hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          ×
        </button>
      ) : null}
    </span>
  );
}

/* ------------------------------------------------------------------ Input */

export function TextInput({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        "w-full rounded-xl border border-line-strong bg-surface px-4 py-3 text-sm text-ink",
        "placeholder:text-faint outline-none transition",
        "focus:border-accent focus:ring-2 focus:ring-accent/15",
        className,
      )}
      {...rest}
    />
  );
}

/* ------------------------------------------------------------- EmptyState */

export function EmptyState({
  title,
  hint,
  icon,
  action,
}: {
  title: string;
  hint?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {icon ? <div className="mb-3 text-faint">{icon}</div> : null}
      <p className="font-semibold text-ink">{title}</p>
      {hint ? <p className="mt-1.5 max-w-sm text-sm text-muted">{hint}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/* ---------------------------------------------------------------- Spinner */

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted">
      <Loader2 size={16} className="animate-spin" />
      {label ? <span>{label}</span> : null}
    </div>
  );
}
