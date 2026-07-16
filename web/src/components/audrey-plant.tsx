"use client";

import { ChangeEvent, useEffect, useState } from "react";

/**
 * The stage of the upload flow, so Audrey can react to being fed.
 */
export type AudreyPhase = "idle" | "ready" | "eating" | "fed";

type AudreyPlantProps = {
  phase: AudreyPhase;
  onSelectFile: (event: ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
};

const BUBBLE_TEXT: Record<AudreyPhase, string> = {
  idle: "Feed me, Seymour!",
  ready: "Mmm, feed me those leads!",
  eating: "Nom nom nom…",
  fed: "Delicious! Got any more?",
};

/** One variegated leaf, positioned and rotated behind the pod. */
function Leaf({ cx, cy, rot, scale }: {
  cx: number;
  cy: number;
  rot: number;
  scale: number;
}) {
  return (
    <g transform={`translate(${cx},${cy}) rotate(${rot}) scale(${scale})`}>
      <path d="M0,0 C-42,-40 -34,-150 0,-190 C34,-150 42,-40 0,0 Z" fill="#3f8f3a" />
      <path d="M0,0 C-30,-40 -24,-140 0,-176 C24,-140 30,-40 0,0 Z" fill="#57ab45" />
      <path
        d="M0,-6 C-14,-60 -10,-130 0,-172 C10,-130 14,-60 0,-6 Z"
        fill="#e9f2c9"
        opacity="0.55"
      />
      <path d="M0,-4 L0,-170" stroke="#b83b6e" strokeWidth="5" fill="none" />
      <path
        d="M0,-40 L-20,-70 M0,-80 L-22,-112 M0,-120 L-16,-146 M0,-40 L20,-70 M0,-80 L22,-112 M0,-120 L16,-146"
        stroke="#b83b6e"
        strokeWidth="3"
        fill="none"
        opacity="0.8"
      />
    </g>
  );
}

/** Builds a coiled tendril path. dir +1 curls right, -1 curls left. */
function tendrilPath(cx: number, cy: number, dir: 1 | -1): string {
  let d = `M${cx},${cy}`;

  for (let i = 0; i < 5; i += 1) {
    const r = 26 - i * 3;
    d += ` q ${dir * r},${-r} 0,${-r * 1.6} q ${-dir * r},${-r * 0.4} 0,${-r * 0.8}`;
  }

  return d;
}

export default function AudreyPlant({
  phase,
  onSelectFile,
  disabled,
}: AudreyPlantProps) {
  // Bumping this key remounts the jaw so a fresh chomp replays each time.
  const [chompId, setChompId] = useState(0);
  const [chomping, setChomping] = useState(false);

  function chomp() {
    setChompId((id) => id + 1);
    setChomping(true);
  }

  // Chomp on the transitions that mean "you just fed me". Deferred a frame so
  // the animation restarts cleanly and setState never runs inside the effect.
  useEffect(() => {
    if (phase !== "ready" && phase !== "fed") {
      return;
    }

    const frame = requestAnimationFrame(chomp);

    return () => cancelAnimationFrame(frame);
  }, [phase]);

  const jawClass = `audrey-jaw ${chomping ? "audrey-jaw--chomp" : "audrey-jaw--chew"}`;

  return (
    <div className="mt-2 flex flex-col items-center">
      <div className="relative mx-auto h-[500px] w-[400px] max-w-full">
        {/* Body: leaves, tendrils, can, stem, throat, lower lip, tongue, fangs. */}
        <svg
          className="absolute inset-0 h-full w-full overflow-visible"
          viewBox="0 0 400 500"
          aria-label="Audrey II, a hungry plant"
          role="img"
        >
          <defs>
            <radialGradient id="audrey-cap" cx="50%" cy="60%" r="60%">
              <stop offset="0%" stopColor="#ffe14d" />
              <stop offset="55%" stopColor="#ff9f38" />
              <stop offset="100%" stopColor="#e56b2a" />
            </radialGradient>
            <linearGradient id="audrey-lip" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ff5c9a" />
              <stop offset="100%" stopColor="#d6296e" />
            </linearGradient>
            <linearGradient id="audrey-can" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.25" />
              <stop offset="30%" stopColor="#ffffff" stopOpacity="0" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.18" />
            </linearGradient>
          </defs>

          <Leaf cx={200} cy={250} rot={0} scale={1} />
          <Leaf cx={150} cy={255} rot={-32} scale={0.9} />
          <Leaf cx={250} cy={255} rot={32} scale={0.9} />
          <Leaf cx={120} cy={270} rot={-60} scale={0.7} />
          <Leaf cx={280} cy={270} rot={60} scale={0.7} />

          <path
            d={tendrilPath(120, 320, -1)}
            fill="none"
            stroke="#7cc06a"
            strokeWidth="9"
            strokeLinecap="round"
          />
          <path
            d={tendrilPath(288, 320, 1)}
            fill="none"
            stroke="#7cc06a"
            strokeWidth="9"
            strokeLinecap="round"
          />

          {/* Retro coffee can (generic — no real branding). */}
          <rect x="112" y="392" width="176" height="96" rx="8" fill="#2fa6d6" />
          <rect x="112" y="392" width="176" height="96" rx="8" fill="url(#audrey-can)" />
          <rect x="120" y="418" width="160" height="44" fill="#2b98c4" opacity="0.5" />
          <ellipse cx="200" cy="392" rx="90" ry="15" fill="#d7dde3" />
          <ellipse cx="200" cy="392" rx="90" ry="15" fill="none" stroke="#9aa6b1" strokeWidth="3" />
          <ellipse cx="200" cy="390" rx="76" ry="10" fill="#1f7fa8" />
          <g transform="translate(138,428)">
            <ellipse cx="0" cy="6" rx="16" ry="7" fill="#ffffff" />
            <path d="M-13,4 a13,10 0 0 0 26,0 Z" fill="#ffffff" />
          </g>
          <text
            x="216"
            y="452"
            fontFamily="Georgia, serif"
            fontWeight="800"
            fontSize="30"
            fill="#d4322a"
            textAnchor="middle"
            style={{ letterSpacing: "1px" }}
          >
            COFFEE
          </text>

          {/* Stem + mouth interior with big pink lips. */}
          <rect x="188" y="300" width="24" height="96" fill="#3f8f3a" />
          <ellipse cx="200" cy="260" rx="86" ry="64" fill="#5a1226" />
          <path
            d="M100,266 C102,354 298,354 300,266 C268,308 132,308 100,266 Z"
            fill="url(#audrey-lip)"
          />
          <path
            d="M128,298 C170,324 230,324 272,298 C238,314 162,314 128,298 Z"
            fill="#c22e6b"
          />
          <path
            d="M122,278 C155,264 245,264 278,278 C245,270 155,270 122,278 Z"
            fill="#ff9ec4"
            opacity="0.7"
          />
          <ellipse cx="200" cy="286" rx="30" ry="22" fill="#e0202e" />
          <ellipse cx="192" cy="280" rx="10" ry="7" fill="#ff6a6a" />
          <path d="M150,262 l10,26 l10,-26 Z" fill="#fdf6e4" />
          <path d="M230,262 l10,26 l10,-26 Z" fill="#fdf6e4" />
        </svg>

        {/* The real file picker, nestled in Audrey's mouth. */}
        <label
          className={`absolute left-1/2 top-[260px] z-[5] -translate-x-1/2 cursor-pointer rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-slate-800 ${
            disabled ? "cursor-not-allowed opacity-60" : ""
          }`}
          onClick={() => {
            if (!disabled) {
              chomp();
            }
          }}
        >
          Select XLSX
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={onSelectFile}
            disabled={disabled}
            className="hidden"
          />
        </label>

        {/* Upper jaw (cap + upper lip + fangs); on top, clicks pass through. */}
        <svg
          key={chompId}
          className="absolute inset-0 z-[6] h-full w-full overflow-visible"
          viewBox="0 0 400 500"
          style={{ pointerEvents: "none" }}
          aria-hidden="true"
        >
          <g
            className={jawClass}
            onAnimationEnd={() => setChomping(false)}
          >
            <path
              d="M126,232 C120,150 160,116 200,116 C240,116 280,150 274,232 C240,214 160,214 126,232 Z"
              fill="#2f8f3e"
            />
            <path
              d="M140,226 C136,158 168,132 200,132 C232,132 264,158 260,226 C232,212 168,212 140,226 Z"
              fill="url(#audrey-cap)"
            />
            <path
              d="M200,130 L200,214 M170,136 L176,214 M230,136 L224,214 M150,150 L162,212 M250,150 L238,212"
              stroke="#2f8f3e"
              strokeWidth="7"
              fill="none"
              opacity="0.85"
            />
            <path
              d="M126,232 l12,-18 l12,18 l12,-18 l12,18 l12,-18 l12,18 l12,-18 l12,18 l12,-18 l12,18 l12,-18 l12,18 Z"
              fill="#2f8f3e"
            />
            <path
              d="M104,228 C148,276 252,276 296,228 C260,258 140,258 104,228 Z"
              fill="url(#audrey-lip)"
            />
            <path
              d="M120,238 C155,254 245,254 280,238 C245,248 155,248 120,238 Z"
              fill="#ff9ec4"
              opacity="0.6"
            />
            <path d="M150,248 l10,-24 l10,24 Z" fill="#fdf6e4" />
            <path d="M230,248 l10,-24 l10,24 Z" fill="#fdf6e4" />
          </g>
        </svg>

        {/* Speech bubble */}
        <div
          className="absolute left-1 top-[150px] z-[8] rounded-2xl border-2 border-slate-800 bg-white px-3.5 py-2 font-serif text-sm font-bold text-red-700 shadow-md"
          aria-live="polite"
        >
          {BUBBLE_TEXT[phase]}
          <span
            aria-hidden="true"
            className="absolute -right-[7px] top-6 h-3 w-3 rotate-45 border-r-2 border-t-2 border-slate-800 bg-white"
          />
        </div>
      </div>
    </div>
  );
}
