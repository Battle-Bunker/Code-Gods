/**
 * Gravity measurement (docs/engine-v2/gravity.md): line-q's φ by the factorisation code (now) against the size code
 * with strength g (lib/v2-linear gravity.ts), on the tuple families, valued as a tree (capped inner parts or not).
 *   node --experimental-strip-types scripts/gravity-measure.ts --family prime-intercept --g 0.25 --alpha 1 [--cap 2|none]
 *     [--draws 40000] [--rate 1] [--income 3115] [--starts 4]
 * --g 0 is the factorisation code that line-q used before gravity. --rate k prices a call at its fee + k × its surcharge (the exchange-rate experiment (B)).
 */
import { parseArgs } from "node:util";
import { applyCall, evaluateSite, isInvalid, Qn, q, rng, type Score, type Variant } from "@workspace/v2-core";
import { fromMC, lineLaw, lineQ, lineQLenses, lineType, type LineState } from "@workspace/v2-linear";
import { buildTree, sampledDraws, treeLookup, VALUE_CONFIG } from "@workspace/v2-valuation";

const { values: o } = parseArgs({ options: {
  family: { type: "string" }, g: { type: "string", default: "0" }, alpha: { type: "string", default: "1" }, cap: { type: "string", default: "2" },
  draws: { type: "string", default: "40000" }, rate: { type: "string", default: "1" }, income: { type: "string", default: "3115" }, starts: { type: "string", default: "4" }, beta: { type: "string", default: "0" }, tilts: { type: "string", default: "1,0.6,0.35,0.2,0.12,0.07" },
}, args: process.argv.slice(2).filter(a => a !== "--") });
const g = Number(o.g), alpha = Number(o.alpha), rate = Number(o.rate), income = Number(o.income);
// --g 0: the factorisation code (line-q before gravity). heightPrice 1 here: --rate is the whole price of height.
const withG = (v: Variant): Variant => ({ ...v, id: `${v.id}-g${g}a${alpha}`, params: { ...v.params, gravity: g > 0 ? { g, alpha } : undefined }, heightPrice: 1 });
const V = withG(lineQ), VL = withG(lineQLenses);
const fam = lineType.families.find(f => f.id === o.family)!;
const params = fam.dealable(lineQ)[0];
const tb = fam.tieBreakers.slice(0, 2).map(t => t.id).join(">");
const { draws } = sampledDraws(lineType, lineLaw(V), fam, params, V, tb, { tilts: g > 0 ? o.tilts!.split(",").map(Number) : VALUE_CONFIG.tilts, drawsPerTilt: Number(o.draws) }, "tree");
const tree = buildTree(draws, o.cap === "none" ? Infinity : Number(o.cap)), look = treeLookup(tree);
const phi = (s: LineState) => lineType.readLength(s, V);
const score = (s: LineState): Score => evaluateSite(lineType, fam, params, s, V, 0, tb).score;
let clamped = 0;
// bits ≤ φ exactly: the state itself has its score, so P(score ≥ u) ≥ 2^−φ. The tree's estimate is noisy at the top.
const bits = (s: LineState) => { const b = look(score(s)).bits, f = lineType.readLength(s, V); if (b > f) { clamped++; return f; } return b; };
const u0 = (s: LineState) => { const u = score(s); return u === null || u[0] === null ? -Infinity : Qn.toNumber(u[0]); };

const L = (m: string, c: string): LineState => ({ lines: [fromMC(Qn.parse(m), Qn.parse(c))] });

// Each family: its first targets (values of the reading), and a line whose reading is T + δ.
const P1 = [11, 31, 41, 61, 71, 101, 131, 151, 181, 191];
const ex: Record<string, { targets: string[]; line: (t: string) => LineState }> = {
  "prime-intercept": { targets: P1.map(String), line: t => L("1/2", t) },
  "landing-tuple": { targets: P1.map(String), line: t => L("-1", t) },
  "treasure-tuple": { targets: [3, 6, 10, 15, 21, 28, 36, 45, 55, 66, 78, 91].map(String), line: t => L("1", Qn.toWire(Qn.sub(Qn.parse(t), q(3)))) },
  "rulers-tuple": { targets: [3, 5, 7, 9, 101, 111, 121, 131].map(String), line: t => L("0", t) },
  "fraction-gradient": { targets: [1, 3, 5, 7, 9, 11, 13, 15, 21, 31].map(k => `${k}/2`), line: t => L(t, "1") },
  "mixed-intercept": { targets: [0, 1, 2, 3, 5, 8, 13, 21, 34, 55].map(w => `${2 * w + 1}/2`), line: t => L("1/2", t) },
};
const E = ex[fam.id]!;
const plus = (t: string, d: string) => Qn.toWire(Qn.add(Qn.parse(t), Qn.parse(d)));
const f1 = (x: number) => x.toFixed(1);
console.log(`\n## ${fam.id} ${JSON.stringify(params)} ${tb} | ${g > 0 ? `g ${g}, α ${alpha}` : "factorisation (now)"} | cap ${o.cap} | rate ${rate} | ${draws.length} draws`);
// 1. each level: the level term and the total at the exact target; exact vs +1 vs +1/10 vs −1/10.
const lv = E.targets.map(t => { const s = E.line(t), l = look(score(s)); return { t, lvl: l.parts[0]!, tot: bits(s), phi: phi(s) }; });
console.log(`levels (target: level bits / exact total / φ): ${lv.map(x => `${x.t}: ${f1(x.lvl)}/${f1(x.tot)}/${f1(x.phi)}`).join(", ")}`);
const rises = lv.every((x, i) => i === 0 || x.tot >= lv[i - 1]!.tot - 0.05);
console.log(`points rise with the level: ${rises ? "yes" : "NO"}`);
for (const t of [E.targets[2]!, E.targets[5]!]) {
  const row = ["0", "1", "-1", "1/10", "-1/10", "1/3"].map(d => { const s = E.line(plus(t, d)); return `${d === "0" ? "exact" : d}: ${f1(bits(s))} (φ ${f1(phi(s))})`; });
  console.log(`at ${t}: ${row.join(", ")}`);
}
// 2. greedy climbs with the energy gate's menu.
const FACTORS = ["2", "3", "5", "7", "11", "13", "17", "10", "1/2", "1/3", "1/5", "1/10"];
const AMOUNTS = ["1", "-1", "2", "-2", "10", "-10", "100", "-100", "1000", "-1000", "1/2", "-1/2"];
const CALLS: Record<string, readonly Record<string, string>[]> = {
  "mach.stretch": FACTORS.map(f => ({ f })),
  "rot.turn": [{ centre: "origin", turn: "left" }, { centre: "origin", turn: "3/4" }, ...["0", "1", "-1"].flatMap(centre => ["1", "-1", "1/2", "-1/2", "left"].map(turn => ({ centre, turn })))],
  "si.shift": AMOUNTS.map(k => ({ k })), "si.tilt": AMOUNTS.map(k => ({ k })),
  "cart.mirror": ["x", "y", "origin", "diagonal"].map(axis => ({ axis })),
  "cart.slide": [["1", "0"], ["-1", "0"], ["0", "1"], ["0", "-1"]].map(([u, v]) => ({ u: u!, v: v! })),
  "cart.pivot": ["-2", "-1", "1", "2"].flatMap(x0 => ["1", "-1"].map(k => ({ x0, k }))),
  "int.move": ["x", "y"].flatMap(axis => ["1", "-1"].map(k => ({ axis, k }))),
  "seq.step": ["1", "-1", "2", "-2"].map(k => ({ k })),
  "gen.nudge": ["a", "b", "c"].flatMap(which => ["1", "-1"].map(k => ({ which, k }))),
};
const menu = Object.entries(CALLS).filter(([m]) => V.mutators.includes(m)).flatMap(([mutator, list]) => list.map(args => ({ mutator, site: 0, args })));
const SHORT = [...["2", "3", "1/2", "-1", "-2"].map(f => ({ mutator: "mach.stretch", site: 0, args: { f } })), ...["x", "y", "origin", "diagonal"].map(axis => ({ mutator: "cart.mirror", site: 0, args: { axis } })),
  ...["m-c", "b-c"].map(pair => ({ mutator: "coef.swap", site: 0, args: { pair } })), { mutator: "rot.turn", site: 0, args: { centre: "origin", turn: "left" } }];
const law = lineLaw(V), r = rng("gravity", fam.id, String(g), String(alpha));
const res: string[] = [], kept: number[] = [];
let shortPaid = 0, shortN = 0, shortGainOver = 0;
for (let n = 0; n < Number(o.starts); n++) {
  let s: LineState | null = null;
  while (!s) s = law.draw(r, 1).state as LineState | null;
  let spent = 0, top = bits(s), best = s, steps = 0, lvlUp = 0, maxBits = top, stall = "budget";
  const startU = u0(s), seen = new Set([lineType.encode(s)]);
  for (let i = 0; i < 120; i++) {
    const b0 = bits(s), lv0 = u0(s);
    let pick: { s: LineState; fee: number; g: number } | null = null;
    for (const c of menu) {
      const a = applyCall(lineType, V, s, c);
      if (isInvalid(a)) continue;
      const W = a.price.total + (rate - 1) * a.price.surcharge, fee = W + Number(o.beta) * W * W;   // the act charge W + βW² (v2-economy charge.ts)
      const t = a.result as LineState;
      if (spent + fee > income || seen.has(lineType.encode(t))) continue;
      const gn = (bits(t) - b0) / Math.max(fee, 1e-9);
      if (gn > 0 && (!pick || gn > pick.g)) pick = { s: t, fee, g: gn };
    }
    if (!pick) { stall = spent > income * 0.97 ? "budget" : "no move helps"; break; }
    s = pick.s; spent += pick.fee; steps++; seen.add(lineType.encode(s));
    if (u0(s) > lv0) lvlUp++;
    if (bits(s) > top) { top = bits(s); best = s; }
    maxBits = Math.max(maxBits, top);
  }
  const b = bits(best);
  for (const [mu, args] of [["si.shift", { k: "1" }], ["si.shift", { k: "-1" }], ["si.tilt", { k: "1" }], ["si.tilt", { k: "-1" }], ["gen.nudge", { which: "c", k: "1" }], ["cart.mirror", { axis: "x" }]] as const) {
    const x = applyCall(lineType, V, best, { mutator: mu, site: 0, args: args as Record<string, string> });
    if (!isInvalid(x) && b > 0) kept.push(bits(x.result as LineState) / b);
  }
  // Shortcuts from the climbed line: does each pay (by its surcharge) the height it gains, and does it gain more bits than its price?
  for (const c of SHORT) {
    const x = applyCall(lineType, VL, best, c);
    if (isInvalid(x)) continue;
    const t = x.result as LineState, dphi = phi(t) - phi(best), db = bits(t) - b;
    shortN++;
    if (x.price.surcharge >= dphi - 1e-9) shortPaid++;
    if (db > x.price.total + (rate - 1) * x.price.surcharge) shortGainOver++;
  }
  res.push(`${f1(maxBits)} bits, ${lvlUp} levels up (u0 ${startU === -Infinity ? "–" : startU.toPrecision(3)} → ${u0(best).toPrecision(4)}), ${steps} steps, ${spent.toFixed(0)}⚡ (${lvlUp ? (spent / lvlUp).toFixed(0) : "–"}⚡/level), stop: ${stall}, φ ${f1(phi(best))} at ${lineType.encode(best)}`);
}
const med = (xs: number[]) => { const a = xs.slice().sort((x, y) => x - y); return a.length ? a[a.length >> 1]! : NaN; };
console.log(`greedy (${income}⚡, the gate's menu; gate fails past 35 bits):\n- ${res.join("\n- ")}`);
console.log(`cheap move from the climbed line keeps ${(100 * med(kept)).toFixed(0)}% median (worst ${(100 * Math.min(...kept)).toFixed(0)}%)`);
console.log(`shortcuts (stretch, mirror, swap, turn) from climbed lines: pay their height ${shortPaid}/${shortN}; gain more bits than their price ${shortGainOver}/${shortN}`);
console.log(`φ clamp bound ${clamped} lookups`);
