/**
 * A diagnosis of per-part sideways within one level (Quadrant Square 3/2, level 4) (docs/engine-v2/interaction-census.md, fourth run): the
 * third run matched starts on the whole line's height; here, as the trial's per-part mode (#1140), starts are matched on
 * the READING's own size and lift is the reading's lift.
 *
 * BUILT: for a state s with reading x (the area, distance², base + height or meeting point, computed from m and c), the
 * class is every grid line scoring at least as well under the engine; lift = g·log2(1 + x) (TRIAL_LOG.g); sideways is the
 * mean, over random starts whose reading is within a factor of √2 of x (the gradient drawn from the trial's law, the
 * y-intercept solved for the reading, rounded to a fraction with bottom at most 4), of the cheapest route found: one
 * finishing addition (a tilt or a shift) onto a class member near in reading, or two (tilt then shift), optionally after
 * one of the trial's shortcuts (stretch ×2, ×3, ×½, ×⅓, ×−1, the three mirrors, the m–c swap), priced by callPrice.
 * ρ: Spearman's rank correlation between energy and the law-weighted grid bits over twelve states.
 *   node --max-old-space-size=8000 --experimental-strip-types scripts/sideways-parts.ts [--starts 16]
 */
import { evaluateSite, Qn, q, rng, type Q, type RuleFamily, type TieBreaker } from "@workspace/v2-core";
import { allMutators, callPrice, drawLine, fromMC, isVertical, lineQ, lineQLenses, lineType, mcOf, rarityHeight, TRIAL_LOG, type Line, type LineState } from "../src/index.ts";

const args = process.argv.slice(2);
const opt = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i < 0 ? d : args[i + 1]!; };
const STARTS = Number(opt("starts", "16")), NEAR = 30;
const values = (max: number, bottoms: number[]): Q[] => {
  const seen = new Map<string, Q>();
  for (const b of bottoms) for (let a = -max * b; a <= max * b; a++) { const x = q(a, b); seen.set(Qn.toWire(x), x); }
  return [...seen.values()].sort((x, y) => Qn.cmp(x, y));
};
const MS = values(20, [1, 2, 3]), CS = values(80, [1, 2]);
const LINES: Line[] = MS.flatMap(m => CS.map(c => fromMC(m, c)));
const N = LINES.length;
const W = Float64Array.from(LINES, l => 2 ** -rarityHeight(mcOf(l)!));
{ const t = W.reduce((a, b) => a + b, 0); for (let k = 0; k < N; k++) W[k]! /= t; }
const mOf = (l: Line) => q(-l.a, l.b), cOf = (l: Line) => q(-l.c, l.b);
const key = (l: Line) => `${Qn.toWire(mOf(l))},${Qn.toWire(cOf(l))}`;
const KEY = new Map(LINES.map((l, k) => [key(l), k]));

type AnyF = RuleFamily<LineState, unknown>;
/** A reading x of the line from m and c, and the y-intercept giving reading y at gradient m (null if none). */
interface Part { read(m: number, c: number): number | null; solveC(m: number, y: number): number | null }
const area: Part = { read: (m, c) => (m === 0 || c === 0 ? null : (c * c) / (2 * Math.abs(m))), solveC: (m, y) => (m === 0 ? null : Math.sqrt(2 * Math.abs(m) * y)) };
const PARTS: Record<string, (p: any) => Part> = {
  "square-area": () => area,
  "tree-geo-quadrant": () => area,
  "tree-rep-partway": () => area,
  "tree-geo-rings": () => ({ read: (m, c) => (c * c) / (1 + m * m), solveC: (m, y) => Math.sqrt(y * (1 + m * m)) }),
  "tree-geo-legs": () => ({ read: (m, c) => (m === 0 || c === 0 ? null : Math.abs(c) / Math.abs(m) + Math.abs(c)), solveC: (m, y) => (m === 0 ? null : y / (1 + 1 / Math.abs(m))) }),
  "tree-nt-tower": p => { const g = Number(Qn.toNumber(Qn.parse(p.g))); return { read: (m, c) => (m === g ? Math.abs(c) : Math.abs(c / (g - m))), solveC: (m, y) => (m === g ? y : y * Math.abs(g - m)) }; },
};
const RULES: { id: string; p: unknown; tb: TieBreaker }[] = [
  { id: "square-area", p: { ends: 9 }, tb: "shared-factor" },
  { id: "tree-nt-tower", p: { g: "2", u: 1, v: 0 }, tb: "closeness" },
  { id: "tree-geo-rings", p: { d: 2, u: 3, v: 4 }, tb: "closeness" },
  { id: "tree-geo-legs", p: { p: 3, q: 2, d: 2 }, tb: "closeness" },
  { id: "tree-geo-quadrant", p: { p: 3, q: 2 }, tb: "closeness" },
  { id: "tree-rep-partway", p: { reads: "area", ladder: "square", u: 2, v: 5 }, tb: "closeness" },
];

const BY_ID = new Map(allMutators.map(m => [m.id, m]));
const apply = (id: string, a: Record<string, unknown>, l: Line): Line | null => { const r = BY_ID.get(id)!.apply({ lines: [l] }, 0, a as never, lineQLenses); return "invalid" in r || isVertical(r.lines[0]!) ? null : r.lines[0]!; };
const price = (id: string, a: Record<string, unknown>, x: Line, y: Line) => callPrice(id, a, x, y, TRIAL_LOG)?.total ?? Infinity;
const SHORTCUTS: [string, Record<string, unknown>][] = [
  ["mach.stretch", { f: q(2) }], ["mach.stretch", { f: q(3) }], ["mach.stretch", { f: q(1, 2) }], ["mach.stretch", { f: q(1, 3) }], ["mach.stretch", { f: q(-1) }],
  ["cart.mirror", { axis: "x" }], ["cart.mirror", { axis: "y" }], ["cart.mirror", { axis: "origin" }], ["coef.swap", { pair: "m-c" }],
];
const simple = (x: number): Q => { let best = q(Math.round(x)); for (let b = 2; b <= 4; b++) { const t = q(Math.round(x * b), b); if (Math.abs(Qn.toNumber(t) - x) < Math.abs(Qn.toNumber(best) - x)) best = t; } return best; };


const f = lineType.families.find(x => x.id === "tree-geo-quadrant") as AnyF, p = { p: 3, q: 2 }, tb: TieBreaker = "closeness", part = PARTS["tree-geo-quadrant"]!(p);
const vec = (l: Line): number[] => { const s = evaluateSite(lineType, f, p, { lines: [l] }, lineQ, 0, tb).score as readonly (Q | null)[] | null; return [0, 1].map(i => (s && s[i] ? Qn.toNumber(s[i]!) : -Infinity)); };
const cmp = (a: number[], b: number[]) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! < b[i]! ? -1 : 1; return 0; };
const V = LINES.map(vec), X = LINES.map(l => part.read(Qn.toNumber(mOf(l)), Qn.toNumber(cOf(l))));
// Closeness bits within the level: −log2 of the law mass at least this close, given the level (built).
const lvl = LINES.map((_, k) => k).filter(k => V[k]![0] === 4);
const lvlMass = lvl.reduce((a, k) => a + W[k]!, 0);
const closeBits = (k: number) => -Math.log2(lvl.filter(i => V[i]![1] >= V[k]![1]).reduce((a, i) => a + W[i]!, 0) / lvlMass);
// Six states in level 4, spread from far to exact.
const sorted = [...lvl].sort((a, b) => V[a]![1] - V[b]![1]);
const picks = [0, 0.3, 0.55, 0.75, 0.9, 1].map(t => sorted[Math.min(sorted.length - 1, Math.floor(t * (sorted.length - 1)))]!);
const r = rng("sideways-diag");
const STARTS2 = 24;
console.log("| state | area | distance to 24 | closeness bits | class share of starts (in already) | sideways | cheapest route: none / one addition / two additions / via shortcut | unit tilt moves the area by |\n|---|---|---|---|---|---|---|---|");
for (const k of picks) {
  const x = X[k]!, end = (() => { const o = LINES.map((_, i) => i).filter(i => cmp(V[i]!, V[k]!) >= 0); return o; })();
  const near = end.filter(i => X[i] !== null).sort((a, b) => Math.abs(Math.log2(1 + X[a]!) - Math.log2(1 + x)) - Math.abs(Math.log2(1 + X[b]!) - Math.log2(1 + x))).slice(0, NEAR);
  const inCls = (l: Line) => { const i = KEY.get(key(l)); return cmp(i === undefined ? vec(l) : V[i]!, V[k]!) >= 0; };
  const finish = (st: Line): [number, string] => {
    if (inCls(st)) return [0, "none"];
    let best = Infinity, how = "—";
    for (const t of near) {
      const mt = mOf(LINES[t]!), ct = cOf(LINES[t]!), viaT = fromMC(mt, cOf(st)), viaS = fromMC(mOf(st), ct);
      if (!Qn.eq(mt, mOf(st)) && inCls(viaT)) { const v = price("si.tilt", { k: Qn.sub(mt, mOf(st)) }, st, viaT); if (v < best) { best = v; how = "one"; } }
      if (!Qn.eq(ct, cOf(st)) && inCls(viaS)) { const v = price("si.shift", { k: Qn.sub(ct, cOf(st)) }, st, viaS); if (v < best) { best = v; how = "one"; } }
      const v2 = price("si.tilt", { k: Qn.sub(mt, mOf(st)) }, st, viaT) + price("si.shift", { k: Qn.sub(ct, cOf(viaT)) }, viaT, LINES[t]!);
      if (v2 < best) { best = v2; how = "two"; }
    }
    return [best, how];
  };
  let sum = 0, inside = 0; const hows: Record<string, number> = { none: 0, one: 0, two: 0, shortcut: 0 };
  for (let s = 0; s < STARTS2; s++) {
    let st: Line | null = null;
    for (let tries = 0; !st && tries < 50; tries++) {
      const d = drawLine(r), m = Qn.toNumber(q(d.m.p, d.m.q)), y = x * 2 ** (r.unit() - 0.5), c = part.solveC(m, y);
      if (c === null || !Number.isFinite(c)) continue;
      const cand = fromMC(q(d.m.p, d.m.q), Qn.mul(simple(c), q(r.bit() ? 1 : -1)));
      const got = part.read(Qn.toNumber(mOf(cand)), Qn.toNumber(cOf(cand)));
      if (got !== null && Math.abs(Math.log2((1 + got) / (1 + x))) <= 0.5) st = cand;
    }
    if (!st) continue;
    let [best, how] = finish(st);
    for (const [sid, sa] of SHORTCUTS) { if (best === 0) break; const to = apply(sid, sa, st); if (to) { const [v] = finish(to); const t = price(sid, sa, st, to) + v; if (t < best) { best = t; how = "shortcut"; } } }
    if (best === 0) inside++;
    hows[how in hows ? how : "two"]!++;
    sum += Number.isFinite(best) ? best : 0;
  }
  const l = LINES[k]!, m = Qn.toNumber(mOf(l)), c = Qn.toNumber(cOf(l)), jump = Math.abs((part.read(m + 1, c) ?? x) - x);
  console.log(`| ${key(l).replace(",", "x + ").replace(/^/, "y = ")} | ${x.toFixed(2)} | ${Math.abs(x - 24).toFixed(2)} | ${closeBits(k).toFixed(2)} | ${(inside / STARTS2).toFixed(2)} | ${(sum / STARTS2).toFixed(0)} | ${hows.none} / ${hows.one} / ${hows.two} / ${hows.shortcut} | ${jump.toFixed(1)} |`);
}
