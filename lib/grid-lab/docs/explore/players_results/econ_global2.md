seeds per cell: 20

Invasion fitness I[s, t] (rows: mutant s; cols: field t; Δz vs an incumbent at the same seat; * = 95% CI excludes 0):

| mutant \ field | greedy_private | saver | burst | planner |
|---|---|---|---|---|
| greedy_private | · | -0.08 | -0.07 | -0.00 |
| saver | +0.28* | · | +0.17* | +0.20* |
| burst | +0.12* | -0.00 | · | +0.00 |
| planner | +0.03 | -0.12 | -0.03 | · |

Mutant mean z in field (0.5 = average):

| mutant \ field | greedy_private | saver | burst | planner |
|---|---|---|---|---|
| greedy_private | 0.40 | 0.40 | 0.42 | 0.58 |
| saver | 0.68 | 0.48 | 0.65 | 0.78 |
| burst | 0.52 | 0.48 | 0.48 | 0.58 |
| planner | 0.43 | 0.37 | 0.45 | 0.58 |

Replicator dynamics (pairwise approximation, uniform start) end state: saver 0.97, burst 0.03
Not invaded by any mutant at 95%: saver

Homogeneous populations (all four gods play t):

| population | dynamism2 | dynamism | welfare | sig_tension_rate | climbs_held_accel_per_100s | crossings_per_pair_100s | mutator_entropy_norm | steal_rate | energy_unspent_share | agents |
|---|---|---|---|---|---|---|---|---|---|---|
| greedy_private | 0.467 [0.412, 0.524] | 0.709 [0.675, 0.739] | 2849 [1267, 5140] | 0.076 [0.065, 0.086] | 0.676 [0.182, 1.342] | 3.767 [2.692, 4.993] | 0.804 [0.785, 0.821] | 0.008 [0.006, 0.009] | 0.055 [0.032, 0.085] | 120 [81, 165] |
| saver | 0.548 [0.484, 0.606] | 0.739 [0.707, 0.768] | 30810 [7121, 67011] | 0.188 [0.151, 0.230] | 0.954 [0.342, 1.743] | 2.818 [2.182, 3.577] | 0.792 [0.766, 0.817] | 0.071 [0.044, 0.104] | 0.287 [0.245, 0.330] | 48 [34, 65] |
| burst | 0.520 [0.457, 0.586] | 0.722 [0.690, 0.753] | 4591 [2080, 7976] | 0.125 [0.105, 0.145] | 0.884 [0.304, 1.689] | 3.228 [2.235, 4.406] | 0.826 [0.791, 0.858] | 0.023 [0.016, 0.031] | 0.164 [0.116, 0.217] | 69 [47, 95] |
| planner | 0.459 [0.403, 0.515] | 0.677 [0.647, 0.705] | 2540 [1605, 3477] | 0.067 [0.048, 0.088] | 0.601 [0.216, 1.104] | 3.447 [2.466, 4.466] | 0.675 [0.656, 0.696] | 0.008 [0.005, 0.012] | 0.022 [0.015, 0.029] | 159 [107, 219] |
