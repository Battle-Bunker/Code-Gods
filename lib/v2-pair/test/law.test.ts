import { test } from "node:test";
import assert from "node:assert/strict";
import { rng } from "@workspace/v2-core";
import { facts, pairBits, pairLaw, pairQ } from "../src/index.ts";

test("direct draws are canonical systems of two different lines, φ their read length; about one in seven is parallel", () => {
  const law = pairLaw(pairQ), r = rng("pair-law");
  let n = 0, parallel = 0;
  for (let i = 0; i < 60000; i++) {   // a line is canonical in about one draw in five, a pair in one in twenty-five
    const d = law.draw(r, 1);
    if (d.state === null) continue;
    n++;
    assert.equal(d.coords, 6);
    assert.ok(Math.abs(d.bits - pairBits(d.state, pairQ)) < 1e-9);
    const [a, b] = d.state.lines;
    assert.ok(a!.a < b!.a || (a!.a === b!.a && (a!.b < b!.b || (a!.b === b!.b && a!.c < b!.c))), "sorted and different");
    if (facts(d.state).D === 0n) parallel++;
  }
  assert.ok(n > 1500);
  const share = parallel / n;
  assert.ok(share > 0.1 && share < 0.18, `parallel share ${share}`);
});
