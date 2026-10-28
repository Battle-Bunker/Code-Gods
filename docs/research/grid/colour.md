# Grid utilities: COLOUR & VISUAL PATTERN lens

## Conventions used below

- Grid `g[r][c] = {s, c}`; I write `col(r,c)` for the colour index and `sym(r,c)` for the symbol.
- **Palette order** (always a sub-order of the rainbow, so "next colour" means the same thing everywhere):
  RGB = `[R, G, B]`, RGBY = `[R, Y, G, B]`, rainbow = `[R, O, Y, G, B, V]`. `K` = palette size (3, 4, 6).
- **Colour parameters** are drawn uniformly from the room's palette; when a rule needs 2 or 3 colours they are
  drawn *without replacement* (always possible because K ≥ 3). No rule names a colour outside the palette.
- `nbrs(r,c)` = orthogonal neighbours (4-neighbour). `lines` = all N rows plus all N columns.
- Seed rules are called **S1 Line Painter** (same-colour straight runs, sum of symbol values),
  **S2 Patchwork** (same-symbol regions with no two adjacent cells sharing a colour; size × value) and
  **S3 Green Ones**.
- "Random" numbers are Monte Carlo means over uniform spawns (4000 grids per setting), quoted as
  *random ≈ x / max y* for a mid-size room (N=5) unless I say otherwise.

The lens has one design idea running through it: **colour rules sort into a few "geometries"**
(uniform patches, alternation, cyclic stepping, balance, sparse placement). Rules from the *same* geometry
with *different* sampled colours fight over territory but can usually split the grid. Rules from
*different* geometries either share one specific picture (a "treaty pattern") or have none. I note the
treaty patterns because they are what the negotiation in chat will be about.

---

## 1. Best Friends (checkerboard)

**Kid summary.** You love it when your two colours, say red and blue, sit side by side. Every place a
red touches a blue earns you a point, so a red-and-blue checkerboard is perfect.

**Requires:** `Colour Eq` (generic). Works on every palette; on RGB the friend pair covers 2 of 3 colours, so it is a bit cheaper.

**Definition.** Parameters: distinct colours `A, B`. Score = number of orthogonally adjacent cell pairs
whose colours are `{A, B}` (in either order). Max = `2N(N−1)` (perfect A/B checkerboard).

```ts
let s = 0;
for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
  if (c + 1 < N && pair(col(r,c), col(r,c+1))) s++;
  if (r + 1 < N && pair(col(r,c), col(r+1,c))) s++;
}
return s;   // pair(x,y) = (x==A && y==B) || (x==B && y==A)
```

**Why visual.** You literally see the checkerboard; every red-blue "seam" is a point.

**Interactions.**
- *Aligns with S2 Patchwork:* a checkerboard with one repeated symbol is a single huge same-symbol region
  in which no neighbours share a colour, so S2 hits its maximum (N² × value) on the very same grid.
  This is the strongest "same edit pleases both" pair in the lens: Best Friends paints, S2 copies a symbol.
- *Aligns with Wallpaper Weaver (p=2)* and with *Mirror Quilt* when N is odd (an odd checkerboard is
  left-right symmetric; an even one is anti-symmetric, so the alliance flips with room size).
- *Conflicts with S1 Line Painter:* a checkerboard has no same-colour run longer than 1. Total enemies.
- *Conflicts with Stripe Painter, Kingdom, Flag Bearer:* all want same-colour clumps.
- *Conflicts with Feuding Families* when the feud pair equals the friend pair: exact opposites.
- *Two Best Friends gods:* `(R,B)` vs `(B,R)` are identical (full alliance). `(R,B)` vs `(R,G)` share red:
  treaty pattern is red on one parity, and blue/green on the other parity split by halves (top half blue,
  bottom half green) — each gets about 75% of max. `(R,B)` vs `(G,Y)` share nothing and must split
  the board into two checkerboard territories: classic border war along the seam.
- *Conflicts with Quilt Maker:* a 2-colour checkerboard repeats colours in every 2×2 window.

**Random grids.** ≈ 9 / 40 (K=3), 2.2 / 40 (K=6). No degenerate monochrome strategy: one colour scores 0.
The degenerate optimum *is* the checkerboard, and S1/Stripe/Kingdom punish it.

---

## 2. Stripe Painter (flags)

**Kid summary.** You want the grid to look like a striped flag: every row (or column, depending on your
draw) painted one solid colour, with each stripe a different colour from the one next to it.

**Requires:** `Colour Eq` (generic).

**Definition.** Parameters: orientation `o ∈ {rows, columns}`. Score = number of lines (in your
orientation) that are a single colour and differ in colour from the previous line if that line was also
solid. Max = N. A one-colour grid scores only 1.

```ts
let s = 0, prev = -1;
for (let i = 0; i < N; i++) {
  const line = o === "rows" ? row(i) : column(i);
  const solid = line.every(x => x === line[0]);
  if (solid && line[0] !== prev) s++;
  prev = solid ? line[0] : -1;
}
return s;
```

**Why visual.** A flag: you count the solid stripes.

**Interactions.**
- *Rows vs columns Stripe Painters:* they cannot both score more than 1 on any grid (row-solid and
  column-solid together forces a single colour, which only gives 1). **Pure conflict**, and a good
  public tell in chat ("I keep painting horizontal bands…").
- *Aligns with S1 Line Painter (rows variant)* since each solid row is a long same-colour line; S1's
  column runs get chopped to length 1 (conflict with S1 columns if S1 scores both directions only in
  the sense that rows dominate).
- *Aligns with Mirror Quilt (left-right mirror, rows orientation):* a solid row is its own mirror.
- *Aligns with Wallpaper Weaver in the stripe-perpendicular direction* (period along a solid row is free).
- *Aligns with Feuding Families:* X stripe, buffer stripe, Y stripe is exactly what a feud wants.
- *Aligns with Colour Mixer:* a red stripe, orange stripe, yellow stripe stack gives every orange cell
  a red neighbour and a yellow neighbour.
- *Conflicts with Best Friends, Quilt Maker, Rainbow Road (in the stripe direction), Fair Weaver,
  Lantern Lighter.*

**Random grids.** ≈ 0.06 / 5 (K=3, N=5); essentially zero for N≥5. Very structured, very visible.

---

## 3. Rainbow Road (cyclic stepping)

**Kid summary.** You love rainbows. Every time a cell's right-hand neighbour is the *next* colour of
the rainbow (red → orange → yellow …, and violet loops back to red) you get a point.

**Requires:** `Spectral`. With `Wheel` (rainbow6) the last colour steps back to the first, so every row can be a full road (max N(N−1)). Without `Wheel` (RGB, RGBY) the default method is no wrap-around: the road must restart, so max per row is about (N−1)·(K−1)/K and long rows need a "restart" cell. Optionally also offer the wrapped version on RGB/RGBY if the architect grants them `Wheel`.

**Definition.** Parameter: direction `d ∈ {right, down}`. Score = number of pairs (cell, next cell in
direction d) with `col(next) === (col(cell) + 1) % K`. Max = N(N−1). Uses palette order, so RGB is
R→G→B→R and RGBY is R→Y→G→B→R.

```ts
let s = 0;
for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
  const [r2, c2] = d === "right" ? [r, c+1] : [r+1, c];
  if (r2 < N && c2 < N && col(r2,c2) === (col(r,c) + 1) % K) s++;
}
return s;
```

**Why visual.** You trace rainbow order with your finger; perfect grids show colour diagonals or
rainbow bands.

**Interactions.**
- *Right vs down Rainbow Roads* **align** perfectly on the diagonal rainbow `col = (r + c) % K`, which
  maxes both. So two gods with "different" draws have one shared masterpiece. But a grid of horizontal
  rainbow rows that are all identical (`col = c % K`) maxes "right" and gives "down" zero: the right god
  must be careful *which* rainbow they paint. Lovely asymmetry for chat bargaining.
- *Aligns with Fair Weaver:* a cyclic rainbow row is perfectly balanced in every palette.
- *Aligns with Lantern Lighter* when N ≤ K (diagonal rainbow puts each colour once per row and column).
- *Aligns with Colour Mixer for recipes that are rainbow neighbours* (R,O,Y has O between R and Y;
  Y,G,B has G between Y and B). *Conflicts with the Mixer recipe R+B→V* (R and B are far apart on the road).
- *Aligns with S2 Patchwork:* consecutive rainbow colours are never equal, so a single-symbol rainbow
  row has no same-colour neighbours.
- *Conflicts with S1, Stripe Painter (same direction), Kingdom, Flag Bearer* (all want repeats).
- *Conflicts with Wallpaper Weaver* unless the period p is a multiple of K (p=3 in RGB is the one
  happy coincidence: RGBRGB repeats every 3).

**Random grids.** ≈ 1/K of max: 6.6 / 20 (K=3), 3.3 / 20 (K=6). A bit generous on RGB; could cube the
fraction if a sharper score is needed. No degenerate strategy: monochrome scores 0.

---

## 4. Quilt Maker (king's-move colouring)

**Kid summary.** You are sewing a patchwork quilt. Every little 2×2 square where all the patches look
different earns you a point.

**Requires:** `Colour Eq` plus NEW `MinColours 4` for the clean "all four different" version (RGBY, rainbow6). On 3-colour rooms the default method is the stated fallback (3 colours, repeat on the diagonal).

**Definition.** Score = number of 2×2 windows that are "good patches". With K ≥ 4: all four colours
distinct. With RGB (K=3): all three colours appear and the repeated colour sits on a diagonal (no two
side-by-side patches match). Max = (N−1)².

```ts
let s = 0;
for (let r = 0; r + 1 < N; r++) for (let c = 0; c + 1 < N; c++) {
  const [a, b, d, e] = [col(r,c), col(r,c+1), col(r+1,c), col(r+1,c+1)];
  s += K >= 4 ? new Set([a,b,d,e]).size === 4
              : new Set([a,b,d,e]).size === 3 && a!==b && a!==d && e!==b && e!==d;
}
return s;
```

**Why visual.** Slide a 2×2 "window" (two fingers each way) across the grid and check the patches.

**Interactions.**
- *Aligns with S2 Patchwork* (no two side neighbours equal) and *Fair Weaver* (balanced lines).
- *Treaty with Best Friends?* No: a two-colour checkerboard fails every window. But the 4-colour tiling
  `col = 2·(r%2) + (c%2)` contains a checkerboard of `{0,3}` diagonally — **Best Friends counts only
  side-by-side seams, so it gets 0**. Hard conflict, which is useful because Best Friends + S2 is
  otherwise a very cosy alliance.
- *Conflicts with Rainbow Road:* the diagonal rainbow repeats on the anti-diagonal of every window.
  (On RGB, the pattern R G / B R … works for Quilt and gives Rainbow Road "right" only half.)
- *Conflicts with S1, Stripes, Kingdom, Flag Bearer, Mirror Quilt* (a 4-colour tiling is not mirror
  symmetric for even N).

**Random grids.** 1.5 / 16 (K=4), 2.4 / 16 (K=3), 4.5 / 16 (K=6). On rainbow rooms random patches are
common (28%); fine with relaxed bounds, or require "and no colour repeats with the window to the right".

---

## 5. Colour Mixer (sandwiches)

**Kid summary.** You know that red and yellow make orange. Every orange cell that touches both a red
cell and a yellow cell is a perfect mix and earns you a point.

**Requires:** `Mixable` (rainbow6 only). The RGB/RGBY "pretend recipes" below are an optional degraded method; I'd rather not offer the rule there ("red + blue make green" teaches kids the wrong thing).

**Definition.** Parameter: a recipe `(P1, M, P2)` drawn from the palette's list.
- rainbow6 (`Mixable`): R+Y→O, Y+B→G, R+B→V (paint mixing).
- Degraded method only if the room lacks `Mixable` (not recommended): RGBY Y+B→G; RGB "middle colour
  sits between the other two".

Score = number of cells of colour M with at least one P1 neighbour and at least one P2 neighbour.
Max ≈ N²/3 to N²/2 (e.g. columns P1, M, P2, M, P1 … gives every M column both parents).

```ts
let s = 0;
for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
  if (col(r,c) !== M) continue;
  const ns = nbrs(r,c).map(([a,b]) => col(a,b));
  if (ns.includes(P1) && ns.includes(P2)) s++;
}
return s;
```

**Why visual.** Look for orange "jam" between red and yellow "bread".

**Interactions.**
- *Aligns with Feuding Families when the feud pair is (P1, P2):* the mixed colour is a perfect buffer
  between two kingdoms that must not touch. Mixer wants the buffer to be M; Feud just wants any buffer.
  This is the most "creative" alliance: Feud offers Mixer the frontier.
- *Aligns with Stripe Painter* (P1 / M / P2 stripes) and with *Rainbow Road* for neighbour recipes.
- *Conflicts with Best Friends(P1,P2):* friends want P1 to *touch* P2 directly, Mixer wants M in between.
- *Two Mixers:* rainbow recipes R+Y→O and Y+B→G **share yellow**: the stripe stack R O Y G B is a joint
  maximum for both — two gods with different draws, same picture. R+Y→O vs R+B→V share red and fight
  over who gets to be red's neighbour.
- *Conflicts with Kingdom(M)* (a big M blob has interior M cells with no parents) and *Flag Bearer*.

**Random grids.** 2.0 / ≈10 (K=4, N=5), 0.6 (K=6). Monochrome scores 0.

---

## 6. Flag Bearer (row majority)

**Kid summary.** Your colour is blue, and you want blue to win the vote in as many rows as possible:
a row is yours if it has more blue than any other single colour.

**Requires:** `Colour Eq` (generic).

**Definition.** Parameters: colour `C`; orientation `o ∈ {rows, columns}`. Score = number of lines in
orientation `o` where `count(C)` is strictly greater than the count of every other colour. Max = N.

```ts
let s = 0;
for (const line of (o === "rows" ? rows() : columns())) {
  const n = k => line.filter(x => x === k).length;
  if (palette.every(k => k === C || n(C) > n(k))) s++;
}
return s;
```

**Why visual.** Count colours row by row, like votes.

**Interactions.**
- *Cheap but contested:* in a 7-wide RGB row, 3 blues out of 7 can be enough, so the remaining cells
  are free to trade. That makes Flag Bearer a natural *coalition partner*: it only needs a plurality.
- *Two Flag Bearers, same orientation, different colours:* zero-sum per row, but they can split rows
  (top half blue, bottom half red). *Different orientations* (blue rows vs red columns): a real puzzle;
  e.g. N=7, RGB — put blue in 3 cells of every row and red in 3 of every column, using a Latin-ish
  layout; both can score high at once. Great negotiation content.
- *Aligns with Kingdom(C), S1 (C lines), Stripe Painter (a C stripe wins its row outright), S3 if C = green.*
- *Conflicts with Fair Weaver* (balanced rows have no strict winner when counts tie) — direct ideological
  enemies: "dominance vs fairness".
- *Conflicts with Lantern Lighter(C)* (one C per row almost never wins a vote unless N ≤ K).

**Random grids.** 1.06 / 5 (K=3, N=5), 0.56 / 5 (K=6). Degenerate: fill everything with C. That is
punished by Fair Weaver, Best Friends, Rainbow Road, Quilt, Stripe Painter (scores 1), Lantern and
every other god's colour, so a monochrome grid has a very low product with others.

---

## 7. Fair Weaver (Latin-square balance)

**Kid summary.** You hate favourites. A row or column is fair when every colour appears about the same
number of times (never more than one extra), and you get a point for each fair line.

**Requires:** `Colour Eq` (generic). Weak on N=3 with rainbow6 (see below): could add `MinSize 4` or `N ≥ K/2`.

**Definition.** Score = number of lines (rows and columns) where `max(count) − min(count) ≤ 1` over
*all* palette colours (zeros count). When N ≤ K this means "no colour repeats in the line" (a
Sudoku/Latin rule); when N ≥ K it means every colour appears, evenly. Max = 2N (a Latin-style square
such as `col = (r + c) % K` when K divides into it well; always reachable by a cyclic shift pattern).

```ts
let s = 0;
for (const line of [...rows(), ...columns()]) {
  const n = palette.map(k => line.filter(x => x === k).length);
  if (Math.max(...n) - Math.min(...n) <= 1) s++;
}
return s;
```

**Why visual.** Colour Sudoku: scan each row and column for repeats.

**Interactions.**
- *Aligns with Rainbow Road, Quilt Maker, Lantern Lighter, S2 Patchwork.*
- *Conflicts with Flag Bearer, Kingdom, Stripe Painter, S1, Best Friends* (a 2-colour checkerboard
  starves the other K−2 colours) and *S3 Green Ones* (lots of green breaks balance).
- *Many-god role:* Fair Weaver is the natural enemy of whoever is "winning" colour-wise. In a room with
  two Flag Bearers it is the kingmaker.

**Random grids.** 2.3 / 10 (K=4, N=5), 0.9 / 10 (K=6, N=5). Weak spot: N=3 on rainbow (≈ 3.3 / 6,
because three distinct colours out of six is easy). Could require `max ≤ 1` *and* the line to contain a
sampled colour C in that case.

---

## 8. Colour-by-Number

**Kid summary.** Like a colouring book: every symbol has its own colour on your secret key (for you
1s are green, 2s are blue …). Each cell painted the right colour for its number earns a point.

**Requires:** `Valued` symbols, `Colour Eq` (generic: cards use rank). Better with `Numeral b` where the key can be stated as "digit mod K".

**Definition.** Parameter: shift `t ∈ [0, K)`. A cell is correct when
`col(r,c) === (value(sym(r,c)) + t) % K`. Score = number of correct cells. Max = N². Works for every
symbol set (cards use rank value; A=1). Summary shows the key as a legend, e.g. "0,3,6,9 → red".

```ts
let s = 0;
for (let r = 0; r < N; r++) for (let c = 0; c < N; c++)
  if (col(r,c) === (value(sym(r,c)) + t) % K) s++;
return s;
```

**Why visual.** You check each cell against a printed key.

**Interactions.**
- *Two Colour-by-Number gods with different shifts are pure, cell-by-cell enemies* (same symbol, different
  required colour), with no territorial split possible except "my half / your half". This is the
  deliberate counterpoint to Best Friends pairs, which can share.
  …unless they change *symbols*: a god can satisfy both by moving cells to symbols where the keys
  agree — they never agree, so the only peace is splitting the board.
- *Aligns with S3 Green Ones* when the key sends 1 to green; with *S1 Line Painter* if a row holds
  symbols of the same residue (same colour, any values — S1 even prefers high values).
- *Conflicts with S2 Patchwork:* S2 wants same symbols with *different* colours side by side;
  Colour-by-Number forces same symbol = same colour. Every S2 region dies.
- *Orthogonal to most colour-only rules* (Rainbow Road, Stripes, Best Friends): those can be satisfied
  by choosing symbols to match the painted colours, so Colour-by-Number gods are the ones who
  *re-number* other gods' pictures. Natural cooperation: "you paint the rainbow, I'll fix the digits".

**Random grids.** N²/K (≈ 8 / 25 at K=3). A bit high; use (score/N²)³ if needed. No degenerate
painting strategy because the key depends on symbols.

---

## 9. Mirror Quilt (colour symmetry)

**Kid summary.** You want the grid's colours to look the same in a mirror. Fold it down the middle:
each cell that lands on a cell of the same colour earns a point.

**Requires:** `Colour Eq` (generic). Axis `half-turn` and `main diagonal` are fine at all sizes; `HasCentre` only changes whether a centre cell is ignored.

**Definition.** Parameter: axis `a ∈ {left-right, top-bottom, main diagonal, half-turn}`. Score =
number of mirror pairs `(cell, mirror(cell))` with equal colour (each pair once, centre cells ignored).
Max = number of pairs ≈ N²/2.

```ts
let s = 0;
for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
  const [r2, c2] = mirror(a, r, c);
  if ((r2 * N + c2) > (r * N + c) && col(r,c) === col(r2,c2)) s++;
}
return s;
```

**Why visual.** Butterfly / folded paper.

**Interactions.**
- *Size-dependent with Best Friends:* odd-N checkerboards are left-right symmetric (full alliance), even-N
  are anti-symmetric (zero). The same two gods are friends in a 5×5 room and enemies in a 6×6 room.
- *Left-right Mirror + row Stripe Painter* align; *top-bottom Mirror + row Stripes* need a palindromic
  stripe order (R G B G R), which Stripe Painter accepts — a cosy treaty.
- *Conflicts with Rainbow Road (same axis direction)* (stepping up is not palindromic) and *Quilt Maker*.
- *Two Mirror gods with different axes:* both satisfied by the 4-fold symmetric "mandala" pattern —
  alignment that requires a specific, pretty grid.
- Degenerate: monochrome maxes it; punished by Best Friends, Fair Weaver, Rainbow Road, Quilt, Stripes.

**Random grids.** 1/K of max: 3.3 / 10 (K=3, N=5). Might want exponent; Symmetry lens may own this.

---

## 10. Kingdom (largest blob)

**Kid summary.** Your colour is yellow and you are building a yellow kingdom. Your score is the size of
the biggest connected patch of yellow cells (touching by sides).

**Requires:** `Colour Eq` (generic).

**Definition.** Parameter: colour `C`. Score = size of the largest 4-connected component of colour C.
Max = N².

```ts
let best = 0; const seen = new Set();
for (each cell p with col(p) === C and !seen.has(p)) {
  let n = 0; const stack = [p]; seen.add(p);
  while (stack.length) { const q = stack.pop(); n++;
    for (const m of nbrs(q)) if (col(m) === C && !seen.has(m)) { seen.add(m); stack.push(m); } }
  best = Math.max(best, n);
}
return best;
```

**Why visual.** Flood-fill with your eyes.

**Interactions.**
- *Two Kingdoms with different colours:* territorial fight with an obvious treaty: split the grid in
  halves (each gets ~N²/2). Only the largest blob counts, so stray cells are worthless and easy to give away.
- *Kingdom(C) + Feuding Families(C, D):* Feud wants C and D blobs apart; Kingdom wants C big. Align.
- *Kingdom(C) + Flag Bearer(C) + S1 + S3 (C = green)*: the "blob coalition".
- *Kingdom(C) + Lantern Lighter(C):* opposite (Lantern wants isolated C cells). Pure conflict on the same
  colour, with zero conflict if colours differ (a lantern of D can sit inside a C kingdom… only on its border,
  since a D inside a C kingdom splits nothing but costs one cell).
- *Conflicts with Best Friends, Quilt, Rainbow Road, Fair Weaver, S2.*
- A thin snake still counts (connected), so Kingdom can coexist with Rainbow Road by snaking one colour
  through a rainbow? No — rainbow neighbours differ — but a C snake *through* a Mixer arrangement is fine.

**Random grids.** 4.2 / 25 (K=3, N=5), 1.9 / 25 (K=6). Degenerate monochrome maxes it, but every
other rule punishes it (see Flag Bearer).

---

## 11. Feuding Families (keep apart)

**Kid summary.** Your two colours, red and green, are feuding families who must never touch. You
want lots of red and lots of green on the grid, with no red ever next to a green.

**Requires:** `Colour Eq` (generic; needs a third colour as buffer, which every palette has).

**Definition.** Parameters: distinct colours `X, Y`. A cell is "safe" if it is X with no Y neighbour,
or Y with no X neighbour. Score = 2 × min(safe X cells, safe Y cells). Max ≈ N² − N (two halves split
by a one-cell buffer line of another colour). Monochrome scores 0 because of the min.

```ts
let sx = 0, sy = 0;
for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
  const k = col(r,c), ns = nbrs(r,c).map(([a,b]) => col(a,b));
  if (k === X && !ns.includes(Y)) sx++;
  if (k === Y && !ns.includes(X)) sy++;
}
return 2 * Math.min(sx, sy);
```

**Why visual.** Two coloured countries with a wall (border line) between them.

**Interactions.**
- *Exact opposite of Best Friends(X, Y).*
- *Aligns with Colour Mixer (X, M, Y)*: the buffer is the mixing colour. And with *Kingdom(X)* or
  *Kingdom(Y)*, *Stripe Painter* (X X buffer Y Y bands), *Flag Bearer(X)* on X's rows.
- *Needs a third colour (the buffer)* — that buffer cell is prime real estate for *Lantern Lighter* or a
  third god's Kingdom: alliances form around who owns the wall.
- *Conflicts with Fair Weaver* (rows that are all X are unfair), *Rainbow Road* only weakly (rainbow
  rows R O Y G B: R and G never touch, so a diagonal rainbow is partly fine!) — interesting partial overlap.

**Random grids.** 2.3–2.7 / 20 (N=5). Good spread.

---

## 12. Lantern Lighter (rooks / N-queens of one colour)

**Kid summary.** Your colour is violet and violet lanterns are precious. A violet cell earns a point if
it is the only violet in its row *and* the only violet in its column.

**Requires:** `Colour Eq` (generic).

**Definition.** Parameter: colour `C`. Score = number of C cells that are alone in their row and column.
Max = N (a permutation pattern, like rooks that do not attack each other).

```ts
let s = 0;
for (let r = 0; r < N; r++) for (let c = 0; c < N; c++)
  if (col(r,c) === C && countRow(r, C) === 1 && countCol(c, C) === 1) s++;
return s;
```

**Why visual.** "One lantern per row and column" — you can see crowding immediately.

**Interactions.**
- *Very cheap:* it uses only N of the N² cells, so a Lantern Lighter is the easiest coalition partner in
  the room — they can "rent" the leftover cells to anyone. Two Lantern Lighters with different colours
  are almost never in conflict (two disjoint permutations): cooperation by default.
- *Aligns with Fair Weaver, Rainbow Road (diagonal rainbow when N ≤ K), Quilt Maker (4-colour tiling
  has C twice per row though — conflict for N ≥ 4), S3 if C = green (only weakly).*
- *Conflicts with Kingdom(C), Flag Bearer(C), S1 in colour C, Stripe Painter* (a C stripe kills every lantern
  in that row and all columns), *Best Friends(C, ·)* (checkerboard has many C per row).
- *Upgrade option:* queens instead of rooks (no two on a diagonal either) — still visual, harder.

**Random grids.** 0.3–1.0 / 5 (N=5). Very low, yet fully reachable.

---

## 13. Wallpaper Weaver (repeating motif)

**Kid summary.** You love wallpaper that repeats. Each cell whose colour is the same as the cell
`p` steps to its right (or below, depending on your draw) earns a point.

**Requires:** `Colour Eq`; period p=3 needs `MinSize 4` (otherwise only p=2 is sampled).

**Definition.** Parameters: period `p ∈ {2, 3}` (clipped to N−1 for N=3), direction `d ∈ {right, down}`.
Score = number of cells `(r,c)` with `col(r,c) === col(r + p·dr, c + p·dc)` inside the grid.
Max = N(N−p).

```ts
let s = 0;
for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
  const r2 = r + p*dr, c2 = c + p*dc;
  if (r2 < N && c2 < N && col(r,c) === col(r2,c2)) s++;
}
return s;
```

**Why visual.** Spot the repeating pattern / stamp.

**Interactions.**
- *Period 2 + period 3 (same direction):* the only grids that max both have period 1 in that direction
  (solid lines). Two wallpaper gods are forced into **Stripe Painter's** picture — a surprising three-way
  alliance from a "conflict".
- *p=2 aligns with Best Friends* (checkerboards repeat every 2), *p=3 aligns with Rainbow Road on RGB*
  (R G B R G B), *p = K aligns with Rainbow Road in general* (only when K ≤ N−1).
- *Conflicts with Lantern Lighter, Fair Weaver (for p=2 in K≥3 palettes, repeats starve colours).*
- Degenerate: monochrome maxes it — punished by Feud, Best Friends, Rainbow, Fair, Quilt, Mixer.

**Random grids.** ≈ 1/K of max: 5.0 / 15 (K=3, N=5, p=2). Generous; cube the fraction if needed.

---

## Subset-only rules (added after the capabilities addendum)

## 14. Sunset Sky (gradient columns)

**Kid summary.** You paint sunsets. A column is a sunset when, reading top to bottom, the colours only
ever move one step along the rainbow (or stay the same), never backwards, and it uses at least three colours.

**Requires:** `Spectral` (no `Wheel` needed: a sunset never wraps). `MinSize 3` holds always.

**Definition.** Parameter: direction `d ∈ {top→bottom, bottom→top, left→right, right→left}`.
A line (column for vertical d) counts if every consecutive step goes from colour index i to i or i+1
and the line contains ≥ 3 distinct colours. Score = number of such lines. Max = N.

```ts
let s = 0;
for (const line of linesInDirection(d)) {
  let ok = true;
  for (let i = 1; i < N; i++) { const step = line[i] - line[i-1]; if (step < 0 || step > 1) ok = false; }
  if (ok && new Set(line).size >= 3) s++;
}
return s;
```

**Why visual.** A sky going red → orange → yellow, with no jumps.

**Interactions.**
- *Aligns with row Stripe Painter* (stripes R, O, Y, G … stacked in order make every column a sunset —
  same edit, two happy gods) and with *left-right Mirror Quilt*, *Flag Bearer (rows)* for the stripe
  colours, and *Rainbow Road (down)* on the stepping cells.
- *Two Sunset gods:* top→bottom vs bottom→top are pure enemies; top→bottom vs left→right both love the
  diagonal gradient `col = floor((r + c)/2)` style ramps — an "aurora" treaty.
- *Conflicts with column Stripe Painter, Best Friends (jumps back and forth), Quilt Maker, Fair Weaver
  (for N > K a sunset must repeat colours), Lantern Lighter.*
- *Versus Rainbow Road on non-Wheel palettes:* both want +1 steps, but Rainbow Road needs strictly +1,
  Sunset allows "stay", so Sunset is the more relaxed partner.

**Random grids.** Essentially 0 for N ≥ 4 (each step has probability 2/K of being OK and ≥ 3 colours is needed).

## 15. Colour Wheel Harmony (complementary pairs)

**Kid summary.** Opposite colours on the colour wheel (red–green, orange–blue, yellow–violet) make each
other pop. Every time two opposites touch, you get a point.

**Requires:** `Wheel` with an even number of colours (rainbow6; NEW `Opposites` if the architect wants
RGBY treated as R–G, Y–B).

**Definition.** Score = number of orthogonally adjacent pairs whose colours are opposite on the wheel
(index difference K/2). Parameter (optional): a favourite opposite pair counts double.

```ts
let s = 0;
for (each adjacent pair (p, q)) if ((col(p) - col(q) + K) % K === K / 2) s += favourite(col(p), col(q)) ? 2 : 1;
return s;
```

**Why visual.** "Pop" seams between opposite colours.

**Interactions.**
- *Aligns with Best Friends when the friend pair happens to be complementary* (R/G checkerboard maxes
  both); otherwise Harmony is the generalist that likes *any* of three checkerboards, so it can ally with
  any Best Friends god whose pair is complementary and rivals the others.
- *Aligns with S2 Patchwork* (opposites are never equal).
- *Conflicts with Rainbow Road* (neighbours differ by 1, never by 3), *Sunset Sky*, *Colour Mixer*
  (parents R+Y and their mix O are all adjacent on the wheel, never opposite), and every clumper.

**Random grids.** 1/6 of pairs: ≈ 6.7 / 40 (N=5). Monochrome scores 0.

## 16. Warm Hearts (suits wear matching colours)

**Kid summary.** Hearts and diamonds are warm, so they should wear warm colours (red, orange, yellow);
spades and clubs are cool, so they wear cool colours (green, blue, violet). Each correctly dressed card
earns a point.

**Requires:** `Suited` (cards) and `Spectral` (warm = first half of the spectral order, cool = second
half; RGB puts G with the warm half or splits by a sampled cut).

**Definition.** Parameter: `flip ∈ {false, true}` (some gods want the opposite: "cold-hearted").
A card is dressed right if `(suit ∈ {♥, ♦}) === (colourIndex < K/2)` (XOR flip). Score = number of
dressed cards, plus 1 per adjacent pair of dressed cards with the same suit and colour ("matching outfits").

**Why visual.** Red-suit cards on warm cells, black-suit cards on cool cells: a two-tone quilt.

**Interactions.**
- Warm Hearts vs Cold-hearted (flip) are pure enemies cell by cell, but either one only constrains the
  *pair* (suit, colour half), so a painter (Best Friends, Rainbow Road) can keep their colours while the
  card gods swap suits: a natural "you paint, I'll deal" alliance.
- *Conflicts with Colour-by-Number* when both dictate colour from the symbol.

**Random grids.** ≈ N²/2 + noise (half the cells are dressed by chance) — needs the cube or a
"(score − N²/2)" baseline; included as a cross-lens hook rather than a top pick.

---

## Interaction web (summary)

Rows/columns use: BF Best Friends, SP Stripe Painter, RR Rainbow Road, QM Quilt Maker, CM Colour Mixer,
FB Flag Bearer, FW Fair Weaver, CN Colour-by-Number, MQ Mirror Quilt, KG Kingdom, FF Feuding Families,
LL Lantern Lighter, WW Wallpaper Weaver. `+` align, `−` conflict, `±` depends on draw/size, `·` weak.

|    | S1 | S2 | S3 | BF | SP | RR | QM | CM | FB | FW | KG | FF | LL |
|----|----|----|----|----|----|----|----|----|----|----|----|----|----|
| BF | −  | +  | ·  | ±  |    |    |    |    |    |    |    |    |    |
| SP | +  | −  | ·  | −  | −(o)|   |    |    |    |    |    |    |    |
| RR | −  | +  | ·  | −  | −  | +  |    |    |    |    |    |    |    |
| QM | −  | +  | ·  | −  | −  | −  |    |    |    |    |    |    |    |
| CM | ±  | ·  | ±  | −  | +  | ±  | ·  | ±  |    |    |    |    |    |
| FB | +  | −  | ±  | −  | +  | −  | −  | −  | ±  |    |    |    |    |
| FW | −  | +  | −  | −  | −  | +  | +  | ·  | −  |    |    |    |    |
| CN | +  | −  | ±  | ·  | ·  | ·  | ·  | ·  | ·  | ·  |    |    |    |
| MQ | ±  | ·  | ·  | ±N | +  | −  | −  | ·  | ·  | ·  |    |    |    |
| KG | +  | −  | ±  | −  | +  | −  | −  | −  | +  | −  | ±  |    |    |
| FF | +  | −  | ·  | −  | +  | ±  | ·  | +  | +  | −  | +  | ±  |    |
| LL | −  | +  | ·  | −  | −  | +  | ±  | ·  | −  | +  | −  | ·  | +  |
| WW | ±  | ·  | ·  | +  | +  | ±  | −  | ·  | ·  | −  | ·  | ·  | −  |

Two broad camps emerge — **Clumpers** (S1, SP, FB, KG, FF) and **Mixers/Alternators** (S2, BF, RR, QM,
FW, LL) — and the cross-camp rules (CM, MQ, WW, CN) are the swing votes, whose alliances change with
the sampled colours, period or room size. That is the "rich web of partial overlap" we want.

---

## Best 3 from my lens

1. **Feuding Families + Colour Mixer (pair design).** Feud wants X and Y big and apart; Mixer wants the
   mixed colour sandwiched between its parents. When the draws line up (red/yellow feud, orange mixer)
   the same frontier pleases both; when they don't, the frontier is fought over. The min() in Feud kills
   the monochrome exploit. (Mixer needs `Mixable`, so rainbow rooms only; Feud is generic.)
2. **Rainbow Road.** Cyclic +1 stepping is understandable to a child, works in every palette, and has a
   shared masterpiece (the diagonal rainbow) for right/down draws, plus a trap (identical rows) that
   helps one and starves the other. It sits in the Alternator camp with S2 and Fair Weaver.
3. **Best Friends (checkerboard).** It is the cleanest partner for seed S2 (one checkerboard with one
   symbol maxes both), the exact opposite of S1, and with shared or disjoint colour pairs it makes
   alliances or border wars. Mirror Quilt makes it size-dependent.
   (Close runner-up: **Lantern Lighter**, the cheap "renter" god that needs only N cells.)

## Cross-lens ideas I noticed but didn't develop

- **Symbol-gated colour rules:** "Best Friends, but only seams between *equal* symbols count" bridges
  S2 and colour, and makes symbol-copying gods relevant to painters.
- **Card suits as a second colouring:** treat ♥♦ as "warm" and ♠♣ as "cool" for a *shape* checkerboard
  that must agree or disagree with the paint checkerboard (two overlaid patterns).
- **Picture Frame / Fried Egg:** border cells colour C, centre colour D; nests inside Kingdom.
- **Colour-weighted sums:** S1-like line sums where each colour multiplies value by its rainbow index —
  an economics bridge between digit gods and painters.
- **Gradients by value:** rainbow order should follow symbol size (small numbers red, big numbers violet)
  — a continuous cousin of Colour-by-Number that tolerates near misses.
- **Diagonal versions** of Best Friends / Rainbow Road (king adjacency) to give diagonal-lens gods a colour hook.
- **Calibration:** several rules give ~1/K of max on random grids (Rainbow Road, Mirror, Wallpaper,
  Colour-by-Number); cubing the fraction (as in `int.ts`) would bring them in line with "random is worthless".
