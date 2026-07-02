"use client";

// Monolith Meet Prep: 4-week base block + 2-week strength base
const BLOCK_COLORS: Record<number, string> = {
  1: "#4d8ef0", 2: "#4d8ef0", 3: "#4d8ef0", 4: "#4d8ef0",
  5: "#f0a020", 6: "#f0a020",
};

const BLOCK_LABELS = [
  { label: "Base (W1–4)", color: "#4d8ef0" },
  { label: "Strength (W5–6)", color: "#f0a020" },
];

type Point = { week: number; planned: number; actual: number };

const W = 340;
const H = 80;
const PAD = { top: 4, right: 4, bottom: 16, left: 4 };
const WEEKS = 6;

export default function VolumeChart({ data }: { data: Point[] }) {
  const maxPlanned = Math.max(...data.map((d) => d.planned), 1);

  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const barW = chartW / WEEKS;

  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} aria-hidden>
        {data.map(({ week, planned, actual }) => {
          const plannedH = Math.max(2, (planned / maxPlanned) * chartH);
          const actualH = actual > 0 ? Math.max(2, (actual / maxPlanned) * chartH) : 0;
          const x = PAD.left + (week - 1) * barW + barW * 0.1;
          const color = BLOCK_COLORS[week];

          return (
            <g key={week}>
              {/* Planned bar — low opacity outline */}
              <rect
                x={x}
                y={PAD.top + chartH - plannedH}
                width={barW * 0.8}
                height={plannedH}
                rx="1"
                fill={color}
                fillOpacity="0.2"
              />
              {/* Actual bar — full opacity */}
              {actualH > 0 && (
                <rect
                  x={x}
                  y={PAD.top + chartH - actualH}
                  width={barW * 0.8}
                  height={actualH}
                  rx="1"
                  fill={color}
                  fillOpacity="0.9"
                />
              )}
              {week % 4 === 1 && (
                <text x={x + barW * 0.4} y={H - 2} fontSize="8" fill="#3d5080" textAnchor="middle">
                  W{week}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex gap-4 px-1">
        {BLOCK_LABELS.map((b) => (
          <div key={b.label} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: b.color }} />
            <span className="text-[9px] text-[#3d5080]">{b.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
