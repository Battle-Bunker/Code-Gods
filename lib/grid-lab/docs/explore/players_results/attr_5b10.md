seeds per cell: 20

Invasion fitness I[s, t] (rows: mutant s; cols: field t; Δz vs an incumbent at the same seat; * = 95% CI excludes 0):

| mutant \ field | greedy_private | saver | burst |
|---|---|---|---|
| greedy_private | · | -0.23* | +nan |
| saver | +0.07 | · | +nan |
| k32_bar | +0.18* | +0.02 | +nan |
| k32_save | +0.02 | -0.12* | +nan |
| k12_saver | +0.18* | +0.00 | +nan |
| save30 | +0.18* | -0.05 | +nan |
| save90 | +0.17 | -0.02 | +nan |
| bar90 | +0.07 | -0.03 | +nan |
| saver_ridge | +0.10 | +0.02 | +nan |
| saver_bandit | +0.20* | -0.05 | +nan |
| saver_copycat | +0.25* | -0.02 | +nan |
| saver_planner | +0.23* | +0.03 | +nan |
| saver_afford | +0.25* | +0.10 | +nan |
| saver_parasite | -0.20* | -0.27* | +nan |

Mutant mean z in field (0.5 = average):

| mutant \ field | greedy_private | saver | burst |
|---|---|---|---|
| greedy_private | 0.67 | 0.35 | 0.45 |
| saver | 0.73 | 0.58 | 0.78 |
| k32_bar | 0.85 | 0.60 | 0.63 |
| k32_save | 0.68 | 0.47 | 0.60 |
| k12_saver | 0.85 | 0.58 | 0.63 |
| save30 | 0.85 | 0.53 | 0.58 |
| save90 | 0.83 | 0.57 | 0.67 |
| bar90 | 0.73 | 0.55 | 0.60 |
| saver_ridge | 0.77 | 0.60 | 0.78 |
| saver_bandit | 0.87 | 0.53 | 0.65 |
| saver_copycat | 0.92 | 0.57 | 0.63 |
| saver_planner | 0.90 | 0.62 | 0.75 |
| saver_afford | 0.92 | 0.68 | 0.62 |
| saver_parasite | 0.47 | 0.32 | 0.38 |

Homogeneous populations (all four gods play t):

| population | dynamism2 | dynamism | welfare | sig_tension_rate | climbs_held_accel_per_100s | crossings_per_pair_100s | mutator_entropy_norm | steal_rate | energy_unspent_share | agents |
|---|---|---|---|---|---|---|---|---|---|---|
| greedy_private | 0.460 [0.398, 0.522] | 0.724 [0.705, 0.742] | 3143 [1380, 5318] | 0.078 [0.062, 0.093] | 0.710 [0.163, 1.426] | 3.358 [2.506, 4.190] | 0.809 [0.794, 0.823] | 0.010 [0.006, 0.015] | 0.062 [0.036, 0.098] | 120 [81, 164] |
| saver | 0.560 [0.494, 0.618] | 0.766 [0.730, 0.794] | 36023 [8643, 79020] | 0.222 [0.177, 0.270] | 0.911 [0.354, 1.657] | 3.247 [2.781, 3.803] | 0.833 [0.813, 0.850] | 0.103 [0.070, 0.143] | 0.246 [0.213, 0.281] | 46 [34, 60] |
