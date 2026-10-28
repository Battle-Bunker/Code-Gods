# Grid Lab rules: every brainstorm utility in ordinal form

Code: `gridlab/rules/` (one module per lens: `seeds.py strategy.py geometry.py arithmetic.py colour.py games.py`,
shared helpers in `_util.py`). `from gridlab.rules import FAMILIES, by_id, shortlist`.
Tests: `cd lib/grid-lab && python3 -m tests.test_rules [family_id ...]` (about 20 s on 4 cores).
Every shortlisted family also has a kid-readable card (`card_source`, `rules/cards.py`): see [kid-cards.md](kid-cards.md).

**88 families**: the 3 seeds, all 31 shortlisted rules (`tags={"shortlist"}`, seeds also `"seed"`), every distinct
appendix rule, and 13 of the lens files' undeveloped "cross-lens ideas". **Every family has `batch`** (vectorised
over `(B, N, N)`), an independent scalar `ordinal`, and an `exemplar`. 68 have `canonical`, and 8 have `exact_log2_tail`.

## 1. How the brainstorm was converted

An ordinal utility is an `int`, or a fixed-length tuple of ints compared lexicographically, where only the order matters. Each rule was converted in four steps.

1. **Drop monotone calibration.** All `[0,1]` normalisation, `÷ max`, squaring, cubing, `count²`, `×2`, `+5 per parade`
   and bonuses that never reorder grids were removed. Examples: Bridge Builder's `2N` for a full crossing (span `N`
   is already the top), Sudoku's `+N` Latin bonus (`2N` distinct lines is already the top), Feuding's `2·min`, and
   Court Parade's `+5` units.
2. **Keep definition changes that change the order.** These are kept:
   - "your colour" instead of "any colour" (Seed 1);
   - Seed 2 regions need size ≥ 2;
   - Othello captures only when *exactly one* cell lies between (`X ? X`);
   - Sudoku is all-or-nothing over rows, columns and both diagonals at N ≤ 4;
   - Divisibility drops m = 2;
   - Robin Hood scores `min − (max − min)`;
   - Colour Carousel counts only *advancing* steps, and a full lap ranks first;
   - Ladder of Numbers ranks by the longest increasing streak;
   - Castle Keeper requires MinSize 4, and Rainbow Roads requires MinColours 4.
3. **Add a lexicographic tie-breaker where the raw score is coarse.** "Coarse" means most random grids tie, usually at 0
   (catalog §2b "High"). The tie-breaker measures *partial progress toward the same goal*, and the primary score
   always dominates (the ordinal is the tuple `(primary, secondary)`, built with `tup` / `tupb` in `_util.py`). So the top state and the meaning of the rule are unchanged.
   What changes is that the upper contour sets below the top form a smooth ladder of rarer and rarer events, so
   surprisal is informative off the jackpot too. Every tie-breaker is listed in the table. The patterns are:
   - *half-tokens*: a cell matching one of the two required attributes (Seed 3, Lucky Token, Rook's Watch);
   - *the pairwise version of a whole-line rule*: Rainbow Road → rainbow steps, Mirrormancer → mirror pairs,
     Straight Shooter → counting steps, Chessmaster → A–B seams, Sunset Sky → good steps, Young Tableau → uphill steps;
   - *distance to target*: Magic Accountant `−Σ|sum − T|`, Seesaw `−Σ|imbalance|`, Fair Weaver `−Σ(max − min)`,
     Round Numbers (closeness to a multiple);
   - *structural precursors*: Castle Keeper and Swiss Cheese count wall cells on the rim, Border Baron uses
     `Σ min(size_a, size_b, K)`, Stripe Painter, Bullseye, Pinwheel and Flush Royale use the per-line, per-ring or
     per-orbit plurality, Colour Mixer and Paint Mixer count mixes touching a parent, Rummy counts half-melds, Card
     Windmill counts suit steps, Tetromino counts 4-cell blobs, Royal Court counts faces off the rim, and Go Fish
     counts fish cells per window.

   **No tie-breaker on deliberate all-or-nothing temperaments.** These are Picture Frame and Sudoku at N ≤ 4. A
   progress tie-breaker would turn them back into linear rules (Picture Frame plus rim count is *exactly* the order
   of "count X on the rim"), and that would erase the holdout temperament the catalog wants (§4.5). No tie-breaker
   was added to rules that are already fine-grained (Low/Med in §2b). That covers Seeds 1–2, Conqueror, Parity
   Painter, Homebody, Number Bonds, Full House, Bingo, Lantern, KotH, Othello, Minesweeper and similar rules.
4. **Name the symmetry.** `canonical(params)` maps params to an orbit representative. Two draws can then share a
   calibration table only when `u_p(σ·g) = u_{σ·p}(g)` for a measure-preserving σ, as in architecture §10.4.1.
   The groups used are:
   - **S_k on colours**, only for rules that test colour *equality* against their params. Colours are renamed by
     first appearance (X → 0, (A, B) → (0, 1)).
   - **S on symbols / ranks / suits**, for equality-only symbol params (tokens, Bingo's called set → {0..k−1}).
   - **D4** for direction, axis and corner params (Rainbow Road `←↓↑ → →`, cols → rows, corner → TL/BR, Looking-Glass H → V, A → D,
     Straight Shooter step −1 → +1 via a half-turn).
   - **Value reflection** v → lo + hi − v, a symbol permutation preserving the prior. It is used for Magic
     Accountant (T → min(T, N(lo+hi) − T)) and King of the Hill (valley → peak).
   - **Cyclic colour rotation** for rules that use colour index arithmetic mod K. Colour-by-Number maps t → 0 and
     Harmony maps the favourite pair → 0.
   - **Recipe equivalence** for Colour Mixer. All distinct colour triples are equivalent under S_k, so every recipe
     maps to the GridType's first recipe.
   - **Suit swap red ↔ black** for Warm Hearts (flip → False).

   Rules that use colour *order*, mixing tables or rank adjacency do **not** get colour or rank permutations. Rainbow
   Road, Rainbow Bands, Rainbow Roads, Sunset Sky, Number Painter's colour numbers, Colour–Value Ladder, Straight
   Shooter, Paint Mixer and Card Windmill keep their colour labels as they are. Number Painter collapses all offsets
   for a different reason: every valid offset gives the same Bin(N², 1/#values) law. The tests check every canonical
   map statistically (KS test on 2000 + 2000 random grids, α ≈ 1e-6) and check that it is idempotent.

Exact tails (`exact_log2_tail`) exist for:
- Seed 3 and Lucky Token: the multinomial of tokens and half-tokens, so the tuple order is handled exactly;
- Conqueror (both weights), Homebody and Parity Painter: exact convolution of the per-cell laws;
- Picture Frame: `−(4N−4)·log₂K`;
- Number Painter and Colour-by-Number: binomial.

The tests check each one against the empirical tail.

**Conventions.**
- Cards: "same symbol" means same **rank**, as in Seed 2, Mirror, Snap, Sudoku, Bingo, Go Fish and Constellation.
  The exceptions are the token rules (Lucky Token, Rook's Watch) and Knight Riders, which use the full card.
- games.md's `suit` is the printed suit for cards and the colour elsewhere (Rummy, Flush Royale, Go Fish).
- Rainbow order wraps (`c+1 mod K`) on every Spectral set, following the catalog D1 verdict (Rainbow Road, Rainbow
  Steps). Sunset Sky and Rainbow Roads do not wrap.
- Ordinals may be negative for Conqueror, Homebody, Parity Painter and Robin Hood. Tuple components need no
  bounds and may be negative. A family's tuple length is the same in every GridType (Sudoku Scholar at N ≤ 4
  returns `(all_distinct, 0)` and Column Addition `(0, 0)` for an all-zero top row to keep the length fixed).

**Exemplars.** Most are closed-form constructions (checkerboards, stripes, rings, addition tables, circulants
summing to T, Lo Shu, Latin squares). Where the optimum has no simple form, the exemplar is the best grid found by a
deterministic search scored with `batch` (`hill_climb`, `multi_climb`, `plateau_search` in `_util.py`): Border Baron,
Castle Keeper (eyes), Swiss Cheese, Rainbow Roads, Othello, Colour Mixer, Feuding Families, King's Court, Fillomino,
Mountain Climb and Young Tableau. These are **best found, not proven maxima**. The tests only require that each one
reaches at least the maximum over 2000 random grids. One finding came out of this: Royal Court's doubled "safe
palace" `2(N−2)²` beats an all-picture grid (`N²`) only at N = 7. At N = 3 and 5, the exemplar (and the real top) is
a grid of nothing but picture cards.

## 2. Family table

Legend: layers C = colour, S = symbol, P = position. ★ = shortlisted; **seed** = seed rule. *requires* uses the
architecture class names plus refinements (`N>=k`, `N odd`, `colours>=k`). *extras* lists `exact` (closed-form tail)
and `canon` (canonical params). Every family has `batch` and `exemplar`.

### seeds.py

| id | name | layers | camp | requires | ordinal (higher = better) | tie-breaker (2nd tuple component) | invariance → canonical | extras | source |
|---|---|---|---|---|---|---|---|---|---|
| `seed1_line_painter` **seed** ★ | Line Painter | C+S+P | clumper | Valued | Σ value over cells in maximal runs (len ≥ 2) of colour X along rows, cols (+ all diagonals if diag); a cell counts once per direction | — | S_k colours (X→0) | canon | seed rule 1 / catalog#13 (D7: colour=mine, runs>=2, diag option) |
| `seed2_patchwork` **seed** ★ | Patchwork | C+S+P | alternator | Valued | Σ size×value over same-rank 4-regions of size ≥ 2 with no orthogonally adjacent equal colours inside | — | none needed (no params) | — | seed rule 2 / catalog#12 (min region size 2; cards compare rank) |
| `seed3_green_ones` **seed** ★ | Green Ones | C+S | clumper | generic | #cells with value v and colour X (default green 1s; cards: aces) | #cells with exactly one of (value v, colour X) | S_k colours, any value (→ colour 0, value vmin); exact multinomial tail | exact, canon | seed rule 3 / catalog#14 (D8); tie-breaker = half-tokens |

### strategy.py

| id | name | layers | camp | requires | ordinal (higher = better) | tie-breaker (2nd tuple component) | invariance → canonical | extras | source |
|---|---|---|---|---|---|---|---|---|---|
| `rainbow_road` ★ | Rainbow Road | C+P | alternator | Spectral | #lines read in direction D where every step is c→c+1 mod K | #good steps | D4 (dir→→) | canon | catalog#1 (D1, strat#4 line version; wrap on every Spectral set); tie-breaker = rainbow steps |
| `border_baron` ★ | Border Baron | C+P | clumper | generic | #edges between two different same-colour regions both of size ≥ K | Σ over region borders of min(size_a, size_b, K) | — | — | catalog#2 (strat#1); tie-breaker = Σ min(size_a, size_b, K) over country borders |
| `conqueror` ★ | Conqueror | C+S | clumper | Valued | Σ w·([c=A]−[c=B]), w ∈ {1, value} | — | S_k colours ((A,B)→(0,1)); exact convolution tail | exact, canon | catalog#5 (D6: strat#3 + arith#9 Tug-of-War as weight=value) |
| `parity_painter` ★ | Parity Painter | C+S | neutral | Valued | Σ ±1: +1 if (even/red-suit ∧ P) or (odd/black-suit ∧ Q), −1 for the swapped pairing | — | S_k colours; exact trinomial tail | exact, canon | catalog#8 (D13: strat#10 ±1 scoring; strat's Suited key as key=suit) |
| `mirrormancer` ★ | Mirrormancer | C+S+P | neutral | generic | #rows (LR) or cols (TB) palindromic in colour or rank | #matching mirror pairs | D4 (axis→LR) | canon | catalog#15 (D9 lines; cards compare rank); tie-breaker = matching mirror pairs |
| `homebody` ★ | Homebody | C+P | neutral | generic | #X in zone − #X outside (zone = rim or core) | — | S_k colours; exact convolution tail | exact, canon | catalog#16 (D5: strat#2; Fence Painter = zone rim) |
| `lone_peak` ★ | Lone Peak | C+S | neutral | Valued | m1 − m2 if the max value is unique and coloured X, else 0 | some max-valued cell is X | S_k colours | canon | catalog#27 (strat#9); tie-breaker = some top cell is your colour |
| `islander` | Islander | C+P | alternator | generic | #X cells whose in-grid neighbours all share one colour ≠ X | #X cells with no X neighbour | S_k colours | canon | strat#6 (catalog D2 'dots'); tie-breaker = your cells with no same-colour neighbour |
| `rooks_watch` | Rook's Watch | C+S+P | neutral | generic | #rows + #cols containing token (S, X) | #rows + #cols containing a half-token | S_symbols × S_k (→ (0,0)) | canon | strat#11 (catalog D8 coverage temperament); tie-breaker = lines holding a half-token |
| `picture_frame` | Picture Frame | C+P | clumper | generic | 1 if every rim cell is X else 0 (all-or-nothing) | none (deliberate holdout) | S_k colours; exact tail | exact, canon | strat#12 (catalog D5 all-or-nothing temperament; holdout, so no tie-breaker) |
| `staircase_climber` | Staircase Climber | S+P | alternator | Ranked, Valued | #adjacent pairs (→ or ↓) with value(next) = value + 1 | — | D4 (dir→→) | canon | strat#8 (catalog D11 'pairs' temperament) |
| `lucky_token` | Lucky Token | C+S | clumper | generic | #cells equal to token (S, X) (full card identity) | #half-tokens | S_symbols × S_k; exact multinomial tail | exact, canon | catalog D8 / strat 'sample your colour and your symbol'; tie-breaker = half-tokens |
| `neighbourhood_vote` | Neighbourhood Vote | C+P | clumper | generic | #cells whose strict-plurality 4-neighbour colour is X | — | S_k colours | canon | strat cross-lens idea 'Neighbourhood vote' |
| `far_apart` | Far Apart | C+P | neutral | generic | ⌊64 × Manhattan distance between the centroids of A and B⌋ (0 if either is absent) | — | S_k colours | canon | strat cross-lens idea 'Distance between centroids' (Manhattan, ×64 floored to an int) |

### geometry.py

| id | name | layers | camp | requires | ordinal (higher = better) | tie-breaker (2nd tuple component) | invariance → canonical | extras | source |
|---|---|---|---|---|---|---|---|---|---|
| `castle_keeper` ★ | Castle Keeper | C+P | clumper | N>=4 | non-W cells the border flood can't reach: count (plain) / count of T cells (treasure) / count + 3·pockets (eyes) | #W cells on the rim | S_k colours ((W,T)→(0,1)) | canon | catalog#4 (D4: geo#5 + games#8 Go Territory; treasure and eyes variants; MinSize 4); tie-breaker = wall cells on the rim |
| `chessmaster` ★ | Chessmaster | C+P | alternator | generic | #2×2 windows that are A/B checkerboards | #A–B seams | S_k colours | canon | catalog#6 (D2 windows, geo#8); tie-breaker = A–B seams (Best Friends) |
| `archipelago` | Archipelago | C+P | alternator | generic | #4-components of colour C | — | S_k colours | canon | geo#4 (catalog D2 'islands') |
| `bridge_builder` ★ | Bridge Builder | C+P | clumper | generic | max #distinct columns (LR) or rows (TB) touched by one C blob (2N bonus is monotone, dropped) | — | S_k × D4 (→ C=0, LR) | canon | catalog#11 (geo#1; the 2N full-crossing bonus is monotone, so the ordinal is the span) |
| `looking_glass` | Looking-Glass | C+S+P | neutral | generic | #mirror pairs (V, H, D, A or half-turn) equal in colour or rank | — | D4 (H→V, A→D) | canon | geo#2 + col#9 Mirror Quilt (catalog D9 'pairs'; half-turn axis from col) |
| `pinwheel` | Pinwheel | C+S+P | clumper | generic | #90° orbits whose 4 cells share colour (or symbol; cards: suit) | Σ per-orbit plurality | — | — | geo#3 (cards use suit); tie-breaker = Σ per-orbit plurality |
| `card_windmill` ★ | Card Windmill | S+P | alternator | Suited | #90° orbits whose suits step ♠→♥→♦→♣ cyclically in rotation order | #correct quarter-turn suit steps, all 4 per orbit (was 3 before the kid cards) | (no params) | — | catalog#30 (geo#17); tie-breaker = correct suit steps inside orbits |
| `royal_court` ★ | Royal Court | S+P | clumper | Faced, N odd | if centre is a face card (of suit): size of its face 4-region, ×2 if it avoids the rim | #face cards off the rim | S_4 suits (suit→0) | canon | catalog#31 (geo#16; HasCentre = odd N only); tie-breaker = picture cards off the edge |
| `bullseye` | Bullseye | C+P | neutral | generic | #consecutive rings from the outside that are monochrome and differ from the ring outside | Σ per-ring plurality | — | — | geo#6 (all-or-nothing from outside in); tie-breaker = Σ per-ring plurality |
| `snake_charmer` | Snake Charmer | C+P | neutral | generic | size of the largest C blob that is a simple path | — | S_k colours | canon | geo#9 |
| `tetromino_tamer` | Tetromino Tamer | C+P | neutral | generic | #C blobs exactly shaped like piece P (8 symmetries) | #C blobs of size 4 | S_k colours | canon | geo#10 (I only for N>=4); tie-breaker = 4-cell islands of any shape |
| `rainbow_bands` | Rainbow Bands | C+P | alternator | Spectral | #cells on anti-diagonals from corner K whose every cell has colour d mod K | #cells with colour d mod K | D4 (corner→TL) | canon | geo#11; tie-breaker = individually correct cells |
| `constellation` | Constellation | S+P | clumper | generic | size of the largest 8-connected cluster of rank S | — | S_ranks (→0) | canon | geo#13 (8-connectivity; cards sample a rank) |
| `rainbow_roads` | Rainbow Roads | C+P | alternator | Spectral, colours>=4 | #complete 4-connected roads colour 0→1→…→K−1 (DP, no wrap) | — | — | — | geo#14 (catalog D1 'roads'; NEW MinColours 4) |
| `paint_mixer` | Paint Mixer | C+P | alternator | Mixable | Σ over mixed-colour cells of [left/right = its parents] + [up/down = its parents] | #mixed cells touching a parent | — | — | geo#15 (catalog D12 'strict', both axes) |
| `colour_carousel` | Colour Carousel | C+P | alternator | Wheel, N>=4 | (border loop all steps 0/+1 and ≥ 1 full lap, #advancing steps, #0/+1 steps) | (inside the tuple) | D4 (dir→cw) | canon | geo#18 (catalog fix: count only advancing steps; full lap ranked first) |
| `gravity` | Falling Sand | C+P | clumper | generic | #X cells with only X below them in their column | — | S_k colours | canon | geo cross-lens idea 'Gravity / falling sand' |
| `swiss_cheese` | Swiss Cheese | C+P | clumper | N>=4 | #non-X 4-regions not touching the border (holes) | #X cells on the rim | S_k colours | canon | geo cross-lens idea 'Hole counting (Euler number)'; tie-breaker = rim cells of your colour |
| `mountain_climb` | Mountain Climb | S+P | alternator | Valued | (+1-step path from top-left reaches bottom-right, length of longest +1 path from top-left) | (inside the tuple) | — | — | geo cross-lens idea 'climb the mountain' (+1 steps from the top-left corner) |
| `treasure_map` | Treasure Map | C+S+P | clumper | Valued | Σ over X cells of value × doubled closeness to the centre | — | S_k colours | canon | geo cross-lens idea 'distance-weighted rules' (value × doubled closeness to centre, your colour) |

### arithmetic.py

| id | name | layers | camp | requires | ordinal (higher = better) | tie-breaker (2nd tuple component) | invariance → canonical | extras | source |
|---|---|---|---|---|---|---|---|---|---|
| `straight_shooter` ★ | Straight Shooter | C+S+P | alternator | Ranked, Valued | Σ L² over maximal ±1 runs (L ≥ 3) in rows L→R and cols T→B, ×2 if flush and monochrome; aceHigh option | #counting steps | rot180 (step→+1) | canon | catalog#9 (D11: arith#2 + games#3; flush and aceHigh); tie-breaker = counting steps |
| `number_bonds` ★ | Number Bonds | C+S+P | clumper | Valued | #adjacent pairs with v1+v2 = V+1 (cards 14) satisfying colour mode any/same/different | — | — | — | catalog#10 (arith#3; T = V+1, cards 14) |
| `magic_accountant` ★ | Magic Accountant | S+P | neutral | Valued | #lines (rows/cols/both) with Σ value = T | −Σ|line sum − T| | D4 (cols→rows) + value reflection (T→min(T, N(lo+hi)−T)) | canon | catalog#25 (D10: strat#7 + arith#1 exact mode); tie-breaker = total distance from T |
| `round_numbers` | Round Numbers | S+P | neutral | Numeral | #lines with Σ value ≡ 0 mod base | Σ closeness to a multiple of base | D4 (cols→rows) | canon | arith#1 Row Ranger round-number mode (catalog D10 mode=round); tie-breaker = closeness to a multiple |
| `king_of_the_hill` ★ | King of the Hill | C+S+P | alternator | Valued | #X cells strictly above (valley: below) all 4-neighbours | — | S_k × value reflection (valley→peak) | canon | catalog#26 (arith#13; valley variant) |
| `divisibility_detective` ★ | Divisibility Detective | S+P | neutral | Numeral | #rows (or rows+cols) whose base-b number ≡ 0 mod m (m=2 dropped) | — | — | — | catalog#29 (arith#14; m=2 dropped) |
| `number_sandwich` | Number Sandwich | C+S+P | alternator | Valued | #line triples with b = a+c (sandwich) or c = a+b (fibonacci), outer terms > 0, total cell colour X if set | — | S_k colours | canon | arith#4 Sum Sandwich (renamed per catalog) |
| `magic_window` | Magic Window | S+P | alternator | Valued | best 3×3 window's #non-constant lines summing to 3×centre (centre colour X if set) | magic lines summed over all windows | S_k colours | canon | arith#5; tie-breaker = magic lines summed over all windows |
| `times_table_territory` | Times-Table Territory | S+P | clumper | Valued | largest 4-region of values ≡ 0 mod m (or prime), optionally all colour X | — | S_k colours | canon | arith#6 (m menu per symbol set, prime variant, colour twist) |
| `odds_evens` | Odds & Evens | S+P | alternator | Valued | #2×2 parity checkerboards (odd cells must be X if locked) | — | S_k colours | canon | arith#7 Odds & Evens Chessboard (colourLock as X) |
| `number_painter` | Number Painter | C+S | neutral | Spectral, Valued | #cells with value = colour index + 1 + o | — | all valid o (→ smallest); exact Bin(N², 1/#values) | exact, canon | arith#8 (offset o; every valid o gives Bin(N², 1/#values)) |
| `robin_hood` | Robin Hood | C+S | alternator | Valued | 2·min − max over per-colour value totals (arith fix min − (max − min)) | — | (no params) | — | arith#10 with the catalog/arith fix min − (max − min) |
| `seesaw` | Seesaw | S+P | clumper | Valued | #balanced lines (left half vs right half, or colour X vs Y totals) | −Σ|imbalance| | D4 (cols→rows), S_k | canon | arith#11 (colourSeesaw variant as mode=colours); tie-breaker = total imbalance |
| `stepping_stones` | Stepping Stones | S+P | alternator | Valued | largest component linked by |Δvalue| = d | — | — | — | arith#12 (d menu incl. Cliffhanger ⌈V/2⌉) |
| `column_addition` | Column Addition | S+P | neutral | Numeral | trailing correct digits of row t + row t+1 = row t+2 in base b (0 if the top row is all zeros) | #correct columns anywhere | row choice (top→0) | canon | arith#15 (all-zero top row excluded); tie-breaker = correct columns anywhere |
| `ladder_of_numbers` | Ladder of Numbers | S+P | neutral | Numeral | longest streak of rows read as base-b numbers increasing down (or up) | #rising row steps | D4 (dir→down) | canon | arith#16 (catalog: longest streak primary, count of rises as tie-breaker) |
| `snap` | Snap! | S+P | clumper | generic | #adjacent equal-rank pairs | — | (no params) | — | arith cross-lens idea 'Snap' (cards: rank) |
| `young_tableau` | Uphill | S+P | alternator | Valued | #rows+cols strictly increasing toward corner K | #strict uphill steps | D4 (corner→BR) | canon | arith cross-lens idea 'Gradient / Young tableau' (strict); tie-breaker = uphill steps |
| `fillomino` | Fillomino | S+P | neutral | Valued | #cells whose same-rank region size equals their value | — | (no params) | — | arith cross-lens idea 'region size = symbol value (Fillomino)' |
| `colour_value_ladder` | Colour Ladder | C+S+P | neutral | Spectral, Valued | #adjacent pairs where sign(Δvalue) = sign(Δcolour index) | — | (no params) | — | arith 'colour-value ladder' / col 'gradients by value' cross-lens ideas |

### colour.py

| id | name | layers | camp | requires | ordinal (higher = better) | tie-breaker (2nd tuple component) | invariance → canonical | extras | source |
|---|---|---|---|---|---|---|---|---|---|
| `stripe_painter` ★ | Stripe Painter | C+P | clumper | generic | #lines that are monochrome and differ from the previous solid line (col code) | Σ per-line plurality | D4 (cols→rows) | canon | catalog#17 (D3: col#2 + geo#7 Zebra, col code); tie-breaker = Σ per-line plurality |
| `feuding_families` ★ | Feuding Families | C+P | clumper | generic | min(#X with no Y neighbour, #Y with no X neighbour) (×2 dropped) | #safe X + #safe Y | S_k colours | canon | catalog#18 (col#11; ×2 dropped); tie-breaker = total safe cells |
| `colour_mixer` ★ | Colour Mixer | C+P | alternator | Mixable | #M cells with a P1 and a P2 neighbour (strict: on opposite sides) | #M cells touching a parent | S_k (any recipe → first recipe) | canon | catalog#19 (D12: col#5 recipe param, strict from geo#15); tie-breaker = mixes touching a parent |
| `fair_weaver` ★ | Fair Weaver | C+P | alternator | generic | #rows+cols whose colour counts (all K) differ by ≤ 1 | −Σ(max−min) | (no params) | — | catalog#24 (col#7; kept generic, low ceiling at N=3 rainbow6); tie-breaker = total count spread |
| `lantern_lighter` ★ | Lantern Lighter | C+P | alternator | generic | #X cells alone in their row and column | — | S_k colours | canon | catalog#28 (col#12) |
| `best_friends` | Best Friends | C+P | alternator | generic | #orthogonal A–B seams | — | S_k colours | canon | col#1 (catalog D2 'seams') |
| `rainbow_steps` | Rainbow Steps | C+P | alternator | Spectral | #adjacent pairs in direction D with c2 = c1+1 mod K | — | D4 (dir→→) | canon | col#3 (catalog D1 'pairs'; wrap on every Spectral set) |
| `quilt_maker` | Quilt Maker | C+P | alternator | generic | #2×2 windows with 4 distinct colours (K=3: all 3, no side-by-side repeat) | — | (no params) | — | col#4 (3-colour default method; MinColours 4 not required) |
| `flag_bearer` | Flag Bearer | C+P | clumper | generic | #lines where colour C is a strict plurality | Σ winning margins | S_k × D4 | canon | col#6; tie-breaker = total winning margin |
| `colour_by_number` | Colour-by-Number | C+S | neutral | Valued | #cells with colour = (value + t) mod K | — | cyclic colour shift (t→0); exact Bin(N², 1/K) | exact, canon | col#8 (catalog D13 key=mod K; raw count, exact Bin(N², 1/K)) |
| `kingdom` | Kingdom | C+P | clumper | generic | size of the largest C blob | — | S_k colours | canon | col#10 |
| `wallpaper_weaver` | Wallpaper Weaver | C+P | neutral | generic | #cells equal in colour to the cell p steps right (or down) | — | D4 (down→right) | canon | col#13 (p=3 needs N>=4) |
| `sunset_sky` | Sunset Sky | C+P | neutral | Spectral | #lines in direction D with all steps 0/+1 (no wrap) and ≥ 3 colours | #good steps | D4 (dir→↓) | canon | col#14; tie-breaker = good steps |
| `colour_wheel_harmony` | Colour Wheel Harmony | C+P | alternator | Wheel | Σ adjacent opposite-colour pairs (favourite pair ×2) | — | C_6 wheel rotation (fav→0) | canon | col#15 (Wheel with an even colour count: rainbow6) |
| `warm_hearts` | Warm Hearts | C+S+P | neutral | Spectral, Suited | #dressed cards (red suit ↔ warm colour, XOR flip) + #adjacent dressed pairs sharing suit and colour | — | suit swap red↔black (flip→False) | canon | col#16 (catalog D13 key=warmth kept as its own family: raw count + matching pairs) |
| `twin_friends` | Twin Friends | C+S+P | alternator | generic | #A–B seams between equal-rank cells | #A–B seams | S_k colours | canon | col cross-lens idea 'symbol-gated colour rules'; tie-breaker = ungated seams |

### games.py

| id | name | layers | camp | requires | ordinal (higher = better) | tie-breaker (2nd tuple component) | invariance → canonical | extras | source |
|---|---|---|---|---|---|---|---|---|---|
| `rummy_melder` ★ | Rummy Melder | C+S+P | neutral | Ranked, Valued | Σ value over cells in a set (equal rank, 3 suits) or run (+1,+1, one suit) 3-window along dir | #half-melds (adjacent pairs) | D4 (cols→rows) | canon | catalog#3 (games#4; suits = colours outside cards); tie-breaker = half-melds (adjacent pairs) |
| `othello_sandwich` ★ | Othello Sandwich | C+P | alternator | generic | #X ? X triples with exactly one non-X cell between (rows, cols, + diagonals) | — | S_k colours | canon | catalog#7 (games#7 with the catalog fix: exactly one cell between) |
| `honest_minesweeper` ★ | Honest Minesweeper | C+S+P | alternator | Valued | Σ value over non-X cells whose value = #X among 8 neighbours | — | S_k colours | canon | catalog#20 (games#9) |
| `bingo_caller` ★ | Bingo Caller | S+P | neutral | generic | #dabbed (called ranks, free centre on odd N) + N·#complete rows/cols/long diagonals | — | S_ranks (called → {0..k−1}) | canon | catalog#21 (games#11; cards call ranks) |
| `sudoku_scholar` ★ | Sudoku Scholar | S+P | alternator | generic | N ≤ 4: 1 iff every row, col and both diagonals all-distinct (all-or-nothing); N ≥ 5: #all-distinct lines in dir (Latin bonus monotone, dropped) | N ≥ 5: Σ distinct ranks per line | D4 (cols→rows) | canon | catalog#22 (games#10; N<=4 all-or-nothing over rows, cols and diagonals: no tie-breaker; N>=5 Latin bonus is monotone so dropped; tie-breaker = distinct symbols per line) |
| `full_house` ★ | Full House | S+P | clumper | generic | Σ over lines in dir of equal-rank pairs | — | D4 (cols→rows) | canon | catalog#23 (games#1) |
| `flush_royale` | Flush Royale | C+S+P | clumper | Ranked, Valued | Σ over one-suit lines of their total, ×3 if also a straight | Σ per-line suit plurality | (no params) | — | games#2 (catalog D7 'whole lines' kept as its own family); tie-breaker = Σ per-line suit plurality |
| `twenty_one` | Twenty-One | S+P | neutral | Valued | Σ over lines of total if ≤ T (+T if exact); cards: J/Q/K=10, soft ace, T=21 | — | — | — | games#5 (cards T=21 with soft ace; number grid types sample T) |
| `go_fish_books` | Go Fish Books | C+S+P | clumper | generic | Σ over 2×2 windows all rank r of 1 (2 if all suits/colours distinct) | Σ fish cells over windows | S_ranks (r→0) | canon | games#6 (RGB perfect = all 3 colours); tie-breaker = fish cells summed over 2×2 windows |
| `set_spotter` | Set Spotter | C+S+P | clumper | Valued | #line triples with colours all-same/all-different and evenly spaced values | — | — | — | games#12 |
| `knight_riders` | Knight Riders | C+S+P | clumper | generic | #knight-move pairs with identical symbol and colour (colour X if set) | — | S_k colours | canon | games#13 (full card identity) |
| `uno_snake` | Uno Snake | C+S+P | clumper | generic | longest boustrophedon stretch where each step matches colour or rank | — | D4 (cols→rows) | canon | games#14 |
| `court_parade` | Court Parade | C+S+P | neutral | Faced, Suited | #J-Q-K same-suit windows (L→R, T→B) + #those led by their ace | #J→Q / Q→K same-suit pairs | S_4 suits | canon | games#15 (+5 units rescaled to counts); tie-breaker = J→Q / Q→K pairs |
| `kings_court` | King's Court | C+S+P | alternator | generic | Σ over cells of rank r of #8-neighbours with a different colour | — | S_ranks (r→0) | canon | games cross-lens idea 'King's court' (a diagonal-inclusive Seed 2 cousin) |
| `connect_four` | Connect Four | C+P | clumper | N>=4 | #4-in-a-row windows (any direction) of 'standing' X cells (all X below) | #standing X cells | S_k colours | canon | games cross-lens idea 'Connect Four with gravity'; tie-breaker = standing counters |


## 3. Merged, skipped and added

**Merged as true duplicates (no separate family)**
- Zebra (geo#7) is Stripe Painter (D3).
- Fence Painter (geo#12) is exactly Homebody(X, rim).
- Go Territory (games#8) has the same flood-fill semantics as Castle Keeper, and its `eyes` bonus is Castle's
  `mode="eyes"`.
- Mirror Quilt (col#9) is Looking-Glass, with the half-turn axis added.
- Row Ranger exact mode (arith#1) is Magic Accountant.
- Straight Shooter (games#3 copy) is Straight Shooter, with `ace_high` added.
- Colour Tug-of-War (arith#9) is Conqueror `weight="value"`.

**Kept as their own families** (the catalog merged them as parameters, but the order differs and the camp,
requirements or kid story is distinct):
- Best Friends (seams), Islander (dots) and Archipelago (islands), from the Chessmaster family;
- Rook's Watch (coverage), from Seed 3;
- Picture Frame (all-or-nothing), from Homebody;
- Looking-Glass (pairs), from Mirrormancer;
- Staircase Climber (pairs), from Straight Shooter;
- Paint Mixer (strict, both axes, no param), from Colour Mixer;
- Colour-by-Number and Warm Hearts (key variants), from Parity Painter;
- Flush Royale (whole lines), from Seed 1;
- Rainbow Steps (pairs) and Rainbow Roads (roads, MinColours 4), from Rainbow Road;
- Row Ranger round-number mode, as `round_numbers` (it needs Numeral);
- the generalised Seed 3 with sampled (S, X), as `lucky_token`.

**Cross-lens ideas implemented** (13): Neighbourhood Vote, Far Apart (centroid distance), Falling Sand (gravity),
Swiss Cheese (hole counting), Mountain Climb, Treasure Map (distance-weighted value), Snap, Uphill (Young tableau),
Fillomino, Colour Ladder (colour–value ladder / gradients by value), Twin Friends (symbol-gated Best Friends), King's
Court, Connect Four (gravity).

**Ideas skipped**, with reasons:

| Idea | Reason |
|---|---|
| Grudge (strat) | Equals Conqueror(A, next(A)). It is a dealer constraint on Conqueror's draw, not a new order. |
| Dominoes pair target (games) | This is Number Bonds with a sampled T. |
| Suit politics, suit warm/cool overlay, "♥ cells must be red" (strat, col, games) | These are Warm Hearts, or Parity Painter `key="suit"`. |
| Rainbow-order paths (geo) | This is Rainbow Roads. |
| Colour-weighted sums (col) | This is Seed 1 with a per-colour weight, a parameter rather than a rule. |
| Diagonal Best Friends / Rainbow Road (col) | These are adjacency variants. Seed 1, Othello, Set Spotter and Constellation already cover diagonals. |
| Region × value products (arith) | This is a Seed 2 variant. Fillomino is the distinct idea from that line. |
| Poker rows / best-hand family (arith, games) | The union of Full House, Flush Royale and Straight Shooter, plus a hand-ranking legend kids can't check at a glance. Candidate for later. |
| Domino tiler (geo) | Maximum matching per colour. Too heavy for a kid to verify (lens's own verdict). |
| Snakes & Ladders proper (games) | A token simulation, too long to compute by eye (lens's own verdict). |
| Scrabble premium squares (games) | Private positional params break the D4 table sharing, and the score is Seed 1 with weights. |
| Digit sum in base (arith) | "Probably too abstract for kids" (lens's own verdict). |
| Temperament as a parameter, calibration helper (strat) | These are meta-ideas, not rules. Temperaments are already dealt as separate families. |

## 4. Converting the existing Int and string families (`lib/game-utilities/src/families/*.ts`)

Their `[0,1]` outputs are already valid ordinals, because every one is a monotone transform of an integer count or a
distance. For the ordinal pipeline, each should return the **integer before normalisation**: `min(count, cap)`,
`n`, `hits`, `−|Δ|`. That gives identical order, exact ties across runtimes, and the `integer: true` score shape
(architecture §10.1). Order-only notes:

- **Coarse: random values tie at 0 or 1 almost always, so only a few bits exist below the jackpot.** Consider a
  tie-breaker.
  - Int `many-faced` (0..9 distinct primes): most ints have 1–3.
  - `truncation-saint` (prime prefixes ≤ 8).
  - `tailwright` / `firstborn` (0..5 matched digits, a 3.3-bit ladder; fine but short).
  - `residue-oracle` (0..6 omens, about 1 bit per level).
  - `stairwalker` (longest staircase; nearly always 1–2).
  - `refrain` (stops at the first mismatch, so almost always 0).
  - string `incantor` (spell-prefix length 0..8), `last-word` (0..6), `mirror` (stops at the first mismatch, so
    random strings score 0), and `nest-builder`.
  - Natural tie-breakers: total matched characters or digits regardless of position (`tailwright`, `last-word`,
    `mirror`, `refrain`), or the second-longest run (`stairwalker`, `streaker`).
- **Caps create ties at the top.** `min(count, 24)` (`glyph-glutton`, `streaker`), `min(k, cap)` (`power-hoarder`)
  and `min(m, 32)` (`mirror`) make every over-cap object tie with the jackpot. That is harmless, but it is the only
  reason the top is not unique.
- **`palette-keeper` is not a function of one integer.** It returns `0.7^|distinct − c| × min(1, len/32)`, a product
  of two factors, so its order mixes distinct-count distance with length. As an ordinal, use
  the tuple `(−|distinct − c|, min(len, 32))` or keep the product exactly, but not both. The other
  `base^(−distance)` families (`numerologist`, `tallykeeper`, `haiku-master`, `scale-keeper`) are just `−|Δ|`.
- `smooth-operator` (`log2(smooth part)⁴`) is a real-valued monotone transform of the integer smooth part. Use the
  smooth part, or `⌊log2⌋` if ties should be coarser.
- `bit-sigil` (`(hits/20)^20`) and `zebra` are already fine-grained binomial-like orders.

## 5. Performance (`batch`, 7×7, 20 000 random grids)

Component-labelling rules are slowest. They use `_util.label_batch` (min-label propagation, pointer jumping, and
iteration only over grids whose labels still change), followed by bincount reductions:
- Castle Keeper, Swiss Cheese, Tetromino Tamer, Seed 2, Border Baron and Snake Charmer: about 40–110k grids/s;
- Kingdom, Archipelago, Constellation, Bridge and Fillomino: about 70–220k grids/s;
- everything else: 0.1–20M grids/s.

A million-grid calibration therefore costs at most about 25 s for the slowest rule. Seed 2 went from about 40k to
about 70–110k grids/s after the labeller rewrite requested in NOTES.md.

## 6. Open issues

- Search-based exemplars are "best found", not proven maxima. The calibrator's `top_reached` should be read with that
  in mind for: Border Baron, Castle Keeper (eyes), Swiss Cheese, Rainbow Roads, Othello, Colour Mixer, Feuding
  Families, King's Court, Fillomino, Mountain Climb, Young Tableau, Honest Minesweeper (pattern search) and Tetromino
  Tamer (greedy packing).
- Tuple ordinals have many distinct levels. Seed 3, for example, has up to (N²+1)² values. Calibration tables key
  levels by observed values (ordinal keys), never by a dense range.
- Fair Weaver at N = 3 with rainbow6, Bridge Builder, Mirrormancer (colour, small N), Lantern Lighter and Sudoku at
  N ≤ 4 have low ceilings (5–16 bits). This is inherent and was left unpatched (catalog §4.6 #8): the dealer should
  weigh it.
- Royal Court requires odd N. The catalog's "degrade on even N to any centre cell" was not implemented.
- Robin Hood and Lone Peak still have no exact tail (engine note). Lone Peak's distribution is a closed-form order
  statistic and could be added. Robin Hood's needs a DP over colour totals.

