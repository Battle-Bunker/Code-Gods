# Realistic simulated players: strategies, tournaments and what survives a change of player model

Topic: players. Code: `gridlab/explore/players/`. Raw tables from every run: `docs/explore/players_results/`.

**Shared modules changed: none.** New policies register into `gridlab.policy.POLICIES` at import
(`import gridlab.explore.players`), so any `GameConfig(policies=[...])` can use them by name.

## 0. Summary

1. **Being selective dominates.** The engine's `saver` is the only strategy no other strategy can
   invade on all three GridTypes tested. It invades every other field, and replicator dynamics
   converge to it (§3). The ingredient that matters is the **quality bar**: accept a candidate only if
   its yield is at least the 75th percentile of your own past best yields. Saving up without the bar
   (`k32_save`) is worse than saver. The bar without saving (`k32_bar`) is as good as saver. Sampling
   32 candidates instead of 12 adds nothing (`k12_saver` ≈ saver) (§4). So the earlier "saver won
   19/40" is not an artefact. `greedy_private` is a poor player: it buys every positive-yield program
   it sees, so it fields about 18 cheap agents where a selective god fields about 7 dearer ones at
   ~37 bits each.
2. **Is it degenerate?** Partly. One simple strategy dominates. No economy knob tested removes its
   advantage: erasure ×1.5, global scope ×2, cost scale ×0.5 or ×2, agent half-life 120 s, and a
   metabolic cost (§6). However, the dominant strategy produces *better* games. All-saver populations
   have the highest dynamism2 (0.56 vs 0.46 greedy), about 3× the significant-tension rate and about
   10× the welfare. The cost is that 20–30% of all energy goes unspent.
3. **The learners work but do not win.** A ridge regression of peer surprisal on 31 generic grid
   features predicts 16–33% (median, out of sample) of the variance in observed ΔS₋ᵢ. A mutator
   bandit, a copycat that infers others' mutator types from public grid diffs, and a hill-climbing
   two-ply planner all run inside the disclosure rules. None improves rank over the same timing rule
   without learning. Every learner, the planner and the copycat beats greedy by more when it uses
   saver timing (mean z ≈ 0.9 vs 0.73 in a greedy field), but none beats saver itself (Δz ±0.10,
   n.s.) (§4). The aggregate peer signal is learnable enough to leak information, yet not enough to
   matter for ranks.
4. **Parasites lose.** A bijection-only "stealing" strategy is invaded by everything, on every
   GridType. A parasite population has the lowest dynamism2 of any (0.31–0.34). Bijections are
   coalition currency, not a winning strategy on their own. This holds under the current bit costs.
5. **Cheap talk is welfare-improving and strategically neutral.** All public announcements leave
   invasion fitness within ±0.13, and only one cell of 56 is significant. That includes truthful
   goals, colour only, listen-only free-riders, liars, skeptics and α = 0.5 coalitions. Populations
   that announce goals have 2–4× the welfare (talker 6.5k, coalition 12k vs 3.1k), and lying
   lowers it (2.5k). Skeptics catch liars from the public aggregate alone: with three liars only
   0.25 of 3 partners stay trusted. Lying is not profitable, so there is no need to police chat.
6. **Which conclusions hold across player models** (§6–7), from 4 populations × 5 economy settings ×
   60 paired seeds:
   - *Robust:* cost scale moves snapshot tension (+ when cheap, − when dear) and mutator entropy the
     same way in every population. Erasure ×1.5 and agent half-life never significantly change
     dynamism2. Parasite and random populations are the least dynamic.
   - *Player-dependent:* "cheaper agents → higher dynamism2" holds for the engine, greedy and human
     mixes (+0.02 to +0.05*), but not for strong players (−0.003, n.s.). Mutator usage shifts a lot:
     strong players commit overwrites 2–3× more often (motif 0.028 vs 0.008, write_ramp 0.055 vs
     0.017), and greedy players over-use cheap bijections. Family advantage ranks correlate only
     0.44–0.80 across populations on identical deals.
7. **Recommendation for the integrated tuning:** tune against a selective player population, not
   all-greedy. Use the `strong` mix below, or at least `saver`/`k32_bar` alongside greedy. Mutator
   "usefulness" and family fairness measured with greedy players over-weight cheap bijections and
   under-weight jackpot overwrites. See §8 for knob and dealer suggestions.

## 1. The player module

One configurable `SmartPolicy` (`policies.py`) extends the engine's greedy value model
(Δπ = s_i(y)·Ŝ₋ᵢ(y) − s_i(x)·S₋ᵢ(x), averaged over sampled objects, × expected applications / cost)
along independent axes. The defaults reproduce `greedy_private` bit-for-bit (`smart_greedy`), and
`smart_saver` reproduces `saver` (both tested).

| Axis | Option | What it does | Information used |
|---|---|---|---|
| peer model | `fixed` | Ŝ₋ᵢ(y) = S₋ᵢ(x) (engine) | – |
| | `ridge` | online ridge regression of S₋ᵢ on 31–37 grid features (counts, clumping, runs, symmetry, order, sums; `features.py`) over all visible objects; predicts S₋ᵢ(x) + g·w·(φ(y)−φ(x)), g = own out-of-sample skill on observed changes | public grids + own aggregate |
| | `bandit` | Thompson-sampled mean ΔS₋ᵢ per commit of each mutator type, from its own agents' commits; also tilts candidate sampling | own agents |
| | `copy` (copycat) | infers the mutator types behind every public grid change from a diff signature (`diff_signature`, learned on practice applications), credits them with the observed ΔS₋ᵢ, and samples toward what raised others' surprisal | public grids + aggregate |
| search | `climb`, `rounds` | hill climbing with `program.neighbour` from the best candidate | own |
| | `lookahead=2` | also scores re-application P(P(x)) and the interaction with one of its own agents Q: [π(Q(P(x)))−π(P(x))] − [π(Q(x))−π(x)] | own |
| candidates | `afford` | sample K among programs affordable now | own |
| | `bij_only` (parasite) | only unguarded bijective programs | – |
| timing | `save_fraction`, `q`, `burst` | wait for energy ≥ f·E₀; accept only yields ≥ the q-quantile of its own past best yields; summon up to n per decision | own |
| cheap talk | `chat="goal"/"colour"`, `announce=True/"lie"`, `listen`, `trust="skeptic"`, `coalition=α` | public channel (`world._players_chat`). Goal: family + params, which listeners evaluate exactly because the catalogue is public. Colour: listeners model the announcer by a binomial colour-count rarity. Skeptics drop announcers whose claimed s_j exceeds the observed aggregate or whose claimed changes do not correlate with ΔS₋ᵢ. Coalition adds α·Δπ_j of announced partners | public chat |

Presets: `policies.PRESETS` (first round) and `extra.EXTRA` (saver-timed learners, timing variants).
`make_preset(name, **options)` registers new combinations. Diagnostics (ridge skill, partners
trusted, climb improvements) are in `world._players[god].summary()`, and the tournament stores them
per god.

Experiment drivers (all cached under `.cache/explore_players/`, parallel, with common random numbers:
the same seed gives the same deal, seats, spawns and game length under every policy assignment):

```
python3 -m gridlab.explore.players.prep --types "5,base10,rgby;4,base12,rgb;6,cards,rainbow6" --seeds 0:300
python3 -m gridlab.explore.players.invasion --types 5,base10,rgby --seeds 0:20 \
    --strategies random,greedy_private,saver,k32,burst,afford,ridge,bandit,copycat,planner,parasite
python3 -m gridlab.explore.players.invasion --types 5,base10,rgby --seeds 0:20 \
    --strategies afford,talker,listener,liar,skeptic,coalition,colour_talker,colour_liar
python3 -m gridlab.explore.players.invasion --types "4,base12,rgb" --seeds 0:16 \
    --strategies random,greedy_private,saver,k32_bar,afford,ridge,planner,parasite      # and 6,cards,rainbow6
python3 -m gridlab.explore.players.invasion --types 5,base10,rgby --seeds 0:20 \
    --strategies greedy_private,saver,k32_bar,k32_save,k12_saver,save30,save90,bar90,saver_ridge,saver_bandit,saver_copycat,saver_planner,saver_afford,saver_parasite \
    --incumbents greedy_private,saver,burst
python3 -m gridlab.explore.players.invasion ... --knobs '{"erase": 1.5}'   # economy variants, §6
python3 -m gridlab.explore.players.egta --types 5,base10,rgby --seeds 0:8 \
    --strategies random,greedy_private,saver,k32_bar,afford,parasite
python3 -m gridlab.explore.players.robust --types 5,base10,rgby --seeds 0:60 \
    --populations engine,greedy,strong,human --settings base,cheap,dear,erase15,halflife
python3 -m gridlab.explore.players.test_players
```

Setting: the engine defaults at the real engine's 100 Hz (`experiments.common.BASE`, setting "old"),
4 gods, exponential game length (half-life 300 s), `distinct` dealer. About 5–9 CPU-s per game.
z = (G − rank)/(G − 1): 0.5 is average, 1 is a win. **Invasion fitness** I[s, t] = mean over
seeds of z(one s in a field of three t) − z(a t god in the all-t game at the same seat and seed).
It is paired, so deal luck cancels. CIs are percentile bootstraps over seeds; * marks a 95% CI
that excludes 0. In total about 11,000 games.

## 2. A finding about the engine's greedy player

With the default economy, most greedy decisions can afford only 1–4 of their K = 12 sampled
candidates. The value model therefore rarely changes the choice, and the only real decision is
accept or reject. In a 300 s game, swapping greedy's peer model for the ridge model changed the
argmax in 0 of 38 decisions. This is why "more candidates" (`afford`, `k32`) and "when to accept"
matter far more than how well a candidate is valued.

## 3. Round robin on three GridTypes

Grid(5,base10,rgby), 20 seeds per cell (2,420 games). Invasion fitness, rows = mutant, cols = field:

| mutant \ field | random | greedy | saver | k32 | burst | afford | ridge | bandit | copycat | planner | parasite |
|---|---|---|---|---|---|---|---|---|---|---|---|
| random | · | -0.15* | -0.25* | -0.10 | -0.08 | -0.10 | +0.02 | -0.10 | -0.12 | -0.07 | +0.15 |
| greedy_private | +0.13 | · | -0.23* | -0.00 | -0.05 | +0.07 | +0.07 | +0.12* | -0.02 | -0.05 | +0.32* |
| **saver** | +0.30* | +0.07 | · | +0.27* | +0.28* | +0.17* | +0.30* | +0.23* | +0.20* | +0.13* | +0.35* |
| k32 | +0.10 | -0.12* | -0.22* | · | -0.07 | +0.03 | +0.17* | +0.08* | -0.03 | +0.00 | +0.28* |
| burst | +0.17* | +0.13* | -0.18* | +0.13 | · | +0.15 | +0.37* | +0.15* | +0.18* | +0.05 | +0.30* |
| afford | +0.10 | -0.15 | -0.13* | -0.10 | -0.07 | · | +0.02 | -0.08* | -0.07 | -0.05 | +0.23* |
| ridge | +0.12 | -0.20* | -0.20* | -0.10 | -0.10 | +0.03 | · | -0.08 | -0.10* | -0.10 | +0.27* |
| bandit | +0.08 | -0.08 | -0.17* | -0.03 | -0.13* | -0.03 | +0.00 | · | -0.12* | -0.03 | +0.23 |
| copycat | +0.02 | -0.07 | -0.25* | -0.12 | -0.13* | -0.03 | +0.00 | -0.00 | · | -0.03 | +0.18 |
| planner | +0.12 | -0.10 | -0.17* | -0.03 | -0.03 | -0.10 | +0.12* | -0.05 | -0.10 | · | +0.25* |
| parasite | -0.07 | -0.20* | -0.27* | -0.08 | -0.13* | -0.12 | -0.05 | -0.12 | -0.28* | -0.20* | · |

Only saver is uninvaded. Pairwise replicator dynamics: 100% saver.

Grid(4,base12,rgb) and Grid(6,cards,rainbow6), 16 seeds per cell (1,024 games each), 8 strategies.
Uninvaded at 95%: greedy_private, saver and k32_bar on both. Replicator end state: saver 1.00
(4,base12,rgb); saver 0.71 + k32_bar 0.29 (6,cards). Saver as a mutant: +0.25* vs parasite and +0.08
to +0.21 (n.s.) elsewhere on 4,base12,rgb; +0.33* to +0.44* vs everything except greedy (+0.15) and
k32_bar (+0.10) on 6,cards. Full tables: `players_results/inv_4b12.md`, `inv_6cards.md`.

Per-god mechanics on Grid(5,base10,rgby) (medians over all round-robin god-slots):

| policy | agents | bits / agent | spent | own gain | loss inflicted on others | final mean own s |
|---|---|---|---|---|---|---|
| greedy_private | 18.5 | 20 | 354 | 2.2k | 3.7k | 1.51 |
| saver | 7 | 37 | 244 | 4.6k | 6.9k | 3.33 |
| burst | 10 | 34 | 338 | 3.5k | 6.0k | 2.26 |
| ridge / bandit / copycat / planner | 22–25 | 15–16 | ~373 | 1.8–2.7k | 2.8–4.0k | ~1.47 |
| parasite | 27 | 13 | 362 | 1.4k | 2.2k | 1.14 |

Selective gods buy fewer, dearer, high-erasure programs. Each agent gets the same share of
applications whatever it cost, so a jackpot overwrite that locks a whole object every time it fires
out-earns several cheap tweaks. The tweaks are then undone by everyone else's agents.

### Evolutionary analysis (heuristic payoff table)

All 126 compositions of 4 gods from {random, greedy_private, saver, k32_bar, afford, parasite}, 8
seeds each (1,008 games), Grid(5,base10,rgby). Payoff to a strategy in the uniform mix: saver 0.69,
k32_bar 0.68, greedy 0.51, afford 0.45, random 0.35, parasite 0.31. Replicator dynamics from 40
Dirichlet starts all end at **100% saver** (Nash regret 0.000). Over 30 seed bootstraps, saver is
the largest share 28 times and k32_bar 2 times. EGTA_STRONG_PLACEHOLDER

## 4. What makes saver strong (attribution) and do learners add anything?

Grid(5,base10,rgby), 20 seeds per cell. Δz vs the incumbent, and mean z of the mutant:

| mutant | what it changes vs saver | I vs greedy field | I vs saver field | z in burst field |
|---|---|---|---|---|
| saver | (K 32, save 60%, bar q 0.75) | +0.07 | · | 0.78 |
| k32_bar | no saving | +0.18* | +0.02 | 0.63 |
| k32_save | no bar | +0.02 | **−0.12*** | 0.60 |
| k12_saver | K = 12 | +0.18* | +0.00 | 0.63 |
| save30 / save90 | save to 30% / 90% | +0.18* / +0.17 | −0.05 / −0.02 | 0.58 / 0.67 |
| bar90 | bar at the 90th percentile | +0.07 | −0.03 | 0.60 |
| saver_ridge | + learned peer model | +0.10 | +0.02 | 0.78 |
| saver_bandit | + mutator bandit | +0.20* | −0.05 | 0.65 |
| saver_copycat | + social learning | +0.25* | −0.02 | 0.63 |
| saver_planner | + hill climbing, two-ply | +0.23* | +0.03 | 0.75 |
| saver_afford | + affordable-only candidates | +0.25* | +0.10 | 0.62 |
| saver_parasite | bijections only | −0.20* | −0.27* | 0.38 |

The bar is the active ingredient. The savings threshold, K and the bar's exact quantile matter
little. Adding learning or planning on top of a good timing rule makes a strategy beat greedy more
clearly, but it never beats saver by a significant margin. HELDOUT_PLACEHOLDER

Learnability of the hidden information: ridge out-of-sample skill (1 − SSE/SST on observed object
changes) has median 0.22 (IQR 0.08–0.43) on Grid(5,base10,rgby), 0.33 (0.17–0.55) on
Grid(4,base12,rgb) and 0.16 (0.07–0.33) on Grid(6,cards,rainbow6). It is positive in 92–100% of
games. Generic features therefore recover a real part of the others' aggregate preferences
(colour clumping, symmetry and order are shared by many families). This is a leak of the "see only
the aggregate" rule, but a modest one.

## 5. Cheap talk

Grid(5,base10,rgby), 20 seeds, 8 strategies (all on `afford` candidate search). Invasion fitness is
in ±0.13 everywhere, and only one cell is significant (listener in a coalition field −0.13*).
Pairwise replicator: coalition 0.62, colour_talker 0.28, small liar and skeptic shares. That is a
weak, noisy preference and should not be read as a result. Homogeneous populations:

| population | dynamism2 | welfare | climbs held accel / 100 s | crossings / pair / 100 s |
|---|---|---|---|---|
| afford (silent) | 0.457 [0.411, 0.505] | 3131 [1429, 5107] | 0.49 | 3.46 |
| talker (announce goal + listen) | 0.496 [0.438, 0.557] | 6465 [2024, 12632] | 0.97 | 3.57 |
| skeptic | 0.500 [0.441, 0.561] | 6222 [2039, 11688] | 0.99 | 3.51 |
| coalition (α = 0.5) | 0.484 [0.422, 0.550] | 12117 [2158, 25277] | 1.11 | 2.71 |
| liar | 0.443 [0.391, 0.493] | 2450 [1113, 4054] | 0.55 | 3.77 |
| colour_talker | 0.437 [0.388, 0.488] | 2271 [1056, 3892] | 0.51 | 3.89 |

Announcing goals roughly doubles the rate of held accelerating climbs (cooperative spirals), which
is what the user asked for. It also lowers leaderboard crossings when gods go full coalition.
Announcing only a colour is too coarse to help. Skeptic detection, from the aggregate only:
distrusted announcers per skeptic are 0.41 with no liar present (false alarms, out of 2.6 partners),
1.5 with one liar and 2.75 of 3 with three liars.

## 6. Does saver's dominance depend on the economy?

Grid(5,base10,rgby), 20 seeds, strategies {greedy_private, saver, burst, planner}. Saver's invasion
fitness against the greedy field and whether anything invades saver:

| setting | saver vs greedy field | anything invades saver? | dynamism2 all-greedy → all-saver |
|---|---|---|---|
| base | +0.07 (+0.23* the other way) | no | 0.46 → 0.56 |
| erase ×1.5 | +0.35* | no | 0.41 → 0.57 |
| global scope ×2 | +0.28* | no | 0.47 → 0.55 |
| cost scale ×2 | +0.18* | no | 0.45 → 0.52 |
| cost scale ×0.5 | +0.13 | no | 0.51 → 0.56 |
| agent half-life 120 s | +0.25* | no | 0.47 → 0.57 |
| metabolic 0.02/application | +0.28* | no | 0.44 → 0.54 |

Selectivity wins under every economy tried. Dearer erasure, dearer global scope, finite agent
lives and per-application costs all *widen* its edge, because each of them makes junk agents
costlier. Tuning the economy against greedy players is therefore tuning against a player nobody
good would be.

## 7. Which ecosystem conclusions survive a change of player model?

Grid(5,base10,rgby), 60 paired seeds per cell. Populations: `engine` = random/greedy/saver/omniscient
(the coordinator's mixed baseline); `greedy`; `strong` = saver/k32_bar/burst/saver_ridge/saver_planner;
`human` = talker/bandit/random/afford/copycat/listener. Paired Δ vs base:

| setting | metric | engine | greedy | strong | human |
|---|---|---|---|---|---|
| cost ×0.5 | dynamism2 | +0.024* | +0.049* | −0.003 | +0.028* |
| cost ×0.5 | snapshot tension | +0.051* | +0.066* | +0.056* | +0.036* |
| cost ×0.5 | mutator entropy | +0.062* | +0.073* | +0.042* | −0.005 |
| cost ×2 | dynamism2 | −0.045* | −0.025* | −0.009 | −0.056* |
| cost ×2 | snapshot tension | −0.092* | −0.055* | −0.133* | −0.078* |
| cost ×2 | mutator entropy | −0.099* | −0.088* | −0.078* | −0.188* |
| cost ×2 | held accelerating climbs | +0.02 | −0.07 | **+0.32*** | +0.02 |
| erase ×1.5 | dynamism2 | −0.003 | −0.016 | +0.002 | −0.024 |
| erase ×1.5 | steal rate | −0.007* | −0.003* | −0.021* | −0.004* |
| half-life 120 s | dynamism2 | +0.008 | +0.012 | +0.016 | −0.006 |

Base levels: dynamism2 engine 0.52, greedy 0.48, **strong 0.57**, human 0.47. Strong players also
have twice the snapshot tension (0.40 vs 0.19) and twice the durable per-object lead changes (1.28
vs 0.57 per object per 100 s).

Robust across player models: the sign of the cost-scale effect on tension, mutator entropy and
steals; erasure ×1.5 and the half-life are dynamism-neutral; erasure ×1.5 reduces steals.
Player-dependent: whether cheap agents raise dynamism2 (not for strong players), and whether dear
agents produce more cooperative climbs (only strong players).

Mutator usage (share of committed applications, base): greedy and human players over-use cheap
bijections (turn_block 0.149, shift_line 0.123, reverse_line up to 0.213). Strong players spread
their commits much more evenly over overwrites: write_ramp 0.055 vs 0.017, paint 0.049 vs 0.021,
stamp 0.045 vs 0.027, paint_by_key 0.038 vs 0.015, motif 0.028 vs 0.008. Any "mutator X is
useless" conclusion drawn from greedy simulations is suspect for overwrite mutators. Full table:
`players_results/robust_5b10.md`.

Family advantage: Spearman correlation of policy-adjusted family mean z between populations on the
same 60 deals is 0.80 (engine–greedy), 0.75–0.76 (strong vs engine or greedy) and 0.44–0.66 (human
vs others), over 25 families with ≥ 4 god-slots. A within-population split-half on half the data is
too noisy to give a reliability ceiling (−0.06 to 0.29, 15 families). Treat "family X is
advantaged" conclusions as roughly, not exactly, transferable between player models, and least
transferable to noisy human-like play.

## 8. Recommendations

1. **Simulated players for tuning** (for the coordinator's integrated search): replace or augment
   the `engine` mix with a selective mix. Concretely use `saver`, `k32_bar` and `saver_planner` (and
   keep `greedy_private` as a weak-player check). Report conclusions only if they hold for both the
   greedy and the strong mix (§7 shows which ones do).
2. **Economy:** no knob tested makes greedy competitive, and none should be tuned for that.
   Erasure ×1.5 cuts steals in every population without costing dynamism; consider it if
   theft-by-bijection is a design worry. Avoid cost scale ×2: it lowers tension and mutator variety
   in every population.
3. **Unspent energy (20–35% with selective players)** is the visible symptom of the dominant
   strategy. If idle energy is unwanted, a planning-phase or late-game nudge (for example energy
   that decays above a cap) is the natural lever. This was not tested here.
4. **Chat:** keep it public and unmoderated. Goal announcements raise welfare and cooperative climbs,
   lies do not pay, and skeptical listeners can verify claims against the per-object aggregate.
   Consider surfacing an "announce your goal" button for kids: it is the cheapest route to the
   cooperative spirals the design wants.
5. **Bijections:** a pure-bijection parasite strategy is the worst strategy and gives the dullest
   games. Bijective pricing does not need to be raised to stop theft. If anything, bijections are
   under-used by strong players, which is fine for their coalition-currency role.

## 9. Caveats

- Policy-dependent findings (§3–6) come from these specific policies. Policy-independent findings
  are the learnability of S₋ᵢ from grid features (it depends on families, not policies) and the
  greedy affordability bottleneck (it is a property of K, costs and energy).
- Rank z with 4 gods is coarse. With 16–20 seeds per cell, a CI on Δz is about ±0.15. Cells marked *
  are individually significant, with no multiple-comparison correction across the 121-cell matrix
  (so expect about 6 false positives there). Saver's row is significant in 9 of 10 cells (all positive).
- The pairwise replicator in `invasion.py` is an approximation (one mutant among three
  incumbents). The full composition-table EGTA (`egta.py`) agrees on the 6-strategy subset.
- Learners might do better with longer games or richer features, and the copycat's diff signature
  is coarse. Humans also read structure in grids that these features miss.
