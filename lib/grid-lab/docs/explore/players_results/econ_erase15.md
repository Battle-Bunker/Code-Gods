seeds per cell: 20

Invasion fitness I[s, t] (rows: mutant s; cols: field t; Δz vs an incumbent at the same seat; * = 95% CI excludes 0):

| mutant \ field | greedy_private | saver | burst | planner |
|---|---|---|---|---|
| greedy_private | · | -0.08 | -0.05 | +0.00 |
| saver | +0.35* | · | +0.03 | +0.28* |
| burst | +0.22* | +0.07 | · | +0.13* |
| planner | +0.10 | -0.07 | -0.13 | · |

Mutant mean z in field (0.5 = average):

| mutant \ field | greedy_private | saver | burst | planner |
|---|---|---|---|---|
| greedy_private | 0.48 | 0.37 | 0.48 | 0.52 |
| saver | 0.83 | 0.45 | 0.57 | 0.80 |
| burst | 0.70 | 0.52 | 0.53 | 0.65 |
| planner | 0.58 | 0.38 | 0.40 | 0.52 |

Replicator dynamics (pairwise approximation, uniform start) end state: burst 0.66, saver 0.34
Not invaded by any mutant at 95%: saver, burst

Homogeneous populations (all four gods play t):

| population | dynamism2 | dynamism | welfare | sig_tension_rate | climbs_held_accel_per_100s | crossings_per_pair_100s | mutator_entropy_norm | steal_rate | energy_unspent_share | agents |
|---|---|---|---|---|---|---|---|---|---|---|
| greedy_private | 0.414 [0.366, 0.467] | 0.724 [0.698, 0.746] | 1379 [822, 2074] | 0.062 [0.052, 0.072] | 0.413 [0.093, 0.849] | 4.753 [3.555, 5.974] | 0.783 [0.771, 0.795] | 0.005 [0.004, 0.007] | 0.057 [0.032, 0.090] | 120 [81, 164] |
| saver | 0.565 [0.496, 0.631] | 0.743 [0.715, 0.770] | 24669 [8514, 47622] | 0.172 [0.135, 0.210] | 1.097 [0.511, 1.805] | 3.067 [2.438, 3.725] | 0.805 [0.775, 0.836] | 0.068 [0.045, 0.097] | 0.255 [0.211, 0.299] | 45 [33, 59] |
| burst | 0.486 [0.426, 0.548] | 0.746 [0.721, 0.768] | 6210 [1686, 13975] | 0.106 [0.085, 0.127] | 0.776 [0.197, 1.707] | 3.168 [2.555, 3.801] | 0.827 [0.797, 0.856] | 0.018 [0.012, 0.025] | 0.155 [0.110, 0.200] | 64 [44, 87] |
| planner | 0.426 [0.372, 0.483] | 0.692 [0.667, 0.715] | 1572 [949, 2285] | 0.056 [0.046, 0.066] | 0.494 [0.134, 1.030] | 4.166 [3.329, 5.042] | 0.658 [0.638, 0.680] | 0.005 [0.003, 0.006] | 0.035 [0.017, 0.063] | 158 [106, 218] |
