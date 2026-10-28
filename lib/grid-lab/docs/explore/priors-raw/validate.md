Toy: 20 line-paint programs, k ~ U{0..3}, #red on Grid(5,base10,rgby); 6 seeds, 6.6 s/table

| t (#red) | exact bits | bias | sd | reported se | seeds reaching t |
|---|---|---|---|---|---|
| 8 | 0.97 | +0.01 | 0.01 | 0.01 | 6 |
| 9 | 1.31 | +0.00 | 0.01 | 0.01 | 6 |
| 10 | 1.70 | +0.01 | 0.01 | 0.01 | 6 |
| 11 | 2.13 | +0.01 | 0.01 | 0.01 | 6 |
| 12 | 2.61 | +0.00 | 0.01 | 0.01 | 6 |
| 13 | 3.17 | +0.00 | 0.01 | 0.02 | 6 |
| 14 | 3.82 | -0.00 | 0.01 | 0.02 | 6 |
| 15 | 4.54 | -0.00 | 0.02 | 0.03 | 6 |
| 16 | 5.35 | -0.00 | 0.03 | 0.04 | 6 |
| 17 | 6.30 | +0.01 | 0.04 | 0.05 | 6 |
| 18 | 7.47 | +0.02 | 0.08 | 0.08 | 6 |
| 19 | 8.92 | +0.02 | 0.08 | 0.14 | 6 |
| 20 | 10.71 | +0.03 | 0.09 | 0.21 | 6 |
| 21 | 12.89 | +0.02 | 0.19 | 0.25 | 6 |
| 22 | 15.54 | +0.02 | 0.20 | 0.30 | 6 |
| 23 | 18.73 | +0.09 | 0.22 | 0.37 | 6 |
| 24 | 22.63 | +0.00 | 0.14 | 0.46 | 6 |
| 25 | 27.65 | -0.09 | 0.43 | 0.61 | 6 |

K = 0 (latent sampler without programs) against exact tails

| family | levels checked | mean err (bits) | max |err| | deep err | mean reported se |
|---|---|---|---|---|---|
| seed3_green_ones | 12 | +0.56 | 1.22 | +0.92 @ 45 bits | 0.38 |
| conqueror | 13 | -0.23 | 0.58 | -0.41 @ 49 bits | 0.39 |
| homebody | 8 | -0.23 | 0.47 | -0.38 @ 33 bits | 0.42 |
| parity_painter | 15 | +0.26 | 0.82 | +0.53 @ 40 bits | 0.43 |

Brute-force Monte Carlo (1048576 fresh ρ samples, held-out seeds) vs latent splitting, levels beyond the pool body with >= 64 MC hits

| prior | family | levels | deepest MC bits | mean diff (bits) | mean z | rms z | max |z| |
|---|---|---|---|---|---|---|---|
| reach2 | conqueror | 4 | 12.9 | +0.12 | +0.64 | 0.82 | 1.12 |
| reach2 | rainbow_road | 9 | 13.6 | -0.15 | -0.60 | 0.63 | 1.06 |
| reach2 | seed1_line_painter | 89 | 14.0 | +0.05 | +0.21 | 0.38 | 1.04 |
| reach2 | mirrormancer | 2 | 13.2 | -0.22 | -0.79 | 0.85 | 1.12 |
| reach2 | stripe_painter | 8 | 13.8 | +0.38 | +1.66 | 1.81 | 2.41 |
| reach2 | lucky_token | 22 | 13.9 | +0.21 | +0.94 | 0.95 | 1.19 |
| reach2 | number_bonds | 3 | 13.9 | +0.08 | +0.32 | 0.37 | 0.59 |
| reach2 | seed2_patchwork | 23 | 13.9 | -0.03 | -0.11 | 0.23 | 0.47 |
| levin | conqueror | 3 | 12.7 | +0.03 | +0.16 | 0.21 | 0.33 |
| levin | rainbow_road | 9 | 13.5 | -0.13 | -0.56 | 0.57 | 0.82 |
| levin | seed1_line_painter | 65 | 13.9 | -0.21 | -0.86 | 0.88 | 1.13 |
| levin | mirrormancer | 4 | 14.0 | +0.03 | +0.22 | 0.41 | 0.54 |
| levin | stripe_painter | 5 | 13.2 | +0.06 | +0.21 | 0.21 | 0.28 |
| levin | lucky_token | 17 | 13.4 | +0.01 | +0.08 | 0.30 | 0.53 |
| levin | number_bonds | 3 | 13.9 | +0.04 | +0.16 | 0.25 | 0.42 |
| levin | seed2_patchwork | 24 | 14.0 | +0.09 | +0.39 | 0.53 | 0.90 |
| beta.25 | conqueror | 4 | 13.5 | -0.14 | -0.60 | 0.73 | 1.26 |
| beta.25 | rainbow_road | 10 | 13.9 | +0.20 | +0.81 | 0.88 | 1.24 |
| beta.25 | seed1_line_painter | 77 | 14.0 | +0.14 | +0.62 | 0.88 | 1.30 |
| beta.25 | mirrormancer | 3 | 13.4 | -0.14 | -0.55 | 0.65 | 1.04 |
| beta.25 | stripe_painter | 8 | 12.8 | -0.12 | -0.51 | 0.55 | 0.76 |
| beta.25 | lucky_token | 18 | 13.5 | -0.07 | -0.30 | 0.32 | 0.52 |
| beta.25 | number_bonds | 3 | 13.8 | +0.04 | +0.22 | 0.47 | 0.52 |
| beta.25 | seed2_patchwork | 23 | 13.9 | +0.06 | +0.21 | 0.26 | 0.61 |

p-value check: max over families of P_ρ(s >= k)·2^k (should be <= ~1)

| prior | MC seconds | k=2 | 4 | 6 | 8 | 10 | 12 |
|---|---|---|---|---|---|---|---|
| reach2 | 9 | 0.98 | 0.98 | 0.94 | 1.16 | 1.17 | 1.29 |
| levin | 2 | 0.98 | 0.97 | 0.96 | 0.94 | 1.10 | 0.86 |
| beta.25 | 6 | 1.00 | 1.00 | 0.99 | 1.01 | 1.19 | 1.14 |


| prior | family | ordinal t | mean bits | sd across seeds | mean reported se |
|---|---|---|---|---|---|
| reach2 | conqueror | 86 | 16.1 | 0.21 | 0.28 |
| reach2 | conqueror | 116 | 24.2 | 0.44 | 0.35 |
| reach2 | conqueror | 139 | 31.5 | 0.67 | 0.40 |
| reach2 | conqueror | 159 | 39.6 | 0.85 | 0.45 |
| reach2 | rainbow_road | 56 | 16.4 | 0.20 | 0.27 |
| reach2 | rainbow_road | 80 | 25.1 | 0.38 | 0.36 |
| reach2 | rainbow_road | 103 | 32.9 | 0.38 | 0.44 |
| reach2 | mirrormancer | 65 | 19.1 | 0.33 | 0.47 |
| reach2 | lucky_token | 165 | 16.3 | 0.29 | 0.27 |
| reach2 | lucky_token | 219 | 24.1 | 0.44 | 0.34 |
| reach2 | lucky_token | 290 | 32.2 | 0.62 | 0.40 |
| reach2 | lucky_token | 343 | 40.3 | 0.63 | 0.45 |
| levin | conqueror | 82 | 16.5 | 0.18 | 0.28 |
| levin | conqueror | 103 | 24.2 | 0.19 | 0.35 |
| levin | conqueror | 122 | 32.5 | 0.30 | 0.40 |
| levin | conqueror | 138 | 40.6 | 0.37 | 0.45 |
| levin | rainbow_road | 56 | 17.1 | 0.30 | 0.28 |
| levin | rainbow_road | 80 | 26.1 | 0.42 | 0.37 |
| levin | rainbow_road | 103 | 34.1 | 0.44 | 0.45 |
| levin | mirrormancer | 65 | 20.0 | 0.56 | 0.50 |
| levin | lucky_token | 162 | 15.9 | 0.18 | 0.27 |
| levin | lucky_token | 213 | 23.8 | 0.26 | 0.34 |
| levin | lucky_token | 244 | 32.0 | 0.25 | 0.40 |
| levin | lucky_token | 293 | 40.0 | 0.34 | 0.45 |

