# ↙️ Crosswise Threes' tiers: measurements (4×4 digits)

Code: `lib/game-utilities/src/families/grid/beginner/crosswise_threes.ts` (`threesTiers`; the base above it is
unchanged). Scripts, both run from `lib/game-utilities`:

- `node --experimental-strip-types scripts/tier-sweep.ts crosswise_threes --gate` (the gate);
- `node --experimental-strip-types scripts/tier-sweep.ts crosswise_threes '<json list of tier lists>'` (liveness of each
  candidate value through the card's own code, against the band of 6 to 20 bits).

## The base

Fold the board along the diagonal from the top-right corner to the bottom-left corner; each number should land on a
number 3 apart. The ordinal is [pairs 3 apart, −total distance from 3].

| | |
|---|---|
| Units | the 6 fold pairs, disjoint, each scoring [3 apart, −how far from 3] |
| Free cells | the 4 cells of the fold line, in no pair: they never score or deduct |
| Top | [6, 0] at 17.0 bits (exact, by convolution over the 6 pairs) |
| Greedy, 4 moves (400 starts) | mean 4.83 pairs; histogram 0..6: 0/0/0/0/159/152/89 |
| Greedy, 10 moves | 6 pairs on 400 of 400 starts |
| Greedy, 20 moves | 6 pairs on 400 of 400 starts |

**Gate: 6** (every pair), the base's greedy ten-move level. The card says "First get 6 pairs 3 apart". As with ✌️ Two
Pair, whose ten-move level is also its top, the ★ tier counts only on a board whose base is finished.

## The interactions

Both come from the shared library (`src/families/grid/tiers.ts`), so this family added no interaction code:

| id | Card sentence | Param |
|---|---|---|
| `lines` | Each row, column or long diagonal that adds up to x scores a point. | x, 0…36 |
| `squares` | Each 2×2 square, anywhere on the board, that adds up to x scores a point. | x, 0…36 |

**Why they interact with this base rather than sit beside it.** The base pairs 12 of the 16 cells across the fold and
leaves the 4 cells of the fold line free, so a free cell could tune a line's total for nothing — but every row and
every column holds exactly *one* free cell, and it is the same one: the fold line's cell in row r is also the one in
column N−1−r. The free cells therefore cannot tune a row and its column apart. Of the two long diagonals, the ↙ one
*is* the fold line (four free cells, so the only line the base does not touch at all) and the ↘ one is two folded
pairs, whose numbers are 3 apart in both.

**Folding.** The base reads differences only, so turning every number v into 9 − v leaves it alone and takes a total of
k cells to 9k − x. Both interactions are totals of 4 cells on this shape, so x folds with 36 − x and the two values
share one calibration table: x ≤ 18 is the canonical half.

## Liveness of every value (4×4 digits)

Each row is one freshly built hybrid law read through the family's own card: the tier's top at the base's top, the bits
it adds over the base, the total at the top, and what the liveness check says. Added bits must be 6 to 20
(`TIER_MIN_ADDED_BITS`, `TIER_MAX_ADDED_BITS`) and no uniform or two-digit board may max the tier.

### `lines` (x folds with 36 − x, so 0…18 is every value)

| x | tier top | +base top (bits) | top (bits) | liveness |
|--:|--:|--:|--:|---|
| 0 | 3 | 28.8 | 45.8 | over the cap |
| 1 | 3 | 25.0 | 42.0 | over the cap |
| 2 | 3 | 22.4 | 39.5 | over the cap |
| 3 | 5 | 34.7 | 51.7 | over the cap |
| 4 | 5 | 28.6 | 45.6 | over the cap |
| 5 | 5 | 27.6 | 44.6 | over the cap |
| 6 | 6 | 25.8 | 42.9 | over the cap |
| 7 | 5 | 23.3 | 40.3 | over the cap |
| 8 | 6 | 23.1 | 40.1 | over the cap |
| 9 | 5 | 20.1 | 37.1 | over the cap (Lab) |
| 10 | 6 | 21.2 | 38.2 | over the cap (Lab) |
| **11** | 5 | 17.8 | 34.8 | **dealt** |
| **12** | 6 | 19.7 | 36.7 | **dealt** |
| **13** | 5 | 16.4 | 33.5 | **dealt** |
| **14** | 6 | 18.7 | 35.8 | **dealt** |
| **15** | 5 | 15.4 | 32.4 | **dealt** |
| **16** | 6 | 18.0 | 35.0 | **dealt** |
| **17** | 5 | 15.3 | 32.3 | **dealt** |
| **18** | 6 | 17.9 | 34.9 | **dealt** |

x = 3 is the peak: on a finished base every pair is some (a, a + 3), so a line of two such pairs adds up to 3 more than
twice its smaller numbers, and 3 itself needs the smallest of those to be 0. Low totals are *easier* than the cap
allows rather than harder, because the fold line's four free cells can all be 0.

### `squares` (not dealt)

| x | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| tier top | 3 | 3 | 3 | 6 | 6 | 6 | 7 | 7 | 7 | 7 | 7 | 7 | 7 | 7 | 7 | 7 | 7 | 7 | 7 |
| +base top | 28.1 | 25.6 | 23.4 | 31.6 | 30.3 | 28.6 | 31.5 | 29.2 | 28.1 | 26.6 | 25.1 | 24.0 | 22.9 | 22.3 | 21.9 | 21.4 | 21.4 | 21.0 | 20.8 |

Every value is over the cap of 20: the 9 overlapping 2×2 squares reach 7 at the base's top, which is rarer than the
band allows. So this base deals one interaction, `lines`, and `squares` appears only in the Lab. Measured, not assumed:
the same two interactions on 🙃 Opposite Nines' half-turn base both sit inside the band, because its pairs cover every
cell and there is nothing free to tune.

## What ships

| | |
|---|---|
| Dealt | `lines` x = 11…18 (8 values, 8 tables: none folds onto another) |
| Lab (`uncapped`) | `lines` x = 9, 10; `squares` x = 17, 18 — alive, reaching 20.1 to 21.4 bits where the dealt values reach at most 19.7 |
| Equal opportunity | tops 32.3 to 36.7 bits: max / min = **1.14**, inside the 15% band (`test/equal-opportunity.test.ts`) |
| Expert pairs | none: `squares` is out of the band on its own, so no pair of this family's interactions is dealt |

## Profile, synergy and games (shipped tables, 2026-11-13)

`node --experimental-strip-types scripts/tiered-profile.ts --families crosswise_threes --pair-limit 2 --games 40`.
The base row reads the shipped **sampled** base table (16.2 bits); the 17.0 above is the hybrid law's exact base top.

| value | top | +top | `DIFF` | base-only agent | tier-aware agent | tier share | mean SYN | payoff ratio |
|---|--:|--:|--:|--:|--:|--:|--:|--:|
| base | 16.2 | – | 0.0 | – | – | – | 21.0 | – |
| lines x = 11 | 34.8 | 18.6 | 28.4 | 17.5 | 23.2 | 0.35 | 43.2 | 0.99 |
| lines x = 12 | 36.7 | 20.5 | 24.4 | 17.8 | 24.7 | 0.39 | | |
| lines x = 13 | 33.5 | 17.3 | 21.5 | 17.8 | 25.6 | 0.52 | | |
| lines x = 14 | 35.8 | 19.6 | 24.4 | 17.6 | 24.1 | 0.38 | | |
| lines x = 15 | 32.4 | 16.2 | 15.6 | 18.1 | 25.8 | 0.57 | | |
| lines x = 16 | 35.0 | 18.8 | 22.3 | 18.4 | 25.2 | 0.45 | | |
| lines x = 17 | 32.3 | 16.1 | 16.6 | 17.7 | 24.9 | 0.51 | | |
| lines x = 18 | 34.9 | 18.7 | 20.7 | 17.6 | 23.9 | 0.39 | 43.0 | 1.01 |

**The tier share is the highest of any shipped family: 0.35 to 0.57**, against 0.19–0.26 for Kings and Subjects' pairs
of kings, 0.05–0.25 for Opposite Nines and 0.00–0.06 for Two Pair's linked boxes. A one-cell climber that plays the
whole rule holds a third to a half of this tier's headroom, because the four free cells of the fold line let a line's
total be tuned one cell at a time — the base does not have to be broken to try. That is what a beginner wants from a
★ block: something to reach for that the next single move can move towards. `DIFF` 15.6 to 28.4 says it still needs a
plan rather than falling out of greed.

Synergy with the beginner eight rises as it does for every tiered family (§8.1 of the design document, measured): mean
`SYN` 21.0 → 43.0–43.2 and the ceiling 1.00 → 0.70–0.92. Payoff ratio 0.99 to 1.01 over 40 three-player games each,
seat 0 playing the base only against playing the whole rule.
