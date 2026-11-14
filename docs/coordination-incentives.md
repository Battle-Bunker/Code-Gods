# Coordination incentives: what is the best way to play, and is it the careful play we want? (2026-11-11)

Status: measurement and recommendation. The model and its runner are on `develop`
(`lib/game-utilities/scripts/coordination-lib.ts`, `coordination.ts`, unit-tested in
`lib/game-utilities/test/coordination.test.ts`). What is built in the engine is listed in §8.

**Read this first: the tables are one economy behind.** Every number below was measured on `develop` as of #283
(the eight beginner rules, the 30 s capacity, a cap of 4 offers a second per agent, offers free). While this was being
merged, `develop` dropped the 4 Hz cap and made every offer a small read (docs/energy-model.md §7, §7.1). The model
follows the new rules by default (`--cap 4 --free-offers` gives the old ones) and its tests pass, but the report has
**not** been re-run under them, and the engine validation games were played under the old ones. Re-run
`coordination report` before relying on a number here.

The owner's aim: looking and computing should be much cheaper than changing, so that "more complex coordination
strategies that carefully change objects towards one's goals without breaking the interests of other Gods" are
rewarded, and "choosing not to mutate after analysing a board" is a good use of energy.

The question: under the game's actual rules, what is the best way to play, and is it that careful, coordinating play?
If not, what is the smallest principled change that makes it so?

## 1. The answer

1. **For points, the best way to play is the careful play the owner wants.** "Read the board, make the one change that
   most raises my bits × the others' bits, otherwise skip" (`payoff`) is the best response to almost every table, and a
   table of three such players is an equilibrium and the richest table: 90k points against 45k for three greedy
   players, 10k for three spoilers and 0.6k for three blind ones. Those agents skip 75% of their opportunities: not
   mutating after looking is how they play.
2. **For winning (rank), it is not.** At that table one player who switches to plain greedy on its own rule wins 56%
   (it free-rides on the others' building) and a spoiler wins 50%, although each earns *fewer* points than by staying
   (29.9k and 20.9k against 30.1k). Among players who only want to finish first the equilibrium is two greedy and a
   spoiler, with a fifth of the points (19k). One spoiler cuts a careful table from 90k to 58k and beats two "never
   hurt anyone" cooperators 94% of the time.
3. **No way of adding up the others' bits fixes it** (smallest other, geometric mean: the spoiler gets stronger), nor
   does scoring the time-average. Helping another god always helps that god more than the helper; that is arithmetic of
   own × others, not a tuning problem.
4. **The one rule that helps is "breaking costs extra"**: a change pays for the bits of the object's total value it
   destroys. At 3 bits of work per bit destroyed the spoiler is never a best response (13–25% wins at every table,
   81% → 13% against greedy) and the win-seekers' equilibrium is three greedy players (38k, twice today's). It does not
   make careful play the winning play (greedy still wins 44% at a careful table), and it only works when charged on the
   object's exact value: charged on the noisy value players are shown (σ = 8 bits) it is a random tax.
5. **Recommendation.** Nothing is switched on for the default setup: no candidate makes careful play the equilibrium
   for players who play to win, and the evidence is 16 games a table. The cheapest real fix is not in the physics: say
   that a player's result is their points (a season total, a personal best), not their rank in the room, because every
   policy that wins by rank does it by earning less. Time-averaged scoring is worth building next for a separate
   reason: under end-of-game scoring a player who saves energy and wrecks the last 30 s wins 69% at a careful table
   even with the 30 s capacity, and 6% when points are averaged over time.

Seat order: the real tick has no turns and no first-seat advantage (§2).


## 2. The model

One command re-runs everything in this document when the economy changes again (about 90 minutes on 4 cores; `--only`
picks sections, each prints its own Markdown):

```
pnpm --filter @workspace/game-utilities coordination report --games 16 --duration 240 --agents 3 --out /tmp/coordination
pnpm --filter @workspace/game-utilities coordination validate        # the model against the recorded engine games
```

**What is real.** The board (4×4 digits), spawns and one-cell writes; the default setup's own dealer and rule pool
(`settings.utilitySelectorId`, the eight beginner rules); each rule's shipped calibration table plus hold rarity's
correction for the number of players (`scripts/hold.ts`, the table the engine computes at the start of a game);
game-core's payoff, energy and selection (`settleAgentEnergy` with the capacity, `pickByEnergy`, the 4 Hz cap,
`chargeAct`, `changeCost`); the read price; and the setup's power, rates, duration, spawn rate and capacity, read from
`SEED_SETUPS` at run time. So when a sibling change lands in game-core or in the seed setups, the report picks it up.

**The tick order** is copied from `artifacts/engine/convex/engine/tick.ts`. There are no turns. `interactionRateHz`
opportunities per world second, evenly spaced; each picks an object uniformly, then one agent among those with positive
energy that were not offered an opportunity in the last quarter second, with probability proportional to its energy;
the act is applied at once (the engine runs acts in waves but applies them strictly in opportunity order). A skip pays
its reads. A change pays reads plus W + βW². An opportunity nobody can take passes, with no debt.

**What is modelled.** An agent is a native function that does what a small agent program does (try one-cell writes,
keep the best, or skip). Policies that use the other gods' rules are given them exactly, after `learnSeconds`
(0 by default; §6 varies it). Agents try a random 24 of the 144 writes per act (the `exhaustive` section tries all).
The futility memo is left out: these policies skip, they do not fail. Games are 240 s, not 600 s, to afford the number
of tables (the `length` section runs 600 s).

**Validation against the real engine.** `artifacts/engine/scripts/coordination-games.ts` played 12 real games of 240 s
on a local engine with scripted Python agents (random, and greedy on the god's own rule), three gods, one agent each
(`scripts/coordination-engine-games.json`). The model played the same deals and policies 8 times each:

| quantity (per agent) | engine | model | model / engine |
|---|---|---|---|
| acts per second, greedy | 3.38 | 3.57 | 1.06 |
| changes per second, greedy | 2.94 | 3.13 | 1.06 |
| energy spent per second, greedy | 53.6 | 56.9 | 1.06 |
| share of energy spent on reading, greedy | 0.11 | 0.10 | 0.99 |
| final points, three greedy gods (18 seats) | 11,480 (sd 5,690) | 11,858 | 1.03 |
| final points, greedy against one random (6 seats) | 5,651 | 5,217 | 0.92 |
| final points, the random god there (3 seats) | 1,254 | 1,127 | 0.90 |
| changes per second, random | 3.07 | 3.22 | 1.05 |
| objects at the end, three greedy | 34.2 | 34.5 | 1.01 |

The 6% in the rates is the local engine under load: it skipped about 5% of world time (the 1.5 s tick window), so
its agents got 3.38 offers a second instead of 25/7 = 3.57. Before hold rarity was added to the model its points were
40% low; that is the one thing the abstract harnesses of earlier in the week did not have.

**Is there a first-seat advantage? No.** The turn-based harness gave the first seat 44%. The engine has no turns:
agents enter the tick in summon order, but the object is drawn uniformly and the agent by energy, with a CSPRNG, and
nothing breaks ties by seat (`engine/tick.ts` 219–257, `lib/futility.ts` 87–101, game-core `pickByEnergy`; the deal is
shuffled, `selectors.ts` 79–81). In the model, with the same policy at every seat, 90 games: 37 / 33 / 30 (greedy),
38 / 33 / 29 (payoff), 36 / 34 / 30 (deny), 36 / 27 / 38 (random); fair is 33 and the standard error 5. In the 12
engine games the seats won 5 / 6 / 1, which is not significant. The one real ordering effect is a late summon: an agent
starts at zero energy at the moment it is summoned.

## 3. The policy zoo, as programs players can write

An agent sees only the one object it is given: no clock, no scores, no other object, not its own energy
(`engine/runtime.ts` 127–135). Whatever it knows about the other gods' rules is in its source, and is paid for at the
summon. A god cannot edit an agent: destroying it loses its energy.

| policy | what it does, in one sentence | needs the others' rules | smallest Python program (bits) | TypeScript | seconds of a god's whole power to pay for it |
|---|---|---|---|---|---|
| random | Writes a random digit in a random cell, without looking. | no | 143 | 304 | 0 |
| greedy | Makes the one-cell change that most raises its own rule; skips when none does. | no | 738 | 1,320 | 8 |
| clause | Greedy, with the commit clause: the engine keeps the change only if it raises the god's points as the god sees them (rooms with the clause on; the default setup has it off). | no | ≈ 760 | | 9 |
| considerate | Greedy, but never makes a change that lowers another god's bits. | yes | 1,179 | 2,019 | 15 |
| payoff | Makes the change that most raises its own points (own bits × the others' bits); skips when none does. | yes | 1,599 | 2,647 | 22 |
| deny (the spoiler) | Makes the change that most raises its own points minus the others' average points. | yes | 1,612 | 2,661 | 22 |
| cooperator | Makes the change that most raises everybody's points together, among those that do not lower its own. | yes | 1,797 | 2,917 | 25 |
| defender | Repairs its own bits first; when they cannot rise, raises the others' bits without lowering its own. | yes | ≈ 1,700 | | 23 |
| hoarder | Like payoff, but only for changes worth much more than they cost. | yes | ≈ 1,650 | | 23 |
| sniper | Saves energy until the last 30 s, then plays deny as fast as it can (needs a signal: an agent has no clock). | yes | ≈ 1,700 | | 23 |

Prices are the engine's own (`scripts/coordination-programs/`, one file per policy and language, priced through the
validate command). Three facts follow.

- **Every policy fits, in Python only.** A god's own store holds at most 64 × 30 = 1,920 bits (#282), so a program
  above that can never be summoned. The TypeScript versions of everything past greedy are above it: Python is priced
  1.6–2.1× cheaper for the same program. A coordinating player on the default setup must write Python.
- **A program has no calibration table.** The programs that weigh rules against each other hard-code a small table of
  bits per rule (about 380 of their bits). That proxy picks the truly best write 73% of the time and captures 94% of
  its gain.
- **Knowing the others' rules is the dear part, twice.** It doubles the program (738 → 1,600 bits: 14 more seconds of
  a god's whole power, 2% of a 600 s game), and the rules must first be inferred from the others' noisy sum
  (docs/public-log-design.md §5: possible but hard). The `summon` and `learn120` sections of §6 price both.

## 4. Develop's rules: tables, best responses, equilibria

Three gods, three agents each, 240 s, 16 games per table on shared deals and seeds (win shares ± 12 points). "Welfare"
is the three gods' points added up. In each matrix a row is what the other two play and a column what the one god
plays; the diagonal (italic) is the table of one policy.

### The rules on develop

`develop`: 3 gods, 16 games per table, 240 s, 3 agent(s) per god.

Win share of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *33%* | 6% | 0% | 44% | deny |
| payoff | 56% | *33%* | 19% | 50% | greedy |
| cooperator | 81% | 63% | *33%* | 94% | deny |
| deny | 50% | 0% | 0% | *33%* | greedy |

Points of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *15075* | 21835 | 11193 | 6599 | payoff |
| payoff | 29866 | *30098* | 20156 | 20909 | payoff |
| cooperator | 26755 | 25918 | *19727* | 23693 | greedy |
| deny | 3726 | 5075 | 3007 | *3280* | payoff |

Welfare of each one-policy table: greedy 45225, payoff 90293, cooperator 59182, deny 9841

Equilibria by win share (no god gains more than 3% by switching), of 20 tables:

- **greedy, greedy, deny**: welfare 19163; greedy 28%, deny 44%; best switch greedy → deny −3%

Tables of one policy that are not equilibria, and the switch that breaks them:
- all greedy (welfare 45225): one god switches to deny, +10%
- all payoff (welfare 90293): one god switches to greedy, +23%
- all cooperator (welfare 59182): one god switches to deny, +60%
- all deny (welfare 9841): one god switches to greedy, +17%

Equilibria by points (no god gains more than 602 by switching), of 20 tables:

- **greedy, payoff, payoff**: welfare 85100; greedy 29866, payoff 27617; best switch greedy → payoff +232
- **payoff, payoff, payoff**: welfare 90293; payoff 30098; best switch payoff → greedy −232

Tables of one policy that are not equilibria, and the switch that breaks them:
- all greedy (welfare 45225): one god switches to payoff, +6760
- all cooperator (welfare 59182): one god switches to greedy, +7027
- all deny (welfare 9841): one god switches to payoff, +1795

Mixed tables:

### Mixed tables on develop

`mixed`: 3 gods, 16 games per table, 240 s, 3 agent(s) per god.

| table | win share / points, per god of each policy | welfare | acts/s by slot | skips | bits destroyed per change |
|---|---|---|---|---|---|
| cooperator, cooperator, deny | cooperator 3% / 15306; deny 94% / 23693 | 54306 | 8.2 / 8.2 / 7.7 | 85% / 85% / 80% | 0.1 / 0.1 / 2.6 |
| deny, payoff, payoff | deny 50% / 20909; payoff 25% / 18352 | 57612 | 5.3 / 5.8 / 5.9 | 32% / 42% / 42% | 3.5 / 1.3 / 1.0 |
| greedy, payoff, payoff | greedy 56% / 29866; payoff 22% / 27617 | 85100 | 7.6 / 7.1 / 7.1 | 67% / 61% / 61% | 2.0 / 1.2 / 1.0 |
| deny, deny, deny | deny 33% / 3280 | 9841 | 3.9 / 3.8 / 3.8 | 8% / 7% / 8% | 1.9 / 2.4 / 2.1 |
| deny, greedy, random | deny 0% / 5550; greedy 100% / 5757; random 0% / 919 | 12226 | 4.1 / 5.5 / 4.4 | 13% / 36% / 10% | 0.6 / 0.3 / 4.3 |
| random, random, random | random 33% / 202 | 607 | 4.4 / 4.4 / 4.4 | 10% / 10% / 10% | 0.6 / 0.6 / 0.6 |
| considerate, considerate, considerate | considerate 33% / 8773 | 26319 | 8.2 / 8.3 / 8.2 | 95% / 96% / 95% | 0.0 / 0.0 / 0.0 |
| defender, defender, deny | defender 19% / 12527; deny 63% / 14233 | 39288 | 4.3 / 4.4 / 4.2 | 18% / 19% / 16% | 1.3 / 1.4 / 3.1 |

The whole zoo (seven policies, 84 tables):

### The rules on develop, the whole zoo

`develop-zoo`: 3 gods, 16 games per table, 240 s, 3 agent(s) per god.

Win share of the one god:
| the others play ↓, one god plays → | greedy | clause | considerate | payoff | cooperator | defender | deny | best response |
|---|---|---|---|---|---|---|---|---|
| greedy | *33%* | 25% | 0% | 6% | 0% | 6% | 44% | deny |
| clause | 56% | *33%* | 0% | 31% | 6% | 38% | 38% | greedy |
| considerate | 100% | 94% | *33%* | 100% | 44% | 100% | 100% | greedy |
| payoff | 56% | 38% | 0% | *33%* | 19% | 44% | 50% | greedy |
| cooperator | 81% | 69% | 38% | 63% | *33%* | 81% | 94% | deny |
| defender | 63% | 25% | 0% | 25% | 6% | *33%* | 63% | greedy |
| deny | 50% | 50% | 0% | 0% | 0% | 0% | *33%* | greedy |

Points of the one god:
| the others play ↓, one god plays → | greedy | clause | considerate | payoff | cooperator | defender | deny | best response |
|---|---|---|---|---|---|---|---|---|
| greedy | *15075* | 17175 | 7755 | 21835 | 11193 | 19155 | 6599 | payoff |
| clause | 20430 | *17789* | 10924 | 26114 | 16856 | 24330 | 10745 | payoff |
| considerate | 11276 | 14353 | *8773* | 20631 | 19214 | 16387 | 16629 | payoff |
| payoff | 29866 | 28959 | 18371 | *30098* | 20156 | 29771 | 20909 | payoff |
| cooperator | 26755 | 24008 | 18685 | 25918 | *19727* | 28091 | 23693 | defender |
| defender | 24989 | 23635 | 11258 | 28200 | 15280 | *27175* | 14233 | payoff |
| deny | 3726 | 4144 | 2119 | 5075 | 3007 | 5389 | *3280* | defender |

Welfare of each one-policy table: greedy 45225, clause 53367, considerate 26319, payoff 90293, cooperator 59182, defender 81525, deny 9841

Equilibria by win share (no god gains more than 3% by switching), of 84 tables:

- **greedy, greedy, deny**: welfare 19163; greedy 28%, deny 44%; best switch greedy → deny −3%

Tables of one policy that are not equilibria, and the switch that breaks them:
- all greedy (welfare 45225): one god switches to deny, +10%
- all clause (welfare 53367): one god switches to greedy, +23%
- all considerate (welfare 26319): one god switches to greedy, +67%
- all payoff (welfare 90293): one god switches to greedy, +23%
- all cooperator (welfare 59182): one god switches to deny, +60%
- all defender (welfare 81525): one god switches to greedy, +29%
- all deny (welfare 9841): one god switches to greedy, +17%

Equilibria by points (no god gains more than 602 by switching), of 84 tables:

- **greedy, payoff, payoff**: welfare 85100; greedy 29866, payoff 27617; best switch greedy → payoff +232
- **payoff, payoff, payoff**: welfare 90293; payoff 30098; best switch payoff → greedy −232
- **payoff, defender, defender**: welfare 87377; payoff 28200, defender 29589; best switch payoff → defender −1025

Tables of one policy that are not equilibria, and the switch that breaks them:
- all greedy (welfare 45225): one god switches to payoff, +6760
- all clause (welfare 53367): one god switches to payoff, +8325
- all considerate (welfare 26319): one god switches to payoff, +11858
- all cooperator (welfare 59182): one god switches to defender, +8363
- all defender (welfare 81525): one god switches to payoff, +1025
- all deny (welfare 9841): one god switches to defender, +2109

## 4a. The final economy (2026-11-13)

Sections 4 to 6 were measured one economy behind (flat change prices, 200 starting energy, no debt bound, score noise
of 8 bits, three agents per god, 240 s). This section repeats the core of them on the default setup as it ships now:
changes priced by distance, 600 starting energy, the 30 s store, every offer charged, the debt bound (an agent may owe
at most a full store), score noise off, a 300 s game, one agent per god, and every policy's program paid for at its
measured summon price before its agent exists (`--summon`). 24 games per table on shared deals (a win share is good to
about ±10 points); the considerate duel has 48.

```
pnpm --filter @workspace/game-utilities coordination report --games 24 --summon --only develop,mixed,players4,unbounded-debt,flat
pnpm --filter @workspace/game-utilities coordination duel --games 48 --summon --set greedy,considerate,deny
```

**What changed, and what did not.**

- **Spoiling still beats careful play on rank, by more than before.** One spoiler (`deny`) among two cooperators wins
  88% of games (mean rank 1.13; 94% before), among two `payoff` players 79% (rank 1.21; 50% before), among two
  considerate players 100% of 48 games, with nearly twice a considerate player's points (19,455 against 10,029 at the
  all-considerate table). Among two greedy players it wins 46% (rank 1.63; 44% before).
- The only equilibrium by win share is still **greedy, greedy, deny**; by points it is still **greedy, payoff, payoff**.
  A table of spoilers is still the poorest (welfare 11,592 against 100,663 for a table of `payoff`), and plain greedy
  beats it (54%).
- **Careful play is never a best response.** `considerate` wins 0% as the one careful god at a greedy or a spoiling
  table, and a considerate table is taken 100% of the time by one greedy or one spoiling god.
- The debt bound changes nothing here (the `unbounded-debt` matrix is the `develop` matrix within noise: these agents
  never owe more than a store). Flat pricing (`flat`) does not change the order either.
- Welfare is up by about a third against section 4 at every one-policy table (greedy 45,225 → 61,450, payoff
  90,293 → 100,663): the longer game, and distance pricing's cheaper near moves.

#### Three gods, the default setup as shipped

`develop`: 3 gods, 24 games per table, 300 s, 1 agent(s) per god.

Win share of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *33%* | 4% | 0% | 46% | deny |
| payoff | 67% | *33%* | 25% | 79% | deny |
| cooperator | 67% | 54% | *33%* | 88% | deny |
| deny | 54% | 0% | 0% | *33%* | greedy |

Mean rank of the one god (1 = first; fair 2.0):
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *2.00* | 2.67 | 2.96 | 1.63 | deny |
| payoff | 1.50 | *2.00* | 2.42 | 1.21 | deny |
| cooperator | 1.33 | 1.54 | *2.00* | 1.13 | deny |
| deny | 1.67 | 3.00 | 3.00 | *2.00* | greedy |

Points of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *20483* | 26843 | 14749 | 9314 | payoff |
| payoff | 34775 | *33554* | 23898 | 27925 | greedy |
| cooperator | 29132 | 28509 | *23642* | 24377 | greedy |
| deny | 4474 | 6360 | 3788 | *3864* | payoff |

Welfare of each one-policy table: greedy 61450, payoff 100663, cooperator 70925, deny 11592

Equilibria by win share (no god gains more than 3% by switching), of 20 tables:

- **greedy, greedy, deny**: welfare 26177; greedy 27%, deny 46%; best switch greedy → deny −4%

Tables of one policy that are not equilibria, and the switch that breaks them:
- all greedy (welfare 61450): one god switches to deny, +13%
- all payoff (welfare 100663): one god switches to deny, +46%
- all cooperator (welfare 70925): one god switches to deny, +54%
- all deny (welfare 11592): one god switches to greedy, +21%

Equilibria by points (no god gains more than 671 by switching), of 20 tables:

- **greedy, payoff, payoff**: welfare 98033; greedy 34775, payoff 31629; best switch payoff → greedy −1161

Tables of one policy that are not equilibria, and the switch that breaks them:
- all greedy (welfare 61450): one god switches to payoff, +6360
- all payoff (welfare 100663): one god switches to greedy, +1221
- all cooperator (welfare 70925): one god switches to greedy, +5490
- all deny (welfare 11592): one god switches to payoff, +2496

#### Mixed tables

`mixed`: 3 gods, 24 games per table, 300 s, 1 agent(s) per god.

| table | win share / points, per god of each policy | welfare | acts/s by slot | skips | bits destroyed per change |
|---|---|---|---|---|---|
| cooperator, cooperator, deny | cooperator 6% / 16474; deny 88% / 24377 | 57325 | 8.0 / 8.0 / 7.0 | 84% / 84% / 74% | 0.1 / 0.1 / 3.3 |
| deny, payoff, payoff | deny 79% / 27925; payoff 10% / 23564 | 75053 | 6.1 / 6.8 / 6.7 | 41% / 50% / 49% | 3.5 / 1.1 / 1.3 |
| greedy, payoff, payoff | greedy 67% / 34775; payoff 17% / 31629 | 98033 | 8.1 / 7.3 / 7.3 | 71% / 66% / 66% | 1.7 / 1.2 / 1.4 |
| deny, deny, deny | deny 33% / 3864 | 11592 | 3.8 / 3.7 / 3.8 | 9% / 8% / 9% | 2.0 / 2.3 / 2.3 |
| deny, greedy, random | deny 4% / 6225; greedy 96% / 6445; random 0% / 993 | 13663 | 4.3 / 6.0 / 4.7 | 16% / 37% / 10% | 0.7 / 0.3 / 4.4 |
| random, random, random | random 33% / 230 | 689 | 4.6 / 4.6 / 4.6 | 10% / 10% / 10% | 0.6 / 0.6 / 0.6 |
| considerate, considerate, considerate | considerate 33% / 10379 | 31136 | 8.0 / 8.0 / 8.0 | 95% / 95% / 95% | 0.0 / 0.0 / 0.0 |
| defender, defender, deny | defender 27% / 16004; deny 46% / 17164 | 49172 | 5.1 / 4.9 / 4.5 | 23% / 21% / 16% | 1.1 / 1.4 / 3.6 |

#### Greedy, considerate and spoiler (48 games per table)

Win share of the one god:
| the others play ↓, one god plays → | greedy | considerate | deny | best response |
|---|---|---|---|---|
| greedy | *33%* | 0% | 31% | greedy |
| considerate | 100% | *33%* | 100% | greedy |
| deny | 54% | 0% | *33%* | greedy |

Points of the one god:
| the others play ↓, one god plays → | greedy | considerate | deny | best response |
|---|---|---|---|---|
| greedy | *19410* | 10481 | 9678 | greedy |
| considerate | 15100 | *10029* | 19455 | deny |
| deny | 4404 | 2756 | *3883* | greedy |

Welfare of each one-policy table: greedy 58231, considerate 30087, deny 11650

#### Four gods

`players4`: 4 gods, 24 games per table, 300 s, 1 agent(s) per god.

Win share of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *25%* | 0% | 0% | 29% | deny |
| payoff | 54% | *25%* | 8% | 54% | greedy |
| cooperator | 79% | 75% | *25%* | 92% | deny |
| deny | 38% | 0% | 0% | *25%* | greedy |

Mean rank of the one god (1 = first; fair 2.5):
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *2.50* | 3.29 | 3.96 | 2.33 | deny |
| payoff | 1.67 | *2.50* | 3.54 | 1.63 | deny |
| cooperator | 1.21 | 1.29 | *2.50* | 1.08 | deny |
| deny | 2.17 | 3.79 | 4.00 | *2.50* | greedy |

Points of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *12150* | 17733 | 14266 | 7359 | payoff |
| payoff | 40840 | *41982* | 26930 | 32451 | payoff |
| cooperator | 41598 | 41561 | *28986* | 40600 | greedy |
| deny | 3772 | 5346 | 4042 | *3105* | payoff |

Welfare of each one-policy table: greedy 48602, payoff 167928, cooperator 115945, deny 12420

#### No debt bound (the economy before 13 Nov 2026)

`unbounded-debt`: 3 gods, 24 games per table, 300 s, 1 agent(s) per god.

Win share of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *33%* | 4% | 0% | 46% | deny |
| payoff | 67% | *33%* | 25% | 79% | deny |
| cooperator | 67% | 54% | *33%* | 88% | deny |
| deny | 54% | 0% | 0% | *33%* | greedy |

Mean rank of the one god (1 = first; fair 2.0):
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *2.00* | 2.67 | 2.96 | 1.63 | deny |
| payoff | 1.50 | *2.00* | 2.42 | 1.21 | deny |
| cooperator | 1.33 | 1.54 | *2.00* | 1.13 | deny |
| deny | 1.67 | 3.00 | 3.00 | *2.00* | greedy |

Points of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *20483* | 26843 | 14749 | 9314 | payoff |
| payoff | 34775 | *33554* | 23898 | 27925 | greedy |
| cooperator | 29132 | 28509 | *23642* | 24377 | greedy |
| deny | 4474 | 6360 | 3788 | *3864* | payoff |

Welfare of each one-policy table: greedy 61450, payoff 100663, cooperator 70925, deny 11592

#### Flat pricing (set-v1: every one-cell write costs the same)

`flat`: 3 gods, 24 games per table, 300 s, 1 agent(s) per god.

Win share of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *33%* | 4% | 0% | 50% | deny |
| payoff | 67% | *33%* | 25% | 92% | deny |
| cooperator | 79% | 50% | *33%* | 92% | deny |
| deny | 38% | 0% | 0% | *33%* | greedy |

Mean rank of the one god (1 = first; fair 2.0):
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *2.00* | 2.75 | 2.96 | 1.63 | deny |
| payoff | 1.50 | *2.00* | 2.33 | 1.08 | deny |
| cooperator | 1.21 | 1.54 | *2.00* | 1.08 | deny |
| deny | 1.92 | 3.00 | 3.00 | *2.00* | greedy |

Points of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *18880* | 26193 | 13970 | 8752 | payoff |
| payoff | 36961 | *35347* | 25333 | 27217 | greedy |
| cooperator | 31491 | 28572 | *22148* | 25335 | greedy |
| deny | 4331 | 5927 | 3897 | *3827* | payoff |

Welfare of each one-policy table: greedy 56640, payoff 106041, cooperator 66445, deny 11480

## 5. The candidates

| candidate | the rule in a sentence a 12-year-old could follow | change to the code | spoiler's win share at a greedy / careful table | win-seekers' equilibrium (welfare) | points equilibrium (welfare) | verdict |
|---|---|---|---|---|---|---|
| develop | Your points on an object are your bits times everyone else's bits added up. | | 44% / 50% | greedy, greedy, deny (19k) | all payoff (90k) | |
| breaking costs extra ×1 | When your change makes an object worth fewer bits to everyone together, you pay for each bit you destroyed. | one term in the act charge (built: §8) | 19% / 50% | all greedy (42k) | all payoff (92k) | helps |
| breaking costs extra ×3 | The same, three times dearer. | the same setting at 3 | 13% / 25% | all greedy (38k) | all payoff (81k) | best found |
| the same on the disclosed (noisy) value, ×1 / ×3 | | | 19% / 50%, 13% / 38% | all greedy (34k / 17k) | all payoff (83k / 60k) | a random tax: rejected at σ = 8 |
| smallest other | Your points are your bits times the bits of whoever likes the object least. | payoff, disclosure, inference, every score text | 19% / 94% | all greedy (36k) or all deny (1.6k) | all payoff (78k) | worse: rejected |
| geometric mean of the others | | the same | 50% / 81% | all deny (5k) | all payoff (87k) | worse: rejected |
| time-averaged points | Your score is your points averaged over the whole game, not at the last second. | tick, scoreboard, results, replay | 31% / 81% | all greedy (24k) | all payoff (55k) | does not stop spoiling; stops last-second wrecking |
| points depend on boards you contributed to | | | | | | not modelled: a patch (it rewards touching everything) |
| publishing more or less of the others' value | | | | | | not modelled as a rule; `learn120` in §6 prices late knowledge |

Balance across the beginner rules was not re-measured under any candidate (unverified).

### Candidate: breaking costs extra (1 bit of work per bit destroyed)

`erasure1`: 3 gods, 16 games per table, 240 s, 3 agent(s) per god.

Win share of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *33%* | 0% | 0% | 19% | greedy |
| payoff | 56% | *33%* | 19% | 50% | greedy |
| cooperator | 75% | 56% | *33%* | 94% | deny |
| deny | 88% | 6% | 0% | *33%* | greedy |

Points of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *13936* | 23134 | 12927 | 6403 | payoff |
| payoff | 27843 | *30588* | 21357 | 21670 | payoff |
| cooperator | 24680 | 25627 | *19898* | 23893 | payoff |
| deny | 5213 | 7345 | 3999 | *6187* | payoff |

Welfare of each one-policy table: greedy 41808, payoff 91764, cooperator 59693, deny 18561

Equilibria by win share (no god gains more than 3% by switching), of 20 tables:

- **greedy, greedy, greedy**: welfare 41808; greedy 33%; best switch greedy → deny −15%

Tables of one policy that are not equilibria, and the switch that breaks them:
- all payoff (welfare 91764): one god switches to greedy, +23%
- all cooperator (welfare 59693): one god switches to deny, +60%
- all deny (welfare 18561): one god switches to greedy, +54%

Equilibria by points (no god gains more than 612 by switching), of 20 tables:

- **payoff, payoff, payoff**: welfare 91764; payoff 30588; best switch payoff → greedy −2745

Tables of one policy that are not equilibria, and the switch that breaks them:
- all greedy (welfare 41808): one god switches to payoff, +9198
- all cooperator (welfare 59693): one god switches to payoff, +5730
- all deny (welfare 18561): one god switches to payoff, +1158

### Candidate: breaking costs extra (3 bits of work per bit destroyed)

`erasure3`: 3 gods, 16 games per table, 240 s, 3 agent(s) per god.

Win share of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *33%* | 19% | 13% | 13% | greedy |
| payoff | 44% | *33%* | 25% | 25% | greedy |
| cooperator | 75% | 56% | *33%* | 56% | greedy |
| deny | 81% | 38% | 6% | *33%* | greedy |

Points of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *12678* | 20467 | 15613 | 5948 | payoff |
| payoff | 25084 | *26885* | 22715 | 19645 | payoff |
| cooperator | 26471 | 23249 | *18931* | 24508 | greedy |
| deny | 9819 | 17231 | 10876 | *9017* | payoff |

Welfare of each one-policy table: greedy 38035, payoff 80656, cooperator 56793, deny 27050

Equilibria by win share (no god gains more than 3% by switching), of 20 tables:

- **greedy, greedy, greedy**: welfare 38035; greedy 33%; best switch greedy → payoff −15%

Tables of one policy that are not equilibria, and the switch that breaks them:
- all payoff (welfare 80656): one god switches to greedy, +10%
- all cooperator (welfare 56793): one god switches to greedy, +42%
- all deny (welfare 27050): one god switches to greedy, +48%

Equilibria by points (no god gains more than 538 by switching), of 20 tables:

- **payoff, payoff, payoff**: welfare 80656; payoff 26885; best switch payoff → greedy −1801

Tables of one policy that are not equilibria, and the switch that breaks them:
- all greedy (welfare 38035): one god switches to payoff, +7789
- all cooperator (welfare 56793): one god switches to greedy, +7540
- all deny (welfare 27050): one god switches to payoff, +8215

### Breaking costs extra, charged on the disclosed salience (noise σ = 8 bits)

`erasure1-noise8`: 3 gods, 16 games per table, 240 s, 3 agent(s) per god.

Win share of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *33%* | 6% | 0% | 19% | greedy |
| payoff | 63% | *33%* | 19% | 50% | greedy |
| cooperator | 81% | 63% | *33%* | 88% | deny |
| deny | 75% | 0% | 0% | *33%* | greedy |

Points of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *11481* | 18057 | 12056 | 5994 | payoff |
| payoff | 25427 | *27752* | 20615 | 19194 | payoff |
| cooperator | 24962 | 25641 | *18820* | 22867 | payoff |
| deny | 4248 | 5027 | 3222 | *4225* | payoff |

Welfare of each one-policy table: greedy 34443, payoff 83255, cooperator 56460, deny 12675

Equilibria by win share (no god gains more than 3% by switching), of 20 tables:

- **greedy, greedy, greedy**: welfare 34443; greedy 33%; best switch greedy → deny −15%

Tables of one policy that are not equilibria, and the switch that breaks them:
- all payoff (welfare 83255): one god switches to greedy, +29%
- all cooperator (welfare 56460): one god switches to deny, +54%
- all deny (welfare 12675): one god switches to greedy, +42%

Equilibria by points (no god gains more than 555 by switching), of 20 tables:

- **payoff, payoff, payoff**: welfare 83255; payoff 27752; best switch payoff → greedy −2325

Tables of one policy that are not equilibria, and the switch that breaks them:
- all greedy (welfare 34443): one god switches to payoff, +6576
- all cooperator (welfare 56460): one god switches to payoff, +6821
- all deny (welfare 12675): one god switches to payoff, +802

### Breaking costs extra ×3, charged on the disclosed salience (noise σ = 8 bits)

`erasure3-noise8`: 3 gods, 16 games per table, 240 s, 3 agent(s) per god.

Win share of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *33%* | 6% | 0% | 13% | greedy |
| payoff | 69% | *33%* | 25% | 38% | greedy |
| cooperator | 63% | 63% | *33%* | 75% | deny |
| deny | 44% | 19% | 0% | *33%* | greedy |

Points of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *5766* | 8705 | 8407 | 3658 | payoff |
| payoff | 15919 | *20038* | 19056 | 11066 | payoff |
| cooperator | 23989 | 23882 | *19297* | 21584 | greedy |
| deny | 3746 | 4960 | 4775 | *2979* | payoff |

Welfare of each one-policy table: greedy 17299, payoff 60113, cooperator 57891, deny 8938

Equilibria by win share (no god gains more than 3% by switching), of 20 tables:

- **greedy, greedy, greedy**: welfare 17299; greedy 33%; best switch greedy → deny −21%

Tables of one policy that are not equilibria, and the switch that breaks them:
- all payoff (welfare 60113): one god switches to greedy, +35%
- all cooperator (welfare 57891): one god switches to deny, +42%
- all deny (welfare 8938): one god switches to greedy, +10%

Equilibria by points (no god gains more than 447 by switching), of 20 tables:

- **payoff, payoff, payoff**: welfare 60113; payoff 20038; best switch payoff → cooperator −982

Tables of one policy that are not equilibria, and the switch that breaks them:
- all greedy (welfare 17299): one god switches to payoff, +2939
- all cooperator (welfare 57891): one god switches to greedy, +4692
- all deny (welfare 8938): one god switches to payoff, +1980

### Candidate: own bits × the smallest other god's bits

`min`: 3 gods, 16 games per table, 240 s, 3 agent(s) per god.

Win share of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *33%* | 6% | 0% | 19% | greedy |
| payoff | 38% | *33%* | 19% | 94% | deny |
| cooperator | 81% | 56% | *33%* | 100% | deny |
| deny | 6% | 0% | 0% | *33%* | deny |

Points of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *11838* | 17266 | 17417 | 965 | cooperator |
| payoff | 23592 | *26133* | 24042 | 12954 | payoff |
| cooperator | 24211 | 21135 | *17956* | 19192 | greedy |
| deny | 861 | 2847 | 3573 | *548* | cooperator |

Welfare of each one-policy table: greedy 35513, payoff 78399, cooperator 53869, deny 1645

Equilibria by win share (no god gains more than 3% by switching), of 20 tables:

- **greedy, greedy, greedy**: welfare 35513; greedy 33%; best switch greedy → deny −15%
- **deny, deny, deny**: welfare 1645; deny 33%; best switch deny → greedy −27%

Tables of one policy that are not equilibria, and the switch that breaks them:
- all payoff (welfare 78399): one god switches to deny, +60%
- all cooperator (welfare 53869): one god switches to deny, +67%

Equilibria by points (no god gains more than 523 by switching), of 20 tables:

- **payoff, payoff, payoff**: welfare 78399; payoff 26133; best switch payoff → cooperator −2091

Tables of one policy that are not equilibria, and the switch that breaks them:
- all greedy (welfare 35513): one god switches to cooperator, +5580
- all cooperator (welfare 53869): one god switches to greedy, +6255
- all deny (welfare 1645): one god switches to cooperator, +3025

### Candidate: own bits × the geometric mean of the others' bits

`geo`: 3 gods, 16 games per table, 240 s, 3 agent(s) per god.

Win share of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *33%* | 6% | 0% | 50% | deny |
| payoff | 50% | *33%* | 25% | 81% | deny |
| cooperator | 75% | 50% | *33%* | 75% | greedy |
| deny | 19% | 0% | 0% | *33%* | deny |

Points of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *14296* | 21283 | 15867 | 5055 | payoff |
| payoff | 28425 | *28958* | 27047 | 20498 | payoff |
| cooperator | 26229 | 25533 | *21673* | 22689 | greedy |
| deny | 2361 | 5728 | 7337 | *1670* | cooperator |

Welfare of each one-policy table: greedy 42889, payoff 86873, cooperator 65020, deny 5011

Equilibria by win share (no god gains more than 3% by switching), of 20 tables:

- **deny, deny, deny**: welfare 5011; deny 33%; best switch deny → greedy −15%

Tables of one policy that are not equilibria, and the switch that breaks them:
- all greedy (welfare 42889): one god switches to deny, +17%
- all payoff (welfare 86873): one god switches to deny, +48%
- all cooperator (welfare 65020): one god switches to greedy, +42%

Equilibria by points (no god gains more than 579 by switching), of 20 tables:

- **greedy, payoff, payoff**: welfare 81839; greedy 28425, payoff 26707; best switch greedy → payoff +532
- **payoff, payoff, payoff**: welfare 86873; payoff 28958; best switch payoff → greedy −532

Tables of one policy that are not equilibria, and the switch that breaks them:
- all greedy (welfare 42889): one god switches to payoff, +6987
- all cooperator (welfare 65020): one god switches to greedy, +4556
- all deny (welfare 5011): one god switches to cooperator, +5666

### Candidate: points averaged over the game's time

`integral`: 3 gods, 16 games per table, 240 s, 3 agent(s) per god.

Win share of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *33%* | 6% | 0% | 31% | greedy |
| payoff | 56% | *33%* | 19% | 81% | deny |
| cooperator | 75% | 69% | *33%* | 94% | deny |
| deny | 50% | 0% | 0% | *33%* | greedy |

Points of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *8084* | 11870 | 6374 | 4141 | payoff |
| payoff | 17520 | *18228* | 13033 | 12470 | payoff |
| cooperator | 16837 | 16088 | *12416* | 15129 | greedy |
| deny | 2332 | 3130 | 1912 | *2006* | payoff |

Welfare of each one-policy table: greedy 24252, payoff 54684, cooperator 37247, deny 6018

Equilibria by win share (no god gains more than 3% by switching), of 20 tables:

- **greedy, greedy, greedy**: welfare 24252; greedy 33%; best switch greedy → deny −2%
- **greedy, greedy, deny**: welfare 12080; greedy 34%, deny 31%; best switch deny → greedy +2%

Tables of one policy that are not equilibria, and the switch that breaks them:
- all payoff (welfare 54684): one god switches to deny, +48%
- all cooperator (welfare 37247): one god switches to deny, +60%
- all deny (welfare 6018): one god switches to greedy, +17%

Equilibria by points (no god gains more than 365 by switching), of 20 tables:

- **payoff, payoff, payoff**: welfare 54684; payoff 18228; best switch payoff → greedy −708

Tables of one policy that are not equilibria, and the switch that breaks them:
- all greedy (welfare 24252): one god switches to payoff, +3786
- all cooperator (welfare 37247): one god switches to greedy, +4422
- all deny (welfare 6018): one god switches to payoff, +1123

### Smallest other × breaking costs extra

`min-erasure1`: 3 gods, 16 games per table, 240 s, 3 agent(s) per god.

Win share of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *33%* | 6% | 0% | 6% | greedy |
| payoff | 31% | *33%* | 13% | 38% | deny |
| cooperator | 75% | 63% | *33%* | 56% | greedy |
| deny | 31% | 6% | 0% | *33%* | deny |

Points of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *10271* | 16283 | 16980 | 1132 | cooperator |
| payoff | 24040 | *26010* | 23536 | 17820 | payoff |
| cooperator | 24306 | 23771 | *18723* | 22822 | greedy |
| deny | 843 | 3521 | 4378 | *572* | cooperator |

Welfare of each one-policy table: greedy 30814, payoff 78031, cooperator 56169, deny 1716

Equilibria by win share (no god gains more than 3% by switching), of 20 tables:

- **greedy, greedy, greedy**: welfare 30814; greedy 33%; best switch greedy → payoff −27%
- **deny, deny, deny**: welfare 1716; deny 33%; best switch deny → greedy −2%

Tables of one policy that are not equilibria, and the switch that breaks them:
- all payoff (welfare 78031): one god switches to deny, +4%
- all cooperator (welfare 56169): one god switches to greedy, +42%

Equilibria by points (no god gains more than 520 by switching), of 20 tables:

- **greedy, payoff, cooperator**: welfare 77085; greedy 27021, payoff 25405, cooperator 24658; best switch cooperator → payoff −782
- **payoff, payoff, payoff**: welfare 78031; payoff 26010; best switch payoff → greedy −1971

Tables of one policy that are not equilibria, and the switch that breaks them:
- all greedy (welfare 30814): one god switches to cooperator, +6709
- all cooperator (welfare 56169): one god switches to greedy, +5583
- all deny (welfare 1716): one god switches to cooperator, +3806

### Saving energy for the end

### Saving energy for the end, no capacity, 8 agents per god

`sniper-nocap`: 3 gods, 16 games per table, 240 s, 8 agent(s) per god.

| table | win share / points, per god of each policy | welfare | acts/s by slot | skips | bits destroyed per change |
|---|---|---|---|---|---|
| payoff, payoff, sniper | payoff 16% / 14218; sniper 69% / 17381 | 45817 | 6.1 / 6.1 / 12.8 | 71% / 70% / 92% | 0.6 / 0.6 / 4.4 |
| greedy, greedy, sniper | greedy 6% / 6433; sniper 88% / 8636 | 21502 | 4.8 / 5.1 / 15.1 | 43% / 47% / 90% | 1.0 / 1.0 / 3.3 |
| payoff, payoff, payoff | payoff 33% / 30037 | 90110 | 8.0 / 7.7 / 7.8 | 76% / 74% / 75% | 1.1 / 1.2 / 0.9 |

### Saving energy for the end, develop's capacity, 8 agents per god

`sniper-cap`: 3 gods, 16 games per table, 240 s, 8 agent(s) per god.

| table | win share / points, per god of each policy | welfare | acts/s by slot | skips | bits destroyed per change |
|---|---|---|---|---|---|
| payoff, payoff, sniper | payoff 16% / 17084; sniper 69% / 17831 | 52000 | 7.5 / 7.4 / 10.1 | 75% / 74% / 93% | 0.5 / 0.6 / 6.1 |
| greedy, greedy, sniper | greedy 50% / 7834; sniper 0% / 5435 | 21104 | 6.4 / 6.7 / 11.7 | 53% / 56% / 93% | 1.0 / 0.9 / 6.3 |
| payoff, payoff, payoff | payoff 33% / 29779 | 89338 | 8.0 / 7.6 / 7.8 | 76% / 73% / 75% | 1.1 / 1.3 / 0.9 |

### Saving energy for the end, no capacity, points averaged over time

`sniper-integral`: 3 gods, 16 games per table, 240 s, 8 agent(s) per god.

| table | win share / points, per god of each policy | welfare | acts/s by slot | skips | bits destroyed per change |
|---|---|---|---|---|---|
| payoff, payoff, sniper | payoff 47% / 12655; sniper 6% / 8829 | 34139 | 6.1 / 6.1 / 12.8 | 71% / 70% / 92% | 0.6 / 0.6 / 4.4 |
| greedy, greedy, sniper | greedy 50% / 7943; sniper 0% / 2078 | 17963 | 4.8 / 5.1 / 15.1 | 43% / 47% / 90% | 1.0 / 1.0 / 3.3 |
| payoff, payoff, payoff | payoff 33% / 18475 | 55425 | 8.0 / 7.7 / 7.8 | 76% / 74% / 75% | 1.1 / 1.2 / 0.9 |

## 6. Sensitivities (develop's rules)

### Read price: κ = 1

`kappa1`: 3 gods, 16 games per table, 240 s, 3 agent(s) per god.

Win share of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *33%* | 0% | 0% | 56% | deny |
| payoff | 88% | *33%* | 19% | 81% | greedy |
| cooperator | 100% | 63% | *33%* | 94% | greedy |
| deny | 13% | 0% | 0% | *33%* | deny |

Points of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *4873* | 6406 | 5426 | 3611 | payoff |
| payoff | 11800 | *13012* | 11693 | 9646 | payoff |
| cooperator | 13709 | 15516 | *12639* | 13497 | payoff |
| deny | 2360 | 3510 | 2679 | *2217* | payoff |

Welfare of each one-policy table: greedy 14619, payoff 39035, cooperator 37916, deny 6650

### Read price: κ = 8

`kappa8`: 3 gods, 16 games per table, 240 s, 3 agent(s) per god.

Win share of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *33%* | 6% | 0% | 63% | deny |
| payoff | 44% | *33%* | 19% | 94% | deny |
| cooperator | 88% | 63% | *33%* | 100% | deny |
| deny | 31% | 0% | 0% | *33%* | deny |

Points of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *12585* | 17716 | 10321 | 6250 | payoff |
| payoff | 25503 | *27903* | 19372 | 19331 | payoff |
| cooperator | 25223 | 24424 | *18593* | 21914 | greedy |
| deny | 3495 | 4993 | 3279 | *3061* | payoff |

Welfare of each one-policy table: greedy 37754, payoff 83709, cooperator 55778, deny 9184

### Read price: κ = 128

`kappa128`: 3 gods, 16 games per table, 240 s, 3 agent(s) per god.

Win share of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *33%* | 13% | 0% | 38% | deny |
| payoff | 63% | *33%* | 19% | 75% | deny |
| cooperator | 81% | 63% | *33%* | 94% | deny |
| deny | 63% | 0% | 0% | *33%* | greedy |

Points of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *17301* | 23050 | 11418 | 7312 | payoff |
| payoff | 29431 | *27744* | 19739 | 21284 | greedy |
| cooperator | 25686 | 25138 | *18894* | 21701 | greedy |
| deny | 3562 | 4722 | 3347 | *3469* | payoff |

Welfare of each one-policy table: greedy 51904, payoff 83233, cooperator 56682, deny 10406

### No energy capacity

`capacity-none`: 3 gods, 16 games per table, 240 s, 3 agent(s) per god.

Win share of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *33%* | 6% | 0% | 44% | deny |
| payoff | 63% | *33%* | 19% | 56% | greedy |
| cooperator | 81% | 63% | *33%* | 94% | deny |
| deny | 50% | 0% | 0% | *33%* | greedy |

Points of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *15075* | 21959 | 11100 | 6599 | payoff |
| payoff | 29987 | *29947* | 20089 | 20971 | greedy |
| cooperator | 27071 | 25353 | *19790* | 24225 | greedy |
| deny | 3726 | 5075 | 3055 | *3280* | payoff |

Welfare of each one-policy table: greedy 45225, payoff 89842, cooperator 59369, deny 9841

### Capacity 5 s

`capacity-5`: 3 gods, 16 games per table, 240 s, 3 agent(s) per god.

Win share of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *33%* | 6% | 0% | 44% | deny |
| payoff | 56% | *33%* | 19% | 56% | greedy |
| cooperator | 75% | 63% | *33%* | 94% | deny |
| deny | 50% | 0% | 0% | *33%* | greedy |

Points of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *14671* | 21562 | 11383 | 6599 | payoff |
| payoff | 30432 | *30173* | 19832 | 21256 | greedy |
| cooperator | 27115 | 25910 | *19900* | 23766 | greedy |
| deny | 3726 | 5075 | 3042 | *3280* | payoff |

Welfare of each one-policy table: greedy 44013, payoff 90520, cooperator 59701, deny 9841

### Distance pricing (docs/mutation-cost-design.md)

`distance`: 3 gods, 16 games per table, 240 s, 3 agent(s) per god.

Win share of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *33%* | 13% | 0% | 38% | deny |
| payoff | 56% | *33%* | 19% | 75% | deny |
| cooperator | 88% | 63% | *33%* | 88% | greedy |
| deny | 56% | 0% | 0% | *33%* | greedy |

Points of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *16404* | 23113 | 12874 | 7363 | payoff |
| payoff | 29610 | *29567* | 19575 | 20729 | greedy |
| cooperator | 24841 | 24958 | *19435* | 21852 | payoff |
| deny | 4027 | 5098 | 3148 | *3127* | payoff |

Welfare of each one-policy table: greedy 49211, payoff 88702, cooperator 58304, deny 9380

### Two gods

`players2`: 2 gods, 16 games per table, 240 s, 3 agent(s) per god.

Win share of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *50%* | 50% | 50% | 50% | greedy |
| payoff | 50% | *50%* | 50% | 50% | greedy |
| cooperator | 50% | 50% | *50%* | 50% | greedy |
| deny | 50% | 50% | 50% | *50%* | greedy |

Points of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *19562* | 13764 | 12342 | 1318 | greedy |
| payoff | 13764 | *10414* | 10414 | 10045 | greedy |
| cooperator | 12342 | 10414 | *10414* | 10415 | greedy |
| deny | 1318 | 10045 | 10415 | *68* | cooperator |

Welfare of each one-policy table: greedy 39124, payoff 20828, cooperator 20828, deny 136

### Four gods

`players4`: 4 gods, 16 games per table, 240 s, 3 agent(s) per god.

Win share of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *25%* | 0% | 0% | 31% | deny |
| payoff | 56% | *25%* | 6% | 56% | greedy |
| cooperator | 75% | 63% | *25%* | 94% | deny |
| deny | 19% | 0% | 0% | *25%* | deny |

Points of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *8824* | 14268 | 10488 | 5707 | payoff |
| payoff | 35393 | *37384* | 22262 | 25100 | payoff |
| cooperator | 34456 | 35380 | *23034* | 30152 | payoff |
| deny | 3254 | 3971 | 3173 | *2713* | payoff |

Welfare of each one-policy table: greedy 35294, payoff 149536, cooperator 92135, deny 10851

### Five gods

`players5`: 5 gods, 16 games per table, 240 s, 3 agent(s) per god.

Win share of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *20%* | 13% | 0% | 19% | greedy |
| payoff | 25% | *20%* | 6% | 25% | greedy |
| cooperator | 81% | 81% | *20%* | 94% | deny |
| deny | 31% | 0% | 0% | *20%* | greedy |

Points of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *8260* | 10735 | 8296 | 5847 | payoff |
| payoff | 29730 | *32139* | 24900 | 23749 | payoff |
| cooperator | 51344 | 51079 | *31820* | 51566 | deny |
| deny | 3312 | 3600 | 3268 | *2753* | payoff |

Welfare of each one-policy table: greedy 41299, payoff 160697, cooperator 159099, deny 13763

### The full 600 s game

`length`: 3 gods, 16 games per table, 600 s, 3 agent(s) per god.

Win share of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *33%* | 13% | 0% | 44% | deny |
| payoff | 63% | *33%* | 19% | 75% | deny |
| cooperator | 88% | 63% | *33%* | 94% | deny |
| deny | 56% | 0% | 0% | *33%* | greedy |

Points of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *35081* | 47613 | 24049 | 15146 | payoff |
| payoff | 61955 | *61745* | 40910 | 44831 | greedy |
| cooperator | 55695 | 53047 | *39274* | 48207 | greedy |
| deny | 7370 | 10934 | 6155 | *6840* | payoff |

Welfare of each one-policy table: greedy 105244, payoff 185235, cooperator 117822, deny 20519

### 40 starting objects

`objects40`: 3 gods, 16 games per table, 240 s, 3 agent(s) per god.

Win share of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *33%* | 0% | 0% | 63% | deny |
| payoff | 69% | *33%* | 25% | 81% | deny |
| cooperator | 88% | 69% | *33%* | 100% | deny |
| deny | 38% | 0% | 0% | *33%* | greedy |

Points of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *19221* | 28368 | 19971 | 11511 | payoff |
| payoff | 45872 | *52827* | 38528 | 33913 | payoff |
| cooperator | 47982 | 45334 | *36596* | 42105 | greedy |
| deny | 6410 | 9177 | 6342 | *5600* | payoff |

Welfare of each one-policy table: greedy 57662, payoff 158482, cooperator 109789, deny 16799

### One agent per god

`agents1`: 3 gods, 16 games per table, 240 s, 1 agent(s) per god.

Win share of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *33%* | 6% | 0% | 63% | deny |
| payoff | 69% | *33%* | 19% | 81% | deny |
| cooperator | 94% | 56% | *33%* | 94% | greedy |
| deny | 25% | 0% | 0% | *33%* | deny |

Points of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *11939* | 17112 | 9270 | 7008 | payoff |
| payoff | 23757 | *25054* | 17692 | 17757 | payoff |
| cooperator | 23154 | 22071 | *18341* | 20222 | greedy |
| deny | 3718 | 5664 | 3028 | *3255* | payoff |

Welfare of each one-policy table: greedy 35816, payoff 75161, cooperator 55022, deny 9766

### The others' rules known only after 120 s

`learn120`: 3 gods, 16 games per table, 240 s, 3 agent(s) per god.

Win share of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *33%* | 0% | 0% | 31% | greedy |
| payoff | 56% | *33%* | 19% | 75% | deny |
| cooperator | 75% | 63% | *33%* | 94% | deny |
| deny | 31% | 0% | 0% | *33%* | deny |

Points of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *15075* | 20880 | 15829 | 8910 | payoff |
| payoff | 29146 | *29958* | 25608 | 20695 | payoff |
| cooperator | 28826 | 29744 | *23930* | 24601 | payoff |
| deny | 4222 | 5599 | 5068 | *3241* | payoff |

Welfare of each one-policy table: greedy 45225, payoff 89875, cooperator 71791, deny 9723

### Programs paid for: agents start once their summon price is saved

`summon`: 3 gods, 16 games per table, 240 s, 3 agent(s) per god.

Win share of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *33%* | 6% | 0% | 19% | greedy |
| payoff | 56% | *33%* | 19% | 81% | deny |
| cooperator | 81% | 63% | *33%* | 88% | deny |
| deny | 56% | 0% | 0% | *33%* | greedy |

Points of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *15404* | 22843 | 10624 | 6552 | payoff |
| payoff | 29753 | *29650* | 19318 | 21753 | greedy |
| cooperator | 24878 | 25394 | *19681* | 22840 | payoff |
| deny | 3635 | 5009 | 3252 | *3274* | payoff |

Welfare of each one-policy table: greedy 46212, payoff 88950, cooperator 59044, deny 9821

## 7. What is not verified

- 16 games per table: a win share is ± 12 points; differences under 15 points are not established.
- Only greedy and random were played on the real engine. The informed policies exist as priced Python programs
  (`scripts/coordination-programs/`) but were not played in engine games, and the model gives them the true tables
  where the programs use a proxy.
- Inference of the others' rules is assumed (exact, at once or after 120 s), not simulated.
- The sniper needs a signal the model gives it for free (an agent has no clock).
- Balance across the eight beginner rules under each candidate; games of more than three gods beyond the duel tables;
  the 600 s game beyond the `length` section.

## 8. What is built

- On `develop`: this document, the model, its tests, the engine-game script and data, the policy programs.
- Draft pull request, not merged: the room setting `breakCost` ("breaking costs extra", off by default, charged on the
  disclosed value as the commit clause is). Its unit suites and the root typecheck pass; its engine tests were written
  but not run, so it stays a draft. To have the effect measured here it must be charged on the exact value, or the
  room's `peerNoiseBits` set low: that is the owner's choice between a real incentive and a small leak (each
  destructive act would tell its owner exactly how much the others lost).
- Not built: time-averaged scoring (the largest change: tick, scoreboard, results, replay), admin-only Lab setups.


## 11. Spoiling after the rotated deal (2026-11-14)

The rotated deal (docs/beginner-pool.md §6) removes the dealt rule's edge over a rotation; it does nothing to the
style edge. Mixed tables, 3 players, 150 single games with rules and seats rotated (`docs/balance-results-2026-11-13/tables3-mixed.txt`):
one `deny` among two cooperators wins 95%, among two `considerate` players 100%; one `considerate` among two greedy
wins 0%. The rotation spreads these over the round unchanged, so careful play still loses on rank.

The smallest principled change remains **breaking costs extra** (§5, draft #295): a change pays work for each bit of
the object's total value it destroys; at ×3 the spoiler wins 13–25% at every table and the win-seekers' equilibrium
becomes three greedy players with twice today's welfare. Its blocker, that it only works on the exact value, does not
apply to the default setup, which already shows exact sums (Annotated basics, `peerNoiseBits` 0). Not shipped: #295
must be rebased and its engine tests run, and it is a scoring change for the owner to decide.
