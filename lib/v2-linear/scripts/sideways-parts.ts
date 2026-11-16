/**
 * "Lift + sideways, per part" for the combined-reading families (docs/engine-v2/interaction-census.md, fourth run): the
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

function study(id: string, p: unknown, tb: TieBreaker) {
  const f = lineType.families.find(x => x.id === id) as AnyF, part = PARTS[id]!(p);
  const vec = (l: Line): number[] => {
    const depth = 1 + (tb ? tb.split(">").length : 0);
    let s: readonly (Q | null)[] | null = null;
    try { s = evaluateSite(lineType, f, p, { lines: [l] }, lineQ, 0, tb).score as never; } catch { s = null; }
    return Array.from({ length: depth }, (_, i) => (s && s[i] ? Qn.toNumber(s[i]!) : -Infinity));
  };
  const cmp = (a: number[], b: number[]) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! < b[i]! ? -1 : 1; return 0; };
  const V = LINES.map(vec), X = LINES.map(l => part.read(Qn.toNumber(mOf(l)), Qn.toNumber(cOf(l))));
  const order = Array.from({ length: N }, (_, k) => k).sort((a, b) => cmp(V[b]!, V[a]!));
  const bits = new Float64Array(N);
  let mass = 0;
  for (let i = 0; i < N;) { let j = i; while (j + 1 < N && cmp(V[order[j + 1]!]!, V[order[i]!]!) === 0) j++; for (let t = i; t <= j; t++) mass += W[order[t]!]!; for (let t = i; t <= j; t++) bits[order[t]!] = -Math.log2(Math.min(1, mass)); i = j + 1; }
  const r = rng("sideways-parts", id);
  const energy = (k: number): { lift: number; sideways: number } => {
    const x = X[k]!;
    if (x === null) return { lift: 0, sideways: 0 };
    const lift = TRIAL_LOG.g * Math.log2(1 + x);
    const end = order.findIndex(i => cmp(V[i]!, V[k]!) < 0), cls = order.slice(0, end < 0 ? N : end);
    const near = [...cls].filter(i => X[i] !== null).sort((a, b) => Math.abs(Math.log2(1 + X[a]!) - Math.log2(1 + x)) - Math.abs(Math.log2(1 + X[b]!) - Math.log2(1 + x))).slice(0, NEAR);
    const inCls = (l: Line) => { const i = KEY.get(key(l)); return cmp(i === undefined ? vec(l) : V[i]!, V[k]!) >= 0; };
    const finish = (st: Line): number => {
      if (inCls(st)) return 0;
      let best = Infinity;
      for (const t of near) {
        const mt = mOf(LINES[t]!), ct = cOf(LINES[t]!), viaT = fromMC(mt, cOf(st)), viaS = fromMC(mOf(st), ct);
        if (!Qn.eq(mt, mOf(st)) && inCls(viaT)) best = Math.min(best, price("si.tilt", { k: Qn.sub(mt, mOf(st)) }, st, viaT));
        if (!Qn.eq(ct, cOf(st)) && inCls(viaS)) best = Math.min(best, price("si.shift", { k: Qn.sub(ct, cOf(st)) }, st, viaS));
        best = Math.min(best, price("si.tilt", { k: Qn.sub(mt, mOf(st)) }, st, viaT) + price("si.shift", { k: Qn.sub(ct, cOf(viaT)) }, viaT, LINES[t]!));
      }
      return best;
    };
    let sum = 0;
    for (let s = 0; s < STARTS; s++) {
      // A start whose reading is within a factor of √2 of x: the gradient from the law, the y-intercept solved for it.
      let st: Line | null = null;
      for (let tries = 0; !st && tries < 50; tries++) {
        const d = drawLine(r), m = Qn.toNumber(q(d.m.p, d.m.q)), y = x * 2 ** (r.unit() - 0.5), c = part.solveC(m, y);
        if (c === null || !Number.isFinite(c)) continue;
        const cand = fromMC(q(d.m.p, d.m.q), Qn.mul(simple(c), q(r.bit() ? 1 : -1)));
        const got = part.read(Qn.toNumber(mOf(cand)), Qn.toNumber(cOf(cand)));
        if (got !== null && Math.abs(Math.log2((1 + got) / (1 + x))) <= 0.5) st = cand;
      }
      if (!st) continue;
      let best = finish(st);
      for (const [sid, sa] of SHORTCUTS) { if (best === 0) break; const to = apply(sid, sa, st); if (to) best = Math.min(best, price(sid, sa, st, to) + finish(to)); }
      sum += Number.isFinite(best) ? best : 0;
    }
    return { lift, sideways: sum / STARTS };
  };
  const spread = Array.from({ length: 12 }, (_, i) => order[Math.min(N - 1, Math.floor((i / 11) ** 3 * (N - 1)))]!).filter(k => X[k] !== null);
  const es = spread.map(energy);
  const rho = spearman(es.map(e => e.lift + e.sideways), spread.map(k => bits[k]!));
  const liftShare = es.reduce((a, e) => a + e.lift, 0) / es.reduce((a, e) => a + e.lift + e.sideways, 0);
  const rhoLift = spearman(es.map(e => e.lift), spread.map(k => bits[k]!)), rhoSide = spearman(es.map(e => e.sideways), spread.map(k => bits[k]!));
  return { rho, rhoLift, rhoSide, liftShare };
}
function spearman(x: number[], y: number[]): number {
  const rank = (v: number[]) => { const o = v.map((a, i) => [a, i] as const).sort((a, b) => a[0] - b[0]); const rr = new Array<number>(v.length); for (let i = 0; i < o.length;) { let j = i; while (j + 1 < o.length && o[j + 1]![0] === o[i]![0]) j++; for (let t = i; t <= j; t++) rr[o[t]![1]] = (i + j) / 2; i = j + 1; } return rr; };
  const a = rank(x), b = rank(y), n = a.length, mu = (n - 1) / 2;
  let s = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { s += (a[i]! - mu) * (b[i]! - mu); da += (a[i]! - mu) ** 2; db += (b[i]! - mu) ** 2; }
  return da && db ? s / Math.sqrt(da * db) : 0;
}
console.log("| family | instance | ρ(energy, bits) | ρ(lift, bits) | ρ(sideways, bits) | lift share | dominant |\n|---|---|---|---|---|---|---|");
for (const { id, p, tb } of RULES) {
  const s = study(id, p, tb);
  console.log(`| ${id} | ${JSON.stringify(p)} [${tb}] | ${s.rho.toFixed(2)} | ${s.rhoLift.toFixed(2)} | ${s.rhoSide.toFixed(2)} | ${s.liftShare.toFixed(2)} | ${s.liftShare >= 0.5 ? "lift" : "sideways"} |`);
}
