# Rule difficulty: how hard a rule is to write an algorithm for, and to combine

Status: framework and first measurements (2026-11-11).

Code:
- `lib/game-utilities/scripts/rule-difficulty-lib.ts`: the estimators.
- `lib/game-utilities/scripts/rule-difficulty.ts`: the command line.
- `lib/game-utilities/scripts/rule-difficulty-example.mjs`: example ad-hoc rules.

Tests: `lib/game-utilities/test/rule-difficulty.test.ts`.

The owner's question: compare rules on how hard it is to *come up with algorithms that optimise them*, not only on how
hard they are to understand. Honest Minesweeper is much harder to write an agent for than Mirrormancer, and much harder
again to combine with other rules. The goal is a beginner set where every rule is comparably simple to understand,
to pursue, and to combine.

The rest of this document covers:
- the five dimensions;
- how each is estimated;
- how to run it, including on a rule that exists only as an evaluator;
- how to read the table;
- the proposed thresholds for a symmetric beginner pool;
- the measured tables for the Annotated basics and First steps pools.

## 1. What a rule is to the framework

A rule is a black box with two parts:
- `score(board) → ordinal`: a number, or a tuple compared lexicographically, where bigger is better;
- a calibration that turns ordinals into **bits**, the surprisal −log2 P(u ≥ value) under uniform random boards (the
  game's payoff currency).

Families use their shipped table. Ad-hoc rules, and families on a shape without a table, are calibrated on the spot
with the same estimator as `pnpm calibrate` (`calibrateScore` in `scripts/estimator.ts`). They use a smaller budget:
2^13 Monte Carlo samples and 200 particles.

**Top bits** are the best the rule can reach. They come from the family's closed-form `top` or its exemplar, otherwise
from the best any of the framework's searches found. Bits are capped at the top.

**Moves** are the elementary one-cell changes of docs/energy-model.md §4.1: set one cell's number, and (with
`--moves cell`, the default) set one cell's colour. A beginner agent makes small changes because they are cheap, so a
rule that rewards one-cell changes is one a beginner can pursue.

Two conventions hold throughout:
- **Climbs compare ordinals, never bits.** A move that raises the ordinal is progress even when it adds 0.01 bits.
- **Bits are only the yardstick** that makes rules comparable.

Everything is deterministic. Every sample comes from a `seededRng` keyed by estimator, rule id and shape. All rules share
the same start boards.

## 2. The dimensions

| # | Dimension | Column(s) | Question it answers |
|---|---|---|---|
| 1 | Comprehension | `card` | How much is there to read and re-implement? |
| 2 | Climb (opportunity) | `rate4`, `rate8`, `reach16`, `to90` | How fast does the simplest agent earn bits? |
| 3 | **Algorithmic difficulty** | **`DIFF`** = 100·(trap + gap)/2; diagnostics `plat`, `esc2`, `K` | How much cleverness beyond the simplest agent does the rule need? |
| 4 | **Synergy difficulty** | **`SYN`** per pair = 100·(1 − considerate); `conflict`, `ceiling` | How hard is it to pursue this rule without breaking another, and to find boards good for both? |
| 5 | Pool symmetry | pool line, `verdict` | Are the rules of a pool comparable on 1–4? |

### 2.1 Comprehension: `card`

`card` is the ts-ast-bits-v1 description length of the rule's TypeScript card source, the `function utility(grid)`
program (`lib/game-runtime/engine/ts-ast-bits.mjs`, priced with the room's prelude vocabulary). Summoned TypeScript
programs pay this same price.

It stands in for two things at once:
- how much the player has to read;
- the "evaluation without the evaluator" cost. An agent cannot call the scorer, so it must re-implement at least the
  part of the card that decides whether a change helps.

The readability rules in docs/rules-design.md remain the real test of comprehension. This column only puts a number
beside the other dimensions.

### 2.2 Climb: `rate4`, `rate8`, `reach16`, `to90`

**The agent.** The *simplest decent agent* is one-cell steepest-ascent greedy. It tries every one-cell move, keeps the
one with the best strictly higher ordinal, and otherwise skips. It runs from 12 random boards.

**The columns.**
- `rate4` and `rate8`: the mean bits gained per move over the first 4 and the first 8 moves.
- `reach16`: the share of top bits held after 16 moves.
- `to90`: the median number of moves to reach 90% of the top (∞ when greedy never gets there).

**What it explains.** This is the *opportunity* axis. The balance study of this push found that the Annotated basics
imbalance under greedy play was climb rate, not ceilings. `rate4` ranks that study's greedy win shares with **Spearman ρ
= 0.78** (11 families; `rate8` gives 0.40, top bits 0.28).

Four moves per object is what a player gets in that harness: 40 turns over 10 objects. So the early climb is what
decides a game, and a rule whose bits come late loses even when greedy eventually solves it.

Kingdom, the last at 4%, has the lowest `rate4` among the families.

The order is not fully explained. colour_bonds, the top winner, climbs only middling fast at 4 moves. Its win share also
depends on what its partners do to it, which §2.4 measures.

Two more climb columns follow the beginner-rules brainstorm:
- `g10` and `g20` are the bits greedy holds after 10 and 20 moves. The brainstorm found that, in three-player all-greedy
  games, win share tracked the bits at greedy's endpoint, so these are the quantities to equalise across a pool.
- `uniform max` lists the digits whose uniform board (every cell that digit) reaches 99% of the rule's top. Such a
  maximum is degenerate: an agent can top the rule without understanding it, and every rule with one pulls toward the
  same boring board.

### 2.3 Algorithmic difficulty: `DIFF`, the headline

`DIFF` = 100 × (trap + gap) / 2, from 0 (greedy solves it) to 100.

- **trap**: the share of top bits greedy leaves on the table at its local optimum, mean over starts, with up to 48
  moves.
- **gap**: (beam − greedy) / beam after 16 moves, where beam is a beam search of width 6 over the same one-cell moves. It
  is what a cleverer search earns over the naive agent at equal moves.

Both terms are zero when "just keep improving one cell" is a complete algorithm. Both grow when the rule needs
coordinated changes, lookahead or a plan. That is the cleverness a player has to design.

Diagnostics:
- **`plat`**: the share of random boards on which no one-cell move improves the ordinal, so the agent is blind there.
  Whole-board parity is blind on half the boards. Rules with a coarse primary tier are blind until a whole line is
  done.
- **`stall`** (JSON only): the share of climbs that stop below 90% of the top.
- **`esc2`**: of those stalled ends (up to 3), the share where some change of two cells at once improves. If it is 1,
  the trap is shallow, and a "try pairs of cells" agent escapes it. If it is low, escaping needs a plan.
- **`K`**, entanglement: locality, measured empirically.
  - **Boards.** Take boards from three strata: random, greedy after 4 moves, and greedy's end.
  - **The move.** Take a move that changes the ordinal.
  - **The count.** Count the other cells j for which some change at j flips the *sign* of that move's effect (helps,
    neutral or hurts).
  - **What it means.** K is the number of cells an agent must read to know whether a change helps:
    - count of 7s: K = 0;
    - a mirrored pair: K = 1, the partner;
    - honest_minesweeper: about 5, the neighbours, their mines and the knock-on effects;
    - whole-board parity: K = 15.

`K` is reported but kept out of `DIFF` on purpose. Parity is maximally entangled yet trivial to optimise, because one
aggregate (the total) explains all of it. K measures how much there is to look at. Trap and gap measure how hard it is
to act on.

### 2.4 Synergy difficulty: `SYN`, per pair and per rule

Payoff multiplies a player's bits by the others' bits on the same object, so what matters for a pair (A, B) is the
**joint value** √(sA·sB), where sX is the share of X's top bits on a board.

- **considerate**: two agents take turns from 4 random boards. Each plays one-cell greedy on its own rule but never
  takes a move that lowers the other's ordinal. They stop when neither can move. `considerate` is their mean joint
  value. This is the simplest pair-aware algorithm.
- **SYN** = 100 × (1 − considerate): the share of the joint value the simplest considerate pair leaves on the table.
- **ceiling**: the best joint value any search found, a lower bound on the true joint optimum. The searches are greedy
  on the joint value, started from the agents' ends and from each rule's own greedy optimum, plus 3 simulated-annealing
  runs.
  - A ceiling near 1 means one board tops both rules.
  - A low ceiling means the rules really trade off.
- SYN decomposes as (1 − ceiling), the incompatibility, plus (ceiling − considerate), what a pair-aware design earns
  over the simple one. The JSON reports the latter as `gap`, a share of the ceiling.
- Also reported:
  - **conflict**: P(B's ordinal falls | A's rises) over all one-cell moves on random and mid-climb boards, averaged over
    both directions;
  - **corr**: the correlation of the per-move share gains;
  - **naive**: the joint value two greedy agents reach when they ignore each other. They usually fight, which is the
    owner's "breaking what others built hurts you".

The per-rule `SYN` column is the mean over the rule's partners in the pool: "plays well with others" read the other way
round.

### 2.5 Pool symmetry

`summarise` and `verdict` report:
- max/min and coefficient of variation (CV) of `rate4`;
- max/min of `reach16` and of `card`;
- the maximum and the spread of `DIFF`;
- the worst pair and the lowest ceiling;
- **dominated** rules: another rule climbs at least 25% faster *and* is at least 10 `DIFF` points easier, so nobody
  dealt it has a fair game.

The thresholds are in §5.

### 2.6 Energy: `rateE`, `e32`, `e64` and the cost-aware greedy (2026-11-11)

**Why.** `rate4` counts moves, as if every one-cell change cost the same. That is true of today's cost model
(`set-v1`). Under `distance-v1` (docs/mutation-cost-design.md) a digit moved by Δ costs log2(cells) + log2(families) +
1.585·|Δ| bits, so the currency is **bits gained per energy bit**, and a rule fixed by ±1 nudges is cheaper to pursue
than one fixed by jumps.

**The price.** One act that takes a board g to h costs `changeCost(W)` = W + 0.05·W², where W is
`objectType("Grid").callWork(g, h, …, inst, model)`: the shipped cost functions of `@workspace/game-types`, not a copy
(`moveEnergy` in the library).

**The agents.** Both make one-cell moves, one move per act, from the same start boards as the other columns, and never
spend more than 128 energy bits (`energyClimb`):
- *steepest* is §2.2's greedy. It takes the best strictly higher ordinal and ignores the cost, but pays it.
- *per-energy* is the **cost-aware greedy**: of the strictly improving moves it takes the one with the most bits
  gained per energy bit. Under `set-v1` on a numbers-only board every change costs the same, so it is the steepest
  greedy up to ties (unit-tested).

**The columns** (per-energy agent, under the room's cost model):
- `rateE`: the mean bits gained per energy bit over the first 64 energy bits, (bits at 64 − bits at the start) / 64.
- `e32` and `e64`: the share of the rule's top held after 32 and 64 energy bits. Under `set-v1` on the numbers-only
  4×4 board, 32 energy is one change (16.3 each) and 64 is three.

The **energy table** printed under the main one gives the bits both agents hold at 32 and 64, and the pool's
share-of-top mean, max/min and CV for each agent. The pool line adds **`rateE` max/min** (and its CV). It is the check
the mutation-cost design proposed ("`rateE` max/min ≤ 1.6"). It is **reported, not a threshold**: `verdict` does not
fail a pool on it until the cost model is chosen and the beginner rules are measured (§6.4).

Only these columns depend on `--cost-model`. Every other column is unchanged by it.

## 3. Running it

```
pnpm --filter @workspace/game-utilities difficulty [options]
  --setup annotated|first-steps   the seed setup's shape and reward pool (default annotated)
  --families a,b,c                these families instead of the setup's pool
  --adhoc FILE                    also measure the ad-hoc rules a module exports
  --only-adhoc                    only the ad-hoc rules
  --numbers-only                  keep only rules whose score ignores colours (measured on random recolourings)
  --moves cell|symbol             one-cell number and colour changes (default), or numbers only
  --shape "Grid(4,base10,rgb)"    the board, overriding the setup's (the mono palette, once it lands)
  --budget default|quick          sample sizes
  --starts N                      start boards per rule, overriding the budget's
  --cost-model set-v1|distance-v1 the room's cost model (any of game-types COST_MODELS), for rateE, e32, e64 and the
                                  energy table (default set-v1)
  --params N                      distinct canonical params per family (default 1)
  --no-pairs                      skip the synergy matrix
  --calibrate                     calibrate families here even when a shipped table exists
  --json FILE / --markdown FILE   also write the report
```

The text table goes to stdout and progress to stderr. Timing:
- a pool of 12 rules on 4×4 takes about 1.5–2 minutes with the default budget (about 2 s per rule and 1 s per pair);
- a pool of 21 takes about 4 minutes;
- `--budget quick` halves it.

### Measuring a rule that is not a family yet

Write the rule as a card body in an ES module:

```js
// rules.mjs
export const rules = [
  { id: "count_sevens",
    utility: function utility(grid) {          // or the same as a source string
      let points = 0;
      for (const cell of grid.cells) if (cell.value === 7) points += 1;
      return points;                            // a number, or a list of numbers (lexicographic, bigger is better)
    },
    top: 16 },                                  // optional: the best ordinal, when known
];
```

`utility` is compiled with the room's real prelude, exactly like a TypeScript card. It can use `grid.cells`,
`grid.rows`, `grid.columns`, `cell.value`, `cell.colour`, `cell.surrounding`, and so on. It is calibrated on the spot,
its card bits are measured from this source, and it is then measured like any family.

To measure candidates beside the number-only families:

```
pnpm --filter @workspace/game-utilities difficulty --setup first-steps --numbers-only --moves symbol --adhoc rules.mjs
pnpm --filter @workspace/game-utilities difficulty --only-adhoc --adhoc rules.mjs --moves symbol         # a candidate set alone
```

Once the single-colour Grid exists, pass `--shape "Grid(4,base10,<mono id>)"`. The colour layer then has one value, so
`--moves cell` and `--moves symbol` coincide. Families without a shipped table for that shape are calibrated on the
spot.

## 4. Reading the table

Read the columns in this order:

1. **`DIFF`**. Is a one-cell greedy agent enough?
   - 0: yes; the rule's algorithm is "improve any cell".
   - 10–25: greedy gets most of the way but stalls. `esc2` = 1 says a two-cell move gets out.
   - Above 30: the rule needs a plan.
2. **`rate4`**. How fast does that agent earn? This is the balance column. Rules in one pool should be within a factor
   of about 1.5.
3. **`K`**. How much must the agent read to judge a change? 0–2 is "the cell and its partner", 5 or more is "a
   neighbourhood and its knock-on effects", 15 is "the whole board".
4. **`SYN`** and the matrix. How much joint value does a considerate pair of simple agents lose?
   - A low pair value with a ceiling near 1: easy and compatible.
   - A high value with a ceiling near 1: compatible, but the joint board needs design (for example "put the 7s in
     mirrored pairs").
   - A high value with a low ceiling: the rules trade off.
5. **`card`**. How much is there to understand?

## 5. Thresholds for a symmetric beginner pool

`SYMMETRIC_POOL` in the library holds these thresholds, and the command line checks every run against them. Each is set
from where the current families fall (§6).

| Threshold | Value | Why |
|---|---|---|
| `DIFF` per rule | ≤ 10 | 12 of the 21 number-only families score 0, and go_fish_books scores 9. Everything above 10 had greedy stall on a quarter of the top or more. |
| `K` per rule | ≤ 3.5 | All greedy-solvable families have K ≤ 3.5. honest_minesweeper (5.3) and whole-board aggregates (parity, 15) need more reading than a beginner should. |
| card bits per rule | ≤ 800 | The simplest families sit at 300–650. The longest (straight_shooter, pinwheel, chessmaster, set_spotter) are 1000–1300. |
| `rate4` max/min | ≤ 1.6 | This is the climb imbalance the balance study measured. The Annotated basics families span 2.6×, and the bottom of its win shares is the bottom of `rate4`. |
| card bits max/min | ≤ 2.5 | Comparable to read. |
| per-rule `SYN` spread | ≤ 15 points | No rule much harder to combine than the rest. The number-only families span 39–67. |
| `SYN` per pair | ≤ 75 | Number-only rules all compete for the same digits, so most pairs are 40–70. Above 75, a pair is mostly lost unless both players plan. |
| ceiling per pair | ≥ 0.5 | Some board gives both rules at least half their top on the geometric mean. |
| dominated rules | none | No rule is both slower and harder than another. |
| uniform-board maximum | at most 1 rule per pool | A rule an agent can top by filling the board with one digit is degenerate, and several such rules converge on the same board. |
| `g10`, `g20` | within ±25% of the pool median | These are the bits greedy holds after 10 and 20 moves, which the brainstorm's all-greedy games found to track win share. |

**Can existing families pass?** No 8-rule set of existing number-only families passes all the thresholds (§6.2, checked
exhaustively over every 8-subset of the 10 families that pass the per-rule thresholds).
- The closest sets fail on two things at once:
  - the climb ratio (2.2: bingo_caller climbs at 1.6 bits a move, full_house at 3.4);
  - two pairs (for example mirrormancer × stepping_stones, best joint board 0.49).
- Their per-rule SYN spread is 25 points, against the threshold of 15.
- Number-only rules all compete for the same 16 digits, which is why their SYN is high and uneven. The brainstormed
  rules are needed.

These are proposals. Tighten them once the brainstormed beginner rules are measured. `DIFF ≤ 10`, `rate4` within 1.6×
and the synergy spread are the three that carry the owner's "comparably simple" ask.

## 6. Measured tables

Shared settings: Grid(4,base10,rgb), default budget, shipped tables for every family. Ad-hoc example rules are
calibrated on the spot. The text output is the same as the Markdown below; regenerate with `--markdown`.

The tables:
- §6.1, Annotated basics: the full pool with full moves, plus the three example ad-hoc rules.
- §6.2, number-only families of First steps: measured on symbols only, with the pair matrix.
- §6.3, every First steps family: per rule, full moves.
- §6.4, energy: the beginner eight under the five cost models, and the beginner stand-ins under `set-v1` and
  `distance-v1`, both agents.

### 6.1 Annotated basics (full moves) plus the example ad-hoc rules

Grid(4,base10,rgb), moves: cell, budget: default

| rule | reads | card | top | rate4 | rate8 | reach16 | to90 | plat | trap | esc2 | gap | K | **DIFF** | **SYN** | confl |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| magic_accountant | numbers | 427 | 16.3 | 3.25 | 1.89 | 1.00 | 4 | 0.00 | 0.00 | – | 0.00 | 2.3 | **0.0** | **41.6** | 0.34 |
| mirrormancer | numbers | 626 | 26.6 | 3.25 | 3.14 | 1.00 | 7 | 0.00 | 0.00 | – | 0.00 | 1.0 | **0.0** | **35.1** | 0.24 |
| colour_mirror | colours | 627 | 12.7 | 1.92 | 1.42 | 1.00 | 5 | 0.00 | 0.00 | – | 0.00 | 1.0 | **0.0** | **24.5** | 0.17 |
| count_sevens | numbers | 178 | 50.8 | 1.80 | 2.45 | 1.00 | 14 | 0.00 | 0.00 | – | 0.00 | 0.0 | **0.0** | **41.1** | 0.19 |
| parity_painter | colours | 483 | 25.4 | 1.39 | 1.91 | 1.00 | 10 | 0.00 | 0.00 | – | 0.00 | 0.0 | **0.0** | **36.7** | 0.32 |
| kingdom | colours | 409 | 25.2 | 1.26 | 1.47 | 1.00 | 12 | 0.00 | 0.00 | – | 0.00 | 1.1 | **0.0** | **29.8** | 0.16 |
| even_total | numbers | 198 | 1.0 | 0.17 | 0.08 | 1.00 | 1 | 0.52 | 0.00 | – | 0.00 | 15.0 | **0.0** | **28.7** | 0.24 |
| picture_frame | colours | 640 | 61.8 | 1.91 | 2.14 | 0.67 | 20 | 0.00 | 0.00 | – | 0.02 | 0.0 | **1.2** | **50.9** | 0.21 |
| row_climbers | numbers | 361 | 35.9 | 2.72 | 3.24 | 0.89 | 10 | 0.00 | 0.11 | 1.00 | 0.11 | 1.6 | **11.2** | **47.1** | 0.22 |
| chessmaster | colours | 1018 | 25.1 | 2.18 | 2.21 | 0.83 | 10 | 0.00 | 0.17 | 0.67 | 0.10 | 0.9 | **13.5** | **37.0** | 0.18 |
| number_bonds | numbers | 365 | 49.9 | 2.97 | 3.17 | 0.74 | ∞ | 0.00 | 0.26 | 1.00 | 0.19 | 2.1 | **22.4** | **43.9** | 0.25 |
| honest_minesweeper | colours | 432 | 39.1 | 2.52 | 1.96 | 0.46 | ∞ | 0.00 | 0.54 | 0.33 | 0.13 | 5.3 | **33.3** | **59.7** | 0.27 |
| colour_bonds | colours | 440 | 78.1 | 2.66 | 2.89 | 0.39 | ∞ | 0.00 | 0.61 | 1.00 | 0.30 | 1.4 | **45.6** | **61.8** | 0.20 |
| set_spotter | colours | 1294 | 69.2 | 3.25 | 2.38 | 0.31 | ∞ | 0.00 | 0.69 | 0.67 | 0.37 | 2.4 | **52.9** | **56.6** | 0.29 |

Synergy difficulty SYN per pair (100 × (1 − considerate)); the joint ceiling found is in brackets.

| | `parity_painter` | `mirrormancer` | `picture_frame` | `colour_mirror` | `chessmaster` | `number_bonds` | `magic_accountant` | `colour_bonds` | `kingdom` | `honest_minesweeper` | `set_spotter` | `count_sevens` | `even_total` | `row_climbers` |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| `parity_painter` | · | 14 (1.0) | 33 (1.0) | 54 (1.0) | 41 (0.9) | 31 (1.0) | 0 (1.0) | 57 (0.8) | 61 (1.0) | 55 (0.7) | 67 (0.8) | 36 (1.0) | 0 (1.0) | 28 (1.0) |
| `mirrormancer` | 14 (1.0) | · | 42 (1.0) | 0 (1.0) | 9 (1.0) | 33 (0.9) | 58 (0.6) | 59 (0.8) | 0 (1.0) | 46 (0.8) | 51 (0.8) | 48 (1.0) | 32 (1.0) | 66 (0.5) |
| `picture_frame` | 33 (1.0) | 42 (1.0) | · | 21 (1.0) | 52 (0.6) | 71 (0.4) | 56 (0.7) | 72 (0.4) | 27 (0.9) | 65 (0.6) | 73 (0.7) | 58 (0.4) | 42 (1.0) | 50 (0.6) |
| `colour_mirror` | 54 (1.0) | 0 (1.0) | 21 (1.0) | · | 40 (0.9) | 15 (1.0) | 0 (1.0) | 38 (0.8) | 44 (1.0) | 57 (0.8) | 43 (0.8) | 0 (1.0) | 0 (1.0) | 7 (1.0) |
| `chessmaster` | 41 (0.9) | 9 (1.0) | 52 (0.6) | 40 (0.9) | · | 23 (1.0) | 9 (1.0) | 74 (0.3) | 71 (0.3) | 57 (0.7) | 70 (0.6) | 9 (1.0) | 9 (1.0) | 16 (1.0) |
| `number_bonds` | 31 (1.0) | 33 (0.9) | 71 (0.4) | 15 (1.0) | 23 (1.0) | · | 63 (0.7) | 33 (1.0) | 15 (1.0) | 69 (0.6) | 51 (1.0) | 59 (0.6) | 35 (1.0) | 74 (0.4) |
| `magic_accountant` | 0 (1.0) | 58 (0.6) | 56 (0.7) | 0 (1.0) | 9 (1.0) | 63 (0.7) | · | 72 (0.6) | 0 (1.0) | 53 (0.8) | 69 (0.6) | 74 (0.5) | 17 (1.0) | 70 (0.7) |
| `colour_bonds` | 57 (0.8) | 59 (0.8) | 72 (0.4) | 38 (0.8) | 74 (0.3) | 33 (1.0) | 72 (0.6) | · | 47 (1.0) | 76 (0.4) | 79 (0.5) | 64 (0.6) | 59 (0.8) | 73 (0.4) |
| `kingdom` | 61 (1.0) | 0 (1.0) | 27 (0.9) | 44 (1.0) | 71 (0.3) | 15 (1.0) | 0 (1.0) | 47 (1.0) | · | 74 (0.5) | 41 (1.0) | 0 (1.0) | 0 (1.0) | 7 (1.0) |
| `honest_minesweeper` | 55 (0.7) | 46 (0.8) | 65 (0.6) | 57 (0.8) | 57 (0.7) | 69 (0.6) | 53 (0.8) | 76 (0.4) | 74 (0.5) | · | 71 (0.5) | 64 (0.6) | 38 (0.8) | 52 (0.7) |
| `set_spotter` | 67 (0.8) | 51 (0.8) | 73 (0.7) | 43 (0.8) | 70 (0.6) | 51 (1.0) | 69 (0.6) | 79 (0.5) | 41 (1.0) | 71 (0.5) | · | 15 (1.0) | 55 (0.7) | 51 (1.0) |
| `count_sevens` | 36 (1.0) | 48 (1.0) | 58 (0.4) | 0 (1.0) | 9 (1.0) | 59 (0.6) | 74 (0.5) | 64 (0.6) | 0 (1.0) | 64 (0.6) | 15 (1.0) | · | 36 (1.0) | 71 (0.4) |
| `even_total` | 0 (1.0) | 32 (1.0) | 42 (1.0) | 0 (1.0) | 9 (1.0) | 35 (1.0) | 17 (1.0) | 59 (0.8) | 0 (1.0) | 38 (0.8) | 55 (0.7) | 36 (1.0) | · | 49 (1.0) |
| `row_climbers` | 28 (1.0) | 66 (0.5) | 50 (0.6) | 7 (1.0) | 16 (1.0) | 74 (0.4) | 70 (0.7) | 73 (0.4) | 7 (1.0) | 52 (0.7) | 51 (1.0) | 71 (0.4) | 49 (1.0) | · |

Pool: rate4 max/min 19.25 (CV 0.39); reach16 max/min 3.22; card max/min 7.26; DIFF max 52.9, spread 52.9; worst pair colour_bonds × set_spotter (79.5); lowest ceiling 0.35; dominated: chessmaster, honest_minesweeper.

Symmetric beginner pool thresholds: fails 30 (chessmaster: DIFF 13.48 > 10 (greedy is trapped or a cleverer search earns more); chessmaster: card 1018.38 bits > 800; number_bonds: DIFF 22.37 > 10 (greedy is trapped or a cleverer search earns more); colour_bonds: DIFF 45.55 > 10 (greedy is trapped or a cleverer search earns more); honest_minesweeper: DIFF 33.31 > 10 (greedy is trapped or a cleverer search earns more); honest_minesweeper: K 5.25 > 3.5 (a move's effect depends on too many cells); …).

### 6.2 Number-only families of First steps (symbol moves)

The score of these families ignores colour (measured), so they are the candidates for a single-colour beginner set.

Grid(4,base10,rgb), moves: symbol, budget: default

| rule | reads | card | top | rate4 | rate8 | reach16 | to90 | plat | trap | esc2 | gap | K | **DIFF** | **SYN** | confl |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| full_house | numbers | 436 | 39.9 | 3.44 | 3.65 | 1.00 | 10 | 0.00 | 0.00 | – | 0.00 | 1.4 | **0.0** | **49.6** | 0.37 |
| magic_accountant | numbers | 427 | 16.3 | 3.25 | 1.89 | 1.00 | 4 | 0.00 | 0.00 | – | 0.00 | 2.3 | **0.0** | **60.5** | 0.55 |
| mirrormancer | numbers | 626 | 26.6 | 3.25 | 3.14 | 1.00 | 7 | 0.00 | 0.00 | – | 0.00 | 1.0 | **0.0** | **45.6** | 0.36 |
| column_addition | numbers | 1064 | 13.3 | 3.22 | 1.61 | 1.00 | 4 | 0.00 | 0.00 | – | 0.00 | 3.5 | **0.0** | **43.5** | 0.42 |
| seesaw | numbers | 775 | 15.6 | 3.22 | 1.72 | 1.00 | 4 | 0.00 | 0.00 | – | 0.00 | 2.5 | **0.0** | **56.7** | 0.53 |
| divisibility_detective | numbers | 361 | 12.7 | 2.91 | 1.46 | 1.00 | 4 | 0.00 | 0.00 | – | 0.00 | 3.0 | **0.0** | **57.7** | 0.49 |
| round_numbers | numbers | 549 | 13.3 | 2.77 | 1.39 | 1.00 | 4 | 0.00 | 0.00 | – | 0.00 | 3.0 | **0.0** | **67.1** | 0.67 |
| looking_glass | numbers | 680 | 26.5 | 2.73 | 3.13 | 1.00 | 7 | 0.00 | 0.00 | – | 0.00 | 1.0 | **0.0** | **46.9** | 0.36 |
| stepping_stones | numbers | 395 | 33.9 | 2.49 | 2.65 | 1.00 | 11 | 0.00 | 0.00 | – | 0.00 | 2.7 | **0.0** | **58.4** | 0.34 |
| pinwheel | numbers | 1268 | 40.0 | 2.32 | 3.35 | 1.00 | 10 | 0.00 | 0.00 | – | 0.00 | 1.7 | **0.0** | **55.4** | 0.34 |
| constellation | numbers | 761 | 55.2 | 1.97 | 2.36 | 1.00 | 15 | 0.00 | 0.00 | – | 0.00 | 1.5 | **0.0** | **59.2** | 0.26 |
| bingo_caller | numbers | 599 | 21.2 | 1.57 | 1.84 | 1.00 | 10 | 0.00 | 0.00 | – | 0.00 | 0.0 | **0.0** | **39.1** | 0.33 |
| go_fish_books | numbers | 807 | 62.3 | 3.18 | 3.17 | 0.81 | ∞ | 0.00 | 0.19 | 0.00 | 0.00 | 0.0 | **9.4** | **59.7** | 0.25 |
| twenty_one | numbers | 409 | 28.2 | 4.01 | 2.76 | 0.83 | 8 | 0.00 | 0.17 | 0.33 | 0.17 | 3.1 | **17.5** | **63.4** | 0.50 |
| staircase_climber | numbers | 294 | 41.9 | 2.63 | 3.20 | 0.74 | ∞ | 0.00 | 0.26 | 0.33 | 0.23 | 1.4 | **24.5** | **60.2** | 0.34 |
| number_bonds | numbers | 365 | 49.9 | 2.97 | 3.17 | 0.74 | ∞ | 0.00 | 0.26 | 1.00 | 0.24 | 2.1 | **24.6** | **60.9** | 0.44 |
| young_tableau | numbers | 629 | 38.9 | 3.21 | 2.45 | 0.61 | ∞ | 0.00 | 0.39 | 1.00 | 0.21 | 1.4 | **30.0** | **61.7** | 0.44 |
| mountain_climb | numbers | 823 | 25.6 | 3.02 | 1.83 | 0.60 | ∞ | 0.00 | 0.40 | 0.00 | 0.23 | 2.9 | **31.8** | **56.8** | 0.35 |
| snap | numbers | 322 | 52.0 | 3.07 | 3.11 | 0.64 | ∞ | 0.00 | 0.36 | 1.00 | 0.35 | 2.1 | **35.4** | **52.1** | 0.43 |
| straight_shooter | numbers | 1288 | 72.5 | 3.20 | 2.90 | 0.46 | ∞ | 0.00 | 0.54 | 1.00 | 0.19 | 1.4 | **36.1** | **67.0** | 0.37 |
| fillomino | numbers | 350 | 37.2 | 2.68 | 1.93 | 0.43 | ∞ | 0.00 | 0.57 | 0.67 | 0.34 | 4.0 | **45.5** | **64.7** | 0.46 |

Synergy difficulty SYN per pair (100 × (1 − considerate)); the joint ceiling found is in brackets.

| | `mirrormancer` | `staircase_climber` | `looking_glass` | `pinwheel` | `constellation` | `mountain_climb` | `straight_shooter` | `number_bonds` | `magic_accountant` | `round_numbers` | `divisibility_detective` | `seesaw` | `stepping_stones` | `column_addition` | `snap` | `young_tableau` | `fillomino` | `bingo_caller` | `full_house` | `twenty_one` | `go_fish_books` |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| `mirrormancer` | · | 69 (0.4) | 0 (1.0) | 42 (1.0) | 53 (1.0) | 56 (0.8) | 63 (0.5) | 33 (0.9) | 58 (0.6) | 51 (0.8) | 48 (0.7) | 27 (1.0) | 62 (0.5) | 9 (1.0) | 42 (1.0) | 67 (0.7) | 69 (0.6) | 35 (1.0) | 12 (1.0) | 62 (0.7) | 54 (1.0) |
| `staircase_climber` | 69 (0.4) | · | 63 (0.4) | 65 (0.5) | 72 (0.4) | 46 (0.8) | 40 (0.8) | 78 (0.4) | 59 (0.6) | 67 (0.8) | 65 (0.7) | 67 (0.7) | 72 (0.3) | 42 (0.8) | 67 (0.6) | 24 (1.0) | 64 (0.5) | 32 (1.0) | 74 (0.3) | 63 (0.6) | 76 (0.4) |
| `looking_glass` | 0 (1.0) | 63 (0.4) | · | 47 (1.0) | 53 (1.0) | 58 (0.8) | 63 (0.5) | 36 (0.9) | 60 (0.6) | 53 (0.9) | 46 (0.8) | 34 (1.0) | 63 (0.5) | 6 (1.0) | 45 (1.0) | 64 (0.7) | 75 (0.7) | 37 (1.0) | 18 (1.0) | 64 (0.7) | 54 (1.0) |
| `pinwheel` | 42 (1.0) | 65 (0.5) | 47 (1.0) | · | 42 (1.0) | 58 (0.6) | 76 (0.4) | 52 (1.0) | 65 (0.8) | 70 (0.9) | 62 (0.7) | 68 (0.8) | 65 (0.5) | 56 (0.7) | 23 (1.0) | 76 (0.4) | 71 (0.8) | 9 (1.0) | 47 (1.0) | 68 (1.0) | 46 (1.0) |
| `constellation` | 53 (1.0) | 72 (0.4) | 53 (1.0) | 42 (1.0) | · | 64 (0.5) | 85 (0.3) | 86 (0.3) | 72 (0.5) | 85 (1.0) | 67 (1.0) | 87 (1.0) | 68 (0.5) | 44 (0.9) | 0 (1.0) | 78 (0.4) | 83 (0.3) | 0 (1.0) | 57 (1.0) | 80 (0.5) | 10 (1.0) |
| `mountain_climb` | 56 (0.8) | 46 (0.8) | 58 (0.8) | 58 (0.6) | 64 (0.5) | · | 47 (0.7) | 69 (0.5) | 54 (0.8) | 73 (1.0) | 40 (0.8) | 52 (0.8) | 57 (0.5) | 46 (0.9) | 69 (0.5) | 44 (0.9) | 73 (0.6) | 60 (0.7) | 54 (0.7) | 63 (0.6) | 53 (0.5) |
| `straight_shooter` | 63 (0.5) | 40 (0.8) | 63 (0.5) | 76 (0.4) | 85 (0.3) | 47 (0.7) | · | 82 (0.3) | 68 (0.6) | 77 (0.7) | 68 (0.7) | 69 (0.6) | 77 (0.3) | 63 (0.6) | 76 (0.3) | 39 (0.8) | 71 (0.4) | 49 (0.6) | 68 (0.6) | 75 (0.4) | 84 (0.3) |
| `number_bonds` | 33 (0.9) | 78 (0.4) | 36 (0.9) | 52 (1.0) | 86 (0.3) | 69 (0.5) | 82 (0.3) | · | 63 (0.7) | 62 (1.0) | 57 (0.8) | 54 (1.0) | 34 (1.0) | 45 (0.8) | 58 (1.0) | 71 (0.4) | 67 (0.5) | 69 (0.4) | 51 (1.0) | 70 (0.6) | 81 (0.3) |
| `magic_accountant` | 58 (0.6) | 59 (0.6) | 60 (0.6) | 65 (0.8) | 72 (0.5) | 54 (0.8) | 68 (0.6) | 63 (0.7) | · | 85 (0.4) | 62 (0.4) | 55 (0.6) | 67 (0.7) | 32 (0.9) | 68 (0.6) | 69 (0.7) | 54 (0.7) | 55 (0.7) | 66 (0.6) | 23 (1.0) | 75 (0.6) |
| `round_numbers` | 51 (0.8) | 67 (0.8) | 53 (0.9) | 70 (0.9) | 85 (1.0) | 73 (1.0) | 77 (0.7) | 62 (1.0) | 85 (0.4) | · | 71 (0.6) | 34 (0.9) | 70 (0.8) | 54 (1.0) | 70 (0.8) | 71 (0.8) | 61 (0.7) | 70 (0.9) | 63 (0.7) | 70 (0.6) | 84 (1.0) |
| `divisibility_detective` | 48 (0.7) | 65 (0.7) | 46 (0.8) | 62 (0.7) | 67 (1.0) | 40 (0.8) | 68 (0.7) | 57 (0.8) | 62 (0.4) | 71 (0.6) | · | 38 (0.7) | 68 (0.7) | 45 (1.0) | 65 (0.8) | 64 (0.8) | 50 (0.6) | 52 (0.9) | 60 (0.8) | 55 (0.6) | 70 (1.0) |
| `seesaw` | 27 (1.0) | 67 (0.7) | 34 (1.0) | 68 (0.8) | 87 (1.0) | 52 (0.8) | 69 (0.6) | 54 (1.0) | 55 (0.6) | 34 (0.9) | 38 (0.7) | · | 70 (1.0) | 37 (1.0) | 68 (1.0) | 63 (0.7) | 56 (0.6) | 64 (1.0) | 45 (1.0) | 65 (0.7) | 80 (1.0) |
| `stepping_stones` | 62 (0.5) | 72 (0.3) | 63 (0.5) | 65 (0.5) | 68 (0.5) | 57 (0.5) | 77 (0.3) | 34 (1.0) | 67 (0.7) | 70 (0.8) | 68 (0.7) | 70 (1.0) | · | 43 (0.9) | 63 (0.5) | 36 (0.8) | 66 (0.6) | 0 (1.0) | 59 (0.5) | 60 (0.7) | 68 (0.5) |
| `column_addition` | 9 (1.0) | 42 (0.8) | 6 (1.0) | 56 (0.7) | 44 (0.9) | 46 (0.9) | 63 (0.6) | 45 (0.8) | 32 (0.9) | 54 (1.0) | 45 (1.0) | 37 (1.0) | 43 (0.9) | · | 60 (0.8) | 42 (0.9) | 59 (0.7) | 32 (1.0) | 40 (1.0) | 51 (0.8) | 62 (0.9) |
| `snap` | 42 (1.0) | 67 (0.6) | 45 (1.0) | 23 (1.0) | 0 (1.0) | 69 (0.5) | 76 (0.3) | 58 (1.0) | 68 (0.6) | 70 (0.8) | 65 (0.8) | 68 (1.0) | 63 (0.5) | 60 (0.8) | · | 76 (0.4) | 68 (0.6) | 20 (1.0) | 22 (1.0) | 72 (0.7) | 10 (1.0) |
| `young_tableau` | 67 (0.7) | 24 (1.0) | 64 (0.7) | 76 (0.4) | 78 (0.4) | 44 (0.9) | 39 (0.8) | 71 (0.4) | 69 (0.7) | 71 (0.8) | 64 (0.8) | 63 (0.7) | 36 (0.8) | 42 (0.9) | 76 (0.4) | · | 71 (0.5) | 59 (0.6) | 68 (0.6) | 68 (0.6) | 81 (0.3) |
| `fillomino` | 69 (0.6) | 64 (0.5) | 75 (0.7) | 71 (0.8) | 83 (0.3) | 73 (0.6) | 71 (0.4) | 67 (0.5) | 54 (0.7) | 61 (0.7) | 50 (0.6) | 56 (0.6) | 66 (0.6) | 59 (0.7) | 68 (0.6) | 71 (0.5) | · | 37 (0.9) | 62 (0.7) | 58 (0.6) | 77 (0.3) |
| `bingo_caller` | 35 (1.0) | 32 (1.0) | 37 (1.0) | 9 (1.0) | 0 (1.0) | 60 (0.7) | 49 (0.6) | 69 (0.4) | 55 (0.7) | 70 (0.9) | 52 (0.9) | 64 (1.0) | 0 (1.0) | 32 (1.0) | 20 (1.0) | 59 (0.6) | 37 (0.9) | · | 26 (1.0) | 64 (0.6) | 10 (1.0) |
| `full_house` | 12 (1.0) | 74 (0.3) | 18 (1.0) | 47 (1.0) | 57 (1.0) | 54 (0.7) | 68 (0.6) | 51 (1.0) | 66 (0.6) | 63 (0.7) | 60 (0.8) | 45 (1.0) | 59 (0.5) | 40 (1.0) | 22 (1.0) | 68 (0.6) | 62 (0.7) | 26 (1.0) | · | 61 (0.6) | 41 (1.0) |
| `twenty_one` | 62 (0.7) | 63 (0.6) | 64 (0.7) | 68 (1.0) | 80 (0.5) | 63 (0.6) | 75 (0.4) | 70 (0.6) | 23 (1.0) | 70 (0.6) | 55 (0.6) | 65 (0.7) | 60 (0.7) | 51 (0.8) | 72 (0.7) | 68 (0.6) | 58 (0.6) | 64 (0.6) | 61 (0.6) | · | 78 (0.4) |
| `go_fish_books` | 54 (1.0) | 76 (0.4) | 54 (1.0) | 46 (1.0) | 10 (1.0) | 53 (0.5) | 84 (0.3) | 81 (0.3) | 75 (0.6) | 84 (1.0) | 70 (1.0) | 80 (1.0) | 68 (0.5) | 62 (0.9) | 10 (1.0) | 81 (0.3) | 77 (0.3) | 10 (1.0) | 41 (1.0) | 78 (0.4) | · |

Pool: rate4 max/min 2.55 (CV 0.18); reach16 max/min 2.34; card max/min 4.38; DIFF max 45.5, spread 45.5; worst pair constellation × seesaw (87.1); lowest ceiling 0.28; dominated: staircase_climber, mountain_climb, straight_shooter, snap, fillomino.

Symmetric beginner pool thresholds: fails 85 (staircase_climber: DIFF 24.48 > 10 (greedy is trapped or a cleverer search earns more); pinwheel: card 1268.21 bits > 800; mountain_climb: DIFF 31.84 > 10 (greedy is trapped or a cleverer search earns more); mountain_climb: card 822.67 bits > 800; straight_shooter: DIFF 36.15 > 10 (greedy is trapped or a cleverer search earns more); straight_shooter: card 1287.67 bits > 800; …).

### 6.3 Every First steps family (full moves, per rule)

Grid(4,base10,rgb), moves: cell, budget: default

| rule | reads | card | top | rate4 | rate8 | reach16 | to90 | plat | trap | esc2 | gap | K | **DIFF** | **SYN** | confl |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| full_house | numbers | 436 | 39.9 | 3.44 | 3.65 | 1.00 | 10 | 0.00 | 0.00 | – | 0.00 | 1.4 | **0.0** | **–** | – |
| magic_accountant | numbers | 427 | 16.3 | 3.25 | 1.89 | 1.00 | 4 | 0.00 | 0.00 | – | 0.00 | 2.3 | **0.0** | **–** | – |
| mirrormancer | numbers | 626 | 26.6 | 3.25 | 3.14 | 1.00 | 7 | 0.00 | 0.00 | – | 0.00 | 1.0 | **0.0** | **–** | – |
| column_addition | numbers | 1064 | 13.3 | 3.22 | 1.61 | 1.00 | 4 | 0.00 | 0.00 | – | 0.00 | 3.5 | **0.0** | **–** | – |
| seesaw | numbers | 775 | 15.6 | 3.22 | 1.72 | 1.00 | 4 | 0.00 | 0.00 | – | 0.00 | 2.5 | **0.0** | **–** | – |
| uno_snake | colours | 879 | 19.8 | 2.99 | 2.28 | 1.00 | 6 | 0.00 | 0.00 | – | 0.00 | 4.2 | **0.0** | **–** | – |
| divisibility_detective | numbers | 361 | 12.7 | 2.91 | 1.46 | 1.00 | 4 | 0.00 | 0.00 | – | 0.00 | 3.0 | **0.0** | **–** | – |
| colour_seesaw | colours | 808 | 16.0 | 2.78 | 1.88 | 1.00 | 5 | 0.00 | 0.00 | – | 0.00 | 2.2 | **0.0** | **–** | – |
| round_numbers | numbers | 549 | 13.3 | 2.77 | 1.39 | 1.00 | 4 | 0.00 | 0.00 | – | 0.00 | 3.0 | **0.0** | **–** | – |
| looking_glass | numbers | 680 | 26.5 | 2.73 | 3.13 | 1.00 | 7 | 0.00 | 0.00 | – | 0.00 | 1.0 | **0.0** | **–** | – |
| stepping_stones | numbers | 395 | 33.9 | 2.49 | 2.65 | 1.00 | 11 | 0.00 | 0.00 | – | 0.00 | 2.7 | **0.0** | **–** | – |
| seed3_green_ones | colours | 431 | 78.5 | 2.41 | 2.49 | 0.53 | 25 | 0.00 | 0.00 | – | 0.00 | 0.0 | **0.0** | **–** | – |
| lucky_token | colours | 438 | 78.5 | 2.41 | 2.49 | 0.53 | 25 | 0.00 | 0.00 | – | 0.00 | 0.0 | **0.0** | **–** | – |
| rooks_watch | colours | 729 | 17.5 | 2.41 | 1.71 | 1.00 | 8 | 0.00 | 0.00 | – | 0.00 | 1.2 | **0.0** | **–** | – |
| pinwheel | numbers | 1268 | 40.0 | 2.32 | 3.35 | 1.00 | 10 | 0.00 | 0.00 | – | 0.00 | 1.7 | **0.0** | **–** | – |
| far_apart | colours | 1230 | 23.2 | 2.22 | 2.08 | 1.00 | 10 | 0.00 | 0.00 | – | 0.00 | 3.8 | **0.0** | **–** | – |
| colour_pinwheel | colours | 1268 | 18.6 | 2.21 | 2.24 | 1.00 | 7 | 0.00 | 0.00 | – | 0.00 | 0.8 | **0.0** | **–** | – |
| constellation | numbers | 761 | 55.2 | 1.97 | 2.36 | 1.00 | 15 | 0.00 | 0.00 | – | 0.00 | 1.5 | **0.0** | **–** | – |
| colour_mirror | colours | 627 | 12.7 | 1.92 | 1.42 | 1.00 | 5 | 0.00 | 0.00 | – | 0.00 | 1.0 | **0.0** | **–** | – |
| connect_four | colours | 1189 | 25.4 | 1.75 | 1.87 | 1.00 | 11 | 0.00 | 0.00 | – | 0.00 | 0.9 | **0.0** | **–** | – |
| mirror_quilt | colours | 680 | 12.7 | 1.73 | 1.43 | 1.00 | 5 | 0.00 | 0.00 | – | 0.00 | 1.0 | **0.0** | **–** | – |
| wallpaper_weaver | colours | 441 | 12.7 | 1.61 | 1.45 | 1.00 | 6 | 0.00 | 0.00 | – | 0.00 | 1.0 | **0.0** | **–** | – |
| gravity | colours | 283 | 25.4 | 1.59 | 1.73 | 1.00 | 12 | 0.00 | 0.00 | – | 0.00 | 1.1 | **0.0** | **–** | – |
| bingo_caller | numbers | 599 | 21.2 | 1.57 | 1.84 | 1.00 | 10 | 0.00 | 0.00 | – | 0.00 | 0.0 | **0.0** | **–** | – |
| number_painter | colours | 296 | 53.2 | 1.52 | 2.25 | 1.00 | 14 | 0.00 | 0.00 | – | 0.00 | 0.0 | **0.0** | **–** | – |
| rainbow_bands | colours | 884 | 26.2 | 1.51 | 1.81 | 1.00 | 12 | 0.00 | 0.00 | – | 0.00 | 0.0 | **0.0** | **–** | – |
| flag_bearer | colours | 774 | 25.4 | 1.42 | 1.52 | 1.00 | 12 | 0.00 | 0.00 | – | 0.00 | 0.3 | **0.0** | **–** | – |
| parity_painter | colours | 483 | 25.4 | 1.39 | 1.91 | 1.00 | 10 | 0.00 | 0.00 | – | 0.00 | 0.0 | **0.0** | **–** | – |
| kingdom | colours | 409 | 25.2 | 1.26 | 1.47 | 1.00 | 12 | 0.00 | 0.00 | – | 0.00 | 1.1 | **0.0** | **–** | – |
| head_count | colours | 317 | 25.4 | 1.12 | 1.68 | 1.00 | 12 | 0.00 | 0.00 | – | 0.00 | 0.0 | **0.0** | **–** | – |
| homebody | colours | 282 | 21.4 | 1.08 | 1.90 | 1.00 | 9 | 0.00 | 0.00 | – | 0.00 | 0.0 | **0.0** | **–** | – |
| treasure_castle | colours | 800 | 25.9 | 1.01 | 1.74 | 1.00 | 11 | 0.00 | 0.00 | – | 0.00 | 0.7 | **0.0** | **–** | – |
| colour_by_number | colours | 358 | 25.4 | 1.01 | 1.67 | 1.00 | 10 | 0.00 | 0.00 | – | 0.00 | 0.0 | **0.0** | **–** | – |
| castle_keeper | colours | 714 | 21.8 | 0.96 | 1.80 | 1.00 | 10 | 0.00 | 0.00 | – | 0.00 | 0.4 | **0.0** | **–** | – |
| bullseye | colours | 1379 | 23.0 | 1.80 | 2.53 | 0.99 | 8 | 0.00 | 0.01 | – | 0.00 | 1.9 | **0.3** | **–** | – |
| kings_court | colours | 321 | 69.0 | 2.45 | 2.88 | 0.75 | 19 | 0.00 | 0.04 | 1.00 | 0.02 | 0.6 | **2.8** | **–** | – |
| neighbourhood_vote | colours | 662 | 16.6 | 1.24 | 1.48 | 0.94 | 9 | 0.00 | 0.06 | 1.00 | 0.00 | 1.0 | **3.2** | **–** | – |
| go_fish_books | numbers | 807 | 62.3 | 3.27 | 3.09 | 0.83 | 17 | 0.00 | 0.00 | – | 0.07 | 0.2 | **3.3** | **–** | – |
| seed1_line_painter | colours | 603 | 74.8 | 1.78 | 1.82 | 0.47 | 26 | 0.00 | 0.05 | 0.00 | 0.03 | 0.3 | **4.2** | **–** | – |
| colour_value_ladder | colours | 639 | 24.9 | 2.66 | 2.59 | 0.95 | 9 | 0.00 | 0.05 | 1.00 | 0.03 | 1.3 | **4.3** | **–** | – |
| snake_charmer | colours | 849 | 13.8 | 1.95 | 1.52 | 0.92 | 8 | 0.02 | 0.08 | 0.33 | 0.04 | 6.2 | **6.2** | **–** | – |
| castle_pockets | colours | 893 | 21.9 | 0.95 | 1.64 | 0.91 | 11 | 0.00 | 0.09 | 1.00 | 0.09 | 0.2 | **9.4** | **–** | – |
| stripe_painter | colours | 810 | 20.8 | 2.19 | 2.09 | 0.86 | 7 | 0.00 | 0.14 | 0.00 | 0.05 | 0.9 | **9.5** | **–** | – |
| swiss_cheese | colours | 652 | 22.3 | 0.98 | 1.67 | 0.86 | 11 | 0.00 | 0.14 | 1.00 | 0.05 | 0.3 | **9.6** | **–** | – |
| best_friends | colours | 607 | 24.4 | 1.93 | 2.13 | 0.82 | ∞ | 0.00 | 0.18 | 0.67 | 0.04 | 0.7 | **11.1** | **–** | – |
| chessmaster | colours | 1018 | 25.1 | 2.18 | 2.21 | 0.83 | 10 | 0.00 | 0.17 | 0.67 | 0.10 | 0.9 | **13.5** | **–** | – |
| conqueror | colours | 353 | 78.5 | 1.64 | 1.89 | 0.44 | ∞ | 0.00 | 0.24 | 0.00 | 0.03 | 0.0 | **13.6** | **–** | – |
| twenty_one | numbers | 409 | 28.2 | 4.01 | 2.76 | 0.83 | 8 | 0.00 | 0.17 | 0.33 | 0.15 | 3.1 | **16.2** | **–** | – |
| rainbow_steps | colours | 384 | 19.0 | 2.12 | 1.77 | 0.79 | ∞ | 0.00 | 0.21 | 1.00 | 0.13 | 1.4 | **17.2** | **–** | – |
| treasure_map | colours | 632 | 58.9 | 1.78 | 1.88 | 0.58 | ∞ | 0.00 | 0.27 | 0.00 | 0.10 | 0.0 | **18.2** | **–** | – |
| othello_sandwich | colours | 844 | 15.6 | 1.78 | 1.21 | 0.67 | ∞ | 0.00 | 0.33 | 0.67 | 0.04 | 2.0 | **18.5** | **–** | – |
| rainbow_road | colours | 583 | 19.0 | 2.37 | 1.75 | 0.78 | ∞ | 0.00 | 0.22 | 1.00 | 0.16 | 1.5 | **19.0** | **–** | – |
| feuding_families | colours | 675 | 20.2 | 2.06 | 1.77 | 0.76 | ∞ | 0.00 | 0.24 | 0.00 | 0.15 | 2.5 | **19.6** | **–** | – |
| twin_friends | colours | 758 | 74.0 | 2.49 | 2.81 | 0.63 | ∞ | 0.00 | 0.31 | 1.00 | 0.09 | 1.4 | **20.5** | **–** | – |
| islander | colours | 551 | 23.6 | 2.61 | 1.73 | 0.65 | ∞ | 0.00 | 0.35 | 0.33 | 0.06 | 2.1 | **20.6** | **–** | – |
| staircase_climber | numbers | 294 | 41.9 | 2.63 | 3.20 | 0.74 | ∞ | 0.00 | 0.26 | 0.33 | 0.18 | 1.4 | **21.5** | **–** | – |
| number_bonds | numbers | 365 | 49.9 | 2.97 | 3.17 | 0.74 | ∞ | 0.00 | 0.26 | 1.00 | 0.19 | 2.1 | **22.4** | **–** | – |
| archipelago | colours | 335 | 16.4 | 1.58 | 0.94 | 0.53 | ∞ | 0.02 | 0.47 | 0.33 | 0.00 | 2.5 | **23.6** | **–** | – |
| border_baron | colours | 926 | 15.9 | 2.16 | 1.26 | 0.69 | ∞ | 0.00 | 0.31 | 0.67 | 0.21 | 3.2 | **25.9** | **–** | – |
| young_tableau | numbers | 629 | 38.9 | 3.21 | 2.45 | 0.61 | ∞ | 0.00 | 0.39 | 1.00 | 0.13 | 1.4 | **26.0** | **–** | – |
| snap | numbers | 322 | 52.0 | 3.07 | 3.11 | 0.64 | ∞ | 0.00 | 0.36 | 1.00 | 0.27 | 2.1 | **31.3** | **–** | – |
| straight_shooter | numbers | 1288 | 72.5 | 3.44 | 3.16 | 0.57 | ∞ | 0.00 | 0.41 | 0.67 | 0.22 | 1.6 | **31.4** | **–** | – |
| mountain_climb | numbers | 823 | 25.6 | 3.02 | 1.83 | 0.60 | ∞ | 0.00 | 0.40 | 0.00 | 0.23 | 2.9 | **31.8** | **–** | – |
| sunset_sky | colours | 831 | 19.0 | 1.74 | 1.21 | 0.56 | ∞ | 0.00 | 0.44 | 1.00 | 0.20 | 1.4 | **32.0** | **–** | – |
| honest_minesweeper | colours | 432 | 39.1 | 2.52 | 1.96 | 0.46 | ∞ | 0.00 | 0.54 | 0.33 | 0.13 | 5.3 | **33.3** | **–** | – |
| king_of_the_hill | colours | 346 | 23.9 | 1.80 | 1.00 | 0.36 | ∞ | 0.00 | 0.64 | 0.67 | 0.06 | 2.8 | **35.1** | **–** | – |
| fillomino | numbers | 350 | 37.2 | 2.68 | 1.93 | 0.43 | ∞ | 0.00 | 0.57 | 0.67 | 0.18 | 4.0 | **37.6** | **–** | – |
| s_piece_tamer | colours | 1746 | 12.2 | 0.73 | 0.36 | 0.24 | ∞ | 0.44 | 0.76 | 0.33 | 0.00 | 5.7 | **38.1** | **–** | – |
| l_piece_tamer | colours | 1746 | 11.3 | 0.58 | 0.29 | 0.20 | ∞ | 0.44 | 0.80 | 0.67 | 0.00 | 6.2 | **39.8** | **–** | – |
| t_piece_tamer | colours | 1746 | 16.3 | 0.69 | 0.34 | 0.17 | ∞ | 0.44 | 0.83 | 0.67 | 0.00 | 6.2 | **41.5** | **–** | – |
| flush_royale | colours | 1242 | 70.0 | 2.50 | 1.98 | 0.42 | ∞ | 0.00 | 0.46 | 0.00 | 0.37 | 1.9 | **41.7** | **–** | – |
| i_piece_tamer | colours | 1746 | 13.7 | 0.56 | 0.28 | 0.16 | ∞ | 0.44 | 0.84 | 0.67 | 0.00 | 5.9 | **41.9** | **–** | – |
| seed2_patchwork | colours | 656 | 77.2 | 3.14 | 2.90 | 0.37 | ∞ | 0.00 | 0.63 | 1.00 | 0.21 | 3.9 | **41.9** | **–** | – |
| prime_territory | colours | 639 | 46.1 | 1.67 | 1.29 | 0.24 | ∞ | 0.10 | 0.76 | 0.33 | 0.15 | 1.3 | **45.1** | **–** | – |
| colour_bonds | colours | 440 | 78.1 | 2.66 | 2.89 | 0.39 | ∞ | 0.00 | 0.61 | 1.00 | 0.30 | 1.4 | **45.6** | **–** | – |
| fibonacci_sandwich | colours | 723 | 55.5 | 2.56 | 1.89 | 0.28 | ∞ | 0.02 | 0.72 | 0.67 | 0.27 | 2.3 | **49.4** | **–** | – |
| times_table_territory | colours | 570 | 53.5 | 1.49 | 1.02 | 0.18 | ∞ | 0.06 | 0.82 | 0.00 | 0.17 | 1.6 | **49.6** | **–** | – |
| magic_window | colours | 1944 | 49.2 | 3.33 | 1.92 | 0.32 | ∞ | 0.08 | 0.68 | 1.00 | 0.35 | 3.1 | **51.7** | **–** | – |
| set_spotter | colours | 1294 | 69.2 | 3.25 | 2.38 | 0.31 | ∞ | 0.00 | 0.69 | 0.67 | 0.37 | 2.4 | **52.9** | **–** | – |
| knight_riders | colours | 859 | 77.7 | 2.41 | 2.86 | 0.32 | ∞ | 0.00 | 0.68 | 0.33 | 0.48 | 1.8 | **57.8** | **–** | – |
| rummy_melder | colours | 2239 | 75.2 | 1.88 | 1.39 | 0.19 | ∞ | 0.00 | 0.81 | 0.67 | 0.52 | 1.4 | **66.5** | **–** | – |

Pool: rate4 max/min 7.19 (CV 0.37); reach16 max/min 6.17; card max/min 7.94; DIFF max 66.5, spread 66.5; worst pair – (–); lowest ceiling –; dominated: seed2_patchwork, rainbow_road, border_baron, conqueror, islander, staircase_climber, chessmaster, archipelago, mountain_climb, treasure_map, i_piece_tamer, t_piece_tamer, l_piece_tamer, s_piece_tamer, king_of_the_hill, times_table_territory, snap, fillomino, colour_bonds, fibonacci_sandwich, prime_territory, feuding_families, best_friends, rainbow_steps, sunset_sky, twin_friends, rummy_melder, othello_sandwich, honest_minesweeper, flush_royale, knight_riders.

Symmetric beginner pool thresholds: fails 110 (seed2_patchwork: DIFF 41.95 > 10 (greedy is trapped or a cleverer search earns more); seed2_patchwork: K 3.93 > 3.5 (a move's effect depends on too many cells); rainbow_road: DIFF 18.99 > 10 (greedy is trapped or a cleverer search earns more); border_baron: DIFF 25.90 > 10 (greedy is trapped or a cleverer search earns more); border_baron: card 926.18 bits > 800; conqueror: DIFF 13.64 > 10 (greedy is trapped or a cleverer search earns more); …).

### 6.4 Energy under the five cost models (measured 2026-11-11)

Grid(4,base10,mono), the Annotated basics board (numbers only, so every one-cell move is a digit change), shared start
boards, no pairs. Each cell is the mean bits held after **32 / 64** energy bits. One run per cost model:

```
# the beginner eight (the default setup deals exactly BEGINNER_POOL on this board); N = 16 and 64
# cost models: set-v1, distance-v1, dial-v1, log-v1, multiply-v1
pnpm --filter @workspace/game-utilities difficulty --no-pairs --starts N --cost-model set-v1
# the stand-ins
pnpm --filter @workspace/game-utilities difficulty --no-pairs --starts 16 --cost-model distance-v1 \
  --shape "Grid(4,base10,mono)" --only-adhoc --adhoc lib/game-utilities/scripts/mutation-cost-beginner-rules.mjs
```

What one digit change costs (energy bits, from `moveEnergy`):

| model | ±1 | ±2 | ±3 | ±5 | ±9 | mean of the 90 changes |
|---|--:|--:|--:|--:|--:|--:|
| `set-v1` | 16.3 | 16.3 | 16.3 | 16.3 | 16.3 | 16.3 |
| `distance-v1` | 7.1 | 9.7 | 12.6 | 19.0 | 34.9 | 15.2 |
| `dial-v1` (9 and 0 are one apart) | 7.1 | 9.7 | 12.5 | 18.9 | 7.1 | 12.1 |
| `log-v1` | 7.2 | 10.5 | 12.7 | 15.5 | 19.1 | 12.8 |
| `multiply-v1` | 8.8 | 10.1 to 11.5 | 10.3 to 14.5 | 10.3 to 21.3 | 22.1 to 37.8 | 14.1 |
| `proportional-v1` (a variant: no charge for the cell) | 6.3 | 15.2 | 26.6 | 57.0 | 148.5 | 41.8 |

Under `multiply-v1` the price depends on the two digits: the cheaper of an add and a multiply mod 10, plus 1 bit to say
which. So every nudge costs 8.8 where the slider charges 7.1, and some far changes are cheap (3 to 9 is ×3 for 10.1; 5
to 0 is ×2 for 10.3; 8 to 4 is ×3 for 10.1). The framework's moves are one-cell writes priced by their net effect
(`callWork`), so these discounts are in the price without the agent choosing a multiply.

**The beginner eight** (docs/beginner-pool.md), 64 starts, `set-v1` and `distance-v1`:

| rule (top bits) | set-v1, steepest | set-v1, per-energy | distance-v1, steepest | distance-v1, per-energy | `rateE` set-v1 | `rateE` distance-v1 |
|---|--:|--:|--:|--:|--:|--:|
| mirrormancer (26.6) | 3.5 / 9.3 | 3.5 / 9.3 | 5.5 / 11.4 | 7.4 / 14.4 | 0.130 | 0.209 |
| opposite_nines (26.4) | 3.6 / 9.8 | 3.6 / 9.8 | 3.7 / 9.4 | 7.6 / 14.7 | 0.129 | 0.206 |
| leapfrog (20.2) | 1.9 / 5.8 | 1.9 / 5.8 | 2.8 / 7.2 | 6.1 / 12.2 | 0.077 | 0.178 |
| two_pair (20.5) | 3.9 / 10.1 | 3.9 / 10.1 | 6.6 / 13.6 | 7.4 / 15.4 | 0.142 | 0.224 |
| spread_three (22.8) | 4.2 / 10.1 | 4.2 / 10.1 | 5.4 / 11.7 | 7.3 / 14.7 | 0.132 | 0.205 |
| strangers (21.7) | 3.1 / 7.8 | 3.1 / 7.8 | 5.5 / 11.7 | 7.6 / 15.4 | 0.099 | 0.218 |
| crosswise_threes (16.2) | 3.0 / 8.7 | 3.0 / 8.7 | 4.9 / 12.4 | 7.3 / 15.2 | 0.119 | 0.220 |
| magic_eighteen (14.8) | 4.0 / 11.2 | 4.0 / 11.2 | 4.5 / 10.7 | 6.0 / 11.0 | 0.155 | 0.153 |
| **share of top at 32: mean; max/min; CV** | 0.17; 2.96; 0.30 | 0.17; 2.96; 0.30 | 0.24; 2.34; 0.29 | 0.34; 1.63; 0.17 | | |
| **share of top at 64: mean; max/min; CV** | 0.45; 2.64; 0.31 | 0.45; 2.64; 0.31 | 0.54; 2.16; 0.28 | 0.69; 1.73; 0.18 | | |
| **`rateE` max/min (CV)** | | | | | 2.01 (0.19) | 1.47 (0.11) |

**All five models**, pool rows only. Share of top is "mean; max/min; CV"; `rateE` is the per-energy agent's.

| model, starts | steepest at 32 | steepest at 64 | per-energy at 32 | per-energy at 64 | `rateE` max/min (CV) | mean `rateE` (× set-v1) |
|---|--:|--:|--:|--:|--:|--:|
| `set-v1`, 64 | 0.17; 2.96; 0.30 | 0.45; 2.64; 0.31 | 0.17; 2.96; 0.30 | 0.45; 2.64; 0.31 | 2.01 (0.19) | 0.123 |
| `distance-v1`, 64 | 0.24; 2.34; 0.29 | 0.54; 2.16; 0.28 | 0.34; 1.63; 0.17 | 0.69; 1.73; 0.18 | 1.47 (0.11) | 0.202 (×1.64) |
| `dial-v1`, 64 | 0.31; 2.78; 0.31 | 0.69; 1.74; 0.21 | 0.39; 1.80; 0.19 | 0.80; 1.53; 0.15 | 1.26 (0.07) | 0.238 (×1.93) |
| `log-v1`, 64 | 0.29; 2.40; 0.29 | 0.65; 1.85; 0.23 | 0.35; 1.77; 0.21 | 0.74; 1.57; 0.17 | 1.31 (0.08) | 0.216 (×1.76) |
| `multiply-v1`, 64 | 0.26; 2.66; 0.31 | 0.59; 1.97; 0.26 | 0.35; 1.99; 0.25 | 0.72; 1.60; 0.18 | 1.26 (0.08) | 0.211 (×1.72) |
| `proportional-v1`, 64 | 0.11; 2.53; 0.28 | 0.20; 3.27; 0.34 | 0.27; 1.75; 0.21 | 0.45; 1.78; 0.22 | 2.44 (0.23) | 0.125 (×1.01) |
| `set-v1`, 16 | 0.17; 3.17; 0.35 | 0.46; 2.68; 0.31 | 0.17; 3.17; 0.35 | 0.46; 2.68; 0.31 | 1.98 (0.18) | 0.125 |
| `distance-v1`, 16 | 0.24; 3.07; 0.34 | 0.55; 2.64; 0.32 | 0.34; 1.69; 0.19 | 0.70; 1.83; 0.20 | 1.50 (0.12) | 0.207 (×1.65) |
| `dial-v1`, 16 | 0.31; 2.82; 0.29 | 0.71; 1.89; 0.21 | 0.38; 1.85; 0.21 | 0.80; 1.65; 0.16 | 1.29 (0.08) | 0.238 (×1.90) |
| `log-v1`, 16 | 0.29; 3.16; 0.34 | 0.67; 2.03; 0.24 | 0.36; 2.19; 0.25 | 0.74; 1.69; 0.19 | 1.30 (0.09) | 0.219 (×1.75) |
| `multiply-v1`, 16 | 0.27; 3.34; 0.38 | 0.59; 2.14; 0.27 | 0.35; 2.46; 0.30 | 0.73; 1.65; 0.18 | 1.18 (0.06) | 0.214 (×1.70) |

Per rule, per-energy agent, 64 starts: share of top at 32 / 64 energy.

| rule | set-v1 | distance-v1 | dial-v1 | log-v1 | multiply-v1 |
|---|--:|--:|--:|--:|--:|
| mirrormancer | 0.13 / 0.35 | 0.28 / 0.54 | 0.30 / 0.66 | 0.28 / 0.59 | 0.26 / 0.58 |
| opposite_nines | 0.14 / 0.37 | 0.29 / 0.56 | 0.32 / 0.63 | 0.28 / 0.58 | 0.28 / 0.62 |
| leapfrog | 0.09 / 0.29 | 0.30 / 0.60 | 0.34 / 0.79 | 0.28 / 0.67 | 0.27 / 0.67 |
| two_pair | 0.19 / 0.49 | 0.36 / 0.75 | 0.40 / 0.85 | 0.38 / 0.84 | 0.37 / 0.78 |
| spread_three | 0.19 / 0.44 | 0.32 / 0.65 | 0.38 / 0.72 | 0.34 / 0.67 | 0.33 / 0.64 |
| strangers | 0.14 / 0.36 | 0.35 / 0.71 | 0.38 / 0.81 | 0.34 / 0.70 | 0.29 / 0.62 |
| crosswise_threes | 0.19 / 0.54 | 0.45 / 0.94 | 0.46 / 0.95 | 0.43 / 0.92 | 0.43 / 0.90 |
| magic_eighteen | 0.27 / 0.76 | 0.41 / 0.74 | 0.55 / 0.97 | 0.49 / 0.92 | 0.52 / 0.93 |

What the eight show:
- **Any distance price with the cost-aware agent evens the pool out and speeds it up.** The CV of the share of top at
  64 energy falls from 0.31 to 0.15–0.18, `rateE` max/min from 2.0 to 1.26–1.47 (all under the design's 1.6), and the
  same energy buys 1.6 to 1.9 times the bits. The blind agent gets a quarter to two thirds of the gain in evenness
  (CV at 64: 0.28 on the slider, 0.21 on the dial).
- **`distance-v1` is the most even at 32 energy** (CV 0.17) and the slowest of the four (×1.64). **`dial-v1` is the most
  even at 64** (CV 0.15) and the fastest (×1.93): no change costs more than 18.9.
- **Who gains against `set-v1`** (per-energy, share at 64, 64 starts): crosswise_threes (+0.36 to +0.41), leapfrog
  (+0.32 to +0.51) and strangers (+0.26 to +0.45) most, because their fixes are nudges; two_pair +0.26 to +0.36; spread_three,
  mirrormancer and opposite_nines +0.19 to +0.30. No rule loses more than noise (magic_eighteen −0.01 on the slider).
- **magic_eighteen is the rule the models disagree on.** Under the slider it gains nothing at 64 (0.76 to 0.74): a row
  total is often fixed by one far change, which the slider charges up to 34.9 for. The dial, the log code and multiply
  make far changes cheap (9 to 1 costs 9.7 on the dial), and it reaches 0.92–0.97. The rule's arithmetic has no wrap
  and no multiplication, so on the dial and under multiply that cheapness comes from the price list, not the rule.
- **`multiply-v1` is `distance-v1` with dearer nudges and a few cheap jumps.** It helps magic_eighteen (+0.19 on the
  slider at 64) and costs strangers (0.71 to 0.62: its fixes are nudges, each 1 bit dearer). The pool is no more even
  than on the slider at 64 (CV 0.18) and less even at 32 (0.25 against 0.17).
- **`proportional-v1` (the variant with no charge for the cell, λ = 5.04) is the slowest distance price and the least
  even.** With the cost-aware agent it holds 0.45 of top at 64 energy, what `set-v1` holds, and buys the same bits per
  energy (×1.01); `rateE` max/min is 2.44, above the design's 1.6 and above `set-v1`'s 2.01. Only a ±1 is cheap (6.3),
  so the blind agent does worse than under `set-v1` (0.20 against 0.45 at 64), and magic_eighteen, whose fixes are far
  changes, falls to 0.40 of top at 64 (0.76 under `set-v1`) while crosswise_threes and strangers, fixed by nudges, lead
  (0.62, 0.59).
- **16 against 64 starts** agree on every pool row within 0.02 of mean share and 0.07 of CV. The max/min at 32 energy
  (one to four moves) is noisy.

**The beginner stand-ins** of docs/mutation-cost-design.md §8 (`scripts/mutation-cost-beginner-rules.mjs`, calibrated
on the spot):

| rule (top bits) | set-v1, steepest | set-v1, per-energy | distance-v1, steepest | distance-v1, per-energy | `rateE` set-v1 | `rateE` distance-v1 |
|---|--:|--:|--:|--:|--:|--:|
| half_turn_nine (29.8) | 2.1 / 6.8 | 2.1 / 6.8 | 3.5 / 9.7 | 6.6 / 14.4 | 0.095 | 0.214 |
| row_partners_one_apart (19.1) | 1.8 / 5.7 | 1.8 / 5.7 | 2.7 / 7.8 | 6.7 / 12.8 | 0.077 | 0.189 |
| corner_box_two_pairs (21.9) | 3.1 / 8.7 | 3.1 / 8.7 | 5.2 / 9.2 | 5.7 / 9.2 | 0.133 | 0.141 |
| window_spread_3 (23.0) | 4.1 / 9.6 | 4.1 / 9.6 | 5.3 / 10.1 | 7.1 / 14.1 | 0.130 | 0.201 |
| column_mirror_equal (27.6) | 1.6 / 6.1 | 1.6 / 6.1 | 3.5 / 8.0 | 5.8 / 12.9 | 0.090 | 0.196 |
| checker_parity (15.8) | 1.7 / 3.7 | 1.7 / 3.7 | 2.5 / 4.5 | 5.2 / 12.4 | 0.041 | 0.177 |
| row_sum_18 (15.4) | 4.4 / 12.0 | 4.4 / 12.0 | 5.3 / 12.5 | 6.4 / 12.5 | 0.165 | 0.172 |
| diagonal_steps (20.1) | 3.7 / 10.2 | 3.7 / 10.2 | 6.9 / 12.8 | 8.3 / 14.2 | 0.145 | 0.208 |
| **share of top at 32: mean; max/min; CV** | 0.14; 4.87; 0.50 | 0.14; 4.87; 0.50 | 0.21; 2.95; 0.41 | 0.31; 1.98; 0.24 | | |
| **share of top at 64: mean; max/min; CV** | 0.39; 3.49; 0.46 | 0.39; 3.49; 0.46 | 0.45; 2.80; 0.38 | 0.62; 1.92; 0.22 | | |
| **`rateE` max/min (CV)** | | | | | 4.01 (0.35) | 1.52 (0.12) |

What the stand-ins show:
- **Under `set-v1` the two agents are the same agent**, in every row.
- **Distance pricing with the cost-aware greedy halves the stand-ins' spread**: the CV of the share of top falls from
  0.50 to 0.24 at 32 energy and from 0.46 to 0.22 at 64, and `rateE` max/min from 4.0 to 1.5. The mean share doubles
  at 32 (0.14 to 0.31).
- **The blind agent gets a third of that**: 0.50 to 0.41 at 32. Most of the evening-out is the agent choosing near
  fixes, not the price list alone.
- **Who gains.** At 64 energy checker_parity gains most (share of top 0.24 to 0.79: every fix is a nudge), then
  row_partners_one_apart (0.30 to 0.67), column_mirror_equal (0.22 to 0.47) and half_turn_nine (0.23 to 0.48).
  corner_box_two_pairs (0.40 to 0.42) and row_sum_18 (0.78 to 0.81) gain least: the first is trapped (`DIFF` 58), the
  second is already near its top after three changes. No rule loses more than noise with the cost-aware agent
  (row_sum_18 moves by +0.5 bits at 64, and by −0.2 with 64 starts).

**Against the prototype's figure.** docs/mutation-cost-design.md §8 measured CV 0.39 to 0.17 at 32. With the shipped
cost functions in the prototype's exact setup, the figure is reproduced digit for digit: the prototype's slider and
set models now delegate to `@workspace/game-types` (unit-tested equal to `callWork` on the numbers-only board), and
`mutation-cost --balance --starts 16` prints the same table as before. The table above differs from it in three ways,
none of them the price:
- the start boards: both use 16 seeded random boards, but under a different seed label and board key
  (`rule-difficulty|starts|Grid(4,base10,mono)` here, `rule-difficulty|mutation-cost|Grid(4,base10,rgb)` there);
- the calibration: ad-hoc rules are calibrated per board key, so the bits differ a little (half_turn_nine tops at 29.8
  here and 25.6 there);
- the sample: 16 starts and one or two moves at 32 energy make the CV noisy. With 64 starts this framework gives 0.42
  to 0.20 at 32 and 0.42 to 0.22 at 64 (`rateE` max/min 3.7 to 1.7); the prototype's setup with 200 starts gives 0.45
  to 0.20 at 32.

So the claim holds and is, if anything, understated: the spread roughly halves. On the First steps board
(Grid(4,base10,rgb), `--moves symbol`), where naming the family adds 1 bit to every move (18.4 energy for a set, 8.8 for
±1), the stand-ins go from 0.49 to 0.29 at 32 and from 0.43 to 0.20 at 64. There row_sum_18 is the one rule that
holds less at 64 under distance pricing (11.9 to 10.8 bits): the myopic per-energy agent takes cheap nudges toward a
row total where one set would finish the row.

## 7. Anchor check

The owner's anchors are honest_minesweeper versus mirrormancer, from §6.1 with full moves.

| | DIFF | trap | gap | K | SYN (mean over Annotated partners) |
|---|--:|--:|--:|--:|--:|
| mirrormancer | 0 | 0 | 0 | 1.0 | 35.1 (ceiling 0.87) |
| honest_minesweeper | 33.3 | 0.54 | 0.13 | 5.3 | 59.7 (ceiling 0.65) |

**Algorithm.** Greedy solves mirrormancer: all of its top in 7 moves. On honest_minesweeper greedy stops at about half
of the top every time. A two-cell change escapes only a third of those traps, and judging a move needs about 5 other
cells against 1. `DIFF` and `trap` show the anchor most clearly.

**Combination.** In the test's nine-partner check, two considerate simple agents keep about 0.73 of the joint value
with mirrormancer and about 0.32 with honest_minesweeper. The test pins the direction with a margin of at least 10 SYN
points.

Placing a mine changes the honesty of up to 8 neighbours, so almost any move for a partner's rule breaks something
minesweeper built, and the reverse.

Mirrormancer's synergy cost against digit-hungry partners such as magic_accountant is real, but it comes from
compatibility (one board must satisfy both). It is not from entanglement.

### 7.1 Relation to the beginner-rules brainstorm's measures

| Brainstorm measure | Here | Status |
|---|---|---|
| top@40 (greedy reaches the best from a random start) | `trap`, plus `stall` in the JSON | Adopted. It reads as a share of bits rather than a share of starts. |
| deps (cells that can change a move's gain) | `K` | Adopted. `K` counts cells that flip the gain's *sign*, which is what an agent acts on. It runs a little lower than deps. |
| share of A-improving moves that lower B | `conflict` | Agreed that it does not discriminate: it is 0.2–0.6 for almost every pair. It is reported but not used in the headline. |
| joint reach (the best board for both) | `ceiling`, and `SYN` | Adopted. `SYN` adds what two considerate simple agents actually reach. |
| uniform-board maximum | `uniform max` | Adopted. |
| greedy bits at N moves | `g10`, `g20` | Adopted. `rate4` is kept beside them; it gives Spearman 0.78 against the Annotated basics win shares. |

The brainstorm proposed "an improving move on at least 99% of random boards". It corresponds to `plat` ≤ 0.01.

## 8. What this does not measure, and known limits

- **The ceiling is a lower bound.** Search can miss a joint board that exists. honest_minesweeper's low ceilings are
  partly its own search difficulty.
- **The beam is not the optimum.** `gap` is a lower bound on what cleverness earns. For rules where the beam stalls
  together with greedy (minesweeper), `trap` carries the signal.
- **Comprehension is a size proxy.** Card bits do not see how hard a concept is: "mines touching" and "numbers adding to
  ten" can cost the same bits. The readability rules of rules-design.md remain the comprehension test.
- **One canonical param per family** by default. `--params N` measures more, and they can differ: a common mine colour
  changes minesweeper's numbers.
- **Synergy is measured on one object.** The live game has many objects, and players can specialise objects instead of
  sharing them. A low ceiling is then less damaging than SYN suggests.
- **The balance link is correlational** (ρ = 0.78 on 11 families under one harness). Win share also depends on
  partners' damage, which SYN measures separately.
- **Use `--moves symbol` for rules that ignore colour.** With `--moves cell`, colour-only variants of a board tie in
  value and crowd the beam, so `gap` (and with it `DIFF`) can differ by a few points between the two move sets.
  Examples: go_fish_books scores 3.3 with cell moves and 9.4 with symbol moves; twenty_one scores 16.2 and 17.5. Greedy,
  `trap`, `plat` and `K` are the same under both.
- **Synergy and win share.** Across the 11 Annotated families, a higher per-rule `SYN` goes with a slightly *higher*
  greedy win share (Spearman 0.32). A rule that is hard to combine with is also hard for its partners to help or harm.
  SYN is a design-difficulty measure, not a balance one.
- **The energy columns are one agent, alone, on one object.** They do not price reads or summons, and they are noisy
  at 32 energy (one to four moves): compare pools on `e64` and `rateE`, with `--starts 64` when the difference matters.
- **No agent-ladder estimate yet.** The cheapest template agent that reaches X% of the top, priced in ast-bits, was
  proposed but not built. Card bits plus `DIFF` and `esc2` stand in for it.
