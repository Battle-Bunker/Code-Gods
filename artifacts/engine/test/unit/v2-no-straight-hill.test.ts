/**
 * The energy gate (the coordinator's ruling, 15 Nov; replaces the slope rules and the "30 bits in 30 steps" cap): can a
 * greedy climber, with one seat's whole-game income spent on one object, take a dealt line rule past 35 bits?
 *
 * For every dealt line rule of every line preset, from law draws and (for a ladder family) from rung starts (a law draw
 * moved by the cheapest shift or tilt onto its first rung), the climber repeatedly takes the move that raises the rule
 * most per energy among the variant's shortcuts (stretch, zoom and turn by small factors and turns) and shifts and
 * tilts of every size (1 to 1000, and ½), never repeating a state, until the income (power × game length + start) is
 * spent or no move helps. It fails when the rule's bits pass 35 anywhere on the way. What keeps ladders under it is the
 * price of a shortcut on a big line (v2-linear mutators.ts shortcutFloor) and the cap on a ladder's value tail (v2-
 * valuation value.ts ladderCaps). Breaks caught: Smooth Intercept by repeated "multiply by 3" (playtest round 21: 59-bit
 * seats; round 26: a line frozen at 22.87 bits); Divisibility Ladder's greedy mixed stretches to 77.6 bits.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCall, evaluateSite, isInvalid, rng, variantMutators, type ObjectType } from "@workspace/v2-core";
import { lineLaw, type LineState } from "@workspace/v2-linear";
import { pairLaw, type PairState } from "@workspace/v2-pair";
import { findVariant, valueLookup } from "@workspace/v2-valuation";
import { dealablePool, familyOf } from "../../convex/v2/deal.ts";
import { PRESETS } from "../../convex/v2/presets.ts";
import { valueRecord } from "../../convex/v2/values.ts";

const LIMIT = 35, STARTS = 3, MAX_STEPS = 80;
/**
 * Known open fails, each reported to its owner. An entry that no longer fails fails the test below: remove it then.
 * Square Area's prime-factor tie-breakers (the grids session's family): their prime-valued tails pay about p/2 bits for
 * a root with a big prime factor, reached by shifts: 58.5 bits on line-q, 141–316 on line-q-lenses (15 Nov).
 */
const OPEN: Record<string, string> = {
  "square-area/lpf": "grids session, reported 15 Nov",
  "square-area/spf": "grids session, reported 15 Nov",
};
const FACTORS = ["2", "3", "5", "7", "11", "13", "17", "10", "1/2", "1/3", "1/5", "1/10"];
const AMOUNTS = ["1", "-1", "2", "-2", "10", "-10", "100", "-100", "1000", "-1000", "1/2", "-1/2"];
const CALLS: Record<string, readonly Record<string, string>[]> = {
  "mach.stretch": FACTORS.map(f => ({ f })),
  "basis.zoom": FACTORS.map(f => ({ f })),
  "rot.turn": [{ centre: "origin", turn: "left" }, { centre: "origin", turn: "3/4" },
    ...["0", "1", "-1"].flatMap(centre => ["1", "-1", "1/2", "-1/2", "left"].map(turn => ({ centre, turn })))],
  "si.shift": AMOUNTS.map(k => ({ k })),
  "si.tilt": AMOUNTS.map(k => ({ k })),
};

/** Pairs (the coordinator's adoption of trials 28 and 29 for pairs, 15 Nov): the line's calls on either line, and the pair's shortcuts. */
const PAIR_CALLS: Record<string, readonly Record<string, string>[]> = {
  ...Object.fromEntries(Object.entries(CALLS).map(([m, list]) => [m, ["1", "2"].flatMap(line => list.map(a => ({ line, ...a })))])),
  "pair.reflect": [{ line: "1" }, { line: "2" }],
  "pair.quarter": [{ line: "1" }, { line: "2" }],
  "sys.zoom": FACTORS.map(f => ({ f })),
};

test(`no dealt line or pair rule passes ${LIMIT} bits on one seat's whole-game income spent on one object`, () => {
  const failures: string[] = [], report: string[] = [];
  const seen = new Set<string>(), openWorst = new Map<string, number>();
  let chains = 0;
  for (const preset of PRESETS) {
    const { type, variant } = findVariant(preset.variant);
    if (type.id !== "line" && type.id !== "pair") continue;
    type S = LineState | PairState;
    const T = type as ObjectType<S>, pair = type.id === "pair";
    const income = preset.economy.powerPerSecond * preset.worldSeconds + preset.startingEnergy;
    const offered = new Set(variantMutators(type, variant).map(m => m.id));
    const calls = Object.entries(pair ? PAIR_CALLS : CALLS).filter(([m]) => offered.has(m)).flatMap(([mutator, list]) => list.map(args => ({ mutator, args })));
    const step = (s: S, c: { mutator: string; args: Record<string, string> }) => {
      const a = applyCall(T, variant, s, { mutator: c.mutator, site: 0, args: c.args });
      return isInvalid(a) ? null : { s: a.result, fee: a.price.total };
    };
    const law = pair ? pairLaw(variant) : lineLaw(variant);
    for (const rule of dealablePool(preset)) {
      // One run per variant, rule and income (the bidding preset shares the beginner's).
      const key = `${variant.id}|${rule.ruleKey}|${income}|${[...offered].sort().join()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const rec = valueRecord(rule.ruleKey);
      if (!rec) continue;
      const look = valueLookup(rec), fam = familyOf(rule.family);
      const ev = (s: S) => evaluateSite(T, fam as never, rule.params, s, variant, 0, rule.tieBreaker);
      const bitsOf = (s: S) => { const e = ev(s); return e.score === null ? 0 : look(e.score).bits; };
      const main = (s: S) => { const v = ev(s).terms[0]?.value; return v && typeof v === "object" && "n" in v ? Number(v.n) / Number(v.d) : -Infinity; };
      const r = rng("energy-gate", preset.id, rule.ruleKey);
      const starts: S[] = [];
      for (let k = 0; starts.length < STARTS && k < 50; k++) { const d = law.draw(r, 1); if (d.state) starts.push(d.state as S); }
      // On a rung: a line ladder's main part is its level (≥ 1); a pair ladder's is base^level × (1, 2] (level ≥ 1: ≥ q or k).
      const p = rule.params as { q?: number; k?: number }, rung = pair ? (p.q ?? p.k ?? 2) : 1;
      if (fam.keepsParams) {
        for (let k = 0, found = 0; found < STARTS && k < 30; k++) {
          const d = law.draw(r, 1);
          if (!d.state) continue;
          let best: { s: S; fee: number } | null = null;
          for (const m of ["si.shift", "si.tilt"]) for (const line of pair ? ["1", "2"] : [undefined]) for (let j = -60; j <= 60; j++) {
            if (!j) continue;
            const o = step(d.state as S, { mutator: m, args: { k: String(j), ...(line ? { line } : {}) } });
            if (o && main(o.s) >= rung && (!best || o.fee < best.fee)) best = o;
          }
          if (best) { starts.push(best.s); found++; }
        }
      }
      let worst = 0;
      for (const [k, start] of starts.entries()) {
        let s = start, spent = 0, top = bitsOf(s);
        const visited = new Set([T.encode(s)]);
        for (let i = 0; i < MAX_STEPS; i++) {
          let pick: { s: S; fee: number; g: number; b: number } | null = null;
          const b0 = bitsOf(s);
          for (const c of calls) {
            const o = step(s, c);
            if (!o || spent + o.fee > income || visited.has(T.encode(o.s))) continue;
            const b = bitsOf(o.s), g = (b - b0) / Math.max(o.fee, 1e-9);
            if (g > 0 && (!pick || g > pick.g)) pick = { ...o, g, b };
          }
          if (!pick) break;
          if (process.env.GATE_TRACE && rule.family === process.env.GATE_TRACE) console.error(`${rule.ruleKey} #${k}: ${b0.toFixed(1)} → ${pick.b.toFixed(1)} for ${pick.fee.toFixed(1)}⚡: ${T.encode(s)} → ${T.encode(pick.s)}`);
          s = pick.s; spent += pick.fee; visited.add(T.encode(s)); top = Math.max(top, pick.b);
        }
        chains++;
        worst = Math.max(worst, top);
        if (top > LIMIT && !(`${rule.family}/${rule.tieBreaker}` in OPEN)) failures.push(`${preset.id} ${rule.family}${JSON.stringify(rule.params)}/${rule.tieBreaker} from ${k < STARTS ? "law draw" : "rung start"} ${k}: ${top.toFixed(1)} bits for ${spent.toFixed(0)}⚡ (at ${T.encode(s)})`);
      }
      report.push(`${preset.id} ${rule.family}${JSON.stringify(rule.params)}/${rule.tieBreaker}: best ${worst.toFixed(1)} bits`);
      if (`${rule.family}/${rule.tieBreaker}` in OPEN) openWorst.set(`${rule.family}/${rule.tieBreaker}`, Math.max(openWorst.get(`${rule.family}/${rule.tieBreaker}`) ?? 0, worst));
    }
  }
  console.log(report.join("\n"));
  assert.ok(chains > 100, `${chains} chains`);
  assert.deepEqual(failures, []);
  for (const [rule, worst] of openWorst) assert.ok(worst > LIMIT, `${rule} now stays at ${worst.toFixed(1)} bits: remove it from OPEN`);
});
