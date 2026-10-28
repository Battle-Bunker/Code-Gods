1008 games, 126 compositions, metric z

| strategy | f(uniform mix) | vs 3×random | vs 3×greedy_private | vs 3×saver | vs 3×k32_bar | vs 3×afford | vs 3×parasite |
|---|---|---|---|---|---|---|---|
| random | 0.351 | 0.50 | 0.29 | 0.29 | 0.29 | 0.54 | 0.50 |
| greedy_private | 0.511 | 0.67 | 0.50 | 0.42 | 0.46 | 0.46 | 0.79 |
| saver | 0.693 | 0.79 | 0.67 | 0.50 | 0.62 | 0.71 | 1.00 |
| k32_bar | 0.682 | 0.79 | 0.71 | 0.46 | 0.50 | 0.83 | 0.75 |
| afford | 0.450 | 0.58 | 0.50 | 0.12 | 0.29 | 0.50 | 0.92 |
| parasite | 0.312 | 0.54 | 0.42 | 0.04 | 0.12 | 0.25 | 0.50 |

Replicator attractors (basin share, Nash regret):
  1.00  regret 0.000  saver 1.00

Bootstrap over seeds (30×, uniform start): mean end state saver 0.88, k32_bar 0.11; largest share: saver 28/30, k32_bar 2/30
