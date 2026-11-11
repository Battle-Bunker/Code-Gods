# Tiered rules: measurements

Measurements of the shipped tiered families (a base plus "★ To score even higher" interactions,
[`docs/layered-rules-design.md`](../layered-rules-design.md), [`docs/tiered-rules.md`](../tiered-rules.md)), read through
each family's own card and its **shipped** calibration table on `Grid(4,base10,mono)`
(`lib/game-utilities/data/calibration/v1/Grid(4,base10,mono).json`, hybrid version 2: 8,192 particles and 4 sweeps at
the base's top). One file per family:

- [`opposite-nines.md`](opposite-nines.md): "lines add up to x", "2×2 squares add up to x"; the composition comparison.
- [`mirrormancer.md`](mirrormancer.md): "mirrors holding exactly two ys", "mirrors whose half adds up to x".
- [`kings-and-subjects.md`](kings-and-subjects.md): "pairs of kings with x in between", "same-number roads of y".

[`mirror-tiers.md`](mirror-tiers.md) and [`royal-court.md`](royal-court.md) are the family authors' notes on how the
tiers were chosen; their numbers are from the older budget.

## Summary

One row per family and interaction. Ranges are over the dealt tables. `+top` is over the base's exact top. Tier share
is the share of the tier's headroom a one-cell greedy agent holds after 48 moves. Mean `SYN` and the payoff ratio are
over the two values of each interaction that were paired and played (first and last dealt). Sampled, except the
calibration error's reference for Opposite Nines and Mirrormancer, which is exact.

| family | interaction | dealt values | tables | base top | top bits | +top | tier share, base-only agent | tier share, tier-aware agent | mean SYN, base → tiered | payoff ratio | max calibration error, dealt (bits) | Lab |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| Opposite Nines | lines | 17 | 9 | 26.58 | 37.5–43.1 | 10.9–16.5 | 0.01–0.11 (mean 0.06) | 0.05–0.25 (mean 0.13) | 28.4 → 41.5–42.5 | 1.00–1.03 | 0.38 (exact reference) | 0.39 |
| Opposite Nines | squares | 13 | 4 | 26.58 | 37.9–43.5 | 11.3–17.0 | 0.04–0.12 (mean 0.06) | 0.07–0.25 (mean 0.13) | 28.4 → 39.4–44.0 | 1.00–1.01 | 0.16 (exact reference) | 0.56 |
| Mirrormancer | holding | 10 | 1 | 26.58 | 36.9 | 10.4 | 0.06 | 0.11 | 31.1 → 41.5 | 1.00 | 0.06 (exact reference) | – |
| Mirrormancer | halves | 5 | 3 | 26.58 | 41.0–42.7 | 14.4–16.1 | 0.01–0.07 (mean 0.04) | 0.02–0.09 (mean 0.05) | 31.1 → 44.2–45.3 | 1.00 | 0.28 (exact reference) | – |
| Kings and Subjects | pairs | 5 | 5 | 14.81 | 27.5–28.3 | 12.6–13.5 | 0.04–0.09 (mean 0.06) | 0.19–0.26 (mean 0.22) | 45.6 → 59.8–59.9 | 0.99 | 0.30 (sampled reference) | 0.07 |
| Kings and Subjects | sameRoads | 3 | 3 | 14.81 | 27.2–40.7 | 12.4–25.9 | 0.00–0.04 (mean 0.01) | 0.03–0.11 (mean 0.06) | 45.6 → 60.0–66.1 | 1.00–1.01 | **about 4.8** at the top level of y = 2 (sampled reference); 0.43 below it | – |

**Max calibration error per family** (shipped table against the reference, bits of P(tier ≥ i | base at its top)):
Opposite Nines 0.38 dealt, 0.56 Lab (exact); Mirrormancer 0.28 (exact); Kings and Subjects 0.30 for pairs and
sameRoads y = 4, and about 4.8 at the top level of sameRoads y = 2 (sampled: 12 boards of 2·10⁷; 3.9 to 5.6 at 95%).
The bound the tables declare is 1 bit.

**Pool check.** Max top / min top over the 25 dealt tiered tables: 43.54 (Opposite Nines squares x = 10) / 27.20
(Kings and Subjects sameRoads y = 4) = **1.60** (must be ≤ 2.5: passes). With sameRoads y = 2 at its sampled value
(35.5 bits) the ratio is the same.

**Build.** One fresh `buildTable` per kind of draw, on four cores shared with other work (the hybrid store of
`scripts/calibrate.ts` is not used):

| draw | estimator | levels | seconds |
|---|---|--:|--:|
| opposite_nines base | sampled | 120 | 4.5 |
| opposite_nines lines x = 10 | hybrid | 417 | 27.4 |
| opposite_nines squares x = 10 | hybrid | 417 | 28.4 |
| opposite_nines lines x = 18, plain (Lab) | hybrid | 2,529 | 238.0 |
| mirrormancer base | exact | 15 | 0.0 |
| mirrormancer holding | hybrid | 25 | 12.3 |
| mirrormancer halves x = 7 | hybrid | 25 | 9.2 |
| kings_and_subjects base | sampled | 84 | 4.6 |
| kings_and_subjects pairs x = 1 | hybrid | 185 | 17.2 |
| kings_and_subjects sameRoads y = 2 | hybrid | 185 | 19.7 |

`docs/tiered-rules.md` says 5 to 10 seconds for a 4×4 table; under this load it was 9 to 28.

## What contradicts the design document or the shipped code

1. **Kings and Subjects sameRoads y = 2 and y = 3 are dealt but fail the liveness check on the shipped law**: their
   tables add 25.5 and 25.9 bits (cap: 20). `test/royal-court.test.ts` "every dealt tier is alive" fails. The older
   budget saw a lower best tier (5 and 3 roads; +13.9 and +15.0).
2. **The sameRoads y = 2 table is wrong at its top level by about 4.8 bits** (25.5 in the table; 20.7 by an
   independent sample, 19.9 to 21.6 at 95%), beyond the declared bound of 1 bit. y = 3 is consistent with its table
   (24.3 by the sample from one board; above the cap either way).
3. **Comparable reach per tier** (design §8.3: within 15% of the group's median): the three sameRoads values add 12.4,
   about 20.7 and about 24–26 bits. Mirrormancer halves (14.4–16.1) and Kings and Subjects pairs (12.6–13.5) are
   inside; Opposite Nines lines (10.9–16.5, median 12.5) and squares (11.3–17.0) are not.
4. **Opposite Nines lines x = 18 reaches all ten lines and adds 14.84 bits exactly** (15.06 in the shipped table), not
   the 10.1 of the design's prototype (8 lines). Still true.
5. **Synergy with Crosswise Threes gets worse, not better**: `SYN` 25 → 39 with lines x = 18 (design: 43 → 31). Still
   true.
6. **Magic Eighteen's ceiling falls** with lines x = 18: 1.00 → 0.88 (design: stays at 1.00; the earlier run on the
   old tables read 0.93). `SYN` 23 → 33.
7. **Kings and Subjects: a gated tier moves the early climb**: `rate4` 2.79 → up to 3.20 (pairs x = 5). The design
   says gated tiers leave `rate4` unchanged; that holds for Opposite Nines (2.95 → 2.98) and Mirrormancer
   (2.89 → 2.91).
8. **The earlier run's calibration finding is fixed**: at the old budget the worst dealt table was 2.34 bits off
   (squares x = 10); on the shipped tables Opposite Nines is within 0.38 and Mirrormancer within 0.28, exactly.

What agrees: gated and plain compositions cost a base-only player nothing and unlock costs 7.1 bits (lines x = 18);
payoff ratios 0.99 to 1.03 (design: 0.95 to 1.06); the pool ratio; mean `SYN` rises by 10 to 20 with a tier.

## Not verified

- Kings and Subjects: nothing is exact. The reference is a sample; it cannot check a level rarer than about 1 in 10⁷
  (the y = 3 top rests on one board; the Lab tops, 31.7 to 33.9 added bits, are unchecked).
- Tier levels below the base's top (between the gate and the top) are not compared with any reference, in any family.
- The liveness sweep over every x of Opposite Nines (dealt or not) was not rerun on version 2.
- Synergy and games were run for two values per interaction, 40 games each; depth 2 (pairs of interactions) not at all.
- Shapes other than `Grid(4,base10,mono)`.
- Build seconds were taken on a loaded machine.

## Regenerate

The tool is `lib/game-utilities/scripts/tiered-profile.ts`. It picks up every family that declares
`UtilityFamily.tiered` on `Grid(4,base10,mono)`. The only per-family code is the optional reference law at the base's
top (`EXACT_TOP`, see "Calibration error"). It reads the shipped tables; it builds a table only when none is shipped
(the plain composition) or when asked to time one.

```sh
cd lib/game-utilities
T="node --experimental-strip-types scripts/tiered-profile.ts"       # = pnpm --filter @workspace/game-utilities tiered
M=../../docs/layered-rules-measurements
# profile, liveness, calibration error, synergy and games of the dealt (gated) draws, one family at a time
$T --families mirrormancer       --pair-limit 2 --json $M/mirrormancer.profile.json
$T --families kings_and_subjects --pair-limit 2 --json $M/kings-and-subjects.profile.json
$T --families opposite_nines --interactions lines   --pair-limit 2 --json lines.json     # the two halves of
$T --families opposite_nines --interactions squares --pair-limit 2 --json squares.json   # opposite-nines.profile.json
# every dealt and Lab value's shipped table against the reference law at the base's top
$T --no-profile --check --json $M/calibration-check.json
$T --families kings_and_subjects --no-profile --check --values "sameRoads(y=2);sameRoads(y=3)" --top-sample 20000000
# the composition comparison (gated, plain, unlock)
$T --families opposite_nines --no-profile --compare --compare-value "lines(x=18)" --json $M/opposite-nines.compare.json
# one fresh build per family: the base and the first dealt value of each interaction
$T --no-profile --build-time --json $M/build-times.json
```

Other options: `--compose gated|plain|unlock|uncapped`, `--depth 2`, `--limit N` (values per interaction), `--budget
quick`, `--games N`, `--no-pairs`, `--no-games`, `--no-exact`, `--sweep "lines:x=0..36"` (liveness of every value of a
tier param, dealt or not; not rerun on the shipped tables). Everything is seeded: the same command gives the same
numbers. `--markdown FILE` writes the tables the family files hold.

## What is exact and what is sampled

| quantity | how |
|---|---|
| the base's law inside a tiered table | **exact** (convolution over the base's disjoint units) |
| the tier's law given the base (every tiered level, `top`, `+top`, liveness) | **sampled**: multilevel splitting, the hybrid law (`src/tiers/hybrid.ts`), seeded |
| an unlocked draw's table | **sampled**: the Monte Carlo and splitting estimator (`scripts/estimator.ts`) |
| a base draw's own table | Mirrormancer: **exact**. Opposite Nines, Kings and Subjects: the sampled estimator |
| reference law at the top, Opposite Nines | **exact**: all 10⁸ boards with 8 pairs at 9 are enumerated |
| reference law at the top, Mirrormancer | **exact**: closed form over the 10⁸ boards with four mirrors (four independent lines) |
| reference law at the top, Kings and Subjects | **sampled, independent of the hybrid law**: uniform boards with four courts (2·10⁶ a value; 2·10⁷ for sameRoads y = 2, 3). No product form: the tiers read kings and roads across boxes, and the top set has 3.5·10¹¹ boards |
| climbs, `DIFF`, `K`, synergy, games | seeded searches over 12 starts (the rule-difficulty framework, [`docs/rule-difficulty.md`](../rule-difficulty.md)) |

## Columns

Profile (one row per draw; the base first):

| column | meaning |
|---|---|
| table | `shipped` (fresh in `data/calibration`) or `built` here; `hybrid`, `sampled`, `exact` or `approx` |
| levels, build s | levels of the table; seconds to compute its law here, in a process that shared four cores with other work (see "One fresh build" for the timed builds) |
| top | bits of the best ordinal the table knows (for a tiered draw: the base at its top with the best tier the hybrid law found) |
| +top | top minus the base draw's top: what the tier adds. Against the base's own shipped table, so 0.2 more than the liveness "added bits" where that table is sampled |
| prior mean | mean bits of a uniform random board (exact from the table) |
| rate4, g10, g20 | one-cell greedy: bits gained per move over the first 4 moves; bits after 10 and 20 moves |
| trap | share of the top a one-cell greedy climb never reaches (48 moves) |
| gap | what a beam (width 6, 16 moves) holds over greedy at 16 moves, as a share |
| esc2 | share of stuck greedy ends that a two-cell move improves |
| K | entanglement: how much a cell's best value depends on the other cells |
| **DIFF** | 100 · (gap + trap) / 2 |
| base agent | bits, on this draw's table, of a one-cell greedy agent that climbs the **base** draw's ordinal for 48 moves |
| accidental | share of the tier's headroom those boards hold: (bits − bits of the same board with its tier at 0) / (top − that floor). "Tier share, base-only agent" in the summary |
| tier agent, tier share | the same two for a one-cell greedy agent that climbs the whole rule |

Liveness (the check `tierLiveness` runs, here from the family's declared hybrid analytic): `tier min` and `tier top` are
the least and best tier on boards that max the base; `share at top` is P(tier = tier top | base at its top); `added
bits` is −log2 of it; `degenerate boards` are uniform or two-digit boards that reach the best ordinal; `problems` is why
the value may not be dealt (band: 6 to 20 added bits).

Calibration error: at the base's top, bits of P(tier ≥ i | top) from the shipped table and from the reference law, at
every tier level, and the largest difference. A family adds its reference to `EXACT_TOP` in the script. For a sampled
reference the number of sampled boards at each level is shown in brackets, and the largest difference counts only
levels with at least 100 boards.

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
