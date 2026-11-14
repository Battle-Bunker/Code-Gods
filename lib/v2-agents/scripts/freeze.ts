/**
 * Why boards freeze (diagnosis, no change to game logic). Runs a table under unique objects, then looks at the board
 * at the end: for each object, is there a single move that raises some seat's objective? Two objectives: the seat's own
 * rarity (bits) and its points (own bits × the others' bits, added up). Two neighbourhoods: the starters' own (shift or
 * tilt by 1..3) and a wider one (1..10). A move onto a state another object holds is not counted (unique objects), nor
 * one dearer than a whole power's full charge.
 *
 *   node --experimental-strip-types scripts/freeze.ts [--table mixed] [--agents climb|wide|dip|naive|shortcut|lens] [--variant line-q|line-q-lenses|line-z] [--births 0.1] [--games 2]
 *
 * Prints, per game: committed moves and objects moved in the last minute, the share of late acts that made no move, and
 * the share of objects frozen (no improving move for any seat) per objective and neighbourhood.
 */
import { parseArgs } from "node:util";
import { evaluateSite, q, type Q } from "@workspace/v2-core";
import { LINES_BEGINNER_ECONOMY as E } from "@workspace/v2-economy";
import { fromMC, lineQ, lineQLenses, lineType, lineZ, presets, type LineState } from "@workspace/v2-linear";
import { valueLookup } from "@workspace/v2-valuation";
import { changeCharge, EngineHost, sandboxes, startersFor } from "../src/index.ts";
import { findValues } from "../src/harness.ts";
import { runTable } from "../src/table.ts";
import { RETURN, rounding as roundingOf, SHORTCUT, SHORTCUTS, steps } from "./climbers.ts";

const { values: o } = parseArgs({ options: {
  table: { type: "string", default: "mixed" }, agents: { type: "string", default: "climb" }, variant: { type: "string", default: "line-q" },
  births: { type: "string", default: "0.05" }, objects: { type: "string", default: "10" }, noise: { type: "string", default: "0" }, games: { type: "string", default: "2" }, seconds: { type: "string", default: "300" },
} });
const TABLES: Record<string, string[]> = {
  compatible: ["prime-landing/m-spf", "treasure/m-spf", "prime-gradient/prime"],
  mixed: ["prime-landing/big-prime", "treasure/prime-terms", "whole-crossing/k-spf"],
  conflict: ["prime-landing/big-prime", "square-area/spf", "whole-crossing/k-spf"],
  four: ["prime-landing/big-prime", "treasure/prime-terms", "whole-crossing/k-spf", "prime-gradient/prime"],
};
const variant = o.variant === "line-q" ? lineQ : o.variant === "line-q-lenses" ? lineQLenses : lineZ;
const beginner = presets.find(p => p.id === "lines-beginner")!.rules;
const rules = TABLES[o.table!]!.map(id => { const [family, tieBreaker] = id.split("/") as [string, string]; return { family, params: beginner.find(r => r.family === family)!.params as Record<string, unknown>, tieBreaker }; });
const bitsOf = rules.map(rule => { const look = valueLookup(findValues(variant.id, rule)!), f = lineType.families.find(x => x.id === rule.family)!;
  return (s: LineState) => look(evaluateSite(lineType, f, rule.params, s, variant, 0, rule.tieBreaker).score).bits; });

// Escapes from a local optimum, on top of the shipped climbing starter: wide (when stuck, steps up to twice as far) and
// dip (when stuck, a quarter of the time, the best step that keeps at least 95% of one's points).
const WIDE = `  const now = score(m, c, p, tie), step = climb(offer, options, now, QUOTES);
  if (step) return step;
  const wide = [];
  for (let k = -2 * FAR; k <= 2 * FAR; k++) { if (Math.abs(k) <= FAR) continue;
    wide.push([move("si.shift", { k }), score(m, Q.add(c, k), p, tie)]); wide.push([move("si.tilt", { k }), score(Q.add(m, k), c, p, tie)]); }
  return climb(offer, wide, now, QUOTES);`;
// lens: when stuck, the shortcuts above plus the five lens moves of line-q-lenses (lenses-and-mutators.md §5): a turn about
// a pin or the origin, the m ↔ c swap, a lean, a zoom, a level fold about a pin. Each option carries the (m, c) it reaches.
const LENS = SHORTCUT.replace("  return climb(offer, sc.map(", `  const one = Q.of(1), zero = Q.of(0);
  sc.push([move("coef.swap", { pair: "m-c" }), c, m]);
  for (const x0 of [0, 1, -1]) {
    const X = Q.from(x0), y0 = Q.add(Q.mul(m, X), c);
    for (const t of ["left", 1, -1, 2, -2, Q.of(1, 2), Q.of(-1, 2), Q.of(3, 4), Q.of(-3, 4)]) {
      let m2 = null;
      if (t === "left") { if (!Q.eq(m, zero)) m2 = Q.neg(Q.div(one, m)); }
      else { const den = Q.sub(one, Q.mul(m, Q.from(t))); if (!Q.eq(den, zero)) m2 = Q.div(Q.add(m, Q.from(t)), den); }
      if (m2 !== null) sc.push([move("rot.turn", { centre: x0, turn: t }), m2, Q.sub(y0, Q.mul(m2, X))]);
    }
    sc.push([move("fold", { x0, s: 0 }), Q.neg(m), Q.add(y0, Q.mul(m, X))]);
  }
  if (!Q.eq(m, zero)) {
    const run = Q.div(one, m), xi = Q.neg(Q.div(c, m));
    for (const k of [1, -1, Q.of(1, 2), Q.of(-1, 2)]) { const r2 = Q.sub(run, Q.from(k)); if (!Q.eq(r2, zero)) { const m2 = Q.div(one, r2); sc.push([move("basis.lean", { k }), m2, Q.neg(Q.mul(m2, xi))]); } }
  }
  if (!Q.eq(c, zero)) for (const f of [2, 3, -2, Q.of(1, 2), Q.of(1, 3)]) sc.push([move("basis.zoom", { f }), m, Q.mul(c, Q.from(f))]);
  return climb(offer, sc.map(`);
if (LENS === SHORTCUT) throw new Error("the shortcut climber's last line moved");
const ROUNDING = "  tries.push(...rounding(m, c));";
// own: v1's starters climbed only their own rule (never the others' disclosed sum).
const OWN = `  const now = score(m, c, p, tie);
  let best = null, top = now;
  for (const [pl, s] of options) if (better(s, top) && price(offer, pl) !== null) { top = s; best = pl; }
  return best ? [best] : null;`;
// ownfirst: points, but only among steps that do not lower one's own rule (the others' noisy sum as a weaker signal).
const OWNFIRST = `  const now = score(m, c, p, tie);
  return climb(offer, options.filter(([, s]) => !better(now, s)), now, QUOTES);`;
const DIP = `  const step = climb(offer, options, score(m, c, p, tie), QUOTES);
  if (step || Math.random() >= 0.25) return step;
  const w = worth(offer);
  if (!w) return null;
  let best = null, bv = -Infinity;
  for (const [plan, s] of options.slice(0, QUOTES)) { const o = offer.othersAfter([plan]); if (o.after === null) continue; const v = rarity(offer, s) * o.after; if (v > bv) { bv = v; best = plan; } }
  return best && bv >= 0.95 * w.mine * w.others ? [best] : null;`;
const program = (family: string) => {
  const a = startersFor(family, "typescript").find(x => x.kind === (o.agents === "naive" ? "naive" : "simple"))!;
  const swap = (with_: string) => { const s = a.source.replace(RETURN, with_); if (s === a.source) throw new Error("the starter's last line moved"); return s; };
  const source = o.agents === "wide" ? swap(WIDE) : o.agents === "dip" ? swap(DIP) : o.agents === "shortcut" ? swap(SHORTCUT) : o.agents === "lens" ? swap(LENS) : o.agents === "own" ? swap(OWN) : o.agents === "ownfirst" ? swap(OWNFIRST)
    : o.agents === "noround" ? a.source.split("\n").filter(l => !l.startsWith(ROUNDING)).join("\n") : a.source;
  if (o.agents === "noround" && source === a.source) throw new Error("no rounding line");
  return { language: a.language, source };
};

// A rule-knowing search for comparison: the best table total of any whole-number line with |m| <= 10, |c| <= 60.
const tableTotal = (s: LineState) => { const n = bitsOf.map(b => b(s)), t = n.reduce((a, b) => a + b, 0); return n.reduce((a, x) => a + x * (t - x), 0); };
let windowBest = 0;
for (let m = -10; m <= 10; m++) if (m) for (let c = -60; c <= 60; c++) windowBest = Math.max(windowBest, tableTotal({ lines: [fromMC(q(m), q(c))] }));
// The size of a line's numbers: its largest numerator or denominator (in y = mx + c), in decimal digits.
const digits = (s: LineState) => {
  const v = new EngineHost({ type: lineType, variant, state: s, rule: rules[0]!, energy: 0 }).handle({ op: "view", rep: "si" } as never, { hostCallsLeft: 5 }) as { ok: boolean; result?: { elements: { m: { q?: string }; c: { q?: string } } } };
  if (!v.ok) return 0;
  return Math.max(...[v.result!.elements.m.q, v.result!.elements.c.q].flatMap(x => (x ?? "0").replace("-", "").split("/")).map(x => x.length));
};

const boxes = sandboxes();
const rounding = (s: LineState) => roundingOf(variant, rules[0]!, s);
const LENS_MOVES = [
  { mutator: "coef.swap", site: 0, args: { pair: "m-c" } },
  ...["0", "1", "-1"].flatMap(centre => ["left", "1", "-1", "2", "-2", "1/2", "-1/2", "3/4", "-3/4"].map(turn => ({ mutator: "rot.turn", site: 0, args: { centre, turn } }))),
  ...["left", "right", "3/4", "-3/4", "4/3", "-4/3"].map(turn => ({ mutator: "rot.turn", site: 0, args: { centre: "origin", turn } })),
  ...["0", "1", "-1"].map(x0 => ({ mutator: "fold", site: 0, args: { x0, s: "0" } })),
  ...["1", "-1", "1/2", "-1/2"].map(k => ({ mutator: "basis.lean", site: 0, args: { k } })),
  ...["2", "3", "-2", "1/2", "1/3"].map(f => ({ mutator: "basis.zoom", site: 0, args: { f } })),
];
const moves = (s: LineState, set: string) => (set === "steps" ? [...steps(3), ...rounding(s)] : set === "shortcuts" ? [...steps(3), ...rounding(s), ...SHORTCUTS]
  : set === "lenses" ? [...steps(3), ...rounding(s), ...SHORTCUTS, ...LENS_MOVES] : [...steps(10), ...rounding(s)]);
for (let g = 0; g < Number(o.games); g++) {
  const seats = rules.map((rule, k) => ({ name: `P${k}`, kind: "starter" as const, rule, program: program(rule.family) }));
  const r = await runTable(boxes, { type: lineType, variant, lines: Number(o.objects), seed: `g${g}`, seconds: Number(o.seconds), seats, unique: true, birthsPerSecond: Number(o.births), noise: Number(o.noise), summonCap: E.startingEnergy });
  const final = r.final as LineState[];
  const held = new Set(final.map(s => lineType.encode(s)));
  const frozen: Record<string, number> = {};
  for (const set of variant === lineQLenses ? ["steps", "shortcuts", "lenses", "far"] : ["steps", "shortcuts", "far"]) for (const objective of ["bits", "points"] as const) {
    let stuck = 0;
    for (const s of final) {
      const n = bitsOf.map(b => b(s));
      const value = (i: number, m: number[]) => (objective === "bits" ? m[i]! : m[i]! * (m.reduce((a, b) => a + b, 0) - m[i]!));
      const host = new EngineHost({ type: lineType, variant, state: s, rule: rules[0]!, energy: 0 });
      let any = false;
      for (const call of moves(s, set)) {
        const priced = host.price([call]);
        if (!priced.valid || changeCharge(priced.total) > E.powerPerSecond * E.fullChargeSeconds) continue;
        const after = priced.result as LineState;
        if (held.has(lineType.encode(after))) continue;
        const m = bitsOf.map(b => b(after));
        if (rules.some((_, i) => value(i, m) > value(i, n) + 1e-9)) { any = true; break; }
      }
      if (!any) stuck++;
    }
    frozen[`${objective}@${set}`] = stuck / final.length;
  }
  const idle = r.seats.reduce((a, s) => a + s.lateIdleShare, 0) / r.seats.length;
  const moved = r.seats.reduce((a, s) => a + s.moves, 0);
  console.log(JSON.stringify({ noise: Number(o.noise), moves: moved, flipRate: moved ? +(r.seats.reduce((a, s) => a + s.flips, 0) / moved).toFixed(3) : 0,
    trueGainShare: moved ? +(r.seats.reduce((a, s) => a + s.trueGainShare * s.moves, 0) / moved).toFixed(2) : 0, table: o.table, agents: o.agents, variant: variant.id, births: Number(o.births), game: g, objects: r.objects,
    lateMoves: r.late.moves, lateObjectsMoved: r.late.objectsMoved, lateIdle: +idle.toFixed(2),
    frozen: Object.fromEntries(Object.entries(frozen).map(([k, v]) => [k, +v.toFixed(2)])), gained: Math.round(r.seats.reduce((a, s) => a + s.gained, 0)),
    byMutator: Object.fromEntries(Object.entries(r.byMutator).map(([k, v]) => [k, { moves: v.moves, points: Math.round(v.points), charge: Math.round(v.charge) }])),
    digits: { max: Math.max(...final.map(digits)), mean: +(final.reduce((a, s) => a + digits(s), 0) / final.length).toFixed(1) },
    endpoint: { meanPerObject: +(final.reduce((a, s) => a + tableTotal(s), 0) / final.length).toFixed(1), bestPerObject: +Math.max(...final.map(tableTotal)).toFixed(1), windowBest: +windowBest.toFixed(1),
      bestLine: (best => ({ si: (new EngineHost({ type: lineType, variant, state: best, rule: rules[0]!, energy: 0 }).handle({ op: "view", rep: "si" } as never, { hostCallsLeft: 5 }) as { result: { elements: { m: { q: string }; c: { q: string } } } }).result.elements, bits: bitsOf.map(f => +f(best).toFixed(1)) }))(final.reduce((a, s) => (tableTotal(s) > tableTotal(a) ? s : a))) } }));
}
await boxes.close();
