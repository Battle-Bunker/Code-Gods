seeds per cell: 20

Invasion fitness I[s, t] (rows: mutant s; cols: field t; Δz vs an incumbent at the same seat; * = 95% CI excludes 0):

| mutant \ field | greedy_private | saver | burst | planner |
|---|---|---|---|---|
| greedy_private | · | -0.15* | -0.13 | +0.07 |
| saver | +0.28* | · | +0.10* | +0.23* |
| burst | +0.17* | -0.12* | · | +0.08 |
| planner | -0.02 | -0.17* | -0.13 | · |

Mutant mean z in field (0.5 = average):

| mutant \ field | greedy_private | saver | burst | planner |
|---|---|---|---|---|
| greedy_private | 0.60 | 0.38 | 0.43 | 0.57 |
| saver | 0.88 | 0.53 | 0.67 | 0.73 |
| burst | 0.77 | 0.42 | 0.57 | 0.58 |
| planner | 0.58 | 0.37 | 0.43 | 0.50 |

Replicator dynamics (pairwise approximation, uniform start) end state: saver 1.00
Not invaded by any mutant at 95%: saver

Homogeneous populations (all four gods play t):

| population | dynamism2 | dynamism | welfare | sig_tension_rate | climbs_held_accel_per_100s | crossings_per_pair_100s | mutator_entropy_norm | steal_rate | energy_unspent_share | agents |
|---|---|---|---|---|---|---|---|---|---|---|
| greedy_private | 0.444 [0.386, 0.507] | 0.709 [0.678, 0.734] | 3091 [1188, 5573] | 0.075 [0.057, 0.093] | 0.798 [0.093, 1.705] | 3.218 [2.280, 4.128] | 0.795 [0.781, 0.809] | 0.010 [0.006, 0.015] | 0.053 [0.032, 0.083] | 75 [53, 98] |
| saver | 0.537 [0.470, 0.598] | 0.760 [0.725, 0.789] | 24429 [6285, 53266] | 0.197 [0.156, 0.236] | 0.907 [0.346, 1.627] | 2.995 [2.383, 3.670] | 0.819 [0.801, 0.837] | 0.085 [0.056, 0.117] | 0.145 [0.116, 0.172] | 35 [27, 44] |
| burst | 0.522 [0.460, 0.582] | 0.744 [0.712, 0.770] | 14194 [3524, 33013] | 0.145 [0.111, 0.183] | 0.713 [0.206, 1.427] | 3.815 [2.802, 4.920] | 0.830 [0.798, 0.859] | 0.046 [0.028, 0.067] | 0.141 [0.103, 0.184] | 37 [27, 47] |
| planner | 0.487 [0.437, 0.539] | 0.627 [0.588, 0.665] | 5526 [3034, 8176] | 0.067 [0.052, 0.082] | 0.959 [0.354, 1.749] | 2.472 [1.872, 3.028] | 0.614 [0.573, 0.652] | 0.014 [0.010, 0.018] | 0.030 [0.015, 0.055] | 100 [71, 132] |
