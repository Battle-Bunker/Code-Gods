# Grid utilities: the strategic interaction lens

Lens: design each rule mainly for how it meets the other rules, not for how good it looks alone. I want
a web where most pairs are **M** (the draw decides whether two gods are friends) and where a few general
transformations (rotate, mirror a half, recolour X→Y, colour-by-parity, sort a row) each help one
coalition and hurt another.

## Conventions used below

- `g[r][c] = {s, c}`; `value(s)` is the symbol value. Digits use face value; base12/16 use A=10, B=11 and so on;
  cards use rank with A=1, J=11, Q=12, K=13 (the suit is part of the symbol, so two cards match only if rank
  and suit both match). `V` = the set of values, `vmin`/`vmax` its ends. `k` = number of colours.
- **Colour index / wheel**: colours sit on a wheel in rainbow order. RGB is R→G→B→R, RGBY is R→Y→G→B→R, and
  rainbow is R→O→Y→G→B→V→R. `idx(c)` is the position on the wheel and `next(c)` is the colour one step on.
- A **colour parameter** is drawn uniformly from the room's colour set. A **symbol parameter** is drawn uniformly
  from the room's symbol set. Rules that need two different colours draw them without replacement, and k ≥ 3
  always holds, so that is always possible.
- **Rim** = cells in row/col 0 or N−1. **Core** = everything else (for N=3 that is just the centre cell).
- `nbrs(r,c)` = in-grid orthogonal neighbours (2–4 of them).
- Layers: **[C]** reads only colours, **[S]** reads only symbols, **[P]** is position-heavy, and **[C+S]** couples both.
  Two rules on different layers are naturally orthogonal: an edit to one layer cannot hurt the other. Coupling
  rules are the ones that make politics.

Reminder about the engine: a god's payoff on an object is their utility × the sum of the others'. So
"parasite" rules that score *from other gods' structure existing* are strong by design, because they are
high exactly on the objects other gods already value.

---

## 1. Border Baron  [C, parasite / kingmaker]

**Requires:** none (fully generic).

**Kid summary.** You love big countries with long borders. You score a point for every edge where two
*big* same-colour blobs of different colours touch.

**Definition.** Split the grid into same-colour regions (orthogonally connected). A region is *big* if it
has ≥ K cells. Score = the number of orthogonal edges whose two cells lie in two different big regions.
Parameter: `K ∈ {N−1, N, 2N−2}`, which sets how thick your ideal stripes are.

```ts
const reg = labelRegions(g, (a, b) => a.c === b.c);   // reg.id[r][c], reg.size[id]
let score = 0;
for (r, c) for ([r2, c2] of [[r, c+1], [r+1, c]]) if (inGrid(r2, c2)) {
  const a = reg.id[r][c], b = reg.id[r2][c2];
  if (a !== b && reg.size[a] >= K && reg.size[b] >= K) score++;
}
return score;
```

**Visual.** Thick bands or blocks of colour. You count the "fence posts" between big blobs.

**Interactions.**
- Aligns with **Seed 1**, since big regions contain long same-colour lines, and with **Rainbow Road**: vertical
  stripes R|G|B|R… are perfect for both when K ≤ N. Aligns with **Homebody**, because a solid core block inside a
  solid rim ring gives two big regions with a long shared border.
- Conflicts with **Seed 2** and **Islander**, which both want colours to alternate cell by cell, so every region
  has size 1.
- **Parasite.** It cannot score alone on a monochrome grid (one region, zero borders), so it needs at least
  two other colour interests. That puts it in the middle of any pair of colour gods (Homebody red vs Homebody
  blue, or Conqueror A vs B) who have each claimed half of the grid.
- Same family: K = N−1 wants 1-wide stripes and K = 2N−2 wants 2-wide stripes. They agree on "stripes" but
  disagree on width, so **M**.

**Random grid.** For RGB at N=7, random regions are mostly smaller than N, so the score is ≈ 0–3 against a
max of N(N−1) = 42 (1-wide stripes, K ≤ N). Rainbow random ≈ 0. **Degenerate fill** (one colour) scores 0.
This rule punishes monochrome by construction.

---

## 2. Homebody  [C+P, local vs global]

**Requires:** none. MinSize 3 holds in every room. The core is a single cell at N=3, so that draw is very rim-heavy there. Optional `HasCentre` variant: zone = centre plus its four neighbours.

**Kid summary.** Your colour belongs at home, and home is either the middle or the edge. +1 for each of
your colour at home, −1 for each that wandered away.

**Definition.** Parameters: colour X and zone Z ∈ {core, rim}. Score = #X in Z − #X outside Z. Max = |Z|.

```ts
let score = 0;
for (r, c) if (g[r][c].c === X) score += inZone(Z, r, c) ? 1 : -1;
return score;
```

**Visual.** A solid blob of X in the middle (or a solid X frame) and no stray X cells anywhere else.

**Interactions.** This is the main *local vs global* tension in the set.
- **Seed 3** (green 1s, wants green everywhere): if X = green, they agree inside Z and fight outside it, because
  Homebody actively *punishes* green outside Z. If X ≠ green, they fight over Z. **M** by draw.
- Two Homebodies: (red, core) + (blue, rim) are perfect allies, since the zones are disjoint and so are the colours.
  (red, core) + (red, rim) are pure enemies, a zero-sum tug of war. (red, core) + (blue, core) compete for the same
  cells. The draws decide all of this.
- Aligns with **Border Baron** (core block plus rim ring) and **Mirrormancer** (core and rim are mirror-invariant,
  so any mirror or rotation transform leaves Homebody's score unchanged, and Homebody will never veto one).
- Conflicts with **Rainbow Road** (every rainbow row contains every colour, so X lands both inside and outside
  Z) and with **Islander** when the island colour is X.

**Random grid.** Expected (|Z| − |not Z|)/k, which is ≈ 0 at N=7 and negative at N=3 (core is 1 cell, rim 8).
Max |Z|. **Degenerate fill** with X scores |Z| − |not Z|, which is poor (and −7 at N=3 with Z = core). The rule
punishes its own naive "flood everything" move.

---

## 3. Conqueror  [C, two-draw]

**Requires:** none (colour `Eq` only).

**Kid summary.** Colour A is your army and colour B is your enemy. Score = how many A cells minus how many B cells.

**Definition.** Parameters: A ≠ B. Score = #A − #B. Range −N²..N².

```ts
let s = 0; for (r, c) s += (g[r][c].c === A) - (g[r][c].c === B); return s;
```

**Visual.** Count your colour and subtract your enemy's. Completely obvious.

**Interactions.** This is the cleanest demonstration that **the relationship between two draws** decides friend or foe:
- (A,B) vs (B,A): zero-sum enemies.
- (A,B) vs (A,C): allies on A, and each tolerates the other's enemy.
- (A,B) vs (C,A): enemies (one wants A up, the other wants it down).
- (A,B) vs (C,D): every B→C recolour helps both. A single transform, "repaint B as C", is a coalition handshake,
  and the B→A versus D→C details are left to bargain over.
- (A,B) vs (B,C): the first wants B gone and the second wants B everywhere. Conflict, but recolouring C→A helps both.
- vs **Seed 3**: A = green is aligned, B = green is opposed, otherwise mild conflict over cells.
- vs **Parity Painter (P,Q)**: if A = P, they form a coalition on "make every symbol even, paint it A".

**Random grid.** Expected 0 (sd ≈ √(2N²/k)). Max N² (all A). **Degenerate fill** with A is the maximum.
**Border Baron**, **Rainbow Road**, **Islander** and **Seed 2** all score 0 on that grid, and since a monochrome
A grid only varies in symbols, Conqueror is a natural customer for symbol-layer gods.

---

## 4. Rainbow Road  [C+P, directional]

**Requires:** `Spectral` + `Wheel`. Default method for RGB/RGBY, whose order has no wrap: treat the spectral order as cyclic anyway (proposed **NEW**: `Wheel` holds by convention for every Spectral set, since the vocabulary is unsure about this). Without any wrap, rows longer than k could never count.

**Kid summary.** You love rainbows. Count the rows (or columns) where the colours march around the colour
wheel one step at a time, in your direction.

**Definition.** Parameter: direction D ∈ {→, ←, ↓, ↑}. A line counts if every consecutive pair in direction D
satisfies `c2 = next(c1)` (wrapping V→R). Score = the number of such lines (0..N).

```ts
let score = 0;
for (line of linesInDirection(g, D))          // N lines, each ordered along D
  if (line.every((cell, i) => i === 0 || cell.c === next(line[i-1].c))) score++;
return score;
```

**Visual.** Rainbow stripes. Pick a row and read it: red, orange, yellow… no skips.

**Interactions.**
- Same family: same D, aligned. Opposite D (→ vs ←), direct conflict on every row, because k ≥ 3 means a row
  can't step +1 both ways. Perpendicular (→ vs ↓), *both maxed* by diagonal stripes `colour = (r+c) mod k`.
  That gives a very visual **M**.
- Aligns with **Border Baron**: rows → with columns monochrome are vertical stripes.
- Aligns with **Seed 2**: diagonal stripes make *every* orthogonal neighbour differ in colour, which lets Seed 2
  turn the whole grid into one symbol region. A Rainbow+Seed-2 coalition is a striking grid.
- Conflicts with **Mirrormancer(left-right, colour)**, since a mirrored row runs backwards. It is compatible with
  **Mirrormancer(top-bottom, colour)** as long as rows repeat. **M** by axis.
- Conflicts with **Conqueror**, **Homebody** and **Seed 3**, because every road uses every colour equally.

**Random grid.** P(line) = (1/k)^(N−1), so ≈ 0 for N ≥ 4. Small N is easier (N=3, RGB: 3 × 1/9 ≈ 0.33).
Max N. **Degenerate fill** scores 0.

---

## 5. Mirrormancer  [C or S, symmetry]

**Requires:** none (`Eq` on the chosen layer). Note: with `Even` N there is no middle column, which matters for Lone Peak.

**Kid summary.** You love reflections. Count the rows (or columns) that read the same forwards and backwards
in your layer, either colours or symbols.

**Definition.** Parameters: axis ∈ {left-right, top-bottom} and layer ∈ {colour, symbol}. left-right counts
rows that are palindromes in the layer. top-bottom counts columns. Score 0..N.

```ts
const key = cell => layer === "colour" ? cell.c : cell.s;
let score = 0;
for (line of axis === "left-right" ? rows(g) : cols(g))
  if (line.every((x, i) => key(x) === key(line[N-1-i]))) score++;
return score;
```

**Visual.** Fold the picture in half and see whether it matches.

**Interactions.**
- Orthogonal layers: Mirrormancer(colour) and Mirrormancer(symbol) never interfere, and the same "mirror the left
  half onto the right" transform helps both of them at once. That makes it a free coalition transform.
- Aligns with **Homebody** (zones are symmetric), **Seed 3** (all green 1s is symmetric), **Islander** (a
  checkerboard is symmetric for odd N) and **Border Baron** (symmetric stripes).
- **Lone Peak** (symbol layer): a unique peak can only live on the fold line (its mirror image would tie it).
  So it is **M**: they can coexist, but only on the middle column.
- **Staircase Climber** (→) vs Mirrormancer(left-right, symbol): a palindrome cannot strictly climb, so that is a
  conflict. Mirrormancer(top-bottom) vs Climber(→) is fine.
- **Rainbow Road**: see above, **M** by axis.

**Random grid.** P(row palindrome) = (1/k)^⌊N/2⌋ for colour, or (1/|S|)^⌊N/2⌋ for symbol. N=7 RGB colour gives
≈ 0.26 of 7. N=3 colour is lenient (≈ 1 of 3). Max N. **Degenerate fill** (monochrome) maxes the colour version.
That is fine, because Border Baron, Rainbow Road and Seed 2 punish it.

---

## 6. Islander  [C, polka dots]

**Requires:** none.

**Kid summary.** You love little islands. Every cell of your colour whose neighbours are *all* one other colour
is an island, worth a point.

**Definition.** Parameter: colour X. A cell with colour X is an island if all of its in-grid neighbours share
one colour Y ≠ X. Score = the number of islands.

```ts
let score = 0;
for (r, c) if (g[r][c].c === X) {
  const ns = nbrs(r, c).map(([a, b]) => g[a][b].c);
  if (ns[0] !== X && ns.every(y => y === ns[0])) score++;
}
return score;
```

**Visual.** Polka dots of X sitting in a sea of one colour.

**Interactions.**
- Strongly aligned with **Seed 2**: an X/Y checkerboard is the exact colouring Seed 2 needs ("no two adjacent
  cells share a colour"), so Seed 2 can fill it with one big same-symbol region.
- **Seed 3** is draw-dependent. X ≠ green: the sea can be green 1s, aligned. X = green: green dots on a non-green
  sea, which is a direct conflict over the sea.
- Conflicts with **Border Baron** and **Seed 1**: dots are size-1 regions and break every same-colour line.
- Two Islanders with X ≠ X′ can share one grid: X dots on a Y sea in the top half and X′ dots in the bottom half.
  Two Islanders whose colours are each other's sea (X on X′ and X′ on X) are fully aligned on a checkerboard.

**Random grid.** For an interior cell, (1/k)·(k−1)/k⁴ ≈ 0.8% (RGB), so ≈ 0.4 at N=7. Max ≈ ⌈N²/2⌉
(checkerboard with X on the even squares). **Degenerate fill** scores 0.

---

## 7. Magic Accountant  [S, two-draw arithmetic]

**Requires:** `Valued`. Optional `Numeral b` variant: read each row as a base-b number and count rows divisible by d.

**Kid summary.** You have a magic number T. Add up each row (or column) of symbols. Every line that adds up to
exactly T is a point.

**Definition.** Parameters: axis ∈ {rows, cols} and T = round(N·(vmin+vmax)/2) + uniform(−N..N), clipped to
[N·vmin, N·vmax]. Score = the number of lines in that axis whose value sum = T.

```ts
let score = 0;
for (line of axis === "rows" ? rows(g) : cols(g))
  if (line.reduce((t, x) => t + value(x.s), 0) === T) score++;
return score;
```

**Visual.** Add each row. A beginner can check it with a pencil.

**Interactions.** This is a *scarcity through arithmetic* rule:
- Same T, different axis: allies. The joint ideal is a semi-magic square.
- Different T, different axis: if every row sums to T₁ then the grid total is N·T₁, so not every column can sum to
  T₂ ≠ T₁. They must split, for example N−1 rows against N−1 columns. That gives a negotiated **M** with a hard ceiling.
- Different T, same axis: compete row by row.
- **Staircase Climber**: a climbing row a, a+1, …, a+N−1 sums to N·a + N(N−1)/2, so the two are compatible only if
  T ≡ N(N−1)/2 (mod N). That is arithmetic luck of the draw.
- **Seed 1**, **Seed 2** and **Lone Peak** all want large values (or one large value). Low T conflicts and high T
  aligns. **Seed 3** (all 1s, rows sum to N) almost always conflicts.
- It is orthogonal to every [C] rule, so colour gods are its natural "you take colours, I take symbols" partners.

**Random grid.** Base10, N=7: row sum sd ≈ 7.6, so P(=T) ≈ 5% and the score ≈ 0.35 of 7. Max N.
**Degenerate:** none, and since only symbols matter, maximizers are plentiful.

---

## 8. Staircase Climber  [S, directional]

**Requires:** `Enum` ("one more" = succ; for cards, succ of rank with suit ignored; no wrap). With `Cyclic` you may let 9→0 / K→A count as a step, which is easier.

**Kid summary.** You love staircases. Each time a symbol is exactly one more than the one before it (going right,
or going down), you score.

**Definition.** Parameter: direction ∈ {→, ↓}. Score = the number of adjacent pairs in that direction with
value(next) = value(prev) + 1. Max N(N−1).

```ts
let score = 0;
for (r, c) { const [r2, c2] = dir === "→" ? [r, c+1] : [r+1, c];
  if (inGrid(r2, c2) && value(g[r2][c2].s) === value(g[r][c].s) + 1) score++; }
return score;
```

**Visual.** Read along a row: 3,4,5,6 is a staircase.

**Interactions.**
- Conflicts with **Seed 2** (wants equal neighbours), **Seed 3** (all 1s, no steps) and **Lone Peak** (staircases
  climb to ties at the top unless only one line reaches the highest value).
- Same family: → and ↓ are both satisfied by `value = r + c + base`, which is allied, and sharp-eyed kids can spot it.
- **Parity Painter**: steps alternate parity, so PP colours alternate P, Q along each staircase. Under `value = r+c`
  that is an exact checkerboard, which in turn makes **Islander**(X ∈ {P,Q}) happy. This triangle is a coalition
  (see "coalition transforms").

**Random grid.** P(step) ≈ 1/|V| (≈ 9% base10), so N=7 gives ≈ 3.8 of 42. **Degenerate:** none.

---

## 9. Lone Peak  [S+C, scarcity]

**Requires:** `Valued`.

**Kid summary.** You want one mountain, in your colour, towering over everything. Score = how much taller your
peak is than the second-tallest cell.

**Definition.** Parameter: colour X. Let m1 ≥ m2 be the top two values in the grid, counted over cells (so a tie
gives m1 = m2). If the cell holding m1 is unique and has colour X, score = m1 − m2. Otherwise 0.

```ts
const vals = cells(g).map(x => value(x.s)).sort((a, b) => b - a);
const top = cells(g).filter(x => value(x.s) === vals[0]);
return top.length === 1 && top[0].c === X ? vals[0] - vals[1] : 0;
```

**Visual.** Find the biggest number. Is it your colour? Is nothing else close?

**Interactions.**
- **Hard scarcity**: per grid, only one colour can own the peak, so Lone Peaks of different colours are zero-sum on
  each grid. But the world has many grids, so they can *divide the world* ("you take the grids whose peak is in
  the left half"). This turns local scarcity into a market. Lone Peaks of the same colour are fully allied.
- Strong **A** with **Seed 3**: a sea of 1s with a single high card in X costs Seed 3 one cell.
- Conflicts with **Seed 1**, **Seed 2** and **Magic Accountant** with high T (they want many big values). It also
  conflicts with **Climber**.
- With **Mirrormancer(symbol)**, the peak must sit on the fold line.
- A "**peak flattener**" transform (cap every value at the second-highest) is a weapon one Lone Peak can aim at a
  rival's grids. It is visible and easy to explain.

**Random grid.** Ties for the max are likely at large N (base10, N=7: P(a unique max) ≈ 0.3–0.4 and the gap is
usually 1), and then the colour must match (1/k). Expected ≈ 0.15. N=3 base10 gives ≈ 0.6. Max vmax − vmin
(9 for base10, 12 for cards).

---

## 10. Parity Painter  [C+S, coupler]

**Requires:** `Valued` (parity of value; cards use rank, A=1). Card-room alternative: `Suited` (red suits ♥♦ should wear P and black suits ♠♣ Q), which is the same family on a different coupling.

**Kid summary.** Even numbers should wear colour P and odd numbers colour Q. +1 for each that does, −1 for
each that is wearing the *other* one's colour.

**Definition.** Parameters: P ≠ Q. For each cell: even value and colour P, or odd value and colour Q, scores +1.
Even and Q, or odd and P, scores −1. Other colours score 0. Card A=1 is odd.

```ts
let s = 0;
for (x of cells(g)) { const even = value(x.s) % 2 === 0;
  if (x.c === (even ? P : Q)) s++; else if (x.c === (even ? Q : P)) s--; }
return s;
```

**Visual.** Look at any cell: is it even and in P, or odd and in Q?

**Interactions.** The **translator**. It ties the colour and symbol layers together, so orthogonal coalitions
(colour god + symbol god) suddenly have a third party who cares about both.
- Conflicts with **Seed 2**: a same-symbol region shares a parity, so PP wants it all one colour, which is exactly
  what Seed 2 forbids. Direct **C**.
- **Seed 3** (green 1s): Q = green is a perfect ally, P = green is an enemy. **M** by draw.
- **Conqueror(A,·)** with A = P: coalition on "all even, all A".
- Aligns with **Climber + Islander** on the parity checkerboard.

**Random grid.** Expected 0. Max N². **Degenerate:** "all symbols even, all P" maxes it, which needs both layers
fixed. Rainbow Road and Seed 2 punish that.

---

## 11. Rook's Watch  [C+S, diminishing returns / low footprint]

**Requires:** none (`Eq`). In cards+rainbow rooms the token is 1 of 312, so random ≈ 0. In base10+RGB it is 1 of 30.

**Kid summary.** You have one special token, a symbol in a colour. Every row and every column that contains
your token is a point.

**Definition.** Parameters: symbol S and colour X. Score = (#rows containing (S,X)) + (#cols containing (S,X)).
Max 2N, reached with only N cells (a permutation, for example the diagonal).

```ts
const rs = new Set(), cs = new Set();
for (r, c) if (g[r][c].s === S && g[r][c].c === X) { rs.add(r); cs.add(c); }
return rs.size + cs.size;
```

**Visual.** Like placing rooks: every row and column needs one of your tokens.

**Interactions.** This is the **cheap partner**. It needs N cells, and those cells can be anywhere as long as they
cover every row and column, so it can fit around almost any other god's design. Its diminishing returns (a second
token in a row adds nothing) make it a natural compromiser, in contrast with the linear **Seed 3**, which wants every cell.
- Aligns with **Mirrormancer** (the anti-diagonal is fine for top-bottom and left-right symmetry for odd N)
  and fits inside **Homebody** zones if X matches.
- Conflicts with **Lone Peak** if value(S) is high (N copies tie for the peak) and with **Seed 2** only weakly.
- Same symbol, different colour: they compete for nothing except placement. Two Rooks on one grid need 2N cells,
  which is easy at N ≥ 4.

**Random grid.** P(cell = token) = 1/(|S|·k) ≈ 1/30 (base10, RGB). At N=7 that is ≈ 3 of 14 (on the high side,
which is acceptable for a compromiser). Cards and rainbow make it ≈ 1/312, so ≈ 0. Max 2N.

---

## 12. Picture Frame  [C+P, all-or-nothing]

**Requires:** none.

**Kid summary.** You want a perfect frame: every edge cell in your colour. It's all or nothing. One wrong cell
and you get zero.

**Definition.** Parameter: colour X. Score = 4(N−1) if every rim cell has colour X, else 0.

```ts
for (r, c) if (onRim(r, c) && g[r][c].c !== X) return 0;
return 4 * (N - 1);
```

**Visual.** A clean coloured border.

**Interactions.** This is the *holdout* rule. It is the linear Homebody(X, rim)'s all-or-nothing twin. Both want the same
cells, but Picture Frame is indifferent to the 99% state and desperate about the last cell, so it is the god who
will pay most for the final edit (and the one others can extort).
- Aligns with **Homebody(X, rim)** and **Homebody(Y≠X, core)** (a framed picture), and with **Border Baron** (the
  frame is one big region, and the inside can be another).
- Conflicts with **Rainbow Road** (rim rows aren't monochrome), **Islander** (the rim breaks the sea pattern only
  if X is the island colour) and **Homebody(X, core)**.
- Two Frames of different colours are pure scarcity: one frame per grid. Divide the world.

**Random grid.** P = k^−4(N−1), so effectively 0. Max 4(N−1). **Degenerate fill** with X maxes it, and
Homebody(X, core) and Border Baron punish that.

---

## Interaction matrix (13 rules)

Key: **A** mostly aligned, **C** mostly conflicting, **M** mixed / depends on the draws, **0** orthogonal.
Diagonal = two gods of the *same* family with different draws.

| | S1 | S2 | S3 | BB | HB | CQ | RR | MM | IS | MA | CL | LP | PP |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **S1** Seed 1 lines | A | M | M | A | A | A | M | M | C | M | 0 | C | M |
| **S2** Seed 2 regions | | M | C | C | C | C | A | 0 | A | M | C | C | C |
| **S3** green 1s | | | M | M | M | M | C | A | M | C | C | A | M |
| **BB** Border Baron | | | | M | A | M | A | A | C | 0 | 0 | 0 | M |
| **HB** Homebody | | | | | M | M | C | A | M | 0 | 0 | 0 | M |
| **CQ** Conqueror | | | | | | M | C | A | M | 0 | 0 | 0 | M |
| **RR** Rainbow Road | | | | | | | M | M | C | 0 | 0 | 0 | M |
| **MM** Mirrormancer | | | | | | | | A | A | M | M | M | 0 |
| **IS** Islander | | | | | | | | | M | 0 | 0 | 0 | M |
| **MA** Magic Accountant | | | | | | | | | | M | M | M | 0 |
| **CL** Climber | | | | | | | | | | | A | C | A |
| **LP** Lone Peak | | | | | | | | | | | | C | 0 |
| **PP** Parity Painter | | | | | | | | | | | | | M |

Count: 30 M, 22 A/C, 26 0 (off-diagonal). Every rule has at least two **A**s and two **C**s.

**The most interesting cells, one line each**
- **S2 × RR = A**: diagonal rainbow stripes make every neighbour differ in colour, so Seed 2 can make the whole grid one symbol.
- **S2 × IS = A**: a two-colour checkerboard is exactly Seed 2's precondition. Islander is Seed 2's colour-layer bodyguard.
- **S2 × PP = C**: same symbol means same parity means same colour under PP, which is forbidden by Seed 2. One of the hardest conflicts.
- **S3 × LP = A**: a sea of green 1s with one tall X peak costs Seed 3 a single cell.
- **S3 × HB = M**: green at home means allies inside the zone and enemies outside it, because Homebody penalizes the green Seed 3 spreads.
- **S1 × RR = M**: rainbow rows kill horizontal runs, but with monochrome columns (vertical stripes) Seed 1 keeps every vertical line.
- **HB × MM = A**: Homebody's score is invariant under every mirror or rotation, so Homebody never vetoes a symmetry transform.
- **BB × CQ = M**: recolouring B→A grows regions (good for BB) until A swallows everything (BB = 0). Aligned early, hostile late.
- **RR diagonal = M**: same direction is allied, opposite is impossible together, perpendicular is both maxed by `(r+c) mod k`.
- **MA diagonal = M**: different T on different axes have a provable ceiling (grid total = N·T), so the gods must split rows from columns.
- **MA × CL = M**: compatible only when T ≡ N(N−1)/2 (mod N). Arithmetic luck of the draw.
- **MM × LP = M**: under symbol mirror the unique peak must sit on the fold line.
- **CL × PP = A**: staircases alternate parity, so PP's colouring of a staircase grid is a checkerboard, and that also feeds Islander.
- **LP diagonal = C** (different colours): one peak per grid. Scarcity they resolve by dividing *the world*, not the grid.

(Not in the table. **Rook's Watch** is A or 0 with almost everything, the low-footprint compromiser. **Picture
Frame** is A with HB(X, rim) and BB, and C with RR, HB(X, core) and other Frames.)

---

## Coalition transforms: one piece of code, many gods

Transformations are applied to many grids at once, so the best diplomatic currency is a **general** transform
that moves several utilities the same way on almost every grid. A cheat sheet that rooms could show kids:

| Transform | Helps | Hurts | Neutral |
|---|---|---|---|
| Rotate 90° | swaps the axis of RR, MM, MA, CL (good for a god whose draw is the other axis) | the god on the current axis | HB, BB, IS, CQ, PP, LP, S2, S3, Frame (all rotation-invariant) |
| Mirror left half onto right | MM (both layers at once), HB-neutral | RR(→/←), CL(→), LP (duplicates the peak unless it's in the middle) | CQ roughly, MA(rows) changes |
| Repaint colour B as C | CQ(·,B), CQ(C,·), HB(C,·) if B was in C's zone | anyone who loves B | all [S] rules |
| Paint by parity (even→P, odd→Q) | PP, IS (if X∈{P,Q}), S1 (runs appear where parity runs) | S2, RR, CQ(other colours) | all [S] rules |
| Copy left neighbour's colour | S1, BB, CQ-majority | S2, IS, RR | [S] rules |
| Sort each row ascending | CL(→) partially, LP-neutral | MM(left-right), RR if colours move with symbols | MA(rows) (row sums are unchanged), BB per colour mix |
| Cap values at the second-highest ("flatten peak") | anyone's rival Lone Peak | LP, S1, S2 slightly | colour rules |

Two design takeaways:
1. **Invariance is diplomacy.** Rules that are invariant under a transform (HB, BB, IS and CQ under rotation; MA(rows)
   under in-row shuffles) are "free votes" for it. Each family should have a few invariances and a few
   sensitivities, so every transform has a constituency.
2. **Swing transforms.** Rotation is the cleanest: it does nothing to colour-count rules and *flips* every
   directional rule. A god with RR(↓) can offer "I'll rotate every grid" to all RR(→) holders as a pure gift.

## Uniqueness and scarcity

- **Count the maximizers.** A rule that fixes only one layer (Conqueror, Mirrormancer(colour), Border Baron) has
  |symbols|^(N²) maximizing grids, so uniqueness never binds and the other layer is open for trade. A rule whose
  optimum fixes **both** layers (Seed 3: "all green 1s" is *one* grid in the whole world; Parity Painter's exact
  optimum too) is world-scarce: only one object can be perfect, and every near-perfect grid is a distinct
  near-miss. That is fine, but such rules should be rare, and their summaries should tell the player that the
  goal is "lots of high-ish grids", not "the perfect grid".
- **Recommendation:** prefer rules that leave a layer (or a region) free. That free space is what gets traded.
  Rook's Watch is the extreme case (N cells used, the rest free).
- **Scarcity inside a grid** (Lone Peak, Picture Frame of different colours, MA with different T) turns into
  *dividing the world* across grids, which is an excellent negotiation topic for kids ("you take the grids whose
  top-left cell is red").
- **Transforms collide.** "Repaint everything green" applied to many grids hits uniqueness fast when two grids
  differed only in colour. Collapsing transforms (monochrome, constant symbols) fail more often. That is a natural,
  self-enforcing tax on degenerate fills, which complements the rules (BB, RR, IS, S2) that punish monochrome directly.

## Diminishing returns vs all-or-nothing, as a design knob

The same target can come in three temperaments, and mixing them in one room creates bargaining asymmetry:
- **Linear** (Homebody, Conqueror, Seed 3): steady and predictable. Every cell matters equally.
- **Saturating** (Rook's Watch, and per-line rules like Rainbow Road and Mirrormancer): cheap to satisfy partly. These are good compromisers.
- **All-or-nothing** (Picture Frame, Lone Peak's tie rule): indifferent until the very end, then desperate. These are holdouts.
A family could even sample its temperament as a parameter: "rim cells of X" scored linearly, squared, or as
all-or-nothing.

---

## Room parameters reshape the politics (capabilities addendum)

**Seed requirements:** Seed 1 `Valued`. Seed 2 `Eq` + `Valued`. Seed 3 `HasColour green` + a symbol of value 1
(`Valued`; cards A=1). To keep Seed 3 generic, sample "your colour" and "your symbol" instead.

The room's parameters decide which families are in the deck, *and* how often two draws from a family collide.
So they shape the political map before anyone chats.

- **Few colours (RGB, k=3) means colour politics is crowded.** Two Conqueror (A,B) draws share a colour with
  probability ≈ 1 when k = 3 (only 6 ordered pairs), so nearly every pair is a direct ally or enemy. Two Homebodies
  share a colour 1/3 of the time. In rainbow6, (A,B) vs (C,D) with all four distinct becomes the common case, so the
  "one repaint helps both" alliances dominate. **More colours means more orthogonal and coalition-friendly; fewer
  means more zero-sum.** RGB also makes random structure denser: Mirrormancer(colour), Border Baron and Rook's
  Watch random scores rise, so their calibration should key on k.
- **Big symbol sets (cards, 52) starve symbol-equality rules.** Seed 2 regions, Mirrormancer(symbol) and Rook's
  Watch become very hard. Value-based rules (Magic Accountant, Climber, Lone Peak) still work because rank values
  repeat across suits. In card rooms the **colour layer carries most of the play**, and *suit* adds a third layer
  that is orthogonal to both colour and rank.
- **`Suited` (cards) unlocks a third axis.** Suit rules (count ♥ in your colour, rows that are all one suit, a "flush")
  are orthogonal to colour rules and rank rules. A card room can hold three nearly independent coalitions
  (colour / rank / suit), plus couplers (Parity Painter's suit variant). `Faced` adds a "royal court" rule (J/Q/K
  clustered round the centre) that conflicts with Lone Peak (several high values) and Seed 3 (low values).
- **`Mixable` (rainbow6) unlocks mixing rules**, for example "Painter's Palette: points for each orange cell lying between a red
  and a yellow neighbour". These are *parasites on two primary-colour gods at once*: they need Conqueror(red)- and
  Conqueror(yellow)-style territory touching. That makes them natural Border Baron allies and enemies of Rainbow Road
  (whose adjacent colours are wheel-neighbours, and those are never the parents of a mix).
- **`Wheel`** turns Rainbow Road and Grudge rules (enemy = next colour on the wheel) into a closed ring of rivalries.
  Without it the ends of the spectrum are "safe" colours with only one rival.
- **`Numeral b`** lets rows be read as numbers (divisibility, palindromic numbers, "the top row is bigger than the bottom row").
  That gives the symbol layer arithmetic coalitions that card rooms lack.
- **Size.** At N=3 the core is one cell, so Homebody(core) is nearly impossible and Homebody(rim) nearly free. Picture
  Frame and rim rules then dominate. `Even` N removes the centre: Lone Peak × Mirrormancer(symbol) flips from
  **M** (the peak sits on the fold) to hard **C**, and `HasCentre` rules (centre crown) vanish. Large N (7) makes
  ties more common, so Lone Peak gets harder and per-line rules (Rainbow Road, Magic Accountant) get rarer at random.

**Implication for the selector:** a room should sample families from the eligible pool *and* check that the pool
contains at least one coupler (Parity Painter or similar) and one parasite (Border Baron or a mixing rule).
Otherwise card+RGB rooms risk splitting into non-interacting colour and symbol camps.

## Best 3 from my lens

1. **Conqueror (A, B)**. It is the simplest possible rule (count minus count), yet any two Conquerors are enemies,
   allies or "allied on one repaint" depending purely on how their draws overlap. Kids can work out who their friends
   are from the summaries alone.
2. **Rainbow Road (direction)**. It is gorgeous, punishes monochrome, and has crisp geometry: same direction is allied,
   opposite is impossible, perpendicular is both satisfied by diagonal stripes. It is also a surprise ally of Seed 2.
   Rotation is its swing transform.
3. **Border Baron (K)**. This is the parasite/kingmaker. It scores only when two *other* colour interests each hold
   big territory, so it naturally brokers between rival colour gods, and it gives 0 to every degenerate fill.

Runner-up: **Parity Painter**, the cross-layer translator that breaks the "colours vs symbols" orthogonality
and creates the Seed-2 conflict and the Climber/Islander triangle.

## Cross-lens ideas I noticed but didn't develop

- **Grudge rules**: "score = your colour's count minus the count of the colour *next* on the wheel". Every god's
  enemy is determined by their own draw, so a ring of rivalries forms automatically (R hates O hates Y…).
- **Neighbourhood vote**: each cell "votes" with its majority neighbour colour, and you score the cells that vote
  for X. This is a smoothed Conqueror that rewards *placement*, not just counts.
- **Suit politics for cards**: ♥/♦ prefer red-wheel colours and ♠/♣ prefer blue-wheel colours. This gives card
  rooms a built-in two-party system.
- **Calibration helper**: for each pair of families, simulate random draw pairs and measure the correlation of their
  utility changes under random single-cell edits. That gives an empirical version of the matrix above and could tune a
  "guaranteed overlap" selector (the README mentions balanced selectors).
- **Distance rules**: "your two colours want to be as far apart as possible" (max Manhattan distance between the
  centroids of A and B). This is position-only and interacts with Homebody (core vs rim) in interesting ways.
- **Temperament as a parameter** (see above): one family with three payoff curves, so the holdout vs compromiser
  dynamic is dealt randomly.
