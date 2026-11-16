/**
 * Contributors (docs/engine-v2/annotations-design.md §2, §5, §10): each layer of the dealt rule as the chain of
 * quantities it was computed from, read only from the rule's own terms and marks; and the moves that make a line rarer,
 * priced, with their new bits from the rule's value function (owner decision 23: no steps, no thresholds).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { canonicalJson, hashHex, q, rng, walkStep, type Q, type Score } from "@workspace/v2-core";
import { beginnerPool, divisibilityLadder, fromMC, lineQ, lineType, lineZ, primeLanding, squareArea, treasure, wholeCrossing, type LineState } from "@workspace/v2-linear";
import { valueLookup, type ValueFunction } from "@workspace/v2-valuation";
import { contributors, partLine, type RuleRef } from "../src/index.ts";
import { moves } from "../src/moves.ts";

const mc = (m: number | Q, c: number | Q): LineState => ({ lines: [fromMC(typeof m === "number" ? q(m) : m, typeof c === "number" ? q(c) : c)] });
const rule = (family: RuleRef<LineState, unknown>["family"], tieBreaker: string, params: unknown = family.dealable(lineZ)[0]): RuleRef<LineState, unknown> =>
  ({ type: lineType, family, params, variant: lineZ, tieBreaker });

const VALUES = path.resolve(import.meta.dirname, "../../v2-valuation/values");
function valueOf(r: RuleRef<LineState, unknown>): (u: Score) => number {
  const dir = path.join(VALUES, r.variant.id, r.family.id);
  const file = readdirSync(dir).find(f => f === `${hashHex(canonicalJson(r.params))}-${r.tieBreaker}.json`)!;
  const vf = JSON.parse(readFileSync(path.join(dir, file), "utf8")) as ValueFunction;
  const look = valueLookup(vf);
  return u => look(u).bits;
}

test("Prime Landing (primes ending in 1) on y = −x + 33: lands at 33, off the ladder, 1½ from rounding to its nearest rung 31; the tie-breaker reads that prime", () => {
  const c = contributors(rule(primeLanding, "shared-factor", { ends: 1 }), mc(-1, 33));
  const [main, tb] = c.parts;
  assert.equal(main!.role, "main");
  assert.deepEqual(main!.source.map(s => `${s.label} ${s.text}`), ["where it crosses the x-axis 33"]);
  assert.equal(main!.reference?.value, 31);
  assert.equal(main!.valueText, "−1½");   // off every rung: minus how far it is from rounding to the nearest
  assert.equal(main!.aim, "the bigger, the better");
  assert.equal(tb!.role, "tb");
  assert.deepEqual(tb!.source.map(s => s.label), ["where it crosses the x-axis", "y-intercept"]);   // that prime and the y-intercept
  assert.equal(tb!.valueText, "3");   // 30 and 33 share 3
  // On the rung 31 the part says the family's own words, not its level number.
  assert.equal(contributors(rule(primeLanding, "shared-factor", { ends: 1 }), mc(-1, 31)).parts[0]!.valueText, "lands at 31, which rounds to the prime 31: 2 digits; the next big step is 3 digits");
});

test("Square Area on y = −x + 7: the area 24½ against the square 25 = 5 × 5; Whole Crossing and Treasure name their references", () => {
  const sa = contributors(rule(squareArea, "spf"), mc(-1, 7)).parts[0]!;
  assert.equal(sa.source[0]!.text, "24½");
  assert.equal(sa.reference?.value, 25);
  assert.equal(sa.distance, "½ below 25");
  const wc = contributors(rule(wholeCrossing, "shared-factor", { q: 5, r: 3 }), mc(3, 7)).parts[0]!;
  assert.equal(wc.reference?.value, -2);
  assert.equal(wc.distance, "⅓ below −2");
  // The reference is said once, as the reference: never again among the sources ("…, nearest whole number −2 · on −2").
  assert.deepEqual(wc.source.filter(x => x.text).map(x => x.label), ["where it crosses the x-axis"], wc.source.map(x => x.label).join(", "));
  // The tie-breaker reads the ladder number the crossing is measured to (−2: |−2| + 1 = 3) and the gradient 3: 3.
  const wtb = contributors(rule(wholeCrossing, "shared-factor", { q: 5, r: 3 }), mc(3, 7)).parts[1]!;
  assert.equal(wtb.valueText, "3");
  // Treasure: y(3) = 51 is nearest the coin pile 55 (10 coins high).
  const tr = contributors(rule(treasure, "shared-factor", { k: 3 }), mc(15, 6)).parts[0]!;
  assert.equal(tr.source[0]!.text, "51");
  assert.equal(tr.source[0]!.label, "y(3)");
  assert.equal(tr.reference?.value, 55);
  assert.equal(tr.distance, "4 below 55");
});

test("wording: no parameter letters, no 'distance …: 0', no steps or thresholds, in any generated sentence", () => {
  const cases: [RuleRef<LineState, unknown>, LineState][] = [
    [rule(primeLanding, "shared-factor", { ends: 1 }), mc(6, 25)], [rule(primeLanding, "shared-factor", { ends: 9, side: -1 }), mc(290, 59)],
    [rule(squareArea, "spf"), mc(-1, 7)], [rule(squareArea, "lpf"), mc(290, 59)],
    [rule(wholeCrossing, "shared-factor", { q: 5, r: 3 }), mc(3, 7)], [rule(treasure, "shared-factor"), mc(15, 6)], [rule(treasure, "shared-factor"), mc(15, 10)],
    [rule(divisibilityLadder, "next-rung"), mc(12, 12)],
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
  const r = { ...rule(primeLanding, "shared-factor", { ends: 1 }), variant: lineQ };   // the dealt ending's values (line-q)
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
  // Where the main part can improve (y = 6x + 25 lands at −4⅙, 15⅙ from 11, the nearest prime ending in 1: −14⅔ on the
  // ladder), the first move listed is the cheapest that does.
  assert.match(moves(r, mc(6, 25), value, { k: 3 })[0]!.reason, /main part/);
  assert.match(moves(r, mc(6, 25), value, { k: 3 })[0]!.changes.join(" "), /−14⅔ → /);
});

test("contributors never throw, and say no steps, on a walk of lines under every pool rule and tie-breaker", () => {
  for (const variant of [lineZ, lineQ]) {
    const g = rng(`contributors:${variant.id}`);
    let s = mc(290, 59);
    const states: LineState[] = [s, mc(5, 27720), mc(q(1, 6), q(7, 6))];
    for (let i = 0; i < 60; i++) { s = walkStep(lineType, variant, s, g); states.push(s); }
    for (const f of beginnerPool) for (const tb of f.tieBreakers) for (const st of states) {
      if (!f.dealable(variant).length) continue;   // a family dealt on the rationals only (Smooth Intercept)
      const r: RuleRef<LineState, unknown> = { type: lineType, family: f as never, params: f.dealable(variant)[0], variant, tieBreaker: tb.id };
      for (const p of contributors(r, st).parts) assert.doesNotMatch(p.sentence, /\bstep \d|NaN|undefined/, `${f.id}/${tb.id}: ${p.sentence}`);
    }
  }
});

test("a change from or to an undefined quantity says 'none', not the reason sentence", async () => {
  const { changesBetween, contributors } = await import("../src/index.ts");
  // Square Area has no reading of a vertical line (no triangle with the axes); some families do (they score it).
  const { squareArea, normalise } = await import("@workspace/v2-linear");
  const rule = { type: lineType, family: squareArea, params: squareArea.dealable(lineQ)[0], variant: lineQ, tieBreaker: "spf" } as never;
  const vertical = { lines: [normalise(1n, 0n, -1n) as never] } as LineState, sloped = mc(q(2, 3), q(7, 4));
  const up = changesBetween(contributors(rule, vertical).parts, contributors(rule, sloped).parts);
  assert.ok(up.length > 0, "the parts changed");
  for (const c of up) assert.doesNotMatch(c, /vertical line|no gradient/, c);
  assert.match(up[0]!, /: none → /, up[0]);
  const down = changesBetween(contributors(rule, sloped).parts, contributors(rule, vertical).parts);
  assert.match(down[0]!, / → none$/, down[0]);
});

test("rational lines: every pool family's parts and moves typeset their fractions; candidates include a fractional step and the stretch by a denominator", async () => {
  const { partLine } = await import("../src/index.ts");
  const { tieBreakersOn } = await import("@workspace/v2-core");
  const lines = [mc(q(2, 3), q(7, 4)), mc(q(-5, 2), q(17, 6)), mc(q(3, 4), q(-1, 3)), mc(q(-13, 5), q(29, 7))];
  let fractionalStep = 0, stretchByDenominator = 0;
  for (const f of beginnerPool) for (const tb of tieBreakersOn(f, lineQ)) for (const s of lines) {
    const rule = { type: lineType, family: f, params: f.dealable(lineQ)[0], variant: lineQ, tieBreaker: tb.id } as RuleRef<LineState, unknown>;
    const c = contributors(rule, s);
    const ms = moves(rule, s, null, { k: 4 });
    const text = [...c.parts.map(p => `${partLine(p)} | ${p.sentence}`), ...c.parts.flatMap(p => p.units.map(u => u.text)), ...ms.flatMap(m => [m.words, m.text, ...m.changes])].join("\n");
    assert.doesNotMatch(text, /\d\/\d/, `${f.id}/${tb.id}: a fraction written with a slash:\n${text}`);
    assert.doesNotMatch(text, /NaN|undefined|Infinity/, `${f.id}/${tb.id}:\n${text}`);
    for (const m of ms) {
      const k = m.call.args.k ?? m.call.args.f ?? "";
      if (m.call.mutator !== "mach.stretch" && /\//.test(k)) fractionalStep++;
      // The line's own denominators (its gradient's and its y-intercept's): a whole stretch by one clears it.
      const line = s.lines[0]!, dens = [q(-line.a, line.b).d, q(-line.c, line.b).d].filter(x => x > 1n);
      const f = m.call.args.f ?? "";
      if (m.call.mutator === "mach.stretch" && /^-?\d+$/.test(f) && dens.some(x => BigInt(f) % x === 0n)) stretchByDenominator++;
    }
  }
  assert.ok(fractionalStep > 0, "some candidate moves by a fraction");
  assert.ok(stretchByDenominator > 0, "some candidate stretches by a denominator, clearing the fractions");
});

test("a ruler marks only the values the dealt rule asks for (playtest round 15: 'a prime ending in 7' marked 2, 3, 5, 11, 13)", async () => {
  const { primeLanding, fromMC, lineQ, lineType } = await import("@workspace/v2-linear");
  const { q } = await import("@workspace/v2-core");
  const { contributors, neighbours, refFilter } = await import("../src/contributors.ts");
  const rule = { type: lineType, family: primeLanding, params: { ends: 1 }, variant: lineQ } as never;
  const main = contributors(rule, { lines: [fromMC(q(-1), q(31))] }).parts[0]!;   // lands on the rung 31
  const ticks = main.ruler!.refs.map(r => r.at);
  assert.ok(ticks.includes(31), String(ticks));
  for (const t of ticks) assert.equal(Math.abs(t) % 10, 1, `every mark ends in 1: ${ticks}`);
  // Several rungs either side (playtest round 19): 11 below, 41, 61, 71 above.
  assert.ok(ticks.filter(t => t < 31).length >= 1 && ticks.filter(t => t > 31).length >= 3, `rungs either side: ${ticks}`);
  // A tie-breaker about another prime keeps every prime (the ending is the main part's, said by its reference).
  assert.deepEqual(refFilter({ ends: 7 }, 5), { sign: 1 });
  // A sign-mirrored rule ("minus a prime ending in 7"): its marks are on its side of 0.
  assert.deepEqual(neighbours("prime", -50, 0, refFilter({ ends: 7 }, -17)), [-47, -37, -17, -7]);
  assert.deepEqual(neighbours("prime", 0, 20), [2, 3, 5, 7, 11, 13, 17, 19]);
  // A dealt suffix of several digits (Prime Gradient, 16 Nov).
  assert.deepEqual(neighbours("prime", 0, 700, refFilter({ suffix: "13" }, 113)), [13, 113, 313, 613]);
});

test("a ladder reading that counts as on its rung says so first (round 24: 10.51 read '≈ 0.49 below 11', which looked like a miss)", () => {
  const r = rule(primeLanding, "shared-factor", { ends: 1 });
  // y = −x + 31.4 crosses the x-axis at 31.4, which rounds to the prime 31: on the rung.
  const on = contributors(r, mc(-1, q(157, 5))).parts[0]!;
  assert.equal(on.distance, "rounds to 31: on the rung");
  assert.equal(contributors(r, mc(-1, 31)).parts[0]!.distance, "on 31", "exactly on it");
  // Off every rung (33 rounds to 33, not a prime): how far off, as before.
  assert.match(contributors(r, mc(-1, 33)).parts[0]!.distance ?? "", /^\S+ above 31$/);
});

test("a ladder's main part off every rung says the reading and the nearest rung in words, never a bare negative score (round 29)", async () => {
  const { primeGradient } = await import("@workspace/v2-linear") as unknown as { primeGradient: RuleRef<LineState, unknown>["family"] };
  const pg = { type: lineType, family: primeGradient, params: { suffix: "1" }, variant: lineQ, tieBreaker: (primeGradient as { tieBreakers: { id: string }[] }).tieBreakers[0]!.id } as RuleRef<LineState, unknown>;
  assert.equal(partLine(contributors(pg, mc(10, 3)).parts[0]!), "● main part: gradient 10 · 1 below 11, a prime ending in 1");
  // The gradient's sign is free (owner, 16 Nov): a reading below 0 is measured on its own side.
  assert.equal(partLine(contributors(pg, mc(-7, 2)).parts[0]!), "● main part: gradient −7 · 4 above −11, a prime ending in 1");
  const pg13 = { ...pg, params: { suffix: "13" } } as RuleRef<LineState, unknown>;
  assert.equal(partLine(contributors(pg13, mc(200, 2)).parts[0]!), "● main part: gradient 200 · 87 above 113, a prime ending in 13");
  // Every ladder family, on lines off its rungs: words, never "…: −½".
  for (const f of beginnerPool.filter(x => (x as { keepsParams?: boolean }).keepsParams)) {
    const r = { type: lineType, family: f as never, params: (f as { dealable(v: unknown): unknown[] }).dealable(lineQ)[0], variant: lineQ, tieBreaker: (f as { tieBreakers: { id: string }[] }).tieBreakers[0]!.id } as RuleRef<LineState, unknown>;
    for (const st of [mc(10, 3), mc(-7, 2), mc(4, 100)]) {
      const line = partLine(contributors(r, st).parts[0]!);
      assert.doesNotMatch(line, /: [−-][\d½⅓⅔¼¾]/, `${f.id}: ${line}`);
      assert.doesNotMatch(line, /\bdealt\b/, `${f.id}: no "dealt" jargon: ${line}`);
    }
  }
});
