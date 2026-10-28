# Per-agent energy: summon pays the description, each act pays its own information

Code: `gridlab/energy.py` (split, pointwise costs, act profiles), `GameConfig.economy` in
`gridlab/sim.py`, the energy-aware value model and the `spammer` baseline in `gridlab/policy.py`, and the
study `gridlab/experiments/agent_energy.py`. Tests: `python3 -m tests.test_agent_energy`.
The default `economy = "summon"` is unchanged and bit-identical to before (checked against the base branch).

## 1. The design

The user's design, verbatim:

> I think we want spawning to cost the God energy and then each agent gets its own energy income and it
> only becomes eligible to be selected to act next once its energy exceeds its expected energy cost of
> acting. When it acts, the actual information cost of its act is deducted from its energy budget to
> create a principled cooldown mechanic. So the most efficient kind of agent is one that costs few bits to
> create (simple program) so you can make many of them and which is information efficient at doing its
> work so that each of those agents can act more often.

Mechanics as implemented (`economy = "agent_energy"`):

| piece | rule | knob (default) |
|---|---|---|
| summon | the god pays `summon_bits` = agent base + each step's tool naming and parameter description + guard kind and description + ratchet surcharge (after scope/kind multipliers) | – |
| god energy | accrues as today (`starting_energy`, `energy_per_second`) | – |
| agent account | starts at 0; earns `agent_income` bits/s from the moment it is summoned (planning included) | `agent_income`, `agent_start = "zero"` |
| sublinear income | each agent of a god with k agents earns `agent_income · k^(α−1)`, so the god's total is `agent_income · k^α` | `agent_income_alpha` (1) |
| battery | balance capped at `agent_battery × E[bits per act]`; income above the cap is lost (logged as `a_wasted`) | `agent_battery` (2) |
| eligibility | an agent can be picked only when balance ≥ E[bits per act] | – |
| interaction | at each tick of the global rate cap: a uniform object and a uniform **eligible** agent; none eligible means no interaction (`idle_ticks`) | `interaction_rate_hz` |
| charge | after the act: decision bits always; + erasure + motion only if the result is committed. Failed and no-op attempts (guard false, nothing changed, duplicate) pay the decision bits only. The balance may go negative (debt), which simply lengthens the cooldown | – |

`economy = "owner_pays"` reproduces the economy study's time split (`gridlab/explore/economy`, branch
`claude/gridlab-explore-economy`, `split=True, split_fail=0`) on the same code path: the summon pays the
description bits, and the **owner god** pays the analytic per-application bits (erasure + motion + measurement) on
every commit; an agent whose owner cannot pay is skipped. Every agent stays in the uniform draw, as in
the default economy.

**Starting balance: zero.** The alternatives were 0 or one expected act. At 0 every joule an agent spends
came from its own income stream. The cooldown also applies from birth: an agent whose act costs c bits
first acts c / income seconds after it is summoned. That is the same rule as every later act, and it
penalises expensive programs in exactly the intended way. A free first act would be energy from nowhere.
`agent_start = "one"` is available: the god pays one expected act into the new agent's account, which
conserves energy. It made no measurable difference (§4), because accounts fill within seconds of a summon and
most summons happen during the 60 s planning phase, which also accrues income.

## 2. The pointwise cost of one act

The price formula (docs/mutators.md §1) charges each step, *in expectation over the prior μ*,

    erase · E  +  move · Σ_L b_L · Ē_L² / N²  +  measure · M,

with E the Shannon erasure H(X) − H(f(X)), Ē_L the expected number of cells of layer L changed, b_L the
bits per cell of that layer, and M the runtime selection bits (log2 2N for a relative line, H_b(q) for a
guard). The new economy needs a cost for *this* act on *this* object whose expectation over μ is that
price. `energy.act(P, x)` returns (result, decision, erasure, motion):

**Erasure: log2 of the preimage.** For a deterministic map f and uniform X,

    H(X) − H(f(X)) = H(X | f(X)) = E_x [ log2 |f⁻¹(f(x))| ],

because, given y = f(x), X is uniform on the preimage of y. So the pointwise erasure
e(x) = log2 |f⁻¹(f(x))| (the bits of x that cannot be recovered from the result) is an unbiased
pointwise version of the price's erasure term, by construction. Its maximum is the Hartley erasure. Per
mutator, given the region the step acted on:

| mutator | e(x) | check |
|---|---|---|
| bijections (swap, shift, reverse, turn, hue, colour/symbol/suit swaps, rank step) | 0 | – |
| paint, write, pattern_line, motif, write_ramp, paint_by_key, mirror_fold, suit_set | the constant n · (bits per overwritten cell) | constant overwrite: every input has the same preimage size |
| recolour A→B | # output cells of colour B in the region (each was A or B: 1 bit) | E = 2n/C ✓ |
| stamp colour k → symbol s | # colour-k cells in the region × log2 S | E = (n/C) log2 S ✓ |
| tally (mines X) | # non-X cells in the region × log2 S | E = n(1 − 1/C) log2 S ✓ |
| blend | # eligible cells (not a parent, touching both) × log2(C − 2) | E = Σ q_cell · log2(C − 2) ✓ |
| sort_line | log2 (N! / ∏ m_j!) for the line's multiset of (symbol, colour) items | E = the MC term ✓ |
| majority_line | log2 #{lines in C^N whose plurality is the winning colour} | Σ_k f_k log2(C^N f_k) = N log2 C − H(plurality) ✓ exactly |
| flatten | log2 (h^n − (h−1)^n) for n lowered cells, h = hi − lo (ranks in [lo, hi), at least one at lo) | the price's (n − 1) log2 R is a deliberate over-charge, see below |

**Motion: linear in the distance actually travelled.** The pointwise motion is
move · Σ_L b_L · Ē_L · d_L(x) / N², where d_L(x) is the number of cells of layer L this act changed.
Thermodynamic length gives the reason. A protocol that drives a system a distance ℓ at speed v
dissipates about v · ℓ. The speed (Ē_L / N², the share of the object the program is built to move) is a
property of the program; the distance d_L(x) is a property of this act. Being linear in d, its
expectation is exactly move · b · Ē² / N², today's quadratic term. Charging d(x)² instead would bias it
upward by the variance of d (Jensen).

**Decision: the self-information of the action taken.** The expected decision cost is an entropy, so
its pointwise version is −log2 p(a) for the action a taken:

* *guard*: a = pass or fail, p = the guard's analytic pass rate q (clamped to [1e−9, 1 − 1e−9]). This
  costs −log2 q on a pass and −log2(1 − q) on a fail, so the expectation is exactly H_b(q), today's
  guard term. A guard that is rarely true at the prior is cheap to check and expensive to fire.
* *relative target* (line*): a = the line selected. p is estimated from the same REF = 96 reference
  spawns used for the expected cost, with add-½ (Krichevsky–Trofimov) smoothing over the 2N lines. An
  unseen line costs log2((96 + N)/½) ≈ 7.7–7.8 bits. That is finite, and it is larger than any seen line.
  The expectation is the entropy of the smoothed selection frequencies. Ties break to the lowest index,
  so that entropy is below today's flat log2 2N; the line* decision is genuinely cheaper than the price
  assumed.

All terms carry the step's scope/kind multiplier and the `COST_KNOBS` weights, as in `Mutator.cost`.
`split_terms(P)` returns (summon bits, analytic act bits), and they sum to `P.cost` exactly (tested on
450 random programs).

**Numerical check** (`tests/test_agent_energy.py`, 1200 fresh spawns per parameter set, 3 random parameter
sets per mutator, on Grid(5,base10,rgby), Grid(6,cards,rainbow6) and Grid(4,base12,rgb)): for every
mutator with an absolute region, the mean pointwise erasure equals the analytic term within 5 standard
errors (and exactly for the constant ones). The mean pointwise motion matches within 5 standard errors
+ 10%. The 10% covers the price's approximate changed-cell counts for card rank swaps, which are off by
about 8%. The guard decision averages to H_b(q) within 0.03 bits. Two documented exceptions,
where the *price* (not the pointwise cost) is the approximation:

* **line\*** steps. The price assumes a random line, but the selected line is the one where the target
  is already most common. On Grid(6,cards,rainbow6), "paint the line with most k, k" changes 3.5 cells,
  not the 5.0 the price assumes. "Recolour A→B on the line with most B" erases 3.2 bits, not 2.0. A
  majority vote on the line closest to one colour erases 12.87 bits, not 12.99, and moves 2.5 cells, not
  3.6. The pointwise cost reflects what actually happens.
* **flatten.** The price's (n − 1) log2 R is commented in mutators.py as "a slight over-charge". The
  exact preimage gives about 4.5 bits less on a 5-cell line (8.9 vs 13.3) and about 10 bits less on the
  whole grid (70 vs 80).

**Expected cost per act** (the eligibility threshold and the policies' estimate), `ActProfile.expected`
= measure · H_b(q) + q · (mean over the REF reference spawns of: line* bits + erasure + motion if the
steps changed the object). It is computed with the same charging rule as live acts. No-ops and failures pay
decision bits only. The step part is measured with the guard ignored, which is an approximation for guards
correlated with their steps. The analytic act bits (the price's runtime part) are kept as
`ActProfile.analytic` for comparison. They differ from `expected` for two reasons. First, the price
charges a guarded program's full step cost on every application, whatever its pass rate. Second, the
price charges erasure even when the act changes nothing. For example, painting a cell
red when it is already red is a no-op 1/C of the time. Profiles for a 4096-program library take about 6 s
per GridType on 4 cores and are disk-cached (`energy.library_profiles`).

Library statistics (the policies' candidate catalogue; harness knobs, flatten disabled):

| GridType | Program.cost p10 / p50 / p90 | summon bits p10 / p50 / p90 | E[bits per act] p10 / p25 / p50 / p75 / p90 | share < 1 bit/act |
|---|---|---|---|---|
| Grid(5,base10,rgby) | 17 / 36 / 89 | 13 / 23 / 37 | 0.06 / 0.8 / 6.8 / 20 / 59 | 28% |
| Grid(6,cards,rainbow6) | 17 / 42 / 146 | 14 / 24 / 40 | 0.02 / 0.8 / 9.8 / 32 / 116 | 27% |
| Grid(4,base12,rgb) | 16 / 34 / 66 | 13 / 22 / 35 | 0.2 / 1.1 / 6.3 / 17 / 32 | 23% |

The description is only about two thirds of the median price, and its spread is narrow (13–40 bits). The
runtime part spans three orders of magnitude, from reversible swaps (0.02–0.1 bits per act: no erasure,
tiny motion) to whole-grid wallpapers (50–120 bits). So this economy differentiates agents mainly by how
often they can act, not by how many a god can afford.

## 3. Policies

Under `agent_energy` the candidate's price is its summon bits, and the greedy family (`greedy_private`,
`greedy_omniscient`, `cooperative`, `saver`) values it as

    acts/s = min( marginal own income / E[bits per act],  rate / (A + 1) )
    V(P)   = d(P) · acts/s · E[remaining time] · discount,      yield = V / summon_bits

d(P) is the mean Δπ over sampled objects per *attempt*, so failed attempts count as 0, consistent with
E[bits per act] including their decision bits. The marginal own income is
income · ((k+1)^α − k^α) for a god with k agents. With α < 1, that counts the income the new agent
takes from the god's other agents. The rate/(A + 1) term is the uniform share when the rate cap binds.
Under `owner_pays` the yield is d · apps · discount / (summon bits + per-commit bits · apps · commit share),
which is the total cost of ownership. `energy_aware=False` (policy kwarg) keeps the old value model on the
new prices (the "naive" setting below). `random` buys at the summon price. The new `spammer` baseline
summons the cheapest of 12 random programs at every decision, regardless of value.

<!-- RESULTS -->
