# Tiered rules: measurements

Measurements of the real tiered families (a base plus "★ To score even higher" interactions,
[`docs/layered-rules-design.md`](../layered-rules-design.md)), read through each family's own card and its real
calibration table. One file per family:

- [`opposite-nines.md`](opposite-nines.md): Opposite Nines with "lines add up to x" and "2×2 squares add up to x".

The tool is `lib/game-utilities/scripts/tiered-profile.ts`. It picks up every family that declares
`UtilityFamily.tiered` on `Grid(4,base10,mono)`; nothing in it is written per family, except the optional exact
enumeration of a family's top set (`EXACT_TOP`, see "Calibration error").

## Regenerate

```sh
# the profile, liveness, calibration error, synergy and games of the dealt (gated) draws
pnpm --filter @workspace/game-utilities tiered --families opposite_nines --pair-limit 2 \
  --markdown docs/layered-rules-measurements/opposite-nines.profile.md --json docs/layered-rules-measurements/opposite-nines.profile.json
# the composition comparison (gated, plain, unlock) on the family's `compare` values
pnpm --filter @workspace/game-utilities tiered --families opposite_nines --no-profile --compare \
  --markdown docs/layered-rules-measurements/opposite-nines.compare.md --json docs/layered-rules-measurements/opposite-nines.compare.json
# the liveness sweep over every x, dealt or not
pnpm --filter @workspace/game-utilities tiered --families opposite_nines --no-profile --sweep "lines:x=0..36;squares:x=0..36" \
  --markdown docs/layered-rules-measurements/opposite-nines.sweep.md --json docs/layered-rules-measurements/opposite-nines.sweep.json
```

(Paths are relative to the repository root; pnpm runs the script in `lib/game-utilities`, so pass `../../docs/...`
there.) `pnpm --filter @workspace/game-utilities layered --real ...` is the same command. Other options: `--compose
gated|plain|unlock|uncapped`, `--depth 2`, `--limit N` (values per interaction), `--budget quick`, `--games N`,
`--no-pairs`, `--no-games`, `--no-exact`. Everything is seeded: the same command gives the same numbers. About 15 minutes
for the three commands above on four cores (each board is scored by the card itself, about 50,000 boards a second).

`opposite-nines.md` is those three outputs with a few lines of reading; the `.json` files hold every number.

## What is exact and what is sampled

| quantity | how |
|---|---|
| the base's law inside a tiered table | **exact** (convolution over the base's disjoint units) |
| the tier's law given the base (every tiered level, `top`, `+top`, liveness) | **sampled**: multilevel splitting, the hybrid law (`src/tiers/hybrid.ts`), seeded |
| an unlocked draw's table | **sampled**: the Monte Carlo and splitting estimator (`scripts/estimator.ts`) |
| a base draw's own table | whatever is shipped for it (for Opposite Nines: the sampled estimator) |
| "exact" columns of the calibration error and the sweep | **exact**: every board that maxes the base is enumerated |
| climbs, `DIFF`, `K`, synergy, games | seeded searches over 12 starts (the rule-difficulty framework, [`docs/rule-difficulty.md`](../rule-difficulty.md)) |

## Columns

Profile (one row per draw; the base first):

| column | meaning |
|---|---|
| table | `shipped` (fresh in `data/calibration`) or `built` here; `hybrid`, `sampled`, `exact` or `approx` |
| levels, build s | levels of the table; seconds to compute it here (the hybrid law, or the estimator's build) |
| top | bits of the best ordinal the table knows (for a tiered draw: the base at its top with the best tier the hybrid law found) |
| +top | top minus the base draw's top: what the tier adds |
| prior mean | mean bits of a uniform random board (exact from the table) |
| rate4, g10, g20 | one-cell greedy: bits gained per move over the first 4 moves; bits after 10 and 20 moves |
| trap | share of the top a one-cell greedy climb never reaches (48 moves) |
| gap | what a beam (width 6, 16 moves) holds over greedy at 16 moves, as a share |
| esc2 | share of stuck greedy ends that a two-cell move improves |
| K | entanglement: how much a cell's best value depends on the other cells |
| **DIFF** | 100 · (gap + trap) / 2 |
| base agent | bits, on this draw's table, of a one-cell greedy agent that climbs the **base** draw's ordinal for 48 moves |
| accidental | share of the tier's headroom those boards hold: (bits − bits of the same board with its tier at 0) / (top − that floor) |
| tier agent, tier share | the same two for a one-cell greedy agent that climbs the whole rule |

Liveness (the check `tierLiveness` runs, here from the family's declared hybrid analytic): `tier min` and `tier top` are
the least and best tier on boards that max the base; `share at top` is P(tier = tier top | base at its top); `added
bits` is −log2 of it; `degenerate boards` are uniform or two-digit boards that reach the best ordinal; `problems` is why
the value may not be dealt (band: 6 to 20 added bits).

Calibration error: at the base's top, bits of P(tier ≥ i | top) from the hybrid law and from the exact enumeration, at
every tier level, and the largest difference. A family adds its enumeration to `EXACT_TOP` in the script (natively, as
Opposite Nines does for its 10⁸ top boards, or with `exactTopFromBoards` for a small top set).

Synergy: `SYN` (ceiling) of the draw with each of the beginner eight (`measurePair`): `SYN` is the pair difficulty
(0 easy to satisfy both, 100 impossible), the ceiling is the share of both tops one board can hold. Mean over the eight.

Games: the family-balance model (10 objects, 40 rounds, 16 candidate one-cell moves a turn, payoff nᵢ · Σ n of the
others). Seat 0 is dealt the draw, the two others a random pair of the beginner eight; the same seeds are played twice,
seat 0 believing its bits are the base's (base play) or the whole rule's (tier play). Payoff ratio: tier play over base
play.

Composition comparison: one row per composition of the same tier value. `base-only @48 on this table` and `on the base
table` are the bits of the base-only agent's end boards on the composed table and on the base draw's own table; `base-only
loses` is the second minus the first. `card chars` is the length of the TypeScript card; `summary sentences` the sentences
of the rule text.
