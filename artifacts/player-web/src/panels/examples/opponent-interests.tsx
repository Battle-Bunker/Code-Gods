/**
 * Inferred opponent interests, from aggregate movements only. You never see another player's rule or their bits on a
 * line; you see how the SUM of the others' bits on it (their want) moves when it changes. Each move is a point
 * (Δ your bits, Δ others' want): others' moves that raise their sum reveal a direction, not who or why. While the game
 * runs the others' sums are blurred (about ± the game's noise), so every conclusion here is inference.
 */
import { useMemo } from "react";
import { definePanel, fmtBits, useGame, useMoves, useOthersBlurred } from "@sdk";

type Point = { key: string; dMine: number; dOthers: number; mine: boolean };

function Scatter({ points }: { points: Point[] }) {
  const w = 300, h = 180, pad = 8;
  const xs = points.map(p => Math.abs(p.dMine)), ys = points.map(p => Math.abs(p.dOthers));
  const sx = Math.max(1e-9, ...xs), sy = Math.max(1e-9, ...ys);
  const x = (v: number) => w / 2 + (v / sx) * (w / 2 - pad), y = (v: number) => h / 2 - (v / sy) * (h / 2 - pad);
  return (
    <svg width={w} height={h} role="img" aria-label="Each move: change in your bits across, change in the others' want up">
      <line x1={0} x2={w} y1={h / 2} y2={h / 2} stroke="currentColor" strokeOpacity={0.25} />
      <line x1={w / 2} x2={w / 2} y1={0} y2={h} stroke="currentColor" strokeOpacity={0.25} />
      {points.map(p => p.mine
        ? <rect key={p.key} x={x(p.dMine) - 4} y={y(p.dOthers) - 4} width={8} height={8} fill="var(--series-1)" />
        : <circle key={p.key} cx={x(p.dMine)} cy={y(p.dOthers)} r={4} fill="var(--series-2)" />)}
    </svg>
  );
}

export default definePanel({
  title: "Inferred opponent interests",
  placement: "right",
  size: "md",
  Component() {
    const moves = useMoves(100);
    const blurred = useOthersBlurred();
    const noise = useGame()?.peerNoiseBits ?? 0;
    const points = useMemo(() => moves.results.map(m => ({
      key: `${m.seq}`, dMine: m.after.rarityBits - m.before.rarityBits, dOthers: m.after.want - m.before.want, mine: m.mine,
    })), [moves.results]);
    const theirs = points.filter(p => !p.mine);
    const quadrant = (f: (p: Point) => boolean) => theirs.filter(f).length;
    const QUADRANTS = [
      { label: "others gain, you lose", n: quadrant(p => p.dOthers > 0 && p.dMine < 0) },
      { label: "both gain", n: quadrant(p => p.dOthers > 0 && p.dMine > 0) },
      { label: "others lose, you gain", n: quadrant(p => p.dOthers < 0 && p.dMine > 0) },
      { label: "both lose", n: quadrant(p => p.dOthers < 0 && p.dMine < 0) },
    ];
    const most = Math.max(1, ...QUADRANTS.map(q => q.n));
    return (
      <div className="space-y-2 text-xs" data-testid="example-opponents">
        <p className="opacity-70">Inference from aggregates over the last {moves.results.length} moves on lines you can see; not anyone's actual rule.{blurred ? ` The others' sums are blurred while the game runs (about ± ${fmtBits(noise)}).` : ""}</p>
        <Scatter points={points} />
        <ul className="m-0 list-none space-y-1 p-0">
          {QUADRANTS.map(q => (
            <li key={q.label} className="flex items-center gap-2">
              <span className="w-40">{q.label}</span>
              <span className="h-2 bg-[var(--series-2)]" style={{ width: `${(q.n / most) * 120}px` }} />
              <span className="tabular-nums">{q.n}</span>
            </li>
          ))}
        </ul>
        <p className="opacity-70">Squares are your own agents' moves. Others' moves that raise their sum while lowering yours show where your interests conflict.</p>
      </div>
    );
  },
});
