# Exploration: mutator × rule fairness

Session topic: `mutators` (branch `claude/gridlab-explore-mutators`). Code: `gridlab/explore/mutators/`.

**No shared module was edited.** Every proposal is a *preset* in `gridlab/explore/mutators/variants.py`
(cost-knob overrides plus named variants). A variant swaps `Mutator` objects in `gridlab.mutators` at run
time or, for `composite`, patches `Program.ratchet_bits`; `install_preset(name)` undoes everything. Each piece
can be adopted on its own; §7 lists exactly what to port.

## 0. Summary

* **Method.** The landscape is a calibrated yield matrix: mean Δ surprisal per bit of program cost. Surprisal
  comes from the engine's survival tables, up to about 70 bits; the old `affinity.py` capped it at 12. The
  search is exhaustive over the 7.8k single-step programs (5×5) and uses a beam over 2–3-step programs. It
  was run on 4 GridTypes, for 82–88 families with 3 draws each, in 6 contexts of starting states. Selection
  is on training states and every number is on held-out states.
* **The landscape is less unfair than suspected, and also unfair in different places.** On
  Grid(5,base10,rgby) the median route yield is 0.42 bits/bit and 77% of families lie within ½–2× of it.
  - Seed 2 has a 2-step route at 0.39 bits/bit (chessboard + write 9 everywhere).
  - Rummy is at 0.39, Lone Peak at 0.26.
  - The truly starved families have low ceilings (Sudoku 9 bits, Ladder 7, Bridge 7, Lantern 12) or arithmetic
    and relational goals that no mutator expresses (Number Sandwich, Magic Accountant, Round Numbers, Magic
    Window, Odds & Evens, Tetromino, Far Apart).
  - On 6×6 cards, Rummy (0.15), Lone Peak (0.07) and Seed 2 (0.07) *are* starved.
* **Advantaged families come from one pricing hole.** A program's erasure is the sum of its steps' erasures
  *at the prior*. "Paint everything X, then stamp s on every X cell" is a fill of both layers (133 bits erased)
  priced as 50 + 21 bits. That makes Lucky Token, Seed 3, Number Painter, Treasure Map and Knight Riders reach
  their 76–133-bit jackpots at 1.25 bits/bit, 3× the median, on every GridType.
* **Whole-grid overwrites are the best tool for about 60 of 82 families** (paint all, motif, write all). The
  broadest single settings are `write all <s>` (≥5 bits for 17 families) and `paint all <c>` (14); `motif`
  serves 9. The coalition jackpot is the constant grid more than the wallpaper.
* **Bijections are never the best tool on spawn-like states, as the Landauer bound predicts.** They are the
  best tool for theft. On rival jackpots `swap_colours` yields up to 3.7 bits/bit (best for 22 families), and
  the median theft yield is 2.4–3.2× the building yield.
* **In simulated games, what decides fairness is how *findable* good programs are, more than how good the
  best one is.** Across families, game outcome (policy-adjusted rank score) correlates with the
  random-library best-of-12 yield at ρ = 0.81 [0.69, 0.89], with the searched route yield at 0.60, and with
  the ceiling at 0.33.
* **Proposal `full`** = four new mutators (`tile`, `unclash`, `crown`, `balance`) + composite erasure pricing
  + worst-case motion for bijections. In the landscape:
  - SD of log2 route yield 0.91 → 0.82;
  - advantaged families 3 → 1;
  - cheapest jackpot rate 0.95 → 0.59;
  - theft median 1.0 → 0.76 bits/bit;
  - every mutator except `flatten` is the best single-step tool for some family in some context, and
    `flatten` is the second step of Lone Peak's best route.
  In 600 paired games the SD of family scores falls 0.189 → 0.175 (paired 95% CI of the difference
  [−0.022, −0.004]) and payoff Gini falls 0.264 → 0.254, with no loss of dynamism. §5 gives the held-out,
  expert and ablation results.

## 1. Method

### 1.1 Landscape (`landscape.py`, `report.py`)

For each GridType, family and draw (3 fixed draws per family, `states.draws_for_type`), and for each
context:

1. Apply **every** parameter setting of every mutator to the context's states (`Mutator.space`;
   7822 steps at 5×5, 4936 at 4×4, 36k at 6×6 cards, 2218 at 3×3). Score with the draw's calibrated table
   (`gridlab.calibrate.survival`).
2. Per mutator, pick the parameters with the best **training** yield (mean Δs / cost of the one-step program,
   no-ops count as 0). Report its **held-out** mean Δs and yield. The states are split by interleaving.
3. Beam search over unguarded 2- and 3-step programs (game context only):
   - seeds are the top single steps by yield and by Δs;
   - extensions are, per mutator, the top 6 by Δs, the top 4 by yield and 3 random settings, plus every
     whole-grid setting (v2);
   - steps are appended and prepended;
   - the top 24 are priced exactly (`Program.cost`, ratchet probe included) and the best is tested on held-out
     states.
   The best-of-search ("route") is a lower bound on what a skilled player can do.
4. Jackpot price: the cheapest program that lifts at least half the held-out states to ≥ ¾ of the draw's
   ceiling (`s(exemplar)`). The jackpot *rate* is ¾·ceiling / price.

Contexts (`states.py`, all deterministic and cached in `.cache/explore_mutators/`):

| context | states (train + test) | meaning |
|---|---|---|
| game | 64 fresh + 64 mid | what an agent meets in a game (the main matrix) |
| fresh | 64 uniform spawns | the prior |
| mid | 64 objects sampled from 16 simulated games (mixed policies, engine defaults at 100 Hz, t ≥ 30 s) | structure built by play |
| near | 32: own exemplar with 1–4 random cell resamples | completion |
| rival | 32: exemplars of *other draws of the same family*, 0–2 cells perturbed | theft |
| foreign | 64: exemplars of random families, 0–2 cells perturbed | redirecting others' structure |

Command lines (4 cores):

```
python3 -m gridlab.explore.mutators.prep "5,base10,rgby"                    # survival tables for the draws
python3 -m gridlab.explore.mutators.landscape --type 5,base10,rgby [--preset full]   # 25-30 min at 5x5
python3 -m gridlab.explore.mutators.report --type 5,base10,rgby [--preset full] [--full]
python3 -m gridlab.explore.mutators.roles --presets default,full            # best-tool counts per context
python3 -m gridlab.explore.mutators.reprice --base full --presets full,full_wm50,...   # exact 1-step re-pricing
python3 -m gridlab.explore.mutators.libyield [--preset full]                # what the simulated gods can find
python3 -m gridlab.explore.mutators.games --presets default,full --games 600 --seed 1      # 9000000 = held out
python3 -m gridlab.explore.mutators.paired --a default --b full             # paired bootstrap of differences
python3 -m gridlab.explore.mutators.predict --preset default                # which measure predicts game outcome
python3 -m gridlab.explore.mutators.test_newmuts                            # contract tests for new mutators
```

### 1.2 Games

`games.py` runs `experiments.common.run_batch`:
* engine defaults at 100 Hz (`BASE`);
* 3–6 gods, policies iid from {random, greedy_private, saver, greedy_omniscient};
* dealer `distinct`, exponential length (half-life 300 s);
* the same game specs for every preset (common random numbers);
* training specs from seed 1, held-out specs from seed 9000000.

Fairness is reported as:
* per family, the policy-adjusted mean rank score z (0.5 = fair), with a game-bootstrap 95% CI;
* the SD of z across families;
* the share of families whose CI excludes 0.5;
* `paired.py`: the difference between presets under a paired bootstrap over specs.

Mutator usage is reported as entropy and as the number of mutators used for ≥ 2% of a family's commits.

## 2. The default landscape (Grid(5,base10,rgby), v2 search)

Per-family numbers are in Appendix A. Policy-independent findings:

**2.1 The spread is moderate, not extreme.**
- Route yield (held out): median 0.42 bits/bit, p10 0.17, p90 0.69. SD of log2 0.91; 77% of families lie
  within ½–2× of the median.
- The Landauer bound (docs/mutators.md §1b) holds empirically: no family exceeds 1.26 bits/bit on spawn-like
  states, and the jackpot routes for whole-grid targets sit at 0.5–0.7.
- Mid-game objects are close to the prior. Mean own surprisal is 2.0 bits mid-game against 1.1 for fresh
  spawns, and per-family best yields on fresh and mid-game states correlate at r = 0.92. Gods mostly meet
  near-random objects.

**2.2 The suspected starved families, checked.**

| family | 5×5 route | best route found | 6×6 cards route | verdict |
|---|---|---|---|---|
| seed2_patchwork | 0.39 | 2-step: chessboard motif + write 9 everywhere (189 bits) | 0.07 | fine for a planner at 5×5, starved on cards |
| lone_peak | 0.26 | 3-step: tally + flatten (189 bits) | 0.07 | below median; starved on cards |
| rummy_melder | 0.39 | 2-step: write + write | 0.15 | fine at 5×5, starved on cards |

The families that really are starved fall in two groups:
- **Low ceiling.** A program costs at least about 12 bits, so yield ≤ ceiling / 12.
  - Sudoku Scholar (9 bits): its top state is the all-distinct rows/columns structure, which no mutator
    reaches cheaply.
  - Ladder of Numbers (7), Bridge Builder (7), Lantern Lighter (12), Column Addition (16).
  - This is a rule-design issue (§7.4).
- **Relational or arithmetic goals.** Number Sandwich, Magic Accountant, Round Numbers, Magic Window,
  Odds & Evens, Tetromino Tamer, Far Apart, Feuding Families, Fillomino, Snake Charmer, Stepping Stones,
  Quilt Maker. No mutator writes "a line that sums to T", "a proper colouring" or "a unique peak".

**2.3 Advantaged families: one pricing hole.** On every GridType, Lucky Token and Seed 3 are > 2× the
median (1.1–1.7 bits/bit), followed by Number Painter, Treasure Map, Knight Riders, Seed 1 and Twin
Friends.

| GridType | advantaged families (> 2× median route yield) |
|---|---|
| 5×5 | Lucky Token 1.26, Seed 3 1.24, Conqueror 0.87 |
| 4×4 | Lucky Token, Seed 3, Seed 1, Knight Riders, Treasure Map, Twin Friends, Number Painter |
| 6×6 cards | Lucky Token 1.66, Seed 3 1.26, Conqueror 0.90 |

The landscape finds the same route every time: *"paint the whole grid X, then stamp s on every X
cell"*. Twin Friends uses chessboard + tally.
- The program is a fill of both layers, so the composite erases N²(log2 C + log2 S) = 133 bits at 5×5.
- Program cost adds the steps' erasures *at the prior*: paint-all 50, then stamp on X cells n/C·log2 S =
  21. `write all` alone costs more (119) than the pair (105).
- docs/mutators.md §6.2/§6.4 anticipated this undercharge *across* agents. It also happens *inside one
  program*, where pricing is fully under the designer's control.

**2.4 Whole-grid jackpots dominate the best-tool map.** In the game context the best single tool for a
family is `paint` (21 families), `motif` (20), `write` (18), `stamp` (7), `write_ramp` (6), `tally` (3),
`recolour`/`paint_by_key` (2), or `sort_line`/`mirror_fold`/`hue_turn` (1). About 60 families are best
served by a whole-grid overwrite.

The broadest single settings, with the number of families gaining ≥ 5 bits:

| setting | families gaining ≥ 5 bits | salience yield (summed over 82 families) |
|---|---|---|
| `write all 5` (119.5 bits) | 17 | 4.6 bits/bit |
| `paint all red` (71.4 bits) | 14 | 3.8 bits/bit |
| `flatten all` | 14 | – |
| best `motif` | 9 | 2.6 bits/bit |

So docs/mutators.md §6.2 named the wrong jackpot. The constant grid (symbol or colour) is the broadest
coalition attractor; the wallpaper comes second.

**2.5 Bijections: theft, not construction.**
- Single-step bijections have yield ≈ 0 in the game, fresh and mid contexts, as the KL bound says they must.
- In the rival context (another draw's jackpot) `swap_colours` is the best tool for 22 families, with max
  3.7 bits/bit (Treasure Map). `turn_grid` is best for 6 (Rummy, Staircase, Straight Shooter, Stripe,
  Sunset, Young Tableau), and `swap_symbols` for 6.
- In the near/completion context `swap_cells` (8 families) and `shift_line` (3) are the best tools.
- Median theft yield is 1.0 bits/bit, 2.4× the median building yield (3.2× for the best single step).
- The 13.5-bit global colour swap of §6.3 is real: one swap moves a 50-bit Conqueror jackpot.

**2.6 Unused and dominant mutators.**
- *Dominant:* `paint` and `motif` (game context), `stamp` (completion: best for 16 families).
- *Never the best single-step tool anywhere:* `flatten`. It is worth keeping only as the second step of
  Lone Peak's route.
- *Nearly unused as a best tool:* `blend` (1 family, completion), `reverse_line` (1, rival), `turn_block`
  (1+1), `sort_line` (1).
- In games every mutator is still committed: positional bijections take 7–11% of commits each and are used
  by ≥ 77 families. They churn objects without being anyone's best tool (§5).
- `turn_grid` is the least used in games: 0.7% of commits, ≥ 2% of commits for only 1 family.

## 3. Other GridTypes (default preset, v1 search, which is narrower than v2: route yields are lower bounds)

| GridType | median route yield | SD log2 | share ½–2× | starved (< ½ median) | advantaged |
|---|---|---|---|---|---|
| Grid(3,base10,rgb) | 0.33 | 0.79 | 0.83 | 9 (Sudoku 0.05, Ladder, Tetromino, Bridge, Magic Window, Odds & Evens, Number Sandwich, KotH, Snake) | Seed 1, Seed 3, Lucky Token, Conqueror (0.86–0.88) |
| Grid(4,base12,rgb) | 0.38 | 1.11 | 0.70 | 17 | Lucky Token 1.11, Seed 3, Seed 1, Knight Riders, Treasure Map, Twin Friends, Number Painter |
| Grid(5,base10,rgby) (v1) | 0.42 | 1.00 | 0.73 | 19 | Lucky Token 1.26, Seed 3 1.24, Conqueror 0.87 |
| Grid(6,cards,rainbow6) | 0.39 | 1.36 | 0.67 | 24, incl. Card Windmill 0.01, Robin Hood 0.03, Lone Peak 0.07, Seed 2 0.07, Rummy 0.15 | Lucky Token 1.66, Seed 3 1.26, Conqueror 0.90 |

Fairness worsens with grid size and alphabet: bigger grids raise the cost of the whole-grid routes that
relational families need. Card-only mutators matter on cards:
- `suit_set` is the best tool for Card Windmill, Flush Royale and Pinwheel;
- `suit_swap` is best only for theft (Court Parade, rival).

## 4. Changes and why

### 4.1 `composite`: price a program's erasure as a whole (fixes §2.3)

Surcharge = max(0, pinned_bits(P(x)) − Σ_steps E_step). Here pinned_bits is the existing ratchet-probe
measure: log2 |alphabet| for each cell-layer that takes the same value in ≥ 7/8 of 24 probe spawns after
**one** application. The ratchet surcharge measures the same thing for the closure.
- For one unguarded step, pinned ≤ E, so nothing changes. Guards lower the pin rate and are spared.
- The surcharge touches 0.3% of the random multi-step programs in the policy library (mean +9 bits). It is
  aimed at the exploit.
- "paint all X + stamp s on X" goes from 105 to 167 bits. Lucky Token falls from 1.26 to 0.79 bits/bit,
  Seed 3 from 1.24 to 0.94, Number Painter from 0.78 to 0.55, Treasure Map from 0.71 to 0.49.
- The cheapest jackpot rate (¾·ceiling per bit) falls from a max of 0.95 to 0.59. The median is unchanged
  (0.41 → 0.39).

### 4.2 New mutators (`newmuts.py`, variant `extra`): routes for relational goals

All four mutators are deterministic and idempotent (`test_newmuts`: 6750 checks over the 60 GridTypes), and
are priced by the same five terms.

| mutator | what it does | erasure | designed for | effect (5×5 route yield, default → full) |
|---|---|---|---|---|
| `crown` | in an area, the first highest number takes colour X; any other cell of that number drops by one (unique peak) | log2 C + E[#ties] bits; measure log2 n | Lone Peak, KotH | Lone Peak 0.26 → 0.42 (crown + flatten, 2 steps); best 1-step tool for Lone Peak |
| `balance` | the last cell of a row (or of every row) becomes what makes the line sum to T, or to a multiple of the base | log2 S per line where it fires | Round Numbers, Magic Accountant | Round Numbers 0.17 → 0.47; Magic Accountant 0.13 → 0.30; Twenty-One best tool |
| `unclash` | raster sweep: a cell equal to its upper/left neighbour takes a colour none of its neighbours has (proper colouring); the alternators' counterpart of `majority_line` | E[#changed]·log2 C (an upper bound) | Seed 2, Quilt Maker, chessboard families | Quilt Maker 0.19 → 0.40; Seed 2 0.39 → 0.53 (write 9 everywhere + unclash) |
| `tile` | copy the top-left k×k square periodically over the grid (colours, symbols or both) | (N² − k²)·layer bits | Looking Glass, Wallpaper Weaver, Odds & Evens | Wallpaper Weaver 0.38 → 0.47, Looking Glass 0.43 → 0.48; Odds & Evens unchanged (0.16 → 0.17) |

`tile` is the weakest. It is a priced-fair generalisation of `motif`/`mirror_fold`, but in games it gets
0.3% of commits. `crown`, `unclash` and `balance` are picked up broadly (2.8%, 4.5% and 2.0% of commits; used
for ≥ 2% of commits by 66, 69 and 36 families).

### 4.3 `worstmove`: bijections pay motion at the worst case (fixes §2.5)

A bijection erases nothing, so its only real price is motion: the cells it changes. Motion is charged at the
prior's expectation, 2n/C cells for a colour swap, while theft is bought for the jackpot case, where all n
cells change. `worstmove` charges the maximum cells changed over a probe pool: spawns, the structured
reference pool, constant grids and two-colour halves. This is the Hartley analogue for motion.
- Global `swap_colours`: 13.5 → 26.7 bits.
- Theft median: 1.0 → 0.76 bits/bit. Theft/build ratio of medians: 2.4× → 1.7× for routes, 3.2× → 2.3× for single steps.

The cost is that `swap_colours` and `swap_symbols` stop being the best tool for theft: they drop from
22 + 16 families to 2 + 1 (rival + foreign). The softer **`worstmove50`** (half prior, half worst case) keeps
them as the theft tool for 13 + 10 families and still cuts the 1-step theft ratio from 3.1× to 2.7× (§5.4).

### 4.4 Tried and not recommended

- **`structured`**: pointwise erasure and motion priced at ½·prior + ½·(structured reference pool).
  - It is principled: under the uniform prior, Shannon erasure equals mean pointwise erasure
    E[log2 |f⁻¹(f(x))|], so this is its natural state-dependent generalisation.
  - It barely moves prices (global `swap_colours` 13.5 → 14.2, recolour all 24.3 → 26.2), and the single-step
    landscape is unchanged (share ½–2× 0.57 → 0.59).
  - A fixed reference cannot price *targeted* use: the agent is bought for the jackpot, not for the average
    object.
- **Knob changes alone** (exact single-step re-pricing, `reprice.py`): `move` 0.7/1.0/1.5, `step_base`
  0.25/0.5, `agent_base` 0, `scope.global` 1.25/1.5, `kind.bijective` 1.5/2, `erasure` hartley, `describe` 0.5,
  `erase` 0.8/1.25.
  - None changes the SD of log2 single-step yield by more than 0.09 (1.45 → 1.36 at best, `global1.5`).
  - Starved families lack a tool; they are not overpriced.
  - `hartley` makes things worse (share ½–2× 0.57 → 0.48) because it overcharges the conditional maps.
  - `scope.global` 1.25 on top of `full` compresses the top (p90 0.66 → 0.54) but gives no further fairness
    gain in games (§5.1), so it is not recommended.

## 5. Validation in full simulated games (Grid(5,base10,rgby))

Setup: 600 games per preset per spec seed. Seed 1 is the training specs and 9000000 the held-out specs. The
specs are paired across presets (§1.2). Throughput is about 1.3–1.7 s per game per core.

### 5.1 Headline (train / held out / pooled)

| statistic | default | full | Δ, paired 95% CI |
|---|---|---|---|
| SD of family adj. z, train (seed 1) | 0.189 | 0.175 | −0.014 [−0.022, −0.004] |
| SD of family adj. z, held out (seed 9000000) | 0.187 | 0.179 | −0.009 [−0.018, +0.001] |
| SD of family adj. z, pooled (1200 specs) | 0.184 | 0.173 | −0.011 [−0.018, −0.005] |
| mean \|z − 0.5\| over families, pooled | 0.145 | 0.132 | −0.013 [−0.019, −0.004] |
| payoff Gini, pooled | 0.263 | 0.252 | −0.011 [−0.016, −0.005] |
| share of families whose CI excludes 0.5 (train / held out) | 0.65 / 0.52 | 0.52 / 0.45 | – |
| effective number of mutators used (perplexity of commit shares; train / held out) | 19.8 / 19.7 | 22.6 / 22.4 | +2.8 |
| mutators with ≥ 1% of commits | 23 | 26 | – |
| dynamism (train / held out) | 0.724 / 0.717 | 0.726 / 0.717 | n.s. |
| tension (sig_tension_rate) | 0.125 / 0.128 | 0.131 / 0.132 | ≈ +0.005 |
| share of steals done by bijections | 0.288 / 0.298 | 0.250 / 0.258 | −0.04 |
| lead changes per 100 s | 5.34 / 4.89 | 5.65 / 4.90 | n.s. |

*Normalised* mutator entropy falls slightly (0.834 → 0.824) only because the denominator grows from
log 24 to log 28. The absolute entropy rises from 4.31 to 4.50 bits.

`full+global1.25` (train only): SD 0.175, the same as `full`; Gini 0.246; it loses `motif` usage
(1.3% → 0.7%). Not recommended.

### 5.2 Per family (pooled 1200 paired specs, Δ adj. z with paired 95% CI)

| family | default | full | Δ [95% CI] | landscape change (route yield) |
|---|---|---|---|---|
| quilt_maker | 0.10 | 0.33 | **+0.23 [+0.13, +0.34]** | 0.19 → 0.40 (`unclash`) |
| fair_weaver | 0.35 | 0.52 | **+0.17 [+0.08, +0.28]** | 0.26 → 0.26 (less theft? unexplained) |
| round_numbers | 0.41 | 0.53 | **+0.12 [+0.04, +0.19]** | 0.17 → 0.47 (`balance`) |
| rummy_melder | 0.59 | 0.68 | **+0.09 [+0.03, +0.16]** | 0.39 → 0.44 |
| seed3_green_ones | 0.56 | 0.66 | +0.09 [+0.00, +0.19] | 1.24 → 0.94 (composite: the sim gods never found the exploit) |
| lone_peak | 0.27 | 0.33 | +0.06 [−0.05, +0.15] | 0.26 → 0.42 (`crown` + flatten) |
| robin_hood | 0.17 | 0.23 | +0.06 [−0.00, +0.14] | 0.30 → 0.30 |
| seed2_patchwork | 0.38 | 0.41 | +0.03 [−0.04, +0.10] | 0.39 → 0.53 |
| odds_evens | 0.21 | 0.24 | +0.03 [−0.06, +0.12] | 0.16 → 0.17 |
| magic_accountant | 0.39 | 0.35 | −0.03 [−0.10, +0.03] | 0.13 → 0.30 |
| lucky_token | 0.53 | 0.52 | −0.01 [−0.08, +0.08] | 1.26 → 0.79 |
| number_painter | 0.47 | 0.39 | −0.08 [−0.18, +0.01] | 0.78 → 0.55 |
| knight_riders | 0.66 | 0.60 | −0.06 [−0.13, +0.03] | 0.75 → 0.76 |
| stripe_painter | 0.81 | 0.76 | −0.05 [−0.10, +0.01] | 0.54 → 0.54 |
| snap / full_house | 0.91 / 0.91 | 0.90 / 0.92 | ≈ 0 | 0.58 / 0.53 (unchanged) |

### 5.3 What decides fairness in the *simulated* games (policy-dependent)

Spearman ρ across the 82 families between game adj. z (default, train) and static measures:

| predictor | ρ [95% CI] |
|---|---|
| library best-of-12 yield (what one greedy decision sees) | **+0.81 [+0.69, +0.89]** |
| passive gain: mean positive Δs from a random library agent (anyone's) | +0.78 [+0.64, +0.86] |
| landscape best single-step yield | +0.67 [+0.51, +0.78] |
| library share of programs with positive yield | +0.62 [+0.46, +0.75] |
| landscape route yield (skilled play) | +0.59 [+0.43, +0.70] |
| calibrated ceiling | +0.33 [+0.13, +0.50] |

Under `full` the library best-of-12 gives ρ = 0.82, and in the expert condition 0.86. So the simulated gods
are limited by *what a random 4096-program library contains*:
- the median best-of-12 library yield is 0.03 bits/bit against 0.42 for the searched route;
- a family is helped when its goal lies in the basin of common actions, both its own and other gods'
  agents.

Snap, Full House, Bullseye and Pinwheel (z ≈ 0.9) have only middling route yields (0.46–0.58), but the
largest library yields (0.12–0.15) and passive gains. Constant fills (`write all s`, `flatten`) and
line-level writes push grids into their upper sets whoever summons them.

This is why the landscape fixes move game fairness only modestly (a 6% lower SD): the remaining in-game
spread is mostly library prevalence and ceilings. It is a property of the simulator's policies and does not
carry over to skilled players.

**Expert condition** (`default+recipes` vs `full+recipes`). 20% of library slots are offered to a public
recipe book of the landscape's best programs (about 1100 per preset; `variants.recipe_book`). The family SD
falls by the same amount (pooled −0.010 [−0.015, −0.003]), and tension and steals rise (sig_tension 0.14,
steal rate 0.034). Even here the landscape route yield predicts game z at only ρ = 0.60, the same as without
recipes. Gods still pick from 12 random candidates, so a recipe for one's own family is rarely among them.
A real skilled player would search *for their own utility*, so the landscape is the better guide for game
design. The simulated numbers are a lower bound on how much the fixes matter.

### 5.4 Ablation: which part moves the games (train specs, 600 paired games)

| preset | SD family z | Δ vs default [95% CI] | payoff Gini | share of steals done by bijections | mutators ≥ 1% |
|---|---|---|---|---|---|
| default | 0.189 | – | 0.264 | 0.288 | 23 |
| `extra` (4 new mutators only) | 0.177 | −0.013 [−0.021, −0.002] | 0.251 | 0.259 | 26 |
| `composite+worstmove` (pricing only) | 0.189 | −0.000 [−0.009, +0.010] | 0.264 | 0.285 | 23 |
| `full` | 0.175 | −0.014 [−0.022, −0.004] | 0.254 | 0.250 | 26 |

In the simulated games the new mutators do all the work. The pricing changes have no measurable effect on
game fairness, because the simulated gods almost never draw the programs they reprice: the paint+stamp
combo, and global colour swaps aimed at a jackpot. The pricing changes are justified by the
policy-independent landscape (§2.3, §2.5, §4.1, §4.3), which describes what a deliberate player can do. Their
in-game cost is nil: dynamism, tension and lead changes are unchanged within CIs.

<!-- TYPES -->
