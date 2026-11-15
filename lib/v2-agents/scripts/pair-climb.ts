/**
 * The straight-climb check on the two-line ladders (the spec lead's request, 15 Nov): start on a rung (a law draw moved
 * by the cheapest shift or tilt onto level 1), then let one unopposed seat spend a whole game's income on that object,
 * each step the move that raises its bits most per energy among the shortcuts (stretch by small factors on either line,
 * reflect, quarter turn) and the additive moves (shift, tilt, turn about the crossing, slide, combine, translate). Per dealt rule: the bits after each step, how many steps
 * rise by about the same amount (a straight run), the peak and the energy spent, and whether the climb ends because
 * nothing helps (a frozen line) or the income runs out. Analysis only.
 *
 *   node --experimental-strip-types scripts/pair-climb.ts [--family whole-answer,high-start] [--starts 3] [--income 2500]
 */
import { parseArgs } from "node:util";
import { applyCall, evaluateSite, isInvalid, rng } from "@workspace/v2-core";
import { pairLaw, pairQ, pairType, type PairState } from "@workspace/v2-pair";
import { valuer } from "../src/harness.ts";
import { poolOf } from "./landscape-lib.ts";

const { values: o } = parseArgs({ options: {
  family: { type: "string" }, starts: { type: "string", default: "3" }, income: { type: "string", default: "2500" }, steps: { type: "string", default: "80" },
} });
const INCOME = Number(o.income), STARTS = Number(o.starts), STEPS = Number(o.steps);
const FACTORS = ["2", "3", "5", "7", "11", "1/2", "1/3", "1/5", "1/7", "-1", "-2", "-3"];
const AMOUNTS = ["1", "-1", "2", "-2", "10", "-10", "100", "-100", "1/2", "-1/2"];
const CALLS = ["1", "2"].flatMap(line => [
  ...FACTORS.map(f => ({ mutator: "mach.stretch", args: { line, f } })),
  { mutator: "pair.reflect", args: { line } }, { mutator: "pair.quarter", args: { line } },
  ...AMOUNTS.flatMap(k => [{ mutator: "si.shift", args: { line, k } }, { mutator: "si.tilt", args: { line, k } }, { mutator: "pair.turn", args: { line, k } }]),
  ...["1", "-1", "2", "-2", "5", "-5"].flatMap(k => [{ mutator: "pair.slide", args: { line, k } }, { mutator: "pair.combine", args: { line, k } }]),
]).concat(["2", "3", "5", "7", "11", "1/2", "1/3", "1/5", "1/7"].map(f => ({ mutator: "sys.zoom", args: { f } }))).concat(["1", "-1", "5", "-5"].flatMap(u => [{ mutator: "sys.translate", args: { u, v: "0" } }, { mutator: "sys.translate", args: { u: "0", v: u } }]));
const step = (s: PairState, c: { mutator: string; args: Record<string, string> }) => {
  const a = applyCall(pairType, pairQ, s, { mutator: c.mutator, site: 0, args: c.args });
  return isInvalid(a) ? null : { s: a.result, fee: a.price.total, call: `${c.mutator} ${Object.values(c.args).join(",")}` };
};
const only = o.family ? new Set(o.family.split(",")) : null;
const rules = poolOf("pair-q").rules.filter(r => !only || only.has(r.family));
const seen = new Set<string>();
const law = pairLaw(pairQ);
console.log(`Pairs: one seat, ${INCOME}⚡ on one object, from a rung start; each step the best bits per energy.`);
console.log("| rule | start bits | straight run (steps × bits a step) | peak bits | ⚡ spent | steps | ends | last moves |");
console.log("|---|--:|---|--:|--:|--:|---|---|");
for (const rule of rules) {
  const key = `${rule.family}/${rule.tieBreaker}`;
  if (seen.has(key)) continue;   // one rule per family and tie-breaker: its first dealt numbers
  seen.add(key);
  const fam = pairType.families.find(f => f.id === rule.family)!, bits = valuer(pairType, pairQ, rule).bits;
  const p = rule.params as { q?: number; k?: number }, base = p.q ?? p.k ?? 2;
  const main = (s: PairState) => { const v = evaluateSite(pairType, fam as never, rule.params, s, pairQ, 0, rule.tieBreaker).terms[0]?.value; return v && typeof v === "object" && "n" in v ? Number(v.n) / Number(v.d) : -Infinity; };
  const r = rng("pair-climb", key);
  for (let k = 0, found = 0; found < STARTS && k < 40; k++) {
    const d = law.draw(r, 1);
    if (!d.state) continue;
    let best: { s: PairState; fee: number } | null = null;
    for (const m of ["si.shift", "si.tilt"]) for (const line of ["1", "2"]) for (let j = -60; j <= 60; j++) {
      if (!j) continue;
      const x = step(d.state, { mutator: m, args: { line, k: String(j) } });
      if (x && main(x.s) >= base && (!best || x.fee < best.fee)) best = x;
    }
    if (!best) continue;
    found++;
    let s = best.s, spent = 0, ends = "steps";
    const trace = [bits(s)], moves: string[] = [], visited = new Set([pairType.encode(s)]);
    for (let i = 0; i < STEPS; i++) {
      const b0 = bits(s);
      let pick: { s: PairState; fee: number; g: number; call: string } | null = null;
      let broke = true;
      for (const c of CALLS) {
        const x = step(s, c);
        if (!x || visited.has(pairType.encode(x.s))) continue;
        if (spent + x.fee > INCOME) continue;
        broke = false;
        const g = (bits(x.s) - b0) / Math.max(x.fee, 1e-9);
        if (g > 0 && (!pick || g > pick.g)) pick = { ...x, g };
      }
      if (!pick) { ends = broke ? "income" : "frozen"; break; }
      if (process.env.TRACE) console.error(`  ${key} ${pick.call}: ${b0.toFixed(1)} → ${bits(pick.s).toFixed(1)} bits for ${pick.fee.toFixed(1)}⚡; ${pairType.encode(s)} (φ ${pairType.readLength(s, pairQ).toFixed(1)}) → ${pairType.encode(pick.s)} (φ ${pairType.readLength(pick.s, pairQ).toFixed(1)})`);
      s = pick.s; spent += pick.fee; visited.add(pairType.encode(s)); trace.push(bits(s)); moves.push(pick.call);
    }
    // The longest run of steps whose rise is within 25% of the run's first rise (and above 0.5 bits): a straight climb.
    let run = 0, rate = 0;
    for (let i = 1; i < trace.length; i++) {
      const d0 = trace[i]! - trace[i - 1]!;
      if (d0 < 0.5) continue;
      let j = i;
      while (j + 1 < trace.length && Math.abs(trace[j + 1]! - trace[j]! - d0) <= 0.25 * d0) j++;
      if (j - i + 1 > run) { run = j - i + 1; rate = d0; }
    }
    console.log(`| ${key} ${JSON.stringify(rule.params)} #${found} | ${trace[0]!.toFixed(1)} | ${run} × ${rate.toFixed(1)} | ${Math.max(...trace).toFixed(1)} | ${spent.toFixed(0)} | ${trace.length - 1} | ${ends} | ${moves.slice(-3).join("; ")} |`);
  }
}
