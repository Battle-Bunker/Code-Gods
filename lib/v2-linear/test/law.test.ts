/**
 * The walk's stationary law is the law the valuation draws from (law.ts): births (a seeded walk, Metropolis on φ) and
 * direct draws agree on a few marginals. Exact detailed balance is potential.test.ts; this checks that φ, the law's
 * codes and its draws describe the same π (a code changed in one place and not the other fails here).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { rng, walkStep } from "@workspace/v2-core";
import { lineLaw, lineQ, lineType, lineZ, type Line } from "../src/index.ts";

const MARGINALS: Record<string, (l: Line) => boolean> = {
  "vertical (b = 0)": l => l.b === 0n,
  "horizontal (a = 0)": l => l.a === 0n,
  "through the origin (c = 0)": l => l.c === 0n,
  "whole (b = 1)": l => l.b === 1n,
  "b in 2..4": l => l.b >= 2n && l.b <= 4n,
  "|a| = 1": l => l.a === 1n || l.a === -1n,
};

for (const v of [lineQ, lineZ]) {
  test(`${v.id}: the walk's births and the law's direct draws agree on the marginals`, () => {
    // Walk: 150 independent chains, 256 steps of burn-in, then a sample every birthMixSteps steps.
    const walk: Line[] = [];
    for (let k = 0; k < 150; k++) {
      const r = rng("law-test-walk", v.id, k);
      let s = lineType.origin(v);
      for (let i = 0; i < 256; i++) s = walkStep(lineType, v, s, r);
      for (let j = 0; j < 20; j++) {
        for (let i = 0; i < v.birthMixSteps; i++) s = walkStep(lineType, v, s, r);
        walk.push(s.lines[0]!);
      }
    }
    const law = lineLaw(v), r = rng("law-test-draws", v.id), drawn: Line[] = [];
    while (drawn.length < 100_000) { const d = law.draw(r, 1); if (d.state) drawn.push(d.state.lines[0]!); }
    for (const [name, f] of Object.entries(MARGINALS)) {
      const p = drawn.filter(f).length / drawn.length, w = walk.filter(f).length / walk.length;
      // Samples within a chain are 64 steps apart, not independent: allow 6 standard errors of independent draws.
      const se = Math.sqrt(Math.max(p * (1 - p), 1e-4) / walk.length);
      assert.ok(Math.abs(w - p) < 6 * se + 1e-9, `${name}: walk ${w.toFixed(4)}, law ${p.toFixed(4)} (se ${se.toFixed(4)})`);
    }
  });
}
