# Handover: tiered rules (2026-11-13, 21:20 UTC)

On `develop`, CI green: #314 (Two Pair's links, expert pairs, Crosswise Threes, the example search), #322 (the ★
"Nearest:" line, gallery sections), #323 (reference laws for Two Pair and Crosswise Threes). Findings are in
`docs/layered-rules-measurements/README.md`.

## In flight on this branch (`claude/tier-check-mid`), not merged, not reviewed

`tiered-profile.ts --check-mid`: a shipped tiered table at ONE base level between the gate and the top, against plain
Monte Carlo over `drawGiven` (an exact sampler of {B = b}). It backs the table's conditional law out of the table:
P(I ≥ i | B = b) = (G(b, i) − P(B > b)) / P(B = b), with G = 2^−(level bits). Also `scripts/tier-specs.ts` (one registry
of the tier specs; `tier-sweep.ts` uses it) and a unit test of the inversion (`test/tiered-profile.test.ts`, 10 pass).
Typecheck passed before the last test was added; the full library suite has not been run on this branch.

## What it found (not yet in the measurement docs)

The hybrid law keeps its declared 1-bit bound at the base's top (8,192 particles, 4 sweeps: within 0.63 exactly) but
**not at every level below it** (256 particles, 2 sweeps). Only Opposite Nines and Mirrormancer have levels between the
gate and the top (the other three families' gate is their top). Over 5 levels × 15 dealt tables at 300,000 boards,
6 of 75 checks exceed 1 bit. Confirmed at 3,000,000 boards, base level [6, −12] of Opposite Nines:

| table | tier level | table bits | sample bits (boards) | error |
|---|--:|--:|--:|--:|
| lines x = 16 | 4 | 12.15 | 9.99 (2,960) | **2.16** |
| lines x = 15 | 5 | 14.79 | 13.13 (334) | 1.66 |
| lines x = 13 | 4 | 11.92 | 10.74 (1,757) | 1.19 |

The tables overstate the rarity there. Mirrormancer halves x = 9 at [3, 6] reads 1.03; Opposite Nines lines x = 12 at
[7, −7] reads 1.02. Also seen: lines x = 15 has a level [6, −12, 8] the sample reaches (3 boards) and the table prices
at zero probability.

## Commands (from `lib/game-utilities`)

```sh
T="node --experimental-strip-types scripts/tiered-profile.ts"
$T --families opposite_nines,mirrormancer --no-profile --check-mid --mid-sample 300000 --mid-at 0.25   # 0, 0.25, 0.5, 0.75, 0.9
$T --families opposite_nines --no-profile --check-mid --mid-sample 3000000 --mid-at 0.25 --values "lines(x=16);lines(x=13);lines(x=15)" --markdown out.md
node --experimental-strip-types --test test/tiered-profile.test.ts
```

## What remains, and the decision it needs

1. Review and merge this branch (code-review, full game-utilities suite, root typecheck), and add the finding to
   `docs/layered-rules-measurements/README.md`.
2. **Owner's call:** fix the bound or restate it. Fixing means raising the non-top budget in `src/tiers/hybrid.ts`
   (`particles`, `sweeps`), bumping `HYBRID_VERSION` in `src/families/grid/tiers-hybrid.ts`, rebuilding every tiered
   table (`pnpm --filter @workspace/game-utilities calibrate`, hours) and regenerating every number in the measurement
   files. Restating means saying 1 bit at the top and about 2 below it. `maxErrorBits` feeds each level's stated
   variance in the table, so either choice touches payoffs.
3. Open from before: whether to keep dealing Two Pair's tiers, which a one-cell climber cannot reach (0.00–0.06).
