"use client";

import { useEffect, useState } from "react";

/**
 * The stage of the upload flow, so Audrey can react to being fed.
 */
export type AudreyPhase = "idle" | "ready" | "eating" | "fed";

type AudreyPlantProps = {
  phase: AudreyPhase;
};

const BUBBLE_TEXT: Record<AudreyPhase, string> = {
  idle: "Feed me, Seymour!",
  ready: "Mmm, feed me those leads!",
  eating: "Nom nom nom…",
  fed: "Delicious! Got any more?",
};

/**
 * Audrey II: a campy Little Shop of Horrors plant that "eats" the leads you
 * upload. Purely decorative — it sits beside the real dropzone and never
 * intercepts the file input, so the upload flow is unchanged.
 *
 * The plant chomps whenever a workbook is selected or an upload finishes, and
 * also on click, so it reads as feeding the plant without hiding the controls.
 */
export default function AudreyPlant({ phase }: AudreyPlantProps) {
  // Bumping this key remounts the jaw so a fresh chomp animation replays even
  // when triggered twice in a row.
  const [chompId, setChompId] = useState(0);
  const [chomping, setChomping] = useState(false);

  function chomp() {
    setChompId((id) => id + 1);
    setChomping(true);
  }

  // Chomp on the transitions that mean "you just fed me". Deferred to the next
  // frame so the animation restarts cleanly after paint (and so the state
  // update does not run synchronously inside the effect).
  useEffect(() => {
    if (phase !== "ready" && phase !== "fed") {
      return;
    }

    const frame = requestAnimationFrame(chomp);

    return () => cancelAnimationFrame(frame);
  }, [phase]);

  const jawClass = `audrey-jaw ${chomping ? "audrey-jaw--chomp" : "audrey-jaw--idle"}`;

  return (
    <div className="mt-6 flex items-end justify-center gap-3">
      {/* Speech bubble */}
      <div
        className="audrey-bubble relative mb-8 max-w-[11rem] rounded-2xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 shadow-sm"
        aria-live="polite"
      >
        {BUBBLE_TEXT[phase]}
        {/* little tail pointing at the plant */}
        <span
          aria-hidden="true"
          className="absolute -bottom-1.5 right-5 h-3 w-3 rotate-45 border-b border-r border-emerald-200 bg-white"
        />
      </div>

      {/* The plant */}
      <button
        type="button"
        onClick={chomp}
        aria-label="Feed Audrey II"
        title="Feed me!"
        className="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
      >
        <svg
          width="132"
          height="150"
          viewBox="0 0 220 250"
          role="img"
          aria-label="A hungry cartoon plant"
        >
          {/* ---- Pot (stays put) ---- */}
          <path
            d="M64 214 L156 214 L146 246 L74 246 Z"
            fill="#b45309"
          />
          <path
            d="M58 206 L162 206 L156 220 L64 220 Z"
            fill="#c2620c"
          />
          <ellipse cx="110" cy="208" rx="49" ry="6" fill="#7c3f0a" />

          {/* ---- Everything above the soil sways together ---- */}
          <g className="audrey-sway">
            {/* Stem */}
            <path
              d="M110 208 C100 176 122 160 110 128"
              fill="none"
              stroke="#15803d"
              strokeWidth="13"
              strokeLinecap="round"
            />

            {/* Leaves */}
            <path
              d="M108 182 C78 176 66 156 70 140 C92 142 110 160 108 182 Z"
              fill="#16a34a"
            />
            <path
              d="M112 190 C142 186 156 168 154 150 C130 150 110 168 112 190 Z"
              fill="#22c55e"
            />
            <path
              d="M70 140 C86 146 100 162 108 180"
              fill="none"
              stroke="#15803d"
              strokeWidth="2"
            />
            <path
              d="M154 150 C138 156 124 170 113 188"
              fill="none"
              stroke="#15803d"
              strokeWidth="2"
            />

            {/* ---- Head / pod ---- */}
            {/* dark throat behind the jaws */}
            <ellipse cx="110" cy="96" rx="40" ry="34" fill="#4c0519" />
            {/* little uvula */}
            <ellipse cx="110" cy="112" rx="7" ry="10" fill="#9f1239" />

            {/* Lower jaw (static green cup with a red lip + teeth) */}
            <g>
              <path
                d="M70 92 C70 128 92 138 110 138 C128 138 150 128 150 92 C132 104 88 104 70 92 Z"
                fill="#15803d"
              />
              <path
                d="M70 92 C88 104 132 104 150 92 C150 100 150 100 149 104 C130 114 90 114 71 104 C70 100 70 96 70 92 Z"
                fill="#e11d48"
              />
              {/* bottom teeth (point up) */}
              <path
                d="M80 101 L86 90 L92 102 Z M96 103 L103 91 L110 103 Z M110 103 L117 91 L124 103 Z M128 102 L134 90 L140 101 Z"
                fill="#ffffff"
              />
            </g>

            {/* Upper jaw (opens on chomp; hinge at back-right) */}
            <g key={chompId} className={jawClass} onAnimationEnd={() => setChomping(false)}>
              <path
                d="M70 92 C70 54 90 40 110 40 C130 40 150 54 150 92 C132 80 88 80 70 92 Z"
                fill="#16a34a"
              />
              {/* red upper lip */}
              <path
                d="M70 92 C88 80 132 80 150 92 C150 86 150 84 149 81 C130 71 90 71 71 81 C70 84 70 88 70 92 Z"
                fill="#f43f5e"
              />
              {/* pod spots */}
              <circle cx="96" cy="60" r="4" fill="#f97316" />
              <circle cx="118" cy="55" r="3.5" fill="#f97316" />
              <circle cx="108" cy="70" r="3" fill="#f97316" />
              {/* top teeth (point down) */}
              <path
                d="M80 83 L86 94 L92 82 Z M96 81 L103 93 L110 81 Z M110 81 L117 93 L124 81 Z M128 82 L134 94 L140 83 Z"
                fill="#ffffff"
              />
            </g>
          </g>
        </svg>
      </button>
    </div>
  );
}
