/**
 * Mutator cost against yield. From YOUR agents' moves (only an agent's owner sees what its moves cost): for each
 * mutator, how many moves used it, what a move cost in energy, and how much your own bits and points changed on the
 * line it moved. Mutators you have not tried yet are listed from the game's catalogue.
 */
import { useMemo } from "react";
import { definePanel, fmtBits, fmtNum, mutatorChoices, pointsText, useMoves, useMyRule } from "@sdk";

type Row = { id: string; title: string; acts: number; charge: number; dBits: number; dPoints: number };

export default definePanel({
  title: "Mutator cost vs yield",
  placement: "left",
  size: "md",
  Component() {
    const rule = useMyRule()?.rule;
    const moves = useMoves(100);
    const rows = useMemo(() => {
      const stats = new Map<string, Row>((rule ? mutatorChoices(rule.variant) : []).map(m => [m.id, { id: m.id, title: m.title, acts: 0, charge: 0, dBits: 0, dPoints: 0 }]));
      for (const m of moves.results) {
        if (!m.mine) continue;
        const ids = [...new Set(m.calls.map(c => c.mutator))];
        for (const id of ids) {
          const row = stats.get(id) ?? { id, title: id, acts: 0, charge: 0, dBits: 0, dPoints: 0 };
          row.acts++;
          row.charge += (m.charge ?? 0) / ids.length;
          row.dBits += m.after.rarityBits - m.before.rarityBits;
          row.dPoints += m.after.points - m.before.points;
          stats.set(id, row);
        }
      }
      return [...stats.values()].sort((a, b) => b.acts - a.acts || a.id.localeCompare(b.id));
    }, [moves.results, rule]);
    const avg = (total: number, n: number, f: (x: number) => string) => (n ? f(total / n) : "–");
    return (
      <div data-testid="example-mutators">
        <table className="w-full text-xs tabular-nums">
          <thead><tr className="text-left opacity-70"><th>mutator</th><th className="text-right">moves</th><th className="text-right">energy/move</th><th className="text-right">Δ your bits/move</th><th className="text-right">Δ points/move</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} title={r.title}>
                <td>{r.id}</td><td className="text-right">{r.acts}</td><td className="text-right">{avg(r.charge, r.acts, fmtNum)}</td>
                <td className="text-right">{avg(r.dBits, r.acts, fmtBits)}</td><td className="text-right">{avg(r.dPoints, r.acts, pointsText)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-xs opacity-70">Over your agents' last {moves.results.filter(m => m.mine).length} moves. Yield is measured on the line each move changed.</p>
      </div>
    );
  },
});
