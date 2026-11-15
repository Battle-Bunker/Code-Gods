import { test } from "node:test";
import assert from "node:assert/strict";
import { TENSION, type TensionTable } from "../src/tension.gen.ts";
import { OPPORTUNITY_FRACTION, unopposedDirections, unopposedIn, WEAK_BELOW } from "../src/unopposed.ts";

/**
 * A hand-built table: rules a, b, c, d (d of a's family: never measured against a), two cheap directions and one ladder.
 * Signature row r holds, for every rule s, the characters of directions 0 and 1 at s · 2.
 */
const T: TensionTable = {
  rules: ["fam1/a", "fam2/b", "fam3/c", "fam1/d"],
  directions: [
    { id: "up", mutator: "si.shift", args: { k: "1" }, fee: 4 },
    { id: "tilt", mutator: "si.tilt", args: { k: "1" }, fee: 4 },
  ],
  signatures: [
    // a → a, b, c, d
    "  " + "++" + "0-" + "  ",
    // b → a, b, c, d
    "++" + "  " + "0+" + "++",
    // c → a, b, c, d
    "0+" + "~+" + "  " + "00",
    // d → a, b, c, d
    "  " + "+0" + "00" + "  ",
  ],
  // No opportunity cost reaches even the first fraction (laid out as the signatures).
  opportunityFractions: [0.5, 1, 2, 4],
  opposition: ["00000000", "00000000", "00000000", "00000000"],
  gains: [[0.5, 0.4], [0.02, 0.3], [0.2, 0.25], [0.9, 0]],
  ladders: [{ id: "ladder (p, 2p)", gains: [1.3, 1.1, -0.4, 0], doubling: [100, 80, -5, 0], cost: [0, 0, 0, 0] }],
  reference: { ladder: "ladder (p, 2p)", rules: ["fam1/a", "fam2/b"], perRule: [1.3, 1.1], gainPerEnergy: 1.1 },
};
const brief = (t: TensionTable, ids: string[]) => unopposedIn(t, ids).map(u => `${u.direction}: ${u.rules.join("+")} ${u.gainPerEnergy} ${u.strength}`);

test("a seated rule whose opportunity cost reaches OPPORTUNITY_FRACTION of a climber's gain opposes it", () => {
  assert.equal(OPPORTUNITY_FRACTION, 2);
  // a and b rise together along up; d (a's family, so never measured against a) is the outsider. b's climbs cost d
  // the fraction 2 (level 3 of [0.5, 1, 2, 4]) along up: opposed. Level 2 (only 1×) is not enough.
  const at = (lvl: string): TensionTable => ({ ...T, opposition: ["00000000", `000000${lvl}0`, "00000000", "00000000"] });
  const d = (lvl: string) => brief(at(lvl), ["fam1/a", "fam2/b", "fam1/d"]).filter(x => x.startsWith("up"));
  assert.deepEqual(d("2"), ["up: fam1/a+fam2/b 0.02 weak", "up: fam2/b+fam1/d 0.02 weak"]);
  assert.deepEqual(d("3"), ["up: fam2/b+fam1/d 0.02 weak"]);   // b+d still rise together: d does not oppose itself
  // On a ladder: c's cost per doubling against twice a riser's gain per doubling (b's 80: 160).
  const ladder = (cost: number): TensionTable => ({ ...T, ladders: [{ ...T.ladders[0]!, gains: [1.3, 1.1, 0, 0], cost: [0, 0, cost, 0] }] });
  assert.deepEqual(brief(ladder(150), ["fam1/a", "fam2/b", "fam3/c"]).filter(x => x.startsWith("ladder")), ["ladder (p, 2p): fam1/a+fam2/b 1.1 strong"]);
  assert.deepEqual(brief(ladder(170), ["fam1/a", "fam2/b", "fam3/c"]).filter(x => x.startsWith("ladder")), []);
});

test("a pair rising together both ways with no seated rule falling is a shared rise; its joint gain is the smaller", () => {
  assert.deepEqual(brief(T, ["fam1/a", "fam2/b"]), ["ladder (p, 2p): fam1/a+fam2/b 1.1 strong", "tilt: fam1/a+fam2/b 0.3 strong", "up: fam1/a+fam2/b 0.02 weak"]);
});

test("a seated rule falling along the direction (from either riser) is an adversary", () => {
  // c falls when a climbs along tilt, and along the ladder, so a+b stand only along up (c left alone). Along tilt
  // b and c rise together and a does not fall when either climbs.
  assert.deepEqual(brief(T, ["fam1/a", "fam2/b", "fam3/c"]), ["tilt: fam2/b+fam3/c 0.25 strong", "up: fam1/a+fam2/b 0.02 weak"]);
});

test("a set of three rising pairwise is reported once, with the second largest gain", () => {
  // b, c and d: up has b+d ("+" both ways) but c↔b is "0"/"~"; tilt has b+c both ways, c↔d not.
  assert.deepEqual(brief(T, ["fam2/b", "fam3/c", "fam1/d"]), ["tilt: fam2/b+fam3/c 0.25 strong", "up: fam2/b+fam1/d 0.02 weak"]);
  const three: TensionTable = { ...T, signatures: ["  ++++  ", "++  ++++", "++++  00", "  ++00  "] };
  // The ladder: c falls, so a and b (rising) are opposed.
  assert.deepEqual(brief(three, ["fam1/a", "fam2/b", "fam3/c"]), ["tilt: fam1/a+fam2/b+fam3/c 0.3 strong", "up: fam1/a+fam2/b+fam3/c 0.2 strong"]);
});

test("two rules of one family are never measured against each other", () => {
  assert.deepEqual(brief(T, ["fam1/a", "fam1/d"]), []);
});

test("empty, one-rule, repeated-rule and unknown tables have no shared rise", () => {
  assert.deepEqual(unopposedIn(T, []), []);
  assert.deepEqual(unopposedIn(T, ["fam1/a"]), []);
  assert.deepEqual(unopposedIn(T, ["fam1/a", "fam1/a"]), []);
  assert.deepEqual(unopposedIn(T, ["fam1/a", "nobody/x"]), []);
  assert.deepEqual(unopposedDirections("grid-4-d10", ["a", "b"]), []);
  assert.deepEqual(unopposedDirections("line-q", []), []);
  assert.deepEqual(unopposedDirections("line-q", ["square-area/spf"]), []);
});

test("the weak threshold is under a tenth of the stretch-to-367 reference", () => {
  const ref = TENSION["line-q"]!.reference;
  assert.deepEqual(ref.rules, ["square-area/spf", "whole-crossing/k-spf"]);
  assert.ok(ref.gainPerEnergy >= 0.9, `reference ${ref.gainPerEnergy}`);
  assert.ok(WEAK_BELOW <= ref.gainPerEnergy / 10);
});

test("the 247k table holds a strong unopposed rise: the prime ladder for Square Area and Whole Crossing", () => {
  const un = unopposedDirections("line-q", ["prime-landing/big-prime", "square-area/spf", "whole-crossing/k-spf"]);
  const top = un[0]!;
  assert.equal(top.direction, "ladder (p, 2p)");
  assert.equal(top.kind, "ladder");
  assert.deepEqual(top.rules, ["square-area/spf", "whole-crossing/k-spf"]);
  assert.equal(top.strength, "strong");
  assert.ok(top.gainPerEnergy >= 10 * WEAK_BELOW);
});

test("Square Area against Pythagorean Area (the pool's real tension) has no strong shared rise", () => {
  const un = unopposedDirections("line-q", ["square-area/spf", "pythagorean-area/slanted-square"]);
  assert.ok(un.every(u => u.strength === "weak"), JSON.stringify(un));
});
