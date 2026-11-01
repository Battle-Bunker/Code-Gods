# Survey: which calibration probabilities have analytic solutions

Every dealt rule needs the survival function G(t) = μ{u ≥ t} of its ordinal u under the uniform spawn prior μ, from
0 bits up to about 64 bits (lib/game-utilities/src/calibration.ts). This survey classifies **every family in the
catalogue** (96 Grid, 14 Int, 14 string) by the structure that decides whether G has an exact, fast formula, and
records the status today.

- **Code**: exact solutions live in `lib/game-utilities/src/analytic/` (`analyticLevels(familyId, params, inst)`).
- **How to solve a new one**: [playbook.md](playbook.md). **Derivations and verification**: [solutions.md](solutions.md).
- **Verification**: `node --experimental-strip-types lib/game-utilities/scripts/analytic-verify.ts <table dirs…>`
  compares each solution with the empirical tables level by level; `test/analytic-solutions.test.ts` asserts the agreement on
  the shipped tables and checks Int/string solutions against exhaustive enumeration.

## Legend

**Structure** (what the rule's ordinal depends on, after the uniform prior makes cells iid letters):

| code | structure | typical exact method |
|---|---|---|
| **cell** | sum over cells of a per-cell (per-position) score | convolution of per-cell laws (`cellAdditive` reads the scores off the card) |
| **exch** | a symmetric function of the letter counts (multiset) | multinomial / occupancy DP over boxes |
| **block** | sum or sequential combination over *disjoint* blocks (rows, columns, mirror pairs, orbits, rings, diagonals) | per-block law (closed form, enumeration or a chain) then convolution / a chain over blocks |
| **line** | a chain along one line (path, row, border cycle) | Markov chain / transfer matrix along the line; longest-run DPs |
| **rows+cols** | sums over rows **and** columns (lines share cells) | no cheap exact method; independence approximation is the nearest |
| **local** | sum of local window indicators on the 2D grid (overlapping) | 2D transfer matrix (broken-profile DP) over a reduced alphabet; exact but the state is K^N |
| **conn** | connected components (sizes, counts, reachability, percolation) | connectivity transfer matrix (partition states); offline only |
| **global** | everything else (paths through the grid, centroids, max over windows) | Monte Carlo + splitting fallback |
| **digits** | Int: a finite automaton over the decimal / binary digits | digit DP over the range with exact integer counts |
| **arith** | Int: divisibility, residues, prime factors | floor counts, CRT periods, inclusion–exclusion on exact integers |
| **chars** | string: an automaton over iid characters, mixed over the length law | chain over positions, read off at every length |

**Difficulty**: **E** closed form or tiny DP (milliseconds); **M** exact DP that is still cheap at deal time
(≤ 1–2 s); **H** exact only with a large state space or offline; **R** no exact method known here, use an
approximation or the fallback.

**Status**: ✅ exact solution in `src/analytic`, verified on every shape that has tables, and live (the family's
`analytic` hook uses it, so its tables are built from the formula); ✅‡ exact and verified but not wired yet: its
archived Monte Carlo tables are wrong in the deep tail by more than the reference test (test/analytic.test.ts) allows,
so wiring needs the `KNOWN_TABLE_BIAS` allowance described in solutions.md §5 (`scale-keeper`: its 16k exact levels are too big a table); 🔒 already exact
and wired through the family's `analytic` hook (src/analytic.ts); ≈ approximation documented, not shipped; · not attempted.

## Grid families (96)

Cells are iid uniform over S symbols × C colours; a cell's value is the digit (base10/12/16) or the rank 1..13
(cards, so values are uniform over 13 ranks), its suit is ⌊s/13⌋.

| id | shape | what it counts | structure | candidate method | diff | status |
|---|---|---|---|---|---|---|
| `seed1_line_painter` | scalar | value of my-colour cells with a my-colour neighbour on each axis | local | binary-field transfer matrix + value convolution | H | · |
| `seed2_patchwork` | scalar | size × value of same-value patches with no equal colours inside | conn | connectivity transfer | H | · |
| `seed3_green_ones` | (2) | cells with my colour and value; cells with one of them | cell | trinomial | E | ✅ |
| `rainbow_road` | (2) | rows stepping round the rainbow; steps | block (rows) | cyclic next ⇒ steps iid Bernoulli(1/C) | E | ✅ |
| `border_baron` | (2) | borders between big countries | conn | — | R | · |
| `conqueror` | scalar | my colour minus enemy (± value) | cell | convolution | E | ✅ |
| `parity_painter` | scalar | colour matches parity / suit colour | cell | convolution | E | ✅ |
| `mirrormancer` | (2) | rows that are palindromes; mirrored pairs | block (rows) | Binomial(⌊N/2⌋, q) per row | E | ✅ |
| `homebody` | scalar | my colour inside (+1) or on the rim (−1) | cell | position-dependent convolution | E | ✅ |
| `lone_peak` | (2) | a unique top value of my colour, and its gap | exch (order stats) | order statistics | E | 🔒 |
| `islander` | (2) | isolated my-colour cells in a one-colour sea | local | transfer matrix over full colours; Poisson approx | H | · |
| `rooks_watch` | (2) | rows and columns containing my token / half-token | rows+cols (coverage) | DP over rows with state = covered-column sets (2^N × 2^N) | M | · |
| `picture_frame` | scalar | the whole rim my colour | block | C^−(4N−4) | E | 🔒 |
| `staircase_climber` | scalar | value = left neighbour + 1 | block (rows) | Markov chain on the value per row | E | ✅ |
| `lucky_token` | (2) | my token; half-tokens | cell | trinomial | E | ✅ |
| `neighbourhood_vote` | scalar | cells whose neighbours prefer my colour | local | full-colour transfer; approx | H | · |
| `far_apart` | scalar | centroid distance of two colours | global | joint of (counts, row sums, col sums); CLT | R | · |
| `castle_keeper` | (2) | cells walled off from the edge | conn | connectivity transfer | H | · |
| `chessmaster` | (2) | 2×2 checkerboards and seams of two colours | local | 3-letter transfer (3^(N+1) states) | H | · |
| `archipelago` | scalar | number of my-colour components | conn | cluster-count transfer (partition states) | H | · |
| `bridge_builder` | scalar | columns spanned by one my-colour component | conn | — | H | · |
| `looking_glass` | scalar | cells equal to their mirror twin | block (pairs) | Binomial(#pairs, q) | E | ✅‡ |
| `pinwheel` | (2) | quarter-turn orbits all alike; most-alike counts | block (orbits) | max multiplicity of 4 iid keys | E | ✅‡ |
| `card_windmill` | (2) | suits stepping round each quarter-turn orbit | block (orbits) | 4^4 enumeration per orbit | E | ✅ |
| `royal_court` | (2) | picture-card component holding the centre | conn | — | H | · |
| `bullseye` | (2) | one-colour rings, alternating, from outside in | block (rings) | chain over rings | E | ✅‡ |
| `snake_charmer` | scalar | longest unbranched my-colour component | conn | — (exact maximum known: longest induced path, solutions.md §6) | R | · |
| `tetromino_tamer` | (2) | my-colour components of size 4 (of my shape) | conn (small) | animal enumeration + inclusion–exclusion; Poisson | H | · |
| `rainbow_bands` | (2) | anti-diagonals in their rainbow colour | block (diagonals) | Binomial per diagonal | E | ✅‡ |
| `constellation` | scalar | largest 8-connected cluster of my value | conn | percolation transfer | H | · |
| `rainbow_roads` | scalar | paths through the palette order | global | — | R | · |
| `paint_mixer` | (2) | mixed colours between their parents | local | full-colour transfer | H | · |
| `colour_carousel` | (3) | the border going round the colour wheel | line (cycle) | chain along the ring, closed at the start | E | ✅‡ |
| `gravity` | scalar | my colour stacked from the bottom of each column | block (columns) | truncated geometric per column | E | ✅ |
| `swiss_cheese` | (2) | enclosed non-cheese holes; rind | conn | — | H | · |
| `mountain_climb` | (2) | +1 climbs from corner to corner | global | — | R | · |
| `treasure_map` | scalar | value × closeness of my-colour cells | cell | convolution | E | ✅ |
| `straight_shooter` | (2) | runs counting up in rows and columns | rows+cols | rows exact × columns exact under independence ≈ | R | · |
| `number_bonds` | scalar | neighbour pairs summing to a target | local (values) | value-alphabet transfer is S^N | H | · |
| `magic_accountant` | (2) | lines summing to a target; distance | block (rows) / rows+cols | row total = convolution; `both`: ≈ | E/R | ✅ rows |
| `round_numbers` | (2) | line totals ≡ 0 mod base; closeness | block (rows) / rows+cols | as above | E/R | ✅ rows |
| `king_of_the_hill` | scalar | my-colour strict local maxima | local (values) | Poisson / normal ≈ | R | · |
| `divisibility_detective` | scalar | row numbers divisible by m | block (rows) / rows+cols | chain mod m per row; `both`: ≈ | E/R | ✅ rows |
| `number_sandwich` | scalar | middle = sum of outer, rows and columns | rows+cols (local) | — | R | · |
| `magic_window` | (2) | magic 3×3 windows (max, total) | global (overlapping windows) | — | R | · |
| `times_table_territory` | scalar | largest patch of multiples of m | conn | percolation transfer | H | · |
| `odds_evens` | scalar | 2×2 parity checkerboards | local (binary) | 2-letter transfer, 2^(N+1) states | M | · |
| `number_painter` | scalar | value matches the colour's number | cell | Binomial | E | ✅ |
| `robin_hood` | scalar | poorest colour total minus spread | exch | DP over colours with (used, min, max) | H | · |
| `seesaw` | (2) | balanced lines | block (rows) / rows+cols | difference of independent sums; `both`: ≈ | E/R | ✅ rows |
| `stepping_stones` | scalar | largest group linked by |Δvalue| = d | conn | — | H | · |
| `column_addition` | (2) | correct digits of a written sum | line (carry chain) | chain over columns with the carry | E | ✅ |
| `ladder_of_numbers` | (2) | rows (as numbers) that keep rising | block (rows, ordered) | rise patterns of iid uniforms: order polynomial in B^N | M | · |
| `snap` | scalar | equal-value neighbour pairs | local (equality) | Potts / Fortuin–Kasteleyn transfer | H | · |
| `young_tableau` | (2) | rising rows and columns | rows+cols | — | R | · |
| `fillomino` | scalar | patches whose size equals their value | conn | — | H | · |
| `colour_value_ladder` | scalar | value and colour order agree across edges | local | — | H | · |
| `stripe_painter` | (2) | one-colour rows, alternating | block (rows) + chain | chain over rows (previous row one-colour) | E | ✅ |
| `feuding_families` | (2) | cells of two colours not touching the other | local (3 letters) | 3-letter transfer with two counts | H | · |
| `colour_mixer` | (2) | mixed cells touching both parents | local (3 letters suffice) | 3-letter transfer, 5^N states (exact maximum done by max-plus, solutions.md §6) | H | · |
| `fair_weaver` | (2) | lines with balanced colour counts | rows+cols | rows exact × columns ≈ | R | · |
| `lantern_lighter` | scalar | my-colour cells alone in their row and column | rows+cols (counts) | DP over rows, state = per-column count ∈ {0, 1, ≥2} (3^N) | M | · |
| `best_friends` | scalar | edges joining my two colours | local (3 letters) | 3-letter row transfer (tail-toolkit.md) | M | 🔒 |
| `rainbow_steps` | scalar | steps round the rainbow along rows | block (rows) | Binomial(N(N−1), 1/C) | E | ✅ |
| `quilt_maker` | scalar | 2×2 squares of four colours | local (full colours) | — | H | · |
| `flag_bearer` | (2) | rows my colour wins; total lead | block (rows) | multinomial per row | E | ✅ |
| `colour_by_number` | scalar | colour matches value mod C | cell | Binomial | E | ✅ |
| `kingdom` | scalar | largest my-colour component | conn | site percolation transfer | H | · |
| `wallpaper_weaver` | scalar | cells equal to the one p to the right | block (forest) | equalities on a forest are independent: Binomial | E | ✅ |
| `sunset_sky` | (2) | columns fading along the rainbow | block (columns) | chain per column | E | ✅ |
| `colour_wheel_harmony` | scalar | opposite-colour edges | local (C letters) | transfer over colour classes | H | · |
| `warm_hearts` | scalar | suits in matching colours, with twin neighbours | local | — | H | · |
| `twin_friends` | (2) | two-colour edges with equal values | local | — | H | · |
| `rummy_melder` | (2) | sets and runs along rows | block (rows) + line | chain along the row, state = last two cards | M | · |
| `othello_sandwich` | scalar | cells flanked by my colour | local (binary) | 2-letter transfer, 2^(2N) states | M | · |
| `honest_minesweeper` | scalar | numbers counting their mines | local (8-neighbourhood) | — | H | · |
| `bingo_caller` | scalar | dabs plus full rows / columns / diagonals | rows+cols (binary, all-or-nothing lines) | DP over rows, state = still-full columns + diagonals | E | ✅ |
| `sudoku_scholar` | (2) | lines with no repeated value; variety | block (rows) / rows+cols | occupancy per row; `both`: ≈ | E/R | ✅ rows |
| `full_house` | scalar | equal pairs within rows | block (rows) | Σ C(n_v, 2) via multinomial DP | E | ✅ |
| `flush_royale` | (2) | one-suit lines (straights triple) | rows+cols | — | R | · |
| `twenty_one` | scalar | blackjack totals of rows and columns | rows+cols | rows exact × columns ≈ | R | · |
| `go_fish_books` | (2) | 2×2 blocks of my rank | local (binary + suits) | binary transfer with suit counts | H | · |
| `set_spotter` | scalar | SET triples in rows / columns | rows+cols (local) | — | R | · |
| `knight_riders` | scalar | identical cells a knight's move apart | local (equality, rare) | Poisson / Chen–Stein ≈ | R | · |
| `uno_snake` | scalar | longest matching run along the boustrophedon | line | match indicators iid ⇒ longest run | E | ✅ |
| `court_parade` | (2) | J-Q-K parades of one suit | rows+cols (rare local) | Poisson ≈ | R | · |
| `kings_court` | scalar | different-colour neighbours of my rank | local | — | H | · |
| `connect_four` | (2) | fours of standing counters; counters | block (columns) + chain | heights iid, chain over columns (state: last 3 heights) | E | ✅ |
| `hate_colour` (penalty) | scalar | cells of the hated colour | cell | Binomial | E | ✅ 🔒 |
| `hate_value` (penalty) | scalar | cells of the hated value | cell | Binomial | E | ✅ |
| `hate_blob` (penalty) | scalar | largest hated-colour component | conn | — | H | · |
| `hate_takeover` (penalty) | scalar | largest colour count | exch | max occupancy | E | ✅ |
| `hate_big_blob` (penalty) | scalar | largest component of any colour | conn | — | H | · |
| `hate_same_corners` (penalty) | (2) | most alike corner colours, values | block (4 cells) | product of two max-multiplicity laws | E | ✅ |
| `hate_repeat_row` (penalty) | (2) | repeats in one row | line | chain over (colour mask, last, repeats) | E | ✅ |
| `hate_symbol_takeover` (penalty) | scalar | largest value count | exch | max occupancy | E | ✅ |

Grid tally: **42 exact** (39 in `src/analytic`, and `picture_frame`, `lone_peak` and `best_friends` via their own
`analytic` hook), of which 5 only for their `rows` params; 6 more are cheap exact DPs not yet written (M: `rooks_watch`,
`ladder_of_numbers`, `odds_evens`, `lantern_lighter`, `othello_sandwich`, `rummy_melder`); the rest need connectivity or
large-alphabet transfer matrices (H) or have no exact method (R).

## Int families (14): x uniform on [min, max]

| id | shape | what it counts | structure | method | diff | status |
|---|---|---|---|---|---|---|
| `digit-devotee` | scalar | copies of one digit in \|x\| | digits | digit DP | E | ✅ |
| `tailwright` | scalar | trailing digits matching a tail | arith | residue class mod 10^k with a length floor | E | ✅ |
| `firstborn` | scalar | leading digits matching a head | digits | digit DP | E | ✅ |
| `power-hoarder` | scalar | v_p(x) | arith | multiples of p^k | E | ✅ |
| `many-faced` | scalar | ω(x), distinct prime factors | arith (multiplicative) | Selberg–Delange / Sathe ≈; exact needs a sieve | R | · |
| `smooth-operator` | scalar | the S-smooth part of x | arith | inclusion–exclusion over S per smooth value | E | ✅‡ |
| `truncation-saint` | scalar | prime prefixes of x | arith (primes) | prime-density ≈ per prefix length | R | · |
| `palindromist` | scalar | matching outer digit pairs in base b | digits (two-ended) | enumerate the high half, count middles | M | ✅ |
| `stairwalker` | scalar | longest ±1 digit staircase | digits | digit DP | E | ✅ |
| `residue-oracle` | scalar | prescribed residues hit | arith (CRT) | count one period of Π m | E | ✅ |
| `bit-sigil` | scalar | bits matching a pattern | digits (binary) | binary DP over the two's-complement interval | E | ✅ |
| `zebra` | scalar | longest alternating bit run | digits (binary) | binary DP | E | ✅ |
| `numerologist` | scalar | −\|digit sum − T\| | digits | digit DP | E | ✅ |
| `refrain` | scalar | digits repeating a period-P motif | digits | digit DP with the motif in the state | M | ✅ |

Int tally: **12 of 14 exact**, all verified against exhaustive enumeration on four ranges (incl. both Int32 ends).

## string families (14): uniform over ASCII strings of length 0..L

| id | shape | what it counts | structure | method | diff | status |
|---|---|---|---|---|---|---|
| `glyph-glutton` | scalar | copies of one character | chars | Binomial mixture | E | ✅‡ |
| `purist` | scalar | members − non-members | chars | Binomial mixture | E | ✅ |
| `streaker` | scalar | longest run of a class | chars | longest-run chain | E | ✅ |
| `incantor` | scalar | longest spell prefix present | chars (substring) | KMP automaton, max state reached | E | ✅‡ |
| `last-word` | scalar | ending matched from the back | chars (equality chain) | 128^−k | E | ✅‡ |
| `mirror` | scalar | palindrome pairs | chars (equality chain) | 128^−k | E | ✅‡ |
| `ascender` | scalar | longest strictly increasing run | chars (order) | absorbing chain over (last code, run) | M | ✅ |
| `echo` | scalar | period-P repeats | chars (equality chain) | 128^−k | E | ✅‡ |
| `nest-builder` | scalar | deepest closed parenthesis | chars (walk) | chain over (depth, best) | E | ✅ |
| `haiku-master` | scalar | −\|length − ℓ\| | length only | length law | E | ✅‡ |
| `wordsmith` | scalar | lowercase words between spaces | chars | chain over (piece length, valid) | E | ✅‡ |
| `tallykeeper` | scalar | −\|digit-character sum − T\| | chars | convolution | E | ✅ |
| `palette-keeper` | (2) | −\|distinct − K\|, min(length, 32) | chars (occupancy) | occupancy per length | E | ✅‡ |
| `scale-keeper` | scalar | −\|Σ codes − W\| | chars | convolution of uniform{0..127} | E | ✅‡ |

string tally: **14 of 14 exact**, all verified against exhaustive enumeration of every string of length ≤ 3.

## Totals

| type | families | exact today | cheap exact, not written | hard exact / offline | no exact method |
|---|---|---|---|---|---|
| Grid | 96 | 42 (5 of them rows-only) | 6 | ~30 | ~18 |
| Int | 14 | 12 | 0 | 0 | 2 |
| string | 14 | 14 | 0 | 0 | 0 |
