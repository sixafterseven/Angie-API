/**
 * Chat presentation for Ask Angie — message bubbles and a thinking indicator.
 * Angie's bubbles can host structured content (result cards, strategy, email)
 * as children; user bubbles are plain text.
 */
"use client";

import { ReactNode } from "react";
import { Loader2, Sparkles } from "lucide-react";

export function ChatBubble({
  role,
  children,
}: {
  role: "user" | "angie";
  children: ReactNode;
}) {
  const isUser = role === "user";

  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div className={isUser ? "max-w-[85%]" : "w-full max-w-full"}>
        {!isUser ? (
          <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-accent-strong">
            <Sparkles size={13} />
            Angie
          </div>
        ) : null}

        <div
          className={
            isUser
              ? "rounded-2xl rounded-tr-sm bg-accent px-4 py-2.5 text-sm leading-6 text-white"
              : "text-sm leading-6 text-ink"
          }
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function ThinkingBubble() {
  return (
    <div className="flex justify-start">
      <div className="inline-flex items-center gap-2 rounded-2xl bg-subtle px-3.5 py-2 text-sm text-muted">
        <Loader2 size={15} className="animate-spin" />
        Angie&rsquo;s thinking…
      </div>
    </div>
  );
}
