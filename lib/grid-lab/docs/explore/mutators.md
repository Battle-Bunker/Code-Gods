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

Focused v2 search on 6×6 cards for the suspected families (`focus_landscape.py`, 3 draws each), default →
full:

| family | default | full | full route |
|---|---|---|---|
| Lone Peak | 0.14 | 0.31 | crown + flatten |
| Seed 2 | 0.07 | 0.23 | unclash + write Q everywhere |
| Quilt Maker | 0.13 | 0.21 | – |
| Rummy | 0.17 | 0.14 | crown + flatten + step |
| Card Windmill | 0.01 | 0.01 | – |

Rummy and Card Windmill stay starved on cards (§7.4).

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

### 5.5 Other GridTypes (300 paired games each, train specs)

| GridType | SD family z default → full | Δ [95% CI] | payoff Gini Δ | mutators ≥ 1% |
|---|---|---|---|---|
| Grid(4,base12,rgb) | 0.180 → 0.193 | +0.012 [−0.003, +0.023] | −0.002 [−0.012, +0.008] | 24 → 26 (pooled with cards) |
| Grid(6,cards,rainbow6) | 0.189 → 0.181 | −0.008 [−0.022, +0.009] | +0.004 [−0.008, +0.016] | |

With 300 games and about 80 families (about 17 god-slots per family) neither is significant. The in-game
fairness gain is **demonstrated on 5×5 only**. On 4×4 the point estimate goes the wrong way, and nothing
here can rule out a small harm. Across both types, dynamism, tension and Gini are unchanged and the share
of steals done by bijections falls (0.32 → 0.27).

<!-- WM50 -->

## 6. Policy-independent vs policy-dependent findings

| finding | depends on simulated policies? |
|---|---|
| Landauer-consistent yields; median route 0.42 bits/bit; spread SD log2 0.91 (5×5) | no (landscape) |
| paint+stamp composite exploit (Lucky Token, Seed 3, …) and the `composite` fix | no |
| constant fills (`write all`, `paint all`) are the broadest coalition attractor; `motif` second | no |
| bijections are theft tools (rival/foreign contexts), worth 2.4–3.2× building yield | no |
| starved families: low ceilings, relational/arithmetic goals; Rummy, Lone Peak, Seed 2, Card Windmill on cards | no (route yield is a lower bound from a beam search; v1 → v2 search raised Seed 2 from 0.14 to 0.39) |
| game fairness tracks library best-of-12 yield (ρ 0.81) more than route yield (0.60) | **yes** (4096 random programs, best of 12) |
| `full` lowers the SD of family scores by 6% on 5×5; driven by the new mutators | **yes**; not significant on 4×4 or cards at 300 games |
| pricing changes have no in-game fairness effect | **yes** (the gods do not find the repriced programs) |
| mid-game objects are near-prior (2.0 vs 1.1 bits of own surprisal) | yes (mid states come from simulated games) |

## 7. Recommendations for the coordinator

### 7.1 Adopt (changes to shared modules, small and backward compatible)

1. **Composite erasure pricing.** In `program.Program.cost_terms` add
   `composite = max(0, _pinned_bits([self.run(x) for x in probes]) − Σ_step terms["erase"])` for programs with
   ≥ 2 steps, and add it to the cost, e.g. inside `ratchet`. A one-step program is unchanged, because pinned
   ≤ E.
   - Evidence: §2.3, §4.1. Lucky Token 1.26 → 0.79 bits/bit; the max jackpot rate 0.95 → 0.59.
   - It touches 0.3% of random multi-step programs.
   - Reference implementation: `variants._composite_ratchet`.
2. **New mutators `crown`, `balance`, `unclash`** (`newmuts.py`; port into `mutators.MUTATORS` and the docs
   table).
   - Evidence: §4.2 and §5.2. Quilt Maker +0.23, Round Numbers +0.12, Rummy +0.09 in game z, with
     paired CIs excluding 0.
   - Lone Peak 0.26 → 0.42 route yield at 5×5 and 0.14 → 0.31 at 6×6 cards; Seed 2 0.07 → 0.23 on cards.
   - All three are picked up in games by 36–69 families.
   - Tool-base inflation is +0.2 bit per step.
3. **Worst-case motion for bijections, at half weight (`worstmove50`).** In `Mutator.terms`, for bijective
   mutators use dcol/dsym = ½·(prior expectation) + ½·(max cells changed). The max can be analytic (region
   size for colour/symbol/suit swaps and hue/rank steps) instead of the probe used here.
   - It cuts theft yield while keeping the swaps as the theft tools (§4.3).
   - The full worst-case version (`worstmove`) removes `swap_colours`/`swap_symbols` as anyone's best tool,
     so use it only if theft should be rarer.
   - Game evidence for wm50: §5.6.

### 7.2 Optional

- **`tile`.** Fair and the best tool for Looking Glass and Wallpaper Weaver, but only 0.3% of commits. Add
  it only if a wallpaper-copy verb is wanted for kids.
- **Retire nothing yet.**
  - `flatten` is never the best single step, but it is the second step of Lone Peak's best route (with
    `crown`).
  - `turn_grid` is the least-used mutator in games (0.4–0.7% of commits). It is the theft/redirect tool for
    the ordered families (Rainbow Road, Stripe, Staircase, Straight Shooter, Young Tableau).
  - `blend` is the best tool only for Border Baron's completion. Revisit once Colour Mixer has a game share.

### 7.3 Do not adopt

- `structured` (reference-pool pricing): it is principled but does not move prices. Targeted use cannot be
  priced at a fixed reference.
- Any pure knob change for fairness, i.e. `scope.global`, `move`, `step_base`, `kind.bijective`, `hartley`.
  Starved families lack tools, not discounts (§4.4).
- `scope.global` = 1.25 adds no fairness in games and halves `motif` use.

### 7.4 Outside the mutator set (for the rule and dealer owners)

- **Low-ceiling families cannot be fair through mutators.** Yield ≤ ceiling / (about 12 bits of minimum
  program cost). Options:
  - give them graded tie-breakers so the ceiling rises above about 30 bits: Sudoku Scholar (9 bits), Ladder
    of Numbers (7), Bridge Builder (7), Lantern Lighter (12), Column Addition (16), Divisibility (18),
    Fair Weaver (20);
  - or have the dealer avoid them in small GridTypes.
- **Still starved after `full`:** Number Sandwich, Magic Window, Tetromino Tamer, Far Apart, Odds & Evens,
  Feuding Families, Snake Charmer, Fillomino, Stepping Stones (5×5); Rummy and Card Windmill (6×6 cards).
  - Card Windmill needs per-quadrant suits: a `suit_set` over a "quadrant" region kind would serve it.
  - Rummy on cards needs run/set construction: for example, a `sort_line` variant that orders by suit then
    rank.
  - These are the next mutator candidates. Each should be tested with
    `focus_landscape.py --families ... --presets default,<new>`.
- **For the experiments worker (simulator).** Game fairness is limited by the random program library
  (best-of-12 yield ρ 0.81 with outcome). Snap, Full House, Bullseye and Pinwheel win at z ≈ 0.9 because
  random agents, theirs or anyone's, keep pushing objects into their upper sets. Two remedies:
  - a policy that searches its own utility (e.g. `neighbour` local search seeded from the library);
  - a library that guarantees each family's best single steps.
  Either would make game fairness reflect the landscape, which is the right target for human play.

## 8. Reproducibility and caveats

- Caches: `.cache/explore_mutators/` holds landscapes (about 90 MB per 5×5 run), mid-game pools, library
  yields and focus runs. `.cache/experiments/games/` holds per-game results, keyed by the preset's tagged
  knobs. Both are gitignored.
- Wall time on 4 cores:
  - landscape 5×5: about 25–30 min per preset (v2);
  - 4×4: about 11 min (v1); 3×3: 7 min; 6×6 cards: 51 min (v1);
  - 600 games: about 13–17 min per preset.
- Seeds: draws, states and probe pools are seeded from sha256 of their names. Game specs use seed 1
  (train) and 9000000 (held out). The new presets were designed from the landscape, never tuned on game
  outcomes, so the train and held-out game seeds are both honest tests. The pooled estimate is reported
  next to each.
- The landscape's multi-step search is a heuristic. v1 missed Seed 2's 2-step route; v2 always tries
  whole-grid second steps. The 4×4, 3×3 and 6×6-cards matrices in §3 are v1, so their route yields are
  lower bounds.
- The yield is own surprisal per bit. The payoff multiplies it by peer surprisal, and that coalition value
  is shown only by the breadth table (§2.4), not modelled per game.
- `predict.py` correlations use 600 games (about 30–45 god-slots per family). The family z CIs are about
  ±0.1.

## Appendix A. Per-family table, Grid(5,base10,rgby) (landscape v2, games seed 1)

Theft yield = best rival-context yield. Jackpot rate = ¾·ceiling / cheapest program reaching it on ≥ half
of held-out states (0 = no such program found). Library best-of-12 = the default random library's expected
best yield over 12 random candidates. Game z = policy-adjusted mean rank score (0.5 = fair), 600 games.

| family | ceil (bits) | route yield, tool (default) | route yield, tool (full) | theft yield a/b | jackpot rate a/b | library best-of-12 (a) | game z (default) | game z (full) |
|---|---|---|---|---|---|---|---|---|
| sudoku_scholar | 9 | 0.03 write_ramp | 0.03 write_ramp | - | 0.00/0.00 | 0.007 | 0.21 | 0.18 |
| number_sandwich | 57 | 0.07 tally | 0.09 tally | 0.74/0.54 | 0.00/0.00 | 0.007 | 0.21 | 0.19 |
| far_apart | 25 | 0.11 recolour | 0.11 recolour | 0.37/0.30 | 0.00/0.00 | 0.014 | 0.47 | 0.40 |
| magic_window | 26 | 0.11 paint | 0.11 paint | 1.69/1.62 | 0.00/0.00 | 0.017 | 0.36 | 0.35 |
| magic_accountant | 26 | 0.13 write | 0.30 balance | 0.32/0.40 | 0.04/0.08 | 0.008 | 0.40 | 0.34 |
| tetromino_tamer | 24 | 0.14 paint | 0.14 paint | 0.07/0.07 | 0.05/0.05 | 0.004 | 0.08 | 0.10 |
| lantern_lighter | 12 | 0.16 motif | 0.16 motif | 0.52/0.46 | 0.13/0.13 | 0.008 | 0.19 | 0.20 |
| odds_evens | 32 | 0.16 write | 0.17 write | 2.22/1.30 | 0.00/0.00 | 0.010 | 0.25 | 0.28 |
| round_numbers | 21 | 0.17 write | 0.47 balance | - | 0.13/0.38 | 0.024 | 0.37 | 0.49 |
| feuding_families | 39 | 0.17 recolour | 0.17 recolour | 0.70/0.44 | 0.00/0.00 | 0.018 | 0.41 | 0.38 |
| column_addition | 16 | 0.18 write | 0.18 write | 0.51/0.50 | 0.16/0.16 | 0.008 | 0.28 | 0.34 |
| fillomino | 55 | 0.18 write | 0.20 write | - | 0.00/0.00 | 0.011 | 0.35 | 0.32 |
| quilt_maker | 42 | 0.19 hue_turn | 0.40 unclash | - | 0.00/0.00 | 0.008 | 0.09 | 0.38 |
| stepping_stones | 54 | 0.20 write | 0.22 write | 1.50/0.53 | 0.00/0.00 | 0.014 | 0.36 | 0.39 |
| snake_charmer | 32 | 0.20 paint | 0.20 paint | 0.73/0.53 | 0.00/0.00 | 0.013 | 0.25 | 0.19 |
| ladder_of_numbers | 7 | 0.20 sort_line | 0.20 sort_line | 0.46/0.44 | 0.22/0.21 | 0.013 | 0.35 | 0.30 |
| bridge_builder | 7 | 0.21 paint | 0.21 paint | 0.28/0.26 | 0.20/0.19 | 0.023 | 0.38 | 0.38 |
| sunset_sky | 30 | 0.22 paint | 0.22 paint | 0.22/0.18 | 0.00/0.00 | 0.016 | 0.59 | 0.43 |
| staircase_climber | 71 | 0.25 write_ramp | 0.25 write_ramp | 2.13/1.66 | 0.00/0.00 | 0.020 | 0.42 | 0.48 |
| bingo_caller | 32 | 0.26 write | 0.25 write | 1.08/0.90 | 0.21/0.21 | 0.047 | 0.56 | 0.60 |
| fair_weaver | 20 | 0.26 motif | 0.26 motif | - | 0.21/0.21 | 0.038 | 0.34 | 0.52 |
| lone_peak | 55 | 0.26 tally | 0.42 crown | 2.68/2.64 | 0.30/0.34 | 0.011 | 0.22 | 0.34 |
| twenty_one | 38 | 0.27 write_ramp | 0.27 balance | 0.57/0.38 | 0.21/0.15 | 0.009 | 0.39 | 0.45 |
| divisibility_detective | 18 | 0.28 write | 0.27 write | - | 0.25/0.24 | 0.026 | 0.48 | 0.44 |
| young_tableau | 76 | 0.28 write_ramp | 0.28 write_ramp | 0.99/0.77 | 0.00/0.00 | 0.029 | 0.40 | 0.43 |
| robin_hood | 61 | 0.30 motif | 0.30 motif | - | 0.00/0.00 | 0.009 | 0.14 | 0.26 |
| rooks_watch | 22 | 0.30 stamp | 0.30 stamp | 0.21/0.16 | 0.29/0.29 | 0.017 | 0.48 | 0.47 |
| straight_shooter | 75 | 0.32 write_ramp | 0.32 write_ramp | 2.42/1.95 | 0.00/0.00 | 0.046 | 0.58 | 0.58 |
| king_of_the_hill | 46 | 0.33 paint | 0.28 paint | 1.20/0.76 | 0.33/0.28 | 0.013 | 0.27 | 0.27 |
| mountain_climb | 28 | 0.33 write_ramp | 0.33 write_ramp | - | 0.11/0.11 | 0.015 | 0.27 | 0.34 |
| seesaw | 24 | 0.35 paint | 0.38 paint | 1.09/0.59 | 0.28/0.31 | 0.052 | 0.72 | 0.71 |
| othello_sandwich | 32 | 0.36 motif | 0.35 motif | 0.38/0.35 | 0.28/0.31 | 0.033 | 0.50 | 0.55 |
| colour_value_ladder | 39 | 0.36 stamp | 0.33 stamp | - | 0.28/0.17 | 0.021 | 0.37 | 0.51 |
| honest_minesweeper | 63 | 0.37 tally | 0.37 tally | 1.99/1.26 | 0.00/0.00 | 0.022 | 0.38 | 0.42 |
| rainbow_roads | 35 | 0.38 motif | 0.37 motif | - | 0.31/0.29 | 0.043 | 0.33 | 0.41 |
| wallpaper_weaver | 30 | 0.38 paint | 0.47 tile | - | 0.32/0.39 | 0.111 | 0.66 | 0.64 |
| rummy_melder | 76 | 0.39 write | 0.44 write | 2.44/1.90 | 0.30/0.40 | 0.034 | 0.62 | 0.68 |
| border_baron | 30 | 0.39 motif | 0.39 motif | 0.25/0.24 | 0.31/0.31 | 0.062 | 0.61 | 0.68 |
| seed2_patchwork | 76 | 0.39 motif | 0.53 unclash | - | 0.30/0.40 | 0.014 | 0.36 | 0.41 |
| set_spotter | 75 | 0.40 write | 0.43 write | - | 0.38/0.41 | 0.094 | 0.74 | 0.76 |
| neighbourhood_vote | 31 | 0.41 paint | 0.41 paint | 0.48/0.44 | 0.36/0.35 | 0.036 | 0.65 | 0.60 |
| looking_glass | 38 | 0.43 write | 0.48 tile | - | 0.35/0.38 | 0.080 | 0.69 | 0.71 |
| archipelago | 32 | 0.44 motif | 0.43 motif | 0.64/0.49 | 0.34/0.34 | 0.039 | 0.33 | 0.40 |
| colour_mixer | 33 | 0.44 motif | 0.43 motif | 0.53/0.51 | 0.30/0.30 | 0.037 | 0.49 | 0.57 |
| swiss_cheese | 43 | 0.45 motif | 0.44 motif | 0.46/0.37 | 0.35/0.34 | 0.040 | 0.57 | 0.58 |
| kings_court | 75 | 0.45 write | 0.50 write | 0.64/0.63 | 0.47/0.47 | 0.025 | 0.55 | 0.55 |
| pinwheel | 52 | 0.46 write | 0.46 write | - | 0.41/0.41 | 0.120 | 0.81 | 0.80 |
| homebody | 28 | 0.48 paint | 0.48 paint | 0.70/0.44 | 0.38/0.38 | 0.022 | 0.51 | 0.48 |
| twin_friends | 76 | 0.49 motif | 0.47 motif | 2.05/1.38 | 0.37/0.32 | 0.037 | 0.62 | 0.63 |
| uno_snake | 39 | 0.49 paint | 0.49 paint | - | 0.41/0.40 | 0.084 | 0.80 | 0.74 |
| rainbow_road | 39 | 0.53 motif | 0.53 motif | 2.36/1.98 | 0.41/0.41 | 0.067 | 0.47 | 0.49 |
| full_house | 67 | 0.53 write | 0.53 write | - | 0.46/0.46 | 0.131 | 0.91 | 0.91 |
| castle_keeper | 46 | 0.54 motif | 0.53 motif | 0.46/0.35 | 0.45/0.45 | 0.030 | 0.57 | 0.60 |
| stripe_painter | 42 | 0.54 motif | 0.54 motif | 1.28/1.00 | 0.44/0.44 | 0.085 | 0.80 | 0.69 |
| flush_royale | 76 | 0.55 paint | 0.41 paint | - | 0.54/0.34 | 0.084 | 0.86 | 0.81 |
| rainbow_steps | 40 | 0.55 motif | 0.54 motif | 1.16/1.00 | 0.42/0.42 | 0.063 | 0.57 | 0.50 |
| times_table_territory | 62 | 0.56 stamp | 0.38 stamp | 1.52/0.79 | 0.44/0.31 | 0.036 | 0.51 | 0.53 |
| bullseye | 45 | 0.56 paint | 0.55 paint | - | 0.47/0.47 | 0.074 | 0.93 | 0.94 |
| paint_mixer | 47 | 0.56 motif | 0.56 motif | - | 0.44/0.43 | 0.047 | 0.48 | 0.45 |
| snap | 74 | 0.58 write | 0.58 write | - | 0.52/0.52 | 0.154 | 0.91 | 0.88 |
| go_fish_books | 75 | 0.58 write | 0.58 write | 1.10/0.88 | 0.47/0.47 | 0.024 | 0.68 | 0.64 |
| number_bonds | 74 | 0.61 write | 0.62 write | 2.56/3.14 | 0.54/0.47 | 0.016 | 0.41 | 0.34 |
| constellation | 76 | 0.62 write | 0.62 write | 2.23/2.09 | 0.48/0.48 | 0.022 | 0.61 | 0.49 |
| mirrormancer | 33 | 0.64 mirror_fold | 0.64 mirror_fold | - | 0.51/0.51 | 0.082 | 0.78 | 0.78 |
| islander | 48 | 0.65 motif | 0.64 motif | 1.22/1.21 | 0.50/0.50 | 0.063 | 0.56 | 0.57 |
| picture_frame | 32 | 0.65 paint | 0.65 paint | 0.96/0.72 | 0.49/0.49 | 0.014 | 0.32 | 0.20 |
| connect_four | 50 | 0.66 paint | 0.65 paint | 2.02/1.33 | 0.52/0.52 | 0.035 | 0.56 | 0.52 |
| flag_bearer | 50 | 0.66 paint | 0.66 paint | 0.72/0.69 | 0.52/0.52 | 0.037 | 0.64 | 0.56 |
| rainbow_bands | 50 | 0.66 motif | 0.66 motif | 0.77/0.70 | 0.52/0.52 | 0.041 | 0.65 | 0.64 |
| chessmaster | 49 | 0.67 motif | 0.66 motif | 0.98/0.75 | 0.51/0.51 | 0.034 | 0.60 | 0.65 |
| kingdom | 49 | 0.67 paint | 0.67 paint | 1.79/1.05 | 0.52/0.52 | 0.042 | 0.55 | 0.37 |
| best_friends | 49 | 0.67 motif | 0.67 motif | 1.00/0.76 | 0.51/0.51 | 0.037 | 0.50 | 0.50 |
| parity_painter | 50 | 0.67 paint_by_key | 0.67 paint_by_key | 0.63/0.62 | 0.52/0.52 | 0.030 | 0.65 | 0.53 |
| gravity | 50 | 0.69 paint | 0.68 paint | 1.36/1.15 | 0.53/0.53 | 0.036 | 0.63 | 0.63 |
| colour_by_number | 50 | 0.69 paint_by_key | 0.68 paint_by_key | 0.83/0.82 | 0.53/0.53 | 0.032 | 0.54 | 0.45 |
| seed1_line_painter | 76 | 0.70 paint | 0.47 paint | 2.04/1.31 | 0.54/0.39 | 0.032 | 0.56 | 0.50 |
| treasure_map | 76 | 0.71 paint | 0.49 paint | 3.66/2.26 | 0.54/0.34 | 0.030 | 0.49 | 0.54 |
| knight_riders | 76 | 0.75 stamp | 0.76 stamp | 2.39/1.40 | 0.54/0.34 | 0.072 | 0.73 | 0.63 |
| number_painter | 83 | 0.78 stamp | 0.55 stamp | 2.25/2.23 | 0.59/0.37 | 0.021 | 0.48 | 0.37 |
| conqueror | 78 | 0.87 paint | 0.71 paint | 1.08/1.04 | 0.67/0.55 | 0.042 | 0.62 | 0.64 |
| seed3_green_ones | 133 | 1.24 stamp | 0.94 stamp | - | 0.95/0.59 | 0.029 | 0.54 | 0.65 |
| lucky_token | 133 | 1.25 stamp | 0.79 stamp | 1.67/1.48 | 0.95/0.59 | 0.026 | 0.45 | 0.50 |
