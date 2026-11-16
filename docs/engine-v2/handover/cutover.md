# Handover: the cutover to the dynamic energy measure (16 Nov, Melbourne evening)

Labels: **built** (in the code and tested), **seen narrowly** (measured under the stated assumptions), **guess**.

## What is built, and where

- **Core contract** (built, #1159). In `lib/v2-core/src/contracts.ts`: `RuleFamily.dynamic` (`u(state, params)` → a real
  number, `reads`, `searches` proposing target states), `ObjectType.estimate`, and the types `Estimate` and
  `EstimateOpts`. `energyOf()` is in `evaluate.ts`.
- **Line estimator** (built, #1159). `lib/v2-linear/src/energy.ts` (`estimateLine`, `lineRule`, `LINE_K = 12`):
  - energy = mean over K starts of min(direct, floor, heuristics);
  - each move is priced at the game's act charge (`changeCharge`), using only moves the variant offers;
  - starts match the state's **magnitude** on the readings the rule reads.

  `lineType.estimate` (type.ts) calls it. The trial's example families in `trial-dynamic.ts` feed into it
  (`asLineRule`, `dynamicEnergy`).
- **Families** (built, #1160). `lib/v2-linear/src/dynamic-families.ts`: `dynamicLine(spec)` turns a utility and its
  heuristics into a `RuleFamily` (main term "utility", no tie-breakers, `keepsParams`). The eight families are Power
  Hug, Prime Hug, Smooth Hug, Multiples, Fine Bottom, Next-door Bottom, Unit Fraction and Prime Sliver; the table in
  `../energy.md` gives their formulas, pulls and spaces. Lines · beginner deals only these (`presets.ts`
  `dynamicRules`).
- **Agents** (built, #1160).
  - `lib/v2-agents/src/dynamic-catalogue.ts` holds the utilities in TypeScript and Python. `test/dynamic-starters.test.ts`
    checks them against the engine to within 1e-6.
  - The guest's `better` now compares decimals (`lib/v2-sandbox/guest/helpers.js`; `node scripts/gen-guest.mjs`
    regenerates it).
  - The Python renderer handles a family with no tie-breakers.
  - Rendered copies are in `lib/v2-agents/agents/<family>/`.
- **Server** (built, #1160). `artifacts/engine/convex/v2/`:
  - `deal.ts` `buildPool` deals a dynamic rule with no table: main part only, `contentHash` hashed from family and
    params.
  - `world.ts` `valueWithParts` returns a fresh energy estimate in `rarityBits` (the field name is kept; it now holds
    energy).
  - Points are still own × the sum of the others.

## How the server re-estimates

- **On each commit**, `loop.ts` `valuesAt` → `valuesOf` estimates every seat's energy. The result goes into
  `v2ObjectValues` and the standings.
- **On each look**, `ops/object.ts` `look` estimates the looker's own energy afresh for a dynamic rule before
  `tell`.
- **No table.** `rule.values` and `rule.worth` fail with an explanation. `play.ts` `myRule.value` is null (the
  validator is widened). The tick passes agents no `values` and no `others`, so agents climb their own utility.
- **Rule fit.** `fit.ts` over a dynamic pool reads the latest 24 observations with K = 1, to stay inside a query's time
  limit.
- **Drift never redraws.** Every dynamic family has `keepsParams`.

## Costs

- **In Node** (seen narrowly): 1–35 ms per estimate at K = 12, for the eight families on nine sample lines. One outlier,
  a trial family on a far-off state, took 0.9 s, so every dealt utility treats numbers past 10^10 as out of reach.
- **In the Convex runtime** (seen narrowly, not timed per function): `test/v2-game.test.ts` "lines-beginner" (4 seats
  with practice partners, 60 world seconds) and `v2-play` ran to completion on the local backend, with no limit
  warnings in the dev log. **Not measured:** per-commit milliseconds in Convex. Do that first, for example by timing
  `v2/testing:ownBitsAt` on a finished game.

## Known faults and gaps

1. **Size is magnitude.** The coordinator's amendment asks for the information content of each read parameter (top and
   bottom bits), together with "simplify first" descent routes in the floor, and a padding test (c = 8,670,001/10,000
   against 867). The ratio of energy gained to energy spent padding is **not measured**. Lines have **no rounding
   mutator**; the only descent is a stretch by a fraction or a shift by a solved amount, and fees grow with an amount's
   size.
2. **Agents ignore the other players.** They get no `values`, so `othersAfter`/`worth` give them nothing. The fix:
   give `EngineHost` (lib/v2-agents host.ts) a state-based worth (`energyOf`) in place of `gameLookup(score)`, have
   `othersAfter` return `mine`, and make the guest `climb` use `o.mine.after × o.after` when the game is dynamic.
3. **The mix is c-heavy.** Four of the eight families read the y-intercept (coordinator). Swap one c-hug for an
   x-intercept rule and add an a/b/c rule; the proposed ten are in the coordinator's thread.
4. **Old families are still on develop.** The owner has since asked to delete them (coordinator's message, 16 Nov):
   remove the old line families and the tuple machinery, keep one line per idea in `docs/engine-v2/old-rule-ideas.md`,
   record the decision, and update CLAUDE.md. Other line presets (lines-lenses, lines-whole, lines-four) still deal
   old families on tables.
5. **Rows 3a, 4 and 7 of v2-rule-check are skipped** for dynamic families, and row 5 is exempt for lines-beginner.
   Rows 2 and 10 are unmeasured.
6. **The gallery and the rules mirror** still show the old lists and curves. A dynamic rule shows no curve.
7. **The beginner start energy** is 150 (median Simple starter 825 bits). Recompute it when the families change
   (`MEDIAN_STARTER_BITS`, `LINES_BEGINNER_ECONOMY`).
8. **Grids (D)** have only the trial's `lib/v2-grid/src/trial-dynamic.ts`, which takes about 1.5 s an estimate.
   **Deleting the tables (E)** has not started.

## Exact next steps

1. Time a commit in the Convex runtime (per-function ms), then adjust `LINE_K` if needed.
2. Information-content size, with simplify-first routes (round-then-solve, divide-then-solve) and the padding test.
   Report the ratio to the coordinator.
3. Rebalance the families: add an x-intercept rule and an a/b/c rule, drop one c-hug. Update the agent catalogue and
   re-render (`pnpm --filter @workspace/v2-agents render`).
4. Agents: a state-based worth in the host, and `othersAfter` with `mine`.
5. Delete the old line families and the tuple machinery per the owner's instruction, and move all line presets to the
   dynamic set.
6. The gallery and rules mirror for the new set (formula, parameter draw, line editor, utility, energy with jitter).
7. Grids: random-board starts, family heuristics, a cheaper move enumeration, K about 10.
8. Delete the tables (value files, gen-v2-values, tail formulas, the 35-bit gate, tree caps), and keep `spec.md` and
   `v1-audit.md` truthful.
9. Run the line and grid end-to-end games to their end, then give the coordinator what to try on dev.
