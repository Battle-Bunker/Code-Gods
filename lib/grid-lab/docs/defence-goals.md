# Defence goals: negative components in utility functions

Owner: defence worker. Code: `gridlab/defence.py` (scoring maths, kid card), `gridlab/rules/defence.py`
(penalty families, defence variants, protector families), plus small additive hooks in `family.py`,
`calibrate.py`, `sim.py`, `policy.py`, `metrics.py` and `run.py`. Tests: `python3 -m tests.test_defence`.
Experiments: `python3 -m gridlab.experiments.defence`. Names follow SPEC §2.

## 0. The problem

A utility function u returns an ordinal; the engine scores the surprisal s(x) = −log₂ μ{y : u(y) ≥ u(x)} ≥ 0
under the uniform spawn prior μ, and god i's payoff on object x is π_i = s_i · S_−i with S_−i = Σ_{j≠i} s_j.

Surprisal rewards only being rare *in the good direction*. A typical grid already sits near s ≈ 1 bit
(for a fine-grained rule s ~ Exp, so E_μ[s] = log₂ e ≈ 1.44 and the median is exactly 1 bit). Once a grid is
below typical, s is floored near 0 and further damage costs nothing. Concretely, on Grid(5,base10,rgby):

| grid | reds | s for "count the reds, fewer is better" |
|---|---|---|
| typical | 6 | 0.70 bits |
| one row painted red | 10 | 0.01 bits |
| whole grid red | 25 | 0.00 bits |

So a god cannot *care about a common configuration*: whatever the rule, at most ~1 bit per object is at stake
below the median, and none of it is reachable once the object is bad. Spoilers ("stop the reds") and protectors
("keep the corners varied") cannot be expressed. The user's direction: let a utility function carry a
**negative term** (a penalty, a "defence goal") alongside its positive target.

## 1. Requirements

1. **Defence is incentivised**: damaging a *typical* grid in the protected direction must cost the protector a
   meaningful, growing amount (not ≤ 1 bit).
2. **Fairness survives**: the positive guarantee P_μ(s ≥ k) ≤ 2^−k must keep holding, and the negative side
   needs an equivalent ("no rule's defence goal is violated by chance more than any other's").
3. **The fixed payoff** π_i = s_i · S_−i stays as it is for everything it already covers; families without a
   penalty behave exactly as before. Any change must be forced by the design and justified.
4. **No sign pathologies**: no negative × negative = positive (no farming of mutual negatives). *Revised by the
   user mid-design:* a god reducing the multiplier on its own negative score by trashing others' structure is a
   **wanted** dynamic ("defend your flanks"), not a pathology.
5. **No exploits**: no unbounded self-bonus (−∞ penalty), no profitable pinning of rivals' grids.
6. **Kid-readable**: "+1 for each 3, −1 for each red cell", "✨ rarer than 976/1000 grids for your 3s,
   ⚠️ redder than 90% of grids".
7. **Ordinal only**: only the order of what a kid returns matters (SPEC: utility representation theorem).
   This rules out any design where the kid's *numbers* set an exchange rate.
8. **Monotone in the card** (coordinator invariant): more points never give fewer bits, more penalty never gives a
   better net score, strictly wherever the calibration is strict, across the whole range (no flat zone).

## 2. Options

Running example (Grid(5,base10,rgby), 25 cells, 4 colours): "+1 for each 3, −1 for each red cell".
T = #threes ~ Bin(25, 0.1), R = #reds ~ Bin(25, 0.25), independent. Typical: T = 2, R = 6.

### (a) One combined ordinal u = T − R, one-sided surprisal

u has mean −3.75, median −4. s_up(−4) = 0.70 bits.

* **Defence incentive: essentially none.** Painting a row red (R → 10, u → −8) moves s from 0.70 to 0.05 bits;
  painting the whole grid red (u → −23) to 0.00. The loss is bounded by s(x) itself, and for every grid at or
  below the median s ≤ 1 bit. The floor kills the incentive exactly as in §0: subtracting reds inside the ordinal
  only matters on grids that are *already in the upper tail*.
* **It breaks requirement 7.** The kid's coefficients become an exchange rate. "−1 per red" and "+1 per 3"
  weigh a red and a 3 equally, but reds are far more variable (Var R = 4.7, Var T = 2.25), so the upper tail of u
  is driven mostly by *having few reds*: u = 2 (5.53 bits) is reached either by T = 8 with typical reds, or by
  R = 0 with typical threes. A "3-lover" earns 5.5 bits by deleting reds without touching a 3. Changing −1 to −2
  changes the god, although only order is supposed to matter.
* Fairness is untouched (it is still one ordinal), no new pathologies, and the kid card is easy. But it does not
  solve the problem.

### (b) Two-sided (signed) surprisal of one ordinal

s±(x) = −log₂ μ{u ≥ u(x)} in the upper half, +log₂ μ{u ≤ u(x)} (≤ 0) in the lower half, ~0 near typical.

* **Defence incentive: yes**, but only against the lower tail *of the same statistic*. With u = T − R,
  s_lo(−8) = −3.7 bits and s_lo(−25) = −53.8 bits: painting reds now hurts.
* **It conflates "anti-target" with "defence".** Every rule acquires a hated direction: Green Ones would hate
  grids with *no* green 1s, Rainbow Road would hate grids with no rainbow steps, and lex tie-breakers designed to
  ladder the *upper* tail define strange lower tails (Seed 3's lower tail is "no cell is green and no cell is a 1").
  A god who loves 3s and hates reds still needs the combined u, so the cardinal exchange-rate problem of (a)
  remains in both tails.
* Fairness: P(s± ≥ k) ≤ 2^−k and P(s± ≤ −k) ≤ 2^−k (the lower tail is a p-value too). Fine.
* It changes every existing rule unless made optional, and the payoff must handle negative s (see §3).
* (b) is the special case of (c) where the penalty ordinal is −u. Anything (b) can say, (c) can say.

### (c) Separate reward and penalty channels (chosen)

The god has two ordinals: a **reward** r (what it loves, bigger is better) and a **penalty** d (what it wants
to stop, bigger is worse). Each is calibrated against the prior on *its own* survival function:

  s⁺(x) = −log₂ μ{r ≥ r(x)}       (reward bits, ✨)
  s⁻(x) = −log₂ μ{d ≥ d(x)}       (badness bits: the surprisal of the "bad event" upper contour of d)

* **Defence incentive: yes, and it grows without a floor.** Running example: s⁻ for R = 6, 10, 15, 25 is
  0.69, 3.81, 12.2, 50.0 bits. A whole-grid red paint costs a red-hater 49 bits, as much as a 49-bit jackpot
  earns its builder.
* **Both channels are ordinal.** The kid's "−1 per red" only orders grids by redness; the engine turns redness
  into bits by its own rarity. 3s and reds are each worth exactly their information, whatever coefficients the
  kid writes. This is the decisive argument against (a) and (b).
* **Fairness on both sides.** s⁺ is unchanged, so P(s⁺ ≥ k) ≤ 2^−k still holds for every rule. The penalty is
  a p-value of the bad event: P_μ(s⁻ ≥ k) ≤ 2^−k for *every* penalty. No defence goal is violated by chance more
  often than any other.
* Families without a penalty are untouched.

### (d) Other framings considered

* **Bad-event surprisal** (penalty = surprisal of the upper contour of a "bad event" set, subtracted): this *is*
  (c); s⁻ is exactly that. Writing it as an event makes the kid wording natural: "⚠️ only 1 grid in 10 is this red".
* **Log-likelihood ratio.** Net bits s⁺ − s⁻ = log₂ (μ{d ≥ d(x)} / μ{r ≥ r(x)}): the log ratio of how surprising
  the good thing is to how surprising the bad thing is. For two fine-grained, independent channels it is Laplace
  distributed around 0 under the prior. Nice to know; it does not change the design.
* **Relative entropy against the prior** (defence = keep the world's empirical distribution of, say, red counts
  close to μ, scored by −KL): a world-level quantity, not a per-object utility. It breaks the additive per-object
  payoff Π_i = Σ_x π_i(x), the disclosure model (gods see per-object scores), and the "agents act on one random
  object" mechanics. It also rewards a world whose *spread* looks typical even if half of it is wrecked. Rejected.
* **Penalty as an anti-reward of the rival**: score −s_j for a named rival. Rejected: it is explicit spite
  (requirement 4) and contradicts the cooperative intent of S_−i.

## 3. Signed bits

Each god with a defence goal gets one **signed** number per object:

  n_i(x) = s⁺_i(x) − w · ( h_i(x) − h̄_i ),   h_i(x) = η( −log₂ μ{d_i ≥ d_i(x)} ),   h̄_i = E_μ[h_i]

* s⁺ is the unchanged reward surprisal (✨). For a god without a defence goal, n_i = s⁺_i ≥ 0.
* η is a **soft hinge at the median**: η(s) = log₂(1 + 2^(s−1)) − log₂(1.5). It is strictly increasing,
  η(0) = 0, η(1) = 0.42 (a typical grid), and η(s) = s − 1.58 + o(1) for bad grids. A hard hinge max(0, s − 1)
  was the first draft; it has a flat zone below the median and breaks requirement 8, while the soft hinge keeps
  its purpose (cleaning an already-typical grid earns almost nothing: the slope below the median is < 1/3).
* Centring by h̄ = E_μ[h] makes the defence part zero-mean on fresh spawns, so a defence goal is neither a
  handicap nor a free lunch *by chance*. It is a constant per god, so it changes no incentive.
* w = `penalty_weight` (default 1: a penalty bit weighs the same as a reward bit; §9 shows 0.25–1 behave alike).

**Theorem (monotone in the card).** Let G⁺, G⁻ be the survival functions of the reward ordinal r and the penalty
ordinal d. If r(x) ≥ r(y) and d(x) ≤ d(y) then n(x) ≥ n(y); if moreover G⁺(r(x)) < G⁺(r(y)) or
G⁻(d(x)) > G⁻(d(y)), then n(x) > n(y).
*Proof sketch.* s⁺ = −log₂ G⁺(r) is non-decreasing in r because G⁺ is non-increasing, strictly where G⁺ is strictly
decreasing. Likewise s⁻ = −log₂ G⁻(d) is non-decreasing in d. η is strictly increasing, so −w·η(s⁻) is
non-increasing in d, strictly where s⁻ is strictly increasing. n is a sum of the two parts plus a constant. ∎
The survival function of every ordinal that has prior mass at each value is strictly decreasing on the values
it can take. So with a strictly increasing calibration (branch `claude/gridlab-kid-cards` interpolates between
levels and removes the extrapolation cap) n is strictly monotone in what the card says, across the whole range.
With the current step tables it is monotone, and strict between table levels. `tests.test_defence.test_monotone_theorem`
and `test_hinge_strict` check both.

Fairness of the negative side: for s ≥ 1, η(s) ≤ s − log₂ 1.5, so P_μ(h ≥ k) ≤ ⅔ · 2^−k for **every** penalty.
No defence goal is violated by chance more often than any other's.

## 4. How signed bits enter the payoff

Candidates, with N_−i = Σ_{j≠i} n_j:

| mode | payoff | own − × peers + | own − × peers − | own + × peers − |
|---|---|---|---|---|
| net product | n_i · N_−i | negative | **positive: farming** | negative |
| **floored** (chosen) | n_i · max(0, N_−i) | negative: defend your flank, or shrink the multiplier | 0 | 0: a big negative god vetoes the object |
| gated | n_i · N_−i if Σ_j n_j > 0, else 0 | negative | 0 if the gate is shut | **negative while the gate is open** |
| private (first draft) | s⁺_i · S⁺_−i − K_i (h_i − h̄_i), K_i = E_μ[S⁺_−i] | penalty priced at the prior mean | none in the product | none |

* **Net product** fails requirement 4: two gods who both hate an object score from it.
* **Gated** has a real pathology. If i is positive, its peers are negative and the total is still positive, i's
  payoff is negative, and i can raise it to 0 by *destroying its own structure* until the gate shuts. A god
  should never want to wreck what it loves.
* **Private** was the first design. It is the only mode with full monotonicity across gods (no god ever gains
  when another's bits fall), at the cost of an extra exchange rate K_i and no cross-god consequences for
  penalties. The user then asked for flank defence and trashing to be possible, which private rules out.
* **Floored** is the user's suggestion and the recommendation. It is exactly the original formula whenever no
  god's penalty is scored (all n ≥ 0, so the max is the identity). It has no farming: an own negative is
  never multiplied by a negative. Its new mechanics are the ones asked for:
  1. *Flank defence.* A god with no positive bits on an object others care about pays n_i · N_−i < 0, so it must
     repair its penalty there.
  2. *Shrinking the multiplier.* The same god can instead reduce N_−i, by scrambling others' structure (noise).
  3. *Veto.* A god whose penalty is large makes N_−j < 0 for every peer j and zeroes their payoff on that
     object. In turn, peers want to *protect that god's defence goal* to reopen the object: cooperative defence.

  The floored multiplier max(0, N_−i) is named **peer care** (`peer_care`): how much, net, the other gods care
  about the object.

**For a 12-year-old:** "Each grid gives you ✨ for what you love and takes ⚠️ for what you hate. You score
your number times how much everyone else cares about the grid. If, overall, the others don't care about a grid,
nobody scores from it. So you can't win points by hating things together, and if you hate a grid that others
love, you lose points until you fix it or until they stop caring."

### Properties of the chosen design

* Payoffs equal the original formula bit for bit when no defence goal is scored (tested).
* Reward fairness unchanged: P(s⁺ ≥ k) ≤ 2^−k. Penalty fairness: P(h ≥ k) ≤ ⅔ · 2^−k. Both channels are zero-cost
  by chance in expectation (centring).
* No farming: π_i > 0 requires n_i > 0 and N_−i > 0.
* The self-bonus from cleaning is bounded: at most w · h̄ ≈ 0.5 bits of n per object.
* Defence pays: damaging a typical grid by k ⚠️ bits costs about k · N_−i bits², and N_−i is ≈ (G−1)·1.4 on a
  typical spawn and much more on a jackpot.

## 5. Policies and disclosure

A god sees its own reward and penalty tables, its own n_i per object, and the peers' summed **signed** bits N_−i
(the old disclosure, with penalties included). Greedy private policies value x → y with peers held fixed:
Δπ_i = n_i(y) · max(0, N_−i(x)) − n_i(x) · max(0, N_−i(x)). Omniscient and cooperative policies evaluate every
god's bits of y, so only they can *see* that scrambling a grid lowers N_−i (§9: trashing does not emerge with
private policies, as expected). `policy.py` computes every mode with the same `defence.payoff_matrix`.

## 6. Kid-facing card and API

**Card** (dealt, private):

```
✨ Green Ones        +1 for each green 1 (more is better)
⚠️ Hates red         −1 for each red cell (only counts when a grid is worse than usual)
```

**Per object** (what the god sees on each grid):

```
✨ rarer than 976/1000 grids (5.4 bits) · ⚠️ redder than 90% of grids (1.8 ⚠️)
```

The ✨ line is 1 − μ{r ≥ r(x)} per mille. The ⚠️ line is 1 − μ{d ≥ d(x)} as a percentage, with the penalty's
comparative ("redder", "blobbier", "more taken over by one colour"). It is shown only when the grid is worse than
half of all grids, and reads "⚠️ fine" otherwise. `gridlab.defence.card` and `object_line` render both lines.

**API for junior coders**: a second, optional function next to `utility`:

```python
HATED_COLOUR = RED          # dealt setting, UPPER_CASE like every other

def utility(grid):          # ✨ what you love: bigger is better
    return sum(1 for cell in grid if cell.colour == FAVOURITE_COLOUR and cell.value == 1)

def penalty(grid):          # ⚠️ what you want to stop: bigger is worse
    return sum(1 for cell in grid if cell.colour == HATED_COLOUR)
```

Why a separate function rather than `return points, penalty`: the parallel kid API uses tuples for
**lexicographic** ordinals (`return (rows, steps)`), so a returned pair already means "first this, then that".
Overloading it would be ambiguous, and `points - penalty` is option (a), which does not work. Two functions are
also the easiest thing to explain: one says what you love, the other what you want to stop. Either may return a
number or a lexicographic tuple; only the order matters for both.

In Grid Lab a defence goal is a `Family` in the `penalty` field of a family (its ordinal is the badness d, higher =
worse), with the penalty's own params under `params["defence"]`. A variant built with `with_defence(base, penalty)`
calibrates its reward on the *base* family, so it shares the base's survival tables bit for bit.

## 7. Implementation summary

* `family.py`: `Family.penalty`, `Family.base` (optional, default None); `Draw.reward_draw()`,
  `Draw.penalty_draw()`; `with_defence(...)`. Works with int ordinals and with lex tuples (the penalty is just
  another ordinal and goes through whatever calibration path the reward uses).
* `calibrate.py` (additive): reward calibration of a variant uses its base draw; `precompute` also builds penalty
  tables (`channel_draws`); `Survival.prior_mean_bits(hinge, f)`.
* `defence.py`: `hinge` (soft), `constants`, `net_bits`, `payoff_matrix` (floored / gated / private), card text.
* `sim.py`: a penalty matrix H (objects × gods) beside S; `GameConfig.payoff_mode`, `penalty_weight`,
  `score_penalties` (False = shadow: penalties computed and logged but not scored, the experiments' control);
  the log carries penalty bits per commit, spawn, snapshot and the `DefenceConstants`.
* `policy.py`: one value model for every mode. `metrics.py`: tension on net bits, damage/repair per defence goal,
  floor occupancy (`floor_neg_share`, `floor_veto_share`, `floor_dead_share`), `trash_rate`, `flank_repair_rate`.
* `rules/defence.py`: 8 penalties, 8 variants, 5 protectors (`DEFENCE_FAMILIES`, opt-in via `--defence`, so the
  default 88-family pool and its dealing are unchanged).
* `run.py`: `--defence`, `--families`, `--shadow-penalties`, `--penalty-weight`; `--trace` prints the cards.

## 8. SPEC §2 names

`penalty` (d_i), `penalty_bits` (h_i, ⚠️), `net_bits` (n_i, signed bits), `peer_care` (max(0, N_−i), the floored
multiplier), `payoff_mode`. The SPEC table is updated.

## 9. Evidence

`python3 -m gridlab.experiments.defence --seeds 24` on Grid(5,base10,rgby): payoff mode floored, weight 1, 20 Hz,
exponential game length (half-life 300 s), 912 games in 404 s on 4 cores after precomputing 160 tables. Intervals
are 95% normal intervals of the mean; n = seeds per cell. The robustness repeat on Grid(4,base12,rgb) (8 seeds,
304 games) is summarised at the end.

**Design of the experiments.** *E1*: each of the 13 defence families sits in seat 0 against three random
families from the 88-family pool, all `greedy_private`. Every table is played twice with common random numbers:
penalty **scored**, and **shadow** (computed and logged, never scored). Differences are paired by seed. *E2*: mixed
policies (random, greedy_private, saver, greedy_omniscient); A = deals from the 88-family pool; B = deals with at
least one defence family, scored; B0 = the same deals, shadow. *E3*: ranks from E1.

### 9.1 Do protectors defend? Yes.

Pooled over 312 pairs (scored − shadow): **mean ⚠️ bits over the game −0.27 ± 0.10**, final ⚠️ bits −0.30 ± 0.12,
**repair agents +2.22 ± 0.48** (own agents whose commits lower the god's penalty overall), damage done by others
−78 ± 53 bits, damage undone later on the same object +1.3 ± 1.0 points of share. Protectors summon counter-agents,
and the protected structure ends measurably less damaged. Per family:

| family | n | ⚠️ mean h (scored) | (shadow) | Δ h | Δ final h | Δ self-repair bits | Δ repair agents | undone (scored / shadow) | rank (scored / shadow) |
|---|---|---|---|---|---|---|---|---|---|
| `seed3_green_ones+hate_colour` | 24 | 0.94 ± 0.27 | 1.18 ± 0.54 | -0.24 ± 0.39 | -0.07 ± 0.45 | -19 ± 162 | 2.1 ± 1.5 | 0.78 / 0.80 | 2.25 / 1.75 |
| `seed1_line_painter+hate_blob` | 24 | 1.37 ± 0.94 | 1.42 ± 1.07 | -0.05 ± 0.23 | -0.39 ± 0.56 | 8 ± 79 | 2.7 ± 1.9 | 0.86 / 0.85 | 2.46 / 2.42 |
| `seed2_patchwork+hate_takeover` | 24 | 2.59 ± 1.04 | 2.90 ± 1.23 | -0.31 ± 0.54 | -0.38 ± 0.52 | 79 ± 179 | 3.2 ± 2.0 | 0.81 / 0.77 | 3.75 / 2.92 |
| `lucky_token+hate_colour` | 24 | 1.13 ± 0.36 | 1.73 ± 0.63 | -0.59 ± 0.39 | -0.75 ± 0.38 | 136 ± 191 | 5.0 ± 2.2 | 0.80 / 0.77 | 2.17 / 1.88 |
| `kingdom+hate_value` | 24 | 0.70 ± 0.31 | 0.81 ± 0.33 | -0.10 ± 0.20 | -0.21 ± 0.24 | 44 ± 28 | 3.9 ± 1.4 | 0.63 / 0.56 | 2.21 / 2.12 |
| `rainbow_road+hate_big_blob` | 24 | 1.91 ± 0.58 | 2.16 ± 0.62 | -0.25 ± 0.24 | -0.51 ± 0.25 | -21 ± 188 | 1.5 ± 1.7 | 0.87 / 0.85 | 3.54 / 2.71 |
| `number_bonds+hate_colour` | 24 | 0.82 ± 0.21 | 1.32 ± 0.49 | -0.50 ± 0.37 | -0.69 ± 0.59 | 54 ± 90 | 3.9 ± 1.7 | 0.80 / 0.76 | 2.88 / 2.92 |
| `magic_accountant+hate_value` | 24 | 0.58 ± 0.28 | 1.01 ± 0.61 | -0.44 ± 0.48 | -0.32 ± 0.35 | -77 ± 120 | 0.3 ± 1.3 | 0.69 / 0.69 | 2.54 / 2.71 |
| `no_takeover` | 24 | 2.59 ± 1.01 | 2.93 ± 1.14 | -0.34 ± 0.44 | -0.33 ± 0.52 | 46 ± 169 | 2.1 ± 1.9 | 0.83 / 0.85 | 3.79 / 3.33 |
| `four_corners` | 24 | 1.04 ± 0.19 | 1.10 ± 0.16 | -0.06 ± 0.08 | 0.01 ± 0.14 | 19 ± 86 | 1.3 ± 1.3 | 0.80 / 0.80 | 3.50 / 3.29 |
| `rainbow_guardian` | 24 | 0.96 ± 0.17 | 1.04 ± 0.17 | -0.08 ± 0.09 | -0.14 ± 0.13 | 23 ± 54 | 1.4 ± 1.3 | 0.84 / 0.83 | 3.25 / 3.00 |
| `blob_warden` | 24 | 2.27 ± 0.90 | 2.39 ± 0.89 | -0.12 ± 0.29 | 0.06 ± 0.55 | -54 ± 110 | 1.2 ± 1.8 | 0.87 / 0.87 | 3.58 / 3.17 |
| `mixed_bag` | 24 | 2.02 ± 0.80 | 2.48 ± 0.98 | -0.46 ± 0.64 | -0.13 ± 0.64 | 32 ± 82 | 0.3 ± 1.2 | 0.69 / 0.69 | 3.83 / 3.46 |

The effect is clearest where the penalty is a simple count that is cheap to repair (hated colour or number):
`lucky_token+hate_colour` −0.59 ± 0.39 bits and +5.0 ± 2.2 repair agents, `number_bonds+hate_colour` −0.50 ± 0.37.
Structure-hating goals (`hate_takeover`, `hate_big_blob`) respond too, but they face every clumper's agents.

### 9.2 World dynamics: more tension, more lead changes, no loss of cooperation

| metric | A: 88-family pool | B0: with a defence family, unscored | B: scored | B − B0 (paired) |
|---|---|---|---|---|
| tension_rate | 0.284 ± 0.018 | 0.322 ± 0.020 | 0.350 ± 0.019 | 0.027 ± 0.009 |
| harmony_rate | 0.266 ± 0.008 | 0.254 ± 0.008 | 0.250 ± 0.009 | -0.004 ± 0.004 |
| spirals_per_100_commits | 8.146 ± 0.249 | 8.287 ± 0.264 | 8.291 ± 0.270 | 0.004 ± 0.165 |
| spiral_len_mean | 2.601 ± 0.023 | 2.616 ± 0.022 | 2.625 ± 0.021 | 0.008 ± 0.019 |
| lead_changes_per_100s | 3.765 ± 0.708 | 3.781 ± 0.704 | 4.407 ± 0.683 | 0.626 ± 0.578 |
| stagnation_frac | 1.000 ± 0.000 | 1.000 ± 0.000 | 1.000 ± 0.000 | 0.000 ± 0.000 |
| late_activity | 0.207 ± 0.007 | 0.205 ± 0.007 | 0.203 ± 0.006 | -0.002 ± 0.006 |
| payoff_gini | 0.256 ± 0.021 | 0.267 ± 0.020 | 0.608 ± 0.610 | 0.342 ± 0.608 |
| dynamism | 0.687 ± 0.014 | 0.698 ± 0.014 | 0.722 ± 0.012 | 0.024 ± 0.010 |
| commits | 7657.5 ± 1363.8 | 7686.4 ± 1366.4 | 7717.4 ± 1364.8 | 31.1 ± 62.1 |
| agents | 101.0 ± 14.1 | 101.5 ± 14.2 | 101.4 ± 14.1 | -0.1 ± 0.7 |
| floor_neg_share | 0.0000 ± 0.0000 | 0.2766 ± 0.0437 | 0.2631 ± 0.0462 | -0.0134 ± 0.0223 |
| floor_veto_share | 0.0000 ± 0.0000 | 0.1773 ± 0.0360 | 0.1669 ± 0.0393 | -0.0104 ± 0.0195 |
| floor_dead_share | 0.0000 ± 0.0000 | 0.0673 ± 0.0185 | 0.0633 ± 0.0225 | -0.0040 ± 0.0117 |
| trash_rate | 0.0000 ± 0.0000 | 0.0177 ± 0.0037 | 0.0174 ± 0.0042 | -0.0003 ± 0.0016 |
| flank_repair_rate | 0.0000 ± 0.0000 | 0.0285 ± 0.0041 | 0.0287 ± 0.0047 | 0.0002 ± 0.0023 |

n = 96 deals per arm. Scoring the defence goals raises **tension** (+0.027 ± 0.009), **dynamism**
(+0.024 ± 0.010) and **lead changes** (+0.63 ± 0.58 per 100 s). It leaves **cooperative spirals** unchanged
(+0.004 ± 0.165 per 100 commits), and **stagnation** stays at 1.0 (worlds are still moving at the end). `payoff_gini`
is not meaningful once totals can be negative: the B arm's ± 0.61 comes from a few games with a negative total.
Rank fairness is reported in 9.3 instead.

**Floor occupancy and trashing (the coordinator's questions).** At the end of a game, 26% of (object, defence god)
pairs have negative net bits, 17% of objects have at least one god whose peer care is clipped to 0 (vetoed), and
6% are dead (collective net ≤ 0). The flat zone of the *collective* floor is therefore real but minor. **Noise-trashing
does not emerge**: 1.7% of commits are by a god with negative bits on the object and lower its peers' bits without
raising its own, in scored and shadow games alike (−0.03 ± 0.16 points). The incentive exists, but private greedy
policies hold peers fixed and cannot see it; only omniscient gods can, and they are one seat in four. Flank repair
(own negative raised) is 2.9% of commits in both arms. No farming loophole was observed, and none exists by
construction (π_i > 0 needs n_i > 0 and peer care > 0).

**Mode comparison** (8 seeds, same experiment, 304 games per mode):

| mode | Δ ⚠️ bits (pooled) | Δ repair agents | Δ tension | Δ lead changes /100 s | Δ dynamism | gini B |
|---|---|---|---|---|---|---|
| floored | −0.23 ± 0.18 | +2.57 ± 0.87 | +0.012 ± 0.012 | +0.53 ± 0.82 | +0.019 ± 0.016 | 0.28 |
| gated | −0.34 ± 0.20 | +1.46 ± 0.79 | +0.015 ± 0.010 | +1.26 ± 1.02 | +0.026 ± 0.018 | 0.37 |
| private | −0.21 ± 0.14 | +1.94 ± 0.67 | +0.019 ± 0.012 | +0.21 ± 0.52 | +0.004 ± 0.011 | 0.42 |

All three make protectors defend. Gated is slightly livelier but has the self-destruction pathology of §4, and
its protectors repair less themselves (self-repair −66 ± 68 bits). Floored gets the strongest counter-agent
response and the least payoff inequality, and it is the user's narrative ("if nobody else cares, nobody scores"),
so it is the default. Penalty weight 0.25, 0.5 and 1 give the same defence effect within noise (pooled Δ ⚠️
−0.26, −0.20, −0.23 bits; repair agents +2.0, +2.0, +2.6).

### 9.3 Fairness

| family | n | mean rank scored | win rate scored | mean rank shadow | win rate shadow |
|---|---|---|---|---|---|
| `seed3_green_ones+hate_colour` | 24 | 2.25 ± 0.41 | 0.25 ± 0.18 | 1.75 ± 0.38 | 0.54 ± 0.20 |
| `seed1_line_painter+hate_blob` | 24 | 2.46 ± 0.49 | 0.29 ± 0.19 | 2.42 ± 0.46 | 0.29 ± 0.19 |
| `seed2_patchwork+hate_takeover` | 24 | 3.75 ± 0.27 | 0.00 ± 0.00 | 2.92 ± 0.47 | 0.21 ± 0.17 |
| `lucky_token+hate_colour` | 24 | 2.17 ± 0.51 | 0.46 ± 0.20 | 1.88 ± 0.43 | 0.50 ± 0.20 |
| `kingdom+hate_value` | 24 | 2.21 ± 0.39 | 0.29 ± 0.19 | 2.12 ± 0.45 | 0.38 ± 0.20 |
| `rainbow_road+hate_big_blob` | 24 | 3.54 ± 0.39 | 0.08 ± 0.11 | 2.71 ± 0.34 | 0.08 ± 0.11 |
| `number_bonds+hate_colour` | 24 | 2.88 ± 0.45 | 0.17 ± 0.15 | 2.92 ± 0.39 | 0.08 ± 0.11 |
| `magic_accountant+hate_value` | 24 | 2.54 ± 0.37 | 0.12 ± 0.14 | 2.71 ± 0.40 | 0.17 ± 0.15 |
| `no_takeover` | 24 | 3.79 ± 0.26 | 0.04 ± 0.08 | 3.33 ± 0.35 | 0.04 ± 0.08 |
| `four_corners` | 24 | 3.50 ± 0.33 | 0.04 ± 0.08 | 3.29 ± 0.30 | 0.00 ± 0.00 |
| `rainbow_guardian` | 24 | 3.25 ± 0.32 | 0.04 ± 0.08 | 3.00 ± 0.37 | 0.08 ± 0.11 |
| `blob_warden` | 24 | 3.58 ± 0.35 | 0.04 ± 0.08 | 3.17 ± 0.37 | 0.04 ± 0.08 |
| `mixed_bag` | 24 | 3.83 ± 0.15 | 0.00 ± 0.00 | 3.46 ± 0.35 | 0.08 ± 0.11 |

* **Variants**: on average a scored defence goal costs a variant about 0.3 of a rank (variants scored 2.72, shadow
  2.43). The cost is concentrated in the two structure-hating variants: `seed2_patchwork+hate_takeover` 3.75 vs 2.92
  and `rainbow_road+hate_big_blob` 3.54 vs 2.71. Count-based goals (hated colour or number) are within noise of
  their shadow rank. The cost is not by chance: the defence term is zero-mean on spawns, but play makes the world
  *more structured* than the prior, so a goal that hates structure is pushed on by everyone.
* **Protectors** rank 3.25–3.83 scored (mean 3.59) and 3.0–3.46 shadow (mean 3.25). Most of the gap is their reward channel: alternator-style
  targets (balanced colours, varied corners) are destroyed by everyone's building. Their deeper tie-breakers
  (in `rules/defence.py`) raised the reward ceilings from 4–8 to 10–40 bits, which helped, but not enough.
* In E2's mixed deals, defence families rank 2.90 ± 0.23 against 2.35 ± 0.12 for the rest.

So defence *works* and makes games livelier, but structure-hating defence goals and pure protectors are
currently **underpowered**. Recommendations, not built here: (1) give every god a defence goal when any god has
one (the cost is then symmetric); (2) deal structure-hating penalties only with a strong reward; (3) let the
dealer balance camps (`balanced_camps`), since protectors are natural alternators. Weight changes alone do not fix
it: weight 0.25 moves variants from 3.0 to 2.75 and protectors from 3.75 to 3.65, both within noise.

### 9.4 Robustness: Grid(4,base12,rgb), 8 seeds

Pooled over 104 pairs: Δ ⚠️ bits −0.11 ± 0.13 (smaller, since a 4×4 grid has fewer cells to damage) and **repair
agents +2.21 ± 0.94**. Tension +0.017 ± 0.012, spirals +0.16 ± 0.32 per 100 commits, dynamism +0.004 ± 0.012. In E2,
defence families rank 2.67 ± 0.42 against 2.44 ± 0.22 for the others. 26% of (object, defence god) pairs are
negative, and trashing stays at 1.5% in both arms.

### 9.5 Reproduce

```
cd lib/grid-lab
python3 -m gridlab.experiments.defence --seeds 24                    # 9.1–9.3 (~7 min on 4 cores)
python3 -m gridlab.experiments.defence --seeds 8 --mode gated        # mode comparison (also: private)
python3 -m gridlab.experiments.defence --seeds 8 --only E1 --weight 0.5
python3 -m gridlab.experiments.defence --seeds 8 --type 4,base12,rgb
python3 -m gridlab.run --defence --families seed3_green_ones+hate_colour,blob_warden,kingdom,rainbow_road --trace
```

