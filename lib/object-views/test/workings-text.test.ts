/** "How this scores" wording (src/explain/workings-text.ts): the real numbers, in the order a kid reads them. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPercent, formatProbability, workingsText } from "../src/explain/workings-text.ts";
import type { ScoreWorkings } from "@workspace/game-utilities";

const bonds = (extra: Partial<ScoreWorkings> = {}): ScoreWorkings => ({
  components: ["best friends"],
  breakdown: { unit: ["best-friend pair", "best-friend pairs"], items: [{ text: "4 best-friend pairs (touching, adding to 10)", points: [4] }, { text: "20 other touching pairs, not best friends", points: [0] }], total: [4] },
  // P = 0.172 → bits = −log₂(0.172) = 2.54: 2^−2.54 = 0.1722.
  rarity: { ordinal: [4], bits: 2.54, probability: 2 ** -2.54, spot: "step", curve: [] },
  ...extra,
});

test("probability and percent keep three significant digits and no exponent", () => {
  assert.equal(formatProbability(0.172), "0.172");
  assert.equal(formatProbability(0.0004213), "0.000421");
  assert.equal(formatProbability(1), "1");
  assert.equal(formatPercent(0.172), "17.2%");
  assert.equal(formatPercent(0.0004), "0.04%");
  assert.equal(formatPercent(0.5), "50%");
});

test("Number Bonds: pairs, then the share of boards, then −log₂ with the same numbers", () => {
  const t = workingsText(bonds());
  assert.equal(t.rawTotal, "Total: 4 best-friend pairs");
  assert.match(t.rarityLines[0], /^Out of all possible boards, dealt at random, 17\.2% have at least 4 best-friend pairs\.$/);
  assert.equal(t.rarityLines[1], "As a chance: P = 0.172.");
  assert.equal(t.bitsLines[0], "bits = −log₂(P) = −log₂(0.172) = 2.54 bits");
  assert.match(t.bitsLines[1], /^That is 1 in 5\.8: /);
  assert.deepEqual(t.rawLines.map(l => l.points), ["+4", "0"]);
});

test("a tie-break score says it counts them; a defence goal shows s⁻, h, E h and the net sum", () => {
  const w = bonds({
    components: ["lines", "tie-break: how far"], breakdown: { unit: ["line", "lines"], items: [], total: [1, -2] },
    defence: { ordinal: [3], badnessBits: 2, penaltyBits: 0.5, meanBits: 0.25, weight: 2 }, netBits: 2.54 - 2 * (0.5 - 0.25),
  });
  const t = workingsText(w);
  assert.match(t.rarityLines[0], /at least this score \(1 line, counting tie-breaks\)/);
  assert.match(t.defenceLines[0], /as bad as or worse than 25% of random boards/);
  assert.equal(t.netLines[0], "net bits = ✨ 2.54 − 2 × (0.50 − 0.25) = 2.04");
  assert.equal(t.rawLines[0].text, "Nothing on this board scores");
});
