seeds per cell: 20

Invasion fitness I[s, t] (rows: mutant s; cols: field t; Δz vs an incumbent at the same seat; * = 95% CI excludes 0):

| mutant \ field | greedy_private | saver | burst | planner |
|---|---|---|---|---|
| greedy_private | · | -0.18* | -0.15* | -0.12 |
| saver | +0.18* | · | +0.17* | +0.03 |
| burst | +0.22* | -0.20* | · | +0.07 |
| planner | -0.05 | -0.17 | +0.02 | · |

Mutant mean z in field (0.5 = average):

| mutant \ field | greedy_private | saver | burst | planner |
|---|---|---|---|---|
| greedy_private | 0.55 | 0.40 | 0.32 | 0.52 |
| saver | 0.73 | 0.58 | 0.63 | 0.67 |
| burst | 0.77 | 0.38 | 0.47 | 0.70 |
| planner | 0.50 | 0.42 | 0.48 | 0.63 |

Replicator dynamics (pairwise approximation, uniform start) end state: saver 1.00
Not invaded by any mutant at 95%: saver, planner

Homogeneous populations (all four gods play t):

| population | dynamism2 | dynamism | welfare | sig_tension_rate | climbs_held_accel_per_100s | crossings_per_pair_100s | mutator_entropy_norm | steal_rate | energy_unspent_share | agents |
|---|---|---|---|---|---|---|---|---|---|---|
| greedy_private | 0.449 [0.403, 0.495] | 0.693 [0.660, 0.719] | 1591 [989, 2326] | 0.051 [0.041, 0.063] | 0.478 [0.204, 0.827] | 4.041 [2.910, 5.199] | 0.714 [0.690, 0.737] | 0.005 [0.003, 0.008] | 0.073 [0.045, 0.109] | 67 [44, 92] |
| saver | 0.523 [0.448, 0.594] | 0.714 [0.678, 0.746] | 14541 [3715, 30574] | 0.119 [0.092, 0.149] | 1.014 [0.291, 1.848] | 3.512 [2.346, 4.938] | 0.753 [0.706, 0.798] | 0.033 [0.019, 0.050] | 0.197 [0.159, 0.240] | 37 [26, 49] |
| burst | 0.522 [0.454, 0.587] | 0.702 [0.670, 0.731] | 6768 [2409, 13161] | 0.091 [0.069, 0.114] | 1.238 [0.509, 2.153] | 3.697 [2.631, 4.959] | 0.757 [0.707, 0.803] | 0.017 [0.010, 0.026] | 0.170 [0.118, 0.231] | 42 [28, 58] |
| planner | 0.471 [0.416, 0.526] | 0.608 [0.563, 0.650] | 4292 [1504, 7527] | 0.061 [0.045, 0.078] | 0.837 [0.350, 1.406] | 3.138 [2.204, 4.267] | 0.435 [0.387, 0.486] | 0.009 [0.005, 0.013] | 0.046 [0.024, 0.076] | 88 [59, 121] |
