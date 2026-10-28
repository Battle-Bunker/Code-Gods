### Grid(5,base10,rgby), context played, 82 families (one draw each)

| prior | ceiling median | ceiling SD | ceiling range | best yield median | SD log2 yield | p95/p5 | Gini | starved (<0.02) | distinct best tools | camp median yield | mixture-bound violations |
|---|---|---|---|---|---|---|---|---|---|---|---|
| uniform | 44.1 | 16.7 | 6.6–64.0 | 0.295 | 1.52 | 22.3 | 0.38 | 0.02 | 14 | alte 0.252 clum 0.409 neut 0.194 | 0 |
| reach2 | 38.7 | 17.5 | 6.2–64.0 | 0.282 | 1.42 | 19.7 | 0.36 | 0.02 | 14 | alte 0.249 clum 0.324 neut 0.187 | 0 |
| reach4 | 38.0 | 17.5 | 6.0–64.0 | 0.268 | 1.41 | 18.9 | 0.36 | 0.02 | 14 | alte 0.247 clum 0.316 neut 0.183 | 0 |
| beta.25 | 38.5 | 15.9 | 6.3–64.0 | 0.241 | 1.39 | 18.5 | 0.35 | 0.02 | 15 | alte 0.233 clum 0.311 neut 0.186 | 0 |
| levin | 43.3 | 16.9 | 6.6–64.0 | 0.294 | 1.51 | 22.7 | 0.38 | 0.02 | 14 | alte 0.254 clum 0.402 neut 0.193 | 0 |
| mix.5_reach2 | 38.6 | 17.2 | 6.4–64.0 | 0.292 | 1.44 | 20.3 | 0.36 | 0.02 | 14 | alte 0.251 clum 0.335 neut 0.188 | 0 |

<details><summary>per family</summary>

| family | camp | ceil uniform | ceil reach2 | ceil reach4 | ceil beta.25 | ceil levin | ceil mix.5_reach2 | yield uniform | yield reach2 | yield reach4 | yield beta.25 | yield levin | yield mix.5_reach2 | tool (mix.5_reach2) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| seed1_line_painter | clum | 76 | 75 | 76 | 58 | 75 | 75 | 0.369 | 0.282 | 0.269 | 0.294 | 0.372 | 0.296 | paint |
| seed2_patchwork | alte | 76 | 75 | 75 | 73 | 74 | 76 | 0.111 | 0.113 | 0.112 | 0.114 | 0.112 | 0.113 | write+motif |
| seed3_green_ones | clum | 133 | 75 | 73 | 74 | 75 | 76 | 0.357 | 0.317 | 0.282 | 0.307 | 0.350 | 0.330 | stamp+swap_lines |
| rainbow_road | alte | 39 | 39 | 37 | 40 | 41 | 39 | 0.532 | 0.527 | 0.505 | 0.541 | 0.552 | 0.525 | motif |
| border_baron | clum | 38 | 30 | 29 | 33 | 38 | 32 | 0.132 | 0.123 | 0.114 | 0.121 | 0.128 | 0.125 | motif |
| conqueror | clum | 50 | 30 | 28 | 33 | 50 | 31 | 0.661 | 0.383 | 0.351 | 0.432 | 0.656 | 0.392 | paint |
| parity_painter | neut | 50 | 44 | 41 | 42 | 50 | 44 | 0.673 | 0.588 | 0.550 | 0.559 | 0.676 | 0.584 | paint_by_key |
| mirrormancer | neut | 20 | 19 | 18 | 14 | 20 | 20 | 0.485 | 0.452 | 0.430 | 0.319 | 0.495 | 0.475 | mirror_fold |
| homebody | neut | 25 | 23 | 22 | 23 | 24 | 24 | 0.191 | 0.184 | 0.177 | 0.181 | 0.190 | 0.186 | sort_line+paint |
| lone_peak | neut | 55 | 58 | 42 | 42 | 43 | 56 | 0.162 | 0.173 | 0.132 | 0.132 | 0.136 | 0.168 | tally+flatten |
| islander | alte | 48 | 46 | 41 | 41 | 49 | 43 | 0.645 | 0.621 | 0.546 | 0.555 | 0.663 | 0.582 | motif |
| rooks_watch | neut | 22 | 22 | 21 | 22 | 23 | 22 | 0.180 | 0.173 | 0.170 | 0.173 | 0.182 | 0.177 | stamp+swap_lines |
| picture_frame | clum | 32 | 14 | 14 | 14 | 14 | 14 | 0.640 | 0.288 | 0.288 | 0.288 | 0.288 | 0.288 | paint |
| staircase_climber | alte | 71 | 73 | 68 | 64 | 70 | 65 | 0.154 | 0.153 | 0.153 | 0.152 | 0.155 | 0.153 | write_ramp |
| lucky_token | clum | 133 | 75 | 74 | 71 | 74 | 75 | 0.357 | 0.317 | 0.288 | 0.314 | 0.353 | 0.335 | stamp+swap_lines |
| neighbourhood_vote | clum | 31 | 23 | 23 | 21 | 32 | 24 | 0.409 | 0.291 | 0.286 | 0.280 | 0.420 | 0.302 | paint |
| far_apart | neut | 25 | 24 | 24 | 24 | 25 | 25 | 0.003 | 0.003 | 0.003 | 0.003 | 0.003 | 0.003 | hue_turn |
| castle_keeper | clum | 43 | 34 | 34 | 27 | 42 | 33 | 0.340 | 0.317 | 0.316 | 0.320 | 0.338 | 0.316 | motif |
| chessmaster | alte | 49 | 42 | 42 | 39 | 49 | 44 | 0.670 | 0.565 | 0.570 | 0.536 | 0.677 | 0.602 | motif |
| archipelago | alte | 32 | 29 | 29 | 30 | 31 | 30 | 0.439 | 0.397 | 0.390 | 0.409 | 0.418 | 0.404 | motif |
| bridge_builder | clum | 7 | 6 | 6 | 6 | 7 | 6 | 0.119 | 0.111 | 0.106 | 0.112 | 0.118 | 0.116 | recolour+paint |
| looking_glass | neut | 34 | 34 | 31 | 33 | 33 | 34 | 0.616 | 0.621 | 0.575 | 0.599 | 0.611 | 0.618 | mirror_fold |
| pinwheel | clum | 60 | 60 | 58 | 46 | 61 | 60 | 0.461 | 0.464 | 0.449 | 0.369 | 0.474 | 0.463 | write |
| bullseye | neut | 45 | 37 | 32 | 29 | 46 | 28 | 0.554 | 0.382 | 0.355 | 0.350 | 0.591 | 0.407 | paint |
| snake_charmer | neut | 32 | 28 | 27 | 31 | 31 | 32 | 0.022 | 0.022 | 0.022 | 0.022 | 0.022 | 0.022 | swap_colours |
| tetromino_tamer | neut | 15 | 17 | 14 | 15 | 14 | 14 | 0.057 | 0.057 | 0.057 | 0.057 | 0.058 | 0.057 | motif+pattern_line |
| rainbow_bands | alte | 50 | 46 | 49 | 47 | 50 | 49 | 0.668 | 0.623 | 0.659 | 0.636 | 0.675 | 0.663 | motif |
| constellation | clum | 76 | 77 | 66 | 49 | 76 | 77 | 0.542 | 0.550 | 0.471 | 0.343 | 0.545 | 0.550 | swap_lines+write |
| rainbow_roads | alte | 35 | 34 | 34 | 35 | 35 | 35 | 0.296 | 0.282 | 0.287 | 0.252 | 0.295 | 0.296 | motif |
| paint_mixer | alte | 47 | 43 | 41 | 39 | 47 | 42 | 0.557 | 0.502 | 0.474 | 0.452 | 0.557 | 0.490 | motif+blend |
| gravity | clum | 50 | 31 | 28 | 32 | 50 | 32 | 0.677 | 0.413 | 0.361 | 0.425 | 0.675 | 0.421 | paint |
| swiss_cheese | clum | 43 | 34 | 33 | 34 | 42 | 35 | 0.343 | 0.316 | 0.321 | 0.308 | 0.340 | 0.329 | motif |
| mountain_climb | alte | 28 | 26 | 26 | 26 | 27 | 30 | 0.294 | 0.292 | 0.294 | 0.285 | 0.292 | 0.296 | write_ramp |
| treasure_map | clum | 76 | 74 | 75 | 58 | 75 | 74 | 0.157 | 0.145 | 0.141 | 0.148 | 0.157 | 0.150 | stamp |
| straight_shooter | alte | 75 | 75 | 74 | 66 | 74 | 75 | 0.252 | 0.249 | 0.247 | 0.234 | 0.254 | 0.251 | write_ramp |
| number_bonds | clum | 75 | 76 | 76 | 56 | 72 | 76 | 0.292 | 0.244 | 0.231 | 0.206 | 0.295 | 0.246 | stamp |
| magic_accountant | neut | 37 | 37 | 37 | 36 | 36 | 37 | 0.016 | 0.016 | 0.016 | 0.016 | 0.016 | 0.016 | stamp |
| round_numbers | neut | 31 | 30 | 30 | 31 | 30 | 29 | 0.244 | 0.237 | 0.235 | 0.244 | 0.240 | 0.233 | write |
| king_of_the_hill | alte | 46 | 39 | 42 | 46 | 46 | 42 | 0.076 | 0.073 | 0.073 | 0.074 | 0.074 | 0.075 | paint |
| divisibility_detective | neut | 21 | 21 | 19 | 20 | 20 | 20 | 0.206 | 0.202 | 0.194 | 0.200 | 0.207 | 0.203 | write |
| number_sandwich | alte | 42 | 40 | 41 | 41 | 41 | 40 | 0.030 | 0.029 | 0.030 | 0.029 | 0.029 | 0.029 | write_ramp |
| magic_window | alte | 22 | 22 | 23 | 22 | 22 | 22 | 0.069 | 0.068 | 0.069 | 0.069 | 0.069 | 0.069 | write_ramp |
| times_table_territory | clum | 73 | 71 | 68 | 70 | 73 | 73 | 0.198 | 0.185 | 0.173 | 0.191 | 0.195 | 0.186 | stamp |
| odds_evens | alte | 48 | 47 | 43 | 46 | 49 | 47 | 0.072 | 0.071 | 0.069 | 0.071 | 0.071 | 0.071 | write_ramp+paint_by_key |
| number_painter | neut | 83 | 76 | 73 | 50 | 77 | 73 | 0.351 | 0.338 | 0.320 | 0.284 | 0.351 | 0.342 | stamp |
| robin_hood | alte | 61 | 63 | 57 | 54 | 55 | 51 | 0.039 | 0.040 | 0.040 | 0.039 | 0.039 | 0.040 | write+motif |
| seesaw | clum | 18 | 17 | 15 | 17 | 18 | 18 | 0.219 | 0.202 | 0.182 | 0.212 | 0.219 | 0.215 | paint |
| stepping_stones | alte | 42 | 40 | 41 | 41 | 42 | 42 | 0.100 | 0.098 | 0.098 | 0.098 | 0.100 | 0.100 | write_ramp |
| column_addition | neut | 16 | 17 | 17 | 16 | 17 | 17 | 0.102 | 0.104 | 0.102 | 0.102 | 0.104 | 0.104 | write_ramp |
| ladder_of_numbers | neut | 7 | 7 | 7 | 7 | 7 | 7 | 0.196 | 0.191 | 0.189 | 0.191 | 0.196 | 0.190 | sort_line |
| snap | clum | 74 | 75 | 68 | 49 | 74 | 76 | 0.558 | 0.571 | 0.521 | 0.365 | 0.564 | 0.577 | write |
| young_tableau | alte | 76 | 73 | 74 | 71 | 76 | 72 | 0.173 | 0.169 | 0.164 | 0.168 | 0.175 | 0.173 | write_ramp |
| fillomino | neut | 55 | 51 | 51 | 50 | 47 | 48 | 0.101 | 0.098 | 0.096 | 0.101 | 0.101 | 0.100 | write |
| colour_value_ladder | neut | 39 | 39 | 39 | 33 | 39 | 38 | 0.180 | 0.178 | 0.178 | 0.158 | 0.181 | 0.177 | flatten+paint_by_key |
| stripe_painter | clum | 42 | 38 | 35 | 35 | 41 | 39 | 0.508 | 0.457 | 0.426 | 0.415 | 0.498 | 0.469 | motif |
| feuding_families | clum | 39 | 38 | 38 | 38 | 40 | 38 | 0.038 | 0.038 | 0.038 | 0.038 | 0.038 | 0.038 | swap_colours |
| colour_mixer | alte | 31 | 27 | 25 | 27 | 30 | 28 | 0.476 | 0.410 | 0.384 | 0.395 | 0.467 | 0.419 | motif+blend |
| fair_weaver | alte | 20 | 20 | 20 | 18 | 20 | 20 | 0.262 | 0.260 | 0.260 | 0.233 | 0.263 | 0.258 | motif |
| lantern_lighter | alte | 12 | 11 | 12 | 12 | 11 | 12 | 0.062 | 0.063 | 0.062 | 0.062 | 0.062 | 0.062 | motif |
| best_friends | alte | 49 | 42 | 42 | 40 | 50 | 45 | 0.673 | 0.576 | 0.574 | 0.551 | 0.683 | 0.612 | motif |
| rainbow_steps | alte | 40 | 39 | 38 | 39 | 40 | 38 | 0.547 | 0.524 | 0.516 | 0.529 | 0.541 | 0.521 | motif |
| quilt_maker | alte | 42 | 41 | 40 | 42 | 44 | 42 | 0.045 | 0.045 | 0.046 | 0.045 | 0.045 | 0.045 | hue_turn |
| flag_bearer | clum | 50 | 31 | 28 | 31 | 50 | 33 | 0.664 | 0.409 | 0.360 | 0.409 | 0.668 | 0.438 | paint |
| colour_by_number | neut | 50 | 48 | 47 | 39 | 50 | 49 | 0.690 | 0.664 | 0.655 | 0.538 | 0.696 | 0.676 | paint_by_key |
| kingdom | clum | 49 | 30 | 27 | 33 | 51 | 33 | 0.654 | 0.385 | 0.352 | 0.428 | 0.672 | 0.427 | paint |
| wallpaper_weaver | neut | 30 | 27 | 23 | 27 | 30 | 25 | 0.377 | 0.335 | 0.273 | 0.338 | 0.373 | 0.299 | paint |
| sunset_sky | neut | 30 | 29 | 29 | 30 | 30 | 30 | 0.062 | 0.061 | 0.061 | 0.062 | 0.062 | 0.062 | paint |
| twin_friends | alte | 76 | 76 | 75 | 76 | 75 | 75 | 0.335 | 0.317 | 0.305 | 0.297 | 0.334 | 0.326 | motif |
| rummy_melder | neut | 76 | 75 | 74 | 75 | 75 | 75 | 0.203 | 0.204 | 0.197 | 0.204 | 0.210 | 0.208 | swap_colours+write |
| othello_sandwich | alte | 33 | 31 | 30 | 32 | 33 | 32 | 0.213 | 0.201 | 0.199 | 0.207 | 0.209 | 0.214 | motif |
| honest_minesweeper | alte | 63 | 59 | 54 | 62 | 62 | 58 | 0.239 | 0.218 | 0.210 | 0.224 | 0.235 | 0.224 | tally |
| bingo_caller | neut | 32 | 31 | 30 | 31 | 32 | 31 | 0.234 | 0.231 | 0.220 | 0.228 | 0.236 | 0.230 | write |
| sudoku_scholar | alte | 9 | 9 | 9 | 9 | 9 | 9 | 0.025 | 0.025 | 0.025 | 0.024 | 0.025 | 0.025 | write_ramp+mirror_fold |
| full_house | clum | 67 | 63 | 57 | 46 | 66 | 64 | 0.513 | 0.481 | 0.434 | 0.338 | 0.506 | 0.492 | write |
| flush_royale | clum | 76 | 75 | 75 | 75 | 76 | 75 | 0.369 | 0.324 | 0.267 | 0.311 | 0.370 | 0.314 | paint |
| twenty_one | neut | 41 | 41 | 41 | 40 | 40 | 41 | 0.062 | 0.062 | 0.062 | 0.064 | 0.061 | 0.063 | write |
| go_fish_books | clum | 75 | 76 | 76 | 75 | 76 | 75 | 0.560 | 0.519 | 0.489 | 0.432 | 0.542 | 0.526 | write |
| set_spotter | clum | 75 | 76 | 75 | 52 | 77 | 73 | 0.403 | 0.374 | 0.375 | 0.237 | 0.417 | 0.378 | write |
| knight_riders | clum | 77 | 73 | 75 | 50 | 75 | 76 | 0.411 | 0.379 | 0.387 | 0.209 | 0.402 | 0.392 | flatten+paint_by_key |
| uno_snake | clum | 39 | 27 | 24 | 34 | 39 | 32 | 0.494 | 0.339 | 0.289 | 0.429 | 0.501 | 0.395 | paint |
| kings_court | alte | 75 | 74 | 75 | 73 | 76 | 75 | 0.379 | 0.363 | 0.344 | 0.339 | 0.384 | 0.370 | swap_lines+write |
| connect_four | clum | 50 | 31 | 28 | 31 | 50 | 34 | 0.668 | 0.404 | 0.359 | 0.403 | 0.670 | 0.444 | paint |

</details>

saved /home/user/Code-Gods/lib/grid-lab/.cache/explore_priors/measure/measure-Grid(5,base10,rgby)-played.json
