# Grid utility catalog: consolidated brainstorm

These are research hypotheses, not choices for the shipping generator. Every number needs checking before anyone implements it.
Sources: `geometry.md` (geo), `arithmetic.md` (arith), `colour.md` (col), `games.md` (games), `strategy.md` (strat),
plus the brief and the capabilities addendum. The workers wrote about 77 rules, plus the 3 seed rules.
Random-grid figures come from the workers' Monte Carlo runs unless they are marked **[cat-sim]**. Those I ran myself for this catalog
(4000 grids each, script `scratchpad/catsim/s.py`).
Anything marked **(judgement)** is my call. No worker stated it.

Layer tags: **C** = reads colours only, **S** = reads symbols only, **P** = position-heavy, **C+S** = couples both layers.
Camp tags: **Clumper** = likes big same-colour (or same-symbol) regions, and monochrome grids score high.
**Alternator** = likes contrast, and monochrome grids score about 0. **Neutral** = indifferent, or the outcome depends on the draw.

**Scoring update (from the coordinator, applied throughout):** utilities will probably be converted to *bits of rarity* (−log2 of the
rule's tail probability under uniform spawn), so **only the order of a rule's scores matters**. Monotone "calibration fixes"
(squaring, cubing, count²) therefore leave the order unchanged and are **moot**. I have dropped them. A random-grid mean no longer matters in itself.
What matters is §2b: (a) **coarseness**, meaning many random grids tie on one value; (b) the **rarity of the top state**, as log2 P; (c) whether a
**cheap transform** (monochrome fill, constant symbol, rotation, a one-line positional repaint) reaches a very rare state. Definition changes that
*do* change the order are kept: the Othello gap-1 rule, the Seed 2 size floor, all-or-nothing Sudoku at small N, MinSize/MinColours, and dropping m=2.

Standing caveat (house style, from `value-functions-summary.md`): with two gods, payoffs are identical (U = ab), so these
alignment and conflict claims only produce politics with 3 or more gods.

---

## 1. Merged duplicates

| # | Cluster | Members (source) | Kept formulation | Variants kept as parameters |
|---|---|---|---|---|
| D1 | **Rainbow Road** | col#3 (counts +1 *pairs* in direction d), strat#4 (counts *whole lines* that step +1 in direction D), geo#14 (counts *complete* first→last roads, DP) | **strat line version**: lowest baseline (≈0 for N≥4), and kids count whole lines | `scoring ∈ {lines (default), pairs (col; ≈1/K baseline, so a fine but low-ceiling order), roads (geo; needs NEW MinColours 4)}`, `D ∈ {→,←,↓,↑}`. **Wrap disagreement:** col uses no wrap on RGB/RGBY, strat proposes `Wheel` by convention, geo uses no wrap. Verdict (judgement): wrap on every Spectral set ("blue goes back to red"), otherwise rows longer than k never score. Kept separate but related: Rainbow Bands (geo#11, the corner-anchored fixed phase), Colour Carousel (geo#18), Sunset Sky (col#14). |
| D2 | **Checkerboards** | Chessmaster (geo#8, 2×2 windows), Best Friends (col#1, A–B seams), Islander (strat#6, X dots in a one-colour sea), Archipelago (geo#4, count X components) | **Chessmaster 2×2 windows** (0.39/16 at K=3, against 9/40 for seams) | `scoring ∈ {windows, seams (Best Friends), dots (Islander), islands (Archipelago, which needs single-cell-only calibration)}`. Colour Wheel Harmony (col#15) is the "any complementary pair" generalisation. Odds & Evens (arith#7) is the *symbol-layer* analogue and stays separate. |
| D3 | **Stripes** | Zebra (geo#7) and Stripe Painter (col#2) are the same rule | col code | `orientation`. Optional `Spectral` upgrade from geo: stripes must run in rainbow order. |
| D4 | **Enclosure** | Castle Keeper (geo#5) and Go Territory (games#8) have the same flood-fill semantics | geo | `treasure T` (geo: only enclosed T-cells count), `eyes` (games: +3 per enclosed region) |
| D5 | **Zones and frames** | Homebody (strat#2), Fence Painter (geo#12, which is exactly Homebody(X, rim)), Picture Frame (strat#12, the all-or-nothing rim), col's "Fried Egg" idea | Homebody | `zone ∈ {core, rim}`, `temperament ∈ {linear, all-or-nothing (Picture Frame)}` |
| D6 | **Colour counts** | Conqueror (strat#3, #A − #B), Colour Tug-of-War (arith#9, ΣvalA − ΣvalB) | Conqueror | `weight ∈ {1, value}`. The value weight makes it C+S and needs `Valued`. Flag Bearer, Kingdom, Seed 3 and Homebody are the other "your colour count" rules. They stay separate because their geometry differs (line plurality, largest blob, token, zone). |
| D7 | **Seed 1 family** | Seed 1, Flush Royale (games#2, whole monochrome line of any colour, straight-flush bonus) | Seed 1 | `unit ∈ {runs ≥2 (default), whole lines (Flush)}`, `colour ∈ {mine (default), any}`, `diag` |
| D8 | **Seed 3 / tokens** | Seed 3 (green 1s), Rook's Watch (strat#11), strat's "sample your colour and your symbol" | Lucky Token | `temperament ∈ {count (Seed 3), coverage (Rook's Watch: rows+cols containing the token)}` |
| D9 | **Symmetry** | Looking-Glass (geo#2, matching pairs, 4 axes), Mirror Quilt (col#9, pairs, adds half-turn), Mirrormancer (strat#5, fully palindromic lines) | **Mirrormancer** (it is also geo's own recommended "stricter variant") | `axis`, `layer ∈ {colour, symbol (cards: rank; with Suited: suit)}`, `scoring ∈ {lines (default), pairs (soft; allows diagonal/half-turn axes; finer order)}`. Pinwheel (geo#3) stays separate. |
| D10 | **Line targets** | Row Ranger exact mode (arith#1) and Magic Accountant (strat#7) are the same | Magic Accountant | `axis`, `mode ∈ {exact T, round-number (Numeral: sum ≡ 0 mod b)}`, `diag` |
| D11 | **Straights** | Straight Shooter (arith#2) and Straight Shooter (games#3) are near-identical. Staircase Climber (strat#8) is the per-pair version | Straight Shooter | `step ±1`, `flush ×2` (arith), `aceHigh` (games, cards), `temperament ∈ {runs L² (default), pairs (Climber)}`, `wrap` with `Cyclic` |
| D12 | **Paint mixing** | Paint Mixer (geo#15, straight-line sandwiches on both axes, no param), Colour Mixer (col#5, recipe param, any neighbours), strat's "Painter's Palette" | Colour Mixer | `recipe ∈ {R+Y→O, Y+B→G, R+B→V}`, `strict` (geo: parents opposite each other in a straight line) |
| D13 | **Colour keys (symbol → colour)** | Parity Painter (strat#10), Colour-by-Number (col#8), Warm Hearts (col#16), strat's suit variant. Number Painter (arith#8) is close | Parity Painter's **±1 scoring** (mean 0 at random) | `key ∈ {parity (default), value mod K (Colour-by-Number), suit warmth (Warm Hearts, which needs Suited+Spectral)}`. Number Painter (exact value = colour number + offset) goes to the appendix as the sparse-key variant. |

Not duplicates, but they collide, so they are flagged: **Full House vs Sudoku Scholar** (exact opposites, both games), **King of the Hill
vs Lone Peak** (local vs global peaks), **Wallpaper Weaver vs Knight Riders** (periodic twins), **Fair Weaver vs Robin Hood**
(fair lines vs fair totals). There is also a naming clash: *Sum Sandwich* (arith), *Paint Mixer* "sandwiches" (geo) and *Othello Sandwich* (games). I suggest renaming
Sum Sandwich to "Number Sandwich" (judgement). Bridge, Kingdom, Constellation and Times-Table all use the same `comps()` helper.

---

## 2. Ranked shortlist (31 rules)

The ranking is my judgement. It weighs politics richness, kid-legibility, a low random baseline and portfolio diversity.
Mix: **C 14 · S 9 · C+S 8**, **Clumper 11 · Alternator 10 · Neutral 10**, **generic 20 · special-capability 11**.

| Rank | Rule | Layer | Camp | Requires |
|---|---|---|---|---|
| 1 | Rainbow Road | C/P | Alternator | Spectral (+Wheel) |
| 2 | Border Baron | C | Clumper (parasite) | – |
| 3 | Rummy Melder | C+S | Neutral (bridge) | Eq, Valued, Enum |
| 4 | Castle Keeper | C/P | Clumper (landlord) | Eq (MinSize 4 rec.) |
| 5 | Conqueror | C (C+S) | Clumper | – (Valued for weight=value) |
| 6 | Chessmaster | C | Alternator | – |
| 7 | Othello Sandwich | C | Alternator | – |
| 8 | Parity Painter | C+S | Neutral (coupler) | Valued (key variants: Suited, Spectral) |
| 9 | Straight Shooter | S | Alternator (symbols) | Valued, Enum |
| 10 | Number Bonds | S | Clumper (flat symbols) | Valued |
| 11 | Bridge Builder | C/P | Clumper | – |
| 12 | Seed 2 Patchwork | C+S | Alternator (colour) | Eq, Valued |
| 13 | Seed 1 Line Painter | C+S | Clumper | Valued |
| 14 | Seed 3 Lucky Token | C+S | Clumper | Eq |
| 15 | Mirrormancer | C or S | Neutral | – |
| 16 | Homebody | C/P | Neutral | – |
| 17 | Stripe Painter | C | Clumper | – |
| 18 | Feuding Families | C | Clumper | – |
| 19 | Colour Mixer | C | Alternator | Mixable |
| 20 | Honest Minesweeper | C+S | Alternator | Valued |
| 21 | Bingo Caller | S | Neutral | Eq |
| 22 | Sudoku Scholar | S | Alternator (symbols) | Eq (MinSize 5 rec.) |
| 23 | Full House | S | Clumper (symbols) | Eq |
| 24 | Fair Weaver | C | Alternator | – |
| 25 | Magic Accountant | S | Neutral | Valued |
| 26 | King of the Hill | C+S | Alternator | Valued |
| 27 | Lone Peak | C+S | Neutral (scarcity) | Valued |
| 28 | Lantern Lighter | C | Alternator (sparse) | – |
| 29 | Divisibility Detective | S | Neutral | Numeral b |
| 30 | Card Windmill | S/P | Alternator (suits) | Suited |
| 31 | Royal Court | S/P | Clumper (faces) | Faced, HasCentre |

### Entries

**1. Rainbow Road** (D1; col, strat, geo). Requires `Spectral`, wrapping with `Wheel` (by convention on all Spectral sets, see D1). C/P, Alternator.
- *Kid:* Count the rows (or columns) whose colours march round the rainbow one step at a time, in your direction.
- *Def:* score = the number of lines in direction D where every consecutive pair satisfies `c2 = next(c1)`. The maximum is N.
- *Params:* D ∈ {→,←,↓,↑}; scoring (lines / pairs / roads).
- *Random:* (1/k)^(N−1) per line, so ≈0 for N≥4. N=3 RGB gives ≈0.33 (strat). The pairs variant has a ≈1/K mean (6.6/20 on RGB) and a finer order. The roads variant gives ≈15 on RGB N=5, so it needs `MinColours 4` (geo).
- *Allies:* RR with a perpendicular D (both maxed by `(r+c) mod k`), Seed 2 (every neighbour differs, so the whole grid can be one symbol region), Border Baron (vertical stripes for RR→), Fair Weaver, Othello (judgement: X recurs every k cells). *Rivals:* RR with the opposite D (impossible together), Conqueror, Homebody, Seed 3, Mirrormancer(LR, colour), Quilt Maker, Colour Wheel Harmony, Castle/Frame.

**2. Border Baron** (strat#1). Generic. C, Clumper that is a parasite.
- *Kid:* You score for every edge where two *big* blobs of different colours touch.
- *Def:* label same-colour 4-regions. Score = the number of orthogonal edges between two different regions that both have ≥K cells.
- *Params:* K ∈ {N−1, N, 2N−2} (stripe thickness).
- *Random:* ≈0–3 of 42 (RGB N=7). Rainbow ≈0. Monochrome scores 0 by construction.
- *Allies:* Seed 1, Stripe Painter, Rainbow Road (vertical stripes), Homebody/Castle (core block inside a rim ring), Mirrormancer. *Rivals:* Chessmaster family, Seed 2. *Politics:* it sits between any two colour gods who have each claimed half the grid. Against Conqueror it is M: B→A recolouring helps it until A swallows everything.

**3. Rummy Melder** (games#4). Requires `Eq, Valued, Enum`. With `Suited`, suits replace colours. C+S, the bridge rule.
- *Kid:* Three of the same number in three different colours is a set. Three counting up in one colour is a run. Every melded cell scores its number.
- *Def:* look at every 3-window along `dir`. Set = equal ranks with 3 distinct suits/colours. Run = values +1,+1 in one suit/colour. Score = Σ value over cells in at least one meld.
- *Params:* dir ∈ {rows, cols}.
- *Random:* ≈0–3 at N=7, against a max of 300+ (hex).
- *Allies:* Seed 1 (runs), Seed 2 (sets), Straight Shooter, Full House, Set Spotter. *Rivals:* itself (set vs run in the same window), flat-colour grids (they kill sets), Sudoku (also kills sets). In card rooms a set in one colour pleases Seed 1 too.

**4. Castle Keeper (Go Territory)** (D4; geo#5, games#8). `Eq`, with `MinSize 4` recommended. C/P, a Clumper wall that acts as landlord of the interior.
- *Kid:* Build walls of your colour. Every cell that water from the edge can't reach is a point.
- *Def:* flood 4-wise from border non-W cells through non-W cells. Score = the number of non-W cells not reached. The maximum is (N−2)², from a full border ring.
- *Params:* W; optional treasure T≠W; optional eyes (+3 per enclosed region).
- *Random:* 0.10 (N=5, K=3), 0.33 (N=7, K=3), 0 (K=6). Monochrome scores 0.
- *Allies:* Homebody(W, rim)/Picture Frame, Bullseye, Pinwheel, Mirrormancer, Border Baron, plus every interior rule (Chessmaster, Tetromino, Seed 2, Royal Court, Sudoku, Twenty-One inside). *Rivals:* Bridge Builder of another colour, Stripe Painter, Rainbow Road, Colour Carousel, Snake Charmer on W, another Castle colour (fights over the border). One enemy edit zeroes the whole castle, so it is fragile, which makes for diplomacy.

**5. Conqueror (Tug-of-War)** (D6; strat#3, arith#9). Generic. Weight=value needs `Valued` and makes it C+S. C, Clumper.
- *Kid:* Colour A is your army and B your enemy. Score = A cells minus B cells (or A numbers minus B numbers).
- *Def:* Σ over cells of w·([c=A] − [c=B]), with w ∈ {1, value}.
- *Params:* A≠B; weight.
- *Random:* mean 0 (sd ≈ √(2N²/k)). Tug p95 ≈ 36 at N=5. Max N² (or N²V).
- *Politics:* the draw overlap decides everything. (A,B) vs (B,A) is zero-sum. (A,B) vs (A,C) are allies. (A,B) vs (C,D) both gain from "repaint B→C". With k=3 almost every pair is a direct ally or enemy, and K=3 gives a colour triangle. *Allies:* Seed 1, Mirrormancer, Seed 3 (A=green). *Rivals:* Rainbow Road, Border Baron (late), Othello, Robin Hood, Fair Weaver. Monochrome A is the max, and it is widely punished.

**6. Chessmaster (checkerboard family)** (D2; geo#8, col#1, strat#6, geo#4). Generic. C, Alternator.
- *Kid:* Every 2×2 square that looks like a little chessboard in your two colours scores.
- *Def:* the number of 2×2 windows with diagonals A/A and B/B. The maximum is (N−1)².
- *Params:* A≠B; scoring ∈ {windows, seams, dots (needs only X), islands}.
- *Random:* windows 0.39/16 (K=3), 0.03 (K=6). Seams 9/40 (K=3), a finer order than windows. Dots ≈0.4 at N=7. Islands 4.1/13.
- *Allies:* Seed 2 (one symbol on the checkerboard maxes both: the cosiest pair in the catalog), Othello (two gods X/Y), Castle (lives inside the walls), Wallpaper p=2, King of the Hill (high/low), Harmony if the pair is complementary. *Rivals:* Seed 1, Stripe, Bridge, Snake, Border Baron, Knight Riders (a checkerboard always scores 0 there), Quilt Maker, Fair Weaver (K>2). Mirror: M by size (see §3).

**7. Othello Sandwich** (games#7). Generic. C, Alternator. **Calibration flagged.**
- *Kid:* Any run of other colours trapped between two of your cells is captured, one point per captured cell.
- *Def:* for each line (and diagonals if `diag`), each maximal non-X run with X at both ends adds its length.
- *Params:* X; diag.
- *Random:* games estimated 15–30% of max. [cat-sim] gives 5.1 at N=5 RGB (max ≈18–20) and 18.3 at N=7 RGB. **Fix:** count only `X ? X` captures (a gap of exactly 1). [cat-sim] then gives 2.3/20 (N=5 RGB), 0.7 (K=6) and 5.2/42 (N=7 RGB). (Squaring, as games suggested, is moot under rarity scoring.)
- *Allies:* Seed 2, a second Othello god of colour Y (checkerboard), Castle of the same colour, Rainbow Road (judgement), Minesweeper with mines = X. *Rivals:* flat colour (it is the main punisher of flat colour), Seed 1 on X, Flush, Knight Riders, Castle of another colour.

**8. Parity Painter (colour-key family)** (D13; strat#10, col#8, col#16). Requires `Valued`. The key variants need `Suited`+`Spectral` (warmth). C+S, the translator/coupler.
- *Kid:* Even numbers wear colour P and odd numbers wear Q. +1 for each cell that does, −1 for each cell wearing the other's colour.
- *Def:* Σ over cells: +1 if (even∧P) or (odd∧Q), −1 if (even∧Q) or (odd∧P), 0 for other colours.
- *Params:* P≠Q; key ∈ {parity, value mod K (Colour-by-Number: correct cell = colour (v+t) mod K), suit warmth (♥♦ warm half / ♠♣ cool half, `flip`)}.
- *Random:* mean 0. Max N². **Calibration fixes carried by the merge:** Colour-by-Number scored as a raw count is N²/K (8/25), and Warm Hearts as a raw count is ≈N²/2. With ±1 scoring, [cat-sim] gives a mean of ≈0 for the two-class key.
- *Allies:* Straight Shooter (staircases alternate parity, so PP paints a checkerboard → Islander/Chessmaster on {P,Q}), Conqueror(A=P), Seed 3 (Q=green). *Rivals:* Seed 2 (same symbol → same parity → same colour, which Seed 2 forbids: the hardest conflict), Rainbow Road, Number Bonds "different colour" mode. Two keys with different shifts are cell-by-cell enemies (col).

**9. Straight Shooter** (D11; arith#2, games#3, strat#8). Requires `Valued, Enum`, with `Cyclic` optional (wrap). S, Alternator on symbols.
- *Kid:* Rows or columns that count 3, 4, 5, 6 score big. If the run is one colour it is a straight flush, which scores double.
- *Def:* each maximal line run with next = prev + step and length L≥3 scores L², ×2 if the run is monochrome.
- *Params:* step ±1; flush on/off; aceHigh (cards); temperament (Climber: count the step pairs).
- *Random:* ≈2 (p95 9) at N=5 base10 (arith). ≈6 of 686 at N=7 (games). Climber ≈3.8/42.
- *Allies:* Sudoku (the staircase is Latin), Odds & Evens, Stepping Stones d=1, Set Spotter, Rummy runs, Parity Painter, Court Parade, Seed 1 via the flush bonus. *Rivals:* Number Bonds, Seesaw, Full House, Go Fish, Seed 2, Times-Table, Bingo, Twenty-One, Mirrormancer(LR, symbol), and an opposite-step god on the same axis (the transposed axis can coexist: `g = k + c − r`). It anchors the **addition-table** coalition (§4).

**10. Number Bonds** (arith#3). Requires `Valued`. T = V+1 (10/12/16, cards 14). S, with colour modes making it C+S. Clumper (flat symbols).
- *Kid:* Every pair of neighbours that adds up to your magic number scores a point.
- *Def:* the number of adjacent pairs with v₁+v₂ = T that satisfy the colour mode.
- *Params:* mode ∈ {any, same colour, different colour}.
- *Random:* ≈3.6/40 (p95 7). Max 2N(N−1). The all-T/2 grid maxes it (degenerate). That grid is punished by Straight, Magic Window, King of the Hill and Stepping Stones.
- *Allies:* Seesaw, Seed 2 ("different" mode: all-5 with alternating colours), Column Addition, Full House on the flat grid. *Rivals:* Odds & Evens in every room (even T means a bond pair shares parity: a hidden lesson), Straight Shooter, Stepping Stones, Number Bonds in the opposite colour mode.

**11. Bridge Builder** (geo#1). Generic. C/P, Clumper.
- *Kid:* Make a path of your colour from the left edge all the way to the right edge.
- *Def:* score = the most distinct columns (or rows) that one C-blob touches. A full crossing scores 2N.
- *Params:* C; D ∈ {LR, TB}.
- *Random:* 2.7/10 (K=3), 1.5 (K=6). **Mild flag (judgement):** this is generous at K=3. Score 0 unless the span is ≥⌈N/2⌉, or count crossings only.
- *Allies:* Seed 1, Snake Charmer (same colour), Stripe Painter along D. *Rivals:* a perpendicular Bridge of another colour (strict Hex-style impossibility), Archipelago/Chessmaster, Castle of another colour, Pinwheel (it forces a cross), Fence Painter.

**12. Seed 2 Patchwork** (seed rule). Requires `Eq, Valued` (cards: compare rank, judgement following geo). C+S, Alternator on colour and Clumper on symbol.
- *Kid:* Groups of touching equal symbols where no two touching cells share a colour score group size × symbol value.
- *Def:* for each maximal 4-connected same-symbol region of size ≥2 (the size floor is my addition, so singletons don't score their value) with no orthogonally adjacent equal colours inside it, add size × value.
- *Random:* [cat-sim] 18.6 of ≈225 (N=5, base10, RGB) and 24.9 (rainbow), ≈8–11% of max. Without the size floor the baseline is much higher.
- *Allies:* Chessmaster family, Rainbow Road, Othello, Number Bonds (any/different), Full House/Go Fish, Castle (interior). *Rivals:* Parity Painter, Colour-by-Number, Seed 1, Stripe, Conqueror, Border Baron, Straight Shooter, Sudoku, Seed 3, Mirror (colour, even N).

**13. Seed 1 Line Painter** (seed rule, D7). Requires `Valued`. C+S, Clumper.
- *Kid:* Straight runs of one colour score the sum of their numbers.
- *Def:* each maximal same-colour run of length ≥2 in a row or column (diagonals if `diag`) adds Σ value.
- *Params:* colour ∈ {mine, any}; unit ∈ {runs, whole lines (Flush Royale, with straight-flush ×3)}; diag.
- *Random:* [cat-sim] gives 104 of ≈450 (any colour, N=5 RGB, 23%: too generous) and **36 (mine only, 8%)**. Flush lines are ≈0 for N≥5. Recommend colour = mine.
- *Allies:* Stripe, Border Baron, Conqueror, Bridge, Flag Bearer, Kingdom, Straight Shooter (flush). *Rivals:* Chessmaster family, Othello on the same colour, Rainbow Road (rows), Lantern Lighter, Fair Weaver, King of the Hill (adjacent peaks impossible in a same-colour line).

**14. Seed 3 Lucky Token** (seed rule, D8). The literal "green 1s" needs `HasColour green` and value 1 (cards A). Generalised: sample (S, X), which is fully generic. C+S, Clumper.
- *Kid:* Count your lucky tokens: cells showing your symbol in your colour.
- *Def:* #cells with (s = S ∧ c = X). The coverage temperament (Rook's Watch) counts the rows plus columns containing a token instead (max 2N with N cells).
- *Random:* N²/(|S|k): [cat-sim] 0.81 (N=5, base10, RGB), 0.42 (rainbow). Rook's Watch ≈3/14 at N=7 base10 RGB, ≈0 for cards+rainbow.
- *Note:* the linear optimum (all tokens) is **one grid in the whole world**, so it is world-scarce (strat). The coverage temperament is the cheap compromiser.
- *Allies:* Lone Peak (a sea of 1s plus one peak), Mirrormancer, King of the Hill valley mode, Conqueror/Homebody/Parity Painter when the draw matches. *Rivals:* Straight Shooter, Seed 2, Rainbow Road, Fair Weaver, Magic Accountant (rows of 1s sum to N).

**15. Mirrormancer** (D9). Generic. C or S, Neutral.
- *Kid:* Count rows (or columns) that read the same forwards and backwards, in colours or in symbols.
- *Def:* the number of palindromic lines across the axis in the chosen layer. Max N.
- *Params:* axis ∈ {LR, TB}; layer; scoring (lines / pairs).
- *Random:* 0.26/7 (N=7, RGB, colour). N=3 colour is lenient (≈1/3). The pairs variant is 1/K of max.
- *Allies:* Homebody, Castle, Border Baron, Seed 3, Stripe (LR with rows), a second mirror (a mandala satisfies both axes), Mirrormancer in the other layer (the same "mirror half" transform helps both). *Rivals:* Rainbow Road (LR), Straight/Climber (LR, symbol), Quilt Maker, Lone Peak (the peak must sit on the fold: M, and C on Even N).

**16. Homebody (Fence Painter / Picture Frame)** (D5). Generic. C/P, Neutral.
- *Kid:* Your colour belongs at home, in the middle or on the edge. +1 for each of your colour at home, −1 for each one that wandered off.
- *Def:* #X in Z − #X outside Z. The all-or-nothing temperament scores 4(N−1) only if the whole rim is X.
- *Params:* X; Z ∈ {core, rim}; temperament.
- *Random:* ≈0 at N=7, negative at N=3. Fence Painter is +2.3 at N=5 K=3. Picture Frame is ≈0. Flooding with X punishes itself.
- *Politics:* (red, core) + (blue, rim) are perfect allies, while (red, core) + (red, rim) is zero-sum. It is rotation- and mirror-invariant, so it never vetoes a symmetry transform. The all-or-nothing temperament is the *holdout* who pays the most for the last edit.
- *Allies:* Castle, Border Baron, Mirrormancer, Bullseye, Pinwheel. *Rivals:* Rainbow Road, Colour Carousel, Bridge (other colour), Archipelago/Tetromino on X, Seed 3 outside Z.

**17. Stripe Painter (Zebra)** (D3). Generic. C, Clumper (structured).
- *Kid:* Every row is one solid colour, and each row differs from the one next to it, like a flag.
- *Def:* the number of monochrome lines whose colour differs from the previous line's. Max N, and monochrome scores 1.
- *Params:* orientation; optional Spectral order.
- *Random:* 0.05–0.06/5, so ≈0.
- *Allies:* Seed 1, Border Baron, Feuding Families (X | buffer | Y bands), Colour Mixer (P1/M/P2 stripes), Sunset Sky (stacked in order), Mirrormancer, Full House-style stripes. *Rivals:* Stripe Painter in the other orientation (pure conflict), Chessmaster, Pinwheel, Bullseye, Castle, Quilt Maker, Fair Weaver, Lantern Lighter.

**18. Feuding Families** (col#11). Generic, since it needs a third colour as a buffer. C, Clumper.
- *Kid:* Your two colours are feuding families. You want lots of both, but they must never touch.
- *Def:* safe X = X with no Y neighbour, and likewise for Y. Score = 2·min(safe X, safe Y). Max ≈ N² − N.
- *Random:* 2.3–2.7/20 (N=5). Monochrome scores 0 (because of the min).
- *Allies:* Colour Mixer when the recipe is (X,M,Y) (the buffer becomes the mix: col's best pairing), Kingdom, Stripe, Flag Bearer. The buffer cells are real estate that a third god (Lantern Lighter, another Kingdom) can claim. *Rivals:* Best Friends(X,Y) (exact opposite), Fair Weaver, and Rainbow Road only partly.

**19. Colour Mixer** (D12). Requires `Mixable` (rainbow6 only; col advises against "pretend" recipes). C, Alternator.
- *Kid:* Red and yellow make orange. Every orange cell touching both a red and a yellow cell is a perfect mix.
- *Def:* the number of M cells with at least one P1 neighbour and at least one P2 neighbour. The strict variant needs the parents on opposite sides in a straight line.
- *Params:* recipe; strict.
- *Random:* 0.6 (K=6). Paint Mixer's both-axes scoring ≈1.0. Max ≈ N²/3–N²/2.
- *Allies:* Feuding(P1,P2), Stripe, Rainbow Road (R+Y→O and Y+B→G only), Border Baron (it parasites on two primary territories, strat). Two Mixers sharing yellow share the stack R O Y G B. *Rivals:* Best Friends(P1,P2), Kingdom(M), primary-colour blob rules, Harmony, Rainbow Road (R+B→V).

**20. Honest Minesweeper** (games#9). Requires `Valued`; values >8 never score. C+S, Alternator.
- *Kid:* Your colour's cells are mines. Every other cell whose number says exactly how many mines touch it (diagonals too) scores that number.
- *Def:* Σ over non-X cells with value = #X among its 8 neighbours.
- *Params:* X.
- *Random:* "a handful" (games). Max ≈ 2–3·N². Both flat extremes score 0.
- *Allies:* Castle/Othello with X (fences make 2s, 3s and 5s), Twenty-One (small numbers), Seed 3 when X≠green. *Rivals:* any flat-colour strategy, Seed 1 on X, Full House/Go Fish, Straight Shooter, Uno Snake, a second Minesweeper (only consistent boards satisfy both).

**21. Bingo Caller** (games#11). Requires `Eq` (`HasCentre` adds a free space). S, Neutral.
- *Kid:* Dab every cell showing one of your called numbers. A complete line is BINGO.
- *Def:* #dabbed + N·(complete rows, columns and long diagonals).
- *Params:* called = a random ⌈S/3⌉ ranks.
- *Random:* ≈16 of 161 at N=7 (≈10%).
- *Why it's shortlisted:* it is the best partial-overlap generator. Two Bingo gods share each called number with p≈1/3, so they share some numbers and fight over the rest. *Allies:* any rule whose favourite rank was called (Go Fish, Seed 3, Full House stripes), and Sudoku if |called| ≥ N. *Rivals:* Straight Shooter, Twenty-One (high calls), Bingo gods with disjoint calls.

**22. Sudoku Scholar** (games#10). Requires `Eq`, `MinSize 5` recommended. S, Alternator on symbols. **Calibration flagged.**
- *Kid:* Score each row and column where no number appears twice.
- *Def:* the number of all-distinct lines in `dir`. With dir=both, a full Latin square adds N.
- *Params:* dir ∈ {rows, cols, both}.
- *Random:* 0.72 per line at N=3 S=10 (my sim: 4.3/6, far too generous), 0.06 at N=7. **Fix:** at N≤4, score all-or-nothing over every row, column *and both diagonals*. [cat-sim] gives 0.46 of 8 at N=3 (P≈6%). Otherwise require `MinSize 5` (games).
- *Allies:* Straight Shooter, Twenty-One (Latin lines share a total), Full House in the *other* direction (stripes), Bingo. *Rivals:* Full House in the same direction (exact opposite), Go Fish, Seed 2, Rummy sets.

**23. Full House** (games#1). Requires `Eq`. S, Clumper on symbols.
- *Kid:* Read each row like a poker hand. Every matching pair scores, so three of a kind is 3 and four of a kind is 6.
- *Def:* Σ over lines in dir and ranks of k(k−1)/2.
- *Params:* dir.
- *Random:* ≈10% of max (14.7/147 at N=7, S=10). A one-rank grid maxes it, and Sudoku, Straight and Minesweeper punish that.
- *Allies:* Seed 2, Go Fish, Bingo, Knight Riders, Sudoku in the *other* direction. *Rivals:* Sudoku in the same direction, Straight Shooter, Rummy runs, Court Parade.

**24. Fair Weaver** (col#7). Generic, weak at N=3 with rainbow. C, Alternator.
- *Kid:* A line is fair when every colour appears about equally often (never more than one extra).
- *Def:* the number of lines with max−min colour count ≤1, counting zeros, over all K colours.
- *Random:* 2.3/10 (K=4), 0.9 (K=6). **Flag:** N=3 rainbow gives ≈3.3/6. Fix: `MinSize 4`, or also require a sampled colour C in the line (col).
- *Allies:* Rainbow Road, Quilt Maker, Lantern Lighter, Seed 2. *Rivals:* Flag Bearer (dominance vs fairness, the kingmaker against two Flag Bearers), Kingdom, Stripe, Seed 1, Seed 3, Best Friends (starves K−2 colours), Conqueror.

**25. Magic Accountant (Row Ranger)** (D10). Requires `Valued`; round-number mode needs `Numeral b`. S, Neutral.
- *Kid:* Each row that adds up to exactly your magic number scores a point.
- *Def:* the number of lines on the axis with Σ value = T. T is the line mean ± N.
- *Params:* axis; mode; diag.
- *Random:* ≈0.35/7 (N=7, strat). Row Ranger ≈0.6/10.
- *Politics:* different T on different axes hits a provable ceiling (grid total = N·T₁), so the gods must split rows from columns. *Allies:* same-T gods, Magic Window (T=15), Seesaw, Sudoku/Twenty-One (Latin). Every C rule is a natural "you take colours" partner. *Rivals:* different-T gods, Tug/Seed 1 (high values), Seed 3, Straight Shooter unless T ≡ N(N−1)/2 (mod N).

**26. King of the Hill** (arith#13). Requires `Valued`. C+S, Alternator.
- *Kid:* A mountain top is a cell of your colour whose number beats every neighbour. Count your mountain tops.
- *Def:* #X cells with a value strictly greater than all 4 neighbours. The valley variant uses strictly smaller.
- *Params:* X; valley.
- *Random:* ≈1.7 (N=5 RGB). Max ⌈N²/2⌉.
- *Allies:* Odds & Evens, Stepping Stones, Sum Sandwich, Tug(mine), Chessmaster (a high/low checkerboard), Seed 3 in valley mode. *Rivals:* the valley variant of the same colour, Seesaw/Bonds flat grids, Seed 2, Seed 1 (a same-colour line of peaks is impossible).

**27. Lone Peak** (strat#9). Requires `Valued`. C+S, Neutral (scarcity, all-or-nothing on ties).
- *Kid:* You want one mountain in your colour, towering over everything. Score = how much taller it is than the second-tallest cell.
- *Def:* if the max value is unique and coloured X, score m1 − m2, otherwise 0.
- *Random:* ≈0.15 (N=7). ≈0.6 at N=3.
- *Politics:* one peak per grid, so different colours must *divide the world* across grids. The "flatten peak" transform is a visible weapon. *Allies:* Seed 3, same-colour Lone Peaks. *Rivals:* Seed 1, Seed 2, Magic Accountant (high T), Straight, Royal Court/Rook's Watch with high values, Mirrormancer(symbol) (fold line only).

**28. Lantern Lighter** (col#12). Generic. C, Alternator (sparse renter).
- *Kid:* Your lantern cells score only if each is the only one of your colour in its row and its column.
- *Def:* #X cells that are alone in their row and their column. Max N (a permutation).
- *Random:* 0.3–1.0/5.
- *Politics:* it uses N cells and rents the rest out, and two Lanterns of different colours rarely conflict. *Allies:* Fair Weaver, Rainbow Road (N ≤ K), Castle interior. *Rivals:* Kingdom/Flag Bearer/Seed 1 on X, Stripe, Best Friends(X,·).

**29. Divisibility Detective** (arith#14). Requires `Numeral b`. S, Neutral.
- *Kid:* Read each row as a big number. Score each one your secret divisor goes into, using the last-digit or digit-sum trick.
- *Def:* the number of rows (optionally columns) whose base-b value ≡ 0 mod m.
- *Params:* m from the kid-testable divisors of b.
- *Random:* ≈2N/m lines. **Flag (judgement):** m=2 gives ≈50%, so drop m=2 (its top state is only ≈2^−9).
- *Base-dependent:* m=3 is a digit-sum test in base 10/16 but a last-digit test in base 12. *Allies:* Row Ranger round mode (m | b−1), Times-Table (a last column of multiples). *Rivals:* Straight Shooter in columns, Number Painter, a coprime last-digit Detective. A last column of zeros is a "zero treaty" that Sum Sandwich and King of the Hill punish.

**30. Card Windmill** (geo#17). Requires `Suited`; the digit variant uses `Cyclic`. S/P, Alternator on suits.
- *Kid:* Turn the grid a quarter turn and every suit moves on one: ♠→♥→♦→♣→♠.
- *Def:* the number of 4-cell rotation orbits showing 4 cyclically consecutive suits.
- *Random:* ≈0.1 at N=5. Max ⌊N²/4⌋.
- *Allies:* every colour rule (it touches suits only), rank rules. *Rivals:* **Pinwheel on suit** (geo#3, which wants all four the same: an exact opposition on the same cells), suit mirrors.

**31. Royal Court** (geo#16). Requires `Faced`, `HasCentre` (degrades on Even to any centre cell). S/P, Clumper on faces.
- *Kid:* Your king lives in the middle. Surround the centre with a connected palace of J/Q/K cards.
- *Def:* if the centre is a face card, score the size of its face-card 4-region, doubled if that region doesn't touch the border.
- *Params:* optional suit.
- *Random:* ≈0.4 (N=5). Max 2(N−2)².
- *Allies:* Castle (palace inside the colour walls), Bullseye, Pinwheel on symbols. *Rivals:* Seed 3 (Aces), Lone Peak (several high values), Twenty-One (faces bust), Constellation on a non-face rank.


## 2b. Rarity profile of the shortlist (for order-only / bits-of-rarity scoring)

Reference room: **N=5, base10, RGB (k=3)**; card rules use 52 cards. The log2 P figures are **rough analytic estimates (judgement)**: the number of top
grids over all grids, or a product of per-line probabilities that assumes independence where marked ≈. They are good to a few bits at best. Each extra
colour layer bit scales by log2 k (×1.63 going from k=3 to k=6). Each symbol cell costs log2 10 = 3.3 bits.
- **(a) Coarse?** **High** = most random grids share one value (usually 0, often >80%). **Med** = a few levels dominate. **Low** = a fine-grained order.
- **(b) Top log2 P**, i.e. the bits a top state is worth.
- **(c) Cheap route to a rare state.** **1-step** = a single trivial transform reaches the top. **2-step** = two constant fills or repaints. **code** = a short
  *input-dependent* transform reaches it (cheap code, but not a constant program). **hard** = no simple route found.
  **U** = the top fixes *both* layers, so a constant program yields one object and uniqueness blocks repeats (§4.7).

| # | Rule | (a) coarse | (b) top log2 P | Top state | (c) cheap route |
|---|---|---|---|---|---|
| 1 | Rainbow Road (lines) | High (P(0)≈94%) | ≈ −32 (k=6: −52) | every line steps +1 | **1-step**: positional repaint `colour=(c+const) mod k` |
| 2 | Border Baron | High (mostly 0) | ≈ −33 | 1-wide stripes, neighbours distinct | **1-step**: `colour = column mod k`. Monochrome = 0 |
| 3 | Rummy Melder | High (mostly 0) | ≈ −110 | rows of top-value sets in R G B order | **2-step, U**: constant symbol V + column-cycle colours |
| 4 | Castle Keeper | High (≈90% 0) | ≈ −31 | W ring, no W inside | **1-step**: paint border W (if the interior lacks W, otherwise also clear the interior) |
| 5 | Conqueror | Low (bell over −25..25) | ≈ −40 (value weight: ≈ −123) | all A (all A, all V) | **1-step: monochrome fill A** (value weight: 2-step, U). The worst cheap exploit |
| 6 | Chessmaster (windows) | High (mean 0.39) | ≈ −39 | A/B checkerboard | **1-step**: `colour = (r+c) even ? A : B` |
| 7 | Othello (gap-1 def.) | Med | ≈ −31 | X lattice / X rim | **1-step**: paint border X, or X on even columns |
| 8 | Parity Painter | Low (bell around 0) | ≈ −40 | every cell's colour set by parity | **code, 1-step**: "paint by parity" (keeps symbols, so no collisions) |
| 9 | Straight Shooter | High (≈75% 0, judgement) | ≈ −82 (flush: −122) | `v = r+c (+0/1)` | **1-step**: write the addition table (colours free, so no collisions) |
| 10 | Number Bonds | Low | ≈ −80 | all T/2, or a/T−a checkerboards | **1-step: constant symbol 5** |
| 11 | Bridge Builder | Med (N+1 levels) | ≈ −5 (k=6 ≈ −10; judgement) | any crossing blob | **1-step**: paint one row. *Low ceiling* |
| 12 | Seed 2 Patchwork | Low | ≈ −107 | one symbol V, properly 3-coloured (≈2^15.6 colourings) | **2-step, U**: constant symbol + checkerboard. A constant symbol alone scores 0 (random colours almost never proper) |
| 13 | Seed 1 (mine) | Low | ≈ −123 | all X, all V | **2-step, U**: monochrome + constant symbol V. Monochrome alone ≈ −40 |
| 14 | Seed 3 Lucky Token | High (≈45% 0) | ≈ −123 (one grid in the world) | all (S,X) | **1-step, U**: constant (S,X) fill, one object. Rook's temperament: ≈ −20, via the diagonal |
| 15 | Mirrormancer (lines) | Med (0..N; P(0)≈55% colour) | ≈ −16 colour, ≈ −33 symbol | all rows palindromic | **code, 1-step**: "mirror the left half". Monochrome too. *Low ceiling on colour* |
| 16 | Homebody | Low (linear); High for all-or-nothing | rim ≈ −31, core ≈ −24, Frame ≈ −25 | X fills Z only | **1-step**: positional repaint of Z |
| 17 | Stripe Painter | High (≈95% 0) | ≈ −34 | monochrome rows, neighbours distinct | **1-step**: `colour = row mod k` |
| 18 | Feuding Families | Med | ≈ −37 | X half / buffer row / Y half | **1-step**: positional repaint |
| 19 | Colour Mixer (k=6) | High (≈55% 0) | ≈ −65 | P1 M P2 M P1 columns | **1-step**: positional repaint |
| 20 | Honest Minesweeper | Med | ≈ −93 | every non-mine value = mine count | **code**: "set each non-X value to its mine count" (≈6 lines, keeps colours) |
| 21 | Bingo Caller | Low | ≈ −32 | every cell a called number | **1-step: constant called symbol** |
| 22 | Sudoku (both) | Med–High (0..2N) | ≈ −17 (≈; rows only ≈ −9; N=3 rows ≈ −1.4) | Latin square | **1-step**: `v = (r+c) mod N`. *Low ceiling at small N* |
| 23 | Full House | Low | ≈ −66 | each row one rank | **1-step: constant symbol** |
| 24 | Fair Weaver | Med | ≈ −14 (≈) | balanced lines | **1-step**: `colour=(r+c) mod k`. Colour shift and rotation keep it |
| 25 | Magic Accountant | High (P(0)≈70%) | ≈ −19 (≈) | every line sums to T | **1-step** constant symbol if N divides T, otherwise **code**: fix the last column |
| 26 | King of the Hill | Med | ≈ −40 (very rough) | X peaks on one parity | **1-step, U-ish**: positional (9,X) / (0,·) program |
| 27 | Lone Peak | High (≈85% 0; positives mostly 1) | ≈ −87 | one 9 in X, everything else 0 | **2-step, U**: constant 0 + one (9,X) cell. *code*: "lower everything except my peak" |
| 28 | Lantern Lighter | Med (0..N) | ≈ −13 | an X permutation, no other X | **1-step**: clear X except on the diagonal |
| 29 | Divisibility (last-digit m=5) | Med | ≈ −21 (m=2: ≈ −9) | last row and last column ∈ {0,5} | **1-step: the "zero treaty"** (zero the last row and column) |
| 30 | Card Windmill | High (mean 0.1) | ≈ −36 | consecutive suits on every orbit | **1-step**: suit by quadrant. Invariant under rotation |
| 31 | Royal Court | High (≈77% 0) | ≈ −24 | 3×3 face interior, no faces on the border ring | **1-step**: positional rank repaint |

**Readings**
- **Nearly every rule has a 1-step route** to a 2^−30 or rarer state, because a T→T program can write any *fixed colour layer* or *fixed symbol layer*
  by formula while copying the other layer. This makes it input-dependent, so uniqueness never bites. This is the integer brainstorm's "constant
  program" warning applied to one layer at a time.
- The **monochrome / constant-symbol** exploits are the bluntest of these: Conqueror (−40), Number Bonds (−80), Full House (−66), Bingo (−32),
  Divisibility zero treaty (−21), Mirror, and Seed 1 on its colour half. Under rarity scoring these grids become *jackpots*, and §4.1's punishers
  (Border Baron, RR, Othello, Castle, Straight, Sudoku) are what keep them from paying off for the room.
- **Uniqueness-protected tops (U):** Seed 1, Seed 2, Seed 3, Rummy, Lone Peak and Tug's value weight need *both* layers fixed, so a constant program wins
  one object only. These are the rules where rarity cannot be farmed.
- **Coarse rules (High)** spend most of the world tied at 0, so their bits come from a few structured grids. This is good for "you can see your score".
  But the first step off 0 is already worth several bits (e.g. one RR line ≈ 6.3 bits at k=3, N=5), which may over-reward tiny progress (judgement).
- **Low ceilings:** Bridge (≈5 bits), Sudoku N≤4, Mirror(colour) small N, Lantern (≈13), Fair Weaver (≈14). Seat these with bigger N or k, or give the
  others a lower weight.

---

## 3. Consolidated interaction matrix (14 rules)

Key: **A** aligned · **C** conflicting · **M** depends on the draw, size or orientation · **0** orthogonal. The diagonal means the same family with a different draw.
`*` = my judgement (no worker stated it). `!` = the workers disagreed and this is my verdict (see the notes below). Unmarked = a source stated it.

| | S1 | S2 | S3 | SP | CK | CQ | BB | CH | RR | MM | OS | SS | NB | PP |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **S1** Line Painter | A | M | M | A | M | A | A | C | M! | M | M! | A! | M | M |
| **S2** Patchwork | | M | C | C! | M* | C | C | A | A | M! | A | C | M | C |
| **S3** Lucky Token | | | M | M* | M | M | M | M* | C! | A | M* | C | M* | M |
| **SP** Stripe Painter | | | | M | C | M* | A | C | M! | A | M* | 0* | 0* | M* |
| **CK** Castle Keeper | | | | | M | M* | A | A | C | A | M | 0 | 0* | M* |
| **CQ** Conqueror | | | | | | M | M | M* | C | A | C* | 0 | 0* | M |
| **BB** Border Baron | | | | | | | M | C | A | A | M* | 0 | 0 | M |
| **CH** Chessmaster | | | | | | | | M | C | M! | A | 0 | 0 | M |
| **RR** Rainbow Road | | | | | | | | | M | M | A* | 0 | 0 | M |
| **MM** Mirrormancer | | | | | | | | | | A | M* | M | M* | 0 |
| **OS** Othello | | | | | | | | | | | A | 0* | 0* | M* |
| **SS** Straight Shooter | | | | | | | | | | | | M | C | A |
| **NB** Number Bonds | | | | | | | | | | | | | M | M* |
| **PP** Parity Painter | | | | | | | | | | | | | | M |

Off-diagonal counts: A 20 · C 18 · M 34 · 0 19. Every rule has at least one A and one C. The S/C-only rules (SS, NB) are 0 against every pure-C rule, as they should be.
The coupling rules (S1, S2, S3, PP) are what connect the two layers.

**Disagreements and verdicts**
- **S1×RR:** col says C, strat says M. → **M**. Under RR(→) the rows are rainbows but monochrome columns keep every vertical line for S1.
- **S1×SS:** arith says A (a single-colour straight is a big same-colour line), strat says S1×Climber = 0. → **A only with the flush bonus on**, 0 without it.
- **S1×OS:** games says C (same colour). → **M**. On the same colour it is C, but Othello's filling `X Y Y Y X` is itself a same-colour run for an S1 god of colour Y.
- **S2×SP:** col says C, geo says partial overlap (Seed-2 regions can run *across* stripes). → **C**. Stripes force every in-row neighbour to match, which caps S2 at columns.
- **S2×MM:** strat says 0, geo says C (on Even N a colour mirror forces the pair beside the axis to match). → **M**: C for an Even N colour mirror, otherwise ≈0.
- **S3×RR:** strat says C, col says "weak". → **C (mild)**. Roads cap green at 1/k of cells.
- **SP×RR:** col says C "in the stripe direction", strat (via BB) says vertical stripes are perfect for RR(→). → **M** by orientation.
- **CH×MM:** geo says A (diagonal mirrors), col says ± by size, strat (Islander×MM) says A. → **M**: A for diagonal axes or odd N, C for LR/TB on Even N. *The same two gods are friends in a 5×5 room and enemies in a 6×6 room.*

Interesting stated cells, for reference: S2×PP = C (the hardest conflict); S2×RR = A; CH×OS = A (the two-Othello checkerboard);
SS×NB = C (an even T forces an even difference); BB×CQ = M (aligned early, hostile once A swallows the grid); MM diagonal = A (mandala).

---

## 4. Cross-cutting findings

### 4.1 The clumper / alternator split
Every lens found it independently: geo's "blob vs pattern camp", col's "Clumpers vs Mixers/Alternators", games' "flat-colour
attractor vs contrast camp", and strat's camps implicitly. Monochrome (or constant-symbol) grids are the fault line:

| Monochrome colour grid | Who loves it | Who it zeroes or punishes |
|---|---|---|
| | Seed 1, Flush, Conqueror(A), Kingdom, Flag Bearer, Mirror/Pinwheel (colour), Set Spotter, Knight Riders, Uno Snake, Wallpaper, Seed 3 (if green) | Border Baron 0, Rainbow Road 0, Othello 0, Castle 0, Feuding 0, Islander/Chessmaster 0, Snake 0, Minesweeper 0, Bullseye 1, Stripe 1, Homebody/Fence negative, Fair Weaver, Robin Hood 0 |

The same split exists on the **symbol** layer. A constant or flat grid is loved by Number Bonds, Seesaw, Full House, Go Fish and Seed 2's symbol side.
It is punished by Straight Shooter, Sudoku, Magic Window, King of the Hill, Stepping Stones and Sum Sandwich. The swing rules (Mirrormancer, Colour Mixer,
Wallpaper, Colour-by-Number, Rummy, Castle) change sides with the draw, the period or N. They are the swing votes.

### 4.2 Attractor grids and the coalitions they define
| Attractor | Coalition (maxed or near-maxed) | Opposed by |
|---|---|---|
| **Addition table** `v = r+c` (symbols) | Straight Shooter (rows & cols), Climber (both dirs), Odds & Evens, Stepping Stones d=1, Sudoku (Latin when N≤S), Set Spotter, Parity Painter→checkerboard; Magic Window 3/8 | Number Bonds, Seesaw, Full House, Go Fish, Seed 2, Times-Table, Knight Riders |
| **Flat half-value grid** (all T/2) | Number Bonds, Seesaw, Full House, Go Fish (rank), Seed 2 (with alternating colours), Knight/Uno | Straight, Magic Window, KotH, Stepping Stones, Sudoku |
| **Diagonal colour stripes** `(r+c) mod k` | Rainbow Road (both perpendicular dirs), Rainbow Bands, Fair Weaver, Lantern (N≤K), Seed 2 (whole grid one region), Othello (judgement), Feuding partly | Seed 1, Stripe, Kingdom, Border Baron, Conqueror, Homebody, Quilt Maker, Mirror(LR) |
| **Two-colour checkerboard** | Chessmaster/BF/Islander/Archipelago, Seed 2, two Othellos, Harmony (complementary), Wallpaper p=2, KotH (high/low) | Knight Riders (always 0), Seed 1, Border Baron, Stripe, Castle, Bridge, Quilt, Fair Weaver |
| **Stripes** | Stripe, Seed 1, Border Baron, Flush, Sunset Sky (stacked in order), Feuding, Mixer, Full House + Sudoku (other dir) | perpendicular Stripe, Pinwheel, Bullseye, Castle |
| **Rings / frame + core** | Castle, Homebody, Picture Frame, Bullseye, Pinwheel, every mirror, Border Baron, Royal Court inside | Colour Carousel, Rainbow Road, Bridge (other colour) |

A very visible combination is **diagonal rainbow colours over one constant symbol**, which maxes RR(→), RR(↓), Seed 2 and Fair Weaver at once. Overlaying an
addition-table symbol layer instead switches Seed 2 off and switches Straight/Sudoku on, so **colour and symbol attractors combine freely and the coupling rules
(S2, PP, Rummy, Minesweeper) decide which combinations are stable** (judgement). A room dealt only from one coalition collapses onto its attractor, so the dealer must
deal across coalitions (see §4.6).

### 4.3 Transformations are the coalition currency
Transforms run on many grids at once, so a general transform that moves several gods' utilities the same way is the deal-maker (strat). Consolidated:

| Transform | Helps | Hurts | Free vote (invariant) |
|---|---|---|---|
| Rotate 90° / transpose | the god on the *other* axis (RR, MM, MA, SS, Stripe, Full House/Sudoku, Bridge) | the god on the current axis | Homebody, Border Baron, Islander, Conqueror, PP, Lone Peak, Seed 2, Seed 3, Castle (rotation-invariant) |
| Mirror left half onto right | Mirrormancer in *both* layers at once | RR(→/←), SS(→), Lone Peak (duplicates the peak) | Homebody, Conqueror |
| Repaint B→C | Conqueror(·,B), Conqueror(C,·), Border Baron early | lovers of B | all S rules |
| Cyclic colour shift c→next(c) (judgement) | none directly | Chessmaster/Conqueror/Homebody (their colours move) | **Rainbow Road, Fair Weaver, Stripe, Mirror (colour)**: a free vote for the rainbow coalition |
| Paint by parity (even→P, odd→Q) | PP, Islander/Chessmaster (if the colours are {P,Q}), Seed 1 (parity runs) | Seed 2, RR, Conqueror (other colours) | all S rules |
| Copy left neighbour's colour | Seed 1, Border Baron, Conqueror (majority) | Seed 2, Islander, RR | S rules |
| Sort each row ascending | Straight/Climber(→) partly | Mirror(LR), RR (if colours move with symbols) | Magic Accountant (rows) |
| Add 1 to every value (judgement) | none | Number Bonds, Magic Accountant, Bingo, Parity Painter (parity flips) | Straight Shooter, Stepping Stones, Seesaw, Sudoku, Magic Window (shifted copies stay magic) |
| Cap values at the second-highest | anyone's rival Lone Peak | Lone Peak, Seed 1, Seed 2 slightly | colour rules |
| "You paint, I re-number" | Colour-by-Number/PP and painters (col) | – | – |

Design rule (strat): each family should have a few invariances and a few sensitivities, so that every transform has a constituency.
Collapsing transforms (monochrome, constant symbols) hit **uniqueness** failures quickly. That is a self-enforcing tax on degenerate fills.

### 4.4 Room parameterisation reshapes the pool *and* the politics
- **k=3 (RGB):** colour politics is crowded and zero-sum, since two Conqueror draws almost always share a colour. Random baselines rise, so Seams, Bridge,
  Mirror pairs, Rook's Watch and RR roads all have rarer tops at higher k, so rarity bits are k-dependent. **k=6:** draws are usually disjoint, so "one repaint helps both"
  deals dominate. The Mixable and Wheel rules (Mixer, Carousel, Harmony) appear.
- **Cards (52 symbols):** symbol-equality rules starve (Seed 2, Mirror(symbol), Rook's Watch, Knight Riders), while value rules survive.
  `Suited` adds a **third layer** (suit) that is orthogonal to colour and rank. Flush Royale flips from competitive (number rooms) to
  cooperative (card rooms). `Faced` brings Royal Court and Court Parade.
- **Numeral b:** rows read as numbers (Divisibility, Column Addition, Ladder). The same grid scores differently in base 10/12/16.
- **Size:** at N=3, Castle is weak, Homebody(core) is nearly impossible, Sudoku and Fair Weaver are too generous, and Mirror is lenient. **Even N** flips Chessmaster×Mirror
  and Lone Peak×Mirror(symbol) to C, and removes the HasCentre rules (Royal Court, the Bingo free space). At N=7, ties make Lone Peak harder and per-line rules rarer at random.
- **Proposed NEW capabilities** collected from workers: `MinColours k` (RR roads k≥4, Quilt Maker k≥4), `Wheel`-by-convention
  for all Spectral sets (strat), `Opposites` (Harmony on RGBY, col).

### 4.5 Degenerate strategies and their punishers
| Degenerate move | Rewards | Punished by |
|---|---|---|
| Monochrome colour | see §4.1 | Border Baron, RR, Othello, Castle, Feuding, Islander, Minesweeper, Stripe, Homebody |
| Constant symbol / all T/2 | Bonds, Seesaw, Full House, Go Fish | Straight, Sudoku, Magic Window, KotH, Stepping Stones |
| All zeros | Times-Table, last-digit Divisibility ("zero treaty"), Column Addition (must exclude 0+0=0) | Sum Sandwich (zeros excluded), KotH, Magic Window |
| One painted row | Bridge (max in N edits) | it is fragile, since one enemy cell cuts it. Archipelago/Chessmaster |
| World-scarce perfect grid | Seed 3 linear (one grid in the world), Parity Painter exact optimum | uniqueness; summaries should say "many good grids", not "the perfect grid" (strat) |
| All-or-nothing holdout | Picture Frame, Lone Peak, Bullseye | creates extortion, so it is a deliberate temperament, not a bug |
| Constant-program overwrite (house note from integer brainstorm) | any rule with a cheap fixed optimum | uniqueness only blocks *identical* outputs. Rules that leave a layer free (Conqueror, Mirror(colour), Rook's Watch) can be overwritten on one layer cheaply, so pricing or a transform constraint is still needed |

### 4.6 Recommendations for the dealer
1. **Always include at least one cross-layer coupler** (Parity Painter, Rummy, Seed 1/2, Minesweeper, KotH). Without one, card+RGB rooms
   split into non-interacting colour and symbol camps (strat).
2. **Always include at least one structure-feeding rule**: a parasite (Border Baron, Colour Mixer) or a landlord (Castle, Lantern, Rook's Watch).
   These score from other gods' structure, and payoff = utility × others' sum makes them strong by design.
3. **Deal from both camps on the colour layer**: at least one clumper and at least one monochrome-punisher (Border Baron, RR, Othello, Castle, Feuding).
   Do the same on the symbol layer when there are ≥2 symbol rules (Straight/Sudoku against Bonds/Full House).
4. **Avoid letting all rules share one attractor.** Check that the dealt set has no grid maxing more than ~60% of the rules (judgement;
   the attractors in §4.2 are the test grids).
5. **Prefer same-family draws that land as M** (RR perpendicular, Conqueror overlapping, Homebody zones). Same family and same draw is a clone ally,
   which is boring but harmless.
6. **Mix temperaments** (linear / saturating / all-or-nothing) to create holdouts and compromisers.
7. **Under rarity scoring, budget the cheap-exploit rules** (§2b, column c = "1-step"): no more than one or two per room, and pair each with a
   rule its exploit grid zeroes (e.g. Conqueror with Border Baron/Othello; Number Bonds with Straight Shooter). Prefer rules whose top fixes
   **both layers**: uniqueness then lets a constant program claim only one object (§4.7).
8. **Watch the low-ceiling rules:** Bridge Builder, Sudoku at N≤4, Mirror(colour) at small N, and Divisibility m=2 have tops only 2^−5 to 2^−16 rare. A god
   holding one can never earn many bits. Give them a bigger N or k, or the stricter definition.
9. **Sample "your colour" and "your symbol"** from the room instead of requiring `HasColour`. Prefer rules that leave a layer or a region free.
10. **Seat at least 3 gods**, otherwise alignment and conflict carry no politics (house caveat).

### 4.7 What rarity (order-only) scoring changes
- Monotone recalibrations become irrelevant. **Definitions now carry all the tuning.** A rule's "personality" is its order and the size of its
  top-state rarity (§2b).
- The **clumper/alternator split sharpens.** Clumpers' tops are reachable by one monochrome or constant fill. Alternators' tops need a positional pattern
  (still one line of code). Both are cheap *in code*, so the scarce resource becomes **edits that survive other gods' transforms**,
  which is where the matrix in §3 bites.
- **Attractor grids (§4.2) become giant rarity jackpots for whole coalitions at once.** The addition table is worth ≈80+ bits to Straight Shooter and also scores
  for Sudoku, Odds & Evens and Parity Painter. The dealer check in §4.6 #4 matters more.
- **Uniqueness is the only natural brake, and it only brakes rules whose top fixes both layers.** Either favour such rules, or price transforms by
  their effect (the same open question as `integer-value-brainstorm.md`'s design consequence).

---

## 5. Appendix: every rule not shortlisted

Format: name (source): one-line definition. Status / note.

**Merged into shortlist entries** (also listed so nothing is lost)
- Best Friends (col#1): count A–B orthogonal seams. → Chessmaster `seams`. 9/40 at K=3.
- Islander (strat#6): X cells whose neighbours are all one other colour. → Chessmaster `dots`.
- Archipelago (geo#4): number of X components. → Chessmaster `islands`. 4.1/13.
- Zebra (geo#7): monochrome lines differing from the previous line. → Stripe Painter.
- Go Territory (games#8): enclosed non-X regions, `eyes` bonus. → Castle Keeper.
- Fence Painter (geo#12): border X − interior X. → Homebody(rim).
- Picture Frame (strat#12): 4(N−1) iff the rim is all X. → Homebody `all-or-nothing`.
- Colour Tug-of-War (arith#9): Σval(mine) − Σval(rival). → Conqueror `weight=value`.
- Flush Royale (games#2): monochrome (or one-suit) lines score their sum, ×3 for a straight flush. → Seed 1 `whole lines`. ≈0 for N≥5.
- Rook's Watch (strat#11): rows+cols containing token (S,X). → Lucky Token `coverage`.
- Looking-Glass (geo#2): matching mirror pairs, 4 axes, colour/symbol. → Mirrormancer `pairs`. 1/K baseline.
- Mirror Quilt (col#9): matching colour pairs, incl. half-turn. → Mirrormancer `pairs`.
- Row Ranger (arith#1): lines summing to T, or to a multiple of b. → Magic Accountant.
- Staircase Climber (strat#8): count +1 step pairs in a direction. → Straight Shooter `pairs`.
- Straight Shooter (games#3 copy): adds aceHigh. → Straight Shooter.
- Paint Mixer (geo#15): secondary colour between its primaries in a straight line. → Colour Mixer `strict`. ≈1.0 random.
- Colour-by-Number (col#8): colour = (value+t) mod K. → Parity Painter `key=mod K`. Raw N²/K, fixed by ±1 scoring.
- Warm Hearts (col#16): ♥♦ on warm colours, ♠♣ on cool. `Suited+Spectral`. → Parity Painter `key=warmth`. Raw ≈N²/2, fixed by ±1 scoring ([cat-sim] mean ≈0).
- Rainbow Road (col#3 pairs; geo#14 complete roads): → Rainbow Road `pairs` / `roads` (roads need `MinColours 4`).

**Geometry (geo)**
- Pinwheel (#3): number of 90° orbits sharing an attribute. Generic. 0.23/6. Rival of Card Windmill, ally of Bullseye and the mirrors.
- Bullseye (#6): consecutive monochrome rings differing from the outer ring. Generic, with an optional Spectral "sunset target". ≈0. Monochrome scores 1, so it punishes flooding. A softer variant scores each ring independently.
- Snake Charmer (#9): largest simple-path X blob. Generic. 2.7 at N=5 K=3, max ≈N²/2+N. One edit can turn a snake into a loop worth 0. Monochrome scores 0.
- Tetromino Tamer (#10): number of X blobs exactly shaped like piece P. `MinSize 4` for I. ≈0. The most kid-recognisable rule.
- Rainbow Bands (#11): diagonal lines from corner K coloured d mod k. `Spectral`. 1.5/25 (K=3). This is the anchored version of the RR attractor.
- Constellation (#13): largest 8-connected cluster of symbol S. Generic. ≈1–2. The only diagonal-connectivity rule.
- Colour Carousel (#18): the border cycles round the wheel, plus a full-lap bonus. `Wheel`, `MinSize 4`. ≈5/21 at N=5: count only advancing steps. Rival of Castle, Fence and Bullseye on the same cells.
- Ideas not developed: Domino tiler, gravity/falling sand, hole counting (Euler number), "climb the mountain" rank path.

**Arithmetic (arith)**
- Sum Sandwich (#4): triples whose middle = the sum of the ends (or Fibonacci c=a+b). `Valued`. 1.7/30. Sandwich vs Fibonacci gods conflict strongly. Rename "Number Sandwich".
- Magic Window (#5): best 3×3 window's count of lines summing to 3×centre (non-constant). `Valued, MinSize 3`. 1.3/8. Fights flat grids. Addition-table block scores 3/8.
- Times-Table Territory (#6): largest region of multiples of m. `Valued`. **Flag:** 5.5/25 at m=3 (highest ratio in arith). Fix: m≥4 or the colour twist (size² is moot). An all-0 fill reaches the top state cheaply.
- Odds & Evens Chessboard (#7): 2×2 parity checkerboards. `Valued`. ≈2/16. Symbol-layer checkerboard, enemy of Number Bonds in every room.
- Number Painter (#8): value = colour number + offset. `Valued+Spectral`. N²/(V+1) ≈2.5/25. The offset decides whether it is allied with or opposed to Seed 3.
- Robin Hood (#10): min over colours of Σ value. `Valued`. **Flag:** ≈25 of ≈75 (1/3). Fix (arith): min − (max − min). [cat-sim] mean ≈−1 at N=5 RGB. Rival of Tug and Painter.
- Seesaw (#11): lines whose left half = right half. `Valued` (nicest with HasCentre). 0.66/10. Ally of palindromes and Bonds.
- Stepping Stones (#12): largest component linked by |Δv| = d. `Valued`. 3.9/25 (d=1). Different-d gods fight over every edge. "Cliffhanger" draw.
- Column Addition (#15): rows top + middle = bottom in base b, trailing correct digits. `Numeral b, MinSize 3`. ≈0.11. Exclude 0+0=0.
- Ladder of Numbers (#16): rows increasing as base-b numbers. `Numeral b` (cards: sums). **Flag:** ≈(N−1)/2. Longest-streak fix is still high ([cat-sim] 1.5/4 at N=5). An all-or-nothing whole ladder (P≈1/N!) changes the order; streak² would not.
- Ideas: poker rows (cards), Snap, gradient/Young tableau, colour–value ladder, digit sum in base, Fillomino (region size = value).

**Colour (col)**
- Quilt Maker (#4): 2×2 windows with all-distinct colours (RGB fallback). NEW `MinColours 4`. 1.5/16 (K=4), but 4.5/16 at K=6: add a stricter window rule.
- Flag Bearer (#6): lines where X is a strict plurality. Generic. 1.06/5 (K=3). A cheap coalition partner. Enemy of Fair Weaver.
- Kingdom (#10): largest X blob. Generic. 4.2/25 (K=3). The "blob coalition" core with Flag Bearer, Seed 1 and Seed 3.
- Wallpaper Weaver (#13): cells equal to the cell p steps on. `MinSize 4` for p=3. Mean is 1/K (5.0/15). Monochrome reaches the top. p=2 with p=3 forces stripes.
- Sunset Sky (#14): lines moving 0/+1 along the spectrum with ≥3 colours. `Spectral`. ≈0. "Aurora" treaty for perpendicular draws.
- Colour Wheel Harmony (#15): adjacent complementary pairs. `Wheel`, even K (NEW `Opposites`). 6.7/40. The generalist checkerboard.
- Ideas: symbol-gated Best Friends, suit warm/cool overlay, colour-weighted sums, value gradients, diagonal BF/RR.

**Games (games)**
- Twenty-One (#5): each line scores its total if ≤T, +T if exact. `Valued` (cards: Faced soft ace). 10–25% in number rooms. Ally of Sudoku (Latin lines share a total).
- Go Fish Books (#6): 2×2 blocks of rank r, ×2 if all suits/colours differ. `Eq`. ≈0.
- Set Spotter (#12): 3-in-line with colours all same/all different and values evenly spaced. `Valued` (Spectral variant). ≈2–4/70. Loves uniform grids.
- Knight Riders (#13): knight-jump twins (same symbol and colour). `Eq`, meaningful N≥4. ≈4/120. Checkerboards always score 0.
- Uno Snake (#14): longest boustrophedon walk matching colour or rank. `Eq`. 4–6/49. The "glue" rule.
- Court Parade (#15): J-Q-K of one suit in a line, +5, with an Ace lead +5. `Suited, Faced, MinSize 3`. ≈0. Card-only.
- Ideas: Scrabble premium squares, gravity Connect Four, Dominoes (pair target), King's court (diagonal Seed 2), best-hand poker family.

**Strategy (strat)**
- (All strat rules are shortlisted or merged.) Ideas: Grudge (enemy = next wheel colour), Neighbourhood vote, Distance between centroids,
  temperament as a sampled parameter, and empirical pair-correlation calibration of the matrix (simulate random single-cell edits under random
  draw pairs). Recommended as the next step for checking §3.
