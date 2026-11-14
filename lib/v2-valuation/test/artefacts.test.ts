/** Committed artefacts are intact (spec §7.6): each one's content hash matches its contents and its rule key. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { contentHash, type Artefact } from "../src/artefact.ts";
import { ruleKey } from "../src/estimate.ts";
import { findVariant } from "../src/registry.ts";

const DIR = join(import.meta.dirname, "..", "artefacts");
const files = (d: string): string[] => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? files(p) : p.endsWith(".json") ? [p] : []; });

test("every committed artefact matches its hash and its rule key", () => {
  const all = existsSync(DIR) ? files(DIR) : [];
  assert.ok(all.length >= 4);
  for (const f of all) {
    const a = JSON.parse(readFileSync(f, "utf8")) as Artefact;
    const { contentHash: h, ...body } = a;
    assert.equal(contentHash(body), h, f);
    const { type, variant } = findVariant(a.variant);
    assert.equal(a.ruleKey, ruleKey(type, variant, a.family, a.params, a.tieBreaker), `${f}: stale variant or object type version`);
  }
});

test("call (g): the cap is the last rung through which every rung converged; lines above it score as the cap", async () => {
  const { capOf, bitsFor, MIN_DEALABLE_RUNGS } = await import("../src/artefact.ts");
  const { DEFAULT_CONFIG } = await import("../src/estimate.ts");
  const { evaluateObject } = await import("@workspace/v2-core");
  const { lineType, lineZ, primeGradient } = await import("@workspace/v2-linear");
  const rung = (bits: number, error: number) => ({ bits, error });
  const rungs = [rung(0, 0), ...[1, 2, 3, 4, 5, 6, 7].map(b => rung(b, 0.01)), rung(9, 2), rung(12, 0.1)];
  assert.deepEqual(capOf({ status: "unconverged", rungs, config: DEFAULT_CONFIG }), { cap: 7, dealable: true, converged: 7 });
  // An empty rung passes; a missing value stops the cap; fewer than six converged rungs is too hard; too coarse never deals.
  assert.equal(capOf({ status: "unconverged", rungs: [rung(0, 0), { bits: 1, error: 0.01, empty: true as const }, rung(1, 0.01), { bits: null, error: null }], config: DEFAULT_CONFIG }).cap, 2);
  assert.equal(capOf({ status: "unconverged", rungs: [rung(0, 0), rung(1, 0.01), { bits: 1, error: 0.01, empty: true as const }, { bits: null, error: null }], config: DEFAULT_CONFIG }).cap, 1);
  assert.equal(capOf({ status: "unconverged", rungs: rungs.slice(0, MIN_DEALABLE_RUNGS), config: DEFAULT_CONFIG }).dealable, false);
  assert.equal(capOf({ status: "too-coarse", rungs, config: DEFAULT_CONFIG }).dealable, false);
  // The committed Prime Gradient + prime artefact on line-z is capped below its top: y = 31x scores as the cap.
  const { readFileSync, readdirSync } = await import("node:fs");
  const dir = new URL("../artefacts/line-z/prime-gradient/", import.meta.url);
  const a = JSON.parse(readFileSync(new URL(readdirSync(dir).find(f => f.endsWith("-prime.json"))!, dir), "utf8"));
  assert.ok(a.dealable && a.cap < a.rungs.length - 1);
  const top = evaluateObject(lineType, primeGradient, {}, { lines: [{ a: -31n, b: 1n, c: 0n }] }, lineZ, "prime").score;
  assert.equal(bitsFor(a, top), a.rungs[a.cap].bits);
});
