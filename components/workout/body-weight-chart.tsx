"use client";

// Body-weight trend chart. Mirrors e1rm-chart.tsx but labels the X axis with
// dates instead of week numbers. Values are already in display units (kg/lbs).
const W = 340;
const H = 80;
const PAD = { top: 8, right: 12, bottom: 20, left: 36 };

export interface BodyWeightChartPoint {
  date: string; // YYYY-MM-DD
  value: number; // already in display units
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function BodyWeightChart({ points }: { points: BodyWeightChartPoint[] }) {
  if (points.length < 2) return null;

  const values = points.map((p) => p.value);
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
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(" ");

  const areaD =
    pathD +
    ` L ${x(points.length - 1).toFixed(1)} ${(PAD.top + chartH).toFixed(1)}` +
    ` L ${PAD.left.toFixed(1)} ${(PAD.top + chartH).toFixed(1)} Z`;

  const yLabels = [
    { v: minV, yPos: y(minV) },
    { v: maxV, yPos: y(maxV) },
  ];

  const lastPoint = points[points.length - 1];
  const lastX = x(points.length - 1);
  const lastY = y(lastPoint.value);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} aria-hidden>
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
          {Math.round(v * 10) / 10}
        </text>
      ))}

      {/* Area fill */}
      <path d={areaD} fill="#e84545" fillOpacity="0.08" />

      {/* Line */}
      <path d={pathD} fill="none" stroke="#e84545" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />

      {/* Last point dot */}
      <circle cx={lastX} cy={lastY} r="3" fill="#e84545" />

      {/* X axis: first and last date label */}
      <text x={PAD.left} y={H - 4} fontSize="9" fill="#3d5080">
        {shortDate(points[0].date)}
      </text>
      <text x={W - PAD.right} y={H - 4} fontSize="9" fill="#3d5080" textAnchor="end">
        {shortDate(lastPoint.date)}
      </text>
    </svg>
  );
}
