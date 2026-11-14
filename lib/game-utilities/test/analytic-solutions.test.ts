/**
 * The exact solutions of src/analytic/ (the family-side hook and its harness are tested in analytic.test.ts): every
 * solution is checked against every shipped empirical table: Monte Carlo body levels within 5.5 reconstructed standard
 * errors, exact (analytic-hook) tables to 1e-6 bits per level (the clean-up's MIN_STEP_BITS between close levels
 * accumulates). Splitting-tail levels are reported by scripts/analytic-verify.ts but not asserted:
 * docs/analytic-calibration/solutions.md shows the tail estimates are what is off there (every disagreement beyond the
 * error model is a table bias).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { available, canonicalSupport, context, evaluator, family } from "../src/catalog.ts";
import { instantiateKey } from "../src/calibration.ts";
import { shippedFile, shippedInstanceKeys } from "../src/calibration-data.ts";
import { ANALYTIC_FAMILIES, analyticLevels, hasSolution } from "../src/analytic/index.ts";
import { formulaId } from "../src/analytic/hook.ts";
import { FAMILIES } from "../src/catalog.ts";
import { compareTable } from "../src/analytic/compare.ts";
import { NoSolution, cellAdditive } from "../src/analytic/grid.ts";
import { shardCount, shardOf } from "./shard.ts";   // CG_SHARD="k/n": the shipped-table loop below is split across CI jobs

test("cellAdditive refuses a rule that is not a sum over cells", () => {
  const inst = instantiateKey("Grid(4,base10,rgb)");
  assert.throws(() => cellAdditive("snap", {}, inst), (e: unknown) => e instanceof NoSolution && /not cell-additive/.test(String(e)));
});

test("every analytic solution agrees with every shipped table (Monte Carlo body within 5.5 se; exact tables exactly)", () => {
  let compared = 0;
  for (const key of shardOf(shippedInstanceKeys())) {
    const file = shippedFile(key)!, inst = instantiateKey(key);
    for (const t of file.tables) {
      if (t.prior) continue;
      const L = analyticLevels(t.family, t.canonicalParams, inst);
      if (!L) continue;
      const c = compareTable(t, L);
      const where = `${t.family} ${JSON.stringify(t.canonicalParams)} ${key}`;
      if (typeof t.estimator.budget === "string") assert.ok(c.maxAbsDelta < Math.min(1e-6 * (t.levels.length + 1), 0.01), `${where}: exact table differs by ${c.maxAbsDelta} bits`);
      else assert.ok(c.bodyZ < 5.5, `${where}: Monte Carlo body z = ${c.bodyZ.toFixed(2)} (worst ${JSON.stringify(c.worst)})`);
      compared++;
    }
  }
  assert.ok(compared > Math.floor(300 / shardCount / 2), `only ${compared} tables compared`);
});

/** Families with their own analytic hook (written in the family file, documented in tail-toolkit.md). */
const OWN_HOOKS = ["picture_frame", "lone_peak", "hate_colour", "hate_takeover", "seed3_green_ones", "staircase_climber", "rainbow_road", "best_friends"];

/** Solved in src/analytic but deliberately not wired (docs/analytic-calibration/solutions.md §5). */
const UNWIRED = [
  "looking_glass", "pinwheel", "rainbow_bands", "bullseye", "colour_carousel",
];

test("every solved family is either wired to its own solution or listed as unwired; hasSolution matches analyticLevels", () => {
  for (const [type, ids] of Object.entries(ANALYTIC_FAMILIES)) {
    for (const id of ids) {
      const f = family(id);
      if (UNWIRED.includes(id)) { assert.equal(f.analytic, undefined, `${id} is listed as unwired but has a hook`); continue; }
      if (OWN_HOOKS.includes(id)) { assert.ok(f.analytic, `${id} is listed in OWN_HOOKS but has no hook`); continue; }
      assert.ok(f.analytic, `${id} is solved but neither wired nor listed in UNWIRED`);
      const key = shippedInstanceKeys().find(k => k.startsWith(type + "("))!, inst = instantiateKey(key);
      for (const p of canonicalSupport(f, context(inst))) {
        const a = f.analytic!(p, context(inst)), L = analyticLevels(id, p, inst);
        assert.equal(hasSolution(id, p, inst), L !== null, `${id} ${JSON.stringify(p)}: hasSolution disagrees`);
        if (OWN_HOOKS.includes(id)) continue; // wired with its own formula (tail-toolkit.md)
        assert.equal(a?.id ?? null, L ? formulaId(id) : null, `${id} ${JSON.stringify(p)}: hook does not wrap its own solution`);
      }
    }
  }
  for (const f of FAMILIES) if (f.analytic && !Object.values(ANALYTIC_FAMILIES).flat().includes(f.id)) assert.ok(OWN_HOOKS.includes(f.id), `${f.id} has a hook but is neither solved here nor listed in OWN_HOOKS`);
});

test("proven maxima: the search reproduces the constants, and each exemplar scores exactly the proven maximum", async () => {
  const { LONGEST_SNAKES, MIXER_OPTIMA, longestSnake, mixerOptimum, mixerScore } = await import("../src/analytic/maxima.ts");
  for (const N of [3, 4, 5, 6]) assert.equal(longestSnake(N).length, LONGEST_SNAKES[N].length, `longest snake ${N}`);
  for (const N of [3, 4]) for (const strict of [false, true]) {
    assert.deepEqual(mixerOptimum(N, strict).score, mixerScore(MIXER_OPTIMA[N][strict ? "strict" : "loose"], strict), `mixer ${N} ${strict}`);
  }
  for (const key of shippedInstanceKeys().filter(k => k.startsWith("Grid("))) {
    const inst = instantiateKey(key), ctx = context(inst), N = Number(inst.args.size);
    for (const id of ["snake_charmer", "colour_mixer"]) {
      const f = family(id);
      if (!available(f, inst).ok) continue;
      for (const p of canonicalSupport(f, ctx)) {
        const got = evaluator({ familyId: id, params: p }, inst)(f.exemplar!(p, ctx));
        const want = id === "snake_charmer" ? LONGEST_SNAKES[N].length : mixerScore(MIXER_OPTIMA[N][(p as { strict: boolean }).strict ? "strict" : "loose"], (p as { strict: boolean }).strict);
        assert.deepEqual(got, want, `${id} ${JSON.stringify(p)} on ${key}`);
      }
    }
  }
});
