import { test } from "node:test";
import assert from "node:assert/strict";
import { beginnerPool, LINE_CONTEST_OPPONENTS, LINE_EXCLUSION_SHARES, LINE_OPPONENT_SHARES, LINE_OPPONENTS } from "../src/index.ts";

const dealt = new Set(beginnerPool.map(f => f.id));

test("contest along a climb names, for each family, the dealt families opposing at least half its climbs, or its three strongest (at least a fifth), strongest first", () => {
  assert.ok(Object.keys(LINE_CONTEST_OPPONENTS).length >= 4, "a table of the dealt line families");
  for (const [a, opponents] of Object.entries(LINE_CONTEST_OPPONENTS)) {
    assert.ok(dealt.has(a), `${a} is a beginner family`);
    const shares = LINE_OPPONENT_SHARES[a]!;
    for (const b of opponents) {
      assert.notEqual(b, a);
      assert.ok(dealt.has(b), `${a}'s opponent ${b} is a beginner family`);
      assert.ok(shares[b]! >= 0.2 && shares[b]! <= 1, `${a} ← ${b}: ${shares[b]}`);
    }
    // Every family at half or more is named; below half, at most the top three.
    for (const b of Object.keys(shares).filter(b => shares[b]! >= 0.5)) assert.ok(opponents.includes(b), `${a} ← ${b}`);
    assert.ok(opponents.filter(b => shares[b]! < 0.5).length <= 3);
    for (let i = 1; i < opponents.length; i++) assert.ok(shares[opponents[i - 1]!]! >= shares[opponents[i]!]!);
  }
});

/**
 * Open fails of design-principles.md row 6, each a coordinator's ruling to deal the family unopposed for now. An entry
 * whose family gains an opponent fails the test below: remove it then.
 */
const OPEN_ROW_6: Record<string, string> = {
  "divisibility-ladder": "coordinator, 15 Nov (#817): merged dealt; its climbs barely move any other rule (at most 7% opposed). Prime Staircase is to be made to contest its heights.",
};

test("the named opponents are the contest opponents and the families that exclude it (at least half of the measured rule pairs)", () => {
  for (const [a, opponents] of Object.entries(LINE_OPPONENTS)) {
    const excl = Object.entries(LINE_EXCLUSION_SHARES[a] ?? {}).filter(([, x]) => x >= 0.5).map(([b]) => b);
    assert.deepEqual([...opponents].sort(), [...new Set([...(LINE_CONTEST_OPPONENTS[a] ?? []), ...excl])].sort(), a);
    for (const b of excl) assert.ok(dealt.has(b));
  }
});

test("every dealt ladder family (a hill with no top) has a named opponent in the pool, but for the recorded open fails", () => {
  for (const f of beginnerPool.filter(f => f.keepsParams)) {
    if (!(f.id in LINE_OPPONENTS)) continue;   // not yet measured (the table may be partial while families are redesigned)
    const opposed = LINE_OPPONENTS[f.id]!.length > 0;
    if (f.id in OPEN_ROW_6) assert.ok(!opposed, `${f.id} now has opponents (${LINE_OPPONENTS[f.id]!.join(", ")}): remove it from OPEN_ROW_6`);
    else assert.ok(opposed, `${f.id} has no opponent: ${JSON.stringify(LINE_OPPONENT_SHARES[f.id])}`);
  }
});
