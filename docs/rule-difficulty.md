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

Kingdom, the last at 4%, has the lowest `rate4`.

The order is not fully explained. colour_bonds, the top winner, climbs only middling fast at 4 moves. Its win share also
depends on what its partners do to it, which §2.4 measures.

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
  --params N                      distinct canonical params per family (default 1)
  --no-pairs                      skip the synergy matrix
  --calibrate                     calibrate families here even when a shipped table exists
  --json FILE / --markdown FILE   also write the report
```

The text table goes to stdout and progress to stderr. Timing:
- a pool of 12 rules on 4×4 takes about 90 s with the default budget (about 1.5 s per rule and 1 s per pair);
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
| `DIFF` per rule | ≤ 10 | 12 of the 21 number-only families score 0 and go_fish_books 3. Everything above 10 had greedy stall on a quarter of the top or more. |
| `K` per rule | ≤ 3.5 | All greedy-solvable families have K ≤ 3.5. honest_minesweeper (5.3) and whole-board aggregates (parity, 15) need more reading than a beginner should. |
| card bits per rule | ≤ 800 | The simplest families sit at 300–650. The longest (straight_shooter, pinwheel, chessmaster, set_spotter) are 1000–1300. |
| `rate4` max/min | ≤ 1.6 | This is the climb imbalance the balance study measured. The Annotated basics pool spans about 3×, and the bottom of its win shares is the bottom of `rate4`. |
| card bits max/min | ≤ 2.5 | Comparable to read. |
| per-rule `SYN` spread | ≤ 15 points | No rule much harder to combine than the rest. The number-only families span 39–67. |
| `SYN` per pair | ≤ 75 | Number-only rules all compete for the same digits, so most pairs are 40–70. Above 75, a pair is mostly lost unless both players plan. |
| ceiling per pair | ≥ 0.5 | Some board gives both rules at least half their top on the geometric mean. |
| dominated rules | none | No rule is both slower and harder than another. |

These are proposals. Tighten them once the brainstormed beginner rules are measured. `DIFF ≤ 10`, `rate4` within 1.6×
and the synergy spread are the three that carry the owner's "comparably simple" ask.

## 6. Measured tables

Shared settings: Grid(4,base10,rgb), default budget, shipped tables for every family. Ad-hoc example rules are
calibrated on the spot. The text output is the same as the Markdown below; regenerate with `--markdown`.

The tables:
- §6.1, Annotated basics: the full pool with full moves, plus the three example ad-hoc rules.
- §6.2, number-only families of First steps: measured on symbols only, with the pair matrix.
- §6.3, every First steps family: per rule, full moves.

### 6.1 Annotated basics (full moves) plus the example ad-hoc rules

ANNOTATED_TABLE

### 6.2 Number-only families of First steps (symbol moves)

The score of these families ignores colour (measured), so they are the candidates for a single-colour beginner set.

NUMBERS_TABLE

### 6.3 Every First steps family (full moves, per rule)

FIRST_TABLE

## 7. Anchor check

The owner's anchors are honest_minesweeper versus mirrormancer, from §6.1 with full moves.

| | DIFF | trap | gap | K | SYN (mean over Annotated partners) |
|---|--:|--:|--:|--:|--:|
| mirrormancer | 0 | 0 | 0 | 1.0 | ANCHOR_MIRROR_SYN |
| honest_minesweeper | ANCHOR_MINE_DIFF | ANCHOR_MINE_TRAP | ANCHOR_MINE_GAP | ANCHOR_MINE_K | ANCHOR_MINE_SYN |

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
- **No agent-ladder estimate yet.** The cheapest template agent that reaches X% of the top, priced in ast-bits, was
  proposed but not built. Card bits plus `DIFF` and `esc2` stand in for it.
