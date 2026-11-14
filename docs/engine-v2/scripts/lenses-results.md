# Lenses and mutators: script output (scripts/lenses.ts --H 16 --sources 30)

Analysis for docs/engine-v2/lenses-and-mutators.md. Nothing here changes the engine.

## Check: the fast model against the engine (line-q, box H = 16, 14688 lines)
- 9356 (line, mutator, result) cheapest fees compared with the engine's own enumeration of arguments: 0 differ; 0 are cheaper in the engine through arguments past this model's limits (a pivot about a farther x0).

_Graph: 14688 lines, 4,753,436 cheapest (line, mutator, result) edges, built in 46.7 s._
- Inverse check: 4,753,436 edges, 0 without a same-fee reverse edge.
_Dijkstra from 30 sources × 12 mutator sets: 22.9 s._

## 1. Cost topology (line-q, box |a|, |b|, |c| ≤ 16; charge = W + 0.05·W², one call per act)

Route cost between 30 newborn lines (drawn from π) and 40 targets (half from π, half lines of 18–30 bits).
"Gain" is the baseline's cheapest route cost over this set's cheapest route cost, per pair.

| Mutator set | Median route ⚡ | Gain over additive-only: median | p90 | Share ≥ 1.5× | Gain over the nine: median | p90 | Share ≥ 1.25× | Lines within 30 ⚡ | 60 ⚡ | 120 ⚡ |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| additive only (the unit-path baseline) | 51 | 1.00 | 1.00 | 0% | 0.85 | 1.00 | 0% | 286 | 7770 | 14688 |
| existing nine | 42 | 1.17 | 1.59 | 14% | 1.00 | 1.00 | 0% | 711 | 11490 | 14688 |
| nine + rot.turn | 43 | 1.15 | 1.56 | 12% | 0.97 | 1.01 | 0% | 661 | 11080 | 14688 |
| nine + rot.fold | 43 | 1.14 | 1.55 | 12% | 0.97 | 0.98 | 1% | 622 | 10951 | 14688 |
| nine + mirror.any | 43 | 1.14 | 1.55 | 12% | 0.97 | 0.98 | 0% | 617 | 10912 | 14688 |
| nine + basis.lean | 42 | 1.21 | 1.62 | 16% | 1.00 | 1.12 | 1% | 802 | 12587 | 14688 |
| nine + basis.zoom | 42 | 1.17 | 1.61 | 15% | 0.97 | 1.07 | 3% | 697 | 11299 | 14688 |
| nine + pole.slide | 41 | 1.21 | 1.67 | 18% | 0.99 | 1.16 | 5% | 814 | 12541 | 14688 |
| nine + sb.step | 43 | 1.16 | 1.56 | 12% | 0.97 | 1.04 | 0% | 665 | 11289 | 14688 |
| nine + coef.swap | 38 | 1.26 | 1.93 | 27% | 1.01 | 1.39 | 14% | 1003 | 12411 | 14688 |
| nine + orbit.turn | 43 | 1.16 | 1.59 | 13% | 0.97 | 1.01 | 1% | 678 | 11182 | 14688 |
| all eighteen | 40 | 1.23 | 1.84 | 23% | 1.01 | 1.32 | 13% | 799 | 11894 | 14688 |

Acts on the cheapest routes with all eighteen offered (share of acts, over every source–target pair):

| Mutator | Share of acts |
|---|--:|
| basis.lean | 17% |
| coef.swap | 12% |
| seq.step | 11% |
| pole.slide | 9% |
| si.shift | 9% |
| si.tilt | 8% |
| mach.stretch | 8% |
| basis.zoom | 7% |
| sb.step | 4% |
| gen.nudge | 3% |
| int.move | 3% |
| orbit.turn | 3% |
| rot.turn | 2% |
| cart.slide | 2% |
| cart.mirror | 2% |
| cart.pivot | 1% |
| mirror.any | 0% |
| rot.fold | 0% |

Largest shortcuts (all eighteen against the nine):

| From | To | The nine ⚡ | All eighteen ⚡ | Gain |
|---|---|--:|--:|--:|
| y = −4 | y = −1/4 | 27 | 7 | 4.21 |
| y = 3 | y = 1/3 | 22 | 7 | 3.37 |
| y = −1/4x | y = −1/4 | 19 | 7 | 2.97 |
| x = 10 | y = 9x | 54 | 20 | 2.76 |
| x = −4 | y = −1/4 | 34 | 13 | 2.60 |
| y = −8 | y = −8x − 1 | 43 | 18 | 2.35 |

## 2. Collateral damage (line-q, box H = 16; 11 beginner rules, each with its first tie-breaker; values from the committed value functions; 1.5 s)

For every line s and every call of a mutator from s with W ≤ 30 bits (a local move) that raises some rule i's bits,
each other rule j that held at least 2 bits at s: the share of those calls that destroy at least half of j's bits.
Rows: mutators. Columns: the rule that suffers (j). "Keeps" is the share that leave j's bits unchanged or higher.

| Mutator | PL | SA | WC | DL | T | SOBR | PG | PS | R | EC | PA | Mean destroy | Mean keeps | Improving calls |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| si.shift | 35% | 4% | 54% | 22% | 7% | 33% | 0% | 81% | 13% | 3% | 5% | 13% | 55% | 101,391 |
| si.tilt | 0% | 3% | 80% | 29% | 29% | 25% | 36% | 1% | 11% | 39% | 5% | 18% | 51% | 102,805 |
| seq.step | 30% | 7% | 81% | 18% | 10% | 28% | 29% | 81% | 16% | 28% | 9% | 19% | 46% | 81,654 |
| cart.pivot | 28% | 6% | 81% | 27% | 24% | 35% | 29% | 64% | 16% | 31% | 9% | 21% | 46% | 412,393 |
| cart.slide | 44% | 4% | 58% | 44% | 9% | 43% | 0% | 90% | 13% | 4% | 6% | 16% | 52% | 326,756 |
| cart.mirror | 55% | 0% | 22% | 37% | 55% | 42% | 58% | 70% | 0% | 59% | 0% | 25% | 71% | 49,179 |
| gen.nudge | 4% | 2% | 41% | 48% | 1% | 8% | 3% | 60% | 7% | 6% | 3% | 7% | 57% | 243,967 |
| int.move | 19% | 2% | 31% | 49% | 36% | 30% | 38% | 50% | 6% | 39% | 1% | 19% | 50% | 58,166 |
| mach.stretch | 52% | 1% | 0% | 55% | 48% | 33% | 53% | 96% | 8% | 53% | 3% | 26% | 42% | 207,184 |
| rot.turn | 37% | 13% | 79% | 53% | 40% | 49% | 55% | 77% | 28% | 58% | 18% | 36% | 37% | 390,769 |
| rot.fold | 39% | 7% | 52% | 50% | 52% | 47% | 76% | 76% | 18% | 76% | 10% | 35% | 41% | 142,249 |
| mirror.any | 50% | 5% | 67% | 54% | 60% | 51% | 69% | 92% | 14% | 70% | 7% | 35% | 39% | 837,606 |
| basis.lean | 36% | 1% | 0% | 67% | 34% | 26% | 36% | 97% | 9% | 37% | 3% | 20% | 47% | 98,568 |
| basis.zoom | 50% | 1% | 51% | 37% | 12% | 50% | 0% | 90% | 10% | 4% | 3% | 16% | 52% | 202,538 |
| pole.slide | 24% | 4% | 68% | 62% | 33% | 29% | 37% | 79% | 9% | 39% | 5% | 22% | 46% | 404,021 |
| sb.step | 0% | 2% | 60% | 24% | 2% | 4% | 8% | 1% | 8% | 2% | 1% | 6% | 60% | 7,809 |
| coef.swap | 29% | 2% | 79% | 49% | 32% | 39% | 53% | 97% | 14% | 52% | 7% | 26% | 43% | 27,945 |
| orbit.turn | 47% | 1% | 81% | 76% | 78% | 48% | 92% | 95% | 1% | 91% | 1% | 37% | 55% | 39,600 |

Columns: PL = prime-landing/big-prime; SA = square-area/spf; WC = whole-crossing/k-spf; DL = divisibility-ladder/m-spf; T = treasure/prime-terms; SOBR = same-on-both-rulers/steep; PG = prime-gradient/prime; PS = prime-staircase/first-prime; R = ruler/far; EC = exact-change/big-piles; PA = pythagorean-area/slanted-square.

### 2.1 What each mutator leaves alone (share of local calls, W ≤ 30, that keep the number unchanged)

| Mutator | gradient | y-intercept | x-intercept | y(1) | distance² to O | pole | a + b + c | triangle area |
|---|--:|--:|--:|--:|--:|--:|--:|--:|
| si.shift | 100% | 0% | 2% | 0% | 2% | 0% | 1% | 5% |
| si.tilt | 0% | 100% | 2% | 0% | 5% | 2% | 1% | 5% |
| seq.step | 0% | 0% | 3% | 100% | 0% | 0% | 85% | 0% |
| cart.pivot | 0% | 23% | 2% | 9% | 1% | 1% | 9% | 1% |
| cart.slide | 100% | 1% | 1% | 1% | 2% | 0% | 1% | 4% |
| cart.mirror | 26% | 26% | 26% | 2% | 100% | 1% | 14% | 100% |
| gen.nudge | 35% | 35% | 33% | 2% | 2% | 1% | 0% | 5% |
| int.move | 0% | 50% | 50% | 4% | 8% | 0% | 5% | 8% |
| mach.stretch | 3% | 3% | 100% | 3% | 3% | 3% | 2% | 7% |
| rot.turn | 0% | 13% | 4% | 10% | 1% | 1% | 7% | 2% |
| rot.fold | 0% | 16% | 4% | 9% | 15% | 1% | 8% | 14% |
| mirror.any | 5% | 3% | 3% | 2% | 13% | 0% | 4% | 12% |
| basis.lean | 0% | 2% | 100% | 2% | 5% | 2% | 1% | 5% |
| basis.zoom | 100% | 3% | 3% | 3% | 0% | 0% | 1% | 7% |
| pole.slide | 2% | 22% | 22% | 2% | 2% | 0% | 6% | 3% |
| sb.step | 0% | 100% | 6% | 0% | 6% | 6% | 3% | 6% |
| coef.swap | 2% | 2% | 2% | 51% | 2% | 0% | 74% | 4% |
| orbit.turn | 0% | 6% | 6% | 0% | 100% | 1% | 5% | 83% |

### 2.2 The best three-rule table state within a budget, per mutator set

Rules: prime-landing/big-prime, treasure/prime-terms, whole-crossing/k-spf. Mean over the 30 sources of the best table total
reachable within the budget, and the mean number of lines a searcher must score to know it (the reachable set).

| Mutator set | Best within 30 ⚡ | lines | 60 ⚡ | lines | 120 ⚡ | lines | Box optimum |
|---|--:|--:|--:|--:|--:|--:|--:|
| additive only (the unit-path baseline) | 118.5 | 286 | 347.1 | 7770 | 454.9 | 14688 | 454.9 |
| existing nine | 210.7 | 711 | 445.7 | 11490 | 454.9 | 14688 | 454.9 |
| nine + rot.turn | 205.3 | 661 | 445.1 | 11080 | 454.9 | 14688 | 454.9 |
| nine + rot.fold | 203.0 | 622 | 444.4 | 10951 | 454.9 | 14688 | 454.9 |
| nine + mirror.any | 203.0 | 617 | 444.4 | 10912 | 454.9 | 14688 | 454.9 |
| nine + basis.lean | 214.8 | 802 | 444.4 | 12587 | 454.9 | 14688 | 454.9 |
| nine + basis.zoom | 210.0 | 697 | 450.9 | 11299 | 454.9 | 14688 | 454.9 |
| nine + pole.slide | 223.8 | 814 | 447.9 | 12541 | 454.9 | 14688 | 454.9 |
| nine + sb.step | 203.0 | 665 | 444.4 | 11289 | 454.9 | 14688 | 454.9 |
| nine + coef.swap | 253.5 | 1003 | 447.9 | 12411 | 454.9 | 14688 | 454.9 |
| nine + orbit.turn | 205.8 | 678 | 445.0 | 11182 | 454.9 | 14688 | 454.9 |
| all eighteen | 231.8 | 799 | 442.2 | 11894 | 454.9 | 14688 | 454.9 |

The box optimum is y = x + 13 (11.6, 4.7, 10.6 bits).

## 3. Keep a point, change the gradient: a turn against a pivot (the owner's example)

A line from π (non-vertical), a point on it at x0 (from the pivot's list), and a wanted gradient m′ (the gradient of
another line from π, ≠ m). Both moves end on the same line (through the point, gradient m′), so the surcharge is the
same; compared: the fee of one pivot act (m += m′ − m), a pivot path (the whole part of m′ − m in unit acts, the
fraction in one act) and one turn (tan θ = (m′ − m)/(1 + m·m′), or a quarter turn), with
eighteen mutators offered. Charge = W + 0.05·W² per act, surcharge left out.

- 1494 cases. One turn is cheaper than one pivot act in 90% of them, and cheaper than the pivot path
  in 90%. Pivot cost over turn cost: median 3.59, p10 0.93, p90 31.05.
- y = −7/6x + 4/3 → gradient 3/7 about x = 2: pivot 28148 ⚡, turn 93 ⚡
- y = 13x − 2 → gradient 0 about x = −1/2: pivot 228 ⚡, turn 41 ⚡
- y = 15/4x − 1/4 → gradient 0 about x = 4: pivot 401 ⚡, turn 57 ⚡
- y = −1 → gradient 14/3 about x = 1/2: pivot 215 ⚡, turn 47 ⚡

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
