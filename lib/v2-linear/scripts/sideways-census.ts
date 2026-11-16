/**
 * "Lift + sideways" across the dealt and tree families (docs/engine-v2/interaction-census.md, last section; the measure:
 * trial-sideways.ts and docs/engine-v2/scoring-trial.md). Comparison only: nothing dealt changes.
 *
 * Generic over engine families (BUILT NARROWLY, the trial's own code takes one-number readings with explicit targets):
 * - a state's class is every grid line whose engine score is at least as good (main part, then the dealt layers);
 * - lift is the line's height H (TRIAL_LOG), not the lift of one read number (engine families do not expose their
 *   reading); lift share = H / (H + sideways);
 * - sideways is the mean, over random starts at the same height (trial-sideways startAt), of the cheapest route of up
 *   to two additions (a tilt and/or a shift) onto one of the class's members nearest s in height, priced by the trial's
 *   callPrice; no shortcuts (stretch, mirror, swap) are tried, so it is an upper bound on the trial's own search;
 * - "tree bits" is the census's law-weighted rarity of the score on the grid (the proxy for conditional rarity);
 * - the jump flag: from the rule's good grid lines (top 5%), one unit shift or tilt changes the rule's bits by 3 or more
 *   in the median.
 *   node --max-old-space-size=8000 --experimental-strip-types scripts/sideways-census.ts [--instances 3] [--starts 24]
 */
import { evaluateSite, Qn, q, rng, type Q, type RuleFamily, type TieBreaker } from "@workspace/v2-core";
import { callPrice, fromMC, height, lineQ, lineType, mcOf, rarityHeight, startAt, TRIAL_LOG, type Line, type LineState } from "../src/index.ts";

const args = process.argv.slice(2);
const opt = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i < 0 ? d : args[i + 1]!; };
const INSTANCES = Number(opt("instances", "3")), STARTS = Number(opt("starts", "24")), NEAR = 30;

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
const H = Float64Array.from(LINES, l => height(l, TRIAL_LOG));
const KEY = new Map(LINES.map((l, k) => [`${Qn.toWire(q(-l.a, l.b))},${Qn.toWire(q(-l.c, l.b))}`, k]));

type AnyF = RuleFamily<LineState, unknown>;
interface Rule { f: AnyF; p: unknown; tb: TieBreaker; label: string }
const vec = (r: Rule, l: Line): number[] => {
  const depth = 1 + (r.tb ? r.tb.split(">").length : 0);
  let s: readonly (Q | null)[] | null = null;
  try { s = evaluateSite(lineType, r.f, r.p, { lines: [l] }, lineQ, 0, r.tb).score as never; } catch { s = null; }
  return Array.from({ length: depth }, (_, i) => (s && s[i] ? Qn.toNumber(s[i]!) : -Infinity));
};
const cmp = (a: number[], b: number[]) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! < b[i]! ? -1 : 1; return 0; };

function study(r: Rule) {
  const V = LINES.map(l => vec(r, l));
  const order = Array.from({ length: N }, (_, k) => k).sort((a, b) => cmp(V[b]!, V[a]!));
  const bits = new Float64Array(N);
  let mass = 0;
  for (let i = 0; i < N;) { let j = i; while (j + 1 < N && cmp(V[order[j + 1]!]!, V[order[i]!]!) === 0) j++; for (let t = i; t <= j; t++) mass += W[order[t]!]!; for (let t = i; t <= j; t++) bits[order[t]!] = -Math.log2(Math.min(1, mass)); i = j + 1; }
  const rand = rng("sideways-census", r.label);
  // Sideways of one state: random starts at its height, routes of up to two additions onto nearby class members.
  const sideways = (k: number): number => {
    const cls = order.slice(0, order.findIndex(x => cmp(V[x]!, V[k]!) < 0) >>> 0 || N);
    const near = [...cls].sort((a, b) => Math.abs(H[a]! - H[k]!) - Math.abs(H[b]! - H[k]!)).slice(0, NEAR);
    const inCls = (l: Line) => { const i = KEY.get(`${Qn.toWire(q(-l.a, l.b))},${Qn.toWire(q(-l.c, l.b))}`); return i === undefined ? cmp(vec(r, l), V[k]!) >= 0 : cmp(V[i]!, V[k]!) >= 0; };
    let sum = 0;
    for (let s = 0; s < STARTS; s++) {
      const st = startAt(H[k]! / TRIAL_LOG.g, rand), m0 = q(-st.a, st.b), c0 = q(-st.c, st.b);
      if (inCls(st)) continue;
      let best = Infinity;
      for (const t of near) {
        const mt = q(-LINES[t]!.a, LINES[t]!.b), ct = q(-LINES[t]!.c, LINES[t]!.b);
        const tilt = (a: Line, m: Q) => fromMC(m, q(-a.c, a.b)), shift = (a: Line, c: Q) => fromMC(q(-a.a, a.b), c);
        const p = (id: string, k0: Q, a: Line, b: Line) => callPrice(id, { k: k0 }, a, b, TRIAL_LOG)?.total ?? Infinity;
        const viaTilt = tilt(st, mt), viaShift = shift(st, ct);
        if (!Qn.eq(mt, m0) && inCls(viaTilt)) best = Math.min(best, p("si.tilt", Qn.sub(mt, m0), st, viaTilt));
        if (!Qn.eq(ct, c0) && inCls(viaShift)) best = Math.min(best, p("si.shift", Qn.sub(ct, c0), st, viaShift));
        best = Math.min(best, p("si.tilt", Qn.sub(mt, m0), st, viaTilt) + p("si.shift", Qn.sub(ct, q(-viaTilt.c, viaTilt.b)), viaTilt, LINES[t]!));
      }
      sum += Number.isFinite(best) ? best : 0;
    }
    return sum / STARTS;
  };
  const on = order[0]!;
  const offL = fromMC(q(-LINES[on]!.a, LINES[on]!.b), Qn.add(q(-LINES[on]!.c, LINES[on]!.b), q(1)));
  const off = KEY.get(`${Qn.toWire(q(-offL.a, offL.b))},${Qn.toWire(q(-offL.c, offL.b))}`) ?? on;
  const half = order.reduce((b, k) => (Math.abs(bits[k]! - bits[on]! / 2) < Math.abs(bits[b]! - bits[on]! / 2) ? k : b), on);
  const row = (k: number) => { const sw = sideways(k); return { bits: bits[k]!, lift: H[k]!, sideways: sw, share: H[k]! / (H[k]! + sw) }; };
  // Rank agreement: energy against tree bits over twelve states spread over the rule's bits.
  const spread = Array.from({ length: 12 }, (_, i) => order[Math.min(N - 1, Math.floor((i / 11) ** 3 * (N - 1)))]!);
  const en = spread.map(k => H[k]! + sideways(k)), bt = spread.map(k => bits[k]!);
  // The jump flag: one unit shift or tilt from the top 5%.
  const deltas: number[] = [];
  for (const k of order.slice(0, Math.max(20, Math.floor(N / 20))).filter((_, i) => i % 37 === 0)) {
    const l = LINES[k]!, m = q(-l.a, l.b), c = q(-l.c, l.b);
    for (const to of [fromMC(m, Qn.add(c, q(1))), fromMC(m, Qn.sub(c, q(1))), fromMC(Qn.add(m, q(1)), c), fromMC(Qn.sub(m, q(1)), c)]) {
      const i = KEY.get(`${Qn.toWire(q(-to.a, to.b))},${Qn.toWire(q(-to.c, to.b))}`);
      if (i !== undefined) deltas.push(Math.abs(bits[i]! - bits[k]!));
    }
  }
  const med = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s[s.length >> 1] ?? NaN; };
  return { on: row(on), off: row(off), half: row(half), rho: spearman(en, bt), jump: med(deltas) };
}
function spearman(x: number[], y: number[]): number {
  const rank = (v: number[]) => { const o = v.map((a, i) => [a, i] as const).sort((a, b) => a[0] - b[0]); const r = new Array<number>(v.length); for (let i = 0; i < o.length;) { let j = i; while (j + 1 < o.length && o[j + 1]![0] === o[i]![0]) j++; for (let t = i; t <= j; t++) r[o[t]![1]] = (i + j) / 2; i = j + 1; } return r; };
  const a = rank(x), b = rank(y), n = a.length, mu = (n - 1) / 2;
  let s = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { s += (a[i]! - mu) * (b[i]! - mu); da += (a[i]! - mu) ** 2; db += (b[i]! - mu) ** 2; }
  return da && db ? s / Math.sqrt(da * db) : 0;
}

const DEALT = ["prime-landing", "smooth-intercept", "square-area", "whole-crossing", "treasure", "same-on-both-rulers", "prime-gradient", "prime-staircase", "ruler", "pythagorean-area"];
const TREE = ["tree-nt-prime-top", "tree-nt-smooth-mixed", "tree-nt-tower", "tree-geo-rings", "tree-geo-legs", "tree-geo-quadrant", "tree-rep-borrowed", "tree-rep-step", "tree-rep-partway"];
const R = rng("sideways-census-draws");
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : "—");
console.log("| family | instance | bits on / off / half | lift share on / off / half | sideways on / off / half | ρ(energy, tree bits) | median Δbits under one cheap move | jumps |\n|---|---|---|---|---|---|---|---|");
for (const id of [...DEALT, ...TREE]) {
  const f = lineType.families.find(x => x.id === id) as AnyF;
  const listed = f.dealable(lineQ);
  for (let i = 0; i < INSTANCES; i++) {
    const p = f.space ? f.space.draw(R) : listed[i % listed.length];
    const chains = f.chains ?? (f.valuation === "tree" ? [f.tieBreakers.map(t => t.id).join(">")] : f.tieBreakers.map(t => t.id));
    const tb = chains[i % chains.length] ?? null;
    const label = `${id}(${f.space ? f.space.label(p as never) : JSON.stringify(p)})${tb ? ` [${tb}]` : ""}`;
    const s = study({ f, p, tb, label });
    console.log(`| ${id} | ${(f.space ? f.space.label(p as never) : JSON.stringify(p))}${tb ? ` [${tb}]` : ""} | ${f2(s.on.bits)} / ${f2(s.off.bits)} / ${f2(s.half.bits)} | ${s.on.share.toFixed(2)} / ${s.off.share.toFixed(2)} / ${s.half.share.toFixed(2)} | ${f2(s.on.sideways)} / ${f2(s.off.sideways)} / ${f2(s.half.sideways)} | ${s.rho.toFixed(2)} | ${f2(s.jump)} | ${s.jump >= 3 ? "yes" : "no"} |`);
    if (!f.space && listed.length === 1) break;
  }
}
