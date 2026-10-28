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

RESULTS_PLACEHOLDER
