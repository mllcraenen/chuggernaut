"use client";

// Step-line chart of a lift's applied TM events (manual saves + applied
// autoregulation), with per-event markers: filled dot = auto, ring = manual.
// Same visual conventions as e1rm-chart.tsx.

export type TmChartPoint = {
  tm: number;
  source: "manual" | "auto" | "suggestion";
  createdAt: string; // ISO
};

const W = 340;
const H = 90;
const PAD = { top: 10, right: 12, bottom: 20, left: 36 };

export default function TmHistoryChart({ points }: { points: TmChartPoint[] }) {
  if (points.length < 2) return null;

  const values = points.map((p) => p.tm);
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

  // Step path: a TM holds until the next event changes it.
  let pathD = `M ${x(0).toFixed(1)} ${y(points[0].tm).toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    pathD += ` L ${x(i).toFixed(1)} ${y(points[i - 1].tm).toFixed(1)}`;
    pathD += ` L ${x(i).toFixed(1)} ${y(points[i].tm).toFixed(1)}`;
  }

  function dateLabel(iso: string): string {
    return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
  }

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} aria-hidden>
        <line
          x1={PAD.left} y1={PAD.top + chartH / 2}
          x2={W - PAD.right} y2={PAD.top + chartH / 2}
          stroke="#2a3352" strokeWidth="1" strokeDasharray="3 3"
        />
        {[{ v: minV, yPos: y(minV) }, { v: maxV, yPos: y(maxV) }].map(({ v, yPos }) => (
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

        <path d={pathD} fill="none" stroke="#e8a23a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />

        {points.map((p, i) =>
          p.source === "auto" ? (
            <circle key={i} cx={x(i)} cy={y(p.tm)} r="3" fill="#e8a23a" />
          ) : (
            <circle key={i} cx={x(i)} cy={y(p.tm)} r="3" fill="#141b2d" stroke="#e8a23a" strokeWidth="1.5" />
          )
        )}

        <text x={PAD.left} y={H - 4} fontSize="9" fill="#3d5080">
          {dateLabel(points[0].createdAt)}
        </text>
        <text x={W - PAD.right} y={H - 4} fontSize="9" fill="#3d5080" textAnchor="end">
          {dateLabel(points[points.length - 1].createdAt)}
        </text>
      </svg>
      <p className="px-4 pb-3 text-[10px] text-[#3d5080]">
        <span className="inline-block w-2 h-2 rounded-full bg-[#e8a23a] align-middle mr-1" />
        auto-regulated
        <span className="inline-block w-2 h-2 rounded-full border border-[#e8a23a] align-middle ml-3 mr-1" />
        manual
      </p>
    </div>
  );
}
