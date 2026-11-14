# The beginner pool (Annotated basics)

Status: shipped 2026-11-11. Owner's request: the most basic game is a 4×4 grid of numbers with no colour (the `mono`
palette), dealing about eight annotated rules that are *equally simple to understand and to write an algorithm for*.
The measuring stick is the rule-difficulty framework (docs/rule-difficulty.md).

Code: `BEGINNER_POOL` in `lib/game-core/src/settings.ts` (the default setup, `grid-annotated-basics`, deals exactly
these on `Grid(4,base10,mono)`); the new families live in `lib/game-utilities/src/families/grid/beginner/`, each with a
lens in `src/explain/lenses/` and a Python reference in `lib/grid-lab/gridlab/rules/beginner/`.

## 1. The eight

| Rule | Units on 4×4 | Score | Top |
|---|---|---|---|
| 🪞 Mirrormancer (existing) | 4 lines (rows or columns) | (#lines that read the same both ways, #matching pairs) | (4, 8) |
| 🎩 Magic Eighteen | 4 lines (rows or columns) | (#lines adding up to 18, −Σ\|total − 18\|) | (4, 0) |
| 🙃 Opposite Nines | 8 half-turn pairs | (#pairs adding up to 9, −Σ\|a + b − 9\|) | (8, 0) |
| ✌️ Two Pair | 4 corner 2×2 boxes | (#boxes holding two different pairs, #boxes with one pair or three of a kind) | (4, 0) |
| 📏 Spread of Three | 9 overlapping 2×2 squares | (#squares whose biggest − smallest = 3, −Σ\|spread − 3\|) | (9, 0) |
| 👋 Strangers | 16 touching pairs inside the corner boxes | (#pairs both > 1, no common divisor, at least 2 apart; #1s beside a bigger number) | (16, 0) |
| 🐸 Leapfrog | 8 pairs two cells apart in a row | #pairs exactly one apart | 8 |
| ↙️ Crosswise Threes | 6 pairs across the top-right/bottom-left diagonal | (#pairs exactly 3 apart, −Σ\|\|a − b\| − 3\|) | (6, 0) |

Magic Eighteen is magic_accountant's exact scoring with the target fixed at the middle sum N·(S−1)/2 (18 on 4×4
digits). magic_accountant keeps its own params, support and calibration keys for the other setups; the sibling exists
because only targets 18 avoid flat contradictions with the rest of the pool and setups cannot restrict a family's
params.

The coloured annotated set is kept as its own setup, **Annotated colours** (`grid-annotated-colours`, Grid(4,base10,rgb),
every family with a lens).

## 2. How it was chosen

Brainstorms proposed eight; measurement replaced three and tuned two (2026-11-11):

- **stepping_stones** (biggest group of hops of 2) dropped: flat parity contradictions with Opposite Nines and the
  fold rule (a pair adding to 9 or differing by 1 mixes parities; a hop-2 group is one parity) and with Mirrormancer
  (four mirrors halve the board), and its bits ran far above the pool. It keeps its new lens in Annotated colours.
- **magic_accountant** → **Magic Eighteen**: odd targets contradict Mirrormancer (a palindrome a b b a has an even sum),
  every target but 18 contradicts Opposite Nines (half-turn sums force row r + row 3−r = 36), and targets 16/20 are
  maximised by an all-same board.
- **Step-Stool Mirror** (fold top onto bottom, one apart) → **Leapfrog**: the fold pairs are Mirrormancer's column pairs
  (equal against one apart: a flat contradiction). The near-miss tier was dropped: with it Leapfrog won 49% of games.
- **Strangers** on all 24 touching pairs conflicted with Mirrormancer (equal middle neighbours); it now counts the 16
  pairs inside the corner boxes and adds "not next-door" (without it, 15 bits, below the band).
- **Crosswise Threes** (eighth rule) instead of Spin-Three or Crosswise Nines, which repeat Opposite Nines' pairs or
  relation.

## 3. Measurements (Grid(4,base10), number moves, every dealt variant)

Framework (`difficulty --moves symbol`, default budget): card bits, top bits, rate4 (bits per move over the first 4
greedy moves), g10, trap, K, DIFF, SYN. Own harness: A = share of random boards with an improving one-cell move (2,000),
B = one-cell greedy stops below the best (500 starts), G = three-player win share over 2,400 seat-rotated games
(greedy / deny).

| Rule | card | top | rate4 | g10 | trap | K | DIFF | SYN | A | B | G greedy / deny |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Mirrormancer | 626 | 26.6 | 3.25 | 26.6 | 0 | 1.0 | 0 | 36.5 | 1.00 | 0% | .36 / .16 |
| Magic Eighteen | 427 | 15.6 | 2.99 | 15.6 | 0 | 2.2 | 0 | 53.9 | 1.00 | 0% | .39 / .38 |
| Opposite Nines | 626 | 26.2 | 3.01 | 26.2 | 0 | 1.0 | 0 | 39.3 | 1.00 | 0% | .45 / .43 |
| Crosswise Threes | 745 | 16.9 | 2.79 | 16.9 | 0 | 1.0 | 0 | 28.2 | 1.00 | 0% | .28 / .41 |
| Two Pair | 878 | 20.1 | 2.75 | 20.1 | 0 | 3.0 | 0 | 36.4 | 1.00 | 0% | .32 / .21 |
| Spread of Three | 752 | 23.8 | 3.16 | 23.2 | .02 | 2.3 | 2.5 | 32.3 | 1.00 | 14.8% | .25 / .44 |
| Strangers | 886 | 23.0 | 2.48 | 22.6 | 0 | 1.1 | 0 | 31.1 | 1.00 | 1.2% | .18 / .41 |
| Leapfrog | 423 | 21.0 | 2.00 | 21.0 | 0 | 1.0 | 0 | 36.5 | 1.00 | 0% | .43 / .23 |

Card bits for Crosswise Threes, Strangers and Leapfrog are the shipped cards'; the others were measured on equivalent
ad-hoc card bodies. Every pair of rules, over every pair of dealt variants, has a board at 1.00 of both tops in the
harness's search; the framework's lowest pair ceiling is 0.76 (Magic Eighteen × Mirrormancer), pair SYN 15–67. Only
Mirrormancer has a uniform-board maximum.

Against `SYMMETRIC_POOL` the verdict still fails on marginal or structural lines: card bits over 800 (Two Pair,
Strangers), g10/g20 outside ±25% (Mirrormancer above, Magic Eighteen below: it is done in 4 moves), rate4 max/min 1.62
(1.6), card max/min 2.56 (2.5), per-rule SYN spread 26 (15). Win shares outside 20–47%: Mirrormancer under deny (.16, a
property of the rule) and Strangers under greedy (.18; tried a richer near-miss tier, the plain in-box rule, "at least 3
apart": .18–.20). The balance model's seat order (seats 1/2/3 win .44/.33/.23 under greedy) is separate from the rules
and is averaged out above.

Anchors on the same yardstick: honest_minesweeper (greedy stalls on every board, never reaches 90% of top; K 5.3, DIFF
33, SYN 60) against Mirrormancer (never stalls, K 1.0, DIFF 0, SYN 36.5).

## 4. Energy under the five cost models (2026-11-11)

Annotated basics now prices changes with `distance-v1`. docs/rule-difficulty.md §6.4 measures the eight under all five
cost models (`difficulty --no-pairs --starts 64 --cost-model <model>`, one canonical variant per rule). With the
cost-aware greedy, share of top held after 64 energy bits (mean; max/min; CV) and `rateE` max/min:

| model | share of top at 64 | `rateE` max/min | bits per energy against set-v1 |
|---|--:|--:|--:|
| `set-v1` | 0.45; 2.64; 0.31 | 2.01 | ×1 |
| `distance-v1` | 0.69; 1.73; 0.18 | 1.47 | ×1.64 |
| `dial-v1` | 0.80; 1.53; 0.15 | 1.26 | ×1.93 |
| `log-v1` | 0.74; 1.57; 0.17 | 1.31 | ×1.76 |
| `multiply-v1` | 0.72; 1.60; 0.18 | 1.26 | ×1.72 |

Every distance price makes the pool more even and faster than `set-v1`. Magic Eighteen is the one rule the slider does
not speed up (0.76 to 0.74 of top at 64): its row totals are often fixed by one far change. The dial and multiply make
it cheap (0.97, 0.93) through the price list, not the rule.

## 5. Win share by rule under the final economy (2026-11-13)

Measured with the coordination model (`lib/game-utilities/scripts/coordination.ts`, mode `rules`), which plays the
real rules, shipped tables with hold rarity, and game-core's energy on the default setup as it ships: changes priced
by distance, 600 starting energy, a 30 s store, the read price, every offer charged, the debt bound, score noise off,
300 s, one agent per player, each policy's program paid for at its measured summon price. The setup's own dealer deals
(no two players hold the same rule). Every player at a table plays the same policy, so what differs between seats is
the rule.

```
pnpm --filter @workspace/game-utilities coordination rules --players 3 --games 600 --summon --set greedy,considerate,deny
pnpm --filter @workspace/game-utilities coordination rules --players 4 --games 600 --summon --set greedy
pnpm --filter @workspace/game-utilities coordination rules --players 4 --games 300 --summon --set considerate,deny
```

Each cell: win share / mean rank / points against the table's mean / the rule's own bits per object at the end (as a
share of its top). A win share is good to about ±3 points at 3 players (each rule is dealt in about 225 of 600 games).

**3 players** (fair: 33%, rank 2.0)

| Rule | top bits (table / in a 3-player game) | greedy | considerate | deny |
|---|---|---|---|---|
| Opposite Nines | 26.4 / 32.9 | 83% / 1.19 / 1.08 / 18.0 (55%) | 72% / 1.29 / 1.14 / 15.1 (46%) | 87% / 1.14 / 1.20 / 9.7 (29%) |
| Mirrormancer | 26.6 / 33.0 | 68% / 1.35 / 1.08 / 19.5 (59%) | 11% / 2.50 / 0.90 / 9.8 (30%) | 24% / 2.27 / 0.90 / 6.5 (20%) |
| Leapfrog | 20.2 / 25.0 | 24% / 2.02 / 1.01 / 14.9 (59%) | 9% / 2.43 / 0.92 / 9.6 (38%) | 34% / 1.87 / 1.05 / 8.3 (33%) |
| Spread of Three | 22.8 / 27.3 | 23% / 2.03 / 1.01 / 14.1 (52%) | 28% / 1.96 / 0.98 / 11.4 (42%) | 25% / 2.04 / 1.00 / 6.3 (23%) |
| Two Pair | 20.5 / 27.0 | 23% / 1.96 / 1.01 / 15.5 (57%) | 22% / 2.26 / 0.94 / 10.4 (39%) | 23% / 2.23 / 0.93 / 6.9 (25%) |
| Crosswise Threes | 16.2 / 19.8 | 21% / 2.43 / 0.94 / 11.0 (55%) | 15% / 2.11 / 0.99 / 10.3 (52%) | 21% / 2.26 / 0.94 / 6.4 (32%) |
| Strangers | 21.7 / 25.4 | 20% / 2.18 / 0.99 / 13.1 (52%) | 9% / 2.47 / 0.92 / 9.2 (36%) | 27% / 2.20 / 0.95 / 6.5 (26%) |
| Magic Eighteen | 14.8 / 20.6 | 1% / 2.88 / 0.89 / 9.7 (47%) | 93% / 1.07 / 1.20 / 15.0 (73%) | 22% / 2.08 / 1.00 / 7.5 (36%) |
| **lowest to highest** | 19.8 to 33.0 (×1.67) | 1% to 83% | 9% to 93% | 21% to 87% |

**4 players** (fair: 25%, rank 2.5)

| Rule | greedy | considerate | deny |
|---|---|---|---|
| Opposite Nines | 44% / 1.89 / 1.06 / 10.9 (30%) | 59% / 1.46 / 1.19 / 11.3 (31%) | 65% / 1.56 / 1.13 / 6.5 (18%) |
| Mirrormancer | 52% / 1.69 / 1.10 / 12.0 (32%) | 1% / 3.66 / 0.78 / 6.3 (17%) | 9% / 2.96 / 0.93 / 4.8 (13%) |
| Leapfrog | 13% / 2.59 / 1.00 / 9.1 (34%) | 1% / 3.23 / 0.86 / 7.0 (26%) | 19% / 2.67 / 0.99 / 5.3 (20%) |
| Spread of Three | 44% / 1.88 / 1.07 / 11.0 (38%) | 28% / 2.04 / 1.04 / 9.5 (33%) | 38% / 2.02 / 1.06 / 5.7 (20%) |
| Two Pair | 16% / 2.59 / 1.00 / 9.7 (32%) | 7% / 3.02 / 0.89 / 7.7 (25%) | 8% / 2.94 / 0.94 / 5.0 (16%) |
| Crosswise Threes | 17% / 2.89 / 0.95 / 8.3 (39%) | 10% / 2.38 / 1.00 / 8.2 (38%) | 22% / 2.41 / 1.02 / 5.5 (26%) |
| Strangers | 13% / 2.80 / 0.98 / 9.4 (35%) | 4% / 2.85 / 0.93 / 7.4 (27%) | 32% / 2.40 / 1.02 / 5.4 (20%) |
| Magic Eighteen | 1% / 3.68 / 0.84 / 7.1 (31%) | 92% / 1.08 / 1.34 / 13.0 (56%) | 18% / 2.77 / 0.95 / 5.2 (22%) |
| **lowest to highest** | 1% to 52% | 1% to 92% | 8% to 65% |

**What it says.**

- The pool is uneven by far more than 1.5× under every policy and at both table sizes: the dealt rule decides the game.
  Greedy: Opposite Nines 83%, Mirrormancer 68%, Magic Eighteen 1%. Considerate: Magic Eighteen 93%. Spoiling: Opposite
  Nines 87%. (Earlier figures, on a turn-based model: Strangers 17% greedy, Mirrormancer 15% under deny.)
- **Why.** A player's points on an object are their own bits × the others' bits, so the totals at one table sit close
  together (0.78 to 1.34 of the table's mean) and a small, systematic edge in own bits wins nearly every game. Between
  two players a and b on one object the difference is c·(a − b): whoever's rule holds more bits is ahead on every
  object the third player cares about. The edge comes from the rule: under greedy the rules with the highest tops hold
  the most bits (Mirrormancer 19.5 and Opposite Nines 18.0 per object against 9.7 for Magic Eighteen); under
  considerate play Magic Eighteen keeps 73% of its top because its moves seldom lower anybody else's bits.
- **Best reachable score.** In a 3-player game the tops run from 19.8 bits (Crosswise Threes) and 20.6 (Magic Eighteen)
  to 33.0 (Mirrormancer) and 32.9 (Opposite Nines): ×1.67. The first two are out of line low, the last two high.
- In a real three-human game in the browser (one each of Mirrormancer, Spread of Three, Magic Eighteen, each player
  running the shipped example agent) the best boards were at the top of all three rules and the final order was the
  order of the tops: 31,626 / 29,909 / 23,740 points for 31.1 / 25.3 / 17.9 bits.

**Fixes measured (none shipped).** 300 games per table, 3 players; raw tables in `docs/balance-results-2026-11-13/`.

| Change | greedy | considerate | deny |
|---|---|---|---|
| As shipped (600 games) | 1% to 83% | 9% to 93% | 21% to 87% |
| Every rule scaled so its best board is worth 26 bits (`--equal-tops 26`) | 15% to 63% (×4.1) | 4% to 96% | 1% to 68% |
| Pool of five: without Opposite Nines, Mirrormancer, Magic Eighteen (`--pool …`) | 9% to 52% (×5.9) | 10% to 60% (×5.9) | 22% to 50% (×2.3) |

Neither levels the pool. Equal tops moves the win to other rules (Crosswise Threes 63%, Leapfrog 59% under greedy;
Mirrormancer falls to 1% under deny). Dropping the three outliers leaves Spread of Three on top under every policy.
Because the winner turns on a few percent of points, no constant per rule can level every way of playing at once; see
`docs/handover-integration.md` for the diagnosis and the fix proposed.

## 6. The fix: the rules pass one seat along when a room plays again (2026-11-13)

Measured first (3 players, model as §5, every god the same style; win share by rule, lowest to highest; raw tables in
`docs/balance-results-2026-11-13/`):

| Candidate | greedy | considerate | deny | Verdict |
|---|---|---|---|---|
| As shipped (develop of 13 Nov, 120 games) | 2% to 86% | – | – | the problem |
| (a) **Par**: each rule scaled so reference greedy play holds 15 bits per object (`--equal-par 15`, par measured on 600 other deals: Mirrormancer 19.9 … Magic Eighteen 9.7) | 4% to 63% | 1% to 95% | 0% to 79% | rejected (`par3.txt`) |
| (b) **Symmetric deal**: the same rule for everyone, turned or relabelled | – | – | – | impossible: under rotations, reflections and the digit complement 9 − d no beginner rule has more than 2 distinct variants (Opposite Nines, Two Pair, Spread of Three: 1), so two seats would hold the identical rule |
| (c) **Fixed combinations**: every one of the 56 three-rule deals of the pool (`combos`, 60 games per style) | | | | rejected: 0 of 56 keep every rule within 20–45% for all three styles; the best (Leapfrog, Strangers, Crosswise Threes) is 65/10/25 under greedy. Inside one deal the winner is often close to certain (one rule wins at least 95% in 22 of 56 deals under greedy, 100% in 15) (`combos3.txt`) |
| (c) narrower dealt parameters | | | | nothing to narrow: only Magic Eighteen has a parameter (rows or columns) |
| (e) the bid phase (docs/bid-phase.md §3, §5) | 41 → 9 to 22 points of spread | | | needs accurate bids, measured for greedy tables only; a lone low bidder takes the best rule |

**What the measurements say.** Par equalised every rule's own bits (14.7 to 15.6 per object) and Mirrormancer still won
4% under greedy. The winner is set by how a rule's high-scoring boards line up with the other two rules' (its conflict
with them, docs/rule-difficulty.md SYN) together with the table's style, not by how many bits it holds; so no constant
per rule and no choice of deal levels a single game for every way of playing.

**Shipped: (d) as a dealer change, no rule or score changes.** When a room plays again with the same players and the
same dealing settings, the last game's rules pass one seat along (each player gets the rule of the player before them
in the last game's order), until everyone has held every rule; the next game is then dealt afresh. The goal card says
"Game 2 of 3: Alice held this rule last game. The rules pass one player along each game, so everyone holds each rule
once." A deal made with bids is never rotated; a game ended before its world ran does not count; a rule that can no longer be dealt (withdrawn by a deploy) starts a fresh deal. The first game is exactly as before. Fair over a round of P games by
construction (each player holds each of the P rules once, against the same table); within one game the dealt rule
still matters as in §5. Code: `artifacts/engine/convex/lib/dealRotation.ts` (stateless: it reads the room's last 8
games), tests `test/unit/deal-rotation.test.ts`, `test/game-deal-rotation.test.ts`.

**Style, not rule.** Mixed tables, single games, rules and seats rotated (150 games, `tables3-mixed.txt`): one `deny`
among two cooperators wins 95%, among two `considerate` 100%; one `considerate` among two greedy 0%; one `payoff`
among two greedy 10%. Rotation does not touch this: it is the coordination problem of docs/coordination-incentives.md.

## 7. Practice opponents (2026-11-14)

Before: a practice game seated the library's default AI player (a language model; locally the mock, which summons an
agent that slides one row and climbs nothing), and every persona walker finished 1st of 3 with the example agent alone.

Now: a practice game seats the **Practice partner** (`aiTemplates.ts` `PRACTICE_TEMPLATE_ID`, `lib/builtinPlayer.ts`):
a built-in AI player that calls no model and costs nothing. It summons its own rule's example agent, the one the forge
pre-fills for a new player, once, and leaves it alone. A player who only summons the example therefore plays against
equals and finishes in the middle on average by construction; any improvement shows. If an administrator removes the
template, practice falls back to the default AI player. Since 14 Nov any signed-in owner may seat practice partners, with or without a provider key; model-backed AI seats remain admin-only (`aiEnabledFor`).

Real engine games, default setup, 300 s, seat 0 the player under test against two Practice partners
(`artifacts/engine/scripts/coordination-games.ts --table fill --plans tee,gee`):

| Seat 0 runs | games | mean rank (of 3) | wins |
|---|---|---|---|
| the example agent (all three alike) | – | 2.0 by construction | – |
| its rule's "Thorough" starter | 6 | 2.17 | 1 |
| a one-cell search over its own rule card (the harness's greedy program) | 6 | 1.33 | 4 |

The Thorough starter is not stronger than the example in these games; writing a search over your own rule is.
Few games: the ranks are good to about ±0.4.

## 8. Saturation (2026-11-14)

Model, default setup, 120 games per cell (`coordination rules --saturation`): mean share of its rule's top that a
player holds per object, share of objects at a player's top, and how often the leader at that second wins.

| world s | 3p greedy: held / at top / leader wins | 3p considerate | 4p greedy | 4p considerate |
|---|---|---|---|---|
| 30 | 39% / 4% / 67% | 42% / 6% / 77% | 29% / 2% / 53% | 30% / 2% / 79% |
| 120 | 53% / 18% / 73% | 44% / 8% / 88% | 33% / 3% / 63% | 32% / 3% / 91% |
| 240 | 56% / 24% / 78% | 44% / 9% / 95% | 33% / 4% / 61% | 32% / 3% / 98% |

No grid saturates: at most a quarter of objects reach a player's top, and new objects keep arriving (0.1 Hz). Greedy
tables keep moving to the end (the leader at 240 s wins 78% at 3 players, 61% at 4). Considerate tables freeze from
about 60 s: not because boards are full but because every remaining move would lower somebody else's bits. No
parameter change made: length, grids and spawn rate are left as they are.
