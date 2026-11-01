# Solutions: exact survival functions, their derivations and their verification

Companion to [survey.md](survey.md) (which families are solved) and [playbook.md](playbook.md) (how to solve a new
one). Code: `lib/game-utilities/src/analytic/` (`kit.ts` tools, `grid.ts`, `int.ts`, `string.ts`; entry point
`analyticLevels` in `index.ts`). Notation: μ the uniform spawn prior, G(t) = μ{u ≥ t}, bits = −log2 G. Grid: N×N
cells, C colours, value law V (digits: uniform 0..S−1; cards: uniform rank 1..13), K = number of equally likely keys on
a layer (colour C, value S or 13, suit 4).

## 1. What the comparison taught us about the empirical tables

Every exact solution below was compared with every table on all 48 Grid shapes (data/calibration/v1 on develop plus
the `claude/calib*` data branches), the Int presets and the string presets: 65 families, about 230 000 levels.

**The Monte Carlo body is right.** For every family the maximum |z| over body levels (≤ 8 bits Grid, ≤ 13 Int,
≤ 11 string) is ≤ 4.1, which is what thousands of comparisons of a correct formula look like. The test suite asserts
< 5.5.

**The splitting tail is unbiased up to 64 bits, with growing noise.** Table bits − exact bits, all Grid levels of
non-exact tables:

| exact bits | levels | mean Δ | RMS Δ | 5th pct | 95th pct |
|---|---|---|---|---|---|
| 0–8 | 63 108 | 0.00 | 0.05 | −0.07 | 0.07 |
| 8–16 | 34 777 | −0.01 | 0.18 | −0.30 | 0.29 |
| 16–24 | 21 340 | −0.01 | 0.29 | −0.47 | 0.48 |
| 24–32 | 12 844 | 0.01 | 0.39 | −0.59 | 0.65 |
| 32–40 | 8 873 | 0.02 | 0.50 | −0.75 | 0.85 |
| 40–48 | 7 454 | 0.02 | 0.60 | −0.82 | 1.00 |
| 48–56 | 6 333 | 0.04 | 0.67 | −0.94 | 1.10 |
| 56–64 | 5 454 | 0.05 | 0.77 | −1.02 | 1.16 |
| 64–72 | 4 248 | 0.04 | 0.82 | −1.17 | 1.40 |
| 72–80 | 691 | −0.80 | 1.60 | −3.15 | 1.31 |
| 80–88 | 3 | −5.61 | 6.12 | −9.07 | −3.77 |

The RMS matches the reconstructed standard error of `compare.ts` (0.74 bits at 60 bits), so the error model is
calibrated. Above the 64-bit target (the deepest particle population) the tables under-state rarity.

string tables (same columns): 0–8: 0.00/0.02; 16–24: −0.07/0.28; 32–40: −0.03/0.50; 48–56: −0.03/0.77;
56–64: 0.11/1.13; 64–72: 0.12/1.04; 72–80: −0.81/1.75. Int32 tables: 8–16: 0.04/0.15; 16–24: 0.13/0.79;
24–32: 0.00/1.20.

**But individual tails are badly wrong where the kernel needs coordinated moves.** All of these are checkable by hand:

| family, shape | ordinal | exact | table | why |
|---|---|---|---|---|
| `bullseye`, Grid(6,base10,rgby) | (1, 24) | 38.00 (outer ring of 20 one colour: 4·4^−20) | 50.10 | all-or-nothing ring |
| `rainbow_bands`, Grid(7,cards,rainbow6) | (26, 28) | 58.70 | 71.87 | whole diagonals |
| `colour_carousel`, Grid(6,base16,rainbow6) | (0, 19, 19) | 31.78 | 42.66 | border cycle |
| `echo` period 4, string(16) | 8 | 56.00 (8 equalities: 128^−8) | 66.13 | equality chain |
| `last-word`, string(16) | 6 | 42.00 (128^−6) | 47.04 | equality chain |
| `haiku-master` length 20, string(128) | −101 | 49.00 (length ≤ 121) | 55.76 | length moves are rare |
| `hate_colour`, Grid(4,base10,rainbow6) | 16 | 41.36 (6^−16) | 44.67 | all cells one colour |
| `smooth-operator` {3,5,7,11,13}, Int32 | 2021629995 | 25.14 | 19.92 | sparse level sets |
| `full_house`, Grid(6,base10,rgby) | 78 | 82.51 | 73.45 | above the 64-bit target |

So the exact solutions are not just faster: for these tails they replace estimates that are off by 5–14 bits.

## 2. Derivations

### Grid: independent cells (`CELL_ADDITIVE` in grid.ts)

`conqueror`, `parity_painter`, `homebody`, `number_painter`, `colour_by_number`, `treasure_map`, `lucky_token`,
`seed3_green_ones`, `hate_colour`, `hate_value`. Each ordinal is u = u(base) + Σ_i h_i(x_i) with x_i the letter of
cell i. `cellAdditive` evaluates the card on the all-zero grid and on every single-cell change (N²·S·C evaluations,
≤ 16 000), checks the additive prediction on 64 random grids, and returns the convolution of the N² per-cell laws
(uniform over the S·C letters). Tuples (`lucky_token`: [tokens, halfway]) convolve componentwise, which yields the
exact joint law.

### Grid: independent blocks

- `looking_glass`: mirror pairs are disjoint; #pairs = N⌊N/2⌋ (V), N(N−1)/2 (D), ⌊N²/2⌋ (half turn); each pair
  matches w.p. 1/K. u ~ Binomial(#pairs, 1/K).
- `wallpaper_weaver` (step p): the pairs (c, c + p) of a row form chains (a forest), so by the forest lemma the
  N(N − p) equalities are independent: Binomial(N(N − p), 1/C).
- `mirrormancer`: per row, matches ~ Binomial(⌊N/2⌋, 1/K); (mirrors, pairs) = Σ_rows ([matches = ⌊N/2⌋], matches).
- `pinwheel`: ⌊N²/4⌋ disjoint quarter-turn orbits (the centre is skipped); per orbit the largest multiplicity m
  of 4 iid keys (K = C, or suits 4 on cards, or S symbols); (full, most) = Σ ([m = 4], m).
- `card_windmill`: per orbit enumerate the 4^4 suit patterns; good turns = #{i: s_{i+1} = s_i + 1 mod 4}; a full orbit
  scores 4 windmill cards. The odd-N centre is never a good turn.
- `rainbow_steps`, `rainbow_road`: `nextColour` is cyclic, so each of the N − 1 steps of a row is Bernoulli(1/C) and,
  by the constant-conditional lemma, independent. `rainbow_steps` ~ Binomial(N(N − 1), 1/C); `rainbow_road` =
  Σ_rows ([good = N − 1], good) with good ~ Binomial(N − 1, 1/C).
- `rainbow_bands`: anti-diagonal k has m_k = min(k, 2N − 2 − k) + 1 cells, good ~ Binomial(m_k, 1/C), and
  (score, right) = Σ_k (m_k·[good = m_k], good).
- `gravity`: column bottom runs h_c iid with P(h = k) = C^−k (1 − 1/C) for k < N and P(h = N) = C^−N; u = Σ h_c.
- `connect_four`: same heights; counters = Σ h_c; vertical fours in a column = max(0, h − 3); for four consecutive
  columns with heights a_0..a_3 the horizontal fours number min a_i and each diagonal direction contributes
  max(0, N − 3 − max_i(N − a_i − i)) (or the mirrored index). A chain over columns with the last three heights as
  state gives the exact joint (fours, counters).
- `bullseye`: ring k has m = (N − 2k)² − (N − 2k − 2)² cells (1 at an odd centre). Per ring: one colour w.p.
  C^(1−m), most-common count from `maxOccupancy(m, C)`. A chain over rings with an alive flag: alive_k = alive_{k−1}
  ∧ one-colour_k ∧ (colour_k ≠ colour_{k−1}); given both rings one-coloured the last event has probability
  (C − 1)/C independently of everything else, so the colour need not be carried.
- `stripe_painter`: per row the most-common count m ~ `maxOccupancy(N, C)`; a chain over rows with "previous row one
  colour"; a one-colour row adds a stripe unless the previous row is one colour and the same (1/C).
- `sunset_sky`: columns iid; per column a chain over the colour index with (smooth count, all smooth, up steps);
  sunset iff all steps are +0/+1 and 1 + #ups ≥ 3.
- `flag_bearer` (rows): mine ~ Binomial(N, 1/C); given mine, the other N − mine cells fall uniformly into C − 1
  colours and rival = their max occupancy; (won, lead) = Σ_rows ([mine > rival], mine − rival + N).
- `magic_accountant` (rows): row total T = V^{*N}; (exact, −distance) = Σ_rows ([T = target], −|T − target|).
- `seesaw` (rows): halves: lean = |V^{*⌊N/2⌋} − V'^{*⌊N/2⌋}| with independent halves; colours: lean = |Σ_i w_i|, w_i =
  +value (colour X), −value (colour Y), 0 otherwise.
- `round_numbers` (rows): from T mod base. `divisibility_detective` (rows): the row number mod m is a chain over the
  digits r ← (rB + v) mod m; found ~ Binomial(N, P(r = 0)).
- `sudoku_scholar` (rows, N ≥ 5): distinct values per row ~ occupancy(N, K); `full_house`: Σ_v C(n_v, 2) per row via
  the box DP; rows iid.
- `column_addition`: right to left, a chain over columns of (a, b, answer) ~ V³ with state (carry, still right, top
  row nonzero so far); a zero top row scores [0, 0].
- `colour_carousel`: the border is a cycle of 4N − 4 cells; fix the first colour (all starts are alike under the
  cyclic successor), chain with (last, moves, fine), then close the last edge back to the first cell; lap =
  [fine = 4N − 4 ∧ moves ≥ C].
- `uno_snake`: along the boustrophedon path, P(same colour or same value | previous cell) =
  q = 1 − (1 − 1/C)(1 − 1/K_value) for every previous cell, so the N² − 1 match indicators are iid and u = 1 + the
  longest run of successes.
- `staircase_climber`: per row a chain on the previous value (value + 1 has no successor at the top value, so the
  value must be in the state); rows iid.
- `bingo_caller`: dabbed cells are iid Bernoulli(q = |called|/#ranks) (the odd-N middle is free); a numeric DP over
  rows with state (columns still fully dabbed, both diagonals alive) and the points so far; full rows add N at once,
  columns and diagonals at the end.
- `hate_takeover`, `hate_symbol_takeover`: max occupancy of N² balls in C colours / K values.
  `hate_same_corners`: corner colours and values are independent, each a max multiplicity of 4 keys.
  `hate_repeat_row`: a chain along the row over (seen-colour mask, repeats, last colour).

### Int (x uniform on [min, max]; exact integer counts)

- Digit automata over |x| (decimal): `digit-devotee` (count of d), `firstborn` (matched prefix), `numerologist` (digit
  sum), `stairwalker` (last digit, run, best), `refrain` (the first P digits, repeats, alive; dead states are
  collapsed).
- Bit automata over the two's-complement pattern (negative x ↦ x + 2^32, width 32): `bit-sigil`, `zebra`.
- `power-hoarder`: #{v_p ≥ k} = nonzero multiples of p^k in [min, max].
- `smooth-operator`: for each S-smooth s ≤ max |x|, #{x ≠ 0: s(x) = s} = Σ_{T ⊆ S} (−1)^{|T|} #{x ≠ 0: s·ΠT | x}
  (exact integers); x = 0 scores 1.
- `residue-oracle`: hits depends on x mod L = Π m; each residue appears ⌊span/L⌋ times plus once in the leftover
  window.
- `tailwright`: matched ≥ k iff |x| ≡ tail_k (mod 10^k) and |x| has ≥ k digits.
- `palindromist` (base b): for each length ℓ and k, enumerate the k high digits (leading ≠ 0) whose mirror fixes the
  k low digits; numbers below B's length are free (b − 1)·b^(k−1)·b^(ℓ−2k); at B's length, compare the prefix with B,
  and when equal count the middles ≤ B's middle (+1 if the mirrored suffix ≤ B's suffix).

### string (uniform over ASCII strings of length 0..L)

P(len = n) = 128^n/Σ_m 128^m; characters iid uniform over 128 codes given n. One chain over positions, read off at every
length: `glyph-glutton`, `purist` (2-letter alphabet), `streaker` (longest run), `nest-builder` (depth, best: '('
up, ')' closes when depth > 0), `wordsmith` (space / lowercase / other; piece length capped at 11; word iff 2..10
lowercase), `tallykeeper` (digit values), `incantor` (KMP automaton of the spell; the ordinal is the largest state
reached), `scale-keeper` (typed-array convolution of uniform{0..127}), `palette-keeper` (occupancy of n draws over 128,
paired with min(n, 32)), `ascender` (per threshold t an absorbing chain over (last code, run < t)).
Equality chains: `last-word` (≥ k iff n ≥ k and k equalities), `mirror` (k ≤ ⌊n/2⌋), `echo` (k ≤ n − P): P = 128^−k.
`haiku-master` is the length law alone.

## 3. Verification results

Columns: shapes and tables compared; levels = table levels compared; max |Δbits| = max |table − exact| over all levels;
max z = the largest |Δ|/se; **body max z** = the same over Monte Carlo body levels only (a wrong formula shows here);
tail max |Δbits| = over splitting levels (dominated by the estimator failures of §1). Exact tables (Int(0,9999),
analytic-hook tables) agree to 2·10^−6 bits. Int and string solutions additionally equal exhaustive enumeration (Int: [−3001,
2468], [−123457, 98765], [0, 9999], both 2^31 ends; string: every string of length ≤ 3) to 1e-9 bits.
Reproduce: `node --experimental-strip-types lib/game-utilities/scripts/analytic-verify.ts <dirs> --md`.

| family | shapes | tables | levels | max \|Δbits\| | max z | body max z | tail max \|Δbits\| |
|---|---|---|---|---|---|---|---|
| `ascender` | 2 | 2 | 35 | 8.748 | 10.3 | 1.4 | 8.75 |
| `bingo_caller` | 48 | 48 | 3518 | 2.199 | 3.2 | 3.2 | 2.20 |
| `bit-sigil` | 2 | 24 | 251 | 0.288 | 2.3 | 2.3 | 0.29 |
| `bullseye` | 48 | 48 | 1393 | 14.061 | 17.3 | 2.9 | 14.06 |
| `card_windmill` | 12 | 12 | 791 | 1.571 | 2.9 | 2.9 | 1.57 |
| `colour_by_number` | 48 | 48 | 1320 | 3.159 | 3.6 | 2.8 | 3.16 |
| `colour_carousel` | 16 | 16 | 1421 | 10.877 | 17.0 | 3.4 | 10.88 |
| `column_addition` | 36 | 36 | 621 | 0.616 | 2.4 | 2.4 | 0.62 |
| `connect_four` | 48 | 48 | 7281 | 4.242 | 4.9 | 3.3 | 4.24 |
| `conqueror` | 48 | 96 | 14947 | 5.006 | 5.8 | 3.3 | 5.01 |
| `digit-devotee` | 2 | 20 | 150 | 2.415 | 4.8 | 2.0 | 2.41 |
| `divisibility_detective` | 36 | 180 | 1170 | 2.044 | 4.3 | 3.0 | 2.04 |
| `echo` | 2 | 10 | 110 | 10.133 | 12.8 | 2.2 | 10.13 |
| `firstborn` | 2 | 24 | 132 | 0.306 | 2.4 | 2.4 | 0.31 |
| `flag_bearer` | 48 | 48 | 3896 | 5.084 | 5.9 | 3.1 | 5.08 |
| `full_house` | 48 | 48 | 2553 | 9.068 | 10.5 | 3.0 | 9.07 |
| `glyph-glutton` | 2 | 2 | 34 | 7.472 | 9.0 | 1.7 | 7.47 |
| `gravity` | 48 | 48 | 1448 | 2.576 | 3.2 | 3.2 | 2.58 |
| `haiku-master` | 2 | 16 | 172 | 7.143 | 9.4 | 2.2 | 7.14 |
| `hate_colour` | 48 | 48 | 1316 | 3.428 | 5.0 | 3.3 | 3.43 |
| `hate_repeat_row` | 48 | 48 | 544 | 0.686 | 3.0 | 3.0 | 0.69 |
| `hate_same_corners` | 48 | 48 | 638 | 1.562 | 4.0 | 2.9 | 1.56 |
| `hate_symbol_takeover` | 48 | 48 | 1075 | 3.627 | 4.7 | 3.0 | 3.63 |
| `hate_takeover` | 48 | 48 | 1095 | 3.296 | 5.2 | 3.2 | 3.30 |
| `hate_value` | 48 | 48 | 1211 | 4.249 | 4.9 | 2.8 | 4.25 |
| `homebody` | 48 | 96 | 2050 | 3.295 | 4.7 | 3.3 | 3.29 |
| `incantor` | 2 | 2 | 16 | 4.594 | 6.5 | 1.5 | 4.59 |
| `last-word` | 2 | 2 | 14 | 5.044 | 7.7 | 1.0 | 5.04 |
| `looking_glass` | 48 | 288 | 4269 | 3.475 | 6.9 | 3.0 | 3.47 |
| `lucky_token` | 48 | 48 | 8884 | 5.007 | 5.8 | 3.2 | 5.01 |
| `magic_accountant` | 48 | 312 | 51306 | 1.273 | 3.7 | 3.7 | 1.27 |
| `mirror` | 2 | 2 | 20 | 4.954 | 5.8 | 1.4 | 4.95 |
| `mirrormancer` | 48 | 96 | 3085 | 4.091 | 4.9 | 3.3 | 4.09 |
| `nest-builder` | 2 | 2 | 33 | 3.360 | 4.0 | 0.3 | 3.36 |
| `number_painter` | 48 | 48 | 1210 | 3.082 | 4.1 | 3.7 | 3.08 |
| `numerologist` | 2 | 19 | 512 | 0.211 | 3.2 | 3.2 | 0.21 |
| `palette-keeper` | 2 | 12 | 375 | 5.106 | 7.4 | 3.1 | 5.11 |
| `palindromist` | 2 | 18 | 112 | 0.552 | 2.5 | 2.0 | 0.55 |
| `parity_painter` | 48 | 60 | 2245 | 5.984 | 6.9 | 3.3 | 5.98 |
| `pinwheel` | 48 | 96 | 4983 | 6.604 | 8.7 | 3.5 | 6.60 |
| `power-hoarder` | 2 | 8 | 98 | 1.207 | 3.8 | 2.0 | 1.21 |
| `purist` | 2 | 6 | 382 | 5.293 | 6.3 | 2.4 | 5.29 |
| `rainbow_bands` | 48 | 48 | 10315 | 13.163 | 15.5 | 4.1 | 13.16 |
| `rainbow_road` | 48 | 48 | 2681 | 7.028 | 8.8 | 3.2 | 7.03 |
| `rainbow_steps` | 48 | 48 | 1142 | 5.100 | 5.9 | 2.9 | 5.10 |
| `refrain` | 2 | 6 | 30 | 0.867 | 2.2 | 2.2 | 0.87 |
| `residue-oracle` | 2 | 24 | 145 | 2.026 | 6.0 | 2.2 | 2.03 |
| `round_numbers` | 36 | 36 | 2475 | 0.871 | 3.6 | 3.6 | 0.87 |
| `scale-keeper` | 2 | 19 | 10188 | 4.116 | 4.9 | 3.1 | 4.12 |
| `seed3_green_ones` | 48 | 48 | 9273 | 6.744 | 7.9 | 3.6 | 6.74 |
| `seesaw` | 48 | 96 | 14498 | 1.125 | 3.8 | 3.8 | 1.12 |
| `smooth-operator` | 2 | 6 | 878 | 5.220 | 15.4 | 3.4 | 5.22 |
| `staircase_climber` | 48 | 48 | 1053 | 4.809 | 6.8 | 2.8 | 4.81 |
| `stairwalker` | 2 | 4 | 26 | 0.767 | 2.9 | 2.9 | 0.77 |
| `streaker` | 2 | 6 | 134 | 1.610 | 2.0 | 1.5 | 1.61 |
| `stripe_painter` | 48 | 48 | 2221 | 3.743 | 5.9 | 3.3 | 3.74 |
| `sudoku_scholar` | 36 | 36 | 1052 | 0.826 | 2.6 | 2.6 | 0.83 |
| `sunset_sky` | 48 | 48 | 2755 | 2.121 | 3.8 | 3.8 | 2.12 |
| `tailwright` | 2 | 24 | 130 | 0.848 | 2.9 | 2.9 | 0.85 |
| `tallykeeper` | 2 | 18 | 1940 | 1.787 | 3.0 | 3.0 | 1.79 |
| `treasure_map` | 48 | 48 | 21371 | 4.638 | 5.4 | 4.1 | 4.64 |
| `uno_snake` | 48 | 48 | 1429 | 2.895 | 3.4 | 3.0 | 2.90 |
| `wallpaper_weaver` | 48 | 96 | 1661 | 3.305 | 3.8 | 3.4 | 3.30 |
| `wordsmith` | 2 | 2 | 10 | 7.093 | 11.2 | 1.6 | 7.09 |
| `zebra` | 2 | 2 | 44 | 0.424 | 1.0 | 1.0 | 0.42 |

(`picture_frame`, `lone_peak` and `hate_colour` are wired through their own `analytic` hook and verified by
test/analytic.test.ts.)

## 4. Families that resisted, and the nearest approximation

**Rows + columns** (`magic_accountant`/`seesaw`/`round_numbers`/`divisibility_detective`/`sudoku_scholar` with
`both`, and `straight_shooter`, `young_tableau`, `fair_weaver`, `twenty_one`, `flush_royale`, `number_sandwich`,
`set_spotter`, `court_parade`): row lines and column lines share every cell. Nearest approximation: treat the 2N lines
as independent (`gridApproxLevels`). Measured against all 48 shapes, max |Δ| / RMS Δ in bits by table-bits band:

| family (both) | 0–8 bits | 8–24 bits | 24–64 bits |
|---|---|---|---|
| `sudoku_scholar` (N ≥ 5) | 0.29 / 0.05 | 0.75 / 0.24 | 2.05 / 0.69 |
| `round_numbers` | 0.35 / 0.07 | 4.46 / 0.36 | 5.01 / 1.16 |
| `magic_accountant` | 1.22 / 0.20 | 4.33 / 0.76 | 9.92 / 1.92 |
| `divisibility_detective` | 1.79 / 0.38 | 5.03 / 1.67 | 6.63 / 2.96 |
| `seesaw` | 4.16 / 0.57 | 17.52 / 2.64 | 23.30 / 3.21 |

Good enough to cross-check, not to ship. The exact route is a row-scan DP whose state is the per-column summary each
rule needs (a column's running total for sums; that is (N·max value)^N states, too many for N = 7). For coverage-type
rules the per-column summary is tiny and the DP is exact and cheap (`bingo_caller` shipped; `lantern_lighter`,
`rooks_watch` next).

**Rare equalities on graphs with cycles** (`knight_riders`, `snap`, `number_bonds`): Binomial(#edges, p) as if the
graph were a forest is fine in the body (max |Δ| 1.6 bits below 8 bits) and wrong in the tail (11 bits at 8–24, 67
bits at 24–64 for `knight_riders`), because the tail is made by a few cells all equal, which satisfies many
constraints at once. The cheapest-witness bound (playbook T10) has the right shape; an exact answer needs a
Potts / Fortuin–Kasteleyn transfer matrix (offline).

**Connectivity** (`kingdom`, `archipelago`, `hate_blob`, `hate_big_blob`, `constellation`, `times_table_territory`,
`castle_keeper`, `swiss_cheese`, `bridge_builder`, `snake_charmer`, `royal_court`, `fillomino`, `stepping_stones`,
`seed2_patchwork`, `border_baron`, `tetromino_tamer`): exact only through partition-state transfer matrices; left to the
Monte Carlo fallback.

**Local rules over large alphabets** (`islander`, `neighbourhood_vote`, `king_of_the_hill`, `honest_minesweeper`,
`colour_wheel_harmony`, `quilt_maker`, `paint_mixer`, `colour_mixer`, `warm_hearts`, `twin_friends`, `kings_court`,
`colour_value_ladder`, `go_fish_books`, `seed1_line_painter`): a 2D transfer matrix is exact but its K^N state is too
big at deal time for K ≥ 4. Small-alphabet cases (`best_friends`, `odds_evens`, `othello_sandwich`, `chessmaster`)
are feasible with a typed-array broken-profile DP, not yet written.

**Global** (`far_apart`, `rainbow_roads`, `mountain_climb`, `magic_window`, `robin_hood`): no method attempted beyond
the fallback.

**Int**: `many-faced` (ω(x)) and `truncation-saint` (prime prefixes) need prime counting; the Selberg–Delange law
(P(ω = k) ≈ (ln ln X)^(k−1)/((k−1)! ln X) times a correction) is the nearest approximation, not measured here.

## 5. Wiring status: which solutions the engine uses

A solution is live when its family declares `analytic: solvedAnalytic("<id>")` (src/analytic/hook.ts; formula id
`<family-id>@1`, part of the table key). The tables of live families are rebuilt from the formula (`calibrate`), and their
former Monte Carlo tables are archived as references (data/analytic-reference/<family>.json), which
test/analytic.test.ts compares within the estimator's measured error (|Δ| ≤ 1.2 / 2.5 / 5 / 10 bits below 16 / 32 / 64
/ above, RMS z ≤ 1.5 below 32 bits).

**Live (50 of the 65 solutions here):** 45 through `solvedAnalytic`, and 5 the architecture session wired with its own
formulas before these landed (`hate_colour`, `hate_takeover`, `seed3_green_ones`, `staircase_climber`, `rainbow_road`;
tail-toolkit.md). The two sides agree on every shipped table. With `picture_frame`, `lone_peak` and `best_friends`,
53 families now calibrate from formulas.

**Exact but not wired (15, ✅‡ in survey.md):**
- `scale-keeper`, for table size. Its ordinal has about 16 000 attainable values on string(128), and an analytic table
  lists them all (3.3 MB, against 0.4 MB for the whole string(128) file today). Wiring it needs a table format that
  stores exact levels thinned to an interpolation error bound.
- `bullseye`, `rainbow_bands`, `colour_carousel`, `looking_glass`, `pinwheel`, `smooth-operator`, `echo`, `last-word`, `mirror`, `haiku-master`, `glyph-glutton`, `incantor`, `wordsmith`, `palette-keeper`. Each
  fails the reference test only because the archived table is wrong in the tail (§1). Example: `echo` with period 5
  on string(16), where ≥ 8 echoes is exactly 128^−8 = 2^−56 and the table says 63.5 bits. The thresholds cannot tell
  "the formula is wrong" from "the table is wrong". These families need either:
  1. an entry in test/analytic.test.ts `KNOWN_TABLE_BIAS`: from which depth the table is known to be biased, by
     how much, and why, with an independent exact check of a disputed level (a closed form such as 128^−8). This is how
     `rainbow_road` is wired. The string families also fail the RMS-z check below 32 bits (`wordsmith` 4.0,
     `incantor` 2.4, `haiku-master` 2.2, `mirror` 2.0, `echo` 1.9), so the allowance must extend to that check; or
  2. regenerated references from a better estimator (e.g. splitting on a finer score that counts partial progress).

`test/analytic-solutions.test.ts` keeps this list honest: every solved family is either wired to its own solution or
listed as unwired.

**Cost of wiring.** The hook returns its formula id at once and computes the levels on first read. calibration.ts
`analyticIdFor` builds table keys from the id alone, so coverage of all 13 shipped instances stays at 0.4 s. Exact
tables pass through the estimator's clean-up (MIN_STEP_BITS = 1e-6 bits between neighbours), which shifts a family
with thousands of close levels by up to 1e-3 bits (`tallykeeper`). This is harmless, and the test bounds it at 0.01.

Until then these 15 keep their Monte Carlo tables, and so keep tail errors of up to 14 bits.

## 6. Proven maxima (exemplars)

An exemplar claims the top of its family's ordinal (playbook §5). These are proven, in src/analytic/maxima.ts, and
listed in `EXACT_EXEMPLARS`:

- `snake_charmer`: the longest snake is the longest induced path of the N×N grid graph. Exact branch and bound gives
  **7, 11, 17, 24, 33** cells for N = 3..7 (N = 7 in about a minute). The old serpentine exemplar gave 10 on 4×4.
- `colour_mixer`: a max-plus row transfer matrix over P1/P2/M (5^N states). Brute force over all 3^16 4×4 grids
  confirms it. The exact (mixes, near) optima:

  | N | 3 | 4 | 5 | 6 | 7 |
  |---|---|---|---|---|---|
  | touching both parents | (5, 5) | (8, 8) | (14, 14) | (20, 20) | (28, 28) |
  | strict (parents on opposite sides) | (4, 4) | (6, 8) | (12, 12) | (16, 18) | (24, 24) |

Still not proven (exemplars below their sampled tops):
- `magic_window`: each window has at most 8 magic lines, but the equations of all windows together (every line of
  every window sums to 3 × its centre) have rank N² − 1 for N = 4..7. So only constant grids make every window
  magic, and constant lines do not count. The maximum total is therefore an optimisation over which windows to
  sacrifice, with no closed form: a search over one exact magic window plus the free cells is the next step.
- `border_baron`, `number_sandwich`, `rainbow_roads`, `court_parade` involve connectivity, rows plus columns, or
  global paths. Proving their maxima needs a dedicated search per family; their tables' tops are the best known lower
  bounds.
