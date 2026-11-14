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
  const { dealtLadder, bitsFor, MIN_DEALABLE_RUNGS } = await import("../src/artefact.ts");
  const { DEFAULT_CONFIG } = await import("../src/estimate.ts");
  const { evaluateObject } = await import("@workspace/v2-core");
  const { lineType, lineZ, primeGradient } = await import("@workspace/v2-linear");
  const rung = (bits: number, error: number, extra: object = {}) => ({ bits, error, layer: 0, score: null, ...extra });
  const cap = (rungs: object[], status = "unconverged") => dealtLadder({ status, rungs: rungs as never, config: DEFAULT_CONFIG }, null);
  const rungs = [rung(0, 0), ...[1, 2, 3, 4, 5, 6, 7].map(b => rung(b, 0.01)), rung(9, 2), rung(12, 0.1)];
  assert.deepEqual([cap(rungs).cap, cap(rungs).dealable, cap(rungs).converged], [7, true, 7]);
  // An empty rung passes but never holds the cap; a missing value stops it; fewer than six converged is too hard; too
  // coarse never deals; a dealt top under 4 bits does not deal.
  assert.equal(cap([rung(0, 0), rung(1, 0.01, { empty: true }), rung(1, 0.01), { ...rung(0, 0), bits: null, error: null }]).cap, 2);
  assert.equal(cap([rung(0, 0), rung(1, 0.01), rung(1, 0.01, { empty: true }), { ...rung(0, 0), bits: null, error: null }]).cap, 1);
  assert.equal(cap(rungs.slice(0, MIN_DEALABLE_RUNGS)).dealable, false);
  assert.equal(cap(rungs, "too-coarse").dealable, false);
  assert.equal(cap([rung(0, 0), ...[1, 2, 3, 4, 5, 6, 7].map(b => rung(b / 4, 0.01))]).dealable, false);
  // The committed Prime Gradient + prime artefact on line-z is capped below its top: y = 31x scores as the cap.
  const { readFileSync, readdirSync } = await import("node:fs");
  const dir = new URL("../artefacts/line-z/prime-gradient/", import.meta.url);
  const a = JSON.parse(readFileSync(new URL(readdirSync(dir).find(f => f.endsWith("-prime.json"))!, dir), "utf8"));
  assert.ok(a.dealable && a.cap < a.rungs.length - 1);
  const top = evaluateObject(lineType, primeGradient, {}, { lines: [{ a: -31n, b: 1n, c: 0n }] }, lineZ, "prime").score;
  const { rungBits } = await import("../src/artefact.ts");
  assert.equal(bitsFor(a, top), rungBits(a, a.cap));
});

test("call (g): a tie-breaker tail at the main top that fits a curve is extended, fitted, never decreasing", async () => {
  const { dealtLadder, rungBits } = await import("../src/artefact.ts");
  const { DEFAULT_CONFIG } = await import("../src/estimate.ts");
  // Main rungs 1 … 6 (converged), then a size tie-breaker at the main top: thresholds 2 … 9, bits 7 + 1.5·(t − 2),
  // converged up to t = 6, unmeasured above.
  const main = [1, 2, 3, 4, 5, 6].map(i => ({ bits: i, error: 0.02, layer: 0, main: i, score: [String(-i)] }));
  const tieAt = (t: number, ok: boolean) => ({ bits: ok ? 7 + 1.5 * (t - 2) : 40, error: ok ? 0.05 : 30, layer: 1, main: 6, score: ["0", String(t)] });
  const rungs = [{ bits: 0, error: 0, layer: -1, main: 0, score: null }, ...main, ...[2, 3, 4, 5, 6].map(t => tieAt(t, true)), ...[7, 8, 9, 20].map(t => tieAt(t, false))];
  const d = dealtLadder({ status: "unconverged", rungs: rungs as never, config: DEFAULT_CONFIG }, { sense: "max", measure: "size" });
  assert.equal(d.convergedCap, 11);
  assert.ok(d.tail, "a tail was fitted");
  // One more span (2 … 6, span 4) reaches t = 10: thresholds 7, 8, 9 are fitted; 20 is too far.
  assert.equal(d.cap, 14);
  assert.deepEqual(d.tail!.bits.map(b => Math.round(b * 100) / 100), [14.5, 16, 17.5]);
  assert.equal(rungBits({ rungs, tail: d.tail }, 13), d.tail!.bits[1]);
  // No tail when a rung above the cap is not a tie-breaker rung at the main top, or too few points converged.
  assert.equal(dealtLadder({ status: "unconverged", rungs: rungs.slice(0, 9).concat(rungs.slice(12)) as never, config: DEFAULT_CONFIG }, { sense: "max", measure: "size" }).tail, null);
});
