// Probe: the candidate rules (src/candidate-families.ts) under the real estimator: energy along each ladder, after a +1
// knock on the rule's own number, the cheapest turn to the next rung (and in the continued-fraction lens) against the
// energy it adds, and trivial lines. Not a test. Output: markdown rows for energy.md.
import { physicsOf, q, Qn, type Q } from "@workspace/v2-core";
import { lineQ as V } from "../test/config.ts";
import { candidateFamilies, estimateLine, fromMC, lensById, lineRule, routePrice, type Line } from "../src/index.ts";
const lambda = physicsOf(V).gravity;
const E = (F: any, p: any, l: Line) => { const r = lineRule(F.dynamic, p); return [0, 1].map(i => estimateLine(l, r, V, { seed: `c${i}` }).energy).reduce((a, b) => a + b, 0) / 2; };
const U = (F: any, p: any, l: Line) => lineRule(F.dynamic, p).u(l);
const mOf = (l: Line): Q => q(-l.a, l.b), cOf = (l: Line): Q => q(-l.c, l.b);
const show = (l: Line) => `${Qn.toWire(mOf(l))}, ${Qn.toWire(cOf(l))}`;
/** +1 on the number the rule reads. */
function knock(id: string, p: any, l: Line): Line {
  const m = mOf(l), c = cOf(l);
  const on: string = p.on ?? ({ ring: "abc", "shared-secret": "abc", kin: "y-intercept top" } as Record<string, string>)[id] ?? "gradient top";
  if (on === "abc") return { ...l, c: l.c + 1n };
  if (on === "gradient top") return fromMC(q(m.n + (m.n < 0n ? -1n : 1n), m.d), c);
  if (on === "gradient bottom") return fromMC(q(m.n, m.d + 1n), c);
  if (on === "y-intercept top") return fromMC(m, q(c.n + (c.n < 0n ? -1n : 1n), c.d));
  return fromMC(m, q(c.n, c.d + 1n));
}
const base = fromMC(q(3, 2), q(7, 3)), cf = lensById("cf");
const only = process.argv[2];
for (const F of candidateFamilies) {
  if (only && F.id !== only) continue;
  const p = F.dealable({ params: { domain: "Q" } } as never)[0], r = lineRule(F.dynamic!, p);
  // The ladder: from a plain line, the rule's candidate with the smallest utility at or above each level.
  const rungs: Line[] = [];
  for (const level of [2, 4, 8, 12, 16, 24, 32]) {
    const cands = r.candidates(base, level).filter(t => t.b !== 0n && r.u(t) >= level - 1e-9).sort((a, b) => r.u(a) - r.u(b));
    if (cands[0] && !rungs.some(x => x.a === cands[0]!.a && x.b === cands[0]!.b && x.c === cands[0]!.c)) rungs.push(cands[0]);
  }
  const t0 = performance.now();
  const es = rungs.map(l => E(F, p, l));
  const ms = (performance.now() - t0) / (2 * Math.max(1, rungs.length));
  console.log(`\n### ${F.title} (${F.space!.label(p as never)}), ${ms.toFixed(0)} ms an estimate`);
  console.log("| rung (m, c) | u | energy | after +1 on its number: u, energy | next rung: cheapest turn (cf lens) | energy added |");
  console.log("|---|---|---|---|---|---|");
  rungs.forEach((l, i) => {
    const k = knock(F.id, p, l), next = rungs[i + 1];
    const cost = next ? routePrice(lambda, l, next) : null, costCf = next ? routePrice(lambda, l, next, [cf]) : null;
    const gain = next ? es[i + 1]! - es[i]! : NaN;
    const flag = cost && gain > cost.total ? " **pump**" : "";
    console.log(`| ${show(l)} | ${U(F, p, l).toFixed(1)} | ${es[i]!.toFixed(1)} | ${U(F, p, k).toFixed(1)}, ${E(F, p, k).toFixed(1)} | ${cost ? `${cost.total.toFixed(1)} (${Number.isFinite(costCf!.total) ? costCf!.total.toFixed(1) : "–"})` : ""} | ${next ? gain.toFixed(1) + flag : ""} |`);
  });
  const trivial = [fromMC(q(1), q(0)), fromMC(q(2), q(3)), fromMC(q(1, 2), q(1)), fromMC(q(-1), q(1)), fromMC(q(3), q(1))];
  const tv = trivial.map(l => [U(F, p, l), E(F, p, l)] as const).filter(([u]) => Number.isFinite(u));
  const worst = tv.reduce((b, x) => (x[1] > b[1] ? x : b), [NaN, -Infinity] as const);
  console.log(`Trivial lines (y = x, 2x + 3, x/2 + 1, −x + 1, 3x + 1): best energy ${worst[1].toFixed(1)} (u ${worst[0].toFixed(1)}).`);
}
