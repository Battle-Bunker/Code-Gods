# Grid utilities: the GEOMETRY & TOPOLOGY lens

Conventions used below:
- `g[r][c] = {s, c}`, `0 <= r, c < N`. `nbrs(r,c)` = the 4 orthogonal neighbours inside the grid.
- `comps(pred)` = the 4-connected components (flood-fill) of the cells where `pred(r,c)` holds, as arrays of `[r,c]`.
  Many rules share this one helper. It is about 8 lines, so the rule bodies below stay short.
- **Colour parameters**: "your colour C" is sampled uniformly from the room's colour set, so it is always valid
  (RGB, RGBY and rainbow all have at least 3 colours). "Two colours A and B" means two distinct draws.
  None of these rules names a rainbow-only colour, so every rule works for every colour set.
- **Symbol parameters**: "your symbol S" is sampled uniformly from the room's symbol set. For cards, a rule can
  sample a *rank* (matching any suit) so that the odds stay close to the digit sets. Each rule says which it uses.
- Random-grid numbers come from a 4,000-grid Monte Carlo (script at `.../scratchpad/grid/geo/sim.py`),
  reported as "mean at N=5 with 3 colours / 6 colours" unless stated otherwise.
- Colour index `ci(c)` is the position in the room's colour list (R,G,B / R,G,B,Y / R,O,Y,G,B,V). Only Rainbow Bands uses it.

---

## 1. Bridge Builder
**Kid summary.** You build bridges. Make a path of your colour that goes all the way from the left edge to the right edge.

**Requires:** `Eq` colours. Fully generic. (`MinSize` is not needed: at N=3 a bridge is just 3 cells.)

**Definition.** Parameters: colour C and direction D ∈ {left-right, top-bottom}. Take the 4-connected blobs of colour C.
The score is the number of distinct columns (rows if D is top-bottom) that the best blob touches. A blob that touches all N gets double points (2N).

```ts
let best = 0;
for (const blob of comps((r,c) => g[r][c].c === C)) {
  const span = new Set(blob.map(([r,c]) => D === "LR" ? c : r)).size;
  best = Math.max(best, span);
}
return best === N ? 2 * N : best;
```
**Why it's visual.** You can trace the bridge with a finger. Either it crosses or there is a visible gap.

**Interactions.**
- *Aligns with* Snake Charmer when both use the same colour (a snake that crosses the grid is also a bridge), with seed rule 1 (a
  straight one-colour row is the cheapest bridge, and it also scores row sums), and with Zebra when D runs along the stripes.
- *Conflicts with* Archipelago when both use the same colour: a bridge merges islands, and each merge costs the island counter. It
  also conflicts with Castle Keeper when D is top-bottom and the castle wall is a different colour, because a crossing
  bridge cuts through the moat. It conflicts with Chessmaster, since a checkerboard has no same-colour orthogonal path at all.
- Two Bridge Builders with **different colours and perpendicular directions** are in strict topological conflict (Hex!):
  on a square grid with 4-adjacency, a left-right C₁ path and a top-bottom C₂ path cannot both exist. Gods who draw this
  have to negotiate, and so they do not end up merely tolerating each other.

**Random grid.** About 2.7 out of 2N=10 (3 colours) and 1.5 (6 colours). A full crossing happens rarely by chance.
**Degenerate.** Painting one straight row gives the maximum for only N edits. That is cheap, but the row is a single strip that other
gods can cut easily. Archipelago and Chessmaster punish whole-grid flooding.

---

## 2. Looking-Glass
**Kid summary.** You love reflections. Every cell should match its twin on the other side of your mirror line.

**Requires:** `Eq` colours, or `Eq` symbols when X = symbol (cards compare rank). Generic. With `Suited`, X can also be suit.

**Definition.** Parameters: an axis A ∈ {vertical, horizontal, main diagonal, anti-diagonal} and an attribute
X ∈ {colour, symbol}. The score is the number of mirror *pairs* (cells off the axis, each pair counted once) whose X matches.
For symbol matching with cards, compare rank only. Maximum is N(N−1)/2 for the diagonals, and N·⌊N/2⌋ for the other two axes.

```ts
const m = { V: (r,c)=>[r,N-1-c], H: (r,c)=>[N-1-r,c], D: (r,c)=>[c,r], A: (r,c)=>[N-1-c,N-1-r] }[A];
let s = 0;
for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
  const [r2,c2] = m(r,c);
  if (r*N+c < r2*N+c2 && g[r][c][X] === g[r2][c2][X]) s++;
}
return s;
```
**Why it's visual.** Fold the picture along the line in your head and check whether it lands on itself.

**Interactions.**
- *Aligns with* Pinwheel (4-fold rotational symmetry implies both diagonal mirrors are about half satisfied, and full D4
  symmetry satisfies every Looking-Glass), Bullseye (rings are symmetric about every axis), and Rainbow Bands
  (anti-diagonal bands are symmetric under the main-diagonal mirror).
- *Conflicts with* Bridge Builder in a subtle way: a vertical mirror is happy with a left-right bridge, but a horizontal mirror forces a
  second, mirrored bridge. Two Looking-Glass gods with different axes are only *partly* aligned, because the vertical and
  horizontal mirrors together force 180° rotational symmetry. It conflicts with **symbol** mirrors when seed rule 2 is in play. Seed 2 wants
  same-symbol regions with alternating colours, while a colour mirror on the same axis forces each mirrored pair
  next to the axis (c and N−1−c with N even) to have the *same* colour.
- A colour mirror and a symbol mirror on the same axis align fully, because one copy edit satisfies both.

**Random grid.** About 1/k of the maximum (3.3 out of 10 at N=5 with 3 colours). That baseline is rather high. The **stricter variant** counts only rows
(or columns) that are *fully* palindromic. It has a near-zero baseline and is still easy to see.
**Degenerate.** A single-colour grid satisfies every colour mirror. Zebra's "adjacent stripes differ" rule, Chessmaster and
Archipelago all punish it.

---

## 3. Pinwheel
**Kid summary.** Spin the grid a quarter turn. It should look exactly the same.

**Requires:** `Eq` on the chosen attribute. Generic. With `Suited`, sample X = suit (see also Card Windmill, rule 17). With `HasCentre` the centre cell is ignored; with `Even` there is no centre at all.

**Definition.** Parameter: attribute X ∈ {colour, symbol (cards: suit, which works well here)}. Cells fall into orbits of 4 under
90° rotation (the centre cell of an odd grid is ignored). The score is the number of orbits whose four cells all share X. The maximum is ⌊N²/4⌋.

```ts
let s = 0;
for (let r = 0; r < Math.floor(N/2); r++) for (let c = 0; c < Math.ceil(N/2); c++) {
  const o = [[r,c],[c,N-1-r],[N-1-r,N-1-c],[N-1-c,r]].map(([a,b]) => g[a][b][X]);
  if (o.every(v => v === o[0])) s++;
}
return s;
```
**Why it's visual.** The four corners match, then the four "next to corner" cells, and so on. The result looks like a windmill or a snowflake.

**Interactions.**
- *Aligns with* Bullseye completely (every ring pattern is a pinwheel), with both diagonal Looking-Glass rules once the pattern is also
  mirror-symmetric, and with Fence Painter (an all-C border is 1-3 complete orbits per ring).
- *Conflicts with* Zebra (horizontal stripes are never invariant under a quarter turn unless every stripe has the same colour, and
  then Zebra scores 1). It also conflicts with Bridge Builder (a single left-right bridge rotates into a top-bottom one, so
  a Pinwheel forces a *cross*, and the cross then blocks every other colour's crossing) and with Tetromino Tamer for asymmetric
  pieces (L and S islands have to come in rotated sets of four).

**Random grid.** 0.23 out of 6 (N=5, 3 colours) and 0.03 (6 colours). The baseline is very low.
**Degenerate.** A monochrome grid gets the maximum, which is the same issue as Looking-Glass and is answered by the same counter-rules.

---

## 4. Archipelago
**Kid summary.** You love islands. Make as many separate little islands of your colour as you can.

**Requires:** `Eq` colours. Generic.

**Definition.** Parameter: colour C. The score is the number of 4-connected components of colour C. Diagonal touching does *not* join
two islands. The maximum is ⌈N²/2⌉ (a checkerboard of C).

```ts
return comps((r,c) => g[r][c].c === C).length;
```
**Why it's visual.** Count the blobs.

**Interactions.**
- *Aligns with* Chessmaster when C is one of its two colours (every checkerboard cell is its own island), and with seed rule 2 (its
  regions require no two adjacent cells to share a colour, which is exactly the "break up the blobs" pressure).
- *Conflicts with* Bridge Builder and Snake Charmer on the same colour, which want one long merged body. It conflicts with Castle Keeper
  (a wall must be connected to enclose anything) and with seed rule 1 (straight same-colour runs merge islands).
- There is also a nice *self-conflict* between gods who both draw Archipelago with different colours. They share the board, and
  each island of yours is a piece of sea for them.

**Random grid.** 4.1 out of 13 (N=5, 3 colours), and 7.4 out of 25 at N=7. The baseline is fairly high, so a calibrated version could count only
*single-cell* islands ("stepping stones") or use count². The structure is still clearly visible at the maximum.
**Degenerate.** A checkerboard is the unique shape of the maximum, and it is fine as a target because it is visually striking.

---

## 5. Castle Keeper
**Kid summary.** You build castle walls of your colour. Every cell trapped inside your walls, where water from the edge can't reach, is a point.

**Requires:** `Eq` colours. Generic. Below N=4 the most a castle can enclose is 1 cell, so `MinSize 4` is recommended for the treasure variant.

**Definition.** Parameter: wall colour W. Start a flood from every border cell that is not W, moving 4-neighbour through non-W cells.
Any non-W cell that the flood never reaches is *enclosed*, and the score is the number of enclosed cells. Diagonal gaps in a wall do *not* leak
(the water moves orthogonally). The maximum is (N−2)², reached by a full border ring of W.

```ts
const wet = new Set(), st = [];
for (let r = 0; r < N; r++) for (let c = 0; c < N; c++)
  if ((r===0||c===0||r===N-1||c===N-1) && g[r][c].c !== W) { wet.add(r*N+c); st.push([r,c]); }
while (st.length) { const [r,c] = st.pop();
  for (const [a,b] of nbrs(r,c)) if (g[a][b].c !== W && !wet.has(a*N+b)) { wet.add(a*N+b); st.push([a,b]); } }
let s = 0;
for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (g[r][c].c !== W && !wet.has(r*N+c)) s++;
return s;
```
**Variant (two colours).** Count only enclosed cells of a sampled *treasure* colour T ≠ W. This version is more social, because the interior is
someone else's playground.

**Why it's visual.** You see a moat or a wall drawn around a patch. Water from the outside can't get in.

**Interactions.**
- *Aligns with* Fence Painter (same colour: the best castle is a painted border), Bullseye (the outer ring of a bullseye is a castle
  wall), and *any* rule that wants structure in the interior, since a castle never cares what is inside. So Castle Keeper is a natural
  partner for Chessmaster, Tetromino Tamer and seed rule 2, which can all live inside the walls.
- *Conflicts with* Bridge Builder for another colour, which must cut the wall to cross, and with Zebra (a stripe of the
  wall colour is not a ring). It conflicts with Archipelago on W, which wants the wall broken into pieces, and with Snake Charmer on W
  (a snake can't close a loop).
- It also gives a concrete political fact: a single cell edit in the wall by an enemy zeroes the whole castle, so a castle is fragile and worth
  negotiating over.

**Random grid.** 0.10 at N=5 with 3 colours, 0.0 with 6 colours, and 0.33 at N=7 with 3 colours. The baseline is essentially zero.
**Degenerate.** Repainting the whole border is 4N−4 edits. That is real work, and it is very easy for others to break.

---

## 6. Bullseye
**Kid summary.** You want a target. The outside ring is one colour, the next ring in is one *different* colour, and so on toward the middle.

**Requires:** `Eq` colours. Generic, and it does *not* need `HasCentre`: on `Even` grids the innermost ring is the central 2×2 block, which works the same way. Optional upgrade with `Spectral`: rings must also *step up* the rainbow from outside to centre (the "sunset target"), which gives a stricter, prettier rule. Without `Spectral` it falls back to "differ from the next ring".

**Definition.** No parameter (or an optional sampled outer colour). Rings are numbered by `k = min(r, c, N−1−r, N−1−c)`, from 0 at the border
inward. Starting from ring 0, count consecutive rings that are monochrome *and* differ in colour from the ring outside them. Stop at the first failure.
The maximum is ⌈N/2⌉ (a 5×5 grid has 3 rings: the border, the inner frame and the centre cell).

```ts
let s = 0, prev = null;
for (let k = 0; k < Math.ceil(N/2); k++) {
  const cols = new Set();
  for (let r = k; r < N-k; r++) for (let c = k; c < N-k; c++)
    if (Math.min(r, c, N-1-r, N-1-c) === k) cols.add(g[r][c].c);
  if (cols.size !== 1 || cols.has(prev)) break;
  prev = [...cols][0]; s++;
}
return s;
```
**Why it's visual.** Concentric squares, like an archery target.

**Interactions.**
- *Aligns with* Pinwheel and every Looking-Glass axis (rings are fully D4-symmetric), with Castle Keeper (ring 0 is a wall), and with
  Fence Painter if its colour is used for ring 0.
- *Conflicts with* Zebra and seed rule 1's long straight lines (rows cut through rings of different colours), with Bridge Builder for any
  colour other than ring 0's (a crossing breaks rings), and with Rainbow Bands (diagonal bands against square rings).
- Because every ring must differ from its neighbour, a monochrome grid scores only 1. This rule therefore helps punish flood-fill.

**Random grid.** About 0.00. Ring 0 has 4N−4 cells, so it is almost never monochrome by chance.
**Degenerate.** The rule is all-or-nothing from the outside in, which may be harsh. A softer version scores each monochrome ring
independently.

---

## 7. Zebra
**Kid summary.** You love stripes. Each row should be one colour, and the next row a different colour.

**Requires:** `Eq` colours. Generic. Optional upgrade with `Spectral`: stripes must run in rainbow order (R,O,Y,...), and with `Wheel` they may wrap around (V then R).

**Definition.** Parameter: orientation O ∈ {rows, columns}. The score is the number of lines (rows or columns) that are monochrome *and* whose colour differs from
the previous line's colour (the first line only needs to be monochrome). The maximum is N.

```ts
const line = i => Array.from({length: N}, (_, j) => O === "rows" ? g[i][j].c : g[j][i].c);
let s = 0;
for (let i = 0; i < N; i++) {
  const L = line(i);
  if (L.every(x => x === L[0]) && (i === 0 || line(i-1)[0] !== L[0])) s++;
}
return s;
```
**Why it's visual.** You either see stripes or you don't.

**Interactions.**
- *Aligns with* seed rule 1 very strongly (every stripe is a full-length same-colour line, so it maximises row sums for whoever wants that colour),
  with Bridge Builder when the bridge runs along the stripes, and with Looking-Glass on the axis perpendicular to the stripes if the stripe sequence
  is a palindrome.
- *Conflicts with* Zebra in the other orientation (rows against columns: they can only coexist on a monochrome grid, which then
  scores 1 for each). It conflicts with Pinwheel and Bullseye, with Bridge Builder in the perpendicular direction (each stripe blocks every other colour),
  and with Castle Keeper.
- Against seed rule 2: inside a stripe every horizontal neighbour shares a colour, so seed-2 regions can only run *across* stripes.
  That is a partial overlap, and it is interesting.

**Random grid.** 0.05 at N=5 with 3 colours, and about 0 with 6 colours.
**Degenerate.** None. Monochrome scores 1.

---

## 8. Chessmaster
**Kid summary.** You love checkerboards in your two colours. Every 2×2 square that looks like a little chessboard scores a point.

**Requires:** `Eq` colours. Generic.

**Definition.** Parameters: two distinct colours A and B. The score is the number of 2×2 windows whose diagonals are A/A and B/B (in either
arrangement). The maximum is (N−1)², for a perfect A/B checkerboard.

```ts
let s = 0;
for (let r = 0; r < N-1; r++) for (let c = 0; c < N-1; c++) {
  const p = g[r][c].c, q = g[r][c+1].c;
  if (new Set([p,q]).size === 2 && [p,q].every(x => x === A || x === B)
      && g[r+1][c+1].c === p && g[r+1][c].c === q) s++;
}
return s;
```
**Why it's visual.** A chessboard pattern pops out at once.

**Interactions.**
- *Aligns with* Archipelago on A or B (a checkerboard is all single-cell islands), with seed rule 2 (orthogonal neighbours always differ, so seed-2 regions
  form freely if the symbols match), with both diagonal Looking-Glass rules, and with Pinwheel when N is odd (for even N the
  checkerboard is only 180°-symmetric under colour, which is a fun "almost" alignment).
- *Conflicts with* Bridge Builder, Snake Charmer, Zebra, Bullseye, Castle Keeper and seed rule 1. All of these want same-colour orthogonal
  runs, and a checkerboard has none.
- A second Chessmaster with colours {A, C} is half aligned. The two can share the A diagonals but fight over the other squares.

**Random grid.** 0.39 out of 16 (N=5, 3 colours) and 0.03 (6 colours).
**Degenerate.** None. The perfect checkerboard *is* the structure.

---

## 9. Snake Charmer
**Kid summary.** You charm snakes. Build the longest wiggly snake of your colour, one cell wide with no branches and no loops.

**Requires:** `Eq` colours. Generic.

**Definition.** Parameter: colour C. Among the 4-connected blobs of colour C, keep only those that form a simple path: every cell has at most 2
same-blob neighbours, and the edge count equals the cell count minus 1. The score is the size of the longest such blob. A 2×2 square of C
is *not* a snake (it is a loop), and a "T" shape is not a snake either (it branches).

```ts
let best = 0;
for (const blob of comps((r,c) => g[r][c].c === C)) {
  const deg = blob.map(([r,c]) => nbrs(r,c).filter(([a,b]) => g[a][b].c === C).length);
  const edges = deg.reduce((x,y) => x+y, 0) / 2;
  if (Math.max(...deg) <= 2 && edges === blob.length - 1) best = Math.max(best, blob.length);
}
return best;
```
**Why it's visual.** You see one coloured snake winding through the grid. A fat blob or a fork is clearly not a snake.

**Interactions.**
- *Aligns with* Bridge Builder on the same colour (a snake can be a bridge, though the best snakes wind back and forth), and with a
  Castle Keeper *treasure* variant (the snake can live inside). It also aligns with seed rule 1 in short straight sections.
- *Conflicts with* Castle Keeper on the same colour, because closing the wall makes a loop and the snake score drops to 0. It conflicts with
  flood-style blob rules ("largest region of my colour"), since a blob is not a snake, and with Archipelago on the same colour (one snake against
  many islands). It also conflicts with Chessmaster.
- The interesting edit: one cell can turn a 20-cell snake into a loop or a fork worth 0. A neighbour god's harmless-looking
  "fill this gap with your colour" becomes a betrayal.

**Random grid.** 2.7 at N=5 with 3 colours, and 1.8 with 6 colours. The maximum is about N²/2 + N (a serpentine with one-cell gaps), for example about 15 at N=5.
**Degenerate.** None. Monochrome scores 0 for N ≥ 2.

---

## 10. Tetromino Tamer
**Kid summary.** You collect Tetris pieces. Every island of your colour that is exactly the shape of your piece is a point.

**Requires:** `Eq` colours, `MinSize 4` when P = I (at N=3, sample from O,T,L,S only). Generic otherwise.

**Definition.** Parameters: colour C and a piece P ∈ {I, O, T, L, S} (N=3 excludes I; an I-tromino could stand in). Rotations and mirror images count. The score is the number of
4-connected C-blobs that are exactly P. A blob that is too big doesn't count, so pieces must not touch along an edge. Normalise each 4-cell blob by trying the 8 symmetries,
translating to the origin, sorting, and comparing against P's canonical form.

```ts
const canon = cells => Math.min(...SYMS.map(f => {               // SYMS: the 8 maps (r,c)→(±r/±c, swapped or not)
  const t = cells.map(([r,c]) => f(r,c)); const r0 = Math.min(...t.map(x=>x[0])), c0 = Math.min(...t.map(x=>x[1]));
  return Number(t.map(([r,c]) => (r-r0)*4 + (c-c0)).sort((a,b)=>a-b).join(""));  }));
return comps((r,c) => g[r][c].c === C).filter(b => b.length === 4 && canon(b) === canon(P)).length;
```
**Why it's visual.** Kids recognise Tetris pieces instantly.

**Interactions.**
- *Aligns with* Archipelago on the same colour (each piece is an island), with Castle Keeper as a treasure (put the pieces inside the walls), and with
  Pinwheel when four rotated pieces are arranged as a pinwheel (very pretty when P = L or S).
- *Conflicts with* Bridge Builder and Snake Charmer on the same colour (an I piece is a short snake, but a longer snake is no longer an I),
  and with Zebra and seed rule 1 (a full row of C is a blob of size N, not a piece). Two Tamers with the same colour and different pieces conflict directly,
  because they compete for the same cells.

**Random grid.** Close to 0 for most pieces. A random blob of exactly 4 cells with the right shape is rare (well under 0.3 at N=7 with 3 colours).
The maximum is about N²/5 to N²/6 (for example 4 pieces at N=5, and 7 to 8 at N=7).
**Degenerate.** None.

---

## 11. Rainbow Bands
**Kid summary.** You paint rainbows diagonally from your corner. Each slanted line from your corner gets the next colour in the list.

**Requires:** `Spectral` colours (the band order follows the rainbow). `Wheel` is not needed, because `d mod k` already repeats the cycle and that looks fine either way. On a non-Spectral set the default method would use the room's listing order, but that is arbitrary and kids can't see it, so I recommend requiring `Spectral`.

**Definition.** Parameter: a corner K. Distance from K is `d = (r or N−1−r) + (c or N−1−c)`. A diagonal line (all cells at the same d) is *correct* if
every cell on it has colour index `d mod k`, where k is the size of the colour set. The score is the total number of cells on correct lines. The maximum is N².

```ts
const d = (r,c) => (K.bottom ? N-1-r : r) + (K.right ? N-1-c : c);
let s = 0;
for (let t = 0; t <= 2*(N-1); t++) {
  const line = []; for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (d(r,c) === t) line.push(g[r][c].c);
  if (line.every(x => ci(x) === t % k)) s += line.length;
}
return s;
```
**Why it's visual.** You see slanted rainbow stripes running from one corner, which is especially nice with the 6-colour rainbow set. With RGB it is a repeating R-G-B diagonal tartan.

**Interactions.**
- *Aligns with* the Looking-Glass mirror across the other diagonal (bands from the top-left corner are symmetric under the main-diagonal mirror (r,c)→(c,r)), with
  another Rainbow Bands player using the *opposite* corner when (2N−2) mod k = 0 (the bands coincide), and with seed rule 1 on
  diagonals if diagonal lines are counted.
- *Conflicts with* Zebra, Bullseye, Pinwheel (diagonal bands are not quarter-turn symmetric), Bridge Builder (with only 3 colours, no orthogonal same-colour
  pair exists in a band pattern), and Castle Keeper. It conflicts with a Rainbow Bands player at an *adjacent* corner (their bands cross yours at 90°).
- Chessmaster with a 2-colour pattern is unrelated, except that both forbid orthogonal same-colour neighbours.

**Random grid.** About 1.5 out of 25 (N=5, 3 colours) and 0.5 (6 colours). Almost all of this comes from the lucky 1-cell corner line.
**Degenerate.** None.

---

## 12. Fence Painter
**Kid summary.** You paint fences. The outside edge of the grid should be your colour, and the inside should not be.

**Requires:** `Eq` colours. Generic. For N=3 the interior is a single cell.

**Definition.** Parameter: colour C. The score is (border cells of colour C) − (interior cells of colour C). The maximum is 4N−4, and the score can go negative.
For N=3 the interior is just the centre cell.

```ts
let s = 0;
for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (g[r][c].c === C)
  s += (r===0 || c===0 || r===N-1 || c===N-1) ? 1 : -1;
return s;
```
**Why it's visual.** You see a coloured picture frame with the frame colour kept out of the middle.

**Interactions.**
- *Aligns with* Castle Keeper on the same colour (perfectly), with Bullseye's ring 0, with Pinwheel, and with every Looking-Glass axis.
- *Conflicts with* a Bridge Builder of another colour (a bridge must touch two borders, which steals fence cells), with Zebra (the top and bottom stripes would
  have to be C), and with any rule that wants C inside: Archipelago on C, Tetromino Tamer on C, and the seed rule "green 1s" if C is green.
  Note that the *treasure* variant of Castle Keeper wants something inside, which is a perfect division of labour.

**Random grid.** About +2.3 at N=5 with 3 colours. At N=7 it is slightly negative (the interior outnumbers the border).
**Degenerate.** None. Monochrome is strongly negative for N ≥ 5.

---

## 13. Constellation
**Kid summary.** Your lucky symbol makes star patterns. Make the biggest cluster of your symbol, where touching corners counts too.

**Requires:** `Eq` symbols. Generic. With `Suited`, sample S as a rank (any suit), or as a suit for a much easier, bigger-cluster version.

**Definition.** Parameter: symbol S (for cards: a rank, any suit). Use **8-neighbour** connectivity (diagonals included). The score is the size of the largest
connected group of cells showing S, and colour is ignored. The maximum is N².

```ts
// comps8 = comps with 8-neighbour adjacency
return Math.max(0, ...comps8((r,c) => sameSym(g[r][c].s, S)).map(b => b.length));
```
**Why it's visual.** You can join up your symbol like a dot-to-dot drawing.

**Interactions.**
- *Aligns with* seed rule 2 (same-symbol regions, although seed 2 uses 4-adjacency and alternating colours, so a constellation made of a
  diagonal *line* gives seed 2 nothing). It aligns with seed rule 1 when the cluster is also a same-colour straight line, and with *any* colour
  rule, because it only cares about symbols. Colour gods and symbol gods can trade freely, and this is the main "orthogonal axis" in the lens.
- *Conflicts with* other symbol rules (another god's symbol S′ and seed rule 3's "1s" compete for the same cells) and with Looking-Glass on
  symbols when S's cluster sits off the axis.
- The 8-neighbour twist is deliberate. It is the *only* rule where a diagonal chain works, so it quietly disagrees with every
  4-neighbour rule about what "connected" means. That gives a good teaching moment.

**Random grid.** About 1 to 2 for base-10 at N=5, and about 1 for cards (a probability of 4/52 per cell).
**Degenerate.** Filling the grid with S gives N², but it also destroys the uniqueness space and every other symbol god's score. The engine's uniqueness constraint
allows only one monochrome-symbol grid per colour layout, which is a weak check. Other symbol rules are the real counterweight.

---

# Subset-only rules (added after the capabilities addendum)

## 14. Rainbow Road
**Kid summary.** You build rainbow roads. Walk from cell to cell (no diagonals), and each step must go to the *next* colour of the rainbow.

**Requires:** `Spectral` colours. Optional upgrade with `Wheel`: the road may wrap from V back to R, so it can run on and on.

**Definition.** A road is a 4-connected sequence of cells where each cell's colour index is one more than the previous cell's. The score is the
length of the longest road. Without `Wheel` the colour index strictly increases, so roads are at most k long. To make the score bigger, count *every* complete
road (a full R→…→last chain), where a cell may be used by several roads. With `Wheel` (rainbow6), the longest wrapping road is capped at N² and found by DP over length.
Default scoring (no Wheel): number of complete roads from the first colour to the last.

```ts
// ways[r][c] = number of roads that start at the first colour and end at (r,c)
const ways = g.map(row => row.map(x => ci(x.c) === 0 ? 1 : 0));
for (let i = 1; i < k; i++) for (let r = 0; r < N; r++) for (let c = 0; c < N; c++)
  if (ci(g[r][c].c) === i) ways[r][c] = nbrs(r,c).filter(([a,b]) => ci(g[a][b].c) === i-1)
                                                .reduce((s,[a,b]) => s + ways[a][b], 0);
let s = 0; for (const row of g.keys()) for (let c = 0; c < N; c++) if (ci(g[row][c].c) === k-1) s += ways[row][c];
return s;
```
(This is a single sweep in colour order, so it is correct with no `Wheel`.)

**Why it's visual.** You see a rainbow ribbon snaking across the grid.

**Interactions.** *Aligns with* Rainbow Bands (any path that moves away from the corner is a road), Paint Mixer (R-O-Y is a road segment
and also a mix recipe), and Snake Charmer *in spirit*, although the snake is a single colour. *Conflicts with* every single-colour blob rule (Bridge, Zebra,
Castle, seed 1): a road needs every neighbour step to change colour. It agrees with seed rule 2 on "neighbours differ in colour".

**Random grid.** With RGB the expected number of complete roads at N=5 is roughly 25·(1/3)·(4/3)·(4/3) ≈ 15, and many grids
have plenty of them. Requiring the rainbow6 colour set (k=6) gives about 25·(1/6)·(4/6)⁵ ≈ 0.5, which is good. **Recommend also requiring k ≥ 4** (NEW: `MinColours 4`),
or scoring the *longest* road only for RGB/RGBY.
**Degenerate.** Fully repeated diagonal Rainbow Bands maximise it. That is a pretty pattern, so it is fine.

---

## 15. Paint Mixer
**Kid summary.** You love mixing paint. An orange cell sitting right between a red and a yellow (in a straight line) is a perfect recipe!

**Requires:** `Mixable` (rainbow6 only).

**Definition.** For every secondary-colour cell M (orange, green or violet) with primaries P₁ and P₂ (red+yellow, yellow+blue, red+blue): it scores 1 if
its left and right neighbours are {P₁, P₂}, and 1 more if its up and down neighbours are {P₁, P₂}. No parameters.

```ts
const MIX = { orange: ["red","yellow"], green: ["yellow","blue"], violet: ["red","blue"] };
let s = 0;
for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
  const m = MIX[g[r][c].c]; if (!m) continue;
  const ok = (a, b) => a && b && new Set([a.c, b.c, ...m]).size === 2 && a.c !== b.c;
  if (ok(g[r][c-1], g[r][c+1])) s++;
  if (ok(g[r-1]?.[c], g[r+1]?.[c])) s++;
}
return s;
```
**Why it's visual.** You see colour "sandwiches": R-O-Y, Y-G-B, R-V-B.

**Interactions.** *Aligns with* Rainbow Road (R-O-Y and Y-G-B are road segments) and Rainbow Bands, *partly*. *Conflicts with* any primary-colour
blob rule (Bridge, Castle, Zebra on red, yellow or blue), because those want the primaries next to themselves and not next to a mix. It also conflicts with
Chessmaster (a 2-colour checkerboard contains no sandwich). A "plus" shape (both directions) is the high-value motif, and it fits neatly inside a Castle.

**Random grid.** Each secondary cell has a 1/6 chance per axis, so at N=5 that is about 25·(1/2)·2·(2/36)·(~0.7 interior factor) ≈ 1.0. The maximum is about N²/2 or so.
**Degenerate.** None.

---

## 16. Royal Court
**Kid summary.** Your king lives in the middle of the grid. Surround the centre with a palace of picture cards (J, Q, K), all joined together.

**Requires:** `Faced` symbols (cards) and `HasCentre` (N odd: 3, 5, 7). It degrades on `Even` grids by using any of the 4 centre cells.

**Definition.** If the centre cell isn't a face card, the score is 0. Otherwise the score is the size of the 4-connected region of face cards that contains the centre.
The score doubles if that region doesn't touch the border ("the palace is safe"). Optional parameter: a suit, so only face cards of your suit count.

```ts
const m = (N-1)/2, face = x => ["J","Q","K"].includes(rank(x.s));
if (!face(g[m][m])) return 0;
const blob = comps((r,c) => face(g[r][c])).find(b => b.some(([r,c]) => r===m && c===m));
const safe = blob.every(([r,c]) => r>0 && c>0 && r<N-1 && c<N-1);
return blob.length * (safe ? 2 : 1);
```
**Why it's visual.** Picture cards cluster in the middle like a palace.

**Interactions.** *Aligns with* Castle Keeper (put the court inside the walls, so the colour walls and the symbol palace coexist), Bullseye (any colours), and Pinwheel
on symbols. *Conflicts with* value-maximising card rules if Ace = 14 is the top value, with Constellation for a non-face rank, and with seed rule 3 (1s/Aces) for the centre cell.

**Random grid.** P(face) = 12/52 ≈ 0.23, so the centre is a face card 23% of the time, with a small region. The expected score is about 0.4 at N=5. The maximum is 2·(N−2)².
**Degenerate.** Filling the grid with face cards hits the uniqueness limits (12 face symbols × colours is still plenty), but the "safe" bonus keeps the border free.

---

## 17. Card Windmill
**Kid summary.** Turn the grid a quarter turn and every suit should move on one step: ♠ becomes ♥, ♥ becomes ♦, ♦ becomes ♣, ♣ becomes ♠.

**Requires:** `Suited` (cards). It is generic in size. A variant uses `Cyclic`/`Enum` on digit sets: each quarter turn adds 1 to the symbol.

**Definition.** For each 4-cell rotation orbit (as in Pinwheel), it scores 1 if the cells, taken in rotation order, show 4 consecutive suits in the cyclic order ♠♥♦♣. The maximum is ⌊N²/4⌋.

```ts
let s = 0; const SU = "♠♥♦♣";
for (let r = 0; r < Math.floor(N/2); r++) for (let c = 0; c < Math.ceil(N/2); c++) {
  const o = [[r,c],[c,N-1-r],[N-1-r,N-1-c],[N-1-c,r]].map(([a,b]) => SU.indexOf(suit(g[a][b].s)));
  if (o.every((v,i) => v === (o[0]+i) % 4)) s++;
}
return s;
```
**Why it's visual.** The four corners show four different suits that "spin" around the grid.

**Interactions.** *Conflicts with* Pinwheel on suit, which wants all four cells to share a suit: this is a direct, elegant opposition on exactly the same cells. *Aligns with* any colour rule
(it only touches suits) and with rank-based rules (rank is free). It aligns with Looking-Glass on rank, but on suit it conflicts with every mirror.

**Random grid.** (1/4)³·… ≈ 0.016 per orbit, so about 0.1 at N=5. The baseline is low.
**Degenerate.** None.

---

## 18. Colour Carousel
**Kid summary.** Walk around the outside edge of the grid. The colours should go round the rainbow wheel in order (red, orange, yellow, green, blue, violet, then red again), like a carousel.

**Requires:** `Wheel` colours (rainbow6) and `MinSize 4`. With `Spectral` but no `Wheel`, it degrades to scoring the longest run that only steps *up* in order, with no wrap.

**Definition.** Read the 4N−4 border cells clockwise from the top-left corner. A step scores if the next cell's colour is the *same or the next* colour on the wheel
(staying the same is allowed, so bands can be wide). The score is the number of scoring steps, counted around the full loop, *plus a bonus of N if every step scores and the
loop goes all the way round the wheel at least once*. Parameter: direction (clockwise or anticlockwise).

```ts
const ring = [];
for (let c = 0; c < N-1; c++) ring.push(g[0][c]);
for (let r = 0; r < N-1; r++) ring.push(g[r][N-1]);
for (let c = N-1; c > 0; c--) ring.push(g[N-1][c]);
for (let r = N-1; r > 0; r--) ring.push(g[r][0]);
if (DIR === "ccw") ring.reverse();
let s = 0, turn = 0;
ring.forEach((x, i) => { const d = (ci(ring[(i+1) % ring.length].c) - ci(x.c) + 6) % 6; if (d <= 1) s++; turn += d; });
return s === ring.length && turn >= 6 ? s + N : s;
```
**Why it's visual.** The border looks like a colour wheel, with the rainbow going round the frame.

**Interactions.** *Conflicts with* Castle Keeper, Fence Painter and Bullseye ring 0 directly. They all want the border in one colour, while the carousel wants it to cycle through every colour, so the fight is over the same cells. It also conflicts with Pinwheel, because a quarter turn shifts the border by N−1 cells and the colours no longer line up. *Aligns with* Rainbow Road (a border that changes colour at every step is a road), with Bridge Builder for colours whose band covers a whole side, and with interior-only rules (Chessmaster, Royal Court, Tetromino Tamer, Castle Keeper's treasure variant with an inner wall).
single-colour frame: a sharp conflict on the same cells). *Aligns with* Rainbow Road (the border is a road if each step changes colour), with Bridge Builder for colours whose band lies along a full side, and with interior-only
rules (Chessmaster, Royal Court, Tetromino). *Conflicts with* Pinwheel (a quarter turn would shift the colours, unless 6 | … they don't line up) and with Bullseye, whose ring 0 must be monochrome.

**Random grid.** Each step scores with probability 2/6, so about 5 out of 16+5 at N=5. To lower the baseline, count only steps that *advance* (d = 1), plus the full-loop bonus.
**Degenerate.** A monochrome border scores every step but has turn = 0, so it never gets the bonus. That is the reason the bonus needs a full lap.

---

## Interaction web (summary)
Two big camps form naturally, with bridges between them:

| | Blob camp (merge same colour) | Pattern camp (alternate / break) |
|---|---|---|
| Members | Bridge Builder, Snake Charmer, Zebra, Castle Keeper, seed 1 | Archipelago, Chessmaster, Rainbow Bands, seed 2 |
| Symmetry rules (neutral) | Pinwheel, Looking-Glass and Bullseye side with *structured* layouts of either camp | |
| Inside/outside split | Fence Painter + Castle Keeper own the border; Tetromino Tamer, Chessmaster and the treasure Castle want the interior | |
| Symbol axis | Constellation and seed rule 3 are mostly independent of all colour rules, so they act as trade partners | |

Notable *same-family* frictions that create politics: perpendicular Bridge Builders (Hex-like: they cannot both win),
Zebra in rows against Zebra in columns, Rainbow Bands from adjacent corners, two Archipelagos with different colours, and Snake against Castle on one colour.

## Best 3 from my lens
(The best subset-only rules are **Rainbow Road** (Spectral, with k ≥ 4 recommended) and **Card Windmill** (Suited), which is a perfect foil to Pinwheel.)

1. **Castle Keeper** (with the treasure variant). The baseline is near zero and the picture is vivid. It is fragile (one cut kills it), so it creates
   real diplomacy, and it naturally "rents out" its interior to pattern rules.
2. **Bridge Builder**. It is easy to explain and to see. The cross-direction conflict with another Bridge Builder is a genuine topological fact (Hex), not
   an arbitrary rule. It aligns with seed 1 and fights Archipelago and Chessmaster.
3. **Snake Charmer**. A single edit can flip it between a big score and zero (loop or fork), it punishes monochrome flooding, and it sits between the
   blob and pattern camps.
   (A strong alternate is **Tetromino Tamer**, which is the most kid-recognisable rule.)

## Cross-lens ideas I noticed but didn't develop
- **Domino tiler**: the score is how many disjoint same-colour dominoes can tile the grid (a matching problem, which is too heavy for a beginner to verify).
- **Gravity / falling sand**: "all your colour sits at the bottom" (the number of C cells with no non-C cell below them). This could pair with a "floater" god.
- **Distance-weighted rules** (for the arithmetic lens): your symbol's value × closeness to the centre, or the cards' rank as a "height map" where a
  path of increasing rank from one corner to the opposite corner scores ("climb the mountain").
- **Suit rules for cards**: the suit as a second, colour-free attribute for Pinwheel and Looking-Glass (♠♥♦♣ → a four-suit pinwheel looks lovely).
- **Hole counting (Euler number)**: the number of holes in your colour's blobs. It overlaps Castle Keeper, but it scores multiple separate holes.
- **Rainbow-order paths**: a 4-connected path whose colours step R→O→Y→G→B→V (it uses colour order, and is a "rainbow road" for the 6-colour set).
- **Calibration**: Archipelago and Looking-Glass have high random baselines (about 1/k of the maximum). The stricter variants noted above (single-cell islands, fully
  palindromic lines) fix this if the designer wants "random = low".
