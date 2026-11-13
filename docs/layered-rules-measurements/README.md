# Tiered rules: measurements

Measurements of the shipped tiered families (a base plus "★ To score even higher" interactions,
[`docs/layered-rules-design.md`](../layered-rules-design.md), [`docs/tiered-rules.md`](../tiered-rules.md)), read through
each family's own card and its **shipped** calibration table on `Grid(4,base10,mono)`
(`lib/game-utilities/data/calibration/v1/Grid(4,base10,mono).json`, hybrid version 2: 8,192 particles and 4 sweeps at
the base's top). One file per family:

- [`opposite-nines.md`](opposite-nines.md): "lines add up to x", "2×2 squares add up to x"; the composition comparison.
- [`mirrormancer.md`](mirrormancer.md): "mirrors holding exactly two ys", "mirrors whose half adds up to x".
- [`kings-and-subjects.md`](kings-and-subjects.md): "pairs of kings with x in between", "same-number roads of y".
- [`two-pair.md`](two-pair.md): "linked boxes adding up to x", "links through y", "roads of y equal numbers".
- [`crosswise-threes.md`](crosswise-threes.md): "lines add up to x", and why "2×2 squares add up to x" is not dealt here.

[`mirror-tiers.md`](mirror-tiers.md) and [`royal-court.md`](royal-court.md) are the family authors' notes on how the
tiers were chosen; their numbers are from the older budget.

## Summary

One row per family and interaction, re-measured on 2026-11-13 against the dealt sets that ship now, over **every**
dealt table (the profile skips a value whose table another value already covers, so the rows below cover all 44).
Ranges are over those tables. `base top` and `top bits` are the shipped tables' own; `+top` is over the base's exact
top (the hybrid law's, which is exact by convolution and a little above the base's sampled table). Tier share is the
share of the tier's headroom a one-cell greedy agent holds after 48 moves, playing the base only ("base-only": the
tier points it gets by accident) or the whole rule. Mean `SYN` and the payoff ratio are over the two values of each
interaction that were paired and played (first and last dealt), 40 games each. Sampled, except the calibration error's
reference for Opposite Nines and Mirrormancer, which is exact.

| family | interaction | dealt values | tables | base top | top bits | +top | tier share, base-only agent | tier share, tier-aware agent | mean SYN, base → tiered | payoff ratio | max calibration error, dealt (bits) |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| Opposite Nines | lines | 15 | 8 | 26.4 | 37.5–41.6 | 11.1–15.2 | 0.01–0.11 | 0.05–0.25 | 28.4 → 41.2–41.5 | 1.00 | 0.38 (exact reference) |
| Opposite Nines | squares | 6 | 3 | 26.4 | 37.9–41.1 | 11.5–14.7 | 0.04–0.12 | 0.08–0.25 | 28.4 → 39.4–41.1 | 1.00 | 0.16 (exact reference) |
| Mirrormancer | holding | 10 | 1 | 26.6 | 36.9 | 10.4 | 0.06 | 0.11 | 31.1 → 41.5 | 1.00 | 0.06 (exact reference) |
| Mirrormancer | halves | 5 | 3 | 26.6 | 41.0–42.7 | 14.4–16.1 | 0.01–0.07 | 0.02–0.09 | 31.1 → 44.2–45.3 | 1.00 | 0.28 (exact reference) |
| Kings and Subjects | pairs | 5 | 5 | 14.6 | 27.5–28.3 | 12.8–13.7 | 0.04–0.09 | 0.19–0.26 | 45.6 → 59.8–59.9 | 0.99 | 0.30 (sampled reference) |
| Kings and Subjects | sameRoads | 1 | 1 | 14.6 | 27.2 | 12.6 | 0.00 | 0.03 | 45.6 → 60.0 | 1.00 | 0.30 (sampled reference) |
| Two Pair | linkSums | 23 | 12 | 20.5 | 36.1–38.3 | 15.6–17.8 | 0.00–0.04 | **0.00–0.06** | 27.2 → 44.0–46.4 | 1.00–1.02 | 0.63 (exact reference) |
| Two Pair | linksVia | 10 | 1 | 20.5 | 30.8 | 10.2 | 0.03 | 0.03 | 27.2 → 40.0 | 1.01 | 0.05 (exact reference) |
| Two Pair | equalRoads | 2 | 2 | 20.5 | 35.3–37.3 | 14.8–16.8 | 0.00–0.01 | 0.00–0.02 | 27.2 → 42.6–45.7 | 1.00–1.02 | no reference law |
| Crosswise Threes | lines | 8 | 8 | 16.2 | 32.3–36.7 | 16.1–20.5 | 0.03–0.08 | **0.35–0.57** | 21.0 → 43.0–43.2 | 0.99–1.01 | 0.42, or 0.47 counting a top level of 17 boards (sampled reference) |

**How reachable each tier is.** The tier-aware share is the one number a beginner feels, and the five families are not
alike: Crosswise Threes' lines are **0.35 to 0.57** — a one-cell climber gets a third to a half of that tier — while
Two Pair's linked boxes are **0.00 to 0.06**, the least reachable tier that ships. Two Pair's ★ asks for two cells to
change together (a box's pair must move as a pair), and a one-cell agent cannot take the first step; Crosswise Threes
leaves four cells free of the base, so a line's total can be tuned one cell at a time. The same thing showed up in the
goal-card example search, which could not find a board scoring Two Pair's tier until its moves were aimed at a unit
(`climbTier`, `src/explain/index.ts`). Kings and Subjects' pairs of kings (0.19–0.26) and Opposite Nines (0.05–0.25)
sit in between, and Mirrormancer's halves (0.02–0.09) and Two Pair's are the ones a player has to plan for.

**Max calibration error per family** (shipped table against the reference, bits of P(tier ≥ i | base at its top)):
Opposite Nines 0.38 dealt, 0.56 Lab (exact); Mirrormancer 0.28 (exact); Kings and Subjects 0.30 (sampled); Two Pair
0.63 (exact: the 45⁴ choices of four number pairs at the top); Crosswise Threes 0.42 (sampled: 2 · 10⁷ uniform top
boards, every total x in one pass). The bound the tables declare is 1 bit, and **42 of the 44 dealt tables now have a
reference law** — only Two Pair's two `equalRoads` tables have none, because they read arrangements inside the boxes
and roads across them, which the 45⁴ count cannot see.

**What "max error" covers.** It is the worst level where the reference is solid: an exact reference is solid
everywhere, and a sampled one only where it has at least 100 boards. `--check` now says in its own output which levels
that leaves out — "NOT COMPARED: 1 under 100 boards", or "1 level(s) above the reference's top" when the sample never
reached the table's top tier at all — so a thin sample can no longer report a clean error over the easy levels and say
nothing about the top. Counting those thin top levels too, the worst anywhere is **0.72 bits**, on Crosswise Threes'
Lab `squares` x = 18 (18 boards at that level); the worst dealt one is its `lines` x = 12 (0.47 on 17 boards).

One run over everything (`$T --no-profile --check`, dealt and Lab, 53 tables with a reference and 2 without):
**every one is within 0.63 bits** where its reference is solid, the worst being Two Pair's `linkSums` x = 14 (0.63),
x = 16 (0.57) and x = 36 (0.55), then Opposite Nines' Lab `squares` x = 9 (0.56). That run uses the default sample of
2 · 10⁶ boards, which is too thin for Crosswise Threes: its own numbers above come from `--top-sample 20000000`, and at
the default its two Lab `squares` tables have their top level not compared at all.

**Pool check.** Max top / min top over the **44** dealt tiered tables: 42.72 (Mirrormancer halves x = 8) / 27.20
(Kings and Subjects sameRoads y = 4) = **1.57** (must be ≤ 2.5: passes).

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

1. **Fixed: Kings and Subjects sameRoads y = 2 and y = 3 are no longer dealt.** They failed the liveness check on the
   shipped law (their tables added 25.5 and 25.9 bits against a cap of 20), and the y = 2 table was wrong at its top
   level by about 4.8 bits (20.7 by an independent sample of 2·10⁷ boards, 19.9 to 21.6 at 95%), beyond the declared
   bound of 1 bit. Both are out of `COURT_DEALT` and out of the Lab, so no table that ships rests on that estimate;
   only y = 4 (12.6 bits, within 0.30 of its reference) is dealt. The 4.8-bit measurement stands as a limit of the
   hybrid law at this budget when the best tier is about 21 bits over the base: the fix was to stop dealing the value,
   not to trust a better number.
2. **Equal opportunity is now checked per tier signature, not per group median.** The design's §8.3 "within 15% of the
   group's median" is implemented as `test/equal-opportunity.test.ts`: the dealt draws are grouped by their tier
   signature and each group's tops must sit within 15% of each other (`TOP_RATIO`), which is what the dealt sets above
   were chosen against. Across interactions the tops do differ — Opposite Nines lines reach 37.5–41.6 and Kings and
   Subjects sameRoads 27.2 — and the pool check (2.5×) is what bounds that.
3. **Opposite Nines lines x = 18 reaches all ten lines and adds 14.84 bits exactly** (15.06 in the shipped table), not
   the 10.1 of the design's prototype (8 lines). Still true.
4. **Synergy with Crosswise Threes gets worse, not better**: `SYN` 25 → 39 with lines x = 18 (design: 43 → 31). Still
   true.
5. **Magic Eighteen's ceiling falls** with lines x = 18: 1.00 → 0.88 (design: stays at 1.00; the earlier run on the
   old tables read 0.93). `SYN` 23 → 33.
6. **Kings and Subjects: a gated tier moves the early climb**: `rate4` 2.79 → up to 3.20 (pairs x = 5). The design
   says gated tiers leave `rate4` unchanged; that holds for Opposite Nines (2.95 → 2.98) and Mirrormancer
   (2.89 → 2.91).
7. **The earlier run's calibration finding is fixed**: at the old budget the worst dealt table was 2.34 bits off
   (squares x = 10); on the shipped tables Opposite Nines is within 0.38 and Mirrormancer within 0.28, exactly.
8. **How reachable a tier is varies by a factor of ten across families.** The design treats the interactions as
   interchangeable once each is alive and inside the band. They are not, for the one thing a beginner feels: a
   tier-aware one-cell climber holds 0.35 to 0.57 of Crosswise Threes' lines and 0.00 to 0.06 of Two Pair's linked
   boxes. Liveness and the bit band do not predict it — Two Pair's linkSums add *more* bits over the base (15.6–17.8)
   than Opposite Nines' lines do (11.1–15.2), and are far less reachable. What seems to decide it is whether a single
   cell can move the tier at all: Two Pair's pairs have to move two cells at a time. Worth a rule of its own before
   more interactions are added; not fixed here.

What agrees: gated and plain compositions cost a base-only player nothing and unlock costs 7.1 bits (lines x = 18);
payoff ratios 0.99 to 1.03 (design: 0.95 to 1.06); the pool ratio; mean `SYN` rises by 10 to 20 with a tier.

## Not verified

- Kings and Subjects: nothing is exact. The reference is a sample; it cannot check a level rarer than about 1 in 10⁷
  (the Lab tops, 31.7 to 33.9 added bits, are unchecked).
- Two Pair's two `equalRoads` tables have no reference law. Every other dealt tiered table now has one.
- Crosswise Threes' reference is a sample, and at the top of its rarest values it is thin: x = 12's top level rests on
  17 of the 2 · 10⁷ boards (about ±0.3 bits at 95%), so that row checks the hybrid law only to about a third of a bit.
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
$T --families two_pair --no-profile --check                                 # exact: the 45⁴ choices at the top
$T --families crosswise_threes --no-profile --check --top-sample 20000000   # sampled: every total x in one pass
node --experimental-strip-types scripts/two-pair-exact.ts                    # the same exact count, printed
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

## Synergy: does any tier agree with a partner's rule? No (2026-11-13)

The design document proposed offering, per family, an interaction that a common partner's base already pays for
(§8.1). Measured against the real beginner eight, no such tier exists among the shipped ones:

| family | mean SYN, base | mean SYN, with a tier | ceiling, base | ceiling, with a tier |
|---|--:|--:|--:|--:|
| Opposite Nines | 28.4 | 37.8–41.5 | 1.00 | 0.80–0.95 |
| Mirrormancer | 31.1 | 41.5–45.3 | 0.66–1.00 | 0.60–1.00 |
| Kings and Subjects | 45.6 | 58.8–60.0 | 0.43–1.00 | 0.31–0.91 |

Every tier of every family raises `SYN` against every one of the eight. The two openings the prototypes claimed are
refuted: Opposite Nines' "lines add up to 18" × Crosswise Threes goes 25 → 39 (the prototype said 43 → 31), and Magic
Eighteen's ceiling falls from 1.00 to 0.88. x = 18 scores no better against Magic Eighteen (SYN 33) than x = 16 or 17
(32), so the agreement is not what moves the number: the tier's added reach is. `SYN` is a share of each rule's own
top, and a considerate pair of one-cell agents reaches almost none of a tier.

The design document's §8.1 now says this, and its "design rule" about agreeing tiers is dropped. A fair test of
agreement needs a cooperation measure that is not normalised by each rule's own top; it does not exist yet.
