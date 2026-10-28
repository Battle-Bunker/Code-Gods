# Grid utilities: arithmetic and number patterns

Lens: what the *values* of symbols do when you add, compare, step or divide them, and how that
interacts with colour. Every rule needs only small mental arithmetic (adding 3 to 7 small numbers,
"is it one more?", "is it even?", times tables).

## Shared conventions

- `value(s)`: digit value for base10/12/16 (A=10, B=11, ... F=15). Cards: A=1, 2..10, J=11, Q=12, K=13,
  and the suit is ignored by value. `V` = the largest value (9, 11, 15 or 13). `B` = base (10, 12, 16;
  cards count as 13 for "base" purposes).
- Colours are numbered in spectral order: RGB = R1 G2 B3; RGBY = R1 Y2 G3 B4; rainbow = R1 O2 Y3 G4 B5 V6.
  `K` = number of colours. "Your colour" is sampled uniformly from the room's colour set, so it always exists.
- `lines(g)` = the N rows (left to right) and N columns (top to bottom). Some rules optionally add the
  two long diagonals. `pairs(g)` = the 2N(N-1) orthogonally adjacent cell pairs.
- Random-grid numbers below come from a quick 4000-grid simulation (N=5, base10, RGB unless stated),
  script at `.../scratchpad/grid/sim/sim.py`. Treat them as ballpark figures.

---

## 1. Row Ranger (target totals)

**Requires:** `Valued` (exact mode, fully generic). Round-number mode needs `Numeral b` (cards fall back to exact mode). Diagonal option fine for all N.

**Kid summary:** You have a lucky total, say 24. You score a point for every row and column whose
numbers add up to exactly 24.

**Definition:** Two possible modes are sampled (drawn 50/50):
- *Exact:* target `T` drawn uniformly from `[round(N·V/2) − N, round(N·V/2) + N]`, which keeps it near a
  typical row sum. Score = number of lines (rows and columns, plus diagonals if `diag` was drawn) with sum == T.
- *Round number:* score = number of lines whose sum is a multiple of the base B ("ends in 0 when written
  in your base"). This mode reads differently in each base: in base 10 you want 20, 30, 40, in base 12
  you want dozens (24, 36, 48), in base 16 you want 16, 32, 48 (written 10, 20, 30 in hex). With cards
  you want multiples of 13.

```ts
const L = lines(g, diag);
return L.filter(l => mode === "exact" ? sum(l) === T : sum(l) % B === 0).length;
```

**Why it's visual:** a kid runs a finger along each row, adding as they go. Rows that hit the total can
be ticked.

**Interactions:**
- *Aligns* with **Magic Window** (#5): a 3×3 Lo Shu block gives three rows and three columns with equal totals,
  so if T = 15 (or a multiple), Row Ranger profits too. Also aligns with **Seesaw** (#11), because you can
  balance a row while it still hits T, and with another Row Ranger god who drew the same T.
- *Conflicts* with another Row Ranger god whose T is different: on the same line, their gain is your loss
  (this is a clean zero-sum fight). It also conflicts with **Colour Tug-of-War** (#9), which wants every
  cell maxed, pushing sums past T, and with **Straight Shooter** (#2), where a straight 0..N−1 has a fixed small sum.
- With seed rule 1 (same-colour line sums): only aligned if the T-row is also one colour.

**Random grid:** about 0.6 lines out of 2N=10 (p95 = 2). The maximum is 2N, or 2N+2 with diagonals.
There is no degenerate solution: a constant grid works only if T is divisible by N.

---

## 2. Straight Shooter (counting up)

**Requires:** `Enum` + `Valued` (generic). Graceful upgrade: with `Cyclic`, runs may wrap (9 0 1, K A 2). Without it they don't, except that cards keep the A-high special case. The flush bonus needs only colour `Eq`.

**Kid summary:** You love counting! Rows or columns that go 3, 4, 5, 6 (each one more than the last)
score big, and if the whole run is one colour it's a *straight flush* and scores double.

**Definition:** Direction `dir` is sampled from {up, down}. "Up" means each cell is the previous +1, read
left→right or top→bottom. "Down" means −1. Each maximal run of length L ≥ 3 scores L². The score doubles if
every cell in the run has the same colour. Cards: A may sit below 2 *or* above K (Q-K-A counts).

```ts
let s = 0;
for (const l of lines(g)) {
  let run = 1, same = true;
  for (let i = 1; i <= N; i++) {
    if (i < N && value(l[i].s) === value(l[i-1].s) + step) { run++; same &&= l[i].c === l[i-1].c; }
    else { if (run >= 3) s += run*run*(same ? 2 : 1); run = 1; same = true; }
  }
}
return s;
```

**Why it's visual:** staircases of numbers are easy to see. Colour-matched staircases look like a
poker straight flush.

**Interactions:**
- *Aligns* with seed rule 1: a single-colour straight is a single-colour line with a big-ish sum.
  It also aligns with **Stepping Stones** (#12, d=1): every straight is a stepping path. The "addition
  table" grid g[r][c] = r+c makes every row AND every column a straight, and every cell a stepping stone.
- *Conflicts* with seed rule 2 (wants same-symbol regions, but a straight has all-different symbols), with
  **Seesaw** (#11, a straight is never balanced: left half < right half), with **Number Bonds** (#3, the
  all-5 grid), and with a Straight Shooter god who drew the opposite direction (the same line can't go
  both up and down; in columns vs rows, though, they can coexist, e.g. up in rows and down in columns
  via g = c − r + const).
- Base matters: base16 has length-16 runs available, so N=7 straights are easy to fit. In base10 a run of 7
  must start at 0..3.

**Random grid:** ~2 (p95 9). The maximum for N=5 is 250 (all 10 lines length 5) or 500 with flushes
(single-colour grid). A single-colour grid is a degenerate amplifier, but it is punished by **Robin
Hood** (#10), **Number Painter** (#8) and seed rule 2.

---

## 3. Number Bonds (make ten)

**Requires:** `Valued` (generic, T = V+1). The "make ten" phrasing reads best with `Numeral b` (T = b). Cards use T = 14.

**Kid summary:** You love pairs that "make ten" (or make the base). Every pair of neighbours that adds
up to your magic number scores a point. If you're a *Contrast* god, the two cells must also be different colours.

**Definition:** Target `T = V + 1` (10, 12, 16, or 14 for cards: A+K, 2+Q, ..., 7+7). Colour mode is
sampled from {any, same colour, different colour}. Score = number of adjacent pairs with value sum == T
that satisfy the colour mode.

```ts
return pairs(g).filter(([a, b]) => value(a.s) + value(b.s) === T &&
  (mode === "any" || (mode === "same") === (a.c === b.c))).length;
```

**Why it's visual:** number bonds are taught in primary school. A kid spots 3-next-to-7 and 8-next-to-2
immediately. A checkerboard of 3s and 7s lights up completely.

**Interactions:**
- *Conflicts* with **Odds & Evens Chessboard** (#7) in every room: T is always even (10, 12, 16, 14), so
  bonded neighbours always share parity (3/7 is odd+odd, 4/6 is even+even). This is a nice hidden lesson,
  because kids discover that bonds of ten never mix odd with even.
- *Aligns* with **Seesaw** (#11): 3 7 3 7 3 is balanced. The "different colour" mode aligns with seed rule 2
  (all-5 with alternating colours is a same-symbol region with no adjacent same colour, scoring 25×5).
- *Conflicts* with **Straight Shooter** (#2), **Stepping Stones** (#12: neighbours summing to 10 differ by
  an even amount, never 1, so d=1 is incompatible), and with the "same colour" Bonds god vs the "different
  colour" one.

**Random grid:** ~3.6 of 40 pairs (p95 7). Max 2N(N−1). The degenerate all-(T/2) grid (all 5s, all 6s,
all 8s, or all 7s for cards) maxes it. That is punished by Straight Shooter, Magic Window (constant lines
excluded), Times-Table Territory unless T/2 is a multiple, and King of the Hill (no peaks in a flat grid).

---

## 4. Sum Sandwich (the middle is the total)

**Requires:** `Valued`, `MinSize 3` (always true). Fibonacci mode is richer with `Numeral 16` (runs to D).

**Kid summary:** You love number sandwiches: three cells in a row where the middle number equals the two
outside numbers added together, like 2 5 3. In *Fibonacci* mode it's the last number that's the total, like 2 3 5.

**Definition:** Mode is sampled from {sandwich: b = a + c, fibonacci: c = a + b}, read along rows and
columns. Both outer/first cells must be non-zero, so 0 0 0 doesn't count. Score = number of qualifying
triples. Optional sampled twist `col`: the total cell must be your colour.

```ts
let s = 0;
for (const l of lines(g)) for (let i = 0; i + 2 < N; i++) {
  const [a, b, c] = [l[i], l[i+1], l[i+2]].map(x => value(x.s));
  const [x, y, tot] = mode === "sandwich" ? [a, c, b] : [a, b, c];
  if (x > 0 && y > 0 && x + y === tot && (!col || [l[i+1], l[i+2]][mode === "sandwich" ? 0 : 1].c === col)) s++;
}
return s;
```

**Why it's visual:** you see a "bigger number held between two smaller ones" (sandwich) or a growing
chain (Fibonacci 1 1 2 3 5 8 runs naturally in a row of 6 in base10; base16 gets to D=13: 1 1 2 3 5 8 D).

**Interactions:**
- *Aligns* with **King of the Hill** (#13): a sandwich middle is bigger than both sides, half-way to a peak.
  Fibonacci mode aligns with **Straight Shooter**'s "up" direction only weakly (1 2 3 is both a straight and a
  Fibonacci triple! 1+2=3). That gives a tiny shared sweet spot that the two gods can negotiate over.
- *Partly aligns* with **Seesaw** (#11): 2 5 3 is not balanced, but 2 4 2 is, so equal-sided sandwiches are
  shared ground. *Conflicts* with **Number Bonds** (#3, flat 5s grid), and with seed rule 2 (same
  symbols adjacent can only form sandwiches with 0, which is excluded).
- Sandwich vs Fibonacci gods are a strong conflict: 1 1 2 3 5 gives Fibonacci three times and zero
  sandwiches, while 1 2 1 2 1 gives two sandwiches and zero Fibonacci triples.

**Random grid:** ~1.7 of 30 triples (p95 4). The realistic max is about 2/3 of triples. For example, 1 2 1 2 1 gives two
sandwiches out of three (2=1+1 twice), because a middle can't also be an outside of the next sandwich. A Fibonacci row only works in one direction.

---

## 5. Magic Window (Lo Shu)

**Requires:** `Valued`, `MinSize 3`. It's best with `Numeral 10`+ (zero available, Lo Shu 1..9 fits). With cards it works (A..9) but no zero shifts.

**Kid summary:** You're hunting for a magic square: a 3×3 window where every row, column and diagonal adds
up to three times the middle number (like the ancient Lo Shu with 5 in the middle and every line making 15).

**Definition:** For each 3×3 window, count its 8 lines (3 rows, 3 cols, 2 diagonals) whose sum equals
3 × centre value, ignoring lines where all three values are equal. Score = the best window's count (0..8).
Optional sampled parameter `centreColour`: the window counts only if its centre is your colour.

```ts
let best = 0;
for (let r = 0; r + 2 < N; r++) for (let c = 0; c + 2 < N; c++) {
  const w = (i, j) => value(g[r+i][c+j].s), S = 3 * w(1, 1);
  const L = [0,1,2].flatMap(i => [[w(i,0),w(i,1),w(i,2)], [w(0,i),w(1,i),w(2,i)]])
            .concat([[w(0,0),w(1,1),w(2,2)], [w(0,2),w(1,1),w(2,0)]]);
  best = Math.max(best, L.filter(l => sum(l) === S && new Set(l).size > 1).length);
}
return best;
```

**Why it's visual:** a classic puzzle. Kids check eight sums inside one little box. 2 7 6 / 9 5 1 / 4 3 8
is the famous answer, and others are just shifted copies (add k to every cell) or rotations.

**Interactions:**
- *Aligns* with **Row Ranger** (T = 15, or 3×centre). It *conflicts* with **Sum Sandwich**: a magic
  square's centre is the *average* of each line through it, never the sum, so its middle row and column
  are never sandwiches.
- *Conflicts* with seed rule 2 and **Number Bonds** flat grids (constant lines excluded). It mostly conflicts
  with **Straight Shooter**, because magic rows are not straights. However, the addition-table block
  0 1 2 / 1 2 3 / 2 3 4 scores 3 of 8 here (middle row, middle column, and the 0-2-4 diagonal; the 2-2-2
  diagonal is constant and excluded). That makes it a playable half-agreement.
- Base-dependent: there are more magic placements in base16 (centre can be up to 14 with spread), fewer
  with cards (no zero).

**Random grid:** ~1.3 (p95 3) out of 8. Max 8 by placing a Lo Shu anywhere. It's cheap to place, but
it needs 9 different values in a fixed arrangement, which fights almost every "flat" rule.

---

## 6. Times-Table Territory (multiples)

**Requires:** `Valued`. The `m` menu is per-instance (see below). The prime variant is generic.

**Kid summary:** Your favourite times table is the 4s. Find the biggest blob of touching cells that are all
in the 4 times table. Its size is your score.

**Definition:** `m` is sampled per symbol set from tables where multiples are visibly distinct:
base10 {3, 4, 5}; base12 {3, 4, 6}; base16 {3, 4, 5}; cards {3, 4, 5}. Zero counts (0 = 0×m), cards have
no zero. A variant `m = "prime"` uses 2, 3, 5, 7, 11, 13. Score = size of the largest orthogonally
connected region whose values are all multiples of m. Optional sampled twist: the region must also be all
your colour (score halves at random, but much harder to fake).

```ts
return largestRegion(g, cell => value(cell.s) % m === 0);
```

**Why it's visual:** circle all the 0s, 4s and 8s (in hex also the Cs), and see the biggest island. The
set changes with the base: in base12, the 3s table is 0 3 6 9 (a third of all symbols); in base16, the
4s are 0 4 8 C; in base10 the 5s are just 0 and 5.

**Interactions:**
- *Aligns* with seed rule 2 when the god's symbol is a multiple of m (a big same-symbol region is a big
  multiples region). It aligns with **Number Bonds** when T/2 is a multiple (base12 all-6 for m=3 or 6;
  base16 all-8 for m=4). It aligns with another Territory god whose m shares factors: 4s and 2-primes? 3s
  and 6s in base12 nest (multiples of 6 ⊂ multiples of 3).
- *Conflicts* with **Straight Shooter** and **Stepping Stones** (consecutive numbers are never both
  multiples of m≥2), and with a Territory god with a coprime m (3 vs 4: only 0 is shared in base10, so the
  0 cells become a contested treaty zone).
- Prime variant conflicts with every even-flat grid and aligns with **Odds & Evens** where odd primes sit.

**Random grid:** ~5.5 (m=3, density 0.4; p95 11) of 25. This is the highest random/max ratio in my list.
Use m≥4 or the colour twist to lower it, or square the size. Degenerate solution: all-0 grid (all multiples).
It's punished by King of the Hill, Magic Window, Straight Shooter and Sum Sandwich (zeros excluded).

---

## 7. Odds & Evens Chessboard

**Requires:** `Valued`, `MinSize 2` (always). colourLock needs only colour `Eq`.

**Kid summary:** You want the numbers to make a chessboard: odd, even, odd, even, with no two odd numbers
or two even numbers side by side. You score one point for every 2×2 square that's a perfect little
chessboard.

**Definition:** Score = number of 2×2 windows whose parities follow the pattern [p, 1−p ; 1−p, p].
Sampled parameter `colourLock` (true/false): if true, the odd cells of the window must also be your
colour. That ties parity to colour ("all my odd numbers are blue").

```ts
let s = 0;
for (let r = 0; r + 1 < N; r++) for (let c = 0; c + 1 < N; c++) {
  const p = (i, j) => value(g[r+i][c+j].s) % 2;
  if (p(0,0) === p(1,1) && p(0,1) === p(1,0) && p(0,0) !== p(0,1)) s++;
}
return s;
```

**Why it's visual:** it's a chessboard. Kids can shade odd cells and see the pattern break. In base16,
the kid needs the value table to see that A, C, E are even. This teaches hex parity, and with cards J and K are odd.

**Interactions:**
- *Aligns* with **Stepping Stones** d=1 or d=3 (odd steps flip parity), and with **King of the Hill**
  (a high/low checkerboard such as 8/3 is both peaks and a parity chessboard). It also aligns with
  **Straight Shooter** through the g = r+c addition table, which is a perfect parity chessboard!
  That makes r+c the "grand coalition" grid for #2, #7 and #12.
- *Conflicts* with **Number Bonds** (sum to an even T, so bonded neighbours share parity), with
  **Stepping Stones** d=2, and with seed rule 2 (same-symbol neighbours share parity).
- colourLock=true conflicts with **Robin Hood** if the lock pushes half the grid to one colour, and aligns with
  seed rule 2's colour alternation not at all (seed 2 needs equal symbols).

**Random grid:** ~2 of 16 windows (1/8 each, p95 5). Max (N−1)². No cheap degenerate solution: it needs alternation.

---

## 8. Number Painter (paint by numbers)

**Requires:** `Valued` + colour `Spectral` (colour numbers follow spectral order: RGB = R1 G2 B3; RGBY = R1 Y2 G3 B4; rainbow R1..V6). NOTE: this corrects my conventions line for RGBY, where Y is 2nd. Without `Spectral` it would fall back to set order, but every current colour set is Spectral.

**Kid summary:** Like a paint-by-numbers book: every colour has a number, and you score a point for each
cell whose number matches its colour's number.

**Definition:** Colour numbers as in the conventions (R1 G2 B3 Y4, rainbow R1..V6). Offset `o` is sampled
from {−1, 0, +1, +2, ...} so that every target value exists (o ≥ −1, and o + K ≤ V; cards need o ≥ 0 since
there's no zero). A cell matches if `value(s) === colourNumber(c) + o`. Score = number of matching cells.
The god's card says it plainly: "red=1, green=2, blue=3".

```ts
return cells(g).filter(x => value(x.s) === colourNumber(x.c) + o).length;
```

**Why it's visual:** every cell is self-checking, and the key is a little legend. In rainbow mode it uses
the R<O<Y<G<B<V order directly.

**Interactions:**
- *Aligns or conflicts with seed rule 3 (green 1s) by draw:* with o = −1 in RGB, green=1, so the two are
  allies (in RGBY green is 3, so that needs o = −2; offsets may go down to 1 − colourNumber(green) so seed-3 alliances are drawable). With o = 0, green must be 2 (RGB), a direct conflict over every green 1.
- Two Painters with different offsets are in a perfect conflict, cell by cell. A Painter with the same
  offset is a clone-ally.
- *Aligns* with **Straight Shooter** (flush bonus doesn't, but an R-G-B-coloured 1 2 3 row is both a straight and
  a painted row, and that colour-ramp straight is pretty). *Conflicts* with seed rule 1 and the flush
  bonus (a single-colour line can only paint one value, so it can't count up). It also conflicts with
  **Colour Tug-of-War** (you want specific values, not big ones).

**Random grid:** N²/(V+1), about 2.5 of 25. Max N², but a fully painted grid uses only K distinct values.
That flatness then fights Magic Window and Straight Shooter (except the colour-ramp straight).

---

## 9. Colour Tug-of-War

**Requires:** `Valued`, colour `Eq`, at least 2 colours (always). With `Wheel`, a variant can sample rival = the colour opposite mine on the wheel.

**Kid summary:** Your team colour is blue and your rival is red. Add up all the blue numbers and take away all
the red numbers. Big blue numbers help you, and big red numbers hurt you.

**Definition:** Sample `mine` and `rival` as two different colours. Score = Σ value over `mine` cells − Σ value
over `rival` cells. (Can be negative.)

```ts
return cells(g).reduce((t, x) => t + (x.c === mine ? value(x.s) : x.c === rival ? -value(x.s) : 0), 0);
```

**Why it's visual:** two piles of colour, compare the totals. A kid can even skip the arithmetic at a glance:
"lots of big blue numbers, few red ones".

**Interactions:**
- *Aligns* with seed rule 1 when the seed god's colour = `mine` (big same-colour lines). It aligns with another
  Tug god who shares `mine` or `rival`, and it is in mild conflict with seed rule 3 if `mine` is green
  (green 1s are the cheapest non-zero cells to hold).
- *Conflicts directly* with any Tug god whose `mine` is my `rival`. This is built-in politics, and with K=3 the
  colour triangle (R beats G beats B beats R) emerges naturally across three gods. It also conflicts with
  **Robin Hood** (#10), which wants the rival colour rich too, and with **Number Painter** and **Row Ranger**
  (maxing values breaks targets).

**Random grid:** mean 0 (p95 ≈ 36 at N=5), max N²·V = 225. Degenerate solution: "paint everything mine, all max
values". The grid becomes a single-colour slab, which kills seed rule 2, Robin Hood, Painter and the chessboard.
A good thing that it's widely punished.

---

## 10. Robin Hood (fair shares)

**Requires:** `Valued`, colour `Eq` (generic).

**Kid summary:** You hate it when one colour gets everything. Add up the numbers of each colour. Your score
is the total of the *poorest* colour.

**Definition:** Score = min over all K colours of (Σ value of that colour's cells). A colour with no cells
scores 0, so every colour must be present.

```ts
return Math.min(...COLOURS.map(k => sum(cells(g).filter(x => x.c === k).map(x => value(x.s)))));
```

**Why it's visual:** count three piles, report the smallest. RGB (3 colours, more cells each) gives bigger
numbers than rainbow (6 colours).

**Interactions:**
- *Aligns* with seed rule 2 (colour-alternating regions spread colours out), with **Number Painter** mildly (each
  colour gets cells), and with **Odds & Evens** (indifferent to colour, so it's free to cooperate).
- *Conflicts* with every **Tug-of-War** god (they want a rival colour poor), with Straight Shooter's flush
  bonus and seed rule 1 (both reward single-colour lines; fine in moderation, but a monochrome grid gives 0),
  and with **Number Painter** (a Painter wants red cells to be 1s, so red is permanently poor).
  That makes Painter vs Robin Hood a nice quantitative tension.

**Random grid:** ~25 at N=5 RGB (p95 36), max ≈ N²·V/K ≈ 75. The random/max ratio is high (1/3), so this is a
"soft" rule that rewards keeping everything rich and balanced. If calibration matters, score
`min − (max − min)` instead to punish imbalance harder.

---

## 11. Seesaw (balanced rows)

**Requires:** `Valued`. It's nicest with `HasCentre` (a visible pivot cell). For even N it degrades gracefully (no pivot, halves just meet).

**Kid summary:** Picture every row as a seesaw. Add up the left side and the right side (skip the middle
cell if there is one). If both sides weigh the same, the seesaw balances and you score a point.

**Definition:** For each line, with h = ⌊N/2⌋, compare the sum of the first h values with the sum of the last h.
Score = number of balanced lines. Sampled `scope` ∈ {rows, columns, both}. Sampled `colourSeesaw` variant:
weigh colours instead of halves, so the line balances when Σ(your colour) = Σ(rival colour) in that line.

```ts
const h = Math.floor(N / 2);
return lines(g, scope).filter(l => sum(l.slice(0, h)) === sum(l.slice(N - h))).length;
```

**Why it's visual:** the middle cell is the pivot, and kids can literally draw a fulcrum. N odd vs even changes
the feel: with N=3 it's "first = last".

**Interactions:**
- *Aligns* with mirror/palindrome rules from the symmetry lens (any palindrome row balances), with **Number
  Bonds** (3 7 3 7 3), with **Sum Sandwich** equal-sided sandwiches (2 4 2), and with seed rule 2 (constant rows).
- *Conflicts* with **Straight Shooter** (a straight is never balanced), with **Tug-of-War** in
  `colourSeesaw` mode, and with **Row Ranger** only when T is odd and N=... (rarely; mostly neutral).

**Random grid:** ~0.66 of 10 lines (p95 2). Max 2N. Degenerate solution: constant or palindromic grids. Constant
grids are punished by #2, #5, #12 and #13. Palindromic grids are a legit cross-lens alliance.

---

## 12. Stepping Stones (step size d)

**Requires:** `Valued` (or `Enum` for d=1 as "next/previous symbol"). With `Cyclic`, d=1 also links 9-0 / K-A.

**Kid summary:** You can only hop between neighbours whose numbers differ by exactly your step, say 1
(like 4 to 5 or 7 to 6). Your score is the biggest group of cells you can reach by hopping.

**Definition:** `d` is sampled from {1, 2, 3} (base16 adds 4, and a "Cliffhanger" draw uses d = ⌈V/2⌉).
Two adjacent cells are linked if |value difference| == d. Score = size of the largest connected
component of linked cells (a lone cell is 1).

```ts
return largestComponent(g, (a, b) => Math.abs(value(a.s) - value(b.s)) === d);
```

**Why it's visual:** draw a line between every linked pair and see the biggest web. A 4/5 checkerboard is
one giant web.

**Interactions:**
- *Aligns* with **Straight Shooter** (d=1), **Odds & Evens** (odd d), and **King of the Hill** (a checkerboard of
  x and x+d makes every high cell a peak). The r+c grid satisfies #2, #7 and #12 (d=1) at once.
- *Conflicts* with gods who drew a different d: one pair can only have one difference, so a d=1 and a d=2 god
  fight over every edge. It conflicts with **Number Bonds** (sum to even T means even difference),
  **Times-Table Territory** (multiples of m≥2 never differ by 1), and seed rule 2 (difference 0).
- The Cliffhanger draw (big jumps) conflicts with smooth d=1 everywhere, so smooth vs jagged politics emerges.

**Random grid:** ~3.9 of 25 at d=1 (p95 7). Max N². No constant-grid solution: it needs two alternating values.

---

## 13. King of the Hill (mountain tops)

**Requires:** `Valued`, colour `Eq` (generic).

**Kid summary:** A mountain top is a cell of your colour whose number is bigger than every neighbour
touching it (up, down, left, right). Count your mountain tops!

**Definition:** Score = number of cells with colour == `mine` whose value is strictly greater than all of
its orthogonal neighbours. A sampled `valley` variant counts strictly-smaller cells instead.

```ts
return cells(g).filter(x => x.c === mine &&
  neighbours(x).every(n => value(x.s) > value(n.s))).length;
```

**Why it's visual:** big numbers sitting among small ones. You could even colour the font size by value.

**Interactions:**
- *Aligns* with **Odds & Evens Chessboard** and **Stepping Stones** (a high/low checkerboard), with
  **Sum Sandwich** (middles bigger than both sides), and with **Tug-of-War** if mine = Tug's colour (big
  numbers on mine). It also aligns with seed rule 3 only in valley mode (green 1s are natural valleys!).
- *Conflicts* with the **valley** variant of the same colour (a cell can't be both), with **Seesaw/Bonds** flat grids,
  seed rule 2 (equal neighbours are never strictly bigger), seed rule 1 (a same-colour line of peaks is impossible:
  adjacent peaks can't both be bigger than each other, so peaks of colour X force neighbours to be other colours
  or lower). It is mostly neutral towards **Robin Hood**.

**Random grid:** ~1.7 at N=5 RGB (p95 4). Max ⌈N²/2⌉ = 13 (a chessboard of your colour on the high squares).
No cheap degenerate solution.

---

## Numeral-only rules (added after the capabilities addendum)

These read a row (left to right) as a number written in the room's base b. They don't exist for
cards, and that's fine. They are the most *base-dependent* rules in this lens: the same grid scores
differently in base 10, 12 and 16.

## 14. Divisibility Detective

**Requires:** `Numeral b`.

**Kid summary:** Read each row as one big number. Your secret divisor is 5. Score a point for every row
whose number divides by 5. Use the shortcut tests (last digit, add up the digits) instead of dividing!

**Definition:** `m` is sampled from the divisors with a kid-sized test in that base:
- base10: {2, 5, 10} (look at the last digit), {3, 9} (digit sum).
- base12: {2, 3, 4, 6, 12} (last digit), {11} (digit sum).
- base16: {2, 4, 8, 16} (last digit), {3, 5, 15} (digit sum).
Score = number of rows (optionally also columns read top to bottom) whose base-b value is divisible by m.

```ts
let s = 0;
for (const l of lines(g, scope)) {
  let x = 0; for (const cell of l) x = (x * b + value(cell.s)) % m;  // stays small
  if (x === 0) s++;
}
return s;
```

**Why it's visual:** last-digit tests mean you look only at the *last column* (rows) or the *bottom row*
(columns). Digit-sum tests reduce to adding a row, the same skill as Row Ranger. The god's card says
which test applies.

**Interactions:**
- *Aligns* with **Row Ranger** round-number mode when m = b−1 or a divisor of it (digit sum test), and with
  **Times-Table Territory** when m is last-digit-testable (a last column full of multiples of m is a
  Territory strip!).
- *Conflicts* with gods who want the last column to hold something else: **Straight Shooter** in columns,
  **Number Painter**, or a Detective with a coprime last-digit m (2 vs 5 in base10 can only share 0). With
  digit-sum m it conflicts with **Row Ranger** exact mode unless T happens to be a multiple of m.
- Base-dependence: m=3 is a digit-sum test in base10 and base16 (since 3 | 15) but a last-digit test in base12.
  The same rule plays very differently by room.

**Random grid:** about 2N/m lines (e.g. N=5, m=5: ~2 of 10). Max 2N. Degenerate solution: a last column of zeros
satisfies all last-digit gods at once. That gives a "zero treaty", punished by Sum Sandwich and King of the Hill.

## 15. Column Addition (the sum stack)

**Requires:** `Numeral b`, `MinSize 3`.

**Kid summary:** Stack three rows like a school addition sum: top row + middle row = bottom row, carrying
in your base. Score a point for every column of the sum you got right, starting from the right-hand end.

**Definition:** Sampled `top` ∈ {0..N−3} chooses rows top, top+1, top+2 (or "any": the best triple).
Compute (A + B) mod b^N in base b. Score = the number of trailing digits (from the right) where the
sum digit matches the bottom row, stopping at the first mismatch. Max N.

```ts
let carry = 0, s = 0;
for (let c = N - 1; c >= 0; c--) {
  const t = value(g[top][c].s) + value(g[top+1][c].s) + carry;
  if (t % b !== value(g[top+2][c].s)) break;
  carry = Math.floor(t / b); s++;
}
return s;
```

**Why it's visual:** it *is* a written sum. In base 16, 9 + 8 = 11 with a carry (hex "11" = 17), so kids
learn carrying in another base. The rule can say "carry when you reach b".

**Interactions:**
- *Aligns* with **Number Bonds** (a column whose top two digits make b produces a 0 and a carry, so bond
  pairs stacked vertically are useful), and with **Straight Shooter**: 1 2 3 + 1 1 1 = 2 3 4 is three straights.
- *Conflicts* with **Seesaw** and seed rule 2 on the bottom row (it's forced by the top two). It fights
  **Row Ranger** on the bottom row (sum is determined), and a second Column Addition god with a
  different `top` overlaps rows, so their bottom/top rows clash.

**Random grid:** P(each column right) = 1/b, so the expected score is about 0.11 in base10. Max N. It has
no degenerate solution apart from an all-zero triple (0+0=0), which it should exclude: require at least one
non-zero digit in the top row.

## 16. Ladder of Numbers (sorted rows)

**Requires:** `Numeral b` (generic fallback for cards: compare row sums instead).

**Kid summary:** Read each row as a number. You want them to get bigger as you go down the page, like a
ladder. Score a point for every row that's bigger than the row above it.

**Definition:** Score = #{r ≥ 1 : num(row r) > num(row r−1)}, where num reads base-b digits left to right
(compare from the first digit, like a dictionary). The direction (down or up) is sampled.

```ts
const num = row => row.reduce((x, cell) => x * b + value(cell.s), 0);
let s = 0; for (let r = 1; r < N; r++) if (num(g[r]) > num(g[r-1])) s++;
return s;
```

**Why it's visual:** compare first digits down the left column, and only look further when they tie.

**Interactions:** it's mostly driven by the *first column*, so it aligns with **Straight Shooter** in the
first column and conflicts with a Straight Shooter "down" god there. It fights the opposite-direction
Ladder god. It's otherwise loose, which makes it a good "cheap ally" that leaves the rest of the grid
negotiable.

**Random grid:** ~(N−1)/2 (about half, since it's a fair coin per row). That's high, so square the score or count
only the longest increasing streak. Max N−1.

---

## The interaction web at a glance

| | #2 Straight | #3 Bonds | #7 Chess | #11 Seesaw | #12 Steps | #13 Peaks | Seed 2 |
|---|---|---|---|---|---|---|---|
| r+c addition table | ++ | −− | ++ | −− | ++ | − | −− |
| all-(T/2) flat grid | −− | ++ | −− | ++ | −− | −− | ++ |
| x / x+1 checkerboard | − | −− | ++ | ++ (odd N) | ++ | ++ | −− |
| Lo Shu patch | − | ± | ± | ± | − | ± | −− |

The two "attractor" grids, the *addition table* and the *flat half-value grid*, are natural rival
coalitions. Colour rules (#8, #9, #10, seed 1, seed 3) cut across them, because none of the value
patterns above cares about colour. The colour layer is therefore always open for negotiation.

## Best 3 from my lens

1. **Number Bonds (make ten)**. It's the most kid-native rule (school number bonds), it adapts cleanly to
   every base via T = V+1 (making 14 with cards), and its colour modes (same/different/any) make it pull for or
   against seed rules 1 and 2. It has a hidden lesson: bonds of an even total never mix odd and even.
2. **Straight Shooter**, with its straight-flush bonus. It rewards visible staircases, ties number to colour
   through the flush, and anchors the r+c "addition table" coalition with #7 and #12, against the flat-grid coalition.
3. **Colour Tug-of-War**. It's trivial to explain, and its sampled (mine, rival) pair gives instant multiplayer
   politics (colour triangles with K=3, shifting blocs with K=6). Its degenerate monochrome solution is
   punished by several other rules.

(Subset-only pick: **Divisibility Detective** (#14) is the strongest Numeral-only rule, because the same row reads differently in base 10/12/16. Honourable mention: **Number Painter**, whose offset draw decides whether it allies with or fights seed rule 3.)

## Cross-lens ideas I noticed but didn't develop

- **Poker rows (cards only)**: score each row/column of 5 as a poker hand (pair, two pair, trips, straight,
  colour-flush, full house). For N=3/4, use 3-card poker. This is rich, but the hand ranking needs a legend.
- **Snap**: count adjacent equal symbols. It's pure pattern-lens, and it aligns with seed 2.
- **Gradient / heat map**: values increase toward a sampled corner (a monotone rows-and-columns
  "Young tableau"). It's a geometric cousin of Straight Shooter.
- **Colour-value ladder**: rainbow order R<…<V should agree with value order along a line (bigger numbers
  get "later" colours). This mixes colour-order and number-order lenses.
- **Digit-sum in base**: write a line total *in the room's base* and take its digit sum. This differs
  wildly between base10 and base16, but it's probably too abstract for kids.
- **Region × value products** (seed 2 generalised): the product of a region's values, or region size =
  symbol value ("a 3 lives in a group of three", like Fillomino). That one belongs in the region/shape lens and is very kid-friendly.
