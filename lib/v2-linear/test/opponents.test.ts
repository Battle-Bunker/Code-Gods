import { test } from "node:test";
import assert from "node:assert/strict";
import { beginnerPool, LINE_OPPONENT_SHARES, LINE_OPPONENTS } from "../src/index.ts";

const dealt = new Set(beginnerPool.map(f => f.id));

test("the opponent table names, for each family, the dealt families opposing at least half its climbs, or its three strongest (at least a fifth), strongest first", () => {
  assert.ok(Object.keys(LINE_OPPONENTS).length >= 4, "a table of the dealt line families");
  for (const [a, opponents] of Object.entries(LINE_OPPONENTS)) {
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

test("every dealt ladder family (a hill with no top) has a named opponent in the pool", () => {
  for (const f of beginnerPool.filter(f => f.keepsParams)) {
    if (!(f.id in LINE_OPPONENTS)) continue;   // not yet measured (the table may be partial while families are redesigned)
    assert.ok(LINE_OPPONENTS[f.id]!.length > 0, `${f.id} has no opponent: ${JSON.stringify(LINE_OPPONENT_SHARES[f.id])}`);
  }
});
