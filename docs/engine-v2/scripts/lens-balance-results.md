# Lenses and mutators: script output (scripts/lenses.ts --H 16 --sources 30)

Analysis for docs/engine-v2/lenses-and-mutators.md. Nothing here changes the engine.

## Check: the fast model against the engine (line-q, box H = 16, 14688 lines)
- 9356 (line, mutator, result) cheapest fees compared with the engine's own enumeration of arguments: 0 differ; 0 are cheaper in the engine through arguments past this model's limits (a pivot about a farther x0).

_Graph: 14688 lines, 6,556,578 cheapest (line, mutator, result) edges, built in 261.5 s._
- Inverse check: 6,556,578 edges, 0 without a same-fee reverse edge.

## 4. Dynamics: three selfish climbers sharing one line

Rules: prime-landing/big-prime, treasure/prime-terms, whole-crossing/k-spf. From each of 30 newborn lines, the three take turns;
each takes the offered call that raises its own bits most per ⚡ (charge W + 0.05·W², W ≤ 40), or passes when none
does. 300 turns. A fixed point is three passes in a row. "Lines" is the number of distinct lines the object visited;
"revisits" the share of moves onto a line it had held before (a tug of war).

| Mutator set | Runs that reach a fixed point | Mean turns to it | Mean distinct lines | Revisits | Mean table total at the end | Mean bits each at the end |
|---|--:|--:|--:|--:|--:|--:|
| additive only (the unit-path baseline) | 0% | – | 11.8 | 96% | 223.9 | 5.5, 5.3, 7.1 |
| existing nine | 0% | – | 10.2 | 96% | 276.6 | 6.8, 4.7, 8.5 |
| all eighteen | 0% | – | 14.6 | 94% | 118.8 | 2.8, 1.8, 10.0 |
| the nine + the five as built (line-q-lenses, weighted which) | 0% | – | 11.4 | 95% | 196.0 | 5.0, 2.4, 9.2 |

## 5. Balance and dynamics: the nine against the nine + the five as built (line-q-lenses)

43 rules of the beginner pool (every family with each tie-breaker that has values on line-q), 60 seeded
three-rule tables of three different families, 30 newborn lines each. On each line the three take turns as selfish
climbers: each takes the offered call that raises its own bits most per ⚡ (charge W + 0.05·W², W ≤ 40), or passes;
300 turns; a fixed point is three passes in a row. "Time-mean" is a seat's bits averaged over the 300 turns. Values took
8.8 s.

| Menu | Runs reaching a fixed point | Distinct lines | Revisits | Lens moves | Table total at the end | Time-mean bits per seat | Leader's share of the time-mean bits | Runs one seat leads with > 60% |
|---|--:|--:|--:|--:|--:|--:|--:|--:|
| the nine | 0% | 10.4 | 96% | 0% | 202.5 | 5.96 | 47% | 9% |
| the nine + the five as built | 0% | 11.4 | 96% | 25% | 186.8 | 5.96 | 46% | 6% |

Per rule (seats over all tables and lines): the change in its time-mean bits from the nine to the fourteen, and its
advantage (that change minus its two tablemates' mean change), ± one standard error; "lens moves" is the share of its
own moves made with one of the five. A rule with an advantage above 1 bit and 3 standard errors is flagged.

| Rule | Seats | Change (bits) | Advantage (bits) | Lens moves | Flag |
|---|--:|--:|--:|--:|---|
| prime-landing/m-spf | 120 | 2.35 ± 0.32 | 2.23 ± 0.35 | 52% | **advantaged** |
| same-on-both-rulers/prime-start | 120 | 1.59 ± 0.17 | 2.14 ± 0.27 | 27% | **advantaged** |
| same-on-both-rulers/steep | 120 | 1.02 ± 0.22 | 1.87 ± 0.29 | 37% | **advantaged** |
| treasure/prime-gradient | 60 | 0.71 ± 0.21 | 1.13 ± 0.33 | 37% | **advantaged** |
| prime-landing/next-prime | 30 | 0.42 ± 0.12 | 1.09 ± 0.36 | 36% | **advantaged** |
| divisibility-ladder/m-gpf | 90 | -0.64 ± 0.19 | 1.08 ± 0.15 | 30% | **advantaged** |
| treasure/m-gpf | 120 | 0.61 ± 0.17 | 0.80 ± 0.17 | 25% |  |
| treasure/prime-terms | 120 | 0.04 ± 0.11 | 0.72 ± 0.14 | 53% |  |
| divisibility-ladder/m-prime | 150 | 0.59 ± 0.14 | 0.60 ± 0.18 | 32% |  |
| treasure/m-spf | 150 | 0.45 ± 0.12 | 0.57 ± 0.17 | 22% |  |
| treasure/square-start | 150 | 0.26 ± 0.12 | 0.50 ± 0.12 | 24% |  |
| prime-landing/big-prime | 90 | 0.36 ± 0.19 | 0.50 ± 0.13 | 33% |  |
| prime-staircase/first-prime | 60 | 0.33 ± 0.26 | 0.47 ± 0.28 | 22% |  |
| pythagorean-area/prime-height | 150 | 0.43 ± 0.12 | 0.42 ± 0.12 | 41% |  |
| prime-landing/m-gpf | 90 | 0.24 ± 0.16 | 0.34 ± 0.16 | 39% |  |
| prime-landing/prime-gradient | 120 | 0.32 ± 0.10 | 0.26 ± 0.15 | 1% |  |
| exact-change/big-piles | 90 | 0.07 ± 0.16 | 0.22 ± 0.25 | 11% |  |
| ruler/square-area | 90 | -0.02 ± 0.22 | 0.20 ± 0.27 | 11% |  |
| prime-staircase/last-prime | 90 | -0.12 ± 0.12 | 0.10 ± 0.13 | 32% |  |
| divisibility-ladder/steep | 240 | 0.08 ± 0.05 | -0.06 ± 0.06 | 11% |  |
| ruler/far | 300 | -0.54 ± 0.11 | -0.08 ± 0.12 | 8% |  |
| prime-staircase/step-back | 180 | 0.23 ± 0.15 | -0.10 ± 0.20 | 36% |  |
| divisibility-ladder/m-spf | 60 | 0.06 ± 0.15 | -0.11 ± 0.21 | 5% |  |
| square-area/lpf | 90 | -0.14 ± 0.17 | -0.14 ± 0.18 | 10% |  |
| prime-staircase/near-miss | 60 | -0.18 ± 0.24 | -0.19 ± 0.26 | 20% |  |
| same-on-both-rulers/whole-lamp | 60 | -0.44 ± 0.14 | -0.21 ± 0.14 | 6% |  |
| ruler/prime-gradient | 60 | -0.39 ± 0.33 | -0.23 ± 0.41 | 6% |  |
| prime-gradient/prime | 150 | -0.08 ± 0.15 | -0.23 ± 0.20 | 55% |  |
| pythagorean-area/whole-legs | 240 | -0.52 ± 0.11 | -0.25 ± 0.10 | 20% |  |
| prime-gradient/c-gpf | 150 | 0.79 ± 0.21 | -0.27 ± 0.20 | 29% |  |
| exact-change/big-bill | 270 | -0.26 ± 0.08 | -0.28 ± 0.10 | 22% |  |
| same-on-both-rulers/m-gpf | 150 | -0.25 ± 0.14 | -0.35 ± 0.15 | 13% |  |
| whole-crossing/m-spf | 150 | -0.18 ± 0.14 | -0.45 ± 0.09 | 35% |  |
| prime-gradient/cPrime | 90 | 0.26 ± 0.19 | -0.47 ± 0.25 | 44% |  |
| prime-gradient/c-spf | 240 | -0.60 ± 0.16 | -0.54 ± 0.17 | 13% |  |
| square-area/spf | 210 | -0.57 ± 0.15 | -0.67 ± 0.18 | 23% |  |
| pythagorean-area/slanted-square | 60 | 0.27 ± 0.31 | -0.69 ± 0.45 | 17% |  |
| whole-crossing/k-spf | 60 | -0.53 ± 0.17 | -0.81 ± 0.29 | 1% |  |
| exact-change/prime-coins | 180 | -0.69 ± 0.15 | -1.03 ± 0.16 | 20% | disadvantaged |
| same-on-both-rulers/m-spf | 150 | -0.39 ± 0.24 | -1.17 ± 0.31 | 47% | disadvantaged |
| same-on-both-rulers/whole-values | 90 | -0.66 ± 0.14 | -1.39 ± 0.23 | 48% | disadvantaged |
| whole-crossing/k-gpf | 150 | -1.27 ± 0.23 | -1.93 ± 0.30 | 16% | disadvantaged |

Cheap peaks: the cheapest energy from a newborn line to a line within 90% of its table's best total in the box
(1800 table–line pairs). The nine: median 44 ⚡, p10 27; the fourteen: median
42 ⚡, p10 27. Nine over fourteen: median 0.97, p90 1.22,
max 4.96; 2% of pairs at least 1.5× cheaper.
