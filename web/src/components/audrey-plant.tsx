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

/*
 * Retro palette. OUT is the keyline colour, applied as a CSS drop-shadow so the
 * whole silhouette gets a crisp dark outline.
 */
const C = {
  G1: "#6abe30",
  G2: "#37946e",
  G3: "#256b2f",
  LIP: "#ff5c7a",
  LIP2: "#d83a5a",
  THR: "#3a0f1f",
  TOOTH: "#fbf7e4",
  POT1: "#e07b2a",
  POT2: "#a84a1c",
  SPOT: "#ffd23f",
  EYE: "#fbf7e4",
  PUP: "#20123a",
  TONG: "#e0466b",
} as const;

type Px = [number, number, number, number, string];

/** A horizontal block centred on cx — the building block for the pixel body. */
function row(cx: number, y: number, halfWidth: number, h: number, color: string): Px[] {
  return [[cx - halfWidth, y, halfWidth * 2, h, color]];
}

/** A row of two-step pixel teeth across [x0, x1]. dir +1 points down, -1 up. */
function teeth(x0: number, x1: number, yTip: number, dir: 1 | -1): Px[] {
  const width = 28;
  const count = Math.floor((x1 - x0) / width);
  const out: Px[] = [];

  for (let i = 0; i < count; i += 1) {
    const x = x0 + i * width + 4;

    if (dir > 0) {
      out.push([x, yTip - 18, 22, 10, C.TOOTH]);
    } else {
      out.push([x, yTip, 22, 10, C.TOOTH]);
    }

    out.push([x + 6, yTip - 8, 10, 8, C.TOOTH]);
  }

  return out;
}

// Pot, stem, leaves, throat, lower jaw and tongue — drawn behind the button.
const BODY: Px[] = [
  [120, 352, 120, 16, C.POT2],
  [130, 368, 100, 20, C.POT1],
  [142, 388, 76, 14, C.POT1],
  [168, 296, 24, 60, C.G3],
  [112, 300, 52, 20, C.G2],
  [100, 312, 42, 16, C.G2],
  [196, 314, 54, 20, C.G2],
  [218, 326, 40, 16, C.G2],
  [92, 214, 176, 70, C.THR],
  ...row(180, 284, 98, 18, C.G2),
  ...row(180, 262, 94, 24, C.G1),
  ...row(180, 244, 84, 20, C.G1),
  ...row(180, 228, 76, 18, C.G2),
  [150, 250, 60, 26, C.TONG],
  [162, 276, 36, 10, C.TONG],
  ...row(180, 222, 88, 10, C.LIP2),
  ...teeth(96, 264, 220, -1),
];

// Upper jaw — drawn on top of the button and animated to chomp.
const UPPER: Px[] = [
  ...row(180, 92, 48, 18, C.G2),
  ...row(180, 110, 70, 18, C.G1),
  ...row(180, 128, 84, 18, C.G1),
  ...row(180, 146, 92, 24, C.G2),
  [118, 116, 16, 16, C.SPOT],
  [214, 108, 14, 14, C.SPOT],
  [166, 98, 14, 14, C.SPOT],
  [124, 126, 28, 24, C.EYE],
  [124, 126, 11, 24, C.PUP],
  [118, 118, 36, 8, C.PUP],
  [208, 126, 28, 24, C.EYE],
  [225, 126, 11, 24, C.PUP],
  [206, 118, 36, 8, C.PUP],
  ...row(180, 170, 88, 10, C.LIP),
  ...teeth(96, 264, 196, 1),
];

function Sprite({ pixels, className, style, onAnimationEnd }: {
  pixels: Px[];
  className?: string;
  style?: React.CSSProperties;
  onAnimationEnd?: () => void;
}) {
  return (
    <svg
      className={`audrey-sprite audrey-outline ${className ?? ""}`}
      viewBox="0 0 360 420"
      shapeRendering="crispEdges"
      style={style}
      onAnimationEnd={onAnimationEnd}
      aria-hidden="true"
    >
      {pixels.map(([x, y, w, h, color], index) => (
        <rect key={index} x={x} y={y} width={w} height={h} fill={color} />
      ))}
    </svg>
  );
}

/**
 * Audrey II: a campy 16-bit Little Shop of Horrors plant that chomps down on
 * the file-select button. The button *is* the real file input, nested in her
 * mouth, so uploading reads as feeding the plant. The upper jaw is a separate
 * sprite layer stacked above the button (with pointer-events off) so a chomp
 * visually bites the button without blocking clicks.
 */
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
    <div className="mt-4 flex flex-col items-center">
      {/* Speech bubble */}
      <div
        className="mb-3 inline-block rounded-sm border-4 border-[#20123a] bg-[#fdf6e4] px-3 py-2 text-sm font-extrabold uppercase tracking-wide text-[#20123a] shadow-[5px_5px_0_#20123a]"
        aria-live="polite"
      >
        {BUBBLE_TEXT[phase]}
      </div>

      {/* Fixed-size stage: the two sprite layers and the button share it 1:1. */}
      <div className="relative h-[420px] w-[360px] max-w-full">
        <Sprite pixels={BODY} className="absolute inset-0" />

        {/* The real file picker, nestled in Audrey's mouth. */}
        <label
          className={`absolute left-1/2 top-[212px] z-[5] -translate-x-1/2 cursor-pointer rounded-sm border-4 border-[#20123a] bg-slate-800 px-5 py-3 text-base font-extrabold uppercase tracking-wide text-white shadow-[5px_5px_0_#20123a] transition hover:bg-slate-700 ${
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

        {/* Upper jaw on top; pointer-events off so clicks reach the button. */}
        <Sprite
          key={chompId}
          pixels={UPPER}
          className={`absolute inset-0 z-[6] ${jawClass}`}
          style={{ pointerEvents: "none" }}
          onAnimationEnd={() => setChomping(false)}
        />
      </div>
    </div>
  );
}
