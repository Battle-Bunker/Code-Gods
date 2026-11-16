# Grid game: engine v1 (archive/engine-v1, the spec) against engine v2 (develop @ 042816d4d)

Sources: v1 `lib/game-utilities/src/families/grid/**`, `lib/game-types/src/grid/**`, `lib/game-core/src/{settings,scoring}.ts`;
v2 `lib/v2-grid/src/*`, `artifacts/engine/convex/v2/presets.ts`, `lib/v2-economy/src/{settings,charge}.ts`;
decisions `docs/engine-v2/{owner-decisions,v1-audit,grids}.md`. "Owner N" = owner decision N; "call N" = coordinator's call N
(the numbered list under the owner's delegation; the list repeats some numbers, so the topic is named too).
Hours = rough hours to restore the v1 behaviour on v2, including a principles check table where a dealt rule changes. "—" = deliberate,
not to be restored.

## 1. Rule families

### 1a. v1 families playable on a numbers-only board (29 of v1's 112 reward families; v1 dealt 8 of them by default)

| v1 family | v1 status on the beginner board | v2 | Mark | Decision | Hrs |
|---|---|---|---|---|---|
| mirrormancer | dealt (Annotated basics) | `mirrormancer`, grids-beginner | SAME (family) | — | — |
| magic_eighteen | dealt | `magic-eighteen`, grids-beginner | SAME (family) | — (call 17 "anchors" trial plans to fold it into Magic Totals; not done yet) | — |
| opposite_nines | dealt | `opposite-nines`, grids-beginner | SAME (family) | — (call 17 trial plans to replace it with Pair Sums; not done yet) | — |
| two_pair | dealt | `two-pair`, grids-beginner | SAME (family) | — | — |
| spread_three | dealt | `spread-of-three`, grids-beginner | SAME (family) | — | — |
| strangers | dealt | `strangers`, grids-beginner | SAME (family) | — | — |
| leapfrog | dealt | `leapfrog`, grids-beginner | SAME (family) | — | — |
| crosswise_threes | dealt | `crosswise-threes`, grids-beginner | SAME (family) | — | — |
| kings_and_subjects (layered) | excluded from Annotated basics; dealt in "Tiered rules" | `kings-and-subjects`, grids-more-rules | CHANGED (setup) | call 13 (restore grids-more-rules) | — |
| staircase_climber | excluded on beginner board; dealt on Classic/Big/Master | `staircase`, grids-more-rules | CHANGED (setup) | call 13 | — |
| mountain_climb | excluded on beginner; dealt elsewhere | `mountain-climb`, grids-more-rules | CHANGED (setup) | call 13 | — |
| stepping_stones | excluded on beginner; dealt elsewhere | `stepping-stones`, grids-more-rules | CHANGED (setup) | call 13 | — |
| young_tableau ("Uphill") | excluded on beginner; dealt elsewhere | `uphill`, grids-more-rules | CHANGED (setup) | call 13 | — |
| magic_accountant | excluded on beginner; dealt elsewhere | `magic-accountant`, grids-more-rules | CHANGED (setup) | call 13 | — |
| fillomino | excluded on beginner; dealt elsewhere | `fillomino`, grids-more-rules | CHANGED (setup) | call 13 | — |
| divisibility_detective | excluded on beginner; dealt elsewhere | `divisibility` (powers of q in the board read as numbers), grids-arithmetic | CHANGED (redesigned, parameterised) | owner 41 (parameterised rules); grid-params.md §12 | — |
| round_numbers | excluded on beginner; dealt elsewhere | nearest: `magic-totals` (totals leaving a dealt remainder), undealt | MISSING (as a dealt rule) | no recorded decision | 4 |
| ladder_of_numbers | weak, excluded | nearest: `number-lines`, undealt | MISSING | no recorded decision (was weak in v1) | 3 |
| column_addition | excluded on beginner | none | MISSING | no recorded decision | 4 |
| number_bonds | excluded on beginner | none (nearest `pair-sums`, undealt) | MISSING | no recorded decision | 4 |
| seesaw | excluded on beginner | none | MISSING | no recorded decision | 3 |
| snap | excluded on beginner | none | MISSING | no recorded decision | 3 |
| looking_glass | excluded on beginner | none | MISSING | no recorded decision | 3 |
| pinwheel | excluded on beginner | none | MISSING | no recorded decision | 3 |
| constellation | excluded on beginner | none | MISSING | no recorded decision | 3 |
| bingo_caller | excluded on beginner | none | MISSING | no recorded decision | 3 |
| full_house | excluded on beginner | none | MISSING | no recorded decision | 4 |
| twenty_one | excluded on beginner | none | MISSING | no recorded decision | 3 |
| sudoku_scholar | weak; excluded on every mono board | none | MISSING | no recorded decision (weak in v1) | 3 |

### 1b. v2 families with no v1 counterpart

| v2 family | Pool | v1 nearest | Mark | Decision | Hrs |
|---|---|---|---|---|---|
| steady-steps | second pool, in no preset | none | CHANGED (new, undealt) | grids.md §6 | — |
| box-totals | second pool, in no preset | v1 ★ tier "2×2 squares add up to x" | CHANGED (new, undealt) | grids.md §6 | — |
| prime-cells | second pool, in no preset | prime_territory (colour) | CHANGED (new, undealt) | grids.md §6 | — |
| magic-totals | param trial, in no preset | magic_accountant, round_numbers | CHANGED (new, undealt) | owner 41; call 17 (anchors) | — |
| spread | param trial, in no preset | spread_three generalised | CHANGED (new, undealt) | owner 41 | — |
| number-lines | param trial, in no preset | ladder_of_numbers, divisibility_detective | CHANGED (new, undealt) | owner 41 | — |
| pair-sums | param trial, in no preset | opposite_nines generalised | CHANGED (new, undealt) | owner 41; call 17 | — |
| leading-digits | grids-arithmetic | none | CHANGED (new) | owner 41; grid-params.md §13 | — |

### 1c. v1 families that need a coloured or playing-card board (every one MISSING: v2 has no such board, §3)

83 families (79 below + 4 piece tamers). Hours: about 3 per family once the board exists (the board itself is §3).

| v1 family | v1 lens | Needs | Mark | Decision | Hrs |
|---|---|---|---|---|---|
| seed1_line_painter (Line Painter) | seeds | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| seed2_patchwork (Patchwork) | seeds | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| seed3_green_ones (Green Ones) | seeds | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| rainbow_road (Rainbow Road) | strategy | rainbow/mix colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| border_baron (Border Baron) | strategy | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| conqueror (Conqueror) | strategy | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| parity_painter (Parity Painter) | strategy | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| homebody (Homebody) | strategy | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| lone_peak (Lone Peak) | strategy | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| islander (Islander) | strategy | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| rooks_watch (Rook's Watch) | strategy | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| picture_frame (Picture Frame) | strategy | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| lucky_token (Lucky Token) | strategy | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| neighbourhood_vote (Neighbourhood Vote) | strategy | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| far_apart (Far Apart) | strategy | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| head_count (Head Count) | strategy | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| colour_mirror (Colour Mirror) | strategy | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| castle_keeper (Castle Keeper) | geometry | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| chessmaster (Chessmaster) | geometry | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| bridge_builder (Bridge Builder) | geometry | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| card_windmill (Card Windmill) | geometry | playing-card board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| royal_court (Royal Court) | geometry | playing-card board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| archipelago (Archipelago) | geometry | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| bullseye (Bullseye) | geometry | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| snake_charmer (Snake Charmer) | geometry | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| tetromino_tamer (Tetromino Tamer) | geometry | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| rainbow_bands (Rainbow Bands) | geometry | rainbow/mix colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| rainbow_roads (Rainbow Roads) | geometry | rainbow/mix colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| paint_mixer (Paint Mixer) | geometry | rainbow/mix colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| colour_carousel (Colour Carousel) | geometry | rainbow/mix colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| gravity (Falling Sand) | geometry | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| swiss_cheese (Swiss Cheese) | geometry | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| treasure_map (Treasure Map) | geometry | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| mirror_quilt (Mirror Quilt) | geometry | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| colour_pinwheel (Colour Pinwheel) | geometry | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| treasure_castle (Treasure Castle) | geometry | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| castle_pockets (Castle Pockets) | geometry | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| any_suit_court (Any-Suit Court) | geometry | playing-card board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| straight_shooter (Straight Shooter) | arithmetic | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| king_of_the_hill (King of the Hill) | arithmetic | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| number_sandwich (Number Sandwich) | arithmetic | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| magic_window (Magic Window) | arithmetic | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| times_table_territory (Times-Table Territory) | arithmetic | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| odds_evens (Odds & Evens) | arithmetic | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| number_painter (Number Painter) | arithmetic | rainbow/mix colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| robin_hood (Robin Hood) | arithmetic | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| colour_value_ladder (Colour Ladder) | arithmetic | rainbow/mix colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| colour_bonds (Colour Bonds) | arithmetic | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| fibonacci_sandwich (Fibonacci Sandwich) | arithmetic | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| prime_territory (Prime Territory) | arithmetic | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| stripe_painter (Stripe Painter) | colour | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| feuding_families (Feuding Families) | colour | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| colour_mixer (Colour Mixer) | colour | rainbow/mix colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| fair_weaver (Fair Weaver) | colour | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| lantern_lighter (Lantern Lighter) | colour | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| best_friends (Best Friends) | colour | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| rainbow_steps (Rainbow Steps) | colour | rainbow/mix colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| quilt_maker (Quilt Maker) | colour | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| flag_bearer (Flag Bearer) | colour | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| colour_by_number (Colour-by-Number) | colour | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| kingdom (Kingdom) | colour | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| wallpaper_weaver (Wallpaper Weaver) | colour | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| sunset_sky (Sunset Sky) | colour | rainbow/mix colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| colour_wheel_harmony (Colour Wheel Harmony) | colour | rainbow/mix colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| warm_hearts (Warm Hearts) | colour | playing-card board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| twin_friends (Twin Friends) | colour | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| rummy_melder (Rummy Melder) | games | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| othello_sandwich (Othello Sandwich) | games | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| honest_minesweeper (Honest Minesweeper) | games | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| flush_royale (Flush Royale) | games | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| go_fish_books (Go Fish Books) | games | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| set_spotter (Set Spotter) | games | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| knight_riders (Knight Riders) | games | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| uno_snake (Uno Snake) | games | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| court_parade (Court Parade) | games | playing-card board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| kings_court (King's Court) | games | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| connect_four (Connect Four) | games | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| any_suit_parade (Any-Suit Parade) | games | playing-card board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| colour_seesaw (Colour Seesaw) | arithmetic | colour board | MISSING | no recorded decision (integration plan §1.8 dropped non-beginner boards; audit §2.2) | 3 + board |
| i/t/l/s_piece_tamer (4 families) | geometry | colour board | MISSING | as above | 3 each + board |

### 1d. v1 defence (penalty) families: an option, off by default (`defenceGoals: false`)

| v1 family | Needs | Mark | Decision | Hrs |
|---|---|---|---|---|
| hate_value (Hated number) | numbers only | MISSING | call 1 said RESTORE; still missing (audit §1.5) | 3 (+ the mechanism, §6) |
| hate_symbol_takeover (Number crowd) | numbers only | MISSING | call 1 (restore), not done | 3 (+ §6) |
| hate_repeat_row, hate_same_corners | v1 required ≥2 colours | MISSING | call 1 (restore), not done | 3 each + board |
| hate_colour, hate_blob, hate_takeover, hate_big_blob | colour board | MISSING | call 1 (restore), not done | 3 each + board |

## 2. Parameters and secondaries (the families both engines have)

v1 shape: a tuple (count of units exactly right, then a secondary, usually −distance) with fixed primary/secondary points; the
"Tiered rules" setup added a gated ★ tier. v2 shape: a continuous main part plus exactly one dealt tie-breaker from a list,
lexicographic, no gate. The general change is CHANGED by owner 13, 14, 23 and 29, call (f), call 14 (tied tie-breakers).

| Family | v1 params | v1 primary · secondary | v1 ★ tiers (Tiered rules) | v2 params | v2 main | v2 dealt tie-breakers (undealt in code) | Mark | Decision | Hrs |
|---|---|---|---|---|---|---|---|---|---|
| Mirrormancer | axis LR or TB (rows or columns) | mirror lines · matching pairs | mirrors holding y, mirror halves x | none (rows only) | Σ row gaps (distance) | mirror-columns, one-apart, small-middle (middle, primes, zeros) | CHANGED | owner 13/14/23/29, call 14; axis TB dropped: no recorded decision | 1 (axis) |
| Magic Eighteen | axis rows or cols; T = N·vmax/2 = 18 | rows = 18 · −Σ distance | lines sum x, squares sum x (shared tier kit) | T = 18, rows only | Σ \|row − 18\| | columns, diagonals, different-numbers (first-column, primes, odd) | CHANGED | as above; cols axis dropped: no recorded decision | 1 |
| Opposite Nines | none; T = vmax = 9 | pairs = 9 · −Σ distance | lines sum 11–25, squares sum 12–24 | T = 9 | Σ \|pair − 9\| | mirror-nines, different-splits (big-on-top undealt 15 Nov: cheap peak; top-half, primes, odd) | CHANGED | as above; big-on-top: coordinator, 15 Nov (presets.ts BEGINNER_DEALT) | — |
| Two Pair | none | two-pair boxes · one-pair/three-of-a-kind boxes | link sums, links via, equal roads | none | Σ distance from two different pairs | apart, diagonal-pairs, small-pairs (primes, corners) | CHANGED | as above; v1's own secondary (one pair) folded into the distance | — |
| Spread of Three | none; spread 3 | squares spreading 3 · −Σ distance | (shared kit) | none | Σ \|spread − 3\| (sampled) | spread-diagonal, spread-small, square-different (primes, zeros, corners) | CHANGED | as above | — |
| Strangers | none | stranger pairs (both > 1) · 1s beside a bigger number | (shared kit) | none | count of strangers | across-strangers only (v1's own secondary "ones" and prime-strangers undealt 15 Nov: cheap peaks; primes, corners) | CHANGED | as above; ones undealt: coordinator 15 Nov (presets.ts) | 2 (re-tie "ones" without the cheap peak) |
| Leapfrog | none | scalar: pairs one apart (one tier on purpose) | (shared kit) | none | Σ \|\|a−b\| − 1\| | same-way, columns-leap, middle-factors (first-column, primes, zeros) | CHANGED | as above | — |
| Crosswise Threes | none | fold pairs 3 apart · −Σ distance | lines sum 11–18 | none | Σ \|\|a−b\| − 3\| | bigger-side, other-fold, fold-factors (fold-line, primes, zeros) | CHANGED | as above | — |
| Kings and Subjects | squares: corners (dealt) or all | courts · −gap | king paths, pairs, same roads | none (corner boxes) | distance king = subjects' sum | different-kings, king-multiples, kings-on-diagonals | CHANGED | call 13, call 14 | — |
| Staircase | direction → or ↓ | scalar: steps up by one | none | direction right/down; only right dealt | count | long-flight, double-stairs, low-stairs | CHANGED | call 13/14; one direction dealt: v1-audit #27 (equal opportunity) | 2 (deal ↓ once peers measure equal) |
| Uphill | corner TL/TR/BL/BR | whole lines · single rising steps | none | corner; only BR dealt | rising steps toward corner | rise-by-one, corner-peak, start-low | CHANGED | call 13/14; v1-audit #27 | 2 |
| Mountain Climb | none | reaches BR corner · longest climb | none | none | longest climb from top-left | climb-reach, climb-far, climb-summit | CHANGED | call 13/14, owner 13 (no yes/no primary) | — |
| Stepping Stones | none; hop = fixed step | scalar: biggest hop group | none | none | biggest group | outside-small, group-reach, group-corners | CHANGED | call 13/14 | — |
| Magic Accountant | axis rows/cols × target in mid ± spread (dealt range) | rows = T · −Σ distance | none | axis, T; only rows, T = 18 dealt | Σ \|line − T\| | other-way, diagonals, all-different | CHANGED | call 13; v1-audit #27; never seated with Magic Eighteen (call 19) | 3 (target range back) |
| Fillomino | none | scalar: cells in right-size groups | none | none | cells in right-size patches | patch-kinds, patch-count, near-misses | CHANGED | call 13/14 | — |
| Divisibility (Detective) | v1: divisor dealt, rows read as numbers | count of rows divisible | none | layout × lens × q (4 dealt) | powers counted | leftover-digits | CHANGED | owner 41; grid-params.md §12 | — |

## 3. Boards and cell types

| Item | v1 | v2 | Mark | Decision | Hrs |
|---|---|---|---|---|---|
| Beginner board size | 4×4 | 4×4 (`grid-4-d10`) | SAME | — | — |
| Beginner cell | one symbol 0–9, one colour (mono) | one whole number 0–9 | SAME | owner 5 (colour taken off the beginner board) | — |
| Board sizes | 3, 4, 5, 6, 7 | 4 only (2 for tests; `makeGridType` refuses others) | MISSING | no recorded decision (integration plan §1.8; audit §2.2 "STILL MISSING") | 8 (units, reps, mutators generalised) |
| Symbol sets | base10, base12, base16 glyphs, 52 playing cards (suits, faces) | digits 0–cap, cap ≤ 9 | MISSING | as above | 6 (bases) + 16 (cards) |
| Colour sets | mono, rgb, rgby, rainbow6 (mixes, wheel, spectral classes) | none | MISSING | as above; owner 5 covers the beginner board only | 20 (colour layer, mutators, renderer, energy) |
| Cell energy / prior | uniform prior μ: every digit 1/10 | stationary law: P(v) ∝ 2^−v/2 (P(0) 0.30, P(9) 0.013); φ = half the total + const | CHANGED | owner 10, 11 | — |
| Wire | Grid codec (symbol+colour per cell) | rows of digits joined by `/` | CHANGED | owner 3/15 (clean break) | — |
| Uniqueness | objects may repeat | no two objects hold the same board | CHANGED | owner 24 | — |
| Rendering | numbers, coloured tiles, glyphs, cards; per-viewer renderer | numbers in ink | MISSING (tiles) | audit A11: open question to owner | 2 |

## 4. Births and counts

| Item | v1 (Annotated basics, the default) | v2 (grids-beginner) | Mark | Decision | Hrs |
|---|---|---|---|---|---|
| Starting objects | 10 | 3 | CHANGED | owner 31 | — |
| Births | Poisson, 0.1/s | regular schedule, 1 per 240 s | CHANGED | owner 31 | — |
| Objects at the end | ≈ 10 + 30 = 40 (300 s) | exactly 5 (600 s) | CHANGED | owner 31, 34 | — |
| Birth mix | uniform over all boards (each cell 0–9 uniform) | a seeded walk from the stationary law (`birthMixSteps` 64): small digits dominate | CHANGED | owner 10, 11; call 4 ("births from the stationary law") | — |
| Classic / Big / Master counts | Grid type defaults: 80 objects, 0.5 births/s | grids-more-rules: 10 objects, 0.1/s (v1 Annotated basics numbers, not v1 Classic's) | CHANGED | coordinator, 15 Nov (presets.ts V1_DEFAULT_BOARD); no recorded decision on 80/0.5 | 1 |

## 5. Mutators and their prices

v1 prices (Annotated basics: `distance-v1`): an act costs W + 0.05·W², W = Σ over changed cells (log2 16 + 1.585·|Δ|), whatever
mutator made the change (net effect). v2: W = log2 9 (which) + choices + amount fee (rate·|k|) + confining surcharge (half the growth
of the total), same β 0.05 (`v2-economy/charge.ts`). One-cell +1: v1 W 5.6 (7.1⚡ before scaling); v2 W 8.7 (12.4). Swap 0↔9: v1 W
36.5 (103); v2 11.2 (17.4). Row +1: v1 W 22.3 (47); v2 9.2 (13.4). Then v2 scales summons and edits by power/64 (call 17).

| v1 mutator (mono digits) | v2 | Mark | Decision | Hrs |
|---|---|---|---|---|
| add (cell, line, 2×2 square, ring, whole grid; no wrap) | `cells.add`, `tally.add` (rows/cols), `boxes.add` (corner boxes only) | CHANGED: no ring, no whole grid, no arbitrary 2×2 | owner 17 (amount ∝ size), 19 (potential prices); areas: no recorded decision | 3 |
| swap_cells | `cells.swap` | CHANGED (price: flat 11.2 bits, a shortcut) | owner 25 | — |
| shift_line (slide, wrap) | `tally.rotate` | SAME (priced as a choice) | owner 25 | — |
| reverse_line | `mirror.reverse` | SAME | owner 25 | — |
| turn_grid | `turn.spin` (7 turns and flips) | SAME | owner 25 | — |
| swap_lines | none | MISSING | no recorded decision | 2 |
| turn_block (spin/flip a 2×2 square) | none | MISSING | no recorded decision | 2 |
| sort_line | none | MISSING | owner 19 (not invertible; would need a priced inverse) | 3 |
| mirror_fold (copy half onto half) | none | MISSING | owner 19 (overwrite, not invertible) | — |
| write (one symbol into an area) | none | MISSING | owner 19 (overwrite) | — |
| step_rank (count on, wrapping) | none | MISSING | owner 11 (wrap breaks confinement) | — |
| write_ramp (count along a line) | `steps.tilt` (relative: + 0, k, 2k, 3k) | CHANGED | owner 19 | — |
| swap_symbols (trade every 3 for every 7 in an area) | none | MISSING | no recorded decision (a bijection; fits owner 25) | 3 |
| multiply / divide (Lab cost model only) | none on grids | MISSING | no recorded decision (owner 17 mixed costing applied to lines only) | 4 |
| — | `turn.balance` (move k between opposite cells) | CHANGED (new) | grids.md §4 | — |
| Colour/suit mutators (paint, recolour, swap_colours, hue_turn, pattern_line, motif, majority_line, paint_by_key, stamp, tally, blend, suit_swap, suit_set) | none | MISSING (no colour board) | as §3 | with the board |
| Cost models: set-v1, dial-v1, log-v1, multiply-v1 (Lab setups) | one price list | MISSING | owner 17, 19 (one consistent price list); Lab variants: no recorded decision | 6 |
| Confining surcharge | none (distance-v1 symmetric) | half the growth of the total | CHANGED | owner 11 | — |
| Read price | κ = 32; free looks by default (observation "free") | κ = 32 × a weight derived from power; every game pays | CHANGED | owner 35, 36 | — |
| Summon / edit price | AST bits (Python weight 1, TS 0.44) | same bits × power/64; an edit costs what changes | CHANGED | owner 21; call 17 | — |

## 6. Scoring details

| Item | v1 | v2 | Mark | Decision | Hrs |
|---|---|---|---|---|---|
| Value of a state | surprisal of the ordinal under the uniform prior μ, from calibration tables (sampled) or analytic forms | −log2 π(states at least as good) under the priced walk's stationary law; exact convolution or sampled | CHANGED | owner 10, 19, 22, 23 | — |
| Ordinal | count of exact units first (a threshold count), fixed points per primary/secondary | continuous main, one tie-breaker, lexicographic; no buckets | CHANGED | owner 13, 23 | — |
| ★ tiers | "Tiered rules" setup: gated tier on the base | none | CHANGED | owner 13, 14, 23; call (f) | — |
| Maxima | rules had a top (e.g. Opposite Nines all 8 pairs) | uncapped tails in principle; beginner mains capped at band (Magic Eighteen "off by 4", Strangers 9 of 16) | CHANGED | owner 26; grids.md §6 (caps are a stop-gap) | — |
| Payoff | π_i = n_i · max(0, Σ_{j≠i} n_j), bits² | own bits × others' bits, square bits | SAME | owner 39 | — |
| Defence goals | option: one each or none; n = s⁺ − w(h − E h), w = 1 | none | MISSING | call 1 (RESTORE); not done (audit §1.5) | 8 (mechanism) + families §1d |
| Hold rarity | on: chance a state survives m = players − 1 random mutations | none | CHANGED | owner 43 | — |
| Peer noise | σ 8 bits keyed per state, shared; 0 on Annotated basics | variance 0 beginner, 64 elsewhere, fresh draw per read, per player | CHANGED | owner 32 | — |
| Public figures | live per-object salience; scoreboard every 10 s from disclosed sums | no free per-object figure; exact standings every 10 s | CHANGED | owner 33; call 15 | — |
| Annotations | per-family "lens" pictures (25 lenses: heat, workings, picture-by-picture) on every beginner rule | per-term marks (focus, notes like "3 short") on representation elements | CHANGED | no recorded decision (grids.md §7 describes the marks) | 6 |
| Commit clause | `only_if_better` option, off | room override `commitClause` | SAME | call 34 (restored) | — |
| Seat fairness | fair-aligned dealer | fair-aligned + grid clusters: big-digit never against small-digit, blocked pairs | CHANGED | owner 39; call 19 (seating) | — |
| Parameter drift | a seat's rule never changes | `driftSeconds` 120 on grids-beginner (no-op there: beginner families have one parameter set) | CHANGED | call 18 (drift) | — |

## 7. Setups and presets, and what was dealt by default

| v1 setup | Board | v1 dealt pool | v2 | Mark | Decision | Hrs |
|---|---|---|---|---|---|---|
| Annotated basics (DEFAULT) | 4×4 digits mono | the 8 beginner families (all others excluded) | `grids-beginner`: the same 8 families, 2–3 tied tie-breakers each | CHANGED (pool shape) | owner 13/14/29, call 14; default preset is now `lines-beginner` (DEFAULT_PRESET), not grids | — |
| Basics with bidding | as above + 45 s bid, first price, sealed, private | as above | `grids-beginner-bidding` (first, none, 45 s) | SAME | owner 18 | — |
| Basics with paid looks | as above, observation "paid" | as above | every game pays to look | CHANGED | owner 35 | — |
| Tiered rules | 4×4 digits mono | families with ★ tiers (beginner 8 + Kings and Subjects) | none | CHANGED | owner 13, 14, 23 | — |
| First steps | 4×4 digits rgb, 25 Hz, 600 s fixed | all rgb families minus weak | none | MISSING | no recorded decision (audit #66, §2.2) | with colour board + 2 |
| Annotated colours | 4×4 digits rgb, 600 s, 300 s planning | families with a lens (≈ 35) | none | MISSING | as above | with colour board + 2 |
| Classic | 5×5 digits rgby, Grid defaults | all minus 11 weak | none | MISSING | as above | with 5×5 + colour + 2 |
| Low income | Classic at 32 bits/s | as Classic | none | MISSING | as above | 1 after Classic |
| Big board | 6×6 hex rainbow6 | all minus weak | none | MISSING | as above | with board |
| Master | 7×7 cards rainbow6 | all minus weak (ladder_of_numbers allowed) | none | MISSING | as above | with board |
| — | — | — | `grids-more-rules` (7 coupled families, 1 param set each, 900 start) | CHANGED (new) | call 13 | — |
| — | — | — | `grids-arithmetic` (Divisibility, Leading Digits: 4 + 4 instances) | CHANGED (new, playtest) | owner 41; grid-params.md §13 | — |
| Lab: cost models (flat, dial, log, multiply) | 4×4 digits mono | beginner 8 | none | MISSING | §5 | 6 |
| Lab: observation (free, boards, agents) | as above | beginner 8 | none | CHANGED | owner 35, 36 | — |
| Lab: bidding (second price, open, handicaps shown, auction shown) | as above | beginner 8 | bid pricing/disclosure exist in v2-economy; no grid preset uses them | MISSING (as presets) | no recorded decision | 1 |
| Lab: tiers (plain, unlock, two ★, uncapped) | as above | tiered | none | CHANGED | owner 13, 14, 23 | — |
| User-saved setups, Configure page | yes | presets + room overrides | MISSING | call 35 (restore), not done | 6–8 |
| Default exclusions | WEAK_GRID_FAMILIES (11); mono: sudoku_scholar, ladder_of_numbers | per-pool lists; artefacts gate dealability | CHANGED | owner 7; integration plan | — |

## 8. Settings and defaults

| Setting | v1 Annotated basics (v1 Grid default) | v2 grids-beginner (grids-more-rules) | Mark | Decision | Hrs |
|---|---|---|---|---|---|
| Planning | 60 s | 60 s | SAME | call 8 | — |
| Length / end | 300 s fixed (Grid default: half-life 300 s) | 600 s fixed (more-rules: half-life 300 s, floor h/10) | CHANGED | owner 34; call 16 (floor) | — |
| Interaction rate | 25/s (default 100/s) | 3 opportunities/s (100/s) | CHANGED | owner 37 | — |
| Power | 64 bits/s | 4 (64) | CHANGED | owner 38, 42; call 17 | — |
| Full charge | 30 s | 240 s (30) | CHANGED | call 17 | — |
| Starting energy | 600 | 130 = 3 median starters × power/64 (900) | CHANGED | call 17; 900: grids.md §7 | — |
| Score interval | 10 s | 10 s | SAME | — | — |
| Pause | 180 s, one each | 180 s, one each | SAME | — | — |
| Agents per player | 200 | 20 | CHANGED | read-architecture R3 (owner's standing instruction, 2026-11-02) | — |
| Step budget / CPU | 500,000 steps, 1,000 ms | v2-sandbox limits | CHANGED | owner 3/15 (new runtime) | — |
| Languages | Python (seeds), TypeScript allowed | Python and TypeScript; practice partners use both | SAME | — | — |
| Seats / AI | humans + built-in players and practice partners at the beginner share | min 3 seats, filled by practice partners (starters); AI players; AI never bids | SAME | owner 18; call (i) | — |
| First summon | Example agent, beginner share (573-bit budget) | Simple starter | CHANGED | call (h) | — |
| Observation | free | paid at a derived weight; agents' reads tell the player free | CHANGED | owner 35, 36 | — |
| Peer noise | 0 (default 8 σ) | 0 (variance 64) | SAME (values) | owner 32 | — |
| Defence goals / weight | off / 1 | absent | MISSING | call 1 | see §6 |
| Object selection | uniform (shelter option) | uniform | CHANGED (shelter gone) | call 32 (not restored) | — |
| Bid phase | 0 s (45 s on the bidding twin) | none (45 s on the twin) | SAME | owner 18 | — |
| Rule rotation on replay | yes | yes | SAME | audit #31 | — |

## Gaps ranked by how visible they are in play

1. Births: boards are born from the stationary law (mostly 0s and 1s) instead of uniform digits; every new board looks sparse (CHANGED, owner 10/11, call 4).
2. Far fewer objects: 3 at start, 5 at the end, against v1's 10 rising to about 40 (CHANGED, owner 31/34).
3. Pace: 3 opportunities a second and power 4 instead of 25/s and power 64; boards move rarely (CHANGED, owner 37/42, call 17).
4. Rule cards: every beginner rule's score is a distance plus one tie-breaker in bits, not "pairs that make 9 score a point" (CHANGED, owner 13/14/23/29).
5. Moves: swaps, slides and spins are now cheap shortcuts, and far adds are dear; one-cell +3 costs about 5× v1's (CHANGED, owner 17/25).
6. No coloured, glyph, card or larger boards, so First steps, Annotated colours, Classic, Low income, Big board and Master are gone (MISSING, about 50 h for colour + 5×5 + presets).
7. 83 colour/card reward families absent (MISSING, about 3 h each after the board).
8. Paying to look in every game, and no free per-object figures (CHANGED, owner 33/35).
9. Strangers deals only "across-strangers": v1's own secondary (1s beside bigger numbers) is undealt (CHANGED, coordinator 15 Nov; 2 h).
10. Annotations: v1's lens pictures replaced by marks on elements (CHANGED, no recorded decision; 6 h).
11. Missing v1 moves: write, sort, swap rows, spin a 2×2 square, trade numbers, ring and whole-grid adds (MISSING; 2–3 h each where invertible).
12. 13 numbers-only v1 families not ported (Round Numbers, Number Bonds, Column Addition, Seesaw, Snap, Looking-Glass, Pinwheel, Constellation, Bingo, Full House, Twenty-One, Sudoku, Ladder of Numbers) (MISSING, about 3–4 h each).
13. Defence goals (MISSING; call 1 said restore; about 8 h plus families).
14. More-rules families deal one parameter each (Uphill BR, Staircase right, Magic Accountant rows, 18) and Mirrormancer / Magic Eighteen lost their column axis (CHANGED, audit #27; 1–3 h each).
15. Hold rarity gone, peer noise per read (CHANGED, owner 43/32; little visible at noise 0).
16. The Lab cost models (dial, log, multiply) and Lab bidding variants as setups (MISSING, about 7 h).
17. User-saved setups and the Configure page (MISSING, call 35; 6–8 h).
18. Agents per player 200 → 20 (CHANGED, R3; rarely reached).

## Known reachable tops (kept dealt as the v1 baseline)

Every beginner grid main part is bounded on the 0–9 board, as in v1, so a global top exists. In real games two have
been reached within 10 minutes. The coordinator (16 Nov) keeps both dealt: the grid game is the baseline against the
original, and the old rules stand for the comparison. A separate design session takes the grid rules to the owner's
layered shape (pool-plan.md v2, design-principles.md 3b); nothing from it is dealt yet.

| Family | Seen | Top reached |
|---|---|---|
| Leapfrog | grids session's end-to-end game (15 Nov), playtest round 34 (#943) | main "one apart · exactly" on 2 of 5 grids; grid 4 also cycled between two states against Two Pair (26 moves) |
| Two Pair | playtest baseline 2 (#969) | grid 2 at 4332/3423/2110/1201: main "exactly" and secondary 4 of 4 boxes |
| Mirrormancer (main part) | grid-annotations session (16 Nov) | any constant board (all 0s): every row reads the same backwards, distance 0. v1's base rule (Annotated basics dealt no tiers) had the same top: it counted mirror rows and never excluded a constant board. The secondary mirror-columns, v2's own (call 14), had no guard either; it gets v1's "different" guard from its tiers ("without it 7337/3773/3773/7337 tops both"), so only the main part keeps the v1 top |

**Why v2 reaches these tops more often than v1 did.** The tops are the same as v1's, but v1 rarely met them: its boards
were born with uniform digits, so a constant or near-constant board was far from every birth. v2's boards are born from
the stationary law (owner decisions 10 and 11): P(0) is about 0.30 and P(9) about 0.013, so most births are mostly
0s and 1s, a few cheap moves from a constant board and from the bounded tops above. This is a cost of that decision
to the grid game, for the owner to weigh.

## Coloured boards: does a rule's value survive a swap or a turn? (boards worker, 16 Nov)

The owner's finding (15–16 Nov): on grids nearly every damaging knock is a rearrangement at no change of energy. For
the coloured boards' original-rules baseline ("Grids · original colours", lib/v2-grid-boards; v1's rules kept as they
were, coordinator's call 37) the measurement per dealt rule: from good states (the top tenth of 4,000 law draws by
the rule's own bits, its committed value function), every swap of two cells (the whole cell, the colours only, the
numbers only: 120 pairs each) and every turn or flip of the board (7), the median share of the rule's bits kept, and
the share of knocks that keep under half. One parameter set and the dealt secondary per family.

| Rule (good states) | Swap a whole cell | Swap colours only | Swap numbers only | Turn or flip |
|---|---|---|---|---|
| Chessmaster (3.1–12.7 bits) | 100%, 14% under half | 87%, 20% | 100%, 0% | 100%, 0% |
| Parity Painter (2.8–9.5) | 100%, 0% | 100%, 19% | 100%, 15% | 100%, 0% |
| Colour Mirror (3.3–12.8) | 100%, 29% | **55%, 42%** | 100%, 0% | **66%, 44%** |
| Picture Frame (2.9–12.3) | 100%, 6% | 100%, 8% | 100%, 4% | 100%, 0% |
| Colour Bonds (2.5–12.4) | 100%, 22% | 100%, 25% | 100%, 26% | 100%, 0% |
| Honest Minesweeper (3.3–17.0) | 80%, 32% | 77%, 36% | 100%, 12% | 100%, 0% |
| Kingdom (3.1–8.8) | 100%, 9% | 100%, 14% | 100%, 0% | 100%, 0% |
| Set Spotter (2.6–9.6) | 100%, 36% | 100%, 36% | 100%, 36% | 100%, 0% |

Reading: a typical swap or turn leaves most of these rules' value intact (median 100% for six of eight), because each
reads a pattern that one swap touches only at two cells, and five of the eight are symmetric under every turn. The
exposed ones are Colour Mirror (a colours-only swap or a quarter turn breaks the mirrors: a median 55–66% kept, over
40% of knocks keep under half), and, less so, Honest Minesweeper and Set Spotter (a third of swaps keep under half).
Unlike the digit grid's rules, none loses everything to a turn: the damaging knock here is a swap, and it costs no
energy.
