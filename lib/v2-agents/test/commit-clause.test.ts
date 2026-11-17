/**
 * The commit clause (v1's `only_if_better`, restored; v1-audit.md §1 item 11, archive public-log-design.md §5.2): an
 * agent wraps its moves in onlyIfBetter(...) / only_if_better(...) and the engine commits them only if they strictly
 * raise the player's points on that line as the player sees them: own bits exact, the others' sum as disclosed (the
 * same numbers `othersAfter` reports, noise included), so the clause is never a cheaper or sharper probe of the others
 * than asking. It is charged what `othersAfter` is. A game offers it or not (off by default, as in v1).
 */
import { lineQ } from "./config.ts";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { fromMC, lineType } from "@workspace/v2-linear";
import { Qn } from "@workspace/v2-core";
import { EngineHost, OTHERS_AFTER_BITS, runAct, sandboxes, SPEC_ECONOMY } from "../src/index.ts";

const boxes = sandboxes();
after(() => boxes.close());
const q = (n: number) => Qn.q(n);
// Dynamic rules: the host values states by their energy (seeded by the act's seed, so one act sees one number per state).
const rule = { family: "prime-hug", params: { suffix: "1" }, tieBreaker: null };
const otherRule = { family: "multiples", params: { k: 3 }, tieBreaker: null };
const values = undefined, others = [{ rule: otherRule }];
let C0 = 81;   // y = 11x + C0: chosen below so that one small shift raises the points and another lowers them
let state = { lines: [fromMC(q(11), q(C0))] };
const shift = (k: number) => ({ lines: [fromMC(q(11), q(C0 + k))] });
const source = {
  typescript: (k: number) => `function agent(offer) { return onlyIfBetter([move("add", { lens: "mc", at: 3, k: ${k} })]); }`,
  python: (k: number) => `def agent(offer):\n    return only_if_better([move("add", lens="mc", at=3, k=${k})])\n`,
};
const host = (disclosed?: (e: string) => number) =>
  new EngineHost({ type: lineType, variant: lineQ, state, rule, energy: 100, values, others, energySeed: "7", ...(disclosed ? { disclosed } : {}) });
const act = (language: "typescript" | "python", k: number, extra: { commitClause?: boolean; disclosed?: (e: string) => number; noWorth?: boolean } = {}) =>
  boxes.get(language).then(box => runAct(box, {
    type: lineType, variant: lineQ, state, rule, program: { language, source: source[language](k) }, seed: "7", energy: 100,
    ...(extra.noWorth ? {} : { values, others }), ...(extra.commitClause === undefined ? {} : { commitClause: extra.commitClause }),
    ...(extra.disclosed ? { disclosed: extra.disclosed } : {}),
  }));

// One shift raises the player's points and the other lowers them (found, not assumed).
const points = (s: typeof state, disclosed?: (e: string) => number) => host(disclosed).payoffAt(s)!.points;
// (Searched over small shifts, so a change in the energy estimate moves the pick rather than breaking the test.)
const KS = [1, -1, 2, -2, 3, -3];
let up: number | undefined, down: number | undefined;
for (const c0 of [81, ...Array.from({ length: 80 }, (_, i) => 40 + i)]) {
  C0 = c0; state = { lines: [fromMC(q(11), q(C0))] };
  const here = points(state);
  up = KS.find(k => points(shift(k)) > here); down = KS.find(k => points(shift(k)) < here);
  if (up !== undefined && down !== undefined) break;
}

test("the payoff the clause decides on: own bits exact, the others' sum as disclosed, points own × max(0, others)", () => {
  const h = host(), p = h.payoffAt(state)!;
  assert.ok(p.mine > 0 && p.others > 0);
  assert.equal(p.points, p.mine * Math.max(0, p.others));
  const noisy = host(() => -1e6).payoffAt(state)!;
  assert.deepEqual([noisy.mine, noisy.others, noisy.points], [p.mine, p.others - 1e6, 0], "the others as disclosed, points clamped at 0");
  assert.ok(points(shift(up!)) > points(state) && points(shift(down!)) < points(shift(up!)));
});

for (const language of ["typescript", "python"] as const) {
  test(`${language}: a game that does not offer the clause fails the act, charging only its reads`, async () => {
    const { record } = await act(language, up!);
    assert.equal(record.outcome, "failed");
    assert.match(record.reason ?? "", /does not offer the commit clause/);
    assert.equal(record.changeBits, 0);
  });

  test(`${language}: offered, moves that raise the player's points commit as plain moves would`, async () => {
    const plain = await act(language, up!, { commitClause: true });
    assert.equal(plain.record.outcome, "committed");
    assert.equal(plain.record.after, lineType.encode(shift(up!)));
    assert.ok(plain.record.readBits >= OTHERS_AFTER_BITS, "the clause reads what othersAfter would");
  });

  test(`${language}: offered, moves that would not raise them leave the line as it was, charged the read and no change`, async () => {
    const { record, state: s } = await act(language, down!, { commitClause: true });
    assert.equal(record.outcome, "failed");
    assert.match(record.reason ?? "", /the commit clause kept the line: it would not raise your points/);
    assert.equal(record.after, record.before);
    assert.equal(lineType.encode(s), lineType.encode(state));
    assert.equal(record.changeBits, 0);
    assert.ok(Math.abs(record.charge - record.readBits / SPEC_ECONOMY.kappa) < 1e-9);
    assert.ok(record.readBits >= OTHERS_AFTER_BITS);
  });

  test(`${language}: it decides on the disclosed others, as othersAfter reports them (never the exact sum)`, async () => {
    // Noise that makes the raising move look worse (the others shown far below 0 after it) keeps the line.
    const after = lineType.encode(shift(up!));
    const { record } = await act(language, up!, { commitClause: true, disclosed: e => (e === after ? -1e6 : 0) });
    assert.equal(record.outcome, "failed");
    assert.match(record.reason ?? "", /would not raise your points/);
  });

  test(`${language}: a game that does not say what lines are worth cannot judge the clause`, async () => {
    const { record } = await act(language, up!, { commitClause: true, noWorth: true });
    assert.equal(record.outcome, "failed");
    assert.match(record.reason ?? "", /does not say what lines are worth/);
  });
}

for (const language of ["typescript", "python"] as const) {
  const run = (src: string) => boxes.get(language).then(box => runAct(box, {
    type: lineType, variant: lineQ, state, rule, program: { language, source: src }, seed: "7", energy: 100, values, others, commitClause: true,
  }));
  test(`${language}: an empty clause is a skip, charged no othersAfter read`, async () => {
    const empty = await run(language === "typescript" ? "function agent(offer) { return onlyIfBetter([]); }" : "def agent(offer):\n    return only_if_better([])\n");
    assert.equal(empty.record.outcome, "skipped");
    assert.ok(empty.record.readBits < OTHERS_AFTER_BITS);
  });
  test(`${language}: asking othersAfter on the plan first, the clause charges nothing more for it`, async () => {
    const src = language === "typescript"
      ? `function agent(offer) { const plan = [move("add", { lens: "mc", at: 3, k: ${up} })]; offer.othersAfter(plan); return onlyIfBetter(plan); }`
      : `def agent(offer):\n    plan = [move("add", lens="mc", at=3, k=${up})]\n    offer.others_after(plan)\n    return only_if_better(plan)\n`;
    const asked = await run(src), plain = await act(language, up!, { commitClause: true });
    assert.equal(asked.record.outcome, "committed");
    assert.ok(Math.abs(asked.record.readBits - plain.record.readBits) < 1e-9, `${asked.record.readBits} against ${plain.record.readBits}`);
  });
}
