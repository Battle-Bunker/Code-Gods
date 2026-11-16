# Handover: the cutover to the dynamic energy measure (16 Nov, Melbourne evening)

Labels: **built** (in the code and tested), **seen narrowly** (measured under the stated assumptions), **guess**.

## Update, 17 Nov (Melbourne, mid-morning): steps 6 and 7 done; step 8's measurements

- **Step 6, grids (#1165).** Nine pure-utility grid rules (`lib/v2-grid/src/dynamic-families.ts`; table and check table
  in `energy.md`, "Grids"), dealt on every grid setup; grid estimator `lib/v2-grid/src/energy.ts` (law-board starts;
  per-group anchor rewrites merged exactly on a Pareto front; the rule's own searches; single-move floor). Commit in
  the Convex runtime: median 229 ms, max 296 ms (seen narrowly). Old grid families, grid seating, grid valuation code
  deleted (`old-rule-ideas.md`). Defence goals are refused by the room (they valued badness through tables).
- **Step 7, tables (#1166).** Value files, generator, lookups, tails, tree valuation, uniqueness correction, defence net,
  W/PMI/tension/compat/unopposed tables, the dealing trial's log and table-era scripts deleted. **Withheld:** two-line
  systems (`lines-pairs`) and the coloured boards (`grids-original-colours`): only energy-scored families are dealable.
  `spec.md` §7 marked superseded. Agents: `myRule.energy`, `othersAfter.mine`; `climb` no longer calls `rarity` on
  energy rules (a decimal utility crashed it once `worth` answered). `worth` is not answered on energy rules, so
  starters still climb their own utility and weigh nobody else (fault 2 is still open, by choice: with `worth` the
  starters weighed points on near-zero newborn energies and skipped every act).
- **Drift is inert:** every dealt family keeps its parameters (ladders). Its live test went with the boards.
- **Step 8 (seen narrowly).**
  - *Noise of a standing at K = 8* (three random tables of four seats, three newborn objects each, twelve estimates):
    lines: sd of a seat's total 1–5 energy, gaps between neighbouring seats 0–11; grids: sd 1–25, gaps 0–129. So close
    seats swap places on noise; clear leads hold. Raising K to 16 halves the variance but (guess) about doubles a
    commit (some 460 ms median on grids against the 600 ms gate): K stays 8. Guess: the standing is a sum over many commits per
    object over a game, which averages some of it.
  - *Fraction-native rules and fees:* stating a fraction is priced like its denominator's size (si.shift by 1/97 costs
    about 11,650 energy against 6 for 1; 1/7 costs 92), so Unit Fraction, Prime Sliver, Crossing Sliver, Fine Bottom and
    Next-door Bottom are reachable only through shortcuts (stretch by ½, ⅓, 1/10; rounding; mirrors). Proposal (not
    built): price an amount's denominator by its digits (as decision 25 prices shortcuts) rather than by its size.
- **Pair utility ideas (for later; two-line systems are withheld):** (1) *Crossing Prime*: the two lines' crossing x as
  a fraction p/q, utility log2 p − 4|x − p| for the nearest prime p (big crossings, precise); (2) *Right Angle*: m₁·m₂
  close to −1 with the gradients' bottoms big, utility log2(q₁q₂) − 8|m₁m₂ + 1|; (3) *Parallel Gap*: equal gradients
  and the vertical gap a power of k, utility √log2 P − |gap − P|³ − 4|m₁ − m₂|; (4) *Triangle Area*: the triangle the two
  lines cut with the y-axis has area n² for n a multiple of k (big n).
- **Pre-existing, not chased:** in `v2-play.test.ts`, "reads: …" depends on an earlier test and "pause once …" compares
  the agent's othersAfter with the server's want, which disagree under disclosure noise; both pass or fail with order.
- **Next:** the views still say "bits"/rarity for energy (faces, summary, the Lines pane's Why?); give the agents the
  others' weighting in a way that survives newborn near-zero energies (fault 2); restate pairs and coloured boards as
  utilities if the owner wants them back.

## Update, 17 Nov (Melbourne morning): steps 1–5 done; what is next

- **Step 5 (#1164):** `test/v2-energy-cost.test.ts` reads a commit's and a look's time from the backend's execution
  log. At K = 8 (`LINE_K`, lowered from 12) a commit takes about 200 ms median, a look at every object at most 173 ms
  (seen narrowly: one game, four seats, local backend). The R8 page-query gate's `play:myRule`, `play:object` and
  `locks:ofObject` take about 90 ms against 50 ms in the 1,000-object fixture; `develop` before the cutover measured
  102–113 ms on the same machine, so it predates this work. Open.
- **Energy spread at small sizes** (the coordinator, from the rules mirror): y = 2x + 3 under Power Hug (k = 3) read
  2.0 to 5.6 around 3.6 across estimates. Small states have few same-size starts and many reach u* in one cheap move,
  so the relative jitter is large where the energy is small. Guess: harmless for points (small numbers either way); if
  it matters, raise K for states whose read parameters are short, which costs little there.
- **Known live-test notes** (full `test:v2` on 17 Nov): the assistant's queue test ends in `budget` (the room's
  assistant budget runs out on its slow sandbox loops; nothing in the cutover touches it). Several others failed only
  in the long run and pass alone (timing).
- **Next, in order:**
  1. **Step 6, grids.** `lib/v2-grid/src/trial-dynamic.ts` is the start (about 1.5 s an estimate in Node: cut it).
     Random-board starts, family heuristics, a cheaper move enumeration, K about 8. New pure-utility grid rules (one
     number each, decision 50; cards in words; adversaries), then delete the old grid families as the lines were
     (old-rule-ideas.md gets a grid section; widen nothing in the schema; `knownFamily` already makes retired families
     score 0). The grid deal still uses its seating rule and value tables until then.
  2. **Step 7.** Delete what only the tables needed: `lib/v2-valuation` (value files, `gen-v2-values`, tail formulas,
     the 35-bit gate, tree caps), `valuesIndex.gen.ts`, `values.ts` lookups, the W/PMI tables (`pairPmi`,
     `unopposedDirections`, compat.gen), table.ts; keep `spec.md` and `v1-audit.md` truthful.
  3. **Step 8.** Run a line and a grid game to their end: `test/v2-game.test.ts` (lines-beginner, grids-beginner) on the
     local backend, then the browser suites `pnpm --filter @workspace/player-web e2e:site` and `e2e:v2-views` (the
     views' gallery now uses the dynamic families; its screenshots will change). Then on dev; tell the coordinator
     what to try.
  4. **Also open:** the views still show "bits"/rarity wording for line rules (faces, summary); the guest `climb`/`fair`
     helpers still read `worth`/`rarity` (null on dynamic games): give them the energy (`othersAfter` already works).
     Points are own energy × the others' sum; energy scales differ by rule (Square Triangle's good states ≈ 1000,
     Unit Fraction's ≈ 10): check in step 8 whether dear rules dominate.

## Update, 17 Nov: step 3 (and part of 4) done

- **Deleted** (owner decision 50; one line per old family in `docs/engine-v2/old-rule-ideas.md`): every old line family
  (dealt, undealt, tree), the tuple rules, tie-breaker layers on lines, the trial modes (trial, rarity, sideways,
  dynamic examples), line seating and the named-opponent table, the anchored line deal, the line value files and their
  tests; the agents' tuple catalogue and old line agents; the line storyboard and sharing galleries.
- **All four line presets deal the dynamic set.** Whole-number boards deal only the families whose good states are whole
  (`DynamicLineSpec.whole`); four-line objects sum each line's energy (type.ts `estimate`).
- **Energy where tables were:** the agents' host values a dynamic rule by its energy (`bitsOf`; seeded per act by
  `energySeed` so an act sees one number per state), so `othersAfter`, `myScore` bits and the commit clause work on
  dynamic games (fault 2's host half). The what-if preview's worth is the energy. The rules mirror shows only the
  eleven, with formula, parameter draw/type-in, line editor, utility and jittering energy.
- **Stored games** naming a retired family load and score nothing (`knownFamily`; card "A retired rule").
- **Tests removed with the code they tested** (no replacement yet): the guest helpers' value-based `fair`/`climb` tests,
  Thorough's two-step lookahead with values, the views' rung/tie-breaker/contributor-chain tests for line rules, the
  uniqueness correction on line-q. The server still passes agents no `others` on dynamic games (fault 2's server half).

## Update, 17 Nov (Melbourne, early morning): steps 1 and 2 done

- **#1161 (merged), descent and size.** `si.round` (lib/v2-linear mutators.ts) rounds m or c to a whole number, ten or
  tenth, priced as two choices, one-way (`inverse: none`). v2-core `walkStep` stays put on a one-way move and
  `cycleDiagnostic` skips it, so births keep π ∝ 2^−φ. Starts match information content (`sameSize`: top and bottom
  digits). The floor rounds s's readings and has round/divide-then-solve shortcuts. Padding ratio ≈ 3·10⁻⁸
  (`test/energy.test.ts`, energy.md).
- **#1162, the rule set** (eleven dealt; energy.md's table): Smooth Hug out; Crossing Sliver (reads `X`), Stepping
  Coefficients (reads `gen`), Circle Kiss, Square Triangle in. `startLike` builds starts in those representations. The
  floor has mirror → solve → mirror routes. Agents' catalogue and rendered agents updated.
- **Known gaps carried forward:** faults 2 (agents ignore other players), 5, 6, 8 below are unchanged. Rows 2, 5, 9, 10
  of the design check are unmeasured for the new pool. Energy scales differ by rule (Square Triangle's good states
  ≈ 1000, Unit Fraction's ≈ 10 on the sample lines); points are own × others' sum, so a rule with dear states weighs
  more. Guess: worth a look in step 8's games.
- **Next:** step 3 (delete old line families, tuple machinery, tie-breaker tiers, tree valuation, trial modes; write
  old-rule-ideas.md; record the decision; fix CLAUDE.md), then steps 4–8 as in the coordinator's list.

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
