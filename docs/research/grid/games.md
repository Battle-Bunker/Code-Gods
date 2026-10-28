# Grid utilities, lens: GAMES KIDS ALREADY KNOW

Every rule below borrows a game a 10-year-old already plays: poker, rummy, blackjack, Go Fish, Uno,
tic-tac-toe, Othello, Go, Minesweeper, Sudoku, Bingo, SET, chess, Snakes & Ladders. Knowing the game
means the kid already half-knows the rule.

## Shared conventions (used by every rule)

- `g[r][c] = {s, c}`; `N` = size; `S` = number of distinct **ranks** (10, 12, 16, or 13 for cards);
  `K` = number of colours (3, 4, 6).
- `value(s)`: digit value (0..9, 0..11, 0..15). Cards: A=1, 2..10, J=11, Q=12, K=13 (rank only, suit
  ignored). Two rules (Straight Shooter, Twenty-One) state their own card values.
- `rank(s)`: same as `value(s)`, so "same rank" means the 7♠ and 7♥ match. For digit sets rank is
  just the symbol.
- `suit(x)`: **cards: the printed suit (♠♥♦♣). Every other symbol set: the cell's colour.** This
  is the one mapping used throughout ("a flush is all one suit; in a number room your suits are your
  colours"). It also means the card room has two independent "same-ness" axes (suit and colour),
  which makes card rooms a little richer. That's intended.
- "Lines" means rows and columns unless a rule says diagonals too. `lines()` returns all 2N of them
  as arrays of cells.
- Colour parameters (`X`, "your colour") are sampled uniformly from the room's colour set, so they
  always exist. Rank parameters are sampled from the room's ranks.
- Symbol parameters that would make a rule impossible are resampled (noted per rule).
- **Capabilities (per ADDENDUM-capabilities.md):** every rule has a **Requires:** line. Most of
  these game rules are generic, and card-flavoured ones degrade to colours when `Suited` is absent.
  Rule 15 is **card-only** (`Suited` + `Faced`) and tagged as such.

---

## 1. Full House (row poker: pairs)

**Kid summary:** You read every row like a poker hand. Every pair of matching numbers in the same
row scores a point, so three of a kind is 3 points and four of a kind is 6.

**Requires:** `Eq` (rank equality). Fully generic.

**Definition.** Parameter `dir ∈ {rows, columns}`. For each line in `dir`, for each rank appearing
`k` times, add `k(k-1)/2` (the number of pairs). The cells don't have to touch: it's a hand, not a
chain. Colour is ignored.

```ts
let score = 0;
for (const line of dir === "rows" ? rows() : cols()) {
  const n = new Map();
  for (const x of line) n.set(rank(x.s), (n.get(rank(x.s)) ?? 0) + 1);
  for (const k of n.values()) score += k * (k - 1) / 2;
}
return score;
```

**Why it's visual:** you scan a row and count the matching numbers. A perfect grid has stripes:
each row is a single number.

**Interactions.**
- *Aligns:* Seed 2 (same-symbol regions, no adjacent shared colour). A row of 7s in alternating
  colours scores both. Go Fish Books (whole rows of one rank build 2×2 books when neighbouring rows
  match). Bingo Caller when the repeated rank is a called number.
- *Conflicts:* Sudoku Scholar in the **same** direction (exact opposite). Straight Shooter (a
  straight has no pairs).
- *Coalition twist:* a rows Full House god and a **columns** Sudoku Scholar god are perfectly
  compatible: rows constant, columns all different (horizontal stripes, each a different number).
  A columns Full House god meets the rows Sudoku god in vertical stripes. The direction parameter
  decides who are friends.

**Random-grid behaviour:** about `N·C(N,2)/S` per grid: N=7, S=10 gives ≈14.7, against a max of
`N·C(N,2)` = 147 (≈10%). N=3 gives 0.9 of 9. **Degenerate:** a one-rank grid maxes it, which makes
it a flat-colour magnet. It is punished by Sudoku, Straight Shooter, Minesweeper and Othello (if
the colours are flat too).

---

## 2. Flush Royale (poker flushes)

**Kid summary:** A row or column where every card is the same suit is a flush, and it's worth the
total of its numbers. In a number room your suits are your colours.

**Requires:** `Valued`, `Enum` (straight-flush bonus). `Suited` optional: with `Suited`, flush = printed suit (colour-independent); without it, flush = colour (default method).

**Definition.** For each line (rows and columns): if all cells share `suit` (card suit; colour in
non-card rooms), add the sum of values. If the flush is **also** a straight (its ranks are N
consecutive values in any order), add a bonus of 2× that sum (straight flush). No parameter except
an optional `dir`, sampled like Full House.

```ts
let score = 0;
for (const line of lines()) {
  if (!line.every(x => suit(x) === suit(line[0]))) continue;
  const v = line.map(x => value(x.s)).sort((a, b) => a - b);
  const sum = v.reduce((a, b) => a + b, 0);
  const straight = v.every((x, i) => i === 0 || x === v[i - 1] + 1);
  score += straight ? 3 * sum : sum;
}
return score;
```

**Why it's visual:** in number rooms you see solid-colour bars. In card rooms you see a row of
spades. The colours can be anything, which is the fun part.

**Interactions.**
- *Non-card rooms:* close cousin of Seed 1 (same-colour lines) but it needs the **whole** line and
  doesn't care which colour, so it aligns with Seed 1 for every colour at once. It conflicts with
  Othello Sandwich, Minesweeper (no mines unless the flush colour is the mine colour) and Seed 2.
- *Card rooms:* suit is independent of colour, so it is **compatible** with Seed 2 and Othello: a
  row of ♥ can alternate red/blue. Card rooms make "flush" a cooperative rule and number rooms make
  it a competitive one. Good room-to-room variety.
- *Aligns:* Straight Shooter (straight-flush bonus), Rummy Melder runs (same suit, consecutive).
- *Conflicts:* Full House inside the flush. A straight flush has no pairs.

**Random-grid behaviour:** P(line is a flush) = `K^-(N-1)` (number rooms) or `4^-(N-1)` (cards). N=3,
RGB: ~0.67 flush lines ≈ 6 points. N≥5: essentially 0. Max: every line a straight flush, e.g.
`g[r][c] = r+c+k` in one colour gives rows and columns that are straights: about 3·2N·(line sum).
**Degenerate:** a one-colour grid gets all 2N flushes. Seed 1 and Seed 3 (if green) also like that,
so flat colour is a real attractor, and that's why the checkerboard rules (Othello, Seed 2, Knight
contrasts) matter.

---

## 3. Straight Shooter (poker straights / Snakes & Ladders ladders)

**Kid summary:** You love counting up: 3, 4, 5, 6. Every row or column that counts up one at a time,
left to right or top to bottom, scores, and longer runs score a lot more.

**Requires:** `Valued`, `Enum`; `MinSize 3` (always true). `Cyclic` optional: with it, the step wraps (9→0, K→A, the aceHigh case); without it, runs stop at the top symbol. `Faced` not needed.

**Definition.** Parameters: `step ∈ {+1, -1}` (count up or count down). For cards, `aceHigh ∈
{false, true}` (A = 1 or 14; with aceHigh, A follows K). Find maximal runs in each row (left→right)
and each column (top→bottom) where every next value = previous + step. Each run of length `L ≥ 3`
scores `L²`. Colour is ignored.

```ts
let score = 0;
for (const line of lines()) {
  let L = 1;
  for (let i = 1; i <= N; i++) {
    if (i < N && value(line[i].s) === value(line[i - 1].s) + step) L++;
    else { if (L >= 3) score += L * L; L = 1; }
  }
}
return score;
```

**Why it's visual:** you can put your finger on the grid and count. The perfect grid has diagonal
stripes, `g[r][c] = k + step·(r+c)`, a staircase of numbers.

**Interactions.**
- *Aligns:* Sudoku Scholar (straights never repeat a number). The staircase is a Latin-style grid
  whenever N ≤ S. Set Spotter (a step-1 triple is evenly spaced). Flush Royale (straight-flush bonus).
  Rummy Melder runs.
- *Conflicts:* Full House, Go Fish Books, Bingo Caller (you need N consecutive numbers but the bingo
  god only called a third of them). Twenty-One: staircase rows have different totals, so not all of
  them can hit the target. A `+1` god and a `-1` god are in direct opposition along the same line.
  On the transposed axis they can coexist (rows count up, columns count down: `g = k + c - r`).
- *Diagonal note:* the staircase puts equal numbers on anti-diagonals, which a diagonal Full House or
  Twenty-One variant would love.

**Random-grid behaviour:** a run of 3 needs two lucky steps (≈1/S² each start): expected ≈ `2N(N-2)/S²
· 9` ≈ 6 points for N=7, S=10, against a max of `2N·N²` = 686. Very structure-hungry. No flat
degenerate.

---

## 4. Rummy Melder (sets and runs)

**Kid summary:** Like rummy: three in a row of the same number in **different** colours is a set,
and three counting up in the **same** colour is a run. Every cell that's part of a meld scores its
number.

**Requires:** `Eq`, `Valued`, `Enum`. `Suited` optional: with it, sets and runs use printed suits; without it, they use colours (default). Sets need `K ≥ 3` colours/suits (always true).

**Definition.** Parameter `dir ∈ {rows, columns}`. Look at every window of 3 adjacent cells along
`dir`. It's a **set** if the ranks are equal and the 3 suits are all different (suits = colours in
number rooms; real suits for cards). It's a **run** if the values go +1, +1 and all 3 share a suit. A
cell is *melded* if it lies in at least one set or run window. Score = sum of `value` over melded
cells (an A or 0 meld is cheap; picture cards are valuable).

```ts
const melded = new Set();
for (const line of dir === "rows" ? rows() : cols())
  for (let i = 0; i + 2 < N; i++) {
    const [a, b, c] = line.slice(i, i + 3);
    const set = rank(a.s) === rank(b.s) && rank(b.s) === rank(c.s)
      && suit(a) !== suit(b) && suit(b) !== suit(c) && suit(a) !== suit(c);
    const run = value(b.s) === value(a.s) + 1 && value(c.s) === value(b.s) + 1
      && suit(a) === suit(b) && suit(b) === suit(c);
    if (set || run) [a, b, c].forEach(x => melded.add(x));
  }
return [...melded].reduce((t, x) => t + value(x.s), 0);
```

**Why it's visual:** you spot "three of the same in a traffic-light of colours" or "a coloured bar
counting up".

**Interactions.** This is the **bridge rule**. It is half of Seed 1 and half of Seed 2.
- *Aligns:* Seed 1 (runs are same-colour lines and the values add up). Seed 2 (sets are same symbol,
  different colours). Straight Shooter (runs). Full House (sets are triples).
- *Conflicts:* itself. A cell can't be both, so a set god and a run god fight over each window. A
  flat one-colour grid kills every set, and Sudoku Scholar kills every set.
- *Card rooms:* suits aren't colours, so a rummy "set" of 7♠ 7♥ 7♦ can be any colour. It then aligns
  with Seed 1 too: a set that is all **one colour** pleases both.

**Random-grid behaviour:** P(window is a set) ≈ `(1/S²)·(K-1)(K-2)/K²`, P(run) ≈ `1/(S²K²)`. Expected
score ≈ 0–3 at N=7, against a max of ≈ `N²·(high value)` (≈ 300+ for N=7 hex). **Degenerate:** none.
Melds need alternating structure. Note: in RGB a set uses all three colours, so a long set row is
"R G B R G B …", which Seed 2 also wants.

---

## 5. Twenty-One (blackjack)

**Kid summary:** Each row and column is a blackjack hand. Add it up: get as close to your target as
you can without going over, because going bust scores zero.

**Requires:** `Valued`. Card variant (T=21, soft ace, J/Q/K=10) requires `Suited`/`Faced` card set (the **Faced** instance); number rooms use the sampled-T default method.

**Definition.** Parameter `T`. Card rooms: `T = 21`, J/Q/K count 10, and A counts 11 unless that busts,
then 1 (a soft hand). Number rooms: `T` is sampled uniformly from `[2N, round(0.7·N·(S-1))]` so it's
always reachable and usually below a random line's average. Each line (rows and columns) scores its
total if ≤ T (0 if bust), plus a bonus of `T` if it's **exactly** T ("Blackjack!").

```ts
let score = 0;
for (const line of lines()) {
  let t = line.reduce((a, x) => a + bjValue(x.s), 0); // cards: A=1, faces=10
  if (isCards && line.some(x => rank(x.s) === 1) && t + 10 <= T) t += 10; // soft ace
  if (t <= T) score += t + (t === T ? T : 0);
}
return score;
```

**Why it's visual:** add up the row on your fingers. The perfect grid is a "magic square" where
every row and column hits the target.

**Interactions.**
- *Conflicts:* Seed 1 and Flush Royale (they want big totals, you bust). Straight Shooter (staircase
  rows have different totals). Full House of high cards.
- *Aligns:* Sudoku Scholar. A Latin square has **every** line summing to the same total, so if the N
  symbols used sum to T both gods are perfectly happy. Kids can find these. Seed 3 (green 1s are
  cheap, never bust). Minesweeper (low numbers on the minefield edges).
- *Pairs of Twenty-One gods* with different T are in pure tug-of-war over line totals, but they agree
  on "avoid bust" when both T are above the current total.

**Random-grid behaviour:** number rooms: T is below the mean line total, so most lines bust. Random
grids get a few lines' worth (≈ 10–25% of max). Max = `2N·2T`. Card rooms at N ≥ 5 bust almost always
(mean 7 cards ≈ 46), so random ≈ 0 and you need low cards. **Degenerate:** all zeros (0 rank) scores
0 per line, not degenerate; all-low grids score partially but miss the exact-T bonus.

---

## 6. Go Fish Books (four of a kind)

**Kid summary:** Your fish is the 7. Every 2×2 square of four 7s is a "book". If all four are
different suits (or colours) it's a perfect book worth double.

**Requires:** `Eq`; `MinSize 2` (always true). `Suited` optional: with it, a perfect book = all four suits; without it, all four colours (RGB: all three).

**Definition.** Parameter `r` (your fish rank, sampled from the room's ranks; for card rooms one of
A..K). For each of the `(N-1)²` 2×2 windows whose 4 cells all have rank `r`: add 1, or 2 if all four
suits are different. Card rooms: the four printed suits ♠♥♦♣. Number rooms: four distinct colours;
in **RGB** (only 3 colours) "perfect" means all 3 colours appear.

```ts
let score = 0;
for (let i = 0; i + 1 < N; i++) for (let j = 0; j + 1 < N; j++) {
  const q = [g[i][j], g[i][j+1], g[i+1][j], g[i+1][j+1]];
  if (!q.every(x => rank(x.s) === r)) continue;
  const suits = new Set(q.map(suit)).size;
  score += suits >= Math.min(4, K_or_4) ? 2 : 1;
}
return score;
```

**Why it's visual:** you look for blocks of the same number, like little tiles.

**Interactions.**
- *Aligns:* Full House (both directions, if the rank matches). Seed 2 (a block of 7s with no
  touching colours: in RGBY that's a 2×2 of four colours, which also gives the perfect book). Seed 3
  when `r = 1`, but only for the plain book: perfect books need non-green cells.
- *Conflicts:* any other Go Fish god with a different fish (they fight over territory), Sudoku
  Scholar, Straight Shooter, Minesweeper (a 2×2 of 7s rarely fits a mine count).

**Random-grid behaviour:** `(N-1)²/S⁴` ≈ 0.004 at N=7, S=10. Truly zero. Max `2(N-1)²` (72 at N=7).
**Degenerate:** a one-rank grid in a 4-colour checker-of-2×2 pattern maxes it. That's fine because
only gods who drew the same rank (or Full House / Seed 2) come along.

---

## 7. Othello Sandwich (capturing)

**Kid summary:** You're the blue player in Othello. Any line of other colours trapped between two of
your blue cells is captured, and every captured cell scores a point.

**Requires:** colour `Eq` only. Fully generic. Diagonal variant needs nothing extra.

**Definition.** Parameters: `X` (your colour) and `diag ∈ {false, true}`. For each row and column
(and both diagonal directions if `diag`), every maximal run of non-X cells that has an X cell
directly at **both** ends adds its length. A cell can be captured several times (once per
direction), just like a real Othello move flipping in several directions.

```ts
let score = 0;
for (const line of diag ? [...lines(), ...diagonals()] : lines()) {
  let last = -1; // index of the most recent X
  line.forEach((x, i) => {
    if (x.c !== X) return;
    if (last >= 0) score += i - last - 1;
    last = i;
  });
}
return score;
```

**Why it's visual:** you see X "bread" with a "filling" of other colours. The best boards look like a
fence or grid of X: X ? X ? X.

**Interactions.**
- *Conflicts:* Seed 1 for colour X (wants solid X bars, you need gaps), Flush Royale in number rooms,
  Knight Riders. A **one-colour grid scores 0** here, so this is the main punisher of the flat-colour
  strategy.
- *Aligns:* Seed 2 (alternating colours). A **second Othello god** of colour Y: the checkerboard
  X Y X Y gives each god every cell of the other's colour as filling, so both score. It's a natural
  two-god coalition that a third, flush-loving god hates. Go Territory of the same colour X (a ring
  of X sandwiches the inside).
- *Conflicts with Go Territory of a different colour:* their wall is your filling only if you
  surround it.

**Random-grid behaviour:** fairly high baseline (≈ 15–30% of max) because random X cells appear with
prob 1/K. E.g. N=7, RGB: each line ≈ 7 − (cells outside first and last X) ≈ 3–4 → ≈ 50 of a max of
≈ 2N·⌊(N−1)/2⌋·… (a lattice of X with single gaps: N=7 rows `X.X.X.X` give 3 per line). Square the
score or count only runs of length ≥ 1 in **both** directions if a lower baseline is wanted.

---

## 8. Go Territory (fencing land)

**Kid summary:** Like the game Go: build walls in your colour. Any patch of other cells you
completely fence in (not touching the edge of the board) is your territory, one point per cell.

**Requires:** colour `Eq`; **`MinSize 4`** recommended (N=3 has only one enclosable cell, which is weak but well-defined).

**Definition.** Parameter `X` (your colour). Flood-fill orthogonal regions of non-X cells. A region
counts if **none** of its cells is on the outer border (so it is fully enclosed by X). Score = total
cells in counted regions. Optional twist (sampled `eyes ∈ {false, true}`): with eyes, score
`size + 3·(number of separate enclosed regions)` to reward "two eyes" like real Go.

```ts
const seen = new Set(); let score = 0;
for (const [r, c] of cells()) {
  if (g[r][c].c === X || seen.has(key(r, c))) continue;
  const region = flood(r, c, (x) => x.c !== X, seen); // orthogonal BFS
  if (!region.some(([a, b]) => a === 0 || b === 0 || a === N-1 || b === N-1))
    score += region.length + (eyes ? 3 : 0);
}
return score;
```

**Why it's visual:** you see a coloured wall and the "land" inside.

**Interactions.**
- *Cooperative core:* the **inside** of your fence is free for anyone. Sudoku, Bingo and Twenty-One
  gods can do what they like inside a blue ring, so Go Territory is a natural landlord ("you can
  have my interior if you leave my wall alone").
- *Aligns:* Othello Sandwich of colour X (the ring sandwiches every interior row and column), Seed 1
  for colour X (border rows/columns are same-colour lines), Minesweeper with mines = X (interior
  numbers count wall cells).
- *Conflicts:* Seed 1 / Flush Royale of **other** colours along the border. A one-colour X grid
  scores 0 (nothing to enclose). Another Go god of a different colour fights over the border. Seed 3
  unless X = green.

**Random-grid behaviour:** enclosure is rare: ≈ 0–2 at N=7 RGB (single-cell holes surrounded by 4 X's
appear with prob `K⁻⁴` per interior cell). Max `(N-2)²` (25 at N=7; 1 at N=3. Small grids are weak
for Go, so you might give N=3 rooms diagonal enclosure or skip this family there).

---

## 9. Honest Minesweeper (numbers count neighbours)

**Kid summary:** Your colour cells are mines. Every other cell is "honest" if its number says exactly
how many mines touch it (diagonals too), and honest cells score their number.

**Requires:** `Valued`, colour `Eq`. Fully generic (values above 8 just can't be honest). Works best with `S ≤ 16`.

**Definition.** Parameter `X` = mine colour. For each non-X cell, let `m` = number of X cells among
its 8 neighbours. If `value(s) === m`, add `value(s)`. (Digit 0 cells with no mines are honest but
score 0. Card A = 1. Ranks above 8 can never be honest.)

```ts
let score = 0;
for (const [r, c] of cells()) {
  if (g[r][c].c === X) continue;
  const m = neighbours8(r, c).filter(([a, b]) => g[a][b].c === X).length;
  if (value(g[r][c].s) === m) score += m;
}
return score;
```

**Why it's visual:** kids **know** how to check a Minesweeper board: point at a number and count the
mines around it.

**Interactions.**
- *Conflicts:* any flat-colour strategy (all mines → no numbers; no mines → all numbers must be 0 and
  score 0). Seed 1 for colour X (solid mine bars leave few honest cells). Go Fish / Full House (the
  numbers are forced by geometry, not by matching). Straight Shooter.
- *Aligns:* Go Territory and Othello of colour X (fence patterns produce many 2s, 3s and 5s). Seed 3
  if X ≠ green: a green **1** next to exactly one mine is honest. Twenty-One (minefield numbers are
  small).
- *Two Minesweeper gods with different mine colours* can both be satisfied only where their
  boards are consistent, a neat negotiation puzzle.

**Random-grid behaviour:** P(honest) ≈ `(1-1/K) · P(value = m)` ≈ 1/S-ish → a handful of points.
Max: e.g. a sparse lattice of mines with 1s, 2s and 4s around them; interior 8s are rarely worth
building. Roughly `≈ 2–3 · N²` points. Strongly structure-dependent. No degenerate.

---

## 10. Sudoku Scholar (no repeats)

**Kid summary:** Like Sudoku: you score for every row and column where no number appears twice.

**Requires:** `Eq`. Fully generic (N ≤ S always). Recommend `MinSize 5` for `dir ∈ {rows, columns}` because small grids score high at random.

**Definition.** Parameter `dir ∈ {rows, columns, both}`. For each line in `dir`, add 1 if all ranks
in it are different. If `dir = both` and the whole grid is a Latin square, add a bonus of N.
(Requires N ≤ S, which always holds.) Colour ignored. Card rooms use rank, so 7♠ and 7♥ clash.

```ts
const ls = dir === "rows" ? rows() : dir === "columns" ? cols() : lines();
let ok = 0;
for (const line of ls) if (new Set(line.map(x => rank(x.s))).size === N) ok++;
return ok + (dir === "both" && ok === 2 * N ? N : 0);
```

**Why it's visual:** scan a row for any repeated number. Kids do this every day in puzzle books.

**Interactions.**
- *Aligns:* Straight Shooter (staircase is Latin), Twenty-One (Latin lines share a total), Bingo
  Caller when the called set is at least N numbers, Full House in the **other** direction (stripes).
- *Conflicts:* Full House in the same direction, Go Fish, Seed 2 (it wants big same-symbol regions),
  Rummy sets, Knight Riders (identical twins).

**Random-grid behaviour:** P(line distinct) = `∏(1 − i/S)`, i < N: N=3, S=10 → 0.72 (too high:
random 3×3 grids score ~4 of 6); N=7, S=10 → 0.06; cards N=7 → 0.17. **Fix for small N:** square
the count, or require both diagonals too when N ≤ 4. With `dir = both` the Latin-square bonus is the
real prize.

---

## 11. Bingo Caller (called numbers)

**Kid summary:** The caller has shouted out your numbers. Dab every cell showing one, and complete a
whole row, column or long diagonal to shout BINGO.

**Requires:** `Eq`. `HasCentre` optional: with odd N the free space applies; with even N there's no free space (default).

**Definition.** Parameter `called` = random subset of ranks of size `ceil(S/3)` (4 of 10, 4 of 12, 6
of 16, 5 of 13 card ranks). Odd N: the centre cell is a free space. Score = (dabbed cells) + N × (number
of complete lines among the 2N rows/columns and 2 main diagonals).

```ts
const dab = (r, c) => called.includes(rank(g[r][c].s)) || (N % 2 && r === c && r === (N-1)/2);
let score = 0;
for (const [r, c] of cells()) if (dab(r, c)) score++;
for (const line of [...lineCoords(), diag1, diag2])
  if (line.every(([r, c]) => dab(r, c))) score += N;
return score;
```

**Why it's visual:** everyone knows a bingo card. You can literally colour in the dabbed cells.

**Interactions.** This is the richest **partial-overlap** generator: two Bingo gods share each called
number with probability ≈1/3, so every pair of gods shares a few "friendly numbers" and fights over
the rest, and the overlap differs every game.
- *Aligns:* any rule with a favoured rank that was called (Go Fish r, a Seed 3 god if 1 is called,
  Full House stripes of called numbers). Sudoku Scholar if |called| ≥ N.
- *Conflicts:* Straight Shooter (needs consecutive numbers you mostly didn't call), Twenty-One (if
  called numbers are big), other Bingo gods' disjoint calls.

**Random-grid behaviour:** dabs ≈ N²/3 (≈16 at N=7), lines ≈ 0 → ≈16 of max `N² + N(2N+2)` = 161.
About 10%. **Degenerate:** fill everything with called numbers. That's fine, because they're a third
of the alphabet and other gods' rules decide the arrangement.

---

## 12. Set Spotter (the card game SET)

**Kid summary:** Like the game SET: three cells in a straight line are a "set" if their colours are
all the same or all different **and** their numbers are all the same or evenly spaced (like 2, 5, 8).
Each set you can spot is a point.

**Requires:** `Valued`, colour `Eq`. `Spectral` optional (NEW variant): with it, colours may also count when they are evenly spaced along the rainbow (R,Y,B in rainbow6), the true SET-like 'all different' generalisation.

**Definition.** No parameter (or sampled `diag ∈ {false,true}`). For every 3 consecutive cells in a
row, column (and diagonals if `diag`): colours are all equal or all distinct, AND values `a, b, c`
satisfy `b − a === c − b` (equal counts as spacing 0). Score = number of such triples.

```ts
let score = 0;
for (const line of diag ? [...lines(), ...diagonals()] : lines())
  for (let i = 0; i + 2 < line.length; i++) {
    const [a, b, c] = line.slice(i, i + 3);
    const cols = new Set([a.c, b.c, c.c]).size;
    const even = value(b.s) - value(a.s) === value(c.s) - value(b.s);
    if ((cols === 1 || cols === 3) && even) score++;
  }
return score;
```

**Why it's visual:** kids who play SET are trained to spot "all same or all different". Here it's
always 3 in a row, so they don't search.

**Interactions.**
- *Aligns:* Straight Shooter (step 1 is evenly spaced), Rummy Melder (runs and sets both qualify:
  a run is same colour + spacing 1; a set is all different colours + spacing 0), Full House stripes
  in one colour, Seed 1 (same-colour lines of equal or stepped values), Flush Royale.
- *Conflicts:* Seed 2 in RGBY/rainbow (it wants different adjacent colours but not necessarily all
  three different), Twenty-One (evenly spaced high numbers bust), Othello (X Y X is "two colours", which
  is never a set).
- **Note:** colour SET with 3 colours (RGB) forces "R G B" or "R R R". In rainbow rooms, "all
  different" is easy and "evenly spaced" does the work.

**Random-grid behaviour:** colour condition ≈ 1/3 (RGB) to 0.58 (rainbow); value condition ≈ 0.05–
0.09 (S=10). With 70 row/column triples at N=7 that's ≈ 2–4, against a max of 70 (120 with
diagonals). **Degenerate:** a uniform grid scores max. That's the flat-colour attractor again,
countered by Othello, Minesweeper, Go and Sudoku.

---

## 13. Knight Riders (chess)

**Kid summary:** You love knights. Every pair of cells a chess knight's jump apart that are exact
twins (same symbol **and** same colour) scores a point.

**Requires:** `Eq`; **`MinSize 3`** (3×3 has 8 knight pairs, all through the border; meaningful from N ≥ 4).

**Definition.** Parameter `X` = your colour **or** "any" (sampled: half the gods get a colour, half
get "any"). Count unordered pairs of cells at knight offset (±1,±2)/(±2,±1) with identical symbol and
colour (and that colour = X if X is set). Card rooms: identical card (same rank and suit) and colour.

```ts
let score = 0;
for (const [r, c] of cells())
  for (const [dr, dc] of [[1,2],[2,1],[2,-1],[1,-2]]) {   // each pair once
    const a = g[r][c], b = g[r+dr]?.[c+dc];
    if (b && a.s === b.s && a.c === b.c && (X === "any" || a.c === X)) score++;
  }
return score;
```

**Why it's visual:** chess kids can trace the L-shape. The pretty patterns are periodic wallpapers,
e.g. rows repeating every 2 (`A B A B` rows stacked so row r = row r+2) or a whole field of one twin.

**Interactions.** A knight always lands on the opposite colour of a chessboard, so:
- *Conflicts:* any **checkerboard** structure (Seed 2 with 2 alternating colours, the two-god
  Othello checkerboard). A checkerboard scores exactly **0** here. Sudoku Scholar (twins on knight
  jumps often share a row or column? no: (1,2) is different row and column, so it's compatible! But
  Latin squares built from staircases `r+c` put equal values at (+1,−1), not knight jumps, so they
  usually score 0 here).
- *Aligns:* uniform grids (Seed 1, Flush, Set Spotter, Go Fish), and **vertical/horizontal stripe
  patterns of period 2** with a matching colour period, which Full House (rows) also likes if the
  stripes are horizontal. Go Territory: a ring of X with identical twins on the wall gives knight
  pairs around the corners.

**Random-grid behaviour:** pairs = `4(N−1)(N−2)` (8 at N=3, 120 at N=7). Expected `pairs/(S·K)` ≈ 4 at
N=7, S=10, RGB (rainbow+cards: 120/(52·6) ≈ 0.4). Max 120. **Degenerate:** uniform grid. It's
deliberately one of the "smooth-lovers", but the uniform grid is a single object, and Othello,
Minesweeper and Go punish it.

---

## 14. Uno Snake (Uno + Snakes & Ladders board)

**Kid summary:** Walk the grid like a Snakes & Ladders board (left to right, then back right to
left, zig-zagging down). Each step is allowed only if the next cell matches by colour **or** by
number, like Uno. Your score is your longest unbroken walk.

**Requires:** `Eq`. Fully generic.

**Definition.** Parameter `axis ∈ {rows, columns}` (zig-zag along rows or along columns). Build the
boustrophedon sequence of all N² cells. Score = length of the longest stretch in which every
consecutive pair shares colour or rank.

```ts
const seq = [];
for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
  const jj = i % 2 ? N - 1 - j : j;
  seq.push(axis === "rows" ? g[i][jj] : g[jj][i]);
}
let best = 1, run = 1;
for (let k = 1; k < seq.length; k++) {
  const ok = seq[k].c === seq[k-1].c || rank(seq[k].s) === rank(seq[k-1].s);
  run = ok ? run + 1 : 1; best = Math.max(best, run);
}
return best;
```

**Why it's visual:** trace the snake with a finger and stop where Uno says "no match".

**Interactions.**
- *Aligns:* almost every "smooth" rule (Seed 1, Flush, Full House, Go Fish, Set Spotter). Seed 2
  (same-symbol regions: rank matches carry the snake through colour changes). Rummy sets (same rank
  link) and runs (same colour link). Straight Shooter only if same colour (rank changes every step).
- *Conflicts:* Sudoku + rainbow mixes (rank never repeats along rows, so colours must). Othello
  checkerboards with varying symbols. Minesweeper boards (numbers vary, colours vary).
- *It's the "glue" rule:* lots of gods can each be partially happy with it, but it rewards the long
  path, so gods argue about **where** the breaks go.

**Random-grid behaviour:** P(link) ≈ `1/K + 1/S − 1/(KS)` ≈ 0.40 (base10, RGB), 0.24 (cards, rainbow).
Longest run in 49 cells ≈ 4–6 versus max N² = 49. **Degenerate:** uniform grid. Countered as above.

---

## 15. Court Parade [CARD-ONLY: Suited, Faced]

**Kid summary:** You love the royal family. A Jack, Queen and King of the same suit standing in a
row (in that order, left to right or top to bottom) is a parade, and an Ace leading it, so A J Q K,
is a grand parade.

**Requires:** `Suited`, `Faced`, `MinSize 3` (grand parade needs `MinSize 4`). Card rooms only.

**Definition.** Parameter `suitP ∈ {♠♥♦♣, "any"}` (sampled: favourite suit or any). Count every 3
consecutive cells along a row (L→R) or column (T→B) reading J, Q, K of one suit (= `suitP` if set):
+5 each. If the cell just before the J is the Ace of that suit, +5 more. Optional colour twist
(sampled `matchColour`): the three must also share a colour.

```ts
let score = 0;
for (const line of lines())
  for (let i = 0; i + 2 < N; i++) {
    const [a, b, c] = line.slice(i, i + 3);
    const ok = [a, b, c].map(x => rank(x.s)).join() === "11,12,13"
      && suit(a) === suit(b) && suit(b) === suit(c) && (suitP === "any" || suit(a) === suitP)
      && (!matchColour || (a.c === b.c && b.c === c.c));
    if (!ok) continue;
    score += 5;
    if (i > 0 && rank(line[i-1].s) === 1 && suit(line[i-1]) === suit(a)) score += 5;
  }
return score;
```

**Why it's visual:** picture cards stand out. You just look for the J Q K faces in a line.

**Interactions.**
- *Aligns:* Straight Shooter (J Q K is a +1 run; aceHigh gods also like Q K A), Rummy Melder runs
  (same suit +1 run of high value: a huge rummy score), Flush Royale (card rooms: same suit), Set
  Spotter (evenly spaced).
- *Conflicts:* Twenty-One (faces bust instantly), Full House, Go Fish Books (unless the fish is a
  face), Sudoku in the other direction is fine, but two parade gods with different suits fight over
  the scarce face cells. Bingo Caller unless 11–13 were called.

**Random-grid behaviour:** P(window) = `(1/52)³ · 4`-ish ≈ 3·10⁻⁵ per window, so effectively 0. Max
at N=7: rows `A J Q K` with columns also parading is limited, about 2N·(N−2)/3 parades. No degenerate
(needs specific cards).

---

## Interaction web (quick view)

| Rule | Loves | Hates |
|---|---|---|
| Full House | stripes, Seed 2, Go Fish | Sudoku (same dir), Straight |
| Flush Royale | Seed 1 (number rooms), Straight | Othello, Minesweeper; card rooms: friendly with Seed 2 |
| Straight Shooter | Sudoku, Set, Rummy runs | Full House, Bingo, Twenty-One |
| Rummy Melder | Seed 1 **and** Seed 2 (bridge) | flat colour, Sudoku (sets) |
| Twenty-One | Sudoku (Latin = equal sums), Seed 3 | Seed 1, Flush, Straight |
| Go Fish Books | Full House, Seed 2 (RGBY), Seed 3 (r=1) | other fish, Sudoku, Minesweeper |
| Othello Sandwich | Seed 2, other Othello god, Go (same X) | flat colour, Seed 1 (X), Knight |
| Go Territory | Othello (X), Minesweeper (X), tenants inside | flat colour, other-colour borders |
| Minesweeper | Go/Othello fences, Seed 3, Twenty-One | flat colour, Go Fish, Straight |
| Sudoku Scholar | Straight, Twenty-One, Full House (other dir) | Full House (same dir), Go Fish, Seed 2 |
| Bingo Caller | anyone whose rank was called | Straight, disjoint Bingo gods |
| Set Spotter | Straight, Rummy, Seed 1 | Othello (2-colour), Twenty-One |
| Knight Riders | uniform/period-2 stripes | checkerboards (always 0), Latin staircases |
| Uno Snake | smooth rules, Seed 2 | Sudoku + rainbow, Minesweeper |
| Court Parade (cards) | Straight, Rummy runs, Flush (cards) | Twenty-One, Full House, other suits' parades |

The **flat-colour attractor** (Seed 1, Seed 3, Flush, Set, Knight, Uno all like one-colour grids)
is balanced by the **contrast camp** (Othello, Go, Minesweeper, Seed 2, Rummy sets, Sudoku), which
scores 0 or near 0 on a flat grid. A healthy room deals from both camps.

---

## Best 3 from my lens

1. **Rummy Melder.** One rule that is literally "Seed 1 runs + Seed 2 sets" in rummy clothing, so it
   befriends both seed gods but forces them to negotiate over each 3-window. In card rooms the
   suit/colour split adds a second axis.
2. **Othello Sandwich.** Instantly understood, it creates a natural two-god coalition (the
   checkerboard of X and Y feeds both), and it's the cleanest punisher of the flat-colour strategy.
3. **Bingo Caller.** Random called sets of ~1/3 of the ranks give every pair of gods a different,
   partial "friendly numbers" overlap each game, which is the heterogeneity the design wants, and
   the arrangement is left free for other gods.

Honourable mention: **Honest Minesweeper**. Kids can check it at a glance, and it is very hard to
game with flat strategies.

## Cross-lens ideas I noticed but didn't develop

- **Scrabble premium squares:** each god privately gets 2–3 "double/triple" cells. Same-colour
  horizontal "words" score the sum of values with premiums. It gives private positional preferences,
  great for hidden-info negotiation, but it's less visually checkable by others.
- **Connect Four with gravity:** only count same-colour 4-windows that are "supported" from the
  bottom row (no non-X gap beneath). It makes the bottom of the grid prime real estate.
- **Dominoes:** adjacent cells whose values sum to a sampled target (e.g. 10, "make ten" pairs). It's
  a local, combinatorial cousin of Twenty-One.
- **Snakes & Ladders proper:** cells of colour X are ladders (+value) and of colour Y snakes; simulate a
  token moving along the boustrophedon path. It's fun but too long to compute by eye.
- **King's court (chess):** your rank scores for each king-neighbour (8-neighbour) cell of a different
  colour. It's a diagonal-inclusive version of Seed 2.
- **Card-only suit rules:** "♥ cells must be red", which would be a cross-type alignment between the
  printed suit and the colour set. It's card-room-only, flagged.
- **Poker hand per 2×2 or per row as one score ("best hand wins"):** this could unify Full House,
  Flush and Straight into one family with a sampled favourite hand.
