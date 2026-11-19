# Status: gravity (a size-based potential for line-q), 16 Nov 2026

Labels: **built** (code exists and its tests ran), **seen narrowly** (one measurement or a few runs), **guess**.

## 1. What I was asked to do
The owner, on 16 Nov, said that a level was worth 1 to 2.6 bits while the first exact hit was worth 10 to 24 bits, after
which play stopped, and called this "completely broken". The owner's words are in owner-decisions.md, decision 47
(unmerged). I was asked to do three things:
1. Measure whether the cause was (A) line-q's factorisation number code, or (B) the exchange rate of 1⚡ per bit of φ
   against about 3,100⚡ of income.
2. Build "strong, configurable gravity", meaning φ that grows with a number's size, plus regenerated value files.
3. Record the owner's words.
The work was paused by the owner at about 02:00 UTC on 16 Nov, before anything merged.

## 2. Merged / unmerged
- **Merged: nothing.** No PR was opened.
- **Unmerged:** branch `claude/gravity-measure` (head f301fd04, cut from develop at 62b8f2c7). It contains:
  - `lib/v2-linear/src/gravity.ts`: the code, its exact sampler and its normaliser (built);
  - `params.gravity` on line-q, `{ g: 0.25, alpha: 1 }`, in `line.ts`, `law.ts` and `type.ts` (built);
  - `Variant.heightPrice` in v2-core `contracts.ts`, applied in `walk.ts`: the surcharge is w·max(0, Δφ), with w = 10 on
    line-q (built);
  - `coefficientBits`, which the coef.swap floor now uses (built);
  - all 154 line-q value files, `uniqueness/line-q.json` and `values.gen.ts`, regenerated (built);
  - `MEDIAN_LOOK_BITS` for line-q changed from 13.7 to 15.0, and for line-q-lenses from 14.0 to 15.3 (built);
  - `docs/engine-v2/gravity.md`, with every table, and the measuring script
    `lib/v2-agents/scripts/gravity-measure.ts` (flags --g, --alpha, --cap, --rate, --beta);
  - CLAUDE.md bullet and owner-decisions.md decision 47.
- Tests that were green on that branch: v2-linear (171), v2-core, v2-valuation (one assertion rewritten), engine
  test:unit (the energy gate passes), root typecheck.
- Tests that were red on that branch: the v2-agents starters parity test (Treasure Bold, see §4).

## 3. Unfinished plan (concrete next steps)
1. The owner picks g (strength), α (shape) and w (⚡ per bit of height). The coordinator later relayed that the owner
   wants φ = g·size^α with both g and α as room parameters. Measure α ∈ {½, 1, 2} and log as a comparison only. Note
   that an inverse-square field gives a potential that levels off far out, so the law would not normalise.
2. Add the bits ≤ φ clamp as one helper used at all five lookup sites. The spec lead listed them:
   - `convex/v2/values.ts` lines 49 and 84;
   - `v2-agents` `host.ts` lines 35 and 245;
   - `harness.ts` line 123.
   Without it, the tree's top levels read above φ under gravity (seen: 224.9 bits for a line of φ 203.8).
3. Regenerate the PMI, tension, compat and opponents tables (v2-agents `*.gen.ts`, v2-linear `opponents.gen.ts`). They
   are law-dependent and were not redone.
4. Re-match the parameter peers by height. Whole Crossing, Same on Both Rulers and Prime Landing (lenses) are listed
   OPEN in `artifacts/engine/test/unit/v2-params-equal.test.ts`.
5. Port pair-q, whose `PAIR_CODES` still use the factorisation code, and grids ("uncapped cells, φ = g·v^α").
6. Expose w (and g) as room settings. That touches `overridesV`, the overrides zod in affordances, `lobby.ts` and the
   configure-form FIELDS. g needs its own value files per value, so it is really a variant/preset choice.
7. Correct the gloss in owner-decisions 17: the factorisation wording is a session's, not the owner's.

## 4. Obstacles and things the docs don't say
- **Both (A) and (B) are needed (seen, 6 families).**
  - The factorisation code makes levels nearly free: Prime Intercept goes from 0 to 5.1 bits over the primes 11 to 191,
    and climbs reach intercepts of 10⁶ at φ ≈ 40.
  - A size code makes the level carry the bits, but at 1⚡/bit climbers reach 45 to 340 bits.
- **A constant field is memoryless.** Under it, −log2 P(height ≥ h) = g·h exactly, so level bits equal the work done
  against gravity. This is the clean information-theory link.
- **The real act charge W + 0.05·W² multiplies the price of height (seen).** Calibrations that price only fee + w·Δφ
  overstate the w needed by about 10×: w = 10 with β gave about par (21 to 26 bits). Every gate harness omits β.
- **Keep the 2-bit inner cap (seen).** Under gravity, uncapped, an exact hit is still up to 7.5 bits above ±1. Closeness
  measures how narrow the target's range is, not height.
- **Fractions.** Under the size code a fraction pays twice for its bottom number b: its steps code, and a precision of
  about log2 b. So 100½ costs about 2.5 bits more than 100 (built, tested).
- **Two defects in `tree-value.ts`.**
  - Top-tail cancellation, which read about 1,000 bits. The spec lead fixed this in #1056.
  - The level estimate can exceed φ at the top of the sampled range. Still open: §3 step 2.
- **Tilts.** α > 1 needs tilts down to about 0.07 to sample its top. Those tables cost minutes per tilt (`log2Zt` direct
  sums).
- **The landing and rulers readings divide by the gradient.** Under gravity their worst cheap move keeps only 12 to 45%
  (row 10).
- **Treasure Bold's TS and Python versions diverge.** `scoreEach` stops at 30% of the step budget, and the languages
  count steps differently. Births changed with the law and exposed this. Reordering the tries did not fix it (seen).
- **The test helpers assumed the factorisation code.** The ladder witnesses in `ruler.test.ts` and the rung costs in
  `v2-params-equal` relied on "smooth = cheap". Prime Gradient and Prime Staircase pass once rungs are costed by
  height.

## 5. Obsolete after the 16–17 Nov scoring rebuild
- Guess: the tree valuation, the 2-bit cap, the tuple families' level/closeness numbers and the value-file
  regeneration are moot if utilities are now one number and energy is bits of surprise.
- Guess: what likely carries over is the law itself (φ by size, gravity.ts's exact sampler, the memoryless argument),
  the heightPrice/β calibration lesson, and the finding that a factorisation code makes big smooth numbers cheap.
