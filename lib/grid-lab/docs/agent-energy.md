# Per-agent energy: summon pays the description, each act pays its own information

Code: `gridlab/energy.py` (split, pointwise costs, act profiles), `GameConfig.economy` in
`gridlab/sim.py`, the energy-aware value model, `destroy` and the `spammer` baseline in
`gridlab/policy.py`, and the study `gridlab/experiments/agent_energy.py`. Tests:
`python3 -m tests.test_agent_energy`. The default `economy = "summon"` is unchanged and bit-identical to
before (checked against the base branch by hashing the logs of the same games).

## 1. The design

The user's design, verbatim:

> I think we want spawning to cost the God energy and then each agent gets its own energy income and it
> only becomes eligible to be selected to act next once its energy exceeds its expected energy cost of
> acting. When it acts, the actual information cost of its act is deducted from its energy budget to
> create a principled cooldown mechanic. So the most efficient kind of agent is one that costs few bits to
> create (simple program) so you can make many of them and which is information efficient at doing its
> work so that each of those agents can act more often.

Later corrections, relayed by the coordinator:

* Agent energy is completely separate from the god's energy. It only regulates the agent's own cooldown,
  so income per agent is a constant, whatever the god's agent count.
* Balances may go negative.
* Gods may destroy their own agents for free, with no refund.

Mechanics as implemented (`economy = "agent_energy"`):

| piece | rule | knob (default) |
|---|---|---|
| summon | the god pays `summon_bits` = agent base + each step's tool naming and parameter description + the guard's kind and description + the ratchet surcharge (after scope/kind multipliers). This is the god's only cost | – |
| god energy | accrues as today (`starting_energy`, `energy_per_second`); no agent energy ever flows to or from it | – |
| agent account | starts at 0; earns a constant `agent_income` bits/s from the moment it is summoned (planning included) | `agent_income` (0.4 at 20 Hz, i.e. 2 at 100 Hz), `agent_start = "zero"` |
| battery | the positive balance is capped at `agent_battery × E[bits per act]`; income above the cap is lost (`a_wasted`) | `agent_battery` (2) |
| eligibility | an agent can be picked only when its balance ≥ E[bits per act] | – |
| interaction | at each tick of the global rate cap: a uniform object and a uniform **eligible** agent. If none is eligible, there is no interaction (`idle_ticks`) | `interaction_rate_hz` |
| charge | after the act, its full actual cost is deducted, even below zero: decision bits always, plus erasure and motion only if the result is committed. Failed and no-op attempts (guard false, nothing changed, duplicate) pay their decision bits only. An expensive act simply means a longer cooldown | – |
| per-act floor (variant) | a constant charged on every attempted act and included in E[bits per act]. The rationale is the Margolus–Levitin bound: every distinguishable state change costs a fixed quantum of energy × time, even when it is reversible, so a deterministic reversible agent has a finite top rate | `agent_act_floor_bits` (0) |
| naming per act (variant) | the program's naming bits (tool + parameters + guard description, i.e. summon bits minus agent base and ratchet), charged again on every act | `agent_act_naming` (0) |
| destroy | a god removes one of its own live agents at any decision: free, no refund, and its balance is dropped | – |
| agent cap | 200 per god, as a resource limit only | `max_agents` |

`economy = "owner_pays"` reproduces the economy study's time split (`gridlab/explore/economy`, branch
`claude/gridlab-explore-economy`, `split=True, split_fail=0`) on the same code path. The summon pays the
description bits, and the **owner god** pays the analytic per-application bits on every commit. An
agent whose owner cannot pay is skipped.

**Starting balance: zero.** The alternative was one expected act. At zero, everything an agent spends
came from its own income, and the cooldown applies from birth: an agent whose act costs c bits first acts
c / income seconds after it is summoned, the same rule as every later act. `agent_start = "one"` (the god
pays one expected act into the account) is available. In the first study round it mostly made gods buy
cheaper-acting programs (65% bijective vs 42%), because the god then pays for the first act.

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

Under `agent_energy` the candidate's price is its summon bits. The greedy family (`greedy_private`,
`greedy_omniscient`, `cooperative`, `saver`) values a candidate as

    acts/s = min( agent_income / E[bits per act],  rate / (A + 1) )
    V(P)   = d(P) · acts/s · E[remaining time] · discount,      yield = V / summon_bits

Here d(P) is the mean Δπ per *attempt* over sampled objects. Failed attempts count as 0, consistent
with E[bits per act] including their decision bits. E[bits per act] includes the floor and naming
variants. The rate/(A + 1) term is the uniform share when the rate cap binds.

**Destroy.** The greedy family destroys an agent once it has made ≥ 20 attempts with a negative
realised own Δpayoff per attempt. When the god is at the 200 cap, it also destroys its worst agent. This
is on by default under `agent_energy` and can be forced either way with `destroy=True/False`. `random`
and `spammer` never destroy.

Under `owner_pays` the yield is d · apps · discount / (summon bits + per-commit bits · apps · commit
share), i.e. the total cost of ownership. `energy_aware=False` keeps the old value model on the new
prices. `spammer` summons the cheapest of 12 random programs at every decision, regardless of value.

## 4. Results

**Setup.** `python3 -m gridlab.experiments.agent_energy --games 40 --spam-games 30` (about 70 min on 4
cores from cold). Each setting runs the same **120 paired games**: 40 seeds × Grid(5,base10,rgby),
Grid(6,cards,rainbow6) and Grid(4,base12,rgb). Every game has 4 gods, one each of random,
greedy_private, saver and greedy_omniscient. Every setting starts from the harness `BASE`: the engine
defaults at the real engine's **100 Hz**, exponential length with mean 433 s, 10 starting objects and
0.1 Hz spawns. Settings prefixed `w80_` use the experiment worker's new world instead (0.5 Hz spawns,
80 starting objects). The anti-spam test uses 90 further paired games per setting. CIs are 95%: a
bootstrap over games for means, and ±1.96 SE of the per-game difference for "paired Δ". Win shares
carry about ±0.08. Names read `energy_I{income}_B{battery}[_floorF | _naming]`; destroy is on unless
`nodestroy`. The full generated tables are in §7.

### 4.1 Where the cooldown, not the cap, regulates play

| setting | demand / cap | cap-binding share | idle ticks | commits/s | hits / object / s | cheapest third of agents: share of acts (of lifetime) | crowding ratio |
|---|---|---|---|---|---|---|---|
| summon (today) | – | always | 0% | 81.9 | 3.74 | – | – |
| energy I0.05 | 0.11 | 10% | 49% | 5.3 | – | 95% (25%) | 3.8 |
| energy I0.25 | 0.40 | 40% | 38% | 15.7 | – | 93% (21%) | 4.7 |
| energy I1 | 1.34 | 55% | 24% | 34.6 | – | 87% (20%) | 4.6 |
| energy I2 | 2.82 | 68% | 13% | 46.4 | 2.02 | 82% (20%) | 4.2 |
| energy I0.25, no destroy | 0.94 | 47% | 24% | 41.1 | – | 94% (34%) | 2.8 |
| energy I2, floor 1 | 0.20 | 1% | 76% | 17.0 | – | 62% (22%) | 2.8 |
| **energy I2, floor 2** | 0.14 | 0% | 83% | 12.6 | **0.53** | 59% (25%) | 2.5 |
| energy I2, floor 4 | 0.10 | 0% | 88% | 9.3 | – | 55% (27%) | 2.1 |
| energy I2, naming | 0.05 | 0% | 94% | 5.3 | – | 48% (30%) | 1.6 |
| w80 summon | – | always | 0% | 82.1 | 0.56 | – | – |
| w80 energy I2 | 2.38 | 66% | 19% | 44.8 | 0.29 | 83% (19%) | 4.5 |
| w80 energy I2, floor 2 | 0.14 | 0% | 82% | 13.0 | 0.08 | 60% (24%) | 2.5 |

*Demand / cap* is the median over 5 s snapshots of Σ over live agents of income / E[bits per act],
divided by the rate cap (E is clipped at 10⁻³ bits). *Crowding ratio* is the cheapest third's share of
acts divided by its share of agent-lifetime (1 = acts in proportion to presence).

* **Without a floor, the cap binds even when median demand is below it.** Near-free reversible agents
  (E[bits per act] ≈ 0.02–0.1) each demand tens of acts per second. In the median the demand ratio
  is 0.4 at I0.25 and 1.3 at I1, but 40–55% of snapshots exceed the cap.
* **Crowding is high but not crowding-out.** The cheapest third takes 82–95% of acts. Yet below I4, the
  dearer agents still get their full energy-limited quota: median acts / (income × life / E) is 0.97–1.07
  for the dearest third at I1–I2 (0.77 at I0.25, where the first cooldown can outlast the agent). The cheap
  agents absorb the cap themselves (0.77 utilisation for the cheapest third at I4). So the volume goes to
  cheap agents because their acts are cheap, as designed, and it is not taken from anyone.
  It is degenerate in a different sense. Those acts are mostly reversible churn with negative realised value
  (§4.5), so the greedy gods destroy 30–45% of their agents.
* **A per-act floor makes energy the regulator.** With a 1–4 bit floor, demand falls to 0.1–0.2× the cap,
  the cap never binds, and crowding halves (2.1–2.8). The fastest possible agent is now
  income / floor = 0.5–2 acts/s. Charging naming per act does the same more strongly (E[bits per act]
  rises to about 9 bits), at a quarter of the floor's activity.
* **Hits per object.** Today's default world boils at 3.7 hits per object per second. With a 2-bit floor
  at I2 it runs at **0.53**, inside the 0.4–0.7 band the experiment worker found best, reached by
  cooling agents instead of adding objects. On the w80 world the energy economies under-boil (0.29 plain, 0.08
  with the floor). There they would need several times the income; that was not run.

### 4.2 Dynamism, rarity and activity

| setting | dynamism | paired Δ dynamism | Δ dynamism2 | Δ tension | Δ spirals /100 | Δ lead ch. /100 s | Δ late activity | final salience (bits) | welfare vs summon |
|---|---|---|---|---|---|---|---|---|---|
| summon | 0.699 | – | – | – | – | – | – | 12.8 | 1 |
| owner_pays | 0.634 | −0.065 ± 0.015 | −0.144 | −0.092 | −1.09 | +1.85 | −0.016 | 4.8 | 0.25 |
| energy I0.02 | 0.618 | −0.080 ± 0.018 | −0.141 | −0.101 | −2.11 | −1.45 | +0.036 | 4.8 | 0.25 |
| energy I0.25 | 0.644 | −0.055 ± 0.015 | −0.083 | −0.095 | −2.10 | +0.16 | +0.030 | 5.9 | 0.38 |
| energy I1 | 0.648 | −0.050 ± 0.012 | −0.014 | −0.092 | −2.46 | +0.15 | +0.037 | 8.6 | 0.68 |
| energy I2 | 0.651 | −0.047 ± 0.011 | +0.022 | −0.084 | −2.52 | +0.42 | +0.026 | 10.2 | 0.89 |
| energy I4 | 0.661 | −0.038 ± 0.013 | +0.054 | −0.071 | −2.10 | +0.12 | +0.031 | 12.5 | 1.22 |
| energy I0.25, no destroy | 0.666 | −0.033 ± 0.013 | −0.103 | −0.094 | −1.53 | +2.34 | +0.055 | 5.1 | 0.29 |
| energy I0.25, floor 2 | 0.686 | −0.013 ± 0.017 | −0.076 | −0.026 | −0.14 | −1.30 | +0.055 | 7.0 | 0.49 |
| energy I2, floor 1 | 0.692 | −0.007 ± 0.011 | +0.068 | −0.031 | −0.56 | −0.15 | +0.046 | 11.9 | 1.22 |
| **energy I2, floor 2** | 0.705 | **+0.006 ± 0.012** | **+0.072** | −0.015 | −0.09 | −0.13 | +0.051 | 12.8 | 1.28 |
| energy I2, floor 4 | 0.708 | +0.009 ± 0.012 | +0.069 | −0.000 | +0.02 | −0.49 | +0.052 | 13.5 | 1.37 |
| energy I0.25, naming | 0.637 | −0.062 ± 0.030 | −0.135 | +0.009 | −0.54 | −2.92 | +0.105 | 7.0 | 0.47 |
| energy I2, naming | 0.707 | +0.008 ± 0.015 | +0.048 | +0.020 | +0.34 | −1.19 | +0.056 | 14.3 | 1.53 |
| w80 summon | 0.665 | −0.033 ± 0.013 | +0.087 | −0.001 | −0.06 | −2.61 | +0.005 | 11.0 | 5.19 |
| w80 energy I2 | 0.617 | −0.082 ± 0.015 | −0.044 | −0.084 | −2.59 | −2.35 | +0.035 | 7.9 | 3.57 |
| w80 energy I2, floor 2 | 0.658 | −0.041 ± 0.016 | −0.074 | −0.017 | −0.27 | −3.02 | +0.053 | 9.3 | 4.62 |
| w80 energy I2, naming | 0.667 | −0.032 ± 0.015 | −0.130 | +0.035 | −0.47 | −3.06 | +0.058 | 9.6 | 4.93 |

All paired differences are against the default-world `summon`. w80 rows therefore include the effect of
the world change; compare w80 rows with `w80 summon` for the economy alone. Stagnation is ≈ 1 everywhere.

* **Without a floor, the energy economy is less dynamic than today:** −0.04 to −0.08, mostly through
  tension (−0.07 to −0.10) and spirals (−2 per 100 commits). Destroy makes this worse. At I0.25, turning
  destroy off recovers 0.022 dynamism and more than doubles the commits, because the agents destroyed are the
  churners that produce tension.
* **With a 2–4 bit floor at I2, dynamism, tension, spirals and rarity all return to today's levels**
  (paired Δ dynamism +0.006 ± 0.012), with higher dynamism2 (+0.07) and more late activity (+0.05),
  while the world commits 85% fewer changes. Each commit matters more: a ×1.28 higher welfare and the
  same final salience from 15% of the commits.
* **Naming per act** is similar at I2: dynamism +0.008 and the most rarity (14.3 bits). But it halves the
  activity again (5 commits/s) and cuts lead changes (−1.2 per 100 s). At I0.25 it starves the world (99% idle).
* **The w80 world** raises dynamism2 under today's economy (+0.087) but lowers lead changes. Every energy
  economy loses more there, because 80+ objects need more acts than the cooled agents supply.

### 4.3 Policy balance: does saver still dominate?

| setting | random | greedy_private | saver | greedy_omniscient |
|---|---|---|---|---|
| summon | 0.17 | 0.20 | **0.47** | 0.16 |
| owner_pays | 0.20 | 0.20 | 0.38 | 0.23 |
| energy I0.02 | 0.23 | 0.22 | 0.30 | 0.25 |
| energy I0.25 | 0.21 | 0.22 | 0.28 | 0.30 |
| energy I1 | 0.17 | 0.27 | 0.29 | 0.28 |
| energy I2 | 0.17 | 0.24 | 0.29 | 0.29 |
| energy I4 | 0.13 | 0.28 | 0.34 | 0.25 |
| energy I0.25, no destroy | 0.31 | 0.29 | 0.20 | 0.20 |
| energy I2, floor 1 | 0.16 | 0.27 | 0.33 | 0.24 |
| energy I2, floor 2 | 0.12 | 0.25 | 0.38 | 0.25 |
| energy I2, floor 4 | 0.15 | 0.26 | 0.35 | 0.24 |
| energy I2, naming | 0.16 | 0.22 | 0.36 | 0.27 |
| w80 summon | 0.15 | 0.19 | 0.47 | 0.19 |
| w80 energy I2 | 0.14 | 0.23 | 0.29 | 0.34 |
| w80 energy I2, floor 2 | 0.15 | 0.20 | 0.43 | 0.22 |

Win share over 120 games (fair = 0.25). Saver wins **47%** today in both worlds, reproducing the
coordinator's ≈ 49%.

* Plain energy (I ≤ 2) brings saver down to 0.28–0.30, with the other policies at 0.17–0.30.
* The per-act floor restores part of saver's edge: 0.33 at floor 1, 0.35–0.38 at floor 2–4. Naming per act
  gives 0.36. With a floor, few acts happen and dear high-erasure agents matter again, which is what saver
  saves for. Saver remains below today's 0.47 in the default world, but at 0.43 it is barely below on w80.
* random falls to 0.12–0.17 in every economy that works well. That is reasonable: a random god should lose.

### 4.4 Destroy, agents and bits

| setting | destroys per god (greedy / saver / omniscient) | agents destroyed | agents per god (rnd / greedy / saver / omni) | median description bits | median E[bits per act] | median acts per agent | median charged bits per act | bijective share |
|---|---|---|---|---|---|---|---|---|
| summon | – | – | 25 / 28 / 8 / 32 | 14.5 | 1.24 | 372 | – | 0.59 |
| energy I0.25 | 12 / 14 / 14 | 31% | 32 / 37 / 20 / 41 | 14.1 | 3.6 | 20 | 0.00 | 0.45 |
| energy I2 | 21 / 12 / 22 | 44% | 32 / 36 / 18 / 40 | 14.1 | 4.4 | 29 | 0.05 | 0.42 |
| energy I2, floor 1 | 20 / 13 / 21 | 41% | 32 / 36 / 23 / 40 | 14.1 | 4.8 | 22 | 1.37 | 0.39 |
| energy I2, floor 2 | 19 / 13 / 20 | 39% | 32 / 36 / 25 / 39 | 14.2 | 5.2 | 21 | 2.65 | 0.37 |
| energy I2, naming | 14 / 8 / 14 | 27% | 32 / 36 / 27 / 39 | 14.1 | 8.5 | 20 | 17.1 | 0.32 |
| energy I0.25, naming | 1 / 1 / 1 | 2% | 32 / 37 / 25 / 40 | 14.0 | 9.6 | 2 | 14.8 | 0.32 |

"Agents per god" counts every agent summoned, including those later destroyed. "E[bits per act]"
excludes the floor and naming charges.

* **Destroy is used heavily:** 30–45% of agents are destroyed, nearly all of them cheap-act churners
  whose realised own payoff per attempt went negative. It frees summon budget: saver fields 18–25 agents
  rather than 8 today.
* Descriptions stay narrow (median 14 bits, p10–p90 11–24), as in the first round. Agent counts rise by
  about 30% over today because the god pays only the description.
* Conservation holds in every game: |start + income − charged − wasted − balance| is tiny for every agent
  (float32 logging; worst case 6.4e−4 bits), and 2–13% of agents end in debt.

### 4.5 Do "simple and information-efficient" agents win?

Within-game Spearman ρ between a god's payoff and its agents' mean description bits and mean E[bits per
act] (mean ± 95% CI over 120 games):

| setting | ρ(payoff, description bits) | ρ(payoff, E[bits per act]) | ρ(payoff, agent count) |
|---|---|---|---|
| summon | +0.13 ± 0.10 | +0.26 ± 0.09 | −0.23 ± 0.09 |
| energy I0.25 | −0.11 ± 0.10 | +0.03 ± 0.10 | +0.06 ± 0.10 |
| energy I2 | −0.04 ± 0.10 | +0.08 ± 0.10 | +0.04 ± 0.11 |
| energy I2, floor 2 | −0.07 ± 0.10 | +0.25 ± 0.10 | −0.02 ± 0.10 |
| energy I2, naming | +0.03 ± 0.11 | +0.35 ± 0.09 | −0.10 ± 0.10 |

* **Simplicity:** today the gods with dearer descriptions win (+0.13). Under the energy economy the sign
  turns slightly negative (−0.04 to −0.11), but it is never clearly non-zero. Descriptions vary too little
  to buy many more agents, and agent count is uncorrelated with winning.
* **Cheap acts do not win; dear acts do,** most clearly once a floor or naming charge makes acts scarce
  (+0.25 to +0.35). Per agent, the cheapest-acting third has negative own Δpayoff per second in every
  setting (§7, terciles). That is why greedy gods destroy them.
* The reason is structural. By the Donsker–Varadhan / Landauer bound (docs/mutators.md §1b), an act cannot
  create more expected surprisal than about the bits it erases. "Cheap per act" therefore means "creates
  no rarity": reversible moves that redistribute other gods' structure. The economy makes information
  *cost* time, but each bit buys about the same rarity whoever spends it. The efficiency that could win is
  Δpayoff per bit, and it is bounded about equally for all mutators. Beyond better targeting (guards and
  relative regions that fire where the owner gains), this economy cannot reward it.

### 4.6 Per-family fairness

Policy-adjusted family z over the 44 families with ≥ 6 god-slots. *Excess SD* is the spread beyond
sampling noise (0 = all families equally strong):

| setting | excess SD | setting | excess SD |
|---|---|---|---|
| summon | 0.180 | energy I2, floor 1 | 0.188 |
| energy I0.25 | 0.171 | **energy I2, floor 2** | 0.177 |
| energy I1 | 0.209 | energy I2, floor 4 | 0.195 |
| energy I2 | 0.198 | energy I2, naming | 0.185 |
| w80 summon | 0.175 | w80 energy I2, floor 2 | 0.222 |

No energy setting is clearly fairer or less fair than today in the default world (0.17–0.21 vs 0.18). On w80
the energy economies are less fair (0.19–0.23). Single-family moves (§7) rest on 6–15 slots each and
are indicative only.

### 4.7 Anti-spam (200-agent cap only)

| setting | spammer wins | its agents | its share of acts | saver wins |
|---|---|---|---|---|
| summon | 0.13 | 38 | 0.39 | 0.59 |
| energy I0.25 | 0.14 | 46 | 0.38 | 0.22 |
| energy I2 | 0.23 | 46 | 0.57 | 0.27 |
| energy I2, naming | 0.19 | 46 | 0.44 | 0.43 |
| energy I2, floor 2 | 0.18 | 46 | 0.49 | 0.41 |

90 paired games per setting. **Spam never dominates.** The spammer runs out of god energy at about 46
agents, far below the 200 cap. Without a floor at I2 it takes 57% of the acts through crowding, yet
wins only 0.23 (below fair), because cheap random acts are mostly churn. The floor cuts its share to 49% and
its win rate to 0.18.

### 4.8 First-round findings that still apply

The first round ran 180 games per setting, before the corrections (sublinear income, no destroy). Its
remaining conclusions, not re-run:

* the battery size barely matters between 1 and 8 (dynamism within 0.004; B = 1 doubles idle ticks);
* `agent_start = "one"` shifts purchases to cheap-act programs;
* the old value model on the new prices ("naive") loses about 0.05 dynamism and summons programs
  it cannot run, so policies must know the economy;
* `owner_pays` bankrupts gods: 79–80% of draws are skipped, commits fall to 17/s, and final salience to 4.8 bits.

## 5. Recommendations

1. **Use `economy = "agent_energy"` with a physical per-act floor, `agent_act_floor_bits = 2`, and
   `agent_income = 2` bits/s per agent at the engine's 100 Hz** (`energy_I2_B2_floor2`; scale the income
   with the rate). This is the only setting tested where the cooldown, not the global cap, regulates play
   (demand 0.14× the cap, the cap never binds) *and* dynamism is not lost:
   * paired Δ dynamism +0.006 ± 0.012 and dynamism2 +0.072;
   * tension and spirals at today's level, final rarity equal (12.8 bits), welfare ×1.28;
   * hits per object 0.53, inside the experiment worker's best band;
   * saver's 47% cut to 38%;
   * crowding halved (2.5) and spam harmless.
   The cost is that the world changes 85% less often (12.6 vs 82 commits/s), and saver keeps part of its
   edge.
2. **If policy balance matters more than dynamism, drop the floor to 1 bit** (saver 0.33, dynamism
   −0.007 ± 0.011, rarity 11.9) or use plain energy at I0.25–2 (saver 0.28–0.29, dynamism −0.05).
3. **Prefer the floor over naming per act.** At the same income, naming gives similar dynamism and the
   most rarity, but a quarter of the floor's activity, fewer lead changes, a worse saver share, and it
   starves the world at low income. The floor also has the cleaner rationale: it charges the act, not the
   description a second time.
4. **`agent_battery = 2`, `agent_start = "zero"`.** Neither matters much. Keep the energy-aware value model
   and destroy on.
5. **Keep the default world (10 objects, 0.1 Hz) for this economy, or raise income with the object count.**
   With 80 objects, the cooled agents under-boil the world (0.08 hits per object per second at I2 with a
   2-bit floor). Holding the experiment worker's 0.4–0.7 band there needs roughly 5–8× the income (an
   estimate from the linear scaling of commits; not run).

## 6. Caveats

* All players are simulated policies (one-step lookahead on 24 sampled objects). Planning players might
  exploit cheap-act agents better, for example with rarely-true guards that fire only on their own
  jackpots. The decision charge −log2 q on a pass prices that.
* The expected cost per act is measured at the prior. In play, guards pass more often and overwrites
  more often do nothing, so realised costs differ from the threshold, which self-corrects through debt.
* The destroy rule is simple (negative realised yield after 20 attempts). Smarter rules might destroy
  less and keep more of the churn-driven tension.
* 120 games per setting, so win shares carry ±0.08. One rate (100 Hz), three GridTypes, 4 gods. The
  knee should be re-measured if the rate cap or the summon prices change.

## 7. Full tables (generated)

`python3 -m gridlab.experiments.agent_energy --games 40 --spam-games 30 --out report.md` regenerates this
section from the cache.

#### Headline metrics (mean [95% bootstrap CI]; 40 games per GridType × 3 GridTypes)

| setting | dynamism | dynamism2 | tension_rate | spirals_per_100_commits | lead_changes_per_100s |
|---|---|---|---|---|---|
| summon | 0.699 [0.685, 0.709] | 0.525 [0.504, 0.548] | 0.3 [0.281, 0.317] | 8 [7.75, 8.25] | 4.86 [4.18, 5.45] |
| owner_pays | 0.634 [0.622, 0.645] | 0.382 [0.372, 0.39] | 0.208 [0.189, 0.229] | 6.91 [6.57, 7.33] | 6.71 [6.06, 7.39] |
| energy_I0p02_B2 | 0.618 [0.603, 0.634] | 0.385 [0.376, 0.392] | 0.199 [0.18, 0.219] | 5.89 [5.53, 6.3] | 3.41 [2.95, 3.85] |
| energy_I0p05_B2 | 0.637 [0.622, 0.65] | 0.404 [0.395, 0.413] | 0.201 [0.182, 0.224] | 6.15 [5.79, 6.54] | 4.63 [4.18, 5.12] |
| energy_I0p1_B2 | 0.645 [0.632, 0.657] | 0.413 [0.401, 0.423] | 0.202 [0.181, 0.221] | 6.16 [5.87, 6.5] | 4.98 [4.52, 5.41] |
| energy_I0p25_B2 | 0.644 [0.631, 0.655] | 0.442 [0.428, 0.455] | 0.205 [0.189, 0.225] | 5.9 [5.63, 6.24] | 5.02 [4.48, 5.54] |
| energy_I1_B2 | 0.648 [0.638, 0.658] | 0.512 [0.488, 0.53] | 0.209 [0.191, 0.225] | 5.54 [5.23, 5.87] | 5.01 [4.34, 5.62] |
| energy_I2_B2 | 0.651 [0.641, 0.66] | 0.548 [0.525, 0.568] | 0.217 [0.2, 0.235] | 5.48 [5.21, 5.77] | 5.28 [4.69, 5.93] |
| energy_I4_B2 | 0.661 [0.649, 0.673] | 0.579 [0.555, 0.604] | 0.23 [0.212, 0.249] | 5.9 [5.58, 6.26] | 4.99 [4.37, 5.69] |
| energy_I0p25_B2_naming | 0.637 [0.609, 0.664] | 0.39 [0.378, 0.402] | 0.309 [0.288, 0.333] | 7.47 [6.77, 8.3] | 1.94 [1.65, 2.28] |
| energy_I2_B2_naming | 0.707 [0.693, 0.719] | 0.573 [0.552, 0.592] | 0.32 [0.302, 0.338] | 8.34 [8.07, 8.62] | 3.67 [3.16, 4.18] |
| energy_I0p25_B2_floor2 | 0.686 [0.671, 0.701] | 0.45 [0.438, 0.462] | 0.275 [0.258, 0.293] | 7.86 [7.52, 8.27] | 3.56 [3.13, 4.02] |
| energy_I2_B2_floor2 | 0.705 [0.691, 0.717] | 0.597 [0.573, 0.62] | 0.285 [0.269, 0.303] | 7.91 [7.62, 8.26] | 4.73 [4.08, 5.4] |
| energy_I2_B2_floor1 | 0.692 [0.68, 0.703] | 0.593 [0.57, 0.615] | 0.269 [0.253, 0.287] | 7.45 [7.16, 7.78] | 4.71 [4.01, 5.33] |
| energy_I2_B2_floor4 | 0.708 [0.694, 0.719] | 0.594 [0.572, 0.616] | 0.3 [0.283, 0.319] | 8.02 [7.74, 8.32] | 4.37 [3.77, 4.94] |
| energy_I0p25_B2_nodestroy | 0.666 [0.655, 0.676] | 0.422 [0.408, 0.436] | 0.207 [0.187, 0.227] | 6.47 [6.15, 6.81] | 7.21 [6.63, 7.8] |
| w80_summon | 0.665 [0.653, 0.678] | 0.612 [0.591, 0.634] | 0.299 [0.282, 0.316] | 7.95 [7.69, 8.21] | 2.26 [1.76, 2.72] |
| w80_energy_I0p05_B2 | 0.553 [0.531, 0.574] | 0.318 [0.311, 0.322] | 0.195 [0.176, 0.215] | 5.01 [4.61, 5.42] | 1.4 [1.11, 1.69] |
| w80_energy_I0p25_B2 | 0.596 [0.579, 0.611] | 0.342 [0.335, 0.349] | 0.2 [0.181, 0.219] | 5.49 [5.18, 5.77] | 2.31 [1.97, 2.72] |
| w80_energy_I1_B2 | 0.614 [0.602, 0.626] | 0.418 [0.403, 0.433] | 0.207 [0.189, 0.227] | 5.35 [4.99, 5.7] | 2.66 [2.18, 3.13] |
| w80_energy_I2_B2 | 0.617 [0.604, 0.629] | 0.481 [0.463, 0.499] | 0.216 [0.2, 0.234] | 5.41 [5.07, 5.77] | 2.52 [2.07, 3.03] |
| w80_energy_I0p25_B2_naming | 0.568 [0.539, 0.597] | 0.335 [0.328, 0.342] | 0.298 [0.277, 0.32] | 4.33 [3.76, 4.84] | 0.94 [0.74, 1.17] |
| w80_energy_I2_B2_naming | 0.667 [0.653, 0.679] | 0.396 [0.385, 0.406] | 0.335 [0.317, 0.356] | 8.48 [8.1, 8.86] | 1.81 [1.42, 2.25] |
| w80_energy_I0p25_B2_floor2 | 0.616 [0.597, 0.636] | 0.342 [0.336, 0.347] | 0.267 [0.25, 0.286] | 6.37 [5.96, 6.79] | 1.37 [1.07, 1.66] |
| w80_energy_I2_B2_floor2 | 0.658 [0.642, 0.671] | 0.451 [0.436, 0.466] | 0.283 [0.266, 0.301] | 7.73 [7.4, 8.06] | 1.85 [1.51, 2.16] |

| setting | stagnation_frac | late_activity | commit_rate | final salience (bits) | hits/object/s | welfare ratio vs summon (geo-mean) | idle tick share | attempt share |
|---|---|---|---|---|---|---|---|---|
| summon | 1 [1, 1] | 0.206 [0.2, 0.213] | 81.9 [81, 82.8] | 12.8 [11.3, 14.5] | 3.74 | 1.00 | 0.00 | 1.00 |
| owner_pays | 1 [0.999, 1] | 0.189 [0.184, 0.194] | 16.7 [15.9, 17.8] | 4.77 [4.63, 4.93] | 0.78 | 0.25 | 0.00 | 0.20 |
| energy_I0p02_B2 | 0.997 [0.995, 0.999] | 0.241 [0.23, 0.254] | 2.88 [2.57, 3.18] | 4.76 [4.62, 4.92] | 0.12 | 0.25 | 0.53 | 0.47 |
| energy_I0p05_B2 | 0.998 [0.996, 0.999] | 0.232 [0.221, 0.244] | 5.29 [4.77, 5.77] | 4.85 [4.72, 5] | 0.22 | 0.26 | 0.49 | 0.52 |
| energy_I0p1_B2 | 0.999 [0.997, 1] | 0.234 [0.222, 0.245] | 8.37 [7.59, 9.09] | 5.13 [4.97, 5.31] | 0.35 | 0.29 | 0.45 | 0.55 |
| energy_I0p25_B2 | 0.999 [0.999, 1] | 0.236 [0.224, 0.248] | 15.7 [14.2, 16.9] | 5.94 [5.7, 6.2] | 0.65 | 0.38 | 0.38 | 0.62 |
| energy_I1_B2 | 1 [0.999, 1] | 0.242 [0.234, 0.251] | 34.6 [31.8, 37.2] | 8.59 [7.99, 9.24] | 1.48 | 0.68 | 0.24 | 0.76 |
| energy_I2_B2 | 1 [0.999, 1] | 0.232 [0.22, 0.242] | 46.4 [43.6, 49.1] | 10.2 [9.4, 11] | 2.02 | 0.89 | 0.13 | 0.87 |
| energy_I4_B2 | 1 [0.999, 1] | 0.236 [0.227, 0.245] | 54.8 [52.3, 57.1] | 12.5 [11.5, 13.9] | 2.42 | 1.22 | 0.05 | 0.95 |
| energy_I0p25_B2_naming | 0.977 [0.959, 0.991] | 0.311 [0.288, 0.334] | 0.741 [0.646, 0.84] | 6.95 [6.41, 7.49] | 0.02 | 0.47 | 0.99 | 0.01 |
| energy_I2_B2_naming | 0.999 [0.998, 1] | 0.261 [0.248, 0.273] | 5.34 [4.67, 6.33] | 14.3 [13, 15.6] | 0.24 | 1.53 | 0.94 | 0.06 |
| energy_I0p25_B2_floor2 | 0.998 [0.996, 1] | 0.26 [0.248, 0.274] | 2.86 [2.48, 3.37] | 7.01 [6.55, 7.5] | 0.12 | 0.49 | 0.96 | 0.04 |
| energy_I2_B2_floor2 | 1 [0.999, 1] | 0.257 [0.246, 0.266] | 12.6 [11.4, 13.9] | 12.8 [11.7, 13.9] | 0.53 | 1.28 | 0.83 | 0.17 |
| energy_I2_B2_floor1 | 1 [0.999, 1] | 0.252 [0.24, 0.263] | 17 [15.4, 18.6] | 11.9 [11, 12.9] | 0.70 | 1.22 | 0.76 | 0.24 |
| energy_I2_B2_floor4 | 0.999 [0.999, 1] | 0.257 [0.246, 0.267] | 9.31 [8.38, 10.5] | 13.5 [12.3, 14.8] | 0.40 | 1.37 | 0.88 | 0.12 |
| energy_I0p25_B2_nodestroy | 1 [0.999, 1] | 0.26 [0.252, 0.267] | 41.1 [37.8, 44.2] | 5.13 [4.98, 5.28] | 1.54 | 0.29 | 0.24 | 0.76 |
| w80_summon | 1 [1, 1] | 0.211 [0.206, 0.216] | 82.1 [81.3, 83] | 11 [9.95, 12.1] | 0.56 | 5.19 | 0.00 | 1.00 |
| w80_energy_I0p05_B2 | 0.995 [0.988, 1] | 0.233 [0.22, 0.246] | 5.42 [4.94, 6.01] | 4.55 [4.45, 4.65] | 0.03 | 1.39 | 0.51 | 0.49 |
| w80_energy_I0p25_B2 | 0.999 [0.998, 1] | 0.228 [0.215, 0.24] | 14.8 [13.5, 16] | 5 [4.86, 5.16] | 0.09 | 1.68 | 0.45 | 0.55 |
| w80_energy_I1_B2 | 1 [0.999, 1] | 0.248 [0.237, 0.262] | 33.6 [31, 35.9] | 6.47 [6.11, 6.87] | 0.21 | 2.61 | 0.29 | 0.71 |
| w80_energy_I2_B2 | 1 [0.999, 1] | 0.241 [0.23, 0.251] | 44.8 [41.9, 47.6] | 7.86 [7.32, 8.5] | 0.29 | 3.57 | 0.19 | 0.81 |
| w80_energy_I0p25_B2_naming | 0.979 [0.958, 0.993] | 0.307 [0.285, 0.33] | 0.781 [0.663, 0.898] | 5.12 [4.95, 5.3] | 0.00 | 1.72 | 0.99 | 0.01 |
| w80_energy_I2_B2_naming | 0.999 [0.998, 1] | 0.264 [0.249, 0.277] | 5.55 [4.85, 6.59] | 9.57 [8.78, 10.4] | 0.04 | 4.93 | 0.93 | 0.07 |
| w80_energy_I0p25_B2_floor2 | 0.998 [0.996, 1] | 0.261 [0.248, 0.274] | 3.04 [2.54, 3.9] | 5.34 [5.14, 5.56] | 0.02 | 1.86 | 0.96 | 0.04 |
| w80_energy_I2_B2_floor2 | 0.999 [0.998, 1] | 0.258 [0.246, 0.269] | 13 [11.8, 14.4] | 9.25 [8.55, 10.1] | 0.08 | 4.62 | 0.82 | 0.18 |

**Paired difference vs summon** (mean ± 95% CI over games)

| setting | Δ dynamism | Δ dynamism2 | Δ tension | Δ spirals/100 | Δ lead ch./100s | Δ late activity |
|---|---|---|---|---|---|---|
| owner_pays | -0.0651 ± 0.015 | -0.144 ± 0.02 | -0.0923 ± 0.014 | -1.09 ± 0.39 | +1.85 ± 0.94 | -0.0164 ± 0.0067 |
| energy_I0p02_B2 | -0.0803 ± 0.018 | -0.141 ± 0.021 | -0.101 ± 0.013 | -2.11 ± 0.43 | -1.45 ± 0.84 | +0.0359 ± 0.014 |
| energy_I0p05_B2 | -0.0616 ± 0.016 | -0.121 ± 0.021 | -0.0995 ± 0.012 | -1.85 ± 0.41 | -0.238 ± 0.84 | +0.0261 ± 0.012 |
| energy_I0p1_B2 | -0.0535 ± 0.015 | -0.113 ± 0.019 | -0.0986 ± 0.013 | -1.84 ± 0.32 | +0.115 ± 0.83 | +0.0281 ± 0.014 |
| energy_I0p25_B2 | -0.0548 ± 0.015 | -0.0829 ± 0.017 | -0.0949 ± 0.012 | -2.1 ± 0.33 | +0.155 ± 0.84 | +0.0302 ± 0.013 |
| energy_I1_B2 | -0.0504 ± 0.012 | -0.0137 ± 0.016 | -0.0916 ± 0.01 | -2.46 ± 0.29 | +0.147 ± 0.76 | +0.0369 ± 0.0099 |
| energy_I2_B2 | -0.0474 ± 0.011 | +0.0223 ± 0.016 | -0.0837 ± 0.01 | -2.52 ± 0.26 | +0.42 ± 0.75 | +0.0259 ± 0.011 |
| energy_I4_B2 | -0.0375 ± 0.013 | +0.0541 ± 0.017 | -0.0706 ± 0.011 | -2.1 ± 0.26 | +0.122 ± 0.73 | +0.0308 ± 0.01 |
| energy_I0p25_B2_naming | -0.062 ± 0.03 | -0.135 ± 0.019 | +0.00897 ± 0.016 | -0.535 ± 0.72 | -2.92 ± 0.73 | +0.105 ± 0.025 |
| energy_I2_B2_naming | +0.00783 ± 0.015 | +0.0476 ± 0.018 | +0.0195 ± 0.0089 | +0.338 ± 0.31 | -1.19 ± 0.72 | +0.0558 ± 0.013 |
| energy_I0p25_B2_floor2 | -0.0126 ± 0.017 | -0.0757 ± 0.02 | -0.0257 ± 0.011 | -0.143 ± 0.36 | -1.3 ± 0.81 | +0.0548 ± 0.014 |
| energy_I2_B2_floor2 | +0.00622 ± 0.012 | +0.072 ± 0.017 | -0.0153 ± 0.0092 | -0.0921 ± 0.26 | -0.134 ± 0.67 | +0.0512 ± 0.011 |
| energy_I2_B2_floor1 | -0.00676 ± 0.011 | +0.0675 ± 0.015 | -0.0314 ± 0.009 | -0.555 ± 0.25 | -0.154 ± 0.7 | +0.0461 ± 0.012 |
| energy_I2_B2_floor4 | +0.00888 ± 0.012 | +0.0689 ± 0.016 | -0.000499 ± 0.0078 | +0.0186 ± 0.25 | -0.493 ± 0.66 | +0.0517 ± 0.011 |
| energy_I0p25_B2_nodestroy | -0.0331 ± 0.013 | -0.103 ± 0.017 | -0.0938 ± 0.012 | -1.53 ± 0.34 | +2.34 ± 0.96 | +0.0548 ± 0.0093 |
| w80_summon | -0.0333 ± 0.013 | +0.0867 ± 0.016 | -0.00101 ± 0.0076 | -0.0557 ± 0.23 | -2.61 ± 0.7 | +0.00502 ± 0.0056 |
| w80_energy_I0p05_B2 | -0.146 ± 0.021 | -0.208 ± 0.022 | -0.105 ± 0.012 | -2.99 ± 0.41 | -3.46 ± 0.79 | +0.0272 ± 0.014 |
| w80_energy_I0p25_B2 | -0.103 ± 0.018 | -0.183 ± 0.021 | -0.1 ± 0.012 | -2.51 ± 0.32 | -2.55 ± 0.77 | +0.0227 ± 0.013 |
| w80_energy_I1_B2 | -0.0846 ± 0.015 | -0.107 ± 0.018 | -0.0936 ± 0.013 | -2.65 ± 0.35 | -2.21 ± 0.75 | +0.0429 ± 0.015 |
| w80_energy_I2_B2 | -0.0815 ± 0.015 | -0.0444 ± 0.017 | -0.084 ± 0.012 | -2.59 ± 0.35 | -2.35 ± 0.7 | +0.0351 ± 0.01 |
| w80_energy_I0p25_B2_naming | -0.131 ± 0.033 | -0.19 ± 0.02 | -0.00254 ± 0.017 | -3.67 ± 0.65 | -3.92 ± 0.79 | +0.101 ± 0.022 |
| w80_energy_I2_B2_naming | -0.0322 ± 0.015 | -0.13 ± 0.018 | +0.0346 ± 0.0097 | +0.474 ± 0.42 | -3.06 ± 0.68 | +0.0582 ± 0.014 |
| w80_energy_I0p25_B2_floor2 | -0.083 ± 0.023 | -0.183 ± 0.021 | -0.0336 ± 0.012 | -1.63 ± 0.47 | -3.5 ± 0.76 | +0.0558 ± 0.014 |
| w80_energy_I2_B2_floor2 | -0.0407 ± 0.016 | -0.074 ± 0.018 | -0.0171 ± 0.0092 | -0.269 ± 0.34 | -3.02 ± 0.75 | +0.0527 ± 0.012 |

#### Policy balance: win share (mean z), fair = 0.25 (z 0.5)

| setting | random | greedy_private | saver | greedy_omniscient |
|---|---|---|---|---|
| summon | 0.17 (z 0.39) | 0.20 (z 0.46) | 0.47 (z 0.71) | 0.16 (z 0.45) |
| owner_pays | 0.20 (z 0.47) | 0.20 (z 0.47) | 0.38 (z 0.58) | 0.23 (z 0.48) |
| energy_I0p02_B2 | 0.23 (z 0.47) | 0.22 (z 0.49) | 0.30 (z 0.56) | 0.25 (z 0.48) |
| energy_I0p05_B2 | 0.23 (z 0.45) | 0.24 (z 0.51) | 0.33 (z 0.54) | 0.20 (z 0.49) |
| energy_I0p1_B2 | 0.23 (z 0.50) | 0.26 (z 0.52) | 0.30 (z 0.52) | 0.21 (z 0.46) |
| energy_I0p25_B2 | 0.21 (z 0.43) | 0.22 (z 0.51) | 0.28 (z 0.53) | 0.30 (z 0.53) |
| energy_I1_B2 | 0.17 (z 0.41) | 0.27 (z 0.55) | 0.29 (z 0.51) | 0.28 (z 0.53) |
| energy_I2_B2 | 0.17 (z 0.41) | 0.24 (z 0.53) | 0.29 (z 0.54) | 0.29 (z 0.53) |
| energy_I4_B2 | 0.13 (z 0.35) | 0.28 (z 0.56) | 0.34 (z 0.58) | 0.25 (z 0.52) |
| energy_I0p25_B2_naming | 0.17 (z 0.42) | 0.21 (z 0.49) | 0.42 (z 0.63) | 0.21 (z 0.47) |
| energy_I2_B2_naming | 0.16 (z 0.37) | 0.22 (z 0.48) | 0.36 (z 0.62) | 0.27 (z 0.52) |
| energy_I0p25_B2_floor2 | 0.16 (z 0.40) | 0.25 (z 0.53) | 0.35 (z 0.58) | 0.24 (z 0.48) |
| energy_I2_B2_floor2 | 0.12 (z 0.33) | 0.25 (z 0.56) | 0.38 (z 0.60) | 0.25 (z 0.52) |
| energy_I2_B2_floor1 | 0.16 (z 0.36) | 0.27 (z 0.51) | 0.33 (z 0.59) | 0.24 (z 0.54) |
| energy_I2_B2_floor4 | 0.15 (z 0.37) | 0.26 (z 0.52) | 0.35 (z 0.59) | 0.24 (z 0.52) |
| energy_I0p25_B2_nodestroy | 0.31 (z 0.51) | 0.29 (z 0.56) | 0.20 (z 0.46) | 0.20 (z 0.47) |
| w80_summon | 0.15 (z 0.38) | 0.19 (z 0.46) | 0.47 (z 0.69) | 0.19 (z 0.47) |
| w80_energy_I0p05_B2 | 0.28 (z 0.52) | 0.25 (z 0.49) | 0.28 (z 0.53) | 0.19 (z 0.46) |
| w80_energy_I0p25_B2 | 0.18 (z 0.46) | 0.29 (z 0.51) | 0.31 (z 0.52) | 0.22 (z 0.51) |
| w80_energy_I1_B2 | 0.17 (z 0.40) | 0.25 (z 0.55) | 0.34 (z 0.56) | 0.24 (z 0.49) |
| w80_energy_I2_B2 | 0.14 (z 0.38) | 0.23 (z 0.53) | 0.29 (z 0.54) | 0.34 (z 0.55) |
| w80_energy_I0p25_B2_naming | 0.19 (z 0.47) | 0.19 (z 0.47) | 0.42 (z 0.62) | 0.20 (z 0.44) |
| w80_energy_I2_B2_naming | 0.14 (z 0.39) | 0.22 (z 0.47) | 0.39 (z 0.64) | 0.25 (z 0.50) |
| w80_energy_I0p25_B2_floor2 | 0.18 (z 0.42) | 0.21 (z 0.49) | 0.39 (z 0.59) | 0.22 (z 0.49) |
| w80_energy_I2_B2_floor2 | 0.15 (z 0.39) | 0.20 (z 0.48) | 0.43 (z 0.64) | 0.22 (z 0.48) |

#### Per-family fairness (policy-adjusted z over families with >= 6 god-slots; excess SD over sampling noise)

| setting | family z SD | excess SD | share of families with CI excluding 0.5 | families |
|---|---|---|---|---|
| summon | 0.210 | 0.180 | 0.41 | 44 |
| owner_pays | 0.220 | 0.179 | 0.34 | 44 |
| energy_I0p02_B2 | 0.210 | 0.167 | 0.36 | 44 |
| energy_I0p05_B2 | 0.201 | 0.156 | 0.23 | 44 |
| energy_I0p1_B2 | 0.209 | 0.167 | 0.34 | 44 |
| energy_I0p25_B2 | 0.212 | 0.171 | 0.34 | 44 |
| energy_I1_B2 | 0.237 | 0.209 | 0.43 | 44 |
| energy_I2_B2 | 0.228 | 0.198 | 0.41 | 44 |
| energy_I4_B2 | 0.225 | 0.197 | 0.50 | 44 |
| energy_I0p25_B2_naming | 0.205 | 0.164 | 0.30 | 44 |
| energy_I2_B2_naming | 0.217 | 0.185 | 0.34 | 44 |
| energy_I0p25_B2_floor2 | 0.217 | 0.185 | 0.36 | 44 |
| energy_I2_B2_floor2 | 0.210 | 0.177 | 0.36 | 44 |
| energy_I2_B2_floor1 | 0.221 | 0.188 | 0.39 | 44 |
| energy_I2_B2_floor4 | 0.227 | 0.195 | 0.39 | 44 |
| energy_I0p25_B2_nodestroy | 0.233 | 0.203 | 0.34 | 44 |
| w80_summon | 0.207 | 0.175 | 0.34 | 44 |
| w80_energy_I0p05_B2 | 0.255 | 0.228 | 0.48 | 44 |
| w80_energy_I0p25_B2 | 0.246 | 0.221 | 0.41 | 44 |
| w80_energy_I1_B2 | 0.229 | 0.200 | 0.43 | 44 |
| w80_energy_I2_B2 | 0.243 | 0.219 | 0.48 | 44 |
| w80_energy_I0p25_B2_naming | 0.225 | 0.193 | 0.39 | 44 |
| w80_energy_I2_B2_naming | 0.237 | 0.212 | 0.50 | 44 |
| w80_energy_I0p25_B2_floor2 | 0.220 | 0.187 | 0.34 | 44 |
| w80_energy_I2_B2_floor2 | 0.245 | 0.222 | 0.55 | 44 |

**Saver win share per GridType**

| setting | 5,base10,rgby | 6,cards,rainbow6 | 4,base12,rgb |
|---|---|---|---|
| summon | 0.53 | 0.38 | 0.53 |
| owner_pays | 0.38 | 0.45 | 0.30 |
| energy_I0p02_B2 | 0.25 | 0.28 | 0.38 |
| energy_I0p05_B2 | 0.30 | 0.30 | 0.38 |
| energy_I0p1_B2 | 0.35 | 0.33 | 0.23 |
| energy_I0p25_B2 | 0.28 | 0.28 | 0.28 |
| energy_I1_B2 | 0.28 | 0.35 | 0.25 |
| energy_I2_B2 | 0.23 | 0.33 | 0.33 |
| energy_I4_B2 | 0.33 | 0.33 | 0.38 |
| energy_I0p25_B2_naming | 0.38 | 0.38 | 0.50 |
| energy_I2_B2_naming | 0.35 | 0.30 | 0.42 |
| energy_I0p25_B2_floor2 | 0.28 | 0.35 | 0.42 |
| energy_I2_B2_floor2 | 0.30 | 0.38 | 0.45 |
| energy_I2_B2_floor1 | 0.28 | 0.33 | 0.40 |
| energy_I2_B2_floor4 | 0.38 | 0.33 | 0.35 |
| energy_I0p25_B2_nodestroy | 0.20 | 0.15 | 0.25 |
| w80_summon | 0.47 | 0.40 | 0.53 |
| w80_energy_I0p05_B2 | 0.28 | 0.23 | 0.33 |
| w80_energy_I0p25_B2 | 0.33 | 0.33 | 0.28 |
| w80_energy_I1_B2 | 0.25 | 0.35 | 0.42 |
| w80_energy_I2_B2 | 0.30 | 0.28 | 0.30 |
| w80_energy_I0p25_B2_naming | 0.40 | 0.38 | 0.47 |
| w80_energy_I2_B2_naming | 0.38 | 0.40 | 0.40 |
| w80_energy_I0p25_B2_floor2 | 0.33 | 0.38 | 0.47 |
| w80_energy_I2_B2_floor2 | 0.35 | 0.47 | 0.47 |

**Largest family moves, summon → energy_I0p25_B2** (policy-adjusted z; n god-slots)

| family | summon z | energy_I0p25_B2 z | Δ | n |
|---|---|---|---|---|
| othello_sandwich | 0.64 | 0.33 | -0.32 | 6 |
| go_fish_books | 0.85 | 0.53 | -0.31 | 6 |
| rooks_watch | 0.72 | 0.42 | -0.30 | 12 |
| full_house | 0.98 | 0.76 | -0.22 | 7 |
| number_painter | 0.50 | 0.30 | -0.20 | 8 |
| best_friends | 0.47 | 0.67 | +0.20 | 7 |
| robin_hood | 0.16 | 0.37 | +0.21 | 9 |
| feuding_families | 0.34 | 0.59 | +0.24 | 10 |
| seed2_patchwork | 0.37 | 0.62 | +0.25 | 7 |
| far_apart | 0.42 | 0.71 | +0.29 | 7 |

**Largest family moves, summon → energy_I2_B2** (policy-adjusted z; n god-slots)

| family | summon z | energy_I2_B2 z | Δ | n |
|---|---|---|---|---|
| rooks_watch | 0.72 | 0.41 | -0.31 | 12 |
| fair_weaver | 0.52 | 0.36 | -0.16 | 7 |
| go_fish_books | 0.85 | 0.71 | -0.14 | 6 |
| far_apart | 0.42 | 0.29 | -0.14 | 7 |
| snake_charmer | 0.34 | 0.23 | -0.11 | 10 |
| seed3_green_ones | 0.68 | 0.84 | +0.15 | 9 |
| archipelago | 0.31 | 0.49 | +0.18 | 6 |
| sunset_sky | 0.47 | 0.67 | +0.20 | 8 |
| mountain_climb | 0.27 | 0.48 | +0.22 | 7 |
| wallpaper_weaver | 0.47 | 0.73 | +0.26 | 6 |

#### Agents: count per god by policy; description and per-act bits; acts

| setting | agents random | agents greedy_private | agents saver | agents greedy_omniscient | median summon bits | median E[act bits] | mean E[act bits] | median acts/agent | median acts/s | median charged bits/act | bijective share | guarded share |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| summon | 24.8 | 28.2 | 7.7 | 31.8 | 14.5 | 1.24 | 5.1 | 372 | 1.22 | – | 0.59 | 0.12 |
| owner_pays | 7.0 | 7.9 | 5.0 | 8.6 | 16.0 | 2.69 | 15.9 | 2 | 0.01 | 0.08 | 0.42 | 0.18 |
| energy_I0p02_B2 | 32.1 | 37.3 | 20.9 | 40.5 | 14.1 | 2.87 | 14.7 | 1 | 0.00 | 0.00 | 0.48 | 0.10 |
| energy_I0p05_B2 | 32.1 | 37.4 | 20.8 | 40.6 | 14.1 | 2.97 | 14.9 | 4 | 0.01 | 0.00 | 0.47 | 0.10 |
| energy_I0p1_B2 | 32.1 | 37.4 | 20.2 | 40.6 | 14.1 | 3.27 | 14.9 | 8 | 0.03 | 0.00 | 0.47 | 0.10 |
| energy_I0p25_B2 | 32.1 | 36.9 | 19.6 | 40.5 | 14.1 | 3.59 | 15.5 | 20 | 0.07 | 0.00 | 0.45 | 0.11 |
| energy_I1_B2 | 32.1 | 36.5 | 18.8 | 40.2 | 14.1 | 3.92 | 15.8 | 23 | 0.27 | 0.03 | 0.43 | 0.12 |
| energy_I2_B2 | 32.1 | 36.4 | 17.9 | 39.7 | 14.1 | 4.42 | 16.3 | 29 | 0.50 | 0.05 | 0.42 | 0.12 |
| energy_I4_B2 | 32.1 | 36.0 | 18.8 | 39.6 | 14.1 | 4.79 | 17.2 | 37 | 0.85 | 0.12 | 0.40 | 0.13 |
| energy_I0p25_B2_naming | 32.1 | 37.2 | 25.0 | 40.2 | 14.0 | 9.56 | 22.5 | 2 | 0.01 | 14.78 | 0.32 | 0.10 |
| energy_I2_B2_naming | 32.1 | 35.8 | 26.7 | 39.1 | 14.1 | 8.54 | 22.1 | 20 | 0.09 | 17.06 | 0.32 | 0.11 |
| energy_I0p25_B2_floor2 | 32.1 | 36.7 | 24.2 | 40.3 | 14.1 | 5.35 | 18.6 | 8 | 0.03 | 2.66 | 0.38 | 0.12 |
| energy_I2_B2_floor2 | 32.1 | 36.0 | 25.0 | 39.4 | 14.2 | 5.24 | 17.9 | 21 | 0.29 | 2.65 | 0.37 | 0.13 |
| energy_I2_B2_floor1 | 32.1 | 35.8 | 23.2 | 39.8 | 14.1 | 4.78 | 17.3 | 22 | 0.37 | 1.37 | 0.39 | 0.13 |
| energy_I2_B2_floor4 | 32.1 | 35.8 | 25.5 | 39.2 | 14.1 | 6.49 | 19.3 | 20 | 0.20 | 5.05 | 0.35 | 0.13 |
| energy_I0p25_B2_nodestroy | 32.1 | 37.4 | 16.8 | 40.6 | 14.1 | 3.77 | 15.3 | 19 | 0.07 | 0.03 | 0.46 | 0.10 |
| w80_summon | 24.8 | 28.6 | 8.4 | 31.6 | 14.6 | 1.26 | 5.2 | 370 | 1.20 | – | 0.57 | 0.12 |
| w80_energy_I0p05_B2 | 32.1 | 37.9 | 22.5 | 41.0 | 14.1 | 2.82 | 14.8 | 4 | 0.01 | 0.00 | 0.48 | 0.10 |
| w80_energy_I0p25_B2 | 32.1 | 37.6 | 19.8 | 40.8 | 14.1 | 3.65 | 15.6 | 20 | 0.07 | 0.00 | 0.46 | 0.10 |
| w80_energy_I1_B2 | 32.1 | 37.4 | 19.2 | 40.4 | 14.1 | 3.95 | 16.1 | 22 | 0.26 | 0.03 | 0.43 | 0.11 |
| w80_energy_I2_B2 | 32.1 | 36.8 | 20.7 | 40.1 | 14.1 | 4.49 | 16.7 | 28 | 0.46 | 0.06 | 0.42 | 0.12 |
| w80_energy_I0p25_B2_naming | 32.1 | 37.8 | 24.7 | 41.1 | 14.0 | 9.84 | 22.8 | 2 | 0.01 | 15.02 | 0.33 | 0.09 |
| w80_energy_I2_B2_naming | 32.1 | 36.7 | 27.4 | 39.9 | 14.1 | 9.41 | 23.1 | 20 | 0.09 | 16.93 | 0.32 | 0.10 |
| w80_energy_I0p25_B2_floor2 | 32.1 | 37.4 | 24.6 | 40.7 | 14.1 | 5.60 | 18.9 | 8 | 0.03 | 2.67 | 0.39 | 0.10 |
| w80_energy_I2_B2_floor2 | 32.1 | 36.7 | 25.6 | 39.8 | 14.1 | 5.45 | 19.1 | 21 | 0.26 | 2.83 | 0.37 | 0.12 |

#### Rate cap, crowding and destroy: median demand ratio Σ income/E[bits per act] ÷ cap; share of snapshots with demand ≥ 1 (cap binds); acts taken by the cheapest third of agents (by E[bits per act]) vs their share of agent-lifetime; destroys per god by policy; share of agents destroyed

| setting | demand / cap | cap-binding share | cheap third: act share | cheap third: lifetime share | crowding ratio (median) | destroys random | destroys greedy_private | destroys saver | destroys greedy_omniscient | agents destroyed |
|---|---|---|---|---|---|---|---|---|---|---|
| energy_I0p02_B2 | 0.06 | 0.00 | 0.98 | 0.29 | 3.32 | 0.0 | 3.8 | 10.3 | 4.1 | 0.14 |
| energy_I0p05_B2 | 0.11 | 0.10 | 0.95 | 0.25 | 3.83 | 0.0 | 6.1 | 12.8 | 7.6 | 0.20 |
| energy_I0p1_B2 | 0.19 | 0.34 | 0.95 | 0.23 | 4.29 | 0.0 | 8.7 | 13.1 | 10.3 | 0.25 |
| energy_I0p25_B2 | 0.40 | 0.40 | 0.93 | 0.21 | 4.74 | 0.0 | 12.3 | 13.7 | 13.6 | 0.31 |
| energy_I1_B2 | 1.34 | 0.55 | 0.87 | 0.20 | 4.57 | 0.0 | 18.5 | 12.7 | 20.1 | 0.40 |
| energy_I2_B2 | 2.82 | 0.68 | 0.82 | 0.20 | 4.21 | 0.0 | 21.2 | 12.0 | 21.9 | 0.44 |
| energy_I4_B2 | 5.23 | 0.84 | 0.73 | 0.21 | 3.46 | 0.0 | 22.8 | 11.8 | 24.1 | 0.46 |
| energy_I0p25_B2_naming | 0.01 | 0.00 | 0.60 | 0.34 | 1.70 | 0.0 | 1.1 | 0.6 | 1.2 | 0.02 |
| energy_I2_B2_naming | 0.05 | 0.00 | 0.48 | 0.30 | 1.57 | 0.0 | 13.6 | 8.1 | 14.1 | 0.27 |
| energy_I0p25_B2_floor2 | 0.03 | 0.00 | 0.68 | 0.31 | 2.21 | 0.0 | 7.1 | 6.3 | 7.7 | 0.16 |
| energy_I2_B2_floor2 | 0.14 | 0.00 | 0.59 | 0.25 | 2.46 | 0.0 | 19.0 | 13.2 | 19.6 | 0.39 |
| energy_I2_B2_floor1 | 0.20 | 0.01 | 0.62 | 0.22 | 2.80 | 0.0 | 19.9 | 13.4 | 20.9 | 0.41 |
| energy_I2_B2_floor4 | 0.10 | 0.00 | 0.55 | 0.27 | 2.05 | 0.0 | 17.4 | 11.2 | 17.8 | 0.35 |
| energy_I0p25_B2_nodestroy | 0.94 | 0.47 | 0.94 | 0.34 | 2.75 | 0.0 | 0.0 | 0.0 | 0.0 | 0.00 |
| w80_energy_I0p05_B2 | 0.10 | 0.10 | 0.96 | 0.25 | 4.07 | 0.0 | 6.3 | 13.9 | 7.7 | 0.21 |
| w80_energy_I0p25_B2 | 0.36 | 0.39 | 0.92 | 0.21 | 4.79 | 0.0 | 12.2 | 13.9 | 13.9 | 0.31 |
| w80_energy_I1_B2 | 1.68 | 0.53 | 0.88 | 0.19 | 4.65 | 0.0 | 18.6 | 13.5 | 19.8 | 0.40 |
| w80_energy_I2_B2 | 2.38 | 0.66 | 0.83 | 0.19 | 4.45 | 0.0 | 21.1 | 13.9 | 21.7 | 0.44 |
| w80_energy_I0p25_B2_naming | 0.01 | 0.00 | 0.61 | 0.33 | 1.74 | 0.0 | 0.8 | 0.5 | 1.0 | 0.02 |
| w80_energy_I2_B2_naming | 0.05 | 0.00 | 0.49 | 0.30 | 1.60 | 0.0 | 12.7 | 7.1 | 14.0 | 0.25 |
| w80_energy_I0p25_B2_floor2 | 0.03 | 0.00 | 0.69 | 0.31 | 2.21 | 0.0 | 6.7 | 5.9 | 7.4 | 0.15 |
| w80_energy_I2_B2_floor2 | 0.14 | 0.00 | 0.60 | 0.24 | 2.53 | 0.0 | 18.6 | 12.6 | 19.3 | 0.38 |

#### Do simple, information-efficient agents win? Realised own Δpayoff per second of life, by summon-bits tercile × E[act bits] tercile; Spearman ρ with each

| setting | cheap desc + cheap acts | cheap desc + dear acts | dear desc + cheap acts | dear desc + dear acts | ρ(summon bits, value) | ρ(E[act bits], value) |
|---|---|---|---|---|---|---|
| summon | -1.4 (n 1062) | 17.8 (n 1320) | -1.0 (n 1243) | 18.4 (n 1619) | +0.00 | +0.14 |
| owner_pays | 0.0 (n 350) | 0.0 (n 416) | -0.0 (n 232) | 0.0 (n 496) | -0.01 | -0.03 |
| energy_I0p02_B2 | -0.0 (n 976) | 0.0 (n 2107) | -0.0 (n 2094) | 0.0 (n 1481) | -0.05 | +0.17 |
| energy_I0p05_B2 | -0.1 (n 1014) | 0.0 (n 2083) | -0.1 (n 2125) | 0.0 (n 1517) | -0.06 | +0.28 |
| energy_I0p1_B2 | -0.1 (n 1020) | 0.0 (n 2012) | -0.2 (n 2057) | 0.0 (n 1555) | -0.06 | +0.33 |
| energy_I0p25_B2 | -0.3 (n 1057) | 0.1 (n 2021) | -0.6 (n 1988) | 0.1 (n 1574) | -0.05 | +0.41 |
| energy_I1_B2 | -1.8 (n 1132) | 0.5 (n 1933) | -1.8 (n 1835) | 0.4 (n 1666) | -0.01 | +0.45 |
| energy_I2_B2 | -3.1 (n 1043) | 1.4 (n 1940) | -2.8 (n 1786) | 1.2 (n 1680) | -0.01 | +0.45 |
| energy_I4_B2 | -5.5 (n 1180) | 3.2 (n 1900) | -6.0 (n 1699) | 5.4 (n 1731) | +0.00 | +0.39 |
| energy_I0p25_B2_naming | -0.0 (n 1424) | 0.1 (n 2089) | 0.0 (n 1795) | 0.0 (n 1988) | -0.01 | +0.13 |
| energy_I2_B2_naming | -0.3 (n 1442) | 1.2 (n 1973) | -0.1 (n 1597) | 1.1 (n 2142) | +0.05 | +0.27 |
| energy_I0p25_B2_floor2 | -0.1 (n 1362) | 0.1 (n 1961) | 0.0 (n 1769) | 0.1 (n 1900) | +0.02 | +0.21 |
| energy_I2_B2_floor2 | -1.0 (n 1258) | 1.9 (n 1976) | -0.4 (n 1732) | 4.0 (n 1903) | +0.01 | +0.34 |
| energy_I2_B2_floor1 | -1.6 (n 1100) | 1.7 (n 2022) | -0.7 (n 1729) | 3.9 (n 1807) | +0.00 | +0.37 |
| energy_I2_B2_floor4 | -0.7 (n 1287) | 1.6 (n 1845) | -0.3 (n 1748) | 4.1 (n 1968) | +0.03 | +0.31 |
| energy_I0p25_B2_nodestroy | -0.0 (n 1067) | 0.1 (n 1984) | -0.0 (n 2018) | 0.1 (n 1527) | -0.01 | +0.11 |
| w80_summon | -1.1 (n 1074) | 9.6 (n 1346) | -0.5 (n 1266) | 13.1 (n 1593) | +0.03 | +0.17 |
| w80_energy_I0p05_B2 | -0.1 (n 1021) | 0.0 (n 2214) | -0.1 (n 2143) | 0.0 (n 1471) | -0.08 | +0.29 |
| w80_energy_I0p25_B2 | -0.5 (n 1100) | 0.1 (n 2059) | -0.6 (n 2201) | 0.0 (n 1554) | -0.06 | +0.44 |
| w80_energy_I1_B2 | -1.7 (n 1189) | 0.5 (n 2013) | -1.8 (n 2010) | 3.2 (n 1596) | -0.03 | +0.49 |
| w80_energy_I2_B2 | -2.7 (n 1096) | 1.3 (n 2013) | -4.0 (n 1796) | 1.1 (n 1752) | -0.01 | +0.48 |
| w80_energy_I0p25_B2_naming | -0.0 (n 1349) | 0.0 (n 2146) | 0.0 (n 1889) | 0.0 (n 2091) | -0.00 | +0.13 |
| w80_energy_I2_B2_naming | -0.1 (n 1460) | 1.1 (n 2101) | 0.0 (n 1751) | 1.0 (n 2098) | +0.06 | +0.31 |
| w80_energy_I0p25_B2_floor2 | -0.0 (n 1394) | 0.1 (n 2059) | -0.0 (n 1853) | 0.1 (n 1894) | +0.01 | +0.23 |
| w80_energy_I2_B2_floor2 | -0.9 (n 1311) | 1.2 (n 1941) | -0.3 (n 1796) | 1.4 (n 1930) | +0.02 | +0.38 |

#### Same question at the god level: within-game Spearman ρ between a god's payoff and its agents' mean summon bits, mean E[act bits], agent count and total acts (mean ± 95% CI over games); and the policy-adjusted regression of z on the standardised god means (summon bits, E[act bits], agents)

| setting | ρ(payoff, summon bits) | ρ(payoff, E[act bits]) | ρ(payoff, agents) | ρ(payoff, acts) | β summon bits | β E[act bits] | β agents |
|---|---|---|---|---|---|---|---|
| summon | +0.13 ± 0.10 | +0.26 ± 0.09 | -0.23 ± 0.09 | -0.20 ± 0.09 | -0.006 | +0.110 | +0.014 |
| owner_pays | -0.06 ± 0.10 | +0.01 ± 0.10 | -0.02 ± 0.10 | +0.14 ± 0.10 | +0.012 | +0.020 | +0.071 |
| energy_I0p02_B2 | -0.03 ± 0.10 | -0.07 ± 0.10 | -0.01 ± 0.10 | +0.08 ± 0.10 | -0.032 | +0.007 | -0.001 |
| energy_I0p05_B2 | -0.13 ± 0.10 | -0.06 ± 0.11 | +0.03 ± 0.10 | +0.02 ± 0.11 | -0.064 | +0.010 | -0.009 |
| energy_I0p1_B2 | -0.01 ± 0.10 | +0.04 ± 0.11 | +0.01 ± 0.11 | +0.09 ± 0.10 | -0.023 | +0.025 | +0.006 |
| energy_I0p25_B2 | -0.11 ± 0.10 | +0.03 ± 0.10 | +0.06 ± 0.10 | -0.01 ± 0.10 | -0.028 | +0.020 | +0.007 |
| energy_I1_B2 | -0.07 ± 0.10 | +0.15 ± 0.11 | +0.08 ± 0.11 | -0.14 ± 0.10 | -0.012 | +0.030 | +0.016 |
| energy_I2_B2 | -0.04 ± 0.10 | +0.08 ± 0.10 | +0.04 ± 0.11 | -0.11 ± 0.12 | +0.001 | +0.041 | +0.019 |
| energy_I4_B2 | -0.00 ± 0.10 | +0.17 ± 0.10 | +0.00 ± 0.10 | -0.19 ± 0.10 | +0.020 | +0.052 | +0.021 |
| energy_I0p25_B2_naming | -0.03 ± 0.11 | +0.13 ± 0.10 | -0.10 ± 0.10 | -0.10 ± 0.11 | -0.015 | +0.021 | +0.001 |
| energy_I2_B2_naming | +0.03 ± 0.11 | +0.35 ± 0.09 | -0.10 ± 0.10 | -0.21 ± 0.10 | +0.017 | +0.050 | +0.003 |
| energy_I0p25_B2_floor2 | -0.04 ± 0.10 | +0.18 ± 0.10 | -0.01 ± 0.10 | -0.17 ± 0.10 | -0.042 | +0.058 | -0.006 |
| energy_I2_B2_floor2 | -0.07 ± 0.10 | +0.25 ± 0.10 | -0.02 ± 0.10 | -0.24 ± 0.10 | -0.024 | +0.069 | +0.001 |
| energy_I2_B2_floor1 | -0.07 ± 0.10 | +0.14 ± 0.10 | -0.00 ± 0.10 | -0.21 ± 0.10 | -0.006 | +0.044 | +0.012 |
| energy_I2_B2_floor4 | -0.01 ± 0.11 | +0.29 ± 0.10 | -0.06 ± 0.11 | -0.22 ± 0.10 | -0.005 | +0.066 | +0.005 |
| energy_I0p25_B2_nodestroy | +0.02 ± 0.10 | +0.11 ± 0.11 | +0.06 ± 0.10 | -0.03 ± 0.11 | -0.006 | +0.016 | +0.011 |
| w80_summon | +0.10 ± 0.11 | +0.28 ± 0.10 | -0.22 ± 0.10 | -0.21 ± 0.10 | -0.015 | +0.139 | +0.013 |
| w80_energy_I0p05_B2 | +0.02 ± 0.10 | -0.08 ± 0.11 | -0.06 ± 0.10 | +0.14 ± 0.10 | -0.034 | +0.010 | +0.002 |
| w80_energy_I0p25_B2 | -0.05 ± 0.10 | -0.00 ± 0.11 | +0.02 ± 0.10 | +0.05 ± 0.11 | -0.010 | +0.026 | +0.011 |
| w80_energy_I1_B2 | -0.06 ± 0.11 | +0.04 ± 0.10 | -0.01 ± 0.10 | -0.12 ± 0.11 | -0.042 | +0.073 | +0.000 |
| w80_energy_I2_B2 | -0.10 ± 0.10 | +0.16 ± 0.10 | +0.04 ± 0.10 | -0.17 ± 0.10 | -0.023 | +0.079 | +0.005 |
| w80_energy_I0p25_B2_naming | +0.08 ± 0.11 | +0.16 ± 0.10 | -0.15 ± 0.11 | -0.14 ± 0.11 | +0.012 | +0.034 | +0.011 |
| w80_energy_I2_B2_naming | +0.00 ± 0.11 | +0.30 ± 0.09 | -0.14 ± 0.10 | -0.19 ± 0.10 | +0.020 | +0.051 | +0.004 |
| w80_energy_I0p25_B2_floor2 | -0.03 ± 0.11 | +0.10 ± 0.10 | -0.06 ± 0.10 | -0.16 ± 0.10 | -0.002 | +0.041 | +0.006 |
| w80_energy_I2_B2_floor2 | +0.01 ± 0.11 | +0.23 ± 0.10 | -0.12 ± 0.10 | -0.26 ± 0.10 | -0.005 | +0.078 | +0.010 |

#### Anti-spam: one `spammer` (cheapest of 12 random programs every decision) vs 3 value policies

| setting | spammer wins | greedy_private wins | saver wins | greedy_omniscient wins | spammer agents | spammer share of acts | dynamism2 | welfare |
|---|---|---|---|---|---|---|---|---|
| summon | 0.13 | 0.18 | 0.59 | 0.10 | 38 | 0.39 | 0.545 [0.515, 0.57] | 8.41e+03 [5.34e+03, 1.2e+04] |
| energy_I0p25_B2 | 0.14 | 0.38 | 0.22 | 0.26 | 46 | 0.38 | 0.449 [0.428, 0.468] | 1.69e+03 [1.25e+03, 2.18e+03] |
| energy_I2_B2 | 0.23 | 0.30 | 0.27 | 0.20 | 46 | 0.57 | 0.543 [0.511, 0.571] | 8.2e+03 [5.24e+03, 1.17e+04] |
| energy_I2_B2_naming | 0.19 | 0.24 | 0.43 | 0.13 | 46 | 0.44 | 0.585 [0.557, 0.611] | 1.43e+04 [9.41e+03, 1.99e+04] |
| energy_I2_B2_floor2 | 0.18 | 0.22 | 0.41 | 0.19 | 46 | 0.49 | 0.611 [0.58, 0.636] | 1.13e+04 [7.35e+03, 1.55e+04] |