# Economy and agent lifecycle

Exploration of how the economy (energy, prices, running costs, income) and the agent lifecycle
(lifetimes, charges, caps) shape dynamism and policy balance in Grid Lab games.

**Shared modules are not modified.** Everything lives in `gridlab/explore/economy/`. `econ_sim.run_econ_game`
is a copy of `gridlab.sim.run_game` with economy hooks. With `Econ()` (all knobs off) it reproduces
`run_game` bit for bit, which the self-test checks for toy and real providers and for several policy
mixes. Policies are wrapped, not edited, so they see taxed or split prices.

## 0. How to reproduce

```
cd lib/grid-lab
python3 -m gridlab.explore.economy.selftest                          # identity + knob book-keeping
python3 -m gridlab.explore.economy.study detail --settings old --per-type 40   # §2 baseline curves
python3 -m gridlab.explore.economy.study sweep --per-type 16          # §3 one-at-a-time (all groups)
python3 -m gridlab.explore.economy.study sweep --per-type 16 --only split,splitfail,splitaware   # §4
python3 -m gridlab.explore.economy.study sweep --per-type 16 --only combo                       # §5
python3 -m gridlab.explore.economy.study validate --a old --b <name> --per-type 40              # §6 held out
python3 -m gridlab.explore.economy.study table [--seed S] [--only group,...]   # reprint any table
```

**Specs (paired, common random numbers).** `batch.make_specs(GTYPES, n, seed0, "four")`: for each of
the 5 GridTypes in `experiments.common.GTYPES` (`5,base10,rgby`, `4,base12,rgb`, `6,cards,rainbow6`,
`7,base16,rainbow6`, `3,base10,rgb`) and k = 0..n−1, game seed = seed0 + 100000·t + k. Every game has 4 gods,
one each of `random`, `greedy_private`, `saver` and `cooperative`. Seat order is
`default_rng([seed, 11]).permutation(4)`, so every game is a head-to-head of the four policies.
Training seed0 = **500000** (n = 16 per type, 80 games per setting; the baseline uses n = 40). Held-out
seed0 = **9500000**. Every setting runs on exactly the same specs, so a difference between two settings
is a paired difference on identical deals, game lengths and seats.

**Base economy ("old").** The engine defaults at the real 100 Hz rate (`experiments.common.OLD_CONFIG`):
starting energy 100, 1 energy/s, `cost_scale` 1, cap 200 agents per god, exponential game length with a
300 s half-life (mean 433 s), a 60 s planning phase, the `distinct` dealer, and uniform-prior calibration.
Every economy knob is relative to this.

**Measures.** `dynamism2` (the search objective from `experiments.common`) aggregates tension, held
accelerating climbs (cooperative spirals at the 5 s timescale), leaderboard crossings and drawdowns,
salience memory, hot objects, liveness and mutator variety. Policy balance is the mean **z** = (G − rank)/(G − 1)
per policy: 0.5 is fair, 1 means always first, 0 always last. Game-bootstrap 95% CIs are given. "Range" is
max − min of the four policy z values. Economy metrics are defined in `econ_metrics.py`:

- **useful-life** is the mean of (last owner-improving commit − start)/lifespan;
- **tau25** is the Kendall tau between the standings at 25% of the game and the final standings, where
  1 means the order was fixed early;
- **hold25** is P(the leader at 25% of the game is the final winner);
- **unspent** is the share of a god's energy never spent.

Paired Δdyn2 CIs are 1.96·sd/√n over games.

**Cost.** About 6.7 s per 100 Hz game on one core, and about 800–2000 games per hour on 4 cores
depending on the setting. The sweep below is about 4,700 games.

**Caching.** One JSON per game under `.cache/explore-economy/games/` (gitignored). Every summary row
is appended to `.cache/explore-economy/points.jsonl`. The cache key pins a code version (`batch.ECODE`):
new knobs default off and the identity test guards the old behaviour.

## 1. Knobs implemented (`Econ`)

| knob | meaning |
|---|---|
| `gas`, `gas_frac` | metabolic cost per application attempt: flat, or a fraction of the agent's summon price. An owner who can't pay gets `unpaid="skip"` (the pick is wasted) or `"starve"` (the agent dies). |
| `refund` | share of gas refunded when the attempt fails (a None result, or a duplicate rejected by the uniqueness check) |
| `half_life`, `lifetime` | exponential or fixed agent lifetimes |
| `charges`, `charge_on` | an agent dies after k charged applications. With `"attempt"` every attempt uses a charge; with `"commit"` only commits do, so a uniqueness-rejected attempt is refunded its charge. |
| `crowd_tax` | summon price × (1 + tax × the owner's live agents): a soft cap |
| `energy_cap` | banked energy above the cap is lost (use it or lose it) |
| `income_tilt` | k ∈ [−1, 1] redistributes the base income by payoff share every snapshot (k > 0 pays leaders, k < 0 pays laggards; total unchanged) |
| `income_own` | energy per bit of surprisal the owner gains from its own agents' commits (an earned-income loop) |
| `income_any` | energy per bit of surprisal each god gains from any commit |
| `price_exp` | convex pricing: price = c·(c/20)^(e−1) |
| `split`, `split_scale`, `split_fail` | the **time-split price** (§4): description at summon, erasure + motion + measurement per committed application |
| `aware` | policies price agents at total cost of ownership (summon + expected running cost over the expected life) |

GameConfig knobs used directly: `starting_energy`, `energy_per_second`, `cost_scale`, `max_agents`.

## 2. Baseline: what the current economy does (200 games, seed 500000, n = 40 per type)

**Saver dominates, and the policy mechanics show why.**

| policy | mean z | win share (fair 0.25) | attempt share | agents summoned | mean summon price (bits) | unspent energy |
|---|---|---|---|---|---|---|
| saver | **0.685** | **0.490** | 0.125 | 8.4 | **39.5** | 0.39 |
| greedy_private | 0.495 | 0.235 | 0.292 | 30.4 | 21.2 | 0.05 |
| cooperative | 0.422 | 0.135 | 0.322 | 33.2 | 19.3 | 0.04 |
| random | 0.398 | 0.140 | 0.256 | 26.8 | 23.9 | 0.05 |

Saver makes only 12.5% of the application attempts, yet its own agents raise its surprisal by
17.6k bits per game. Greedy manages 6.0k bits and cooperative 4.1k. Saver's agents also cost
everybody else 24.3k bits. This comes from the **price structure**. Saver banks to 60 energy and samples
32 candidates, so it can afford the expensive whole-grid "jackpot" programs (70–120 bits). Under
linear, all-at-summon pricing these are underpriced relative to their per-application impact,
because one jackpot application rewrites the whole object toward its owner's utility. Spend-as-you-go
policies never hold enough energy to buy one. *Policy-dependent:* this is the simulated `saver`, but
the underlying fact (big programs are cheap per unit of impact and are paid only once) is a property
of the economy.

**No stagnation, and no decay in usefulness.** Pooled over the 200 games:

| agent age (s) | 0–15 | 15–30 | 30–60 | 60–120 | 120–240 | 240–480 | 480+ |
|---|---|---|---|---|---|---|---|
| owner-improving commits per attempt | 0.193 | 0.188 | 0.188 | 0.191 | 0.193 | 0.194 | 0.202 |

| world time (s) | 0–60 | 120–180 | 240–300 | 360–420 | 480–540 | 600–660 |
|---|---|---|---|---|---|---|
| live agents | 25 | 46 | 66 | 86 | 106 | 127 |
| commits per attempt | 0.79 | 0.80 | 0.80 | 0.80 | 0.80 | 0.80 |
| \|Δ salience\| per attempt | 1.86 | 1.95 | 2.09 | 2.16 | 2.23 | 2.33 |

Agents never die, and they stay useful at every age. Every object is continually churned by every
agent, so an agent always finds objects it can improve. Agents accumulate linearly, reaching 140 by
11 minutes, but the world does not freeze: `stagnation_frac` is 1.00 and late activity is 0.21. The
per-attempt salience swing actually *grows*, because later agents are dearer and bigger. The
"stagnation as agents accumulate" problem does **not** appear in these simulations. The real cost
of accumulation is that each agent's share of the 100 Hz picks shrinks, so a new agent matters less
and less. That is mechanical, not policy-dependent: an agent gets 100/A applications per second.

**Standings lock in early.** P(the leader at 25% of the game wins) = 0.73, against 0.25 by chance, and
tau25 = 0.63. Lead changes still happen (14.8 per game, mostly early), but games are largely decided
by the first quarter. The early leader is usually the god that bought the biggest program.

## 3. One-at-a-time sweep (80 paired games per setting, seed 500000)

Δdyn2 is paired against `old` on identical specs. For scale, the policy-z CI half-width at n = 80 is about 0.07.

| setting | n | Δdyn2 [95% CI] | dyn2 | lead chg late | crossings | held climbs | tau25 | live agents | useful-life | unspent | z random | z greedy | z saver [CI] | z coop | range |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| old | 80 | +0.000 ± 0.000 | 0.570 | 11.3 | 2.71 | 2.36 | 0.66 | 58 | 0.71 | 0.13 | 0.37 | 0.51 | 0.72 [0.65, 0.80] | 0.40 | 0.36 |
| start=25 | 80 | -0.026 ± 0.019 | 0.544 | 11.2 | 3.00 | 2.55 | 0.58 | 55 | 0.71 | 0.12 | 0.38 | 0.47 | 0.77 [0.69, 0.84] | 0.38 | 0.38 |
| start=50 | 80 | -0.016 ± 0.016 | 0.554 | 11.3 | 2.85 | 2.41 | 0.63 | 57 | 0.71 | 0.12 | 0.38 | 0.48 | 0.78 [0.70, 0.85] | 0.37 | 0.40 |
| start=200 | 80 | -0.001 ± 0.016 | 0.569 | 11.3 | 2.75 | 2.12 | 0.69 | 64 | 0.70 | 0.13 | 0.33 | 0.51 | 0.74 [0.67, 0.81] | 0.42 | 0.40 |
| start=400 | 80 | +0.000 ± 0.015 | 0.570 | 11.9 | 2.81 | 1.91 | 0.73 | 74 | 0.70 | 0.14 | 0.44 | 0.49 | 0.67 [0.60, 0.74] | 0.40 | 0.27 |
| rate=0.25 | 80 | -0.034 ± 0.016 | 0.536 | 9.3 | 2.28 | 2.26 | 0.70 | 25 | 0.75 | 0.11 | 0.38 | 0.52 | 0.70 [0.62, 0.78] | 0.40 | 0.32 |
| rate=0.5 | 80 | -0.013 ± 0.015 | 0.557 | 10.8 | 2.52 | 2.41 | 0.69 | 37 | 0.73 | 0.11 | 0.36 | 0.50 | 0.72 [0.65, 0.80] | 0.42 | 0.36 |
| rate=2.0 | 80 | -0.006 ± 0.013 | 0.564 | 10.8 | 2.98 | 1.88 | 0.64 | 93 | 0.68 | 0.16 | 0.39 | 0.52 | 0.69 [0.62, 0.77] | 0.40 | 0.30 |
| rate=4.0 | 80 | +0.007 ± 0.014 | 0.577 | 13.3 | 3.23 | 1.81 | 0.66 | 144 | 0.65 | 0.21 | 0.35 | 0.53 | 0.72 [0.65, 0.79] | 0.41 | 0.37 |
| cscale=0.25 | 80 | +0.014 ± 0.014 | 0.583 | 13.0 | 3.23 | 1.77 | 0.69 | 156 | 0.65 | 0.21 | 0.36 | 0.57 | 0.61 [0.54, 0.69] | 0.45 | 0.25 |
| cscale=0.5 | 80 | +0.002 ± 0.015 | 0.571 | 13.9 | 3.12 | 1.86 | 0.68 | 97 | 0.68 | 0.15 | 0.38 | 0.52 | 0.70 [0.63, 0.77] | 0.40 | 0.32 |
| cscale=2.0 | 80 | -0.047 ± 0.021 | 0.522 | 11.2 | 2.64 | 2.37 | 0.61 | 35 | 0.73 | 0.11 | 0.37 | 0.53 | 0.75 [0.68, 0.82] | 0.35 | 0.40 |
| cscale=4.0 | 80 | -0.109 ± 0.023 | 0.461 | 15.7 | 3.50 | 1.32 | 0.52 | 21 | 0.76 | 0.12 | 0.42 | 0.50 | 0.65 [0.56, 0.72] | 0.44 | 0.22 |
| cap=5 | 80 | -0.048 ± 0.017 | 0.522 | 10.5 | 2.36 | 1.78 | 0.81 | 19 | 0.78 | 0.67 | 0.38 | 0.54 | 0.73 [0.66, 0.80] | 0.36 | 0.37 |
| cap=10 | 80 | -0.004 ± 0.009 | 0.566 | 10.4 | 2.53 | 2.49 | 0.72 | 33 | 0.77 | 0.47 | 0.39 | 0.50 | 0.76 [0.70, 0.82] | 0.36 | 0.40 |
| cap=20 | 80 | +0.002 ± 0.006 | 0.571 | 10.5 | 2.66 | 2.65 | 0.65 | 46 | 0.73 | 0.28 | 0.37 | 0.49 | 0.76 [0.69, 0.82] | 0.39 | 0.39 |
| cap=50 | 80 | +0.000 ± 0.001 | 0.570 | 11.2 | 2.69 | 2.42 | 0.63 | 56 | 0.71 | 0.15 | 0.36 | 0.53 | 0.72 [0.65, 0.80] | 0.39 | 0.36 |
| gas=0.005 | 80 | -0.006 ± 0.011 | 0.564 | 10.5 | 2.57 | 2.22 | 0.70 | 54 | 0.72 | 0.12 | 0.35 | 0.47 | 0.78 [0.72, 0.84] | 0.40 | 0.43 |
| gas=0.01 | 80 | -0.014 ± 0.012 | 0.555 | 9.9 | 2.44 | 2.26 | 0.68 | 50 | 0.72 | 0.11 | 0.34 | 0.50 | 0.76 [0.69, 0.84] | 0.40 | 0.42 |
| gas=0.02 | 80 | -0.012 ± 0.012 | 0.558 | 9.1 | 2.37 | 2.57 | 0.69 | 40 | 0.74 | 0.09 | 0.38 | 0.52 | 0.76 [0.69, 0.83] | 0.34 | 0.42 |
| gas=0.04 | 80 | -0.027 ± 0.015 | 0.543 | 10.4 | 2.49 | 2.05 | 0.73 | 23 | 0.78 | 0.03 | 0.38 | 0.53 | 0.74 [0.67, 0.81] | 0.36 | 0.38 |
| gasfrac=0.0005 | 80 | -0.014 ± 0.011 | 0.556 | 11.5 | 2.70 | 2.27 | 0.63 | 49 | 0.72 | 0.10 | 0.35 | 0.49 | 0.78 [0.71, 0.85] | 0.38 | 0.43 |
| gasfrac=0.001 | 80 | -0.013 ± 0.012 | 0.556 | 11.2 | 2.54 | 2.40 | 0.65 | 37 | 0.74 | 0.07 | 0.35 | 0.49 | 0.76 [0.69, 0.83] | 0.40 | 0.41 |
| gasfrac=0.002 | 80 | -0.042 ± 0.017 | 0.528 | 10.7 | 2.43 | 1.82 | 0.76 | 21 | 0.77 | 0.02 | 0.37 | 0.56 | 0.72 [0.65, 0.79] | 0.35 | 0.37 |
| starve=0.01 | 80 | -0.014 ± 0.012 | 0.556 | 10.0 | 2.44 | 2.22 | 0.68 | 50 | 0.72 | 0.11 | 0.33 | 0.50 | 0.76 [0.69, 0.84] | 0.40 | 0.43 |
| starve=0.02 | 80 | -0.012 ± 0.012 | 0.558 | 9.2 | 2.39 | 2.49 | 0.69 | 40 | 0.74 | 0.09 | 0.38 | 0.52 | 0.76 [0.69, 0.83] | 0.34 | 0.42 |
| refund=0.5 | 80 | -0.014 ± 0.012 | 0.555 | 9.7 | 2.35 | 2.37 | 0.68 | 42 | 0.74 | 0.09 | 0.36 | 0.48 | 0.79 [0.72, 0.85] | 0.37 | 0.43 |
| refund=1.0 | 80 | -0.003 ± 0.013 | 0.566 | 9.1 | 2.56 | 2.45 | 0.72 | 45 | 0.73 | 0.09 | 0.38 | 0.47 | 0.74 [0.67, 0.80] | 0.41 | 0.36 |
| halflife=30 | 80 | +0.020 ± 0.017 | 0.589 | 8.9 | 2.33 | 3.46 | 0.51 | 11 | 0.70 | 0.08 | 0.29 | 0.55 | 0.75 [0.68, 0.81] | 0.41 | 0.45 |
| halflife=60 | 80 | +0.024 ± 0.014 | 0.594 | 8.7 | 2.38 | 3.07 | 0.48 | 17 | 0.71 | 0.08 | 0.31 | 0.53 | 0.78 [0.71, 0.84] | 0.39 | 0.47 |
| halflife=120 | 80 | -0.000 ± 0.015 | 0.569 | 10.7 | 2.61 | 2.56 | 0.51 | 26 | 0.71 | 0.10 | 0.35 | 0.51 | 0.73 [0.66, 0.80] | 0.41 | 0.39 |
| halflife=240 | 80 | +0.001 ± 0.015 | 0.570 | 9.5 | 2.63 | 2.84 | 0.59 | 35 | 0.71 | 0.11 | 0.31 | 0.50 | 0.79 [0.72, 0.85] | 0.40 | 0.48 |
| lifetime=60 | 80 | +0.044 ± 0.018 | 0.614 | 8.7 | 2.38 | 3.93 | 0.50 | 15 | 0.71 | 0.08 | 0.31 | 0.48 | 0.85 [0.79, 0.90] | 0.36 | 0.54 |
| lifetime=120 | 80 | +0.022 ± 0.015 | 0.591 | 10.5 | 2.66 | 3.22 | 0.46 | 25 | 0.72 | 0.09 | 0.31 | 0.52 | 0.78 [0.70, 0.85] | 0.40 | 0.47 |
| charges=100 | 80 | -0.016 ± 0.020 | 0.554 | 5.2 | 1.57 | 1.28 | 0.50 | 3 | 0.69 | 0.07 | 0.34 | 0.48 | 0.84 [0.77, 0.90] | 0.35 | 0.50 |
| charges=300 | 80 | +0.010 ± 0.017 | 0.580 | 7.9 | 2.24 | 2.09 | 0.50 | 12 | 0.71 | 0.07 | 0.32 | 0.55 | 0.79 [0.72, 0.85] | 0.35 | 0.47 |
| charges=1000 | 80 | -0.001 ± 0.003 | 0.568 | 11.5 | 2.65 | 2.54 | 0.64 | 54 | 0.71 | 0.12 | 0.35 | 0.53 | 0.72 [0.64, 0.80] | 0.40 | 0.36 |
| charges=3000 | 80 | +0.000 ± 0.000 | 0.570 | 11.3 | 2.71 | 2.36 | 0.66 | 58 | 0.71 | 0.13 | 0.37 | 0.51 | 0.72 [0.65, 0.80] | 0.40 | 0.36 |
| ccharges=10 | 80 | -0.123 ± 0.023 | 0.446 | 2.6 | 1.05 | 0.14 | 0.58 | 2 | 0.25 | 0.07 | 0.31 | 0.52 | 0.79 [0.72, 0.85] | 0.39 | 0.48 |
| ccharges=30 | 80 | -0.031 ± 0.024 | 0.538 | 4.3 | 1.34 | 1.23 | 0.51 | 5 | 0.47 | 0.07 | 0.31 | 0.53 | 0.80 [0.74, 0.86] | 0.37 | 0.50 |
| ccharges=100 | 80 | +0.031 ± 0.017 | 0.600 | 5.8 | 1.79 | 2.95 | 0.53 | 11 | 0.67 | 0.08 | 0.36 | 0.56 | 0.74 [0.67, 0.81] | 0.34 | 0.40 |
| crowd=0.05 | 80 | -0.015 ± 0.014 | 0.555 | 10.6 | 2.60 | 2.34 | 0.68 | 44 | 0.73 | 0.13 | 0.38 | 0.50 | 0.74 [0.66, 0.81] | 0.38 | 0.36 |
| crowd=0.1 | 80 | -0.012 ± 0.013 | 0.558 | 8.5 | 2.37 | 2.56 | 0.71 | 39 | 0.73 | 0.14 | 0.31 | 0.56 | 0.76 [0.69, 0.84] | 0.37 | 0.45 |
| crowd=0.25 | 80 | -0.024 ± 0.016 | 0.545 | 10.7 | 2.52 | 2.53 | 0.65 | 31 | 0.75 | 0.14 | 0.37 | 0.53 | 0.74 [0.67, 0.81] | 0.36 | 0.38 |
| ecap=30 | 80 | -0.045 ± 0.016 | 0.525 | 14.0 | 2.85 | 1.98 | 0.65 | 52 | 0.71 | 0.08 | 0.36 | 0.57 | 0.61 [0.53, 0.70] | 0.45 | 0.25 |
| ecap=60 | 80 | -0.018 ± 0.015 | 0.552 | 11.7 | 2.73 | 2.24 | 0.71 | 57 | 0.70 | 0.09 | 0.32 | 0.53 | 0.75 [0.68, 0.81] | 0.41 | 0.42 |
| ecap=120 | 80 | -0.002 ± 0.004 | 0.567 | 10.2 | 2.67 | 2.44 | 0.65 | 58 | 0.70 | 0.10 | 0.37 | 0.51 | 0.73 [0.66, 0.81] | 0.38 | 0.36 |

### Findings

1. **Starting energy, energy rate, agent cap, gas, refunds and crowding tax do not fix policy balance.**
   Saver's z stays at 0.70–0.79 across all of them. The one exception is starting energy 400 (0.67),
   because everyone can afford a jackpot from the start. Gas of every size and form (flat or
   price-proportional, skip or starve) slightly *reduces* dynamism (Δ −0.006 to −0.042). It mostly
   drains the policies that run many agents, so saver's few big agents are untouched. Refunding gas on
   uniqueness failures recovers what gas loses (refund = 1: Δ −0.003). A full refund is the right choice
   if gas is used at all, but gas buys nothing here.
2. **Agent lifetimes raise dynamism but make saver *stronger*.** A fixed 60 s lifetime gives the
   largest single dynamism gain (Δ +0.044 ± 0.018). Held accelerating climbs go from 2.4 to 3.9 per 100 s,
   and tau25 falls from 0.66 to 0.50, so early standings matter less. But saver's z rises to 0.85,
   because agents that expire hurt the many-cheap-agents policies most. Half-lives of 30–60 s behave
   the same way. Charges per attempt act like a lifetime. Commit charges of 10–30 kill the world
   (Δ −0.12 at 10). **100 commit charges** is the only setting that improves both dynamism
   (Δ +0.031 ± 0.017) and leaves balance unchanged (z saver 0.74, range 0.40).
3. **Two knobs reduce saver's edge, and both act on the jackpot price ratio.**
   - **Energy cap 30** (bank at most 30): z saver falls to 0.61 [0.53, 0.70], range 0.25, and lead
     changes late in the game go from 11.3 to 14.0. But Δdyn2 is −0.045 ± 0.016. Without banking, no one
     buys a big program, so climbs fall from 2.36 to 1.98. A cap of 60 or 120 does nothing, because
     saver's threshold is 60.
   - **Cost scale 0.25** (everything 4× cheaper in energy): z saver 0.61 [0.54, 0.69], range 0.25, and
     **Δdyn2 +0.014 ± 0.014**. Jackpots become affordable to every policy, so the advantage of
     banking disappears. The world fills with agents (156 live on average, against 58), and each
     agent's useful life is slightly shorter (0.65 against 0.71).
   - Cost scale 2–4 also narrows the range, because nobody can afford much, but dynamism collapses
     (Δ −0.05 to −0.11).
4. **Stagnation never appears.** `stagnation_frac` is ≥ 0.96 everywhere except the commit-charge
   settings that starve the world.

5. **Income loops: earned income helps, without runaway.**
   - `income_own` pays energy per bit of surprisal the owner's own agents gain it. It raises dynamism
     *and* balances policies: at 0.5, Δ +0.029 ± 0.015 and z saver 0.62; at 1.0, Δ +0.034 ± 0.017 and
     z saver 0.58 [0.51, 0.67], range 0.23.
   - It does **not** create runaway leaders.

     | | today | `income_own` 0.25 | 0.5 | 1.0 |
     |---|---|---|---|---|
     | leader's final share | 0.40 | 0.41 | 0.41 | 0.41 |
     | P(leader at 25% wins) | 0.76 | 0.73 | 0.76 | 0.73 |
     | lead changes per game | 13.6 | 13.3 | 14.8 | 15.2 |

     Income is unequal (Gini 0.47–0.49), but extra energy has diminishing returns: each extra agent gets
     a 1/A share of the picks, and its work is overwritten by everyone else's. The mechanism is the same as
     `cost_scale` 0.25: energy becomes plentiful, so every policy can afford big programs, and banking stops
     paying. Live agents grow from 58 to 139–163, and unspent energy rises to 37–49%: income arrives faster
     than the simulated policies spend it.
   - `income_any` (every god earns from every commit that raises its surprisal, whoever made it) behaves
     similarly but more weakly: Δ +0.016 and z saver 0.59 at 0.25. It doesn't produce cooperative spirals
     either: held climbs fall from 2.36 to 1.86.
   - `income_tilt` (redistributing the fixed income by standings, ±1) has no measurable effect on
     anything: Δdyn2 within ±0.012, z saver 0.75–0.78. Base income is too small a lever relative to the
     starting bank and to how little the standings depend on energy. *Policy-dependent caveat:* human
     players might push harder on a pro-leader tilt. At k = 1 the late lead changes do drop from 11.3 to 9.3.

## 4. Time-split price versus all-at-summon

The time-split price was proposed in a discussion with the user. **Summon** pays the description terms: agent
base, tool naming, parameter description of every step and of the guard, and the ratchet surcharge.
**Each committed application** pays erasure + motion + measurement (`econ_sim.split_terms`). The two parts
sum exactly to `Program.cost`. On Grid(5,base10,rgby) the median library program is 20 description bits
plus 13 per-application bits. At the 90th percentile it is 38 + 60, because whole-grid jackpots carry most
of their price per application. An owner who cannot pay idles: the pick is skipped. Two choices
were left open:
- whether failed or duplicate attempts are charged: `split_fail` 0 (free, the default) or 1;
- whether policies anticipate the running cost: `aware`.

`split_scale` multiplies the per-application part. At scale 1, a god whose agents commit about 20 times
per second would owe about 260 energy/s against an income of 1/s.

| setting | n | Δdyn2 [95% CI] | dyn2 | lead chg late | crossings | held climbs | tau25 | live agents | useful-life | unspent | z random | z greedy | z saver [CI] | z coop | range |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| old | 80 | +0.000 ± 0.000 | 0.570 | 11.3 | 2.71 | 2.36 | 0.66 | 58 | 0.71 | 0.13 | 0.37 | 0.51 | 0.72 [0.65, 0.80] | 0.40 | 0.36 |
| pexp=1.25 | 80 | -0.018 ± 0.015 | 0.551 | 11.1 | 2.81 | 2.10 | 0.65 | 61 | 0.70 | 0.14 | 0.40 | 0.50 | 0.73 [0.66, 0.80] | 0.37 | 0.36 |
| pexp=1.5 | 80 | -0.032 ± 0.018 | 0.537 | 11.4 | 2.99 | 2.22 | 0.65 | 64 | 0.70 | 0.16 | 0.37 | 0.55 | 0.70 [0.63, 0.78] | 0.38 | 0.34 |
| pexp=2.0 | 80 | -0.065 ± 0.018 | 0.505 | 13.7 | 3.08 | 1.56 | 0.67 | 68 | 0.70 | 0.17 | 0.35 | 0.54 | 0.70 [0.62, 0.77] | 0.42 | 0.35 |
| split=1.0 | 80 | -0.200 ± 0.025 | 0.370 | 11.5 | 2.16 | 0.03 | 0.44 | 28 | 0.17 | 0.01 | 0.40 | 0.44 | 0.67 [0.59, 0.75] | 0.49 | 0.27 |
| split=0.1 | 80 | -0.118 ± 0.022 | 0.451 | 11.2 | 2.60 | 0.57 | 0.71 | 28 | 0.37 | 0.00 | 0.44 | 0.44 | 0.74 [0.68, 0.80] | 0.38 | 0.36 |
| split=0.03 | 80 | -0.049 ± 0.020 | 0.521 | 12.8 | 2.81 | 1.68 | 0.68 | 28 | 0.52 | 0.00 | 0.37 | 0.51 | 0.68 [0.62, 0.76] | 0.44 | 0.31 |
| split=0.01 | 80 | -0.007 ± 0.013 | 0.562 | 13.3 | 2.77 | 2.24 | 0.67 | 29 | 0.66 | 0.00 | 0.38 | 0.54 | 0.66 [0.59, 0.73] | 0.42 | 0.28 |
| split=0.003 | 80 | +0.007 ± 0.015 | 0.577 | 13.3 | 2.96 | 1.90 | 0.67 | 33 | 0.74 | 0.02 | 0.38 | 0.50 | 0.72 [0.66, 0.78] | 0.40 | 0.34 |
| splitfail=0.03 | 80 | -0.068 ± 0.023 | 0.502 | 11.7 | 2.94 | 1.24 | 0.59 | 28 | 0.48 | 0.00 | 0.41 | 0.48 | 0.65 [0.58, 0.73] | 0.46 | 0.24 |
| splitfail=0.01 | 80 | -0.022 ± 0.016 | 0.547 | 13.5 | 2.64 | 1.82 | 0.74 | 28 | 0.64 | 0.00 | 0.40 | 0.51 | 0.69 [0.62, 0.77] | 0.40 | 0.30 |
| splitaware=0.03 | 80 | -0.079 ± 0.017 | 0.491 | 15.4 | 3.17 | 1.24 | 0.65 | 30 | 0.66 | 0.02 | 0.39 | 0.50 | 0.66 [0.58, 0.74] | 0.45 | 0.27 |
| splitaware=0.01 | 80 | -0.017 ± 0.014 | 0.552 | 12.4 | 2.92 | 1.88 | 0.65 | 31 | 0.73 | 0.03 | 0.36 | 0.52 | 0.71 [0.64, 0.78] | 0.41 | 0.35 |

(`split=x` is per-application scale x with free failures. `splitfail` charges failures. `splitaware` gives
policies the total-cost-of-ownership estimate. Convex pricing `pexp` is shown for contrast.)

**Results, on the same 80 paired games as every other setting:**

- **Unscaled (`split_scale` = 1), the world nearly freezes.** dynamism2 falls by 0.20 ± 0.03, and held
  accelerating climbs fall from 2.36 to 0.03 per 100 s. Useful-life drops to 0.17: agents sit idle waiting
  for energy. Running costs absorb all income (unspent 1%). The policy range narrows (0.27) only because
  every policy is equally starved. The second-law reasoning (per-application terms bound the surprisal
  one application can create) is sound, but at 1 energy/s it makes acting roughly 10× too expensive for
  a lively game.
- **Scaled to 0.01 it is nearly neutral on dynamism and mildly balancing.** Δdyn2 is −0.007 ± 0.013.
  Saver's z falls from 0.72 to 0.66 [0.59, 0.73], range 0.28, and late lead changes rise from 11.3 to 13.3.
  It still balances less than `cost_scale` 0.25 or energy cap 30 (both 0.61), and the CIs overlap. At
  0.003 it is indistinguishable from all-at-summon pricing.
- **Charging failed and duplicate attempts** (`split_fail` = 1) balances a little more (range 0.24 at 0.03)
  but costs dynamism (−0.068 at 0.03, −0.022 at 0.01). **Leave failures uncharged.** This is the same
  lesson as the gas refunds in §3.
- **Aware policies** help neither dynamism nor balance. The effect of the split comes from energy becoming the
  binding constraint on *activity*, not from smarter summoning.
- **Mechanism, policy-independent.** Under the split, a god's rate of change in the world is bounded by
  its income divided by the per-application price. Agent *count* matters less: live agents fall from 58 to
  about 28, and nobody keeps energy unspent. Jackpots become dear per use, which is why saver's edge shrinks.
  The bound is fair, but at any scale where it binds hard, the world slows down.

**Verdict on time-split versus all-at-summon.** At a per-application scale of about 0.01 the split is a
mild improvement: balance gets better and dynamism is unchanged within noise. At full scale it is far too
static. It does not beat the simpler price-ratio fixes in §3 and §5. For the successor design
(per-agent energy with pointwise act costs, on `claude/gridlab-agent-energy`), these rows give the
paired baseline: same spec seeds, same 80 games.


## 5. Combinations

COMBO_SECTION

## 6. Held-out validation and recommendation

VALIDATION_SECTION

## 7. What depends on the simulated policies

- **Policy-independent (mechanical):**
  - Agents never become less useful with age under this churn.
  - Each agent's share of applications falls as 1/A.
  - Gas and the agent cap limit how *many* agents a god runs, not how *big* they are.
  - A cap on banked energy, a lower cost scale and the time split each change the price ratio between
    big and small programs.
  - Lifetimes and charges change the turnover of the population.
- **Policy-dependent:**
  - which policy wins (saver's banking-and-selectivity heuristic);
  - the size of each effect on z;
  - whether policies respond to running costs at all. Non-aware policies ignore gas, which is why the
    `aware` variants are reported for the split.

  Human players would surely learn the jackpot strategy faster than these heuristics do, so the
  jackpot price imbalance is the robust finding. Exactly how much saver wins is not.
