seeds per cell: 20

Invasion fitness I[s, t] (rows: mutant s; cols: field t; Δz vs an incumbent at the same seat; * = 95% CI excludes 0):

| mutant \ field | greedy_private | saver | burst | planner |
|---|---|---|---|---|
| greedy_private | · | -0.12* | -0.10 | +0.05 |
| saver | +0.13 | · | +0.22* | +0.18* |
| burst | +0.10 | -0.18* | · | +0.08 |
| planner | -0.07 | -0.17* | +0.03 | · |

Mutant mean z in field (0.5 = average):

| mutant \ field | greedy_private | saver | burst | planner |
|---|---|---|---|---|
| greedy_private | 0.63 | 0.53 | 0.45 | 0.58 |
| saver | 0.77 | 0.65 | 0.77 | 0.72 |
| burst | 0.73 | 0.47 | 0.55 | 0.62 |
| planner | 0.57 | 0.48 | 0.58 | 0.53 |

Replicator dynamics (pairwise approximation, uniform start) end state: saver 1.00
Not invaded by any mutant at 95%: greedy_private, saver

Homogeneous populations (all four gods play t):

| population | dynamism2 | dynamism | welfare | sig_tension_rate | climbs_held_accel_per_100s | crossings_per_pair_100s | mutator_entropy_norm | steal_rate | energy_unspent_share | agents |
|---|---|---|---|---|---|---|---|---|---|---|
| greedy_private | 0.514 [0.467, 0.562] | 0.727 [0.698, 0.752] | 5481 [1939, 10774] | 0.089 [0.072, 0.105] | 0.810 [0.177, 1.692] | 4.175 [3.298, 4.994] | 0.874 [0.861, 0.885] | 0.015 [0.011, 0.021] | 0.037 [0.020, 0.059] | 212 [143, 290] |
| saver | 0.563 [0.525, 0.604] | 0.755 [0.725, 0.783] | 43906 [16129, 80800] | 0.264 [0.215, 0.313] | 0.704 [0.324, 1.233] | 2.717 [2.137, 3.369] | 0.855 [0.838, 0.871] | 0.154 [0.113, 0.197] | 0.347 [0.301, 0.392] | 57 [44, 72] |
| burst | 0.539 [0.492, 0.588] | 0.756 [0.724, 0.782] | 23146 [5758, 50640] | 0.160 [0.130, 0.189] | 0.674 [0.199, 1.412] | 3.796 [2.920, 4.789] | 0.906 [0.888, 0.921] | 0.055 [0.038, 0.072] | 0.152 [0.111, 0.194] | 96 [66, 129] |
| planner | 0.534 [0.492, 0.580] | 0.648 [0.623, 0.674] | 5038 [1960, 8752] | 0.065 [0.054, 0.076] | 1.078 [0.525, 1.727] | 3.281 [2.526, 4.150] | 0.624 [0.581, 0.665] | 0.014 [0.011, 0.019] | 0.026 [0.011, 0.050] | 312 [209, 417] |
