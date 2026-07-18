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

/* Retro arcade palette. */
const C = {
  g1: "#6abe30",
  g2: "#2f8f3e",
  g3: "#1e5e2a",
  cap: "#ffd23f",
  capo: "#ff9f38",
  capg: "#3aa34a",
  lip: "#ff3b6b",
  lip2: "#d81f54",
  tooth: "#fdf6e4",
  thr: "#3a0f1f",
  tongue: "#e0202e",
  ten: "#5bbf4a",
  can1: "#2fa6d6",
  can2: "#1f7fa8",
  rim: "#cbd5e1",
  red: "#d4322a",
  wood: "#a5642e",
  wood2: "#7a4620",
  signred: "#c0392b",
} as const;

type Px = [number, number, number, number, string];

const row = (cx: number, y: number, hw: number, h: number, c: string): Px[] => [
  [cx - hw, y, hw * 2, h, c],
];

/** Two-step pixel teeth across [x0, x1]. dir +1 points down, -1 up. */
function teeth(x0: number, x1: number, yTip: number, dir: 1 | -1): Px[] {
  const width = 24;
  const count = Math.floor((x1 - x0) / width);
  const out: Px[] = [];

  for (let i = 0; i < count; i += 1) {
    const x = x0 + i * width + 4;

    if (dir > 0) {
      out.push([x, yTip - 18, 18, 9, C.tooth]);
    } else {
      out.push([x, yTip, 18, 9, C.tooth]);
    }

    out.push([x + 5, yTip - 9, 8, 8, C.tooth]);
  }

  return out;
}

// Pot, stem, throat, tongue, lower jaw — behind the button.
const BODY: Px[] = [
  [296, 392, 168, 15, C.rim],
  [304, 407, 152, 86, C.can1],
  [312, 432, 136, 44, C.can2],
  [362, 326, 36, 70, C.g3],
  [296, 236, 168, 66, C.thr],
  [348, 270, 64, 30, C.tongue],
  ...row(380, 296, 90, 22, C.g2),
  [300, 300, 160, 22, C.lip2],
  ...row(380, 296, 80, 14, C.lip),
  ...teeth(310, 450, 246, -1),
];

// Upper jaw (cap + upper lip + fangs) — on top, chomps the button.
const UPPER: Px[] = [
  [300, 150, 160, 16, C.capg],
  ...row(380, 166, 74, 16, C.cap),
  ...row(380, 182, 86, 18, C.capo),
  ...row(380, 200, 92, 22, C.cap),
  [352, 166, 8, 54, C.capg],
  [376, 164, 8, 58, C.capg],
  [400, 166, 8, 54, C.capg],
  [336, 176, 10, 10, C.red],
  [420, 172, 9, 9, C.red],
  [300, 222, 160, 20, C.lip],
  ...teeth(310, 450, 258, 1),
];

const LEAVES = [
  { cx: 380, cy: 300, rot: 0, s: 1.25 },
  { cx: 312, cy: 312, rot: -32, s: 1.05 },
  { cx: 448, cy: 312, rot: 32, s: 1.05 },
  { cx: 286, cy: 338, rot: -62, s: 0.82 },
  { cx: 474, cy: 338, rot: 62, s: 0.82 },
];

function Leaf({ cx, cy, rot, s }: { cx: number; cy: number; rot: number; s: number }) {
  return (
    <g transform={`translate(${cx},${cy}) rotate(${rot}) scale(${s})`}>
      <path d="M0,0 L-34,-58 L-12,-52 L0,-118 L12,-52 L34,-58 Z" fill={C.g3} />
      <path d="M0,-4 L-24,-54 L0,-104 L24,-54 Z" fill={C.g2} />
      <path d="M0,-8 L-13,-50 L0,-92 L13,-50 Z" fill={C.g1} />
      <path d="M0,-10 L0,-96" stroke={C.red} strokeWidth="3" />
    </g>
  );
}

function tendrilPath(cx: number, cy: number, dir: 1 | -1): string {
  let d = `M${cx},${cy}`;

  for (let i = 0; i < 4; i += 1) {
    const r = 26 - i * 3;
    d += ` q ${dir * r},${r} 0,${r * 1.6} q ${-dir * r},${r * 0.4} 0,${r * 0.8}`;
  }

  return d;
}

function Rects({ pixels }: { pixels: Px[] }) {
  return (
    <>
      {pixels.map(([x, y, w, h, color], index) => (
        <rect key={index} x={x} y={y} width={w} height={h} fill={color} />
      ))}
    </>
  );
}

/**
 * Audrey II as a retro arcade scene: a pixel Little Shop of Horrors plant in a
 * (generic) coffee tin, chomping the UPLOAD button. The button is the real file
 * input, so uploading a workbook feeds the plant. The upper jaw is a separate
 * sprite layer above the button so a chomp bites over it; clicks pass through.
 */
export default function AudreyPlant({
  phase,
  onSelectFile,
  disabled,
}: AudreyPlantProps) {
  const [chompId, setChompId] = useState(0);
  const [chomping, setChomping] = useState(false);

  function chomp() {
    setChompId((id) => id + 1);
    setChomping(true);
  }

  useEffect(() => {
    if (phase !== "ready" && phase !== "fed") {
      return;
    }

    const frame = requestAnimationFrame(chomp);

    return () => cancelAnimationFrame(frame);
  }, [phase]);

  const jawClass = `audrey-jaw ${chomping ? "audrey-jaw--chomp" : ""}`;

  return (
    <div className="arcade-panel">
      <div className="arcade-bricks" />

      {/* Title */}
      <div className="absolute inset-x-0 top-[3.5%] text-center">
        <div className="arcade-title">FEED ME, SEYMOUR!</div>
        <div className="arcade-underline mx-auto mt-[1.5%] w-[70%]" />
      </div>

      {/* Plant body (behind the button). */}
      <svg className="arcade-sprite" viewBox="0 0 760 500" shapeRendering="crispEdges" aria-label="Audrey II, a hungry plant" role="img">
        {LEAVES.map((l, i) => (
          <Leaf key={i} {...l} />
        ))}
        <path d={tendrilPath(316, 372, -1)} fill="none" stroke={C.ten} strokeWidth="10" strokeLinecap="round" />
        <path d={tendrilPath(444, 372, 1)} fill="none" stroke={C.ten} strokeWidth="10" strokeLinecap="round" />
        <Rects pixels={BODY} />
        {/* Generic "Shagswell" coffee-tin label (a playful, original name). */}
        <g>
          <ellipse cx="330" cy="446" rx="15" ry="7" fill="#ffffff" />
          <path d="M317 446 a13 12 0 0 0 26 0 Z" fill="#ffffff" />
          <path d="M330 432 q5 6 0 12" stroke={C.red} strokeWidth="2" fill="none" />
        </g>
        <text
          x="398"
          y="452"
          fontFamily="Georgia, serif"
          fontWeight="800"
          fontSize="19"
          fill={C.red}
          textAnchor="middle"
          style={{ letterSpacing: "0.5px" }}
        >
          SHAGSWELL
        </text>
        <text
          x="398"
          y="470"
          fontFamily="Georgia, serif"
          fontWeight="700"
          fontSize="12"
          fill={C.red}
          textAnchor="middle"
          style={{ letterSpacing: "1px" }}
        >
          COFFEE
        </text>
      </svg>

      {/* The real file picker, styled as the arcade UPLOAD button, in the mouth. */}
      <label
        className={`arcade-btn absolute left-[27%] top-[53%] z-20 -rotate-[5deg] cursor-pointer ${
          disabled ? "" : ""
        }`}
        onClick={() => {
          if (!disabled) {
            chomp();
          }
        }}
      >
        ⬆ Upload Leads
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={onSelectFile}
          disabled={disabled}
          className="hidden"
        />
      </label>

      {/* Upper jaw on top; pointer-events off so clicks reach the button. */}
      <svg
        key={chompId}
        className="arcade-sprite z-30"
        viewBox="0 0 760 500"
        shapeRendering="crispEdges"
        style={{ pointerEvents: "none" }}
        aria-hidden="true"
      >
        <g className={jawClass} onAnimationEnd={() => setChomping(false)}>
          <Rects pixels={UPPER} />
        </g>
      </svg>

      {/* FEED ME! sign */}
      <div className="absolute right-[6%] top-[44%] z-20 w-[15%] rotate-[6deg]">
        <svg viewBox="0 0 118 140" shapeRendering="crispEdges" className="h-auto w-full">
          <rect x="54" y="64" width="9" height="76" fill={C.wood2} />
          <rect x="10" y="18" width="98" height="64" fill={C.wood} />
          <rect x="10" y="18" width="98" height="64" fill="none" stroke={C.wood2} strokeWidth="4" />
          <text x="59" y="46" fontFamily="monospace" fontWeight="800" fontSize="20" fill={C.signred} textAnchor="middle">FEED</text>
          <text x="59" y="70" fontFamily="monospace" fontWeight="800" fontSize="20" fill={C.signred} textAnchor="middle">ME!</text>
        </svg>
      </div>

      {/* Footer */}
      <div className="arcade-foot absolute inset-x-0 bottom-[3%] text-center">
        <span className="heart">♥</span> POWERED BY ANGIE <span className="heart">♥</span>
      </div>
    </div>
  );
}
