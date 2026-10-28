seeds per cell: 48

Invasion fitness I[s, t] (rows: mutant s; cols: field t; Δz vs an incumbent at the same seat; * = 95% CI excludes 0):

| mutant \ field | greedy_private | saver |
|---|---|---|
| greedy_private | · | -0.19* |
| saver | +0.20* | · |
| k32_bar | +0.21* | -0.07* |
| k32_save | +0.11* | -0.08* |
| saver_planner | +0.13* | +0.01 |
| saver_afford | +0.21* | -0.01 |
| ridge | -0.03 | -0.13* |
| parasite | -0.07 | -0.22* |
| talker | +0.01 | -0.12* |

Mutant mean z in field (0.5 = average):

| mutant \ field | greedy_private | saver |
|---|---|---|
| greedy_private | 0.53 | 0.37 |
| saver | 0.74 | 0.56 |
| k32_bar | 0.74 | 0.49 |
| k32_save | 0.65 | 0.48 |
| saver_planner | 0.67 | 0.56 |
| saver_afford | 0.74 | 0.55 |
| ridge | 0.51 | 0.42 |
| parasite | 0.47 | 0.34 |
| talker | 0.54 | 0.44 |

Homogeneous populations (all four gods play t):

| population | dynamism2 | dynamism | welfare | sig_tension_rate | climbs_held_accel_per_100s | crossings_per_pair_100s | mutator_entropy_norm | steal_rate | energy_unspent_share | agents |
|---|---|---|---|---|---|---|---|---|---|---|
| greedy_private | 0.501 [0.465, 0.542] | 0.723 [0.703, 0.740] | 5987 [2374, 10981] | 0.112 [0.098, 0.124] | 1.089 [0.450, 1.947] | 3.860 [3.178, 4.587] | 0.820 [0.810, 0.829] | 0.019 [0.015, 0.022] | 0.052 [0.039, 0.068] | 120 [94, 148] |
| saver | 0.566 [0.534, 0.600] | 0.744 [0.721, 0.768] | 47252 [20174, 89170] | 0.288 [0.260, 0.314] | 0.924 [0.519, 1.443] | 2.875 [2.421, 3.434] | 0.808 [0.791, 0.824] | 0.136 [0.117, 0.156] | 0.247 [0.222, 0.270] | 46 [37, 55] |
