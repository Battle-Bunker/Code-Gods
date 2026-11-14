/**
 * Contributors (docs/engine-v2/annotations-design.md §2, §5, §10): each layer of the dealt rule as the chain of
 * quantities it was computed from, read only from the rule's own terms and marks; and the moves that make a line rarer,
 * priced, with their new bits from the rule's value function (owner decision 23: no steps, no thresholds).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { q, rng, walkStep, type Q, type Score } from "@workspace/v2-core";
import { beginnerPool, divisibilityLadder, fromMC, lineQ, lineType, lineZ, primeLanding, squareArea, treasure, wholeCrossing, type LineState } from "@workspace/v2-linear";
import { valueLookup, type ValueFunction } from "@workspace/v2-valuation";
import { contributors, type RuleRef } from "../src/index.ts";
import { moves } from "../src/moves.ts";

const mc = (m: number | Q, c: number | Q): LineState => ({ lines: [fromMC(typeof m === "number" ? q(m) : m, typeof c === "number" ? q(c) : c)] });
const rule = (family: RuleRef<LineState, unknown>["family"], tieBreaker: string, params: unknown = family.dealable(lineZ)[0]): RuleRef<LineState, unknown> =>
  ({ type: lineType, family, params, variant: lineZ, tieBreaker });

const VALUES = path.resolve(import.meta.dirname, "../../v2-valuation/values/line-z");
function valueOf(r: RuleRef<LineState, unknown>): (u: Score) => number {
  const dir = path.join(VALUES, r.family.id);
  const file = readdirSync(dir).find(f => f.endsWith(`-${r.tieBreaker}.json`))!;
  const vf = JSON.parse(readFileSync(path.join(dir, file), "utf8")) as ValueFunction;
  const look = valueLookup(vf);
  return u => look(u).bits;
}

test("Prime Landing on y = 6x + 25: c, its nearest prime 23, 2 below; the tie-breaker is that prime, bigger is better", () => {
  const c = contributors(rule(primeLanding, "big-prime"), mc(6, 25));
  const [main, tb] = c.parts;
  assert.equal(main!.role, "main");
  assert.deepEqual(main!.source.map(s => `${s.label} ${s.text}`), ["y-intercept 25"]);
  assert.equal(main!.reference?.value, 23);
  assert.equal(main!.distance, "2 above 23");
  assert.equal(main!.aim, "the closer, the better");
  const at = main!.ruler!.refs.map(r => r.at);
  assert.ok(at.includes(23) && at.includes(29), `the reference 23 and the next prime 29 are on the ruler: ${at}`);
  assert.equal(main!.ruler!.refs.find(r => r.strong)?.at, 23);
  assert.equal(main!.ruler!.value, 25);
  assert.equal(tb!.role, "tb");
  assert.equal(tb!.valueText, "23");
  assert.equal(tb!.aim, "the bigger, the better");
  assert.ok(tb!.ruler!.refs.some(r => r.at === 29), "the primes above are on its ruler");
});

test("Square Area on y = −x + 7: the area 24½ against the square 25 = 5 × 5; Whole Crossing and Treasure name their references", () => {
  const sa = contributors(rule(squareArea, "spf"), mc(-1, 7)).parts[0]!;
  assert.equal(sa.source[0]!.text, "24½");
  assert.equal(sa.reference?.value, 25);
  assert.equal(sa.distance, "½ below 25");
  const wc = contributors(rule(wholeCrossing, "k-gpf"), mc(3, 7)).parts[0]!;
  assert.equal(wc.reference?.value, -2);
  assert.equal(wc.distance, "⅓ below −2");
  // The reference is said once, as the reference: never again among the sources ("…, nearest whole number −2 · on −2").
  assert.deepEqual(wc.source.filter(x => x.text).map(x => x.label), ["where it crosses the x-axis"], wc.source.map(x => x.label).join(", "));
  // The tie-breaker reads the main part's reference (the whole number −2): its line says so, so one number carrying ●
  // as the main part's target and ◆ as the tie-breaker's input is explained where it is read.
  const wtb = contributors(rule(wholeCrossing, "k-gpf"), mc(3, 7)).parts[1]!;
  assert.match(wtb.sentence, /of −2, the (nearest )?whole number the main part is measured to/, wtb.sentence);
  const tr = contributors(rule(treasure, "m-spf"), mc(15, 6)).parts[0]!;
  assert.equal(tr.source[0]!.text, "36");
  assert.equal(tr.source[0]!.label, "y(2)");
  assert.equal(tr.reference?.value, 37);
  assert.equal(tr.distance, "1 below 37");
  const on = contributors(rule(primeLanding, "big-prime"), mc(6, 23)).parts[0]!;
  assert.equal(on.distance, "on 23");
});

test("wording: no parameter letters, no 'distance …: 0', no steps or thresholds, in any generated sentence", () => {
  const cases: [RuleRef<LineState, unknown>, LineState][] = [
    [rule(primeLanding, "big-prime"), mc(6, 25)], [rule(primeLanding, "m-gpf"), mc(290, 59)],
    [rule(squareArea, "spf"), mc(-1, 7)], [rule(squareArea, "lpf"), mc(290, 59)],
    [rule(wholeCrossing, "k-gpf"), mc(3, 7)], [rule(treasure, "m-spf"), mc(15, 6)], [rule(treasure, "m-spf"), mc(15, 7)],
    [rule(divisibilityLadder, "m-spf"), mc(12, 12)],
  ];
  for (const [r, s] of cases) {
    const letters = r.family.params.map(p => p.name);
    for (const part of contributors(r, s).parts) {
      for (const text of [part.sentence, part.distance ?? "", part.title, part.valueText]) {
        for (const l of letters) assert.doesNotMatch(text, new RegExp(`(^|[^A-Za-z(])${l}([^A-Za-z)]|$)`), `${r.family.id}: "${text}" leaks ${l}`);
        assert.doesNotMatch(text, /distance[^:]*: 0\b/i, `${r.family.id}: "${text}"`);
        assert.doesNotMatch(text, /\bstep \d|\bwithin \d|≥ ?\d/, `${r.family.id}: "${text}"`);
      }
    }
  }
});

test("moves: varied, one per kind: the cheapest for the main part, the cheapest for the tie-breaker, the most bits per ⚡", () => {
  const r = rule(primeLanding, "big-prime");
  const value = valueOf(r);
  for (const s of [mc(6, 25), mc(3, 19), mc(-2, 40)]) {
    const before = value(contributors(r, s).utility);
    const ms = moves(r, s, value, { k: 3 });
    assert.ok(ms.length >= 2, `${ms.length} moves`);
    const kinds = ms.map(m => m.call.mutator);
    assert.equal(new Set(kinds).size, kinds.length, `one move per kind: ${kinds.join(", ")}`);
    for (const m of ms) {
      assert.ok(m.bits! > before, "every move makes the line rarer");
      assert.ok(m.reason.length > 0, "each move says why it is listed");
      assert.equal(ms.filter(x => x.reason === m.reason).length, 1, `each reason once: ${ms.map(x => x.reason).join(" | ")}`);
      assert.doesNotMatch(m.words, /\b(a|b|k) /, `move words leak a letter: ${m.words}`);
    }
  }
  // Where the main part can improve (25 is 2 above the prime 23), the first move listed is the cheapest that does.
  assert.match(moves(r, mc(6, 25), value, { k: 3 })[0]!.reason, /main part/);
  assert.match(moves(r, mc(6, 25), value, { k: 3 })[0]!.changes.join(" "), /25 → /);
});

test("contributors never throw, and say no steps, on a walk of lines under every pool rule and tie-breaker", () => {
  for (const variant of [lineZ, lineQ]) {
    const g = rng(`contributors:${variant.id}`);
    let s = mc(290, 59);
    const states: LineState[] = [s, mc(5, 27720), mc(q(1, 6), q(7, 6))];
    for (let i = 0; i < 60; i++) { s = walkStep(lineType, variant, s, g); states.push(s); }
    for (const f of beginnerPool) for (const tb of f.tieBreakers) for (const st of states) {
      const r: RuleRef<LineState, unknown> = { type: lineType, family: f as never, params: f.dealable(variant)[0], variant, tieBreaker: tb.id };
      for (const p of contributors(r, st).parts) assert.doesNotMatch(p.sentence, /\bstep \d|NaN|undefined/, `${f.id}/${tb.id}: ${p.sentence}`);
    }
  }
});
