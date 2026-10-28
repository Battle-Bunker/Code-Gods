seeds per cell: 20

Invasion fitness I[s, t] (rows: mutant s; cols: field t; Δz vs an incumbent at the same seat; * = 95% CI excludes 0):

| mutant \ field | greedy_private | saver | burst | planner |
|---|---|---|---|---|
| greedy_private | · | -0.20* | -0.10 | +0.18* |
| saver | +0.25* | · | +0.20* | +0.35* |
| burst | -0.00 | -0.23* | · | +0.20* |
| planner | +0.00 | -0.25* | -0.05 | · |

Mutant mean z in field (0.5 = average):

| mutant \ field | greedy_private | saver | burst | planner |
|---|---|---|---|---|
| greedy_private | 0.55 | 0.38 | 0.43 | 0.67 |
| saver | 0.80 | 0.58 | 0.73 | 0.83 |
| burst | 0.55 | 0.35 | 0.53 | 0.68 |
| planner | 0.55 | 0.33 | 0.48 | 0.48 |

Replicator dynamics (pairwise approximation, uniform start) end state: saver 1.00
Not invaded by any mutant at 95%: saver

Homogeneous populations (all four gods play t):

| population | dynamism2 | dynamism | welfare | sig_tension_rate | climbs_held_accel_per_100s | crossings_per_pair_100s | mutator_entropy_norm | steal_rate | energy_unspent_share | agents |
|---|---|---|---|---|---|---|---|---|---|---|
| greedy_private | 0.471 [0.420, 0.526] | 0.719 [0.699, 0.738] | 2475 [1104, 4180] | 0.073 [0.058, 0.087] | 0.745 [0.259, 1.369] | 4.046 [3.217, 4.986] | 0.801 [0.788, 0.812] | 0.008 [0.005, 0.013] | 0.065 [0.036, 0.101] | 119 [80, 164] |
| saver | 0.574 [0.508, 0.634] | 0.753 [0.717, 0.783] | 40003 [8357, 96528] | 0.223 [0.175, 0.272] | 0.948 [0.422, 1.605] | 2.760 [2.315, 3.259] | 0.832 [0.809, 0.854] | 0.104 [0.070, 0.140] | 0.169 [0.128, 0.211] | 58 [40, 77] |
| burst | 0.556 [0.489, 0.621] | 0.741 [0.717, 0.762] | 16678 [4144, 38933] | 0.148 [0.114, 0.184] | 1.068 [0.449, 1.824] | 3.387 [2.387, 4.583] | 0.840 [0.808, 0.870] | 0.050 [0.029, 0.077] | 0.151 [0.111, 0.197] | 63 [42, 87] |
| planner | 0.459 [0.414, 0.501] | 0.650 [0.620, 0.678] | 2006 [1170, 3006] | 0.062 [0.048, 0.077] | 0.466 [0.218, 0.742] | 2.785 [2.176, 3.449] | 0.652 [0.622, 0.679] | 0.011 [0.007, 0.015] | 0.027 [0.016, 0.041] | 158 [106, 217] |
