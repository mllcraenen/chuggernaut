// Human-readable explainer for the autoregulation rule (server component,
// collapsible via <details> — no client JS). Renders the actual RPE_TABLE the
// engine uses, so the docs can never drift from the code.

import { RPE_TABLE } from "@/lib/autoregulation";

const RPE_COLS = [6, 7, 8, 9, 10];
const REP_ROWS = Object.keys(RPE_TABLE)
  .map(Number)
  .sort((a, b) => a - b);

export default function TmExplainer() {
  return (
    <details
      id="tm-explainer"
      className="rounded-xl border border-[#2a3352] bg-[#1e2740] px-4 py-3"
    >
      <summary className="text-sm font-medium text-[#f5f5f5] cursor-pointer select-none min-h-[36px] flex items-center">
        How TM updates work
      </summary>
      <div className="mt-3 space-y-3 text-xs text-[#8e8e93] leading-relaxed">
        <p>
          Every prescribed weight is a percentage of your training max (TM), rounded
          to the nearest plate. After a session, each main-lift set&apos;s{" "}
          <em>reported</em> RPE is compared with its <em>prescribed</em> RPE through
          the load table below: if a set felt harder than prescribed, the weight that
          would have hit the target RPE is lower — and working that ideal weight back
          through the set&apos;s %TM implies a lower TM (and vice versa).
        </p>
        <p>
          The implied TMs of the session are averaged (the top set counts double),
          then the stored TM only moves <strong>60%</strong> of the way toward that
          average (damping), never more than <strong>±5%</strong> per session, and
          changes under 1% are ignored as noise. The result is a suggestion you
          confirm after the session — or, with auto-apply on in Settings, it is
          applied for you. Either way every change is recorded and shown in the
          chart above.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-center text-[10px] font-mono">
            <thead>
              <tr className="text-[#3d5080]">
                <th className="py-1 pr-2 text-left font-normal">reps \ RPE</th>
                {RPE_COLS.map((rpe) => (
                  <th key={rpe} className="py-1 font-normal">@{rpe}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {REP_ROWS.map((reps) => (
                <tr key={reps} className="border-t border-[#2a3352]">
                  <td className="py-1 pr-2 text-left text-[#3d5080]">{reps}</td>
                  {RPE_COLS.map((rpe) => (
                    <td key={rpe} className="py-1 text-[#8e8e93]">
                      {Math.round(RPE_TABLE[reps][rpe] * 100)}%
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-[#3d5080]">
          Fraction of 1RM that a set of <em>n</em> reps at a given RPE represents.
          Fractional RPEs are interpolated.
        </p>
      </div>
    </details>
  );
}
