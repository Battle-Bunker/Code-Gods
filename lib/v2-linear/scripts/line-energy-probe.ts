// Probe: time per estimate, repeat spread, and which route wins, on one good line per rule. Not a test.
import { q } from "@workspace/v2-core";
import { dynamicFamilies, estimateLine, fromMC, lineRule, type Line } from "../src/index.ts";
const K = Number(process.argv[2] ?? 12), only = process.argv[3];
/** A good line for the rule: the best of its candidates from a plain line, aiming a few bits up. */
export function goodLine(F: (typeof dynamicFamilies)[number], target = 6): Line {
  const p = F.dealable({ params: { domain: "Q" } } as never)[0], r = lineRule(F.dynamic!, p);
  const uu = (l: Line) => { const v = r.u(l); return Number.isNaN(v) ? -Infinity : v; };
  let best = fromMC(q(3, 2), q(7, 3));
  for (const base of [best, fromMC(q(2), q(5)), fromMC(q(-1, 3), q(11))]) for (const t of r.candidates(base, target)) if (uu(t) > uu(best)) best = t;
  for (let round = 0; round < 3; round++) for (const t of r.candidates(best, uu(best) + 2)) if (uu(t) > uu(best)) best = t;
  return best;
}
for (const F of dynamicFamilies) {
  if (only && F.id !== only) continue;
  const p = F.dealable({ params: { domain: "Q" } } as never)[0], r = lineRule(F.dynamic!, p), s = goodLine(F);
  estimateLine(s, r, undefined, { K, seed: "warm" });
  const t0 = performance.now(), es = Array.from({ length: 6 }, (_, i) => estimateLine(s, r, undefined, { K, seed: `s${i}` }));
  const ms = (performance.now() - t0) / 6, m = es.reduce((t, e) => t + e.energy, 0) / 6, sd = Math.sqrt(es.reduce((t, e) => t + (e.energy - m) ** 2, 0) / 5);
  const by = new Map<string, number>(); let match = 0, n = 0;
  for (const e of es) for (const x of e.samples) { by.set(x.by, (by.get(x.by) ?? 0) + 1); if (x.by !== "already") { n++; if (x.universal <= x.best + 1e-9) match++; } }
  console.log(F.id.padEnd(22), `ms ${ms.toFixed(0)}`, `u ${es[0]!.u.toFixed(1)} E ${m.toFixed(1)} sd ${(100 * sd / m).toFixed(1)}%`, [...by].map(([k, v]) => `${k}:${v}`).join(" "), `universal=best ${match}/${n}`);
}
