/**
 * Why boards freeze (diagnosis, no change to game logic). Runs a table under unique objects, then looks at the board
 * at the end: for each object, is there a single move that raises some seat's objective? Two objectives: the seat's own
 * rarity (bits) and its points (own bits × the others' bits, added up). Two neighbourhoods: the starters' own (shift or
 * tilt by 1..3) and a wider one (1..10). A move onto a state another object holds is not counted (unique objects), nor
 * one dearer than a whole power's full charge.
 *
 *   node --experimental-strip-types scripts/freeze.ts [--table mixed] [--agents points] [--variant line-z] [--births 0.1] [--games 2]
 *
 * Prints, per game: committed moves and objects moved in the last minute, the share of late acts that made no move, and
 * the share of objects frozen (no improving move for any seat) per objective and neighbourhood.
 */
import { parseArgs } from "node:util";
import { evaluateSite, q, type Q } from "@workspace/v2-core";
import { LINES_BEGINNER_ECONOMY as E } from "@workspace/v2-economy";
import { lineQ, lineType, lineZ, presets, type LineState } from "@workspace/v2-linear";
import { valueLookup } from "@workspace/v2-valuation";
import { changeCharge, EngineHost, sandboxes, startersFor } from "../src/index.ts";
import { findValues } from "../src/harness.ts";
import { runTable } from "../src/table.ts";

const { values: o } = parseArgs({ options: {
  table: { type: "string", default: "mixed" }, agents: { type: "string", default: "points" }, variant: { type: "string", default: "line-z" },
  births: { type: "string", default: "0.1" }, games: { type: "string", default: "2" }, seconds: { type: "string", default: "300" },
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

// The points climber: each act, the move that most raises own rarity × the others' total (othersAfter).
const HURT = "  if (hurt(offer)) plans = plans.slice(0, QUOTES).filter(plan => pays(offer, plan, top));\n";
const POINTS = `  { const w = worth(offer); if (w) { let best = null, bv = w.mine * w.others;
    for (const [mv, m2, c2] of tries) { const o = offer.othersAfter([mv]); if (o.after === null) continue; const v = rarity(offer, score(m2, c2, p, tie)) * o.after; if (v > bv) { bv = v; best = mv; } }
    return best ? [best] : null; } }
`;
const program = (family: string) => {
  const a = startersFor(family, "typescript").find(x => x.kind === (o.agents === "naive" ? "naive" : "simple"))!;
  const source = o.agents === "points" ? a.source.replace(HURT, POINTS) : o.agents === "selfish" ? a.source.replace(HURT, "") : a.source;
  return { language: a.language, source };
};

const boxes = sandboxes();
const moves = (far: number) => Array.from({ length: far }, (_, k) => k + 1).flatMap(k => [k, -k]).flatMap(k => [
  { mutator: "si.shift", site: 0, args: { k: String(k) } }, { mutator: "si.tilt", site: 0, args: { k: String(k) } }]);
for (let g = 0; g < Number(o.games); g++) {
  const seats = rules.map((rule, k) => ({ name: `P${k}`, kind: "starter" as const, rule, program: program(rule.family) }));
  const r = await runTable(boxes, { type: lineType, variant, lines: 24, seed: `g${g}`, seconds: Number(o.seconds), seats, unique: true, birthsPerSecond: Number(o.births), summonCap: E.startingEnergy });
  const final = r.final as LineState[];
  const held = new Set(final.map(s => lineType.encode(s)));
  const frozen: Record<string, number> = {};
  for (const far of [3, 10]) for (const objective of ["bits", "points"] as const) {
    let stuck = 0;
    for (const s of final) {
      const n = bitsOf.map(b => b(s));
      const value = (i: number, m: number[]) => (objective === "bits" ? m[i]! : m[i]! * (m.reduce((a, b) => a + b, 0) - m[i]!));
      const host = new EngineHost({ type: lineType, variant, state: s, rule: rules[0]!, energy: 0 });
      let any = false;
      for (const call of moves(far)) {
        const priced = host.price([call]);
        if (!priced.valid || changeCharge(priced.total) > E.powerPerSecond * E.fullChargeSeconds) continue;
        const after = priced.result as LineState;
        if (held.has(lineType.encode(after))) continue;
        const m = bitsOf.map(b => b(after));
        if (rules.some((_, i) => value(i, m) > value(i, n) + 1e-9)) { any = true; break; }
      }
      if (!any) stuck++;
    }
    frozen[`${objective}@${far}`] = stuck / final.length;
  }
  const idle = r.seats.reduce((a, s) => a + s.lateIdleShare, 0) / r.seats.length;
  console.log(JSON.stringify({ table: o.table, agents: o.agents, variant: variant.id, births: Number(o.births), game: g, objects: r.objects,
    lateMoves: r.late.moves, lateObjectsMoved: r.late.objectsMoved, lateIdle: +idle.toFixed(2),
    frozen: Object.fromEntries(Object.entries(frozen).map(([k, v]) => [k, +v.toFixed(2)])), gained: Math.round(r.seats.reduce((a, s) => a + s.gained, 0)) }));
}
await boxes.close();
