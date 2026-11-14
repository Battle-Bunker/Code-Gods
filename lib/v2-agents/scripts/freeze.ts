/**
 * Why boards freeze (diagnosis, no change to game logic). Runs a table under unique objects, then looks at the board
 * at the end: for each object, is there a single move that raises some seat's objective? Two objectives: the seat's own
 * rarity (bits) and its points (own bits × the others' bits, added up). Two neighbourhoods: the starters' own (shift or
 * tilt by 1..3) and a wider one (1..10). A move onto a state another object holds is not counted (unique objects), nor
 * one dearer than a whole power's full charge.
 *
 *   node --experimental-strip-types scripts/freeze.ts [--table mixed] [--agents climb|wide|dip|naive] [--variant line-z] [--births 0.1] [--games 2]
 *
 * Prints, per game: committed moves and objects moved in the last minute, the share of late acts that made no move, and
 * the share of objects frozen (no improving move for any seat) per objective and neighbourhood.
 */
import { parseArgs } from "node:util";
import { evaluateSite, q, type Q } from "@workspace/v2-core";
import { LINES_BEGINNER_ECONOMY as E } from "@workspace/v2-economy";
import { fromMC, lineQ, lineType, lineZ, presets, type LineState } from "@workspace/v2-linear";
import { valueLookup } from "@workspace/v2-valuation";
import { changeCharge, EngineHost, sandboxes, startersFor } from "../src/index.ts";
import { findValues } from "../src/harness.ts";
import { runTable } from "../src/table.ts";

const { values: o } = parseArgs({ options: {
  table: { type: "string", default: "mixed" }, agents: { type: "string", default: "climb" }, variant: { type: "string", default: "line-q" },
  births: { type: "string", default: "0.05" }, objects: { type: "string", default: "10" }, games: { type: "string", default: "2" }, seconds: { type: "string", default: "300" },
} });
const TABLES: Record<string, string[]> = {
  compatible: ["prime-landing/m-spf", "treasure/m-spf", "prime-gradient/prime"],
  mixed: ["prime-landing/big-prime", "treasure/prime-terms", "whole-crossing/k-spf"],
  conflict: ["prime-landing/big-prime", "square-area/spf", "whole-crossing/k-spf"],
  four: ["prime-landing/big-prime", "treasure/prime-terms", "whole-crossing/k-spf", "prime-gradient/prime"],
};
const variant = o.variant === "line-q" ? lineQ : lineZ;
const beginner = presets.find(p => p.id === "lines-beginner")!.rules;
const rules = TABLES[o.table!]!.map(id => { const [family, tieBreaker] = id.split("/") as [string, string]; return { family, params: beginner.find(r => r.family === family)!.params as Record<string, unknown>, tieBreaker }; });
const bitsOf = rules.map(rule => { const look = valueLookup(findValues(variant.id, rule)!), f = lineType.families.find(x => x.id === rule.family)!;
  return (s: LineState) => look(evaluateSite(lineType, f, rule.params, s, variant, 0, rule.tieBreaker).score).bits; });

// Escapes from a local optimum, on top of the shipped climbing starter: wide (when stuck, steps up to twice as far) and
// dip (when stuck, a quarter of the time, the best step that keeps at least 95% of one's points).
const RETURN = "  return climb(offer, options, score(m, c, p, tie), QUOTES);";
const WIDE = `  const now = score(m, c, p, tie), step = climb(offer, options, now, QUOTES);
  if (step) return step;
  const wide = [];
  for (let k = -2 * FAR; k <= 2 * FAR; k++) { if (Math.abs(k) <= FAR) continue;
    wide.push([move("si.shift", { k }), score(m, Q.add(c, k), p, tie)]); wide.push([move("si.tilt", { k }), score(Q.add(m, k), c, p, tie)]); }
  return climb(offer, wide, now, QUOTES);`;
// shortcut: when stuck, the representation mutators as ways across a valley (decision 25): stretch, pivot, mirror.
const SHORTCUT = `  const now = score(m, c, p, tie), step = climb(offer, options, now, QUOTES);
  if (step) return step;
  const sc = [];
  for (const f of [2, 3, -1, Q.of(1, 2), Q.of(1, 3)]) sc.push([move("mach.stretch", { f }), Q.mul(m, Q.from(f)), Q.mul(c, Q.from(f))]);
  for (const x0 of [-1, 1, 2]) for (const k of [-2, -1, 1, 2]) sc.push([move("cart.pivot", { x0, k }), Q.add(m, Q.from(k)), Q.sub(c, Q.mul(Q.from(k), Q.from(x0)))]);
  sc.push([move("cart.mirror", { axis: "y" }), Q.neg(m), c], [move("cart.mirror", { axis: "x" }), Q.neg(m), Q.neg(c)], [move("cart.mirror", { axis: "origin" }), m, Q.neg(c)]);
  if (!Q.eq(m, Q.of(0))) sc.push([move("cart.mirror", { axis: "diagonal" }), Q.div(Q.of(1), m), Q.neg(Q.div(c, m))]);
  return climb(offer, sc.map(([pl, m2, c2]) => [pl, score(m2, c2, p, tie)]), now, QUOTES);`;
const ROUNDING = "  tries.push(...rounding(m, c));";
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
  const source = o.agents === "wide" ? swap(WIDE) : o.agents === "dip" ? swap(DIP) : o.agents === "shortcut" ? swap(SHORTCUT)
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
const steps = (far: number) => Array.from({ length: far }, (_, k) => k + 1).flatMap(k => [k, -k]).flatMap(k => [
  { mutator: "si.shift", site: 0, args: { k: String(k) } }, { mutator: "si.tilt", site: 0, args: { k: String(k) } }]);
// The rounding helper's steps, host side: to the whole number below or above, by one part, a stretch by the denominator.
const rounding = (s: LineState) => {
  const v = new EngineHost({ type: lineType, variant, state: s, rule: rules[0]!, energy: 0 }).handle({ op: "view", rep: "si" } as never, { hostCallsLeft: 5 }) as { ok: boolean; result?: { elements: { m: { q?: string }; c: { q?: string } } } };
  if (!v.ok || !v.result!.elements.m.q || !v.result!.elements.c.q) return [];
  const out: { mutator: string; site: number; args: Record<string, string> }[] = [];
  for (const [name, mut] of [["c", "si.shift"], ["m", "si.tilt"]] as const) {
    const [n, d = "1"] = v.result!.elements[name].q!.split("/");
    if (d === "1") continue;
    const N = BigInt(n!), D = BigInt(d), fl = N >= 0n ? N / D : -((-N + D - 1n) / D);
    out.push({ mutator: mut, site: 0, args: { k: `${fl * D - N}/${D}` } }, { mutator: mut, site: 0, args: { k: `${(fl + 1n) * D - N}/${D}` } },
      { mutator: mut, site: 0, args: { k: `1/${D}` } }, { mutator: mut, site: 0, args: { k: `-1/${D}` } }, { mutator: "mach.stretch", site: 0, args: { f: String(D) } });
  }
  return out;
};
const SHORTCUTS = [
  ...["2", "3", "-1", "1/2", "1/3"].map(f => ({ mutator: "mach.stretch", site: 0, args: { f } })),
  ...["-1", "1", "2"].flatMap(x0 => ["-2", "-1", "1", "2"].map(k => ({ mutator: "cart.pivot", site: 0, args: { x0, k } }))),
  ...["x", "y", "origin", "diagonal"].map(axis => ({ mutator: "cart.mirror", site: 0, args: { axis } })),
];
const moves = (s: LineState, set: string) => (set === "steps" ? [...steps(3), ...rounding(s)] : set === "shortcuts" ? [...steps(3), ...rounding(s), ...SHORTCUTS] : [...steps(10), ...rounding(s)]);
for (let g = 0; g < Number(o.games); g++) {
  const seats = rules.map((rule, k) => ({ name: `P${k}`, kind: "starter" as const, rule, program: program(rule.family) }));
  const r = await runTable(boxes, { type: lineType, variant, lines: Number(o.objects), seed: `g${g}`, seconds: Number(o.seconds), seats, unique: true, birthsPerSecond: Number(o.births), summonCap: E.startingEnergy });
  const final = r.final as LineState[];
  const held = new Set(final.map(s => lineType.encode(s)));
  const frozen: Record<string, number> = {};
  for (const set of ["steps", "shortcuts", "far"]) for (const objective of ["bits", "points"] as const) {
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
  console.log(JSON.stringify({ table: o.table, agents: o.agents, variant: variant.id, births: Number(o.births), game: g, objects: r.objects,
    lateMoves: r.late.moves, lateObjectsMoved: r.late.objectsMoved, lateIdle: +idle.toFixed(2),
    frozen: Object.fromEntries(Object.entries(frozen).map(([k, v]) => [k, +v.toFixed(2)])), gained: Math.round(r.seats.reduce((a, s) => a + s.gained, 0)),
    byMutator: Object.fromEntries(Object.entries(r.byMutator).map(([k, v]) => [k, { moves: v.moves, points: Math.round(v.points), charge: Math.round(v.charge) }])),
    digits: { max: Math.max(...final.map(digits)), mean: +(final.reduce((a, s) => a + digits(s), 0) / final.length).toFixed(1) },
    endpoint: { meanPerObject: +(final.reduce((a, s) => a + tableTotal(s), 0) / final.length).toFixed(1), bestPerObject: +Math.max(...final.map(tableTotal)).toFixed(1), windowBest: +windowBest.toFixed(1) } }));
}
await boxes.close();
