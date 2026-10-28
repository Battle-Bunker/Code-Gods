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
conserves energy. In the study (§4) it mainly changed *what* gods buy. Paying for the first act at summon
makes dear-act programs dearer to the god, so purchases shift to cheap-act programs and bijections.

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

## 4. Results

**Setup.** `python3 -m gridlab.experiments.agent_energy` (cached; about 90 min on 4 cores from cold).
All settings start from the experiment harness's `BASE` (the engine defaults at the real engine's
**100 Hz**, flatten disabled). Each setting runs the same **180 paired games**: 60 seeds × 3 GridTypes,
Grid(5,base10,rgby), Grid(6,cards,rainbow6) and Grid(4,base12,rgb). Every game has 4 gods: one each of
random, greedy_private, saver and greedy_omniscient, seated in a seed-dependent order. Game length is
exponential (mean 433 s). The anti-spam test uses **120 more paired games** (40 seeds × 3 GridTypes) with
`spammer` in place of random. CIs are 95% (percentile bootstrap over games for means; for "paired Δ",
±1.96 SE of the per-game difference, same seed and draws). Settings are named `energy_I{income}_B{battery}_A{α}`.
The full tables are in §7; the main numbers are below.

### 4.1 Dynamism and activity

| setting | dynamism | paired Δ dynamism | Δ tension | Δ spirals /100 commits | Δ lead changes /100 s | Δ late activity | final salience (bits) | welfare vs summon | idle ticks |
|---|---|---|---|---|---|---|---|---|---|
| summon (today) | 0.700 [0.69, 0.71] | – | – | – | – | – | 13.1 | 1 | 0 |
| owner_pays (time split) | 0.633 | −0.067 ± 0.012 | −0.094 | −1.16 | +1.7 | −0.018 | 4.7 | 0.23 | 0 (79% of draws skipped: owner broke) |
| energy I0.25 | 0.665 | −0.035 ± 0.010 | −0.098 | −1.56 | +2.5 | +0.054 | 5.1 | 0.27 | 22% |
| energy I1 | 0.681 | −0.019 ± 0.010 | −0.078 | −0.97 | +2.5 | +0.019 | 6.2 | 0.38 | 4% |
| **energy I2** | 0.690 | **−0.010 ± 0.009** | −0.062 | −0.67 | **+2.2** | +0.015 | 7.6 | 0.51 | 1% |
| energy I4 | 0.699 | −0.001 ± 0.009 | −0.042 | −0.43 | +1.5 | +0.019 | 9.4 | 0.71 | 0 |
| energy I16 | 0.713 | +0.013 ± 0.009 | +0.000 | −0.06 | +0.3 | +0.028 | 15.4 | 1.51 | 0 |
| energy I1, battery 1 | 0.678 | −0.022 ± 0.009 | −0.082 | −1.03 | +2.6 | +0.023 | – | – | 8% |
| energy I1, battery 8 | 0.677 | −0.023 ± 0.010 | −0.077 | −0.97 | +2.4 | +0.017 | – | – | 3% |
| energy I1, α 0.5 | 0.658 | −0.042 ± 0.010 | −0.102 | −1.77 | +2.5 | +0.027 | 5.0 | 0.26 | 20% |
| energy I4, α 0.5 | 0.673 | −0.027 ± 0.010 | −0.081 | −0.93 | +2.5 | +0.004 | 6.1 | 0.37 | 2% |
| energy I1, start one act | 0.685 | −0.015 ± 0.009 | −0.086 | −1.05 | +3.8 | +0.011 | – | – | 2% |
| energy I1, naive policies | 0.653 | −0.047 ± 0.011 | −0.083 | −1.93 | +0.5 | +0.053 | – | – | 19% |

The battery is B = 2 and α = 1 unless stated. Stagnation is 1.0 everywhere: no setting stagnates
before the end, so it does not discriminate. `dynamism2` (the experiment harness's revised score)
moves the same way: −0.073 ± 0.012 at I1, −0.042 ± 0.013 at I2, −0.012 ± 0.013 at I4.

Readings:

* **Income is the main dial, and the knee is about where Σ income / E[bits per act] meets the rate cap.**
  Below the knee, energy binds: ticks go idle, there are fewer commits, and above all less tension and fewer
  spirals. Expensive overwrites, which create rarity and conflict, are the agents whose cooldown bites. Above the
  knee the cap binds again and the game converges back to today's, with even more rarity (I16), but the
  cooldown then no longer differentiates agents much.
* **Lead changes rise by about 50%** (+2.2 to +2.5 per 100 s at I ≤ 2) and **late activity rises**. Cooldowns
  stop any one god's jackpot agents from acting in bursts, so leads are contested for longer.
* **Rarity is the cost.** Final salience falls from 13.1 bits to 7.6 at I2, and welfare (Σ payoff) to about
  half. The reason is Landauer's bound: an act can create no more expected surprisal than the bits it erases
  (docs/mutators.md §1b). This economy makes every erased bit cost cooldown time.
* **Battery barely matters** (B = 1, 2, 8 give the same dynamism within 0.004). The share of income lost
  at the cap is 15–23% at I1, so most agents sit near full and B mostly changes how long an idle agent
  can bank. B = 1 doubles the idle ticks (8% vs 4%), and B = 8 changes nothing measurable.
* **owner_pays (the economy session's time split) is the least dynamic option tested.** A god pays for every commit of
  every agent it owns, and nothing limits how many of its agents are drawn, so gods go broke. 79% of
  draws are skipped, commits fall to 17/s (vs 82), and final salience to 4.7 bits.

### 4.2 Policy balance: does saver still dominate?

| setting | random | greedy_private | saver | greedy_omniscient |
|---|---|---|---|---|
| summon | 0.13 | 0.21 | **0.49** | 0.17 |
| owner_pays | 0.24 | 0.19 | 0.33 | 0.23 |
| energy I0.25 | 0.29 | 0.29 | 0.19 | 0.23 |
| energy I1 | 0.22 | 0.28 | 0.28 | 0.22 |
| **energy I2** | 0.22 | 0.27 | **0.28** | 0.24 |
| energy I4 | 0.18 | 0.27 | 0.30 | 0.25 |
| energy I16 | 0.17 | 0.27 | 0.35 | 0.22 |
| energy I1, α 0.5 | 0.19 | 0.28 | 0.28 | 0.24 |
| energy I1, naive policies | 0.14 | 0.29 | 0.33 | 0.23 |

Win share per policy over 180 games (fair = 0.25; the ± on a share near 0.25 is about ±0.065).
The harness reproduces the coordinator's baseline: **saver wins 49%** today (57% / 43% / 48% on the three
GridTypes). Under the per-agent economy **saver's lead disappears at every income ≤ 4** (0.19–0.30), and all
four policies land within 0.06 of fair at I1–I2.

The likely mechanism: saver's edge today is saving up for one dear, high-erasure jackpot program. Here
the god pays only the description, which varies little (11–24 bits for the 10th–90th percentile of
summoned agents), and a dear program's erasure buys cooldown, not power, so there is nothing worth saving
for. Saver's edge returns as income rises (0.35 at I16), because the cap starts to bind again. The naive setting
(old value model on the new prices) is less balanced (random 0.14) and has 19% idle ticks. Its gods summon
programs that are expensive to act (median E[bits per act] 10.4 vs 4.8 for the energy-aware value model)
and then cannot run them. So policies do need to know this economy.

### 4.3 Per-family fairness

Family fairness is the policy-adjusted mean z per family, over the 26 families with ≥ 10 god-slots.
"Excess SD" is the spread of family means beyond sampling noise (0 = all families equally strong).

| setting | family z SD | excess SD | families whose CI excludes 0.5 |
|---|---|---|---|
| summon | 0.193 | 0.171 | 46% |
| energy I1 | 0.208 | 0.187 | 50% |
| energy I2 | 0.242 | 0.225 | 62% |
| energy I4 | 0.248 | 0.231 | 58% |
| energy I1, α 0.5 | 0.181 | 0.152 | 42% |
| energy I1, start one act | 0.186 | 0.155 | 27% |

**Fairness gets somewhat worse as income rises** (excess SD 0.17 → 0.23 at I2–I4). With only 10–15 slots per
family, single-family moves of ±0.2 z are within noise. The aggregate trend is consistent across
I0.25 (0.207), I1, I2, I4 and I16 (0.242), so it is probably real. Families that gain (I1) include Feuding Families
(+0.26), Seed 3 Green Ones, Constellation and Parity Painter (+0.17 to +0.18). Families that lose include Staircase Climber
(−0.20) and Number Painter (−0.12). The pattern is consistent with the cooldown taxing families whose route
needs big symbol-layer overwrites (`write_ramp`, `write`, which cost 30–120 bits of erasure per act) more than
colour-layer or guarded routes. α = 0.5 is the fairest setting tested.

### 4.4 Agents: counts, acts, description and per-act bits

| setting | agents per god (random / greedy / saver / omniscient) | description bits p10 / p50 / p90 | E[bits per act] p10 / p50 / p90 | acts per agent p50 / p90 | charged bits per act p50 / p90 (mean) | bijective share of agents |
|---|---|---|---|---|---|---|
| summon | 26 / 30 / 8 / 33 | 11.5 / 14.6 / 24.0 | 0.07 / 1.25 / 13.2 | 370 / 1001 | – | 0.58 |
| energy I1 | 34 / 39 / 16 / 42 | 11.2 / 14.0 / 22.9 | 0.21 / 4.8 / 48.8 | 65 / 1007 | 0.15 / 1.27 (0.77) | 0.42 |
| energy I2 | 34 / 39 / 16 / 42 | 11.2 / 14.0 / 23.2 | 0.23 / 5.2 / 52.3 | 102 / 1015 | 0.26 / 2.66 (1.35) | 0.39 |
| energy I4 | 34 / 38 / 18 / 42 | 11.2 / 14.1 / 23.5 | 0.24 / 6.2 / 58.6 | 149 / 973 | 0.48 / 5.8 (2.38) | 0.37 |
| energy I16 | 34 / 37 / 19 / 41 | 11.2 / 14.1 / 24.0 | 0.26 / 7.9 / 59.9 | 223 / 839 | 1.62 / 16.3 (6.37) | 0.32 |

In the summon row, "description bits" and "E[bits per act]" are the same profiles applied to the agents
today's policies buy. The largest god had 148–193 agents, so the 200 cap was never reached. Readings:

* Gods field **about 35% more agents** (33 vs 24 per god on average), because they now pay only the
  description. They buy programs with **dearer acts** (median E[bits per act] 4.8–7.9 vs 1.25) and fewer
  bijections (32–42% vs 58%). The energy-aware value model no longer pays a premium for an expensive act,
  because the agent's own income pays for it.
* **Acts are very unequal.** The median agent acts 65 times (I1) and the 90th percentile 1000 times. The mean
  charged act is 0.77 bits (I1), while the mean agent expects 16.5 bits per act. Cheap agents act far more
  often, which is the design working as stated.
* Conservation holds in every game: |start + income − charged − wasted − balance| ≤ 4e−3 bits per agent
  (float32 logging). 2–10% of agents end in debt, because an act can cost more than its expectation.

### 4.5 Do "simple and information-efficient" agents win?

**No, not in the sense intended.** Within each game we rank the gods by payoff and correlate that rank
with their agents' mean description bits and mean E[bits per act] (Spearman ρ, mean ± 95% CI over the 180
games):

| setting | ρ(payoff, description bits) | ρ(payoff, E[bits per act]) | ρ(payoff, agent count) |
|---|---|---|---|
| summon | +0.15 ± 0.08 | +0.28 ± 0.08 | −0.25 ± 0.08 |
| energy I1 | −0.03 ± 0.09 | +0.08 ± 0.09 | +0.02 ± 0.09 |
| energy I2 | −0.06 ± 0.08 | **+0.14 ± 0.08** | +0.02 ± 0.08 |
| energy I4 | −0.05 ± 0.08 | **+0.25 ± 0.08** | +0.00 ± 0.08 |
| energy I1, α 0.5 | **−0.10 ± 0.08** | −0.05 ± 0.09 | +0.05 ± 0.08 |

* **Simple wins only weakly.** Today the gods with *dearer* descriptions win (+0.15). Under the new economy
  the sign flips (−0.03 to −0.10), but it is only clearly non-zero at α = 0.5. Descriptions vary too little
  (14 bits median, 11–24 for p10–p90) to buy many more agents, and agent count is uncorrelated with winning.
* **Information-efficient acts do not win: dear acts still do** (+0.14 at I2, +0.25 at I4). Per agent, the
  cheapest-acting third (mostly bijections and rarely-true guards) has *negative* own Δpayoff per second at
  every setting, and the dearest third has the largest gain (§7, terciles). The reason is structural. By the
  Donsker–Varadhan / Landauer bound, the expected surprisal an act creates is at most about the bits it
  erases, plus log terms. "Cheap per act" therefore mostly means "creates no rarity": reversible moves that
  redistribute other gods' structure. The economy does make information *cost* time, but each bit buys
  about the same rarity whoever spends it. A cheap agent cannot be more efficient in the yield sense,
  only more frequent. "Efficiency" that wins would have to be **Δpayoff per bit**. That is bounded about equally for
  all mutators, so the economy cannot reward it beyond what targeting already does (relative targets and
  guards that fire only where the owner gains).

### 4.6 Anti-spam

`spammer` summons the cheapest of 12 random programs at every decision, whatever they do. It plays against
greedy_private, saver and greedy_omniscient (120 paired games per setting):

| setting | spammer wins | its agents | its share of acts | saver wins |
|---|---|---|---|---|
| summon | 0.11 | 40 | 0.38 | 0.55 |
| owner_pays | 0.21 | 12 | 0.19 | 0.33 |
| energy I1, α 1 | 0.20 | 49 | 0.19 | 0.30 |
| energy I2, α 1 | 0.22 | 49 | 0.23 | 0.32 |
| energy I4, α 1 | 0.17 | 49 | 0.27 | 0.38 |
| energy I1, α 0.5 | 0.17 | 49 | 0.12 | 0.25 |
| energy I4, α 0.5 | 0.17 | 49 | 0.16 | 0.28 |

**Spam does not dominate under either rule.** (a) With the 200-agent cap alone (α = 1), the spammer wins
0.17–0.22, below the fair 0.25. It never gets near the cap: at about 11 description bits per agent its
energy (100 + 1 bit/s × 433 s) buys about 49 agents. The binding limit is the summon price, not the cap.
Its agents get fewer acts than their head count (19–27% of acts from about 30% of the agents), because
its random cheap programs include dear-act ones that wait. (b) Sublinear income (α = 0.5) cuts its share of
acts by a third (0.19 → 0.12 at I1), and it wins 0.17. The spammer does better than today (0.11)
because its uniform-draw share is no longer a liability once saver stops dominating. Its 49 random agents
cost it little, and it remains a below-fair strategy. α = 0.5 would matter if real players found cheaper
programs or played longer games. It costs activity at fixed income (20% idle ticks at I1), which needs
about 4× the income to compensate (I4, α 0.5 ≈ I1, α 1).

## 5. Recommendations

1. **Use `economy = "agent_energy"` with `agent_income = 2` bits/s per agent at the engine's 100 Hz**
   (`energy_I2_B2_A1`). Scale income with the rate: the `GameConfig` default is 0.4, the same ratio
   Σ income / E[bits per act] to the cap at the simulator's default 20 Hz. This is the knee. The paired dynamism change is −0.010 ± 0.009
   (not significant). Lead changes rise by 2.2 per 100 s (+45%) and late activity rises. Saver's 49% falls to
   28%, with all policies within 0.03 of fair, and spam stays below fair. The cost: final rarity falls by about 40% and the
   per-family spread widens (excess SD 0.17 → 0.23). If rarity matters more than balance, use
   `agent_income = 4` (dynamism equal to today, rarity −28%, saver 30%). Do not go to 16: that is today's
   game again, with saver coming back.
2. **`agent_battery = 2`.** It barely matters between 1 and 8. Below 2, idle ticks rise for nothing, and a
   larger battery only lets idle agents bank.
3. **`agent_income_alpha = 1` (the 200 cap alone) for now, with α = 0.5 as the lever if real players
   spam.** Spam is not a threat in these games, because the summon price caps it first. α = 0.5 is the fairest
   setting per family, but it needs about 4× the income to keep activity.
4. **`agent_start = "zero"`.** "One act paid by the god" changes the purchase mix, not the economy. Gods then
   pay for the first act at summon, so they shift to cheap-act programs (65% bijective, median E[bits per act]
   0.9). dynamism2 falls (−0.12), although family fairness looks better (0.155).
5. **Keep policies economy-aware** (the default `energy_aware=True`). The naive value model loses 0.047
   dynamism and balances worse.
6. **Do not adopt owner_pays** as implemented here: gods go broke and the game slows to 20% of its draws.
   The economy session's own variant (`aware` policies, `split_scale`) may do better. This reproduction uses
   the same split with the greedy family's total-cost-of-ownership value model.

The design's stated goal, "simple, information-efficient agents win", is not achieved, for the structural
reason in §4.5. What the per-agent energy rule does achieve is a **principled, self-pacing cooldown**.
It removes the saver dominance, makes leads change hands more often, and keeps every act's cost
exactly accounted for (conservation and the pointwise derivation). It has no measurable loss of dynamism at I = 2.

## 6. Caveats

* All players are the simulated policies (one-step lookahead on 24 sampled objects). Human or planning
  players might exploit cheap-act agents (e.g. rarely-true guards that fire only on their own jackpots)
  much better than greedy sampling does. The guard decision charge −log2 q on a pass is designed to price that.
* The expected cost per act is measured at the prior. In play, objects are structured, so guards pass
  more often and overwrites more often do nothing. Realised bits per act differ from the threshold (2–10%
  of agents end in debt). That is self-correcting, since debt lengthens the cooldown.
* The line\* selection frequencies come from 96 reference spawns. Their argmax tie-break (lowest index) makes row 1
  cheap to select and the last column expensive. That is a property of the mutator definition, not of the
  economy.
* Family fairness uses 10–15 slots per family; treat single-family numbers as indicative.
* One rate (100 Hz), three GridTypes, 4 gods. The knee should be re-measured if the rate cap or the summon
  prices change.

## 7. Full tables (generated)

`python3 -m gridlab.experiments.agent_energy --out report.md` regenerates this section from the cache.

#### Headline metrics (mean [95% bootstrap CI]; 60 games per GridType × 3 GridTypes)

| setting | dynamism | dynamism2 | tension_rate | spirals_per_100_commits | lead_changes_per_100s |
|---|---|---|---|---|---|
| summon | 0.7 [0.69, 0.71] | 0.528 [0.509, 0.549] | 0.297 [0.282, 0.314] | 7.89 [7.67, 8.09] | 4.96 [4.36, 5.56] |
| owner_pays | 0.633 [0.622, 0.643] | 0.38 [0.373, 0.388] | 0.203 [0.187, 0.219] | 6.73 [6.43, 7.04] | 6.67 [6.16, 7.18] |
| energy_I0p25_B2_A1 | 0.665 [0.656, 0.674] | 0.423 [0.413, 0.436] | 0.199 [0.183, 0.215] | 6.33 [6.05, 6.62] | 7.42 [6.9, 7.86] |
| energy_I1_B2_A1 | 0.681 [0.674, 0.689] | 0.455 [0.441, 0.474] | 0.219 [0.204, 0.235] | 6.93 [6.67, 7.19] | 7.48 [6.98, 7.99] |
| energy_I2_B2_A1 | 0.69 [0.682, 0.699] | 0.486 [0.468, 0.507] | 0.235 [0.22, 0.25] | 7.22 [6.99, 7.46] | 7.14 [6.54, 7.7] |
| energy_I4_B2_A1 | 0.699 [0.689, 0.708] | 0.516 [0.498, 0.537] | 0.255 [0.24, 0.27] | 7.46 [7.26, 7.67] | 6.49 [5.84, 7.14] |
| energy_I16_B2_A1 | 0.713 [0.703, 0.722] | 0.568 [0.548, 0.59] | 0.297 [0.283, 0.312] | 7.83 [7.65, 8.03] | 5.26 [4.61, 5.85] |
| energy_I1_B1_A1 | 0.678 [0.67, 0.686] | 0.455 [0.44, 0.473] | 0.214 [0.2, 0.23] | 6.86 [6.58, 7.12] | 7.6 [7.01, 8.17] |
| energy_I1_B8_A1 | 0.677 [0.668, 0.686] | 0.453 [0.438, 0.472] | 0.22 [0.206, 0.234] | 6.92 [6.67, 7.17] | 7.36 [6.75, 7.96] |
| energy_I1_B2_A0p5 | 0.658 [0.65, 0.666] | 0.414 [0.404, 0.426] | 0.195 [0.178, 0.211] | 6.13 [5.84, 6.44] | 7.47 [6.95, 7.94] |
| energy_I4_B2_A0p5 | 0.673 [0.663, 0.681] | 0.448 [0.433, 0.465] | 0.216 [0.2, 0.231] | 6.97 [6.68, 7.24] | 7.44 [6.82, 8.02] |
| energy_I1_B2_A1_start1 | 0.685 [0.679, 0.693] | 0.405 [0.392, 0.42] | 0.211 [0.196, 0.227] | 6.84 [6.59, 7.08] | 8.8 [8.21, 9.34] |
| energy_I1_B2_A1_naive | 0.653 [0.642, 0.664] | 0.517 [0.499, 0.536] | 0.214 [0.198, 0.23] | 5.96 [5.63, 6.28] | 5.41 [4.86, 5.91] |

| setting | stagnation_frac | late_activity | commit_rate | final salience (bits) | welfare ratio vs summon (geo-mean) | idle tick share | attempt share |
|---|---|---|---|---|---|---|---|
| summon | 1 [1, 1] | 0.208 [0.203, 0.214] | 81.7 [80.9, 82.5] | 13.1 [11.8, 14.5] | 1.00 | 0.00 | 1.00 |
| owner_pays | 1 [0.999, 1] | 0.189 [0.186, 0.193] | 16.6 [15.8, 17.5] | 4.68 [4.57, 4.81] | 0.23 | 0.00 | 0.21 |
| energy_I0p25_B2_A1 | 1 [1, 1] | 0.262 [0.255, 0.269] | 41.7 [39.4, 44.1] | 5.1 [4.97, 5.26] | 0.27 | 0.22 | 0.78 |
| energy_I1_B2_A1 | 1 [1, 1] | 0.227 [0.222, 0.231] | 71.1 [69.1, 72.9] | 6.2 [5.9, 6.53] | 0.38 | 0.04 | 0.96 |
| energy_I2_B2_A1 | 1 [1, 1] | 0.222 [0.218, 0.227] | 77.4 [75.8, 78.7] | 7.56 [7.06, 8.16] | 0.51 | 0.01 | 0.99 |
| energy_I4_B2_A1 | 1 [1, 1] | 0.227 [0.223, 0.231] | 79.8 [78.8, 80.8] | 9.42 [8.61, 10.3] | 0.71 | 0.00 | 1.00 |
| energy_I16_B2_A1 | 1 [1, 1] | 0.236 [0.232, 0.24] | 80.4 [79.5, 81.3] | 15.4 [13.9, 17] | 1.51 | 0.00 | 1.00 |
| energy_I1_B1_A1 | 1 [1, 1] | 0.231 [0.227, 0.234] | 67.8 [65.7, 69.6] | 6.3 [5.98, 6.66] | 0.39 | 0.08 | 0.92 |
| energy_I1_B8_A1 | 1 [1, 1] | 0.225 [0.221, 0.229] | 73.2 [71.3, 74.7] | 6.33 [6.02, 6.7] | 0.39 | 0.03 | 0.97 |
| energy_I1_B2_A0p5 | 1 [1, 1] | 0.234 [0.229, 0.24] | 43.3 [41.2, 45.4] | 4.99 [4.85, 5.13] | 0.26 | 0.20 | 0.80 |
| energy_I4_B2_A0p5 | 1 [1, 1] | 0.212 [0.208, 0.216] | 73 [71.4, 74.3] | 6.11 [5.82, 6.41] | 0.37 | 0.02 | 0.98 |
| energy_I1_B2_A1_start1 | 1 [1, 1] | 0.219 [0.216, 0.222] | 74.6 [73.2, 75.9] | 5.26 [5.08, 5.43] | 0.29 | 0.02 | 0.98 |
| energy_I1_B2_A1_naive | 1 [1, 1] | 0.26 [0.252, 0.27] | 44.8 [42.1, 47.6] | 8.15 [7.67, 8.68] | 0.59 | 0.19 | 0.81 |

**Paired difference vs summon** (mean ± 95% CI over games)

| setting | Δ dynamism | Δ dynamism2 | Δ tension | Δ spirals/100 | Δ lead ch./100s | Δ late activity |
|---|---|---|---|---|---|---|
| owner_pays | -0.067 ± 0.012 | -0.148 ± 0.016 | -0.0942 ± 0.012 | -1.16 ± 0.31 | +1.71 ± 0.73 | -0.0183 ± 0.0059 |
| energy_I0p25_B2_A1 | -0.0349 ± 0.01 | -0.105 ± 0.014 | -0.0976 ± 0.0097 | -1.56 ± 0.26 | +2.46 ± 0.72 | +0.0542 ± 0.0079 |
| energy_I1_B2_A1 | -0.0187 ± 0.0096 | -0.0727 ± 0.012 | -0.0783 ± 0.0088 | -0.967 ± 0.21 | +2.52 ± 0.68 | +0.0191 ± 0.0064 |
| energy_I2_B2_A1 | -0.00997 ± 0.0093 | -0.042 ± 0.013 | -0.0622 ± 0.0078 | -0.67 ± 0.2 | +2.18 ± 0.71 | +0.0146 ± 0.0064 |
| energy_I4_B2_A1 | -0.000995 ± 0.0092 | -0.0124 ± 0.013 | -0.0423 ± 0.0073 | -0.432 ± 0.16 | +1.53 ± 0.64 | +0.0194 ± 0.0064 |
| energy_I16_B2_A1 | +0.0131 ± 0.0087 | +0.0402 ± 0.012 | +0.000428 ± 0.0072 | -0.0613 ± 0.13 | +0.303 ± 0.64 | +0.0283 ± 0.0062 |
| energy_I1_B1_A1 | -0.022 ± 0.0093 | -0.0731 ± 0.013 | -0.0824 ± 0.0084 | -1.03 ± 0.25 | +2.64 ± 0.7 | +0.0229 ± 0.0062 |
| energy_I1_B8_A1 | -0.0233 ± 0.01 | -0.0754 ± 0.013 | -0.0774 ± 0.0087 | -0.972 ± 0.21 | +2.4 ± 0.71 | +0.0174 ± 0.0064 |
| energy_I1_B2_A0p5 | -0.0422 ± 0.01 | -0.114 ± 0.014 | -0.102 ± 0.01 | -1.77 ± 0.25 | +2.51 ± 0.67 | +0.0265 ± 0.0076 |
| energy_I4_B2_A0p5 | -0.0269 ± 0.0096 | -0.0802 ± 0.013 | -0.0812 ± 0.0088 | -0.927 ± 0.2 | +2.48 ± 0.72 | +0.00429 ± 0.0062 |
| energy_I1_B2_A1_start1 | -0.015 ± 0.009 | -0.123 ± 0.013 | -0.0857 ± 0.0079 | -1.05 ± 0.21 | +3.84 ± 0.66 | +0.0108 ± 0.0058 |
| energy_I1_B2_A1_naive | -0.0467 ± 0.011 | -0.0113 ± 0.012 | -0.0832 ± 0.0093 | -1.93 ± 0.27 | +0.455 ± 0.64 | +0.0526 ± 0.0094 |

#### Policy balance: win share (mean z), fair = 0.25 (z 0.5)

| setting | random | greedy_private | saver | greedy_omniscient |
|---|---|---|---|---|
| summon | 0.13 (z 0.38) | 0.21 (z 0.46) | 0.49 (z 0.72) | 0.17 (z 0.44) |
| owner_pays | 0.24 (z 0.50) | 0.19 (z 0.46) | 0.33 (z 0.54) | 0.23 (z 0.50) |
| energy_I0p25_B2_A1 | 0.29 (z 0.53) | 0.29 (z 0.54) | 0.19 (z 0.43) | 0.23 (z 0.49) |
| energy_I1_B2_A1 | 0.22 (z 0.47) | 0.28 (z 0.51) | 0.28 (z 0.54) | 0.22 (z 0.49) |
| energy_I2_B2_A1 | 0.22 (z 0.45) | 0.27 (z 0.52) | 0.28 (z 0.52) | 0.24 (z 0.51) |
| energy_I4_B2_A1 | 0.18 (z 0.39) | 0.27 (z 0.54) | 0.30 (z 0.56) | 0.25 (z 0.51) |
| energy_I16_B2_A1 | 0.17 (z 0.38) | 0.27 (z 0.54) | 0.35 (z 0.61) | 0.22 (z 0.47) |
| energy_I1_B1_A1 | 0.25 (z 0.50) | 0.28 (z 0.55) | 0.24 (z 0.47) | 0.23 (z 0.48) |
| energy_I1_B8_A1 | 0.19 (z 0.44) | 0.31 (z 0.56) | 0.24 (z 0.49) | 0.26 (z 0.50) |
| energy_I1_B2_A0p5 | 0.19 (z 0.44) | 0.28 (z 0.54) | 0.28 (z 0.52) | 0.24 (z 0.50) |
| energy_I4_B2_A0p5 | 0.20 (z 0.45) | 0.26 (z 0.52) | 0.25 (z 0.51) | 0.29 (z 0.53) |
| energy_I1_B2_A1_start1 | 0.22 (z 0.47) | 0.28 (z 0.53) | 0.27 (z 0.51) | 0.24 (z 0.49) |
| energy_I1_B2_A1_naive | 0.14 (z 0.41) | 0.29 (z 0.56) | 0.33 (z 0.54) | 0.23 (z 0.49) |

#### Per-family fairness (policy-adjusted z; excess SD over sampling noise)

| setting | family z SD | excess SD | share of families with CI excluding 0.5 | families |
|---|---|---|---|---|
| summon | 0.193 | 0.171 | 0.46 | 26 |
| owner_pays | 0.205 | 0.182 | 0.42 | 26 |
| energy_I0p25_B2_A1 | 0.225 | 0.207 | 0.46 | 26 |
| energy_I1_B2_A1 | 0.208 | 0.187 | 0.50 | 26 |
| energy_I2_B2_A1 | 0.242 | 0.225 | 0.62 | 26 |
| energy_I4_B2_A1 | 0.248 | 0.231 | 0.58 | 26 |
| energy_I16_B2_A1 | 0.256 | 0.242 | 0.54 | 26 |
| energy_I1_B1_A1 | 0.232 | 0.213 | 0.46 | 26 |
| energy_I1_B8_A1 | 0.213 | 0.193 | 0.38 | 26 |
| energy_I1_B2_A0p5 | 0.181 | 0.152 | 0.42 | 26 |
| energy_I4_B2_A0p5 | 0.221 | 0.197 | 0.38 | 26 |
| energy_I1_B2_A1_start1 | 0.186 | 0.155 | 0.27 | 26 |
| energy_I1_B2_A1_naive | 0.228 | 0.209 | 0.42 | 26 |

**Saver win share per GridType**

| setting | 5,base10,rgby | 6,cards,rainbow6 | 4,base12,rgb |
|---|---|---|---|
| summon | 0.57 | 0.43 | 0.48 |
| owner_pays | 0.33 | 0.42 | 0.23 |
| energy_I0p25_B2_A1 | 0.18 | 0.17 | 0.23 |
| energy_I1_B2_A1 | 0.25 | 0.35 | 0.23 |
| energy_I2_B2_A1 | 0.27 | 0.25 | 0.32 |
| energy_I4_B2_A1 | 0.32 | 0.28 | 0.30 |
| energy_I16_B2_A1 | 0.38 | 0.33 | 0.33 |
| energy_I1_B1_A1 | 0.20 | 0.27 | 0.25 |
| energy_I1_B8_A1 | 0.27 | 0.22 | 0.25 |
| energy_I1_B2_A0p5 | 0.25 | 0.27 | 0.33 |
| energy_I4_B2_A0p5 | 0.33 | 0.18 | 0.23 |
| energy_I1_B2_A1_start1 | 0.27 | 0.28 | 0.25 |
| energy_I1_B2_A1_naive | 0.38 | 0.27 | 0.33 |

**Largest family moves, summon → energy_I1_B2_A1** (policy-adjusted z; n god-slots)

| family | summon z | energy_I1_B2_A1 z | Δ | n |
|---|---|---|---|---|
| staircase_climber | 0.56 | 0.36 | -0.20 | 10 |
| number_painter | 0.49 | 0.37 | -0.12 | 12 |
| snake_charmer | 0.41 | 0.32 | -0.10 | 14 |
| magic_window | 0.41 | 0.34 | -0.08 | 13 |
| full_house | 0.95 | 0.89 | -0.05 | 10 |
| king_of_the_hill | 0.25 | 0.38 | +0.13 | 11 |
| parity_painter | 0.44 | 0.61 | +0.17 | 11 |
| constellation | 0.59 | 0.76 | +0.17 | 10 |
| seed3_green_ones | 0.66 | 0.84 | +0.18 | 11 |
| feuding_families | 0.29 | 0.55 | +0.26 | 12 |

**Largest family moves, summon → energy_I1_B2_A0p5** (policy-adjusted z; n god-slots)

| family | summon z | energy_I1_B2_A0p5 z | Δ | n |
|---|---|---|---|---|
| times_table_territory | 0.51 | 0.32 | -0.19 | 10 |
| snake_charmer | 0.41 | 0.23 | -0.18 | 14 |
| full_house | 0.95 | 0.77 | -0.18 | 10 |
| magic_window | 0.41 | 0.27 | -0.14 | 13 |
| constellation | 0.59 | 0.45 | -0.14 | 10 |
| flag_bearer | 0.56 | 0.76 | +0.19 | 11 |
| colour_value_ladder | 0.42 | 0.62 | +0.20 | 15 |
| magic_accountant | 0.28 | 0.52 | +0.24 | 11 |
| conqueror | 0.53 | 0.81 | +0.28 | 12 |
| feuding_families | 0.29 | 0.59 | +0.30 | 12 |

#### Agents: count per god by policy; description and per-act bits; acts

| setting | agents random | agents greedy_private | agents saver | agents greedy_omniscient | median summon bits | median E[act bits] | mean E[act bits] | median acts/agent | median acts/s | median charged bits/act | bijective share | guarded share |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| summon | 25.9 | 29.5 | 8.1 | 33.1 | 14.6 | 1.25 | 5.0 | 370 | 1.16 | – | 0.58 | 0.12 |
| owner_pays | 7.0 | 7.9 | 4.9 | 8.6 | 16.1 | 2.58 | 15.5 | 2 | 0.01 | 0.08 | 0.42 | 0.19 |
| energy_I0p25_B2_A1 | 33.5 | 39.1 | 18.0 | 42.3 | 14.0 | 3.77 | 15.2 | 21 | 0.07 | 0.03 | 0.46 | 0.10 |
| energy_I1_B2_A1 | 33.5 | 39.0 | 15.8 | 42.2 | 14.0 | 4.78 | 16.5 | 65 | 0.21 | 0.13 | 0.42 | 0.11 |
| energy_I2_B2_A1 | 33.5 | 38.7 | 16.4 | 41.9 | 14.0 | 5.24 | 17.3 | 102 | 0.34 | 0.25 | 0.39 | 0.11 |
| energy_I4_B2_A1 | 33.5 | 38.3 | 17.5 | 41.6 | 14.1 | 6.23 | 18.3 | 149 | 0.48 | 0.40 | 0.37 | 0.12 |
| energy_I16_B2_A1 | 33.5 | 37.3 | 18.6 | 40.9 | 14.1 | 7.93 | 21.1 | 223 | 0.70 | 1.30 | 0.32 | 0.12 |
| energy_I1_B1_A1 | 33.5 | 38.8 | 16.6 | 42.2 | 14.0 | 4.68 | 16.5 | 61 | 0.19 | 0.09 | 0.42 | 0.11 |
| energy_I1_B8_A1 | 33.5 | 38.9 | 16.0 | 42.2 | 14.0 | 4.58 | 16.2 | 66 | 0.23 | 0.11 | 0.43 | 0.10 |
| energy_I1_B2_A0p5 | 33.5 | 38.9 | 13.8 | 42.3 | 14.0 | 4.00 | 15.5 | 13 | 0.04 | 0.03 | 0.45 | 0.10 |
| energy_I4_B2_A0p5 | 33.5 | 38.8 | 11.8 | 42.3 | 14.0 | 4.54 | 16.1 | 47 | 0.17 | 0.10 | 0.43 | 0.10 |
| energy_I1_B2_A1_start1 | 26.8 | 32.2 | 13.3 | 35.0 | 14.8 | 0.88 | 3.1 | 218 | 0.73 | 0.15 | 0.65 | 0.15 |
| energy_I1_B2_A1_naive | 33.5 | 38.0 | 10.5 | 41.6 | 14.0 | 10.35 | 25.8 | 31 | 0.10 | 0.05 | 0.30 | 0.10 |

#### Do simple, information-efficient agents win? Realised own Δpayoff per second of life, by summon-bits tercile × E[act bits] tercile; Spearman ρ with each

| setting | cheap desc + cheap acts | cheap desc + dear acts | dear desc + cheap acts | dear desc + dear acts | ρ(summon bits, value) | ρ(E[act bits], value) |
|---|---|---|---|---|---|---|
| summon | -1.2 (n 1705) | 16.8 (n 2097) | -1.1 (n 1957) | 19.7 (n 2490) | +0.00 | +0.15 |
| owner_pays | 0.0 (n 527) | 0.0 (n 628) | 0.0 (n 372) | 0.0 (n 722) | +0.01 | -0.01 |
| energy_I0p25_B2_A1 | -0.0 (n 1681) | 0.1 (n 3108) | -0.0 (n 3255) | 0.1 (n 2416) | -0.02 | +0.12 |
| energy_I1_B2_A1 | -0.2 (n 1788) | 0.6 (n 3126) | -0.3 (n 2930) | 0.6 (n 2557) | -0.04 | +0.27 |
| energy_I2_B2_A1 | -0.4 (n 2124) | 1.5 (n 3022) | -0.5 (n 2747) | 1.5 (n 2632) | -0.03 | +0.31 |
| energy_I4_B2_A1 | -0.7 (n 2052) | 3.4 (n 2969) | -2.1 (n 2651) | 5.6 (n 2737) | -0.03 | +0.32 |
| energy_I16_B2_A1 | -1.8 (n 1944) | 14.6 (n 2859) | -1.8 (n 2494) | 16.1 (n 2965) | -0.01 | +0.29 |
| energy_I1_B1_A1 | -0.2 (n 1793) | 0.6 (n 3119) | -0.2 (n 2987) | 0.6 (n 2592) | -0.04 | +0.27 |
| energy_I1_B8_A1 | -0.2 (n 1762) | 0.5 (n 3119) | -0.2 (n 2910) | 0.6 (n 2617) | -0.04 | +0.27 |
| energy_I1_B2_A0p5 | -0.0 (n 1572) | 0.0 (n 3023) | -0.0 (n 3233) | 0.1 (n 2322) | -0.00 | +0.09 |
| energy_I4_B2_A0p5 | -0.1 (n 1665) | 0.5 (n 2934) | -0.3 (n 2885) | 0.4 (n 2410) | -0.03 | +0.23 |
| energy_I1_B2_A1_start1 | -0.1 (n 1686) | 1.0 (n 2270) | -0.0 (n 2503) | 0.5 (n 2292) | +0.01 | +0.17 |
| energy_I1_B2_A1_naive | -0.3 (n 2086) | 0.6 (n 2877) | -0.2 (n 2373) | 2.4 (n 3058) | +0.01 | +0.28 |

#### Same question at the god level: within-game Spearman ρ between a god's payoff and its agents' mean summon bits, mean E[act bits], agent count and total acts (mean ± 95% CI over games); and the policy-adjusted regression of z on the standardised god means (summon bits, E[act bits], agents)

| setting | ρ(payoff, summon bits) | ρ(payoff, E[act bits]) | ρ(payoff, agents) | ρ(payoff, acts) | β summon bits | β E[act bits] | β agents |
|---|---|---|---|---|---|---|---|
| summon | +0.15 ± 0.08 | +0.28 ± 0.08 | -0.25 ± 0.08 | -0.23 ± 0.08 | -0.003 | +0.111 | +0.015 |
| owner_pays | -0.08 ± 0.08 | +0.02 ± 0.08 | -0.00 ± 0.08 | +0.09 ± 0.09 | +0.004 | +0.010 | +0.056 |
| energy_I0p25_B2_A1 | -0.00 ± 0.08 | +0.10 ± 0.09 | +0.08 ± 0.08 | -0.01 ± 0.09 | -0.012 | +0.002 | +0.005 |
| energy_I1_B2_A1 | -0.03 ± 0.09 | +0.08 ± 0.09 | +0.02 ± 0.09 | +0.04 ± 0.09 | -0.041 | +0.038 | +0.002 |
| energy_I2_B2_A1 | -0.06 ± 0.08 | +0.14 ± 0.08 | +0.02 ± 0.08 | +0.02 ± 0.08 | -0.017 | +0.031 | +0.009 |
| energy_I4_B2_A1 | -0.05 ± 0.08 | +0.25 ± 0.08 | +0.00 ± 0.08 | -0.07 ± 0.09 | -0.007 | +0.063 | +0.006 |
| energy_I16_B2_A1 | +0.06 ± 0.08 | +0.26 ± 0.08 | -0.11 ± 0.08 | -0.12 ± 0.08 | +0.015 | +0.050 | +0.011 |
| energy_I1_B1_A1 | -0.03 ± 0.09 | +0.14 ± 0.09 | +0.06 ± 0.09 | +0.02 ± 0.09 | -0.017 | +0.039 | +0.013 |
| energy_I1_B8_A1 | -0.09 ± 0.08 | +0.11 ± 0.09 | +0.09 ± 0.08 | +0.02 ± 0.09 | -0.016 | +0.019 | +0.010 |
| energy_I1_B2_A0p5 | -0.10 ± 0.08 | -0.05 ± 0.09 | +0.05 ± 0.08 | +0.01 ± 0.09 | -0.048 | +0.004 | -0.001 |
| energy_I4_B2_A0p5 | -0.10 ± 0.09 | +0.03 ± 0.09 | +0.08 ± 0.09 | +0.03 ± 0.09 | -0.035 | +0.021 | -0.005 |
| energy_I1_B2_A1_start1 | -0.04 ± 0.08 | +0.10 ± 0.09 | +0.02 ± 0.09 | +0.03 ± 0.09 | -0.027 | +0.033 | +0.002 |
| energy_I1_B2_A1_naive | -0.00 ± 0.09 | +0.15 ± 0.08 | +0.02 ± 0.08 | -0.12 ± 0.08 | -0.006 | +0.043 | +0.016 |

#### Anti-spam: one `spammer` (cheapest of 12 random programs every decision) vs 3 value policies

| setting | spammer wins | greedy_private wins | saver wins | greedy_omniscient wins | spammer agents | spammer share of acts | dynamism2 | welfare |
|---|---|---|---|---|---|---|---|---|
| summon | 0.11 | 0.18 | 0.55 | 0.16 | 40 | 0.38 | 0.554 [0.533, 0.573] | 8.82e+03 [5.76e+03, 1.23e+04] |
| owner_pays | 0.21 | 0.21 | 0.33 | 0.25 | 12 | 0.19 | 0.384 [0.375, 0.393] | 810 [692, 948] |
| energy_I1_B2_A1 | 0.20 | 0.23 | 0.30 | 0.27 | 49 | 0.19 | 0.467 [0.447, 0.486] | 2.24e+03 [1.7e+03, 2.91e+03] |
| energy_I2_B2_A1 | 0.22 | 0.24 | 0.32 | 0.23 | 49 | 0.23 | 0.496 [0.475, 0.52] | 3.71e+03 [2.78e+03, 4.97e+03] |
| energy_I4_B2_A1 | 0.17 | 0.26 | 0.38 | 0.19 | 49 | 0.27 | 0.532 [0.51, 0.556] | 6.43e+03 [4.58e+03, 8.79e+03] |
| energy_I1_B2_A0p5 | 0.17 | 0.29 | 0.25 | 0.28 | 49 | 0.12 | 0.422 [0.408, 0.435] | 1.05e+03 [893, 1.26e+03] |
| energy_I4_B2_A0p5 | 0.17 | 0.28 | 0.28 | 0.27 | 49 | 0.16 | 0.456 [0.439, 0.475] | 1.97e+03 [1.44e+03, 2.72e+03] |