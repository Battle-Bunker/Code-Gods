1008 games, 126 compositions, metric z

| strategy | f(uniform mix) | vs 3×greedy_private | vs 3×saver | vs 3×k32_bar | vs 3×saver_planner | vs 3×saver_afford | vs 3×saver_ridge |
|---|---|---|---|---|---|---|---|
| greedy_private | 0.377 | 0.50 | 0.42 | 0.46 | 0.38 | 0.33 | 0.38 |
| saver | 0.541 | 0.67 | 0.50 | 0.62 | 0.67 | 0.67 | 0.58 |
| k32_bar | 0.524 | 0.71 | 0.46 | 0.50 | 0.33 | 0.50 | 0.67 |
| saver_planner | 0.526 | 0.79 | 0.58 | 0.38 | 0.50 | 0.54 | 0.58 |
| saver_afford | 0.542 | 0.67 | 0.50 | 0.46 | 0.37 | 0.50 | 0.62 |
| saver_ridge | 0.491 | 0.67 | 0.33 | 0.46 | 0.38 | 0.29 | 0.50 |

Replicator attractors (basin share, Nash regret):
  1.00  regret 0.000  saver 0.46, saver_planner 0.29, k32_bar 0.26

Bootstrap over seeds (30×, uniform start): mean end state saver 0.52, saver_planner 0.22, k32_bar 0.15, saver_afford 0.11; largest share: saver 21/30, saver_planner 4/30, k32_bar 3/30, saver_afford 2/30
