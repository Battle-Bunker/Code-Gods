# Competitive play: players that play to win, and what they do to the game

The owner's challenge (16 November), on the report that two grid rules reach the top of their scoring within ten
minutes: "Don't grids get vandalized by competing players enough that it's hard to keep them high scoring? Or did you
only simulate naive players that don't bother mutating a grid they can't see a way to score positively on themselves
while failing to take advantage of the opportunity to cheaply impose costs on an opponent by cheaply vandalizing their
high scoring object in a way that would cost more to repair than it cost to damage?"

Until this page we had only simulated the naive kind. This page adds simulated players that play to win and measures
what they do. They are measurement agents, never shipped or shown to players.

## Summary

1. **The shipped starters are exploitable.** One "mixed" player builds, and knocks when a rival's loss per energy beats
   building. Against two Simple starters it wins **58%** of lines-beginner games and **67%** of grids-beginner games
   (an even share is 33%).
2. **On lines, mixed is a dominant strategy among those tried.** It is also the best reply to itself: a naive seat
   among two mixed players wins 17%, and a defender wins 17%. *One strategy dominating is a failure of the ecosystem,
   reported here as a bug.* It is a prisoner's dilemma: tables where everyone plays mixed lose **36%** of their points
   (lines) and **72%** (grids).
3. **On grids, no single strategy wins against every mix.** Mixed beats naive (67%), but against two mixed players a
   defender wins 42% and a naive seat scores more points than its mixed rivals (1,124 against 975). So the grid
   population cycles rather than settling. Still, the grids are the fragile board. A seat's bits stay above half their
   peak for a median **279 s** among naive players, **41 s** with one mixed player and **21 s** when all are mixed.
   Leapfrog's and Two Pair's tops are still reached in every table. They are held for far less time when someone
   knocks: Leapfrog's object-seconds at the top fall 1,260 → 722 (one mixed) → 257 (one vandal).
4. **Repair costs about what the knock cost** (victims put back 79–97% of knocks for a median 10–37 energy, against
   14–27 for the knock). The owner asked what went wrong; see §4. Prices are close to an exact potential, so the gap
   only exists for knocks that lower φ. On the beginner grid, φ is the cell sum alone, so 94–95% of knocks keep φ and
   cost the same both ways. No high-scoring grid state sits above its neighbours in φ. On lines about half the knocks
   keep φ, and about half of high states are high-energy.
5. **Pure vandalism never wins** (17–25%, and all-vandal tables score almost nothing). The vandal does drag the others
   down (naive points −37% on lines, −38% on grids), so it is a spoiler, not a strategy.
6. **Levers.** The turnover board (a new object every 30 s, 5 live) softens the exploit: one mixed player's wins fall
   to 50% on both presets, and holds and objects-changed rise. It does not end the dilemma: all-mixed tables still lose
   about half their points. Pricing: (c′) was superseded by size-only gravity, which is measured next (§5.2). Tree-shape rules: not measurable yet (no starters exist for them).
   Locks: waiting for the table option.
7. **Hold rarity.** The measurements are not a reason to bring it back. The defender plays the closest thing to it
   (it prefers states a single step cannot knock far), and it gains nothing against naive players. Against mixed
   players it helps on grids (42% wins) but not on lines (17%). What makes knocks cheap is that the price potential
   (φ) is orthogonal to the scores (§4), not a missing term in the bits. See §6.

## 1. The agents

Code: `lib/v2-agents/scripts/competitive-agents.ts`; runner `scripts/competitive.ts`; test `test/competitive.test.ts`.
Every agent is the shipped TypeScript Simple starter of its seat's family, with the last line (`return climb(...)`)
replaced by a decision, `compete`. It sees only what any agent sees in an act:

- its own rule, exactly;
- the offered object;
- `worth` (its own bits n, the others' sum S);
- `othersAfter(plan)` (the others' sum after a plan, a priced read);
- prices and its budget.

It never sees the others' rules or the split of S. A move to (n′, S′) is valued as:

    OWN · Δ(n·S) − RIVAL · Δ(rivals' points) / R − FRAGILE · (bits one step could knock off the new state) · S′

The rivals' points on the object are estimated as n·S + S²(1 − 1/R), with S split evenly over the R = 2 rivals. The
agent takes the candidate with the most value per energy that it can pay for. Candidates are the starter's best steps
for its rule plus, when the object is worth at least TARGET to the others, PROBE more spread over the menu. On grids, a
player out to knock also tries far moves (one cell by up to ±9, a row or column by ±2), priced by their size. A ±1 step
barely dents a high grid board: one test board went from 22.8 to 21.7 of the others' bits, while the best far move
took it to 14.

| Kind | Knobs | Behaviour |
|---|---|---|
| naive | the shipped Simple starter | acts only when a move raises its own points now |
| mixed | OWN 1, RIVAL 1 | builds, and knocks when a rival's loss per energy beats building |
| vandal | OWN 0, RIVAL 1, TARGET 8 bits, KNOCK 25% | only knocks: the cheapest large damage on objects the others hold many bits on (the rows here probed up to 20 steps an act, 4 more than its PROBE 16; fixed after) |
| defender | OWN 1, FRAGILE 0.5 | the starter, preferring states one step cannot knock far down |
| rank | mixed; the player reads the public standings every 10 s | RIVAL 0.25 when 10% ahead, 2 when behind, 1 otherwise; each change is an edit paid at the edit price (table `playerTurns`) |
| lookahead | the agents session's two-move climber (`pool-dynamics.ts --look dip:0.5`) | lines only |

The games are the beginner presets as the server deals them to three people (`freshDeal` on the preset's dealable
pool), with the preset's board, economy, births and drift. That is how `artifacts/engine/test/v2-pace.test.ts` keeps
the table honest against the engine for the same starters. Every seat is in TypeScript. Each row plays the same 12
deals and seeds, 600 s each. The special seat rotates over the three dealt rules game by game, so a kind is not tied to
a family.

The measures are:

- **Hold:** each time a seat's bits on an object reach a new high of at least 6, the seconds until they fall below
  half of it; censored at the end of the game.
- **Kept:** of the bits other seats held just before a move, the share they still hold after it.
- **Knock:** a move that lowered other seats' points by at least 1 with no gain for its mover.
- **Repaired:** the victims' bits on that object came back to at least where they were. Repair energy is what the
  victims spent on that object until then.
- **Top:** Leapfrog's or Two Pair's main part at 0 ("exactly"), counted in object-seconds (summed over objects).

## 2. The first table: lines-beginner and grids-beginner

### Who wins (12 games × 600 s per row; an even win share is 33%)

| Preset | Table | Special seat: win share, mean rank, points | Others' points | Table mean points |
|---|---|---|---|---|
| lines | naive ×3 | – | 281 | 281 |
| lines | mixed + 2 naive | **58%**, 1.67, 297 | 254 | 268 |
| lines | vandal + 2 naive | 17%, 2.50, 133 | 176 | 162 |
| lines | defender + 2 naive | 42%, 2.00, 243 | 256 | 252 |
| lines | rank + 2 naive | 25%, 2.42, 240 | 273 | 262 |
| lines | lookahead + 2 naive | 33%, 2.08, 308 | 290 | 296 |
| lines | mixed ×3 | – | 180 | 180 |
| lines | naive + 2 mixed | 17%, 2.17, 204 | 232 | 223 |
| lines | defender + 2 mixed | 17%, 1.92, 220 | 212 | 215 |
| lines | rank ×3 | – | 44 | 44 |
| lines | vandal ×3 | – | 22 | 22 |
| grids | naive ×3 | – | 1,693 | 1,693 |
| grids | mixed + 2 naive | **67%**, 1.58, 1,695 | 1,440 | 1,525 |
| grids | vandal + 2 naive | 25%, 2.25, 775 | 1,049 | 958 |
| grids | defender + 2 naive | 50%, 1.83, 1,542 | 1,538 | 1,539 |
| grids | rank + 2 naive | 33%, 2.17, 1,193 | 1,424 | 1,347 |
| grids | mixed ×3 | – | 466 | 466 |
| grids | naive + 2 mixed | 25%, 1.92, **1,124** | 975 | 1,025 |
| grids | defender + 2 mixed | **42%**, 1.92, 983 | 874 | 910 |
| grids | rank ×3 | – | 60 | 60 |
| grids | vandal ×3 | – | 22 | 22 |

### Dynamics

| Preset | Table | Hold ≥ half peak, median s (censored) | Kept per move | Objects changed / min | Levels up by third | Last-third moves on 2-state cycles | Knocks, rivals' points lost / energy | Repaired; repair vs knock energy (medians) |
|---|---|---|---|---|---|---|---|---|
| lines | naive ×3 | 11 (17%) | 75% | 2.30 | 455 / 469 / 468 | 58% (18 obj) | – | – |
| lines | mixed + 2 naive | 8 (8%) | 64% | 2.52 | 531 / 597 / 644 | 29% (13) | 681, 4.7 | 94%; 11 vs 16 |
| lines | vandal + 2 naive | 6 (3%) | 51% | 2.89 | 514 / 519 / 522 | 66% (28) | 1,224, 6.9 | 97%; 10 vs 14 |
| lines | defender + 2 naive | 9 (12%) | 74% | 2.02 | 534 / 528 / 519 | 54% (15) | – | – |
| lines | rank + 2 naive | 11 (7%) | 55% | 2.82 | 505 / 458 / 469 | 29% (14) | 820, 5.8 | 95%; 12 vs 16 |
| lines | lookahead + 2 naive | 15 (19%) | 75% | 2.23 | 433 / 436 / 413 | 62% (20) | – | – |
| lines | mixed ×3 | 9 (6%) | 55% | 3.23 | 685 / 680 / 657 | 5% (3) | 963, 3.0 | 85%; 17 vs 18 |
| lines | naive + 2 mixed | 8 (7%) | 61% | 2.93 | 610 / 619 / 559 | 12% (7) | 813, 3.3 | 88%; 17 vs 18 |
| lines | rank ×3 | 6 (3%) | 44% | 3.63 | 640 / 642 / 583 | 0% | 1,325, 1.9 | 78%; 18 vs 16 |
| lines | vandal ×3 | 11 (0%) | 47% | 0.07 | 1 / 0 / 2 | 0% | 5 | – |
| grids | naive ×3 | **279 (65%)** | 89% | 1.78 | 631 / 389 / 389 | 23% (5) | – | – |
| grids | mixed + 2 naive | 41 (29%) | 86% | 2.78 | 683 / 574 / 530 | 11% (4) | 319, 12.6 | 87%; 20 vs 21 |
| grids | vandal + 2 naive | 23 (16%) | 82% | 2.98 | 486 / 486 / 425 | 14% (7) | 472, 9.5 | 86%; 20 vs 24 |
| grids | defender + 2 naive | 333 (69%) | 90% | 1.93 | 598 / 390 / 373 | 25% (6) | – | – |
| grids | rank + 2 naive | 38 (25%) | 85% | 2.75 | 597 / 492 / 485 | 6% (3) | 393, 11.3 | 90%; 21 vs 24 |
| grids | mixed ×3 | 21 (16%) | 72% | 2.46 | 490 / 493 / 462 | 4% (2) | 471, 3.4 | 80%; 34 vs 25 |
| grids | naive + 2 mixed | 44 (25%) | 82% | 2.99 | 550 / 619 / 597 | 2% (1) | 447, 6.6 | 79%; 37 vs 24 |
| grids | defender + 2 mixed | 35 (25%) | 80% | 2.57 | 512 / 522 / 440 | 7% (3) | 442, 6.0 | 82%; 30 vs 25 |
| grids | rank ×3 | 15 (7%) | 65% | 2.49 | 352 / 346 / 294 | 6% (2) | 730, 0.8 | 72%; 33 vs 27 |
| grids | vandal ×3 | 15 (33%) | 50% | 0.04 | 1 / 0 / 0 | 0% | 6 | – |

### Grid tops (Leapfrog and Two Pair, 4 seats each per row)

| Table | Two Pair: reached, object-seconds at the top (median) | Leapfrog: reached, object-seconds at the top |
|---|---|---|
| naive ×3 | 100%, 1,776 | 100%, 1,260 |
| mixed + 2 naive | 100%, 1,311 | 100%, 722 |
| vandal + 2 naive | 100%, 596 | 100%, 257 |
| mixed ×3 | 100%, 398 | 75%, 231 |
| naive + 2 mixed | 100%, 1,095 | 100%, 270 |
| defender + 2 mixed | 100%, 782 | 100%, 575 |

The tops are still reached in every kind of table. Knocking shortens how long they are held, by a factor of 2 to 5.
Being told the rule plus climbing still finds these peaks within ten minutes, competitive opponents or not: the grid
baseline's known bug (`grid-v1-v2-compare.md`, "Known reachable tops") stands.

### Reading

- **The owner's suspicion is right.** The naive population leaves money on the table. A player that knocks when
  knocking pays more than building wins 58–67% against it.
- **Lines: a dominant strategy (reported as a bug).** Mixed is the best reply to naive (58%) and to mixed (the naive
  and defender seats among two mixed win 17% each). By the owner's criterion, "knock the leader's objects when it is
  cheaper than building" is the one strategy everyone ends up playing on lines. The resulting all-mixed tables
  (180 points, kept 55%) churn and do not freeze: two-state cycles fall from 58% to 5% of late moves, and objects
  changed per minute rise from 2.3 to 3.2. So the dynamics survive, at a lower total, while the strategy space
  collapses.
- **Grids: no dominant strategy among these.** Naive < mixed against naive, but defender ≥ mixed against mixed, and a
  naive seat among two mixed out-scores them. That is a cycle, which is what an ecosystem needs. But the grids' stable
  high boards (holds of ~5 min) were an artefact of naive opponents. With one knocker, holds drop to 20–40 s.
- **The rank-aware policy I tried is worse than plain mixed** (25% / 33%; all-rank tables collapse to 44 / 60
  points). Turning RIVAL up when behind spends the energy on knocks that also hit the third player. A better
  rank-aware player is possible. It would need attribution, which the game (rightly) does not give.
- **Lookahead (two moves) changes nothing measurable** against naive players (33%, the same dynamics), as the agents
  session found.

## 3. Damage per energy against repair

| Preset | Knocks by a competitive seat: rivals' points lost per energy | Victims' repair | Repair energy vs knock energy (median) |
|---|---|---|---|
| lines | 1.9–6.9 | 78–97% repaired | 10–18 vs 14–18 |
| grids | 0.8–12.6 | 72–90% repaired | 20–37 vs 21–27 |

Repair is not dearer than damage, except in all-competitive grid tables, where repair costs 30–37 against 24–27
(repairs there are contested). The vandal pays its knock and gets nothing back. The victim pays about the same to
climb back and recovers its points. That is why pure vandalism loses, and why mixed knocks only when it pays.

## 4. Why repair is not dearer (the owner: "What went wrong")

Script: `lib/v2-agents/scripts/knock-phi.ts`. It covers 4 games each of all naive and of one mixed + 2 naive, on each
preset. For every committed move that lowered another seat's bits by ≥ 0.5 (a knock), it records:

- the change in φ (the law's code length, `type.readLength`) and the move kind;
- its change price W;
- the price of the exact inverse that puts the object back (the same mutator with the opposite argument, an
  involution, or 1/f for a stretch), priced by the same `applyCalls`.

| Preset | Knocks | Down in φ (≤ −1 bit) | Sideways (\|Δφ\| < 1) | Up in φ | Sideways knock W vs exact undo W | Down: undo − knock (median bits) |
|---|---|---|---|---|---|---|
| lines, all naive | 420 | 40% (mean −6.8) | 18% | 42% (+6.7) | 8.8 vs 8.8 | +3.0 |
| lines, 1 mixed | 616 | 31% (−3.5) | 35% | 33% (+3.7) | 8.8 vs 8.8 | +1.5 |
| grids, all naive | 482 | 4% (−1.0) | **95%** | 1% | 8.7 vs 8.7 | +1.0 |
| grids, 1 mixed | 563 | 4% | **94%** | 2% | 11.2 vs 11.2 | +1.0 |

Which moves knock sideways:

- **Lines:** a shift by ±1, putting c on a neighbouring integer with the same code length (44–74%); mirrors
  (`cart.mirror`, 26% with a mixed player); pivots, stretches and integer moves.
- **Grids:** cell swaps (35–55%) and a single cell ±1 (45–65%).

Sideways knocks destroy the most: a median 4.7–8.1 bits on lines, against 1.2–3.5 for knocks that lower φ.

**High score is not high energy.**

- On grids, φ = 0.5 · (sum of the 16 cells) + a constant (`grid4` step 0.5). Of 2,997 states where a seat held at
  least 6 bits, **0%** had φ above the median of their one-step neighbours.
- On lines, 33% (one mixed) to 55% (all naive) of high states were above their shift/tilt neighbours, carrying 36–59%
  of the high bits.

**What went wrong.** The design's asymmetry is real: prices are close to an exact potential, and undoing a knock costs
about the knock plus the φ it lowered. But it only protects states that are higher in φ than their neighbours.

- **Grids:** the beginner grid's law weighs only the cell sum, and every grid rule scores a pattern orthogonal to the
  sum. So a high-scoring board is never high-energy, and every knock that shuffles or nudges cells costs the same both
  ways.
- **Lines:** scores track φ only half the time. Permutations, mirrors and steps to a neighbouring integer keep φ.

For the asymmetry to bite, the scored features must be ones the law makes costly. Either the code must charge for the
structure the rules reward, or rules must reward structure the code makes costly. The size-only gravity being built
(session `…WqYBoPAH8cSmCvBnm`) changes the lines' code. The same script re-runs on it.

## 5. Levers

### 5.1 The turnover board (a new object every 30 s, 5 live, the oldest retires with points kept)

This is the table's `objectCap: 5`, with regular births every 30 s (`--cap 5 --cap-every 30`). Same deals and seeds.

| Preset | Table | Special seat wins | Table mean points | Hold, median s | Kept | Objects changed / min | 2-state cycles (late) | Repaired |
|---|---|---|---|---|---|---|---|---|
| lines | naive ×3 | – | 1,106 | 27 | 76% | 4.28 | 3% | – |
| lines | mixed + 2 naive | **50%** (was 58%) | 988 | 20 | 68% | 4.97 | 2% | 79% |
| lines | vandal + 2 naive | 17% | 580 | 8 | 55% | 5.23 | 12% | 83% |
| lines | mixed ×3 | – | 534 (−52%) | 12 | 57% | 5.53 | 2% | 62% |
| grids | naive ×3 | – | 3,794 | 242 | 91% | 5.58 | 0% | – |
| grids | mixed + 2 naive | **50%** (was 67%) | 2,699 | 159 | 88% | 5.55 | 1% | 62% |
| grids | vandal + 2 naive | 42% | 1,385 | 50 | 83% | 5.48 | 1% | 54% |
| grids | mixed ×3 | – | 902 (−76%) | 47 | 73% | 4.58 | 1% | 50% |

Turnover is good for dynamics and blunts the exploit somewhat:

- **The board keeps moving.** Objects changed per minute double, and two-state cycles all but vanish (lines 58% → 3%
  among naive players).
- **The exploit pays less.** One knocker's edge falls to 50%, and repair falls to 50–62%: retired objects end
  repairs, since an old object is not worth repairing.
- **The dilemma stays.** All-mixed tables still lose about half (lines) to three quarters (grids) of the naive total.
- **A new risk on grids:** a vandal reaches 42% there, because knocking an object about to retire costs its owner
  points it cannot climb back.

### 5.2 Pricing (c′) and size-only gravity

(c′) is superseded: the owner ordered size-only gravity instead (branch `claude/gravity-measure`). The (c′) rows were
stopped unfinished. The same rows (all naive, one mixed, all mixed, best replies) and the knock breakdown of §4 run on
the gravity branch next. The question is whether "mixed" still dominates on lines once high scores are high energy, and
what share of knocks stay sideways.

### 5.3 Rules in the owner's tree shape (Prime Intercept, Power Area)

Not measurable yet. No catalogue entries or starters exist for the tuple and tree families (`startersFor` throws), so
no table can seat them, naive or competitive. The owner has rejected the tree as first built (the spec lead, 16 Nov).
Related prototype figures from the grid tuple-rules worker (`docs/engine-v2/grid-tuple-rules/`, not engine rules):
for Round Halves and Prime Rows, a turn (6 energy) keeps 2–5% of the bits, and one cell change keeps a median of 60%
(Round Halves) or 100% (Prime Rows).

### 5.4 Locks

The owner's "defence by locks" is being built (session `…V2xUXmX8eMKxtDFCS`, `docs/engine-v2/locks.md`). When the
table option lands, this page adds:

- defenders who lock and vandals who drain, against no locks;
- whether locks freeze boards;
- whether a locked single state is ever enough to do well (a bug if so).

## 6. What the old game did: hold rarity

v1 counted in a state's bits the chance it survives m = players − 1 random mutations (archive `docs/energy-model.md`
§8). The owner decided not to restore it without a good reason (decision 43). `hold-measurement.md` found it redundant
against the walk's own noise. It also found it does not predict fragility to real opponents (rank agreement
0.11–0.71).

These measurements do not supply that reason:

- **The defender plays the nearest thing.** It prefers states one step cannot knock far down. Against naive players it
  wins 42–50% with no point gain, so robustness is not undervalued there. Against mixed players it helps on grids
  (42% wins) and does nothing on lines (17%).
- **Hold rarity would mis-target the knocks.** It measures survival under random kernel moves. The damaging knocks
  here are the sideways ones a rival chooses: swaps, mirrors, neighbouring integers. The agents choose them because
  they cost the same both ways (§4).
- **The cause is the code, not the bits.** Cheap knocks come from a price potential that ignores what the rules
  score. A bits term would not change what a knock costs. Pricing the scored structure (or locks, which put a price on
  breaking a chosen predicate) would.

So, plainly: **not a reason for hold rarity**. They are a reason to fix the φ–score mismatch, and a test bed for locks.

## Reproduce

From `lib/v2-agents`:

    node --experimental-strip-types scripts/competitive.ts --preset lines-beginner --games 12 \
      --rows "naive,naive,naive;mixed,naive,naive;vandal,naive,naive;defender,naive,naive;lookahead,naive,naive"
    node --experimental-strip-types scripts/competitive.ts --preset grids-beginner --games 12 --cap 5 --cap-every 30 \
      --rows "naive,naive,naive;mixed,naive,naive"
    node --experimental-strip-types scripts/knock-phi.ts --preset grids-beginner --games 4 --rows "mixed,naive,naive"

A 600 s game takes about 30–60 s on one core.
