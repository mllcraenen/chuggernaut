"use client";

import type { E1rmPoint } from "@/lib/workout";

const W = 340;
const H = 80;
const PAD = { top: 8, right: 12, bottom: 20, left: 36 };

export default function E1rmChart({ points }: { points: E1rmPoint[] }) {
  if (points.length < 2) return null;

  const values = points.map((p) => p.e1rm);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = maxV - minV || 1;

  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  function x(i: number) {
    return PAD.left + (i / (points.length - 1)) * chartW;
  }
  function y(v: number) {
    return PAD.top + chartH - ((v - minV) / range) * chartH;
  }

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.e1rm).toFixed(1)}`)
    .join(" ");

  // Area fill path
  const areaD =
    pathD +
    ` L ${x(points.length - 1).toFixed(1)} ${(PAD.top + chartH).toFixed(1)}` +
    ` L ${PAD.left.toFixed(1)} ${(PAD.top + chartH).toFixed(1)} Z`;

  // Y-axis labels: min and max
  const yLabels = [
    { v: minV, yPos: y(minV) },
    { v: maxV, yPos: y(maxV) },
  ];

  const lastPoint = points[points.length - 1];
  const lastX = x(points.length - 1);
  const lastY = y(lastPoint.e1rm);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ height: H }}
      aria-hidden
    >
      {/* Grid line at mid */}
      <line
        x1={PAD.left} y1={PAD.top + chartH / 2}
        x2={W - PAD.right} y2={PAD.top + chartH / 2}
        stroke="#2a3352" strokeWidth="1" strokeDasharray="3 3"
      />

      {/* Y axis labels */}
      {yLabels.map(({ v, yPos }) => (
        <text
          key={v}
          x={PAD.left - 4}
          y={Math.max(PAD.top + 8, Math.min(yPos + 4, PAD.top + chartH))}
          textAnchor="end"
          fontSize="9"
          fill="#3d5080"
        >
          {v}
        </text>
      ))}

      {/* Area fill */}
      <path d={areaD} fill="#e84545" fillOpacity="0.08" />

      {/* Line */}
      <path d={pathD} fill="none" stroke="#e84545" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />

      {/* Last point dot */}
      <circle cx={lastX} cy={lastY} r="3" fill="#e84545" />

      {/* X axis: first and last session label */}
      <text x={PAD.left} y={H - 4} fontSize="9" fill="#3d5080">
        Wk {points[0].week}
      </text>
      <text x={W - PAD.right} y={H - 4} fontSize="9" fill="#3d5080" textAnchor="end">
        Wk {lastPoint.week}
      </text>
    </svg>
  );
}
