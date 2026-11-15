/**
 * A ladder's value never outruns the cheapest state that reaches it (CLAUDE.md; the coordinator's amendment of trial
 * 28, 15 Nov): for every dealt ladder rule with committed values, every witness of its ladder past the measured knots is
 * worth at most its own code length φ (or the best measured knot, below which the tail never falls), and the stored
 * tail carries the cap. Caught: Prime Staircase ending 9 with a
 * linear tail at 12.6 bits a prime, where a random shift found a 41-bit state (y = 210x + 199 holds ten primes ending
 * in 9 for about 25 bits of φ).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { canonicalJson, evaluateObject } from "@workspace/v2-core";
import { beginnerPool, lineQ, lineType } from "@workspace/v2-linear";
import { valueLookup } from "../src/value.ts";

const DIR = join(import.meta.dirname, "../values/line-q");

test("every dealt ladder's value is capped by the code length of a cheap state at each rung past its knots", () => {
  let checked = 0;
  for (const family of beginnerPool.filter(f => f.keepsParams)) {
    assert.ok(family.witness, `${family.id}: a ladder needs witnesses for its tail cap`);
    const dir = join(DIR, family.id);
    if (!existsSync(dir)) continue;
    for (const params of family.dealable(lineQ)) {
      for (const f of readdirSync(dir)) {
        const vf = JSON.parse(readFileSync(join(dir, f), "utf8"));
        if (canonicalJson(vf.params) !== canonicalJson(params)) continue;
        assert.ok(vf.tail.primary.caps?.length, `${family.id} ${canonicalJson(params)}: the stored tail has no cap`);
        const look = valueLookup(vf);
        // The tail starts at the best knot and never goes below it (a measured knot may sit a little above a witness's
        // φ by sampling error); the cap governs what the tail adds past it.
        const top = Math.max(...vf.knots.map((k: { bits: number }) => k.bits));
        for (let n = 1; n <= 30; n++) for (const w of family.witness!(params as never, n)) {
          const s = lineType.canonical(w, lineQ);
          if ("invalid" in s) continue;
          const e = evaluateObject(lineType, family as never, params, s, lineQ, vf.tieBreaker);
          const v = look(e.score), phi = lineType.readLength(s, lineQ);
          if (v.at !== "beyond" || !Number.isFinite(phi)) continue;
          assert.ok(v.bits <= Math.max(phi, top) + 1e-6, `${family.id} ${canonicalJson(params)}/${vf.tieBreaker}: witness ${lineType.encode(s)} worth ${v.bits.toFixed(2)} bits, φ ${phi.toFixed(2)}`);
          checked++;
        }
      }
    }
  }
  assert.ok(checked > 50, `${checked} witnesses past the knots`);
});
