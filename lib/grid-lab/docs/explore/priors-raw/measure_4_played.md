### Grid(4,base12,rgb), context played, 79 families (one draw each)

| prior | ceiling median | ceiling SD | ceiling range | best yield median | SD log2 yield | p95/p5 | Gini | starved (<0.02) | distinct best tools | camp median yield | mixture-bound violations |
|---|---|---|---|---|---|---|---|---|---|---|---|
| uniform | 25.4 | 18.4 | 3.7–64.0 | 0.313 | 1.39 | 9.8 | 0.32 | 0.01 | 14 | alte 0.259 clum 0.395 neut 0.200 | 0 |
| reach2 | 23.8 | 17.9 | 3.5–64.0 | 0.282 | 1.32 | 8.6 | 0.31 | 0.01 | 14 | alte 0.228 clum 0.323 neut 0.197 | 1 |
| reach4 | 23.1 | 17.1 | 3.4–64.0 | 0.269 | 1.31 | 8.2 | 0.31 | 0.01 | 14 | alte 0.223 clum 0.301 neut 0.192 | 0 |
| beta.25 | 21.7 | 15.6 | 3.5–64.0 | 0.254 | 1.22 | 6.7 | 0.27 | 0.01 | 14 | alte 0.245 clum 0.274 neut 0.189 | 1 |
| levin | 25.1 | 18.4 | 3.7–64.0 | 0.308 | 1.39 | 9.9 | 0.32 | 0.01 | 14 | alte 0.259 clum 0.393 neut 0.200 | 2 |
| mix.5_reach2 | 24.1 | 17.8 | 3.6–64.0 | 0.296 | 1.34 | 8.9 | 0.31 | 0.01 | 14 | alte 0.237 clum 0.355 neut 0.199 | 1 |

<details><summary>per family</summary>

| family | camp | ceil uniform | ceil reach2 | ceil reach4 | ceil beta.25 | ceil levin | ceil mix.5_reach2 | yield uniform | yield reach2 | yield reach4 | yield beta.25 | yield levin | yield mix.5_reach2 | tool (mix.5_reach2) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| seed1_line_painter | clum | 75 | 72 | 65 | 65 | 75 | 73 | 0.365 | 0.312 | 0.290 | 0.290 | 0.361 | 0.324 | paint |
| seed2_patchwork | alte | 73 | 72 | 69 | 63 | 65 | 65 | 0.464 | 0.454 | 0.437 | 0.397 | 0.412 | 0.411 | write+turn_grid+motif |
| seed3_green_ones | clum | 83 | 69 | 57 | 50 | 75 | 69 | 0.395 | 0.323 | 0.265 | 0.243 | 0.391 | 0.328 | flatten+paint |
| rainbow_road | alte | 19 | 18 | 17 | 13 | 19 | 18 | 0.447 | 0.425 | 0.399 | 0.288 | 0.441 | 0.427 | motif |
| border_baron | clum | 17 | 17 | 16 | 17 | 18 | 17 | 0.133 | 0.129 | 0.124 | 0.127 | 0.132 | 0.129 | motif |
| conqueror | clum | 25 | 18 | 17 | 16 | 25 | 20 | 0.578 | 0.404 | 0.381 | 0.356 | 0.572 | 0.436 | paint |
| parity_painter | neut | 25 | 24 | 24 | 15 | 26 | 25 | 0.583 | 0.552 | 0.556 | 0.322 | 0.594 | 0.565 | paint_by_key |
| mirrormancer | neut | 13 | 10 | 10 | 11 | 13 | 11 | 0.381 | 0.287 | 0.281 | 0.307 | 0.382 | 0.316 | mirror_fold |
| homebody | neut | 13 | 13 | 12 | 13 | 13 | 13 | 0.215 | 0.210 | 0.203 | 0.210 | 0.214 | 0.212 | recolour |
| lone_peak | neut | 41 | 43 | 40 | 41 | 44 | 34 | 0.130 | 0.135 | 0.128 | 0.128 | 0.137 | 0.111 | flatten+paint |
| islander | alte | 23 | 22 | 21 | 14 | 23 | 22 | 0.533 | 0.493 | 0.479 | 0.301 | 0.537 | 0.516 | motif |
| rooks_watch | neut | 19 | 18 | 17 | 18 | 19 | 18 | 0.119 | 0.116 | 0.114 | 0.117 | 0.120 | 0.116 | write |
| picture_frame | clum | 19 | 14 | 14 | 14 | 14 | 14 | 0.570 | 0.432 | 0.432 | 0.432 | 0.432 | 0.432 | paint |
| staircase_climber | alte | 46 | 37 | 34 | 45 | 47 | 39 | 0.242 | 0.217 | 0.200 | 0.236 | 0.246 | 0.222 | write_ramp+write_ramp |
| lucky_token | clum | 83 | 68 | 59 | 58 | 75 | 69 | 0.395 | 0.321 | 0.278 | 0.272 | 0.393 | 0.327 | flatten+paint |
| neighbourhood_vote | clum | 16 | 14 | 13 | 14 | 16 | 15 | 0.337 | 0.293 | 0.269 | 0.290 | 0.337 | 0.306 | paint |
| far_apart | neut | 23 | 22 | 21 | 22 | 23 | 22 | 0.087 | 0.084 | 0.083 | 0.085 | 0.086 | 0.086 | recolour |
| castle_keeper | clum | 23 | 20 | 18 | 18 | 22 | 20 | 0.291 | 0.260 | 0.258 | 0.252 | 0.286 | 0.257 | motif+paint |
| chessmaster | alte | 24 | 22 | 21 | 16 | 24 | 23 | 0.549 | 0.509 | 0.481 | 0.338 | 0.554 | 0.532 | motif |
| archipelago | alte | 17 | 17 | 16 | 14 | 16 | 17 | 0.380 | 0.377 | 0.348 | 0.308 | 0.365 | 0.377 | motif |
| bridge_builder | clum | 4 | 3 | 3 | 4 | 4 | 4 | 0.123 | 0.116 | 0.111 | 0.118 | 0.123 | 0.119 | paint |
| looking_glass | neut | 28 | 27 | 26 | 27 | 29 | 28 | 0.548 | 0.522 | 0.501 | 0.514 | 0.566 | 0.552 | mirror_fold |
| pinwheel | clum | 42 | 41 | 39 | 31 | 44 | 40 | 0.422 | 0.413 | 0.401 | 0.331 | 0.447 | 0.399 | write |
| bullseye | neut | 23 | 18 | 16 | 17 | 23 | 20 | 0.454 | 0.345 | 0.317 | 0.297 | 0.473 | 0.375 | paint |
| snake_charmer | neut | 12 | 12 | 12 | 12 | 12 | 12 | 0.042 | 0.041 | 0.040 | 0.041 | 0.042 | 0.041 | recolour |
| tetromino_tamer | neut | 15 | 15 | 14 | 13 | 14 | 15 | 0.336 | 0.347 | 0.313 | 0.298 | 0.325 | 0.342 | motif |
| rainbow_bands | alte | 25 | 24 | 24 | 23 | 26 | 24 | 0.554 | 0.522 | 0.535 | 0.509 | 0.572 | 0.528 | motif |
| constellation | clum | 60 | 52 | 46 | 35 | 56 | 51 | 0.374 | 0.322 | 0.288 | 0.256 | 0.351 | 0.316 | write_ramp+flatten+swap_lines |
| gravity | clum | 25 | 18 | 17 | 15 | 25 | 19 | 0.587 | 0.415 | 0.387 | 0.336 | 0.589 | 0.424 | paint |
| swiss_cheese | clum | 22 | 20 | 19 | 18 | 23 | 19 | 0.284 | 0.248 | 0.268 | 0.262 | 0.292 | 0.240 | motif+paint |
| mountain_climb | alte | 40 | 36 | 34 | 39 | 37 | 36 | 0.261 | 0.237 | 0.225 | 0.254 | 0.260 | 0.244 | write_ramp |
| treasure_map | clum | 62 | 55 | 52 | 46 | 62 | 58 | 0.188 | 0.171 | 0.164 | 0.176 | 0.184 | 0.176 | paint |
| straight_shooter | alte | 55 | 48 | 46 | 50 | 54 | 50 | 0.262 | 0.216 | 0.200 | 0.240 | 0.262 | 0.229 | write_ramp+write_ramp |
| number_bonds | clum | 75 | 69 | 66 | 35 | 78 | 75 | 0.313 | 0.282 | 0.279 | 0.171 | 0.295 | 0.296 | write |
| magic_accountant | neut | 29 | 30 | 28 | 29 | 29 | 29 | 0.022 | 0.021 | 0.022 | 0.022 | 0.022 | 0.022 | write+write_ramp |
| round_numbers | neut | 26 | 26 | 25 | 25 | 25 | 25 | 0.278 | 0.282 | 0.273 | 0.271 | 0.272 | 0.270 | write |
| king_of_the_hill | alte | 24 | 25 | 23 | 24 | 25 | 23 | 0.084 | 0.085 | 0.082 | 0.085 | 0.087 | 0.083 | motif+tally |
| divisibility_detective | neut | 11 | 11 | 11 | 11 | 11 | 11 | 0.121 | 0.120 | 0.121 | 0.120 | 0.122 | 0.121 | write |
| number_sandwich | alte | 24 | 24 | 25 | 24 | 25 | 25 | 0.060 | 0.060 | 0.060 | 0.060 | 0.060 | 0.060 | write_ramp |
| magic_window | alte | 26 | 23 | 26 | 25 | 24 | 24 | 0.096 | 0.093 | 0.091 | 0.096 | 0.097 | 0.095 | write_ramp |
| times_table_territory | clum | 58 | 47 | 40 | 45 | 57 | 41 | 0.286 | 0.131 | 0.122 | 0.136 | 0.285 | 0.129 | stamp |
| odds_evens | alte | 28 | 27 | 26 | 27 | 28 | 26 | 0.133 | 0.127 | 0.123 | 0.130 | 0.131 | 0.126 | motif+stamp |
| number_painter | neut | 57 | 56 | 53 | 34 | 56 | 56 | 0.331 | 0.320 | 0.312 | 0.276 | 0.325 | 0.326 | stamp |
| robin_hood | alte | 41 | 51 | 44 | 47 | 46 | 43 | 0.124 | 0.126 | 0.124 | 0.127 | 0.131 | 0.129 | write+turn_grid+motif |
| seesaw | clum | 17 | 16 | 16 | 16 | 17 | 17 | 0.358 | 0.344 | 0.331 | 0.346 | 0.358 | 0.355 | paint |
| stepping_stones | alte | 31 | 28 | 25 | 30 | 30 | 29 | 0.105 | 0.095 | 0.090 | 0.102 | 0.105 | 0.099 | write_ramp |
| column_addition | neut | 14 | 14 | 15 | 14 | 14 | 14 | 0.058 | 0.059 | 0.059 | 0.058 | 0.058 | 0.059 | swap_colours+swap_symbols+write_ramp |
| ladder_of_numbers | neut | 5 | 4 | 4 | 5 | 5 | 5 | 0.144 | 0.141 | 0.139 | 0.142 | 0.145 | 0.143 | sort_line |
| snap | clum | 53 | 44 | 39 | 30 | 55 | 45 | 0.526 | 0.430 | 0.379 | 0.276 | 0.540 | 0.441 | write |
| young_tableau | alte | 37 | 34 | 34 | 37 | 37 | 36 | 0.103 | 0.098 | 0.094 | 0.101 | 0.102 | 0.100 | write_ramp |
| fillomino | neut | 43 | 44 | 37 | 40 | 44 | 45 | 0.156 | 0.155 | 0.148 | 0.153 | 0.155 | 0.154 | write |
| colour_value_ladder | neut | 25 | 25 | 25 | 23 | 25 | 25 | 0.185 | 0.183 | 0.182 | 0.177 | 0.185 | 0.185 | motif+stamp |
| stripe_painter | clum | 21 | 19 | 18 | 15 | 21 | 19 | 0.428 | 0.393 | 0.372 | 0.285 | 0.439 | 0.377 | motif |
| feuding_families | clum | 21 | 20 | 19 | 21 | 21 | 20 | 0.108 | 0.107 | 0.104 | 0.106 | 0.106 | 0.105 | motif+swap_lines+stamp |
| fair_weaver | alte | 9 | 9 | 9 | 9 | 9 | 9 | 0.190 | 0.189 | 0.194 | 0.191 | 0.192 | 0.190 | motif |
| lantern_lighter | alte | 9 | 9 | 9 | 9 | 9 | 9 | 0.070 | 0.070 | 0.071 | 0.071 | 0.070 | 0.071 | motif |
| best_friends | alte | 24 | 23 | 22 | 17 | 25 | 23 | 0.544 | 0.513 | 0.493 | 0.366 | 0.566 | 0.521 | motif |
| rainbow_steps | alte | 19 | 18 | 18 | 13 | 19 | 19 | 0.438 | 0.426 | 0.416 | 0.288 | 0.435 | 0.443 | motif |
| quilt_maker | alte | 18 | 17 | 17 | 13 | 18 | 18 | 0.410 | 0.393 | 0.385 | 0.283 | 0.413 | 0.405 | motif |
| flag_bearer | clum | 25 | 18 | 17 | 15 | 25 | 20 | 0.582 | 0.403 | 0.379 | 0.319 | 0.561 | 0.441 | paint |
| colour_by_number | neut | 25 | 24 | 24 | 14 | 26 | 25 | 0.612 | 0.588 | 0.575 | 0.336 | 0.623 | 0.601 | paint_by_key |
| kingdom | clum | 26 | 18 | 17 | 15 | 25 | 19 | 0.593 | 0.407 | 0.380 | 0.337 | 0.575 | 0.426 | paint |
| wallpaper_weaver | neut | 12 | 12 | 11 | 11 | 13 | 12 | 0.232 | 0.225 | 0.212 | 0.202 | 0.237 | 0.224 | motif |
| sunset_sky | neut | 19 | 18 | 18 | 18 | 20 | 18 | 0.062 | 0.062 | 0.062 | 0.062 | 0.062 | 0.062 | pattern_line+shift_line+turn_block |
| twin_friends | alte | 74 | 68 | 62 | 49 | 74 | 70 | 0.402 | 0.356 | 0.338 | 0.281 | 0.404 | 0.367 | motif+tally |
| rummy_melder | neut | 69 | 71 | 71 | 64 | 69 | 71 | 0.430 | 0.448 | 0.449 | 0.402 | 0.430 | 0.447 | write+turn_grid+motif |
| othello_sandwich | alte | 16 | 16 | 15 | 15 | 16 | 16 | 0.228 | 0.221 | 0.220 | 0.210 | 0.219 | 0.222 | motif |
| honest_minesweeper | alte | 38 | 40 | 39 | 36 | 45 | 40 | 0.301 | 0.279 | 0.269 | 0.270 | 0.308 | 0.288 | tally |
| bingo_caller | neut | 25 | 24 | 23 | 24 | 26 | 24 | 0.257 | 0.249 | 0.238 | 0.249 | 0.263 | 0.248 | write |
| sudoku_scholar | alte | 9 | 8 | 8 | 8 | 8 | 8 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | shift_line |
| full_house | clum | 42 | 40 | 37 | 31 | 42 | 40 | 0.408 | 0.386 | 0.362 | 0.297 | 0.408 | 0.395 | write |
| flush_royale | clum | 72 | 64 | 61 | 62 | 73 | 63 | 0.352 | 0.297 | 0.271 | 0.271 | 0.363 | 0.303 | paint |
| twenty_one | neut | 33 | 32 | 32 | 33 | 33 | 32 | 0.112 | 0.109 | 0.110 | 0.110 | 0.110 | 0.110 | write |
| go_fish_books | clum | 67 | 60 | 59 | 48 | 67 | 62 | 0.399 | 0.325 | 0.322 | 0.355 | 0.403 | 0.366 | write |
| set_spotter | clum | 71 | 53 | 53 | 32 | 71 | 57 | 0.535 | 0.392 | 0.399 | 0.232 | 0.538 | 0.424 | write+paint_by_key |
| knight_riders | clum | 75 | 57 | 52 | 30 | 78 | 58 | 0.565 | 0.426 | 0.387 | 0.212 | 0.591 | 0.432 | write+paint_by_key |
| uno_snake | clum | 20 | 16 | 15 | 14 | 21 | 18 | 0.425 | 0.318 | 0.301 | 0.274 | 0.434 | 0.374 | paint |
| kings_court | alte | 73 | 69 | 66 | 65 | 73 | 68 | 0.258 | 0.236 | 0.232 | 0.249 | 0.258 | 0.251 | write |
| connect_four | clum | 26 | 18 | 17 | 15 | 26 | 19 | 0.593 | 0.404 | 0.393 | 0.332 | 0.595 | 0.426 | paint |

</details>

saved /home/user/Code-Gods/lib/grid-lab/.cache/explore_priors/measure/measure-Grid(4,base12,rgb)-played.json
