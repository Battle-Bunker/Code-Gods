import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite } from "@workspace/v2-core";
import { lineClash, lineClashes, lineQ, lineSeatingCost, lineType, primeLanding, wholeCrossing } from "../src/index.ts";
import { mc } from "./helpers.ts";

const crossing = (p: object, x: number) => evaluateSite(lineType, wholeCrossing, p as never, mc(-1, x), lineQ, 0, null).terms.find(t => t.id === "ladder")!.value;
const PRIMES: Record<number, number[]> = { 1: [11, 31, 41, 61, 71, 101], 9: [19, 29, 59, 79, 89, 109] };

test("the line seating rule forbids exactly the Prime Landing and Whole Crossing pairs whose rungs coincide", () => {
  for (const pl of primeLanding.dealable(lineQ)) for (const wc of wholeCrossing.dealable(lineQ)) {
    const { ends, side = 1 } = pl as { ends: number; side?: number };
    // Whole Crossing's main part on every Prime Landing rung (a line landing on side·p): on its ground level (0) on all of
    // them, or off its ladder on all (a prime above 5 is never on a level above 0).
    const exact = PRIMES[ends]!.map(p => crossing(wc, side * p)).map(v => v.n === 0n);
    assert.ok(exact.every(e => e === exact[0]), `${JSON.stringify(pl)} ${JSON.stringify(wc)}: ${exact}`);
    const seated = [{ family: "prime-landing", params: pl }, { family: "whole-crossing", params: wc }];
    assert.equal(lineClash(seated[0]!, seated[1]!), exact[0], `${JSON.stringify(pl)} beside ${JSON.stringify(wc)}`);
    assert.equal(lineClash(seated[1]!, seated[0]!), exact[0], "either order");
    assert.equal(lineSeatingCost(seated), exact[0] ? 1000 : 0);
  }
  // Ending 1 lands on 1 (mod 5) and its mirror on 4; ending 9 the other way round.
  assert.equal(lineClashes([{ family: "prime-landing", params: { ends: 1 } }, { family: "whole-crossing", params: { q: 5, r: 1 } }]).length, 1);
  assert.equal(lineClashes([{ family: "prime-landing", params: { ends: 1, side: -1 } }, { family: "whole-crossing", params: { q: 5, r: 4 } }]).length, 1);
  assert.equal(lineClashes([{ family: "prime-landing", params: { ends: 9 } }, { family: "whole-crossing", params: { q: 5, r: 2 } }]).length, 0);
  // Families without known parameters (a won bid's seat) and other families never clash.
  assert.equal(lineClashes([{ family: "prime-landing" }, { family: "whole-crossing" }, { family: "treasure", params: { k: 2 } }]).length, 0);
});
