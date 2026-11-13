/**
 * The goal card's ★ blocks (src/card-tiers.ts; docs/layered-rules-design.md §4): the base rule first, each tier in a
 * block that opens by itself at its gate or when the board already holds a tier point.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { instantiate } from "@workspace/game-types";
import { card, context, family } from "@workspace/game-utilities";
import { cardSections, tierBonus, tierOpens } from "../src/card-tiers.ts";

const CTX = context(instantiate("Grid", { size: 4, symbols: "base10", colours: "mono" }));
const F = family("opposite_nines");
const tiered = F.tiered!(CTX, 1).find(p => JSON.stringify(p).includes('"x":18'))!;
const CARD = card({ familyId: "opposite_nines", params: tiered }, CTX);
const BASE = card({ familyId: "opposite_nines", params: {} }, CTX);

test("a base card is its summary, with no blocks (and so is an old stored card without `tiers`)", () => {
  assert.deepEqual(cardSections(BASE), { base: BASE.summary, tiers: [] });
  assert.deepEqual(cardSections({ summary: CARD.summary }), { base: CARD.summary, tiers: [] }, "without `tiers` the whole text shows, ★ sentences included");
});

test("a tiered card shows the base's own text, then one block per tier titled with its gate", () => {
  const s = cardSections(CARD);
  assert.equal(s.base, BASE.summary, "the base paragraph is the base draw's summary, word for word");
  assert.ok(!s.base.includes("★"));
  assert.equal(s.tiers.length, 1);
  assert.equal(s.tiers[0].tier.id, "lines");
  assert.equal(s.tiers[0].title, "★ To score even higher (once you have 6 opposite pairs that add up to 9)");
  assert.equal(s.tiers[0].body, "Each row, column or long diagonal that adds up to 18 scores 1 tertiary point.");
  // A block whose text does not start with its gate keeps its heading and whole text.
  const plain = cardSections({ summary: "Base. ★ To score even higher: Each line scores 1 tertiary point.", tiers: [{ ...CARD.tiers![0], gate: 0, text: "Each line scores 1 tertiary point." }] });
  assert.deepEqual(plain.tiers.map(t => [t.title, t.body]), [["★ To score even higher", "Each line scores 1 tertiary point."]]);
  assert.equal(plain.base, "Base.");
});

test("a block opens at its gate, or when the board already holds a tier point; never without a board", () => {
  const t = CARD.tiers![0];   // gate 6, tertiary (index 2)
  assert.equal(tierOpens(t, null), false);
  assert.equal(tierOpens(t, undefined), false);
  assert.equal(tierOpens(t, [5, -3, 0]), false);
  assert.equal(tierOpens(t, [6, -3, 0]), true, "the base reached the gate");
  assert.equal(tierOpens(t, [8, 0, 10]), true);
  assert.equal(tierOpens(t, [2, -9, 1]), true, "a tier point below the gate (the plain composition)");
  assert.equal(tierOpens(t, 7), true, "a one-number ordinal is its first component");
  assert.equal(tierOpens({ ...t, gate: 0 }, null), true, "nothing to wait for");
});

test("the bonus line names the tier's points, only when the board has some", () => {
  const t = CARD.tiers![0];
  assert.equal(tierBonus(t, [8, 0, 2]), "Bonus: 2 tertiary points; open ★ to see why.");
  assert.equal(tierBonus(t, [8, 0, 1]), "Bonus: 1 tertiary point; open ★ to see why.");
  assert.equal(tierBonus(t, [8, 0, 0]), null);
  assert.equal(tierBonus(t, null), null);
});
