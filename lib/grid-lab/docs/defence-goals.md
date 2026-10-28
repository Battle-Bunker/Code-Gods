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
4. **No sign pathologies**: no negative × negative = positive, no god profiting from another god's loss.
5. **No exploits**: no unbounded self-bonus (−∞ penalty), no profitable pinning of rivals' grids.
6. **Kid-readable**: "+1 for each 3, −1 for each red cell", "✨ rarer than 976/1000 grids for your 3s,
   ⚠️ redder than 90% of grids".
7. **Ordinal only**: only the order of what a kid returns matters (SPEC: utility representation theorem).
   This rules out any design where the kid's *numbers* set an exchange rate.

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

## 3. How penalties enter the payoff

Write h_i for god i's penalty bits (defined in §4) and s_i = s⁺_i. Candidates:

| payoff | neg × neg | profit from others' loss | notes |
|---|---|---|---|
| (P1) net in both factors: n_i · Σ_{j≠i} n_j, n = s − h | **yes**: two unhappy gods score positive | yes: if n_i < 0, i gains when peers' n falls | broken |
| (P2) n_i · S_−i (own net × peers' reward bits) | no | **yes**: if n_i < 0, i gains when peers' s falls (spite: "if it's ugly to me, nobody may admire it") | spite on every damaged object |
| (P3) s_i · S_−i − h_i · S_−i, peers' penalties also enter S_−j | yes (via S_−j) | yes | and peers would want to lower *their own* s on objects others dislike |
| **(P4) s_i · S_−i − K_i · h_i, K_i a constant** | **no** | **no** | penalties are private; the product formula is untouched |

(P4) is the only form with **monotonicity**: ∂π_i/∂s_j = s_i ≥ 0 and ∂π_i/∂h_j = 0 for every j ≠ i, exactly as in
the positive-only game. No god ever profits from another god's surprisal falling or penalty rising. Its cost is that
peers have no *direct* reason to protect i's defence goal; they protect it only when their own goals align, which
is the honest outcome.

**The exchange rate K_i.** The penalty is in bits, the product in bits². The rate must not depend on the realised
peer surprisal (that is (P2) and brings back spite), so it is the prior expectation of the factor it replaces:

  K_i = E_μ[S_−i] = Σ_{j≠i} E_μ[s_j]

"One ⚠️ bit costs what one ✨ bit earns on a typical fresh spawn." Equivalently the penalty term is the user's own
product formula with the peer factor frozen at its prior mean: −h_i · E_μ[S_−i]. For fine-grained rules
E_μ[s_j] = log₂ e, so K ≈ 1.44 (G − 1) (≈ 4.3 bits with 4 gods); coarse rules contribute less. K_i is a per-game
constant shown to the god ("each ⚠️ bit costs you 4.1 points this game"); it reveals nothing about any one rival.
`GameConfig.penalty_rate` can replace it with a fixed number of bits per peer, and `penalty_weight` scales it.

**Is a change to the fixed formula unavoidable?** Yes, an additive term is: the product only contains s ≥ 0, and
we showed that putting negative values into either factor creates sign pathologies or spite. The change is the
minimum one: π_i = s_i · S_−i is kept verbatim for every god, and gods with a defence goal get one extra additive
term. With no penalties in the game, payoffs are bit-for-bit the old ones (tested).

## 4. Penalty bits: the median hinge and centring

Raw badness bits s⁻ have E_μ[s⁻] ≈ 1.44 and are ~1 bit on a typical grid. Two adjustments:

1. **Hinge at the median: h = max(0, s⁻ − 1).** One bit is the median (half of all grids are at least this bad).
   Below it the penalty is exactly 0: "only counts when the grid is worse than usual". This keeps defence goals
   *defensive*: without the hinge, a god hating reds earns up to 1.44 K per object by *cleaning* typical grids (recolour
   every red away), which is just a weak positive target "no reds" in disguise. With the hinge, cleaning a typical grid
   is worth nothing, and only repairing damage pays. Fairness: P_μ(h ≥ k) = P_μ(s⁻ ≥ k + 1) ≤ 2^−(k+1) for every
   penalty.
2. **Centre for the leaderboard: subtract h̄ = E_μ[h].** Without this, every spawn costs a penalty god
   K·E_μ[h] ≈ 0.72 K on average and penalty families would be handicapped by object count alone. The centring constant
   changes no incentive (gods cannot choose spawns; it is the same constant on every object) and makes the defence term
   zero-mean under the prior: **E_μ[π_i] is exactly what it would be without the defence goal.** The defence term
   per object is at most +K h̄ (any grid at or better than typical) and falls only through genuine badness, so there
   is no "make my own penalty −∞" exploit.

**Final per-object payoff:**

  π_i(x) = s⁺_i(x) · Σ_{j≠i} s⁺_j(x)  −  K_i · ( h_i(x) − h̄_i ),

  h_i(x) = max(0, −log₂ μ{d_i ≥ d_i(x)} − 1),   h̄_i = E_μ[h_i],   K_i = Σ_{j≠i} E_μ[s⁺_j].

For a god without a defence goal the second term is absent. Total payoff Π_i = Σ_x π_i(x), as before. E_μ[s] and
E_μ[h] are computed exactly from the survival tables (`Survival.prior_mean_bits`): for the step table,
E_μ[f(s)] = Σ_k f(s_k)·(G_k − G_{k+1}).

### Properties

* **Defence pays**: damaging a typical grid by k ⚠️ bits costs K·k bits². Running example (K ≈ 4.3): a red row
  costs 12, a red grid 211, the same order as a jackpot (a 20-bit object with 10 peer bits is worth 200).
* **Positive fairness unchanged**: s⁺ and the product are untouched.
* **Negative fairness**: P_μ(h ≥ k) ≤ 2^−(k+1) for every penalty, and E_μ[defence term] = 0 exactly, so a defence
  goal is neither a handicap nor a free lunch under the prior.
* **No pathologies**: no product of negatives exists; ∂π_i/∂(anything of j) ≥ 0.
* **Exploits**: self-bonus ≤ K h̄ per object (≈ 3 bits² for 4 gods). "Pinning" a rival's grids into their bad
  state is never profitable *in itself* (∂π_j/∂h_i = 0); it only happens as a by-product of j's own reward, which is
  exactly the spoiler/protector tension we want (Kingdom builds big blobs, Blob Warden hates them).
* **Protectors still need a positive target** to win: the defence term alone has expectation 0 and a ceiling of
  K h̄ per object, while builders' jackpots are unbounded. So every protector family has a modest reward channel
  too, and the defence goal is its *main* stake. This matches the user's framing: "both a positive target and a
  defence goal".

## 5. Policies and disclosure

A god sees its own reward and penalty tables, its own K_i, and per object its own s⁺, h and the peers' summed
reward bits S_−i (unchanged disclosure). Greedy policies value a transformation x → y as

  Δπ_i = (s⁺_i(y) − s⁺_i(x)) · S_−i(x) − K_i · (h_i(y) − h_i(x)),

the same peers-fixed approximation as before plus the exact private penalty change. Omniscient and cooperative
policies evaluate every god's full payoff including penalties. A defence goal makes *counter-agents* worth summoning:
programs that repaint, recolour or swap away damage have positive Δπ only when damaged objects exist (hinge), so a
protector's spending tracks the threat.

## 6. Kid-facing card and API

**Card** (dealt, private):

```
✨ Green Ones        +1 for each green 1 (more is better)
⚠️ Hates red         −1 for each red cell (only counts when a grid is redder than usual)
                    each ⚠️ costs you about 4 points this game
```

**Per object** (what the god sees on each grid):

```
✨ rarer than 976/1000 grids for your green 1s       (s⁺ = 5.4 bits)
⚠️ redder than 90% of grids                         (h = 2.3 bits → −9.5 points)
```

The ✨ line is 1 − μ{r ≥ r(x)} written per mille; the ⚠️ line is 1 − μ{d ≥ d(x)} as a percentage, shown only
when h > 0 (the grid is worse than half of all grids), with the penalty family's comparative word ("redder",
"blobbier", "more taken over"). `gridlab.defence.card(draw, gtype)` and `object_line(...)` render both.

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
* `calibrate.py`: reward calibration of a variant uses its base draw; `precompute` also builds penalty tables;
  `Survival.prior_mean_bits(hinge)`.
* `defence.py`: `hinge`, `penalty_constants`, `payoffs_with_defence`, card rendering.
* `sim.py`: a penalty matrix H (objects × gods) beside S; payoffs and snapshots include the defence term;
  the log stores penalty bits per commit and the constants. `GameConfig.score_penalties=False` computes and logs
  penalties without scoring them (the shadow control used by the experiments).
* `policy.py`, `metrics.py`: Δπ with the penalty, tension on net bits, damage/repair metrics.
* `rules/defence.py`: generic penalties, defence variants of existing rules, protector families
  (`DEFENCE_FAMILIES`, opt-in via `--defence`, so the default 88-family pool and its dealing are unchanged).

## 8. Evidence

See §9 (filled in from `python3 -m gridlab.experiments.defence`).
