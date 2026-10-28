# Grid Lab experiments: how dynamic are the games, and what makes them more so?

Owner: experiment worker. Code: `gridlab/experiments/` (`common.py` holds batches, caching, extended
metrics and statistics; then `baseline.py`, `diagnose.py`, `search.py`, `validate.py`,
`prior_compare.py`, `policy_mix.py`, `traces.py`, `report.py` and `settings.py`). Also
`gridlab/priors.py` (the code-reachable prior), one new mutator `flatten` in `gridlab/mutators.py`,
and dealer constraints in `gridlab/sim.py`. Every script prints markdown tables and caches each game
under `.cache/experiments/games/`. The command lines are in §9.

**Scope note.** The coordinator narrowed this worker to (1) the baseline across GridTypes,
(2) diagnosis and (3) an integrated search over COST_KNOBS, economy and dealer knobs with the
existing policies. Seven parallel sessions own the deep versions of the remaining topics: economy and
agent lifecycle, synergy atlas and dealer, realistic player policies, priors, mutator × rule
fairness, spirals and tension, and the GridType landscape. The prior comparison (§6) is only a quick
check. §8 lists the pending inputs from those sessions.

**Caveat that applies to everything below.** All players are simulated policies (`random`,
`greedy_private`, `saver`, `greedy_omniscient`; one-step lookahead on a random 24-object sample).
The "boil", fairness and policy results depend on these policies. Real players, who plan, focus on
particular objects and react, could change any of them. The robust results are the structural ones:
the hit rate per object, the low-entropy drift and the bijection churn. Each section marks where a
conclusion could flip with real players.


## 1. Method

**Games.** Each GameSpec is a GridType, a seed, 3–6 gods (uniform) and one policy per god, drawn iid
from the mix. The default mix is `random`, `greedy_private`, `saver` and `greedy_omniscient`, so family
and policy are independent by design. Specs come from their own RNG, so every setting is run on
*identical* specs (common random numbers) and comparisons are paired. Three disjoint seed ranges are
used: baseline/diagnosis (spec seed 1), search training (200000) and held-out validation (9000000).

**Real engine economy.** `interaction_rate_hz = 100` (lib/game-core `DEFAULT_SETTINGS`; the sim
default had been 20). Starting energy is 100, income 1/s, the agent cap 200, spawns 0.1 Hz and 10
starting objects. Game length is exponential with a 300 s half-life (mean 433 s) after 60 s of
planning. No rate scaling was needed: 100 Hz games run at about 1 game/s on 4 cores (≈ 11 CPU-s per
game). The `old` setting (`experiments/common.py: BASE`) spells every one of these values out
explicitly, so later default changes do not move it.

**Extended metrics** (`common.ext_metrics`, on top of `metrics.metrics`):

- *Per commit:* `sig_tension_rate` (a god gains ≥ 1 bit while another loses ≥ 1 bit),
  `steal_rate` (the owner gains ≥ 2 bits while another god loses ≥ 2), its bijection share, and
  `churn` (1 − net/gross change in salience).
- *At the 5 s snapshot timescale a watcher sees* (`snapshot_dynamics`):
  - `snap_autocorr`: the correlation of an object's salience from one snapshot to the next
    (memory; ≈ 0 means it flickers);
  - `snap_tension`: object-steps where one god gains ≥ 2 bits while another loses ≥ 2;
  - **held climbs**: ≥ 3 consecutive rising snapshots, ≥ 8 bits of gain, ≥ 2 owners committing
    inside the run, and the gain still ≥ 75% present 10 s later. *Accelerating* held climbs also
    have rising increments. This is the durable version of SPEC's cooperative spiral; the per-commit
    spiral fires on flicker;
  - **durable lead changes**: changes of the god leading an object (≥ 4 bits), counting only
    leadership spells of ≥ 10 s.
- *Standings:* pairwise leaderboard `crossings` per pair per 100 s, the share of gods with a
  ≥ 25% drawdown (`rise_fall_share`), and per-god mean-surprisal trajectories.
- *Fairness inputs:* per-god family, policy, rank, the draw's ceiling (surprisal of the family's
  exemplar), agents, spend, and gains/losses split into own agents versus others'.
- *Time bins (60 s):* agents, commits, owner-useful share, and gross and net Δ salience.
- *Mutator × family table:* commits, owner-up commits, owner Δs and peers' Δs.

**Objective: `dynamism2`** (`common.dynamism2`, a value in [0, 1]). The engine's `dynamism` (0.72 at
baseline) saturates on flicker: per-commit tension and spirals are mostly noise at 3.6 hits per
object per second. `dynamism2` measures what the user asked for at a human timescale:

| term | weight | definition |
|---|---|---|
| tension | 0.20 | ½·sq(durable lead changes per object per 100 s) + ½·min(1, snap_tension/0.3) |
| spirals | 0.20 | sq(held accelerating climbs per 100 s) |
| standings | 0.15 | ½·sq(crossings per pair per 100 s / 2) + ½·share of gods with a ≥ 25% drawdown |
| memory | 0.20 | max(0, snap_autocorr): "contiguous acceleration" needs values that persist |
| objects | 0.10 | share of objects that reach ≥ 20 bits of salience |
| liveness | 0.05 | min(1, late_activity/0.2) |
| variety | 0.10 | normalised mutator entropy |

sq(x) = x/(1+x). Memory is weighted as heavily as tension and spirals because there is a real
trade-off: more change per object raises tension and lowers memory. The objective should reward the
edge between the two, not either extreme.

**Fairness.** For each god-slot, z = (G − rank)/(G − 1), so 0.5 is fair for any number of gods. A
backfitted additive model z ≈ family + policy gives each family's *policy-adjusted* mean z. CIs are
from a bootstrap over games. Two summaries:

- the SD of the adjusted means across families with ≥ 10 slots, and its *excess over sampling
  noise*, sqrt(var − mean se²);
- the share of families whose 95% CI excludes 0.5.

The search cannot afford per-family samples, so it uses **structural unfairness**: the SD of the part
of z explained by family *features* (camp, ceiling bits, number of layers, symbol layer) after
removing policy effects. This is estimable from about 40 games. Search score:
J = dyn2 − 1.0·max(0, structural − 0.03) − 0.5·max(0, policy range − 0.15) − 0.01·(#mutators no family
uses for ≥ 2% of its commits).

## 2. Baseline (`old`, 800 games: 5 GridTypes × 160, mixed policies)

`python3 -m gridlab.experiments.baseline` (about 18 min wall, plus 6 min of first-time calibration).
Mean ± 95% CI half-width:

| metric | (3,base10,rgb) | (4,base12,rgb) | (5,base10,rgby) | (6,cards,rainbow6) | (7,base16,rainbow6) | all |
|---|---|---|---|---|---|---|
| dynamism (engine) | 0.745 ± 0.01 | 0.736 ± 0.013 | 0.726 ± 0.012 | 0.695 ± 0.011 | 0.695 ± 0.011 | 0.719 ± 0.006 |
| **dynamism2** | 0.505 ± 0.018 | 0.529 ± 0.019 | 0.551 ± 0.020 | 0.572 ± 0.023 | 0.590 ± 0.022 | **0.549 ± 0.009** |
| hits per object per second | 3.29 | 3.40 | 3.75 | 3.64 | 3.77 | 3.57 ± 0.14 |
| snapshot autocorrelation (memory) | 0.15 | 0.21 | 0.26 | 0.38 | 0.42 | 0.28 ± 0.02 |
| churn (1 − net/gross Δ salience) | 0.994 | 0.995 | 0.992 | 0.989 | 0.988 | 0.992 ± 0.001 |
| snapshot tension | 0.25 | 0.28 | 0.29 | 0.24 | 0.25 | 0.26 ± 0.01 |
| durable lead changes / object / 100 s | 0.57 | 0.75 | 0.95 | 0.95 | 0.93 | 0.83 ± 0.05 |
| held climbs / 100 s | 0.95 | 1.06 | 1.59 | 2.05 | 2.59 | 1.65 ± 0.20 |
| … of which accelerating | 0.61 | 0.66 | 0.98 | 1.21 | 1.54 | 1.00 ± 0.12 |
| leaderboard crossings / pair / 100 s | 4.0 | 3.5 | 3.1 | 2.7 | 2.5 | 3.13 ± 0.13 |
| lead changes after the first 10% | 26.9 | 20.8 | 14.5 | 13.3 | 10.9 | 17.3 ± 1.7 |
| gods with a ≥ 25% drawdown | 0.96 | 0.96 | 0.95 | 0.96 | 0.95 | 0.95 ± 0.01 |
| objects reaching ≥ 20 bits | 0.71 | 0.78 | 0.82 | 0.77 | 0.81 | 0.78 ± 0.02 |
| stagnation_frac (1 = never stagnates) | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| steal rate (per commit) | 0.037 | 0.038 | 0.027 | 0.014 | 0.014 | 0.026 ± 0.002 |
| mutator entropy (normalised) | 0.87 | 0.85 | 0.84 | 0.81 | 0.80 | 0.83 |
| agents at end (all gods) | 117 | 111 | 104 | 102 | 103 | 107 ± 6 |
| commits per game | 35k | 35k | 33k | 34k | 35k | 34k |

Per-commit SPEC metrics, for continuity: 8.3 spirals per 100 commits (mean length 2.6, max gain
often > 80 bits, 61% "accelerating"); tension_rate 0.34; sig_tension_rate 0.13.

**Do per-god surprisal trajectories vary, cross, rise and fall?**

- **Yes, too much and too fast.** Each object is rewritten 3–4 times a second. The per-god mean
  surprisal over the world wanders in a band of about 0.4–2 bits (SD over time ≈ 1.0 bit), and the
  per-god leader of mean surprisal changes about 15 times a game.
- **Total payoffs rise almost monotonically.** They grow with the number of objects, so the
  "rise and fall" is short drawdowns: 95% of gods have one ≥ 25% deep, with a mean maximum drawdown of
  72%. Leaderboard pairs cross about 3 times per 100 s.

Typical 5×5 game (sparklines of each god's mean surprisal, then total payoff, over 574 s):

```
rainbow_roads  greedy_omn r2 mean-s ▁▃█▄▄▃▅▃▅▂▂▂▂▄▁▃▃▂▃▂▄▃▂▂▂▃▁▁▂▂▂▃▁▁▁▁ 0.7–10.8  payoff ▁▂▆▄▃▃▄▃▄▂▂▂▃▅▂▅▄▃▆▅▇▇▄▄▇█▄▄▆▅▅▇▅▅▃▄
treasure_map   saver      r1 mean-s ▁▂▂▇▇▇▇█▄▅▄▃▃▃▁▄▁▄▅▄▃▂▅▃▅▂▅▂▄▄▃▂▂▃▄▃ 0.9–4.0   payoff ▁▁▃▃▄▃▅▄▄▂▃▂▂▄▂▄▃▃▅▅▆▅▅▄▇▅█▄▇▅▅▆▄▆▅▆
lone_peak      greedy_pri r4 mean-s ▅█▄▃▁▁▃▂▂▁▂▂▁▁▄▂▃▂▁▂▃▂▃▃▄▄▂▂▃▂▂▁▂▂▁▂ 0.1–2.3   payoff ▁▁▅▂▁▁▂▂▂▁▁▁▁▂▂▃▂▂▂▂▄▄▄▃▆█▃▄▆▃▃▃▃▄▂▃
constellation  random     r3 mean-s ▆▁▂▁▅▆▆▆▄▆▅▆▅▄▆█▆▄▄▆▃▃▃▅▇▅▅▄█▄▇▇▆▅▆▅ 0.2–1.4   payoff ▁▁▁▁▂▃▃▃▃▂▂▃▂▂▂▅▃▂▃▅▅▃▃▃▇▅▆▃█▄▅▇▆▆▄▄
```

**Fairness (policy-adjusted, 85 families with ≥ 10 god-slots).**

- **The game is strongly unfair across families.** The SD of the adjusted mean z is 0.178 (excess
  over noise 0.171). 56% of families have a 95% CI excluding 0.5. The excess is 0.18–0.20 in every
  GridType.
- **Clumpers beat alternators in every GridType:** the camp means of z are clumper 0.61, neutral
  0.49 and alternator 0.40, each ±0.03.

| top families | adj. z [95% CI] | win ratio | | bottom families | adj. z [95% CI] | win ratio |
|---|---|---|---|---|---|---|
| full_house | 0.92 [0.87, 0.97] | 3.6 | | tetromino_tamer | 0.11 [0.05, 0.18] | 0.30 |
| bullseye | 0.91 [0.85, 0.96] | 3.1 | | sudoku_scholar | 0.13 [0.07, 0.20] | 0.09 |
| snap | 0.87 [0.79, 0.93] | 3.2 | | quilt_maker | 0.14 [0.08, 0.21] | 0.13 |
| pinwheel | 0.81 [0.74, 0.88] | 2.3 | | number_sandwich | 0.19 [0.10, 0.29] | 0.09 |
| flush_royale | 0.79 [0.72, 0.86] | 2.3 | | odds_evens | 0.21 [0.15, 0.32] | 0.11 |
| uno_snake | 0.79 [0.73, 0.86] | 2.1 | | lantern_lighter | 0.23 [0.17, 0.30] | 0.11 |
| looking_glass | 0.77 [0.70, 0.83] | 2.0 | | column_addition | 0.25 [0.17, 0.36] | 0.23 |
| set_spotter | 0.77 [0.70, 0.82] | 1.8 | | robin_hood | 0.26 [0.17, 0.35] | 0.70 |
| stripe_painter | 0.76 [0.68, 0.86] | 2.1 | | lone_peak | 0.27 [0.19, 0.33] | 0.10 |
| mirrormancer | 0.75 [0.66, 0.84] | 2.0 | | king_of_the_hill | 0.27 [0.17, 0.39] | 0.53 |

Win ratio = wins / Σ(1/G); 1 is fair. **Policies:** saver 0.664 [0.642, 0.687] (win ratio 1.74),
greedy_private 0.499, greedy_omniscient 0.451 and random 0.398. Savers win in every GridType
(0.62–0.70).

**Mutators** (share of commits; owner-useful = share of its commits that raise the owner's surprisal):

| mutator | share | owner-useful | owner Δs / commit | peers Δs / commit | #families using it ≥ 2% |
|---|---|---|---|---|---|
| turn_block | 0.098 | 0.21 | +0.05 | −0.50 | 87 |
| shift_line | 0.095 | 0.21 | +0.06 | −0.45 | 87 |
| swap_cells | 0.084 | 0.17 | +0.11 | −0.32 | 87 |
| hue_turn | 0.077 | 0.26 | −0.05 | −1.08 | 87 |
| reverse_line | 0.072 | 0.19 | +0.11 | −0.40 | 87 |
| swap_colours | 0.070 | 0.25 | +0.08 | −0.83 | 87 |
| step_rank | 0.055 | 0.21 | +0.09 | −0.71 | 83 |
| swap_symbols | 0.055 | 0.19 | +0.18 | −0.37 | 87 |
| recolour | 0.039 | 0.38 | +0.98 | −0.33 | 75 |
| pattern_line | 0.037 | 0.41 | +0.74 | −1.01 | 72 |
| paint | 0.035 | 0.48 | +2.90 | +0.04 | 66 |
| swap_lines | 0.034 | 0.25 | +0.27 | −0.53 | 78 |
| sort_line | 0.033 | 0.27 | +0.37 | −0.52 | 76 |
| mirror_fold | 0.030 | 0.32 | +0.96 | −0.02 | 69 |
| majority_line | 0.027 | 0.34 | +0.88 | +0.05 | 52 |
| stamp | 0.026 | 0.36 | +1.52 | −0.02 | 48 |
| write_ramp | 0.023 | 0.45 | +1.47 | −0.41 | 32 |
| write | 0.022 | 0.46 | +2.94 | +0.33 | 33 |
| paint_by_key | 0.021 | 0.41 | +1.71 | −1.04 | 34 |
| blend | 0.018 | 0.32 | +0.71 | −0.19 | 25 |
| tally | 0.016 | 0.31 | +0.45 | −0.57 | 27 |
| motif | 0.015 | **0.70** | **+7.05** | **+0.58** | 24 |
| turn_grid | 0.009 | 0.28 | +0.56 | −0.34 | **2** |
| suit_swap | 0.005 | 0.12 | +0.30 | −0.22 | 4 (cards only) |
| suit_set | 0.002 | 0.23 | +0.82 | −0.14 | 2 (cards only) |

The top users of each mutator are in the `baseline` output (e.g. motif: Fair Weaver, Rainbow Steps,
Robin Hood; write: Snap, Full House, Constellation; mirror_fold: Mirrormancer, Looking-Glass,
Full House; write_ramp: Mountain Climb, Straight Shooter, Staircase Climber).

## 3. Diagnosis

`python3 -m gridlab.experiments.diagnose` (on the baseline batch).

### 3.1 Why games are static or dynamic: they boil

- **What a game is like.** Interactions arrive at 100 Hz and are spread over only 10 + 0.1·t objects.
  Each object is rewritten **3.6 times a second**, about 1,000 times in a game. Bijections make up
  61% of commits, and churn is 0.992: almost all salience change cancels.
- **Values don't persist.** At the 5 s timescale an object's salience has autocorrelation 0.28.
  Jackpots appear (78% of objects reach ≥ 20 bits at some point) and vanish within seconds. Only
  1.65 climbs per 100 s are *held* for 10 s, against 16.6 raw climbs.
- **Games never stagnate.** `stagnation_frac` is 1.00 everywhere. As agents pile up (35 → 207 over
  15 minutes), commits per second, the owner-useful share (0.27 → 0.25) and |Δ salience| per commit
  all stay flat. The interaction rate, not the agent count, sets the pace. Extra agents only change
  *which* random map hits an object. So the problem is the opposite of stagnation: a high-entropy
  boil that never builds.
- **What drives per-game dynamism** (Spearman ρ with dynamism2):
  - the number of gods (+0.50), because there are more owners to make climbs and lead changes;
  - the steal rate (+0.80), because it is the tension term;
  - hits per object per second (−0.54 with memory, −0.66 with held climbs);
  - games that run longer accumulate objects, which dilutes the boil (+0.54 with memory).

### 3.2 Which families win, and why: a shared low-entropy attractor

- **The ceiling explains little.** A family's ceiling correlates only +0.37 with its adjusted z.
  Draws below 10 bits do lose (mean z 0.35), but above 20 bits the ceiling hardly matters
  (0.51–0.53).
- **The world's drift explains almost everything.** The family's *final mean surprisal over the
  world's objects* correlates **+0.91**.
- **The mechanism.** Every overwrite erases information. Bijections cannot restore it, and only
  spawns add entropy. So the agent mixture drifts every object toward low-entropy grids: constant
  symbols, monochrome lines, repeated rows. Rules that count *equalities* score high on such grids
  whoever made them:
  - Full House (equal pairs in lines), Snap (equal neighbours), Bullseye (monochrome rings),
    Pinwheel, Flush Royale, Uno Snake;
  - Looking-Glass and Mirrormancer (a constant grid is a palindrome).
- **The losers need high-entropy structure.** These rules need *distinctness* or specific
  arrangements that the drift destroys: Sudoku, Quilt Maker (4 distinct colours per window),
  Tetromino, Number Sandwich, Odds & Evens, Lantern Lighter.
- **The free-ride share is not what differs.** Every family gets 57–74% of its gains from other
  gods' agents. What differs is whether the *direction* of the common drift is good for it. This is
  the "shared jackpot attractor", and the attractor is low entropy itself, not a particular
  coalition's motif. It is also why `saver` wins (§3.4).
- **The ceilings that are genuinely too low** (exemplar surprisal, uniform prior) are: Bridge
  Builder (3 bits at 3×3, 4 at 4×4, 7 at 5×5), Ladder of Numbers (3/5/7/12 bits), Sudoku at N ≤ 4
  (4–9), Lantern Lighter (6–14) and Wallpaper Weaver at N ≤ 4 (5–9). At 3×3 most families are below
  15 bits, since the type has only 2^25 colourings.

### 3.3 Mutators: churn, theft, the unused and the dominant

- **Bijections are churn, not currency.** The eight bijections take 61% of commits but help their
  owner on only 17–26% of them (+0.05 to +0.18 bits per commit) and cost peers 0.3–1.1 bits. They
  are cheap (12–15 bits), so `random` and the greedy policies buy many, and greedy's estimates over
  24 objects are noisy. mutators.md §1's argument holds: bijections redistribute and do not build. On
  a world of random grids, though, redistribution is just noise.
- **Theft is real but secondary.** 2.6% of commits are steals (owner +2, another −2). 31% of steals
  are by bijections; on small grids the rate is 3.7%.
- **The builders** are paint, write, motif, stamp, mirror_fold, majority_line and write_ramp. They
  are 40–70% owner-useful and neutral or positive for peers. motif is the single best tool per commit
  (+7 bits to the owner, +0.6 to peers, 70% useful) but rarely affordable (70 bits).
- **Unused:** turn_grid (2 families at ≥ 2%: 38 bits for a global redirect nobody needs on random
  grids) and the card-only suit_set and suit_swap. **Dominant:** none by usefulness; by volume the
  cheap bijections.

### 3.4 Policies: restraint beats action

- **The saver wins by doing less.** Savers summon 8.7 agents against about 30 for the other
  policies, leave 37% of their energy unspent, and still have the best mean z (0.66).
- **A god's own agents barely help it.** They raise its own surprisal on 26% of commits and lower it
  on 19%. They hit its jackpots as often as anyone else's, and most of every god's gain comes from
  the common drift.
- **Every extra agent adds to the boil that destroys your own best objects.** So spending is close to
  zero-sum noise, and the best policy is the one that spends least and most selectively.
- *Depends on the policies:* a real player who targets agents with guards ("only touch grids that
  are already good for me") could change this. greedy_private already prices guards, but evaluates
  only one-step Δ on a random sample.



## 7. Three real games (baseline, `old`)

`python3 -m gridlab.experiments.traces --manifest baseline-old-mixed-1` picks three games from the
baseline batch: the most held accelerating climbs, the most durable tug-of-war, and the lowest
dynamism2. It replays each one with programs recorded. (The replays use the current code, so the
counts can differ slightly from the cached game, because the program library key now includes the
`disabled` knob. The story is the same.)

**A "spiral" that is really one jackpot: Grid(6,cards,rainbow6), seed 200070, 3 gods, 1388 s.**

- **Rules:** Times-Table Territory (saver: the largest patch of cells whose numbers are in the 4
  times table), Sunset Sky (greedy_private) and Colour-by-Number (greedy_omniscient).
- **Tools:** the saver summoned only 9 agents (write ×4, stamp ×3, majority_line); the others had
  about 90 each, mostly swap_colours, turn_block, blend, swap_cells and hue_turn.
- **What happened:** the game has 32.7 held climbs per 100 s on paper, but the featured object shows
  what they are. Object #128 sat at 0.2–2 bits for 60 commits. Then a single `write` of Q (12, in the
  4 times table) over the grid took Times-Table to 77 bits in one step, and it stayed there.

```
t = 1335 s  s = [0.7, 2.5, 1.3]            t = 1365 s  s = [77.3, 7.5, 0.4]
 10♣O  6♣Y  6♠V  2♣G  4♥R  4♠G               Q♥R  Q♥Y  Q♥G  Q♥B  4♥R  Q♥O
  7♥R  4♥Y  3♣V  3♥R  A♦V  J♦R               Q♥R  Q♥G  Q♥G  Q♥O  4♥Y  Q♥G
 10♦B  9♦Y  2♠G  Q♥G  5♥B  Q♥B               Q♥G  Q♥G  Q♥G  Q♥R  4♥O  Q♥B
  Q♦Y  9♥G  2♠G  4♥G  4♥V  9♥Y               Q♥Y  Q♥G  Q♥G  Q♥R  4♥G  Q♥Y
  K♥R  6♠G  4♥O 10♦O  K♥G  7♦G               Q♥V  Q♥B  Q♥O  Q♥Y  4♥V  Q♥G
 10♥O  4♣R  6♠O  J♥G 10♦O  Q♦B               Q♥V  Q♥V  Q♥G  Q♥O  4♥O  Q♥V
```

This is the low-entropy attractor in one picture: a symbol fill is a 2^-77 jackpot for a "patch"
rule. Sunset Sky got a free 7.5 bits too, from the now-uniform columns. The Landauer pricing works
as designed (a whole-grid `write` costs 288 bits on this GridType, a row 53), but the saver,
which had banked 37% of its income instead of spending it on churn, could afford a whole-grid write
late in a long game (about 1,400 energy accrued by t = 1,335 s).

**Sharp tension: Grid(6,cards,rainbow6), seed 200015, 3 gods, 562 s.**

- **Rules:** Connect Four (saver: orange counters that must stand on orange), Bullseye
  (greedy_omniscient: monochrome rings from the outside in) and Straight Shooter
  (greedy_omniscient).
- **What happened:** Connect Four and Bullseye both want monochrome structure, but in incompatible
  shapes: columns versus rings. Object #6 was rewritten 1,460 times and changed hands in long spells:
  Bullseye at 10.9 → 15.8 bits (t = 30–60 s), dropping back to 6.5, then Connect Four taking over at
  14.0 (t = 120 s). The agents that touched it most were "reverse column 1" (Bullseye), "make
  column 5 all its most common colour, then slide…" (Connect Four), and Straight Shooter's
  symbol-only reversals, which do not affect the colour fight at all.
- **Result:** the final totals were 48.5k / 47.9k / 16.0k, so the top two finished 1% apart. This is
  the kind of game the user wants. It arises when two dealt rules want *overlapping but
  incompatible* structure.

```
t = 60 s  s = [15.8, 6.8, 2.9]          t = 150 s  s = [3.3, 0.6, 12.4]
 5♣Y  A♥O 10♠V  J♠V  J♠V  Q♦V            6♥R  8♥R 10♠R  J♠R  7♥R  9♣R
 A♥R  2♣O  6♠V  4♠R  Q♣V  K♦Y            Q♦V  6♠V  2♣V  4♠V  Q♣V  K♥V
 7♥R  K♦V  K♦V  7♠V  K♦V  A♥R            7♠V  K♦B  A♠B  8♥B  3♦B  Q♦B
 Q♦R  9♦O  A♠V  Q♥V  9♣V  Q♠V           10♥V  4♠B  2♠V  6♥V  6♦V  9♦V
 7♠Y 10♣O 10♠V  8♥V  K♣V  Q♥O            9♠Y 10♣Y 10♠Y  8♥Y  K♣V  Q♦Y
 3♣R  Q♦O  6♥R  Q♠V 10♥V  A♠V            6♣O  9♣O  K♠O  7♠O  3♦O  2♥O
```

**Stagnant: Grid(4,base12,rgb), seed 100083, 3 gods, 350 s (dynamism2 0.20).**

- **Rules:** Stepping Stones, Mountain Climb and Sudoku Scholar. All three are high-entropy
  "arrangement" rules, and Sudoku is all-or-nothing with a 9-bit ceiling at 4×4.
- **What happened:** 31k commits by 55 agents (swap_cells, reverse_line, shift_line, step_rank,
  write_ramp) churned every object, but no rule's surprisal ever held. Object #18's surprisal
  flickered between 0 and 13 bits, with autocorrelation 0.05. Final payoffs were 43 / 34 / 9:
  essentially zero.
- **Cause:** no god in this game benefits from the low-entropy drift, so nothing accumulates. This is
  the alternator's lot (§3.2).


## 4. Search around the edges

`python3 -m gridlab.experiments.search sweep|halving|ablate|front`. All candidates run on the same
training specs (spec seed 200000; paired). *Code version note:* the sweep and the halving ran on the
code before main's PR #7 merge (lex-packed ordinals, ESTIMATOR_VERSION 1). The held-out validation
(§5) re-ran everything that is reported as a before/after on the merged code (tuple ordinals,
strictly increasing surprisal, ESTIMATOR_VERSION 3). The old point scores dyn2 0.549 (baseline,
pre-merge) and 0.542 (held-out, merged), so the recalibration did not move the headline.

### 4.1 One knob at a time (40 games per point: 5 GridTypes × 8)

dyn2 SE ≈ ±0.02 per point. Structural unfairness and policy range carry about ±0.03 of noise at this
size.

| knob | value | J | dyn2 | struct. unfair | policy range | autocorr | held climbs/100 s | durable leads | crossings | hits/obj/s |
|---|---|---|---|---|---|---|---|---|---|---|
| **old** | – | 0.448 | 0.598 | 0.094 | 0.322 | 0.31 | 1.90 | 1.03 | 2.78 | 3.16 |
| cost_scale | 0.5 / 2 / 4 | 0.488 / 0.414 / 0.406 | 0.599 / 0.561 / 0.490 | 0.11 / 0.10 / 0.06 | 0.21 / 0.30 / 0.23 | 0.24 / 0.38 / 0.42 | 1.9 / 1.8 / 1.1 | 1.10 / 0.73 / 0.48 | 3.0 / 2.9 / 3.6 | 3.2 |
| starting_energy | 50 | 0.433 | 0.572 | 0.085 | 0.317 | 0.34 | 1.98 | 0.79 | 3.08 | 3.16 |
| energy_per_second | 0.5 / 2 | 0.389 / 0.485 | 0.597 / 0.606 | 0.11 / 0.10 | 0.40 / 0.25 | 0.34 / 0.30 | 2.3 / 2.1 | 0.97 / 1.01 | 2.7 / 3.1 | 3.2 |
| metabolic_cost | 0.002 / 0.005 / 0.01 / 0.02 | 0.43 / 0.48 / 0.46 / 0.43 | 0.584 / 0.588 / 0.585 / 0.590 | 0.12 / 0.07 / 0.10 / 0.10 | 0.27 / 0.29 / 0.28 / 0.33 | 0.31 | 2.0–2.2 | 0.92–0.99 | 2.9–3.1 | 3.2 |
| agent_half_life | 60 / 150 / 400 s | 0.49 / 0.41 / 0.47 | 0.608 / 0.603 / 0.588 | 0.07 / 0.09 / 0.09 | 0.31 / 0.42 / 0.27 | 0.48 / 0.36 / 0.33 | 2.9 / 2.7 / 2.2 | 0.89 / 0.89 / 1.03 | 2.5 / 2.9 / 3.1 | 3.1 |
| max_agents | 40 / 12 | 0.448 / 0.434 | 0.590 / 0.580 | 0.11 / 0.09 | 0.28 / 0.32 | 0.31 / 0.27 | 2.0 / 2.0 | 1.0 / 1.0 | 3.0 / 2.9 | 3.2 |
| **spawn_rate_hz** | **0.25 / 0.5** | 0.505 / 0.508 | **0.634 / 0.654** | 0.09 / 0.11 | 0.29 / 0.28 | **0.47 / 0.60** | **6.5 / 11.2** | 1.05 / 1.05 | 2.4 / 1.7 | **1.95 / 1.28** |
| **starting_objects** | **20 / 40** | 0.443 / 0.502 | **0.610 / 0.639** | 0.12 / 0.09 | 0.31 / 0.30 | 0.37 / 0.42 | 2.9 / 4.8 | 1.08 / 1.11 | 2.6 / 2.0 | 2.11 / 1.32 |
| dealer | balanced_camps | 0.405 | 0.582 | 0.138 | 0.287 | 0.30 | 1.55 | 1.08 | 3.15 | 3.22 |
| move | 0.15 / 0.7 / 1.2 | 0.45 / 0.43 / 0.45 | 0.592 / 0.604 / 0.599 | 0.11 / 0.13 / 0.09 | 0.28 / 0.32 / 0.32 | 0.31 / 0.34 / 0.38 | 2.0 / 2.3 / 2.8 | 0.93 / 1.12 / 1.03 | 3.1 / 2.6 / 2.4 | 3.1 / 3.1 / 2.9 |
| erasure | hartley | 0.423 | 0.580 | 0.113 | 0.299 | 0.29 | 2.03 | 0.87 | 2.89 | 3.17 |
| scope.global | 1.5 / 2.5 | 0.434 / 0.423 | 0.573 / 0.589 | 0.11 / 0.12 | 0.26 / 0.29 | 0.32 / 0.36 | 1.7 / 2.2 | 0.91 / 0.84 | 3.0 / 2.7 | 3.1 |
| kind.bijective | 0.5 / 2 | 0.448 / 0.464 | 0.582 / 0.603 | 0.09 / 0.11 | 0.30 / 0.27 | 0.29 / 0.35 | 1.4 / 2.5 | 0.87 / 1.11 | 3.1 / 2.4 | 3.29 / 2.65 |
| exclude_low_ceiling | < 20 bits | 0.398 | 0.587 | 0.086 | 0.418 | 0.29 | 1.43 | 1.08 | 3.13 | 3.17 |
| interaction_rate_hz (room setting) | 50 / 20 / 10 | 0.44 / 0.47 / 0.41 | 0.611 / 0.622 / 0.599 | 0.11 / 0.09 / 0.12 | 0.34 / 0.34 / 0.35 | 0.45 / 0.64 / 0.75 | 2.7 / 2.9 / 1.7 | 1.07 / 1.01 / 0.81 | 2.8 / 2.6 / 2.1 | 1.61 / 0.65 / 0.33 |

Readings:

- **Hits per object per second governs memory.** Everything that moves it (spawn rate, starting
  objects, the interaction rate, and to a lesser degree the price of bijections) moves memory and held
  climbs. The economy knobs (energy, metabolism, half-life, the agent cap) barely move it, because at
  a fixed 100 Hz the agent count only decides *which* map hits an object, not how often.
- **There is an interior optimum.** Below about 0.5 hits/object/s (rate 10 Hz, or spawns at 1 Hz with
  80 starting objects), memory keeps rising but climbs, tension and crossings collapse, because too
  little happens. The edge sits at about **0.4–0.7 hits per object per second**, 5–8× below the
  current 3.6.
- **No knob fixes fairness.** Structural unfairness stays in 0.06–0.14 across the board, which is
  noise around the old 0.09–0.10. Excluding low-ceiling families does not help either: their deficit
  is only a small part of the family spread (§3.2). No knob fixes the saver dominance (policy range
  0.21–0.42, noisy).

### 4.2 Random search + successive halving

18 points (6 hand-seeded from §4.1, 12 random over the 17-knob space) were evaluated at 40 games, the
top third at 120, and the top 2 at 320.

| rung | # | J | dyn2 | struct. unfair | policy range | autocorr | held climbs | durable leads | crossings | hits/obj/s | point (changes from old) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2 (320 games) | **A** | **0.531** | **0.647 ± 0.007** | 0.091 | 0.261 | 0.69 | 17.3 | 1.06 | 1.16 | 0.47 | metabolic 0.01, agent half-life 400, max_agents 12, spawn 0.5, start 80, dealer uniform, erasure hartley, bijective ×2, exclude < 20 bits, flatten on |
| 2 (320) | B | 0.480 | 0.625 ± 0.008 | 0.109 | 0.282 | 0.40 | 5.7 | 1.10 | 2.37 | 1.57 | cost_scale 0.5, metabolic 0.005, spawn 0.25, start 20, flatten on |
| 1 (120) | | 0.506 | 0.641 | 0.107 | 0.267 | 0.63 | 12.5 | 0.92 | 1.77 | 0.73 | income 2/s, agent half-life 60, spawn 0.5, start 40 |
| 1 (120) | | 0.501 | 0.659 | 0.085 | 0.335 | 0.78 | 22.1 | 0.94 | 1.28 | 0.34 | 15 changes incl. spawn 1.0, start 80, max_agents 12, require cross-layer, balanced camps |
| 1 (120) | | 0.498 | 0.668 | 0.150 | 0.250 | 0.44 | 8.2 | 1.31 | 1.97 | 1.30 | energy 200, metabolic 0.005, spawn 0.25, start 20, balanced camps, bijective ×2, exclude, flatten |
| 1 (120) | | 0.487 | 0.643 | 0.108 | 0.305 | 0.68 | 16.0 | 0.98 | 1.40 | 0.50 | spawn 0.5, start 80, require cross-layer, flatten |
| 0 (40) | worst | 0.285 | 0.376 | 0.113 | 0.166 | 0.95 | 0.38 | 0.13 | 0.97 | 0.33 | cost ×2, energy 50, income 0.5, metabolic 0.02, max_agents 12 … (frozen world) |

**Pareto trade-offs** (all points with ≥ 120 games: dyn2 ↑, structural unfairness ↓, policy range ↓).
The front is short, and every member shares "more objects":

- the 0.66–0.67 dyn2 points (0.34–1.3 hits/obj/s) buy dynamism with either structural unfairness
  (0.15) or policy range (0.34);
- point A (0.647) is the best balance;
- B (0.625) keeps more tension and crossings (1.6 hits/obj/s) at lower memory.

Along the front the trade-off is **memory and climbs against per-object tension and leaderboard
crossings**. The fairness axes are flat: no point reaches structural unfairness below 0.085 or a
policy range below 0.25 at ≥ 120 games.

<!-- REST -->

