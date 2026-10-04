import { useState } from "react";
import { easeOutBack, useTween } from "./useTween.ts";

// Radar of base stats. Axes run clockwise from the top in the order the games use:
// HP, Atk, Def, Spe, SpD, SpA. The scale is fixed at 0-200 (same as the stat bars) so
// shapes are comparable between species; values above 200 reach the edge.

const AXES = [
  { stat: 0, label: "HP" },
  { stat: 1, label: "Atk" },
  { stat: 2, label: "Def" },
  { stat: 5, label: "Spe" },
  { stat: 4, label: "SpD" },
  { stat: 3, label: "SpA" },
];
const MAX = 200;
const RINGS = [50, 100, 150, 200];
const SIZE = 260;
const C = SIZE / 2;
const R = 92;

/** `value` is clamped to MAX unless `outside` is set (used to place labels past the ring). */
function point(axis: number, value: number, outside = false): [number, number] {
  const angle = (Math.PI * 2 * axis) / AXES.length - Math.PI / 2;
  const r = ((outside ? value : Math.min(value, MAX)) / MAX) * R;
  return [C + r * Math.cos(angle), C + r * Math.sin(angle)];
}

const polygon = (values: number[]) => values.map((v, i) => point(i, v).join(",")).join(" ");

export function StatRadar({ base }: { base: number[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const values = AXES.map((a) => base[a.stat]);
  // Springs into the new shape when the species changes; grows out from the centre at first.
  const shown = useTween(values, { ms: 560, ease: easeOutBack, fromZero: true }).map((v) => Math.max(0, v));

  return (
    <svg className="radar" viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} role="img"
      aria-label={AXES.map((a, i) => `${a.label} ${values[i]}`).join(", ")}>
      {RINGS.map((ring) => (
        <polygon key={ring} className="radar-grid" points={polygon(AXES.map(() => ring))} />
      ))}
      {AXES.map((_, i) => {
        const [x, y] = point(i, MAX);
        return <line key={i} className="radar-grid" x1={C} y1={C} x2={x} y2={y} />;
      })}

      <polygon className="radar-shape" points={polygon(shown)} />

      {AXES.map((a, i) => {
        const [x, y] = point(i, shown[i]);
        // Label + value sit outside the ring: above the top tip, below the bottom tip, and
        // beside the side tips, anchored away from the chart so they never cover a dot.
        const [lx, ly] = point(i, MAX * 1.1, true);
        const side = lx > C + 1 ? 1 : lx < C - 1 ? -1 : 0;
        const anchor = side > 0 ? "start" : side < 0 ? "end" : "middle";
        const dy = side ? -5 : ly < C ? -14 : 4;
        const active = hover === i;
        return (
          <g key={a.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <circle className="radar-dot" cx={x} cy={y} r={active ? 5.5 : 4} />
            {/* Larger invisible hit target than the dot. */}
            <circle cx={x} cy={y} r={12} fill="transparent" />
            <text className={`radar-label${active ? " active" : ""}`} x={lx} y={ly + dy} textAnchor={anchor}>
              {a.label}
            </text>
            <text className={`radar-value${active ? " active" : ""}`} x={lx} y={ly + dy + 14} textAnchor={anchor}>
              {Math.round(shown[i])}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
