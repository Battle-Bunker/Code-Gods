# Status: line rule design (collapse check and fraction-native families), rule-design session, 14–16 Nov

Labels: **built** (in code, measured), **seen narrowly** (measured on a few cases), **guess** (not measured).

## 1. What I was asked to do

1. Design and measure line rule patterns that pass the collapse check: a kid-readable primary plus an advanced secondary.
2. Later: tied secondaries (decision 29), adversaries (decision 30), PMI and perpendicularity (decision 39), parameterised families (decisions 40/41), drift, and the redesign of the ten beginner families.
3. Last (16 Nov): build new fraction-native line families. These are four of the 12-family beginner pool. Their good states are non-whole fractions. They take the owner's tree shape: nearest target, then closeness, then a third layer.

## 2. Merged and unmerged

- **Merged into develop:**
  - #607, #632, #638, #671, #682, #690, #699: docs/engine-v2/line-rules-v3-proposals.md and docs/engine-v2/scripts/line-*-results.md (built).
  - #759: docs/engine-v2/beginner-line-redesign.md.
  - #918: Twin Fractions (lib/v2-linear/src/frac-twin-fractions.ts, undealt) and lib/v2-agents/scripts/frac-check.ts.
- **Unmerged:** branch `claude/frac-bottoms`, draft PR #948 (paused 16 Nov). It contains:
  - lib/v2-linear/src/frac-fraction-gradient.ts, frac-mixed-intercept.ts, frac-fraction-pair.ts, and test/frac-new-fraction-families.test.ts (12 tests pass; built);
  - scripts: lib/v2-agents/scripts/frac-walk.ts, frac-share.ts, and a TREE_GAP hook (tuples-tree, as a patch);
  - docs/engine-v2/fraction-families.md (cards in the owner's format, tuples, measurements);
  - docs/engine-v2/scripts/tree-gap-closeness.patch (not adopted);
  - lexicographic value JSONs for fraction-gradient.

## 3. Unfinished plan (concrete next steps)

1. Re-measure Fraction Gradient and Mixed Intercept under the size-based number code (session ...SoBnm). I sent it the harness; nothing was run.
2. Make their level worth climbing. The level is worth 1–2 bits now. Fraction Pair (the min of the two tops) doubled it, but steep whole lines reach it too.
3. Check Fraction Gradient against Steep Line on the PMI table. Both read |m|. (guess: aligned)
4. Starters and annotations for the families. Not started.

## 4. Obstacles and lessons the docs may not hold

- **A precision main part (nearness to an irrational) is fragile.** Twin Fractions: nudges keep 15–27% (built).
- **Bottom numbers survive cheap moves:** unit shifts and tilts, three of the four mirrors, and nudges of a or c (built). But b costs ½ bit per unit. So a ladder on bottom size (Bⁿ − 1, polygon numbers) either stalls after a few levels or, with a ladder tail, overshoots the energy gate at 41–56 bits (built).
- **Targets that crowd towards a whole number make a cliff.** One nudge onto the whole number keeps 1–3% (Nearly Whole; built).
- **A level read from a size is shallow.** P(|m| ≥ x) falls slowly under the law: about 1.3 bits in total (built). Making it dearer with "min of both" lets steep whole lines in. The fraction share at 10 bits or more fell from 91% to 63% (built, d = 7).
- **Under the tree value (16 Nov), an exact hit is priced by the target's own arithmetic.** 2⅓ is worth 7.3 bits; 10⅓ is worth 22.7 (31 is prime). So points are not monotone in the level, and a greedy climb stalls at the first cheap exact hit (built).
- **Gap-unit closeness (a floor of 1/16 of the gap) barely helps:** 22.7 → 14.5 bits (built). Near a target, the law's rational readings are rare at any scale. The integrator's flat 2-bit cap on closeness and the third worked better (theirs; seen narrowly).
- **Fraction share in law draws ≈ base rate (62%) for Fraction Gradient and Pair.** Only states at 10 bits or more are clearly fractional (91–97%). Mixed Intercept is 85–90% even in the law's top decile (built).
- **Vertical lines and flat lines** need explicit "worst" handling in every third that divides by m or c.
- **Tooling:**
  - values-cli takes about 25 s per parameter set and tie-breaker.
  - Value files are named <hash>-<tb>.json, including ">" for tuple keys.
  - The ladder() wrapper (keepsParams + witness) switches the value tail to a linear ladder tail with witness caps.
  - After a pull, run `pnpm install --frozen-lockfile`, or v2 packages go missing.
  - Do not revert a file while a background loop still imports it; use a git worktree.

## 5. What is obsolete after the 16–17 Nov scoring rebuild (one-number utilities, energy as bits of surprise)

- All lexicographic value files and tails (ladderCaps, tail fits) for my families: obsolete (guess: the whole lexicographic and tree machinery).
- The tree-shaped tuple layers (level > closeness > third) in frac-*.ts: their shape is obsolete if utilities are now one number (guess). The desired-value ideas probably carry over as one-number utilities: fractions with a dealt bottom, "w and a third". So does the robustness lesson: a size-like reading with evenly spaced targets.
- The energy-gate figures (35 bits) and the frac-check, tuples-tree and frac-share numbers belong to the old law and valuation (guess: re-measure, don't reuse).
- Still useful, I think (guess): the findings in §4 about fragility, cliffs, b's cost and crowding targets, and the kid-readable card wording in fraction-families.md.
