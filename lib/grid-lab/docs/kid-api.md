# Writing a utility function (the kid API)

Code: `gridlab/kid.py` (Python, runnable today) and the TypeScript prelude sketch in §5.
Cards for every shortlisted rule: `gridlab/rules/cards.py`, shown in [kid-cards.md](kid-cards.md).
Try one: `cd lib/grid-lab && python3 -m gridlab.kid my_card.py --type 5,base10,rgby -n 3`.

This page is written for the player: a 12-year-old who has done a little Python or JavaScript.

---

## 1. Your god's secret wish, in one function

Every god has a **utility function**. It looks at one grid and answers *"how much do I like this
grid?"* by giving back a score. That's all it does.

```python
# 🍀 Green Ones
# Count the green 1s.
MY_COLOUR = "green"
MY_VALUE = 1

def utility(grid):
    points = 0
    for cell in grid.cells:
        if cell.colour == MY_COLOUR and cell.value == MY_VALUE:
            points += 1
    return points
```

Four things to know:

1. **It's always called `utility`, and it gets one thing: the `grid`.**
2. **Your settings are the CAPITAL words at the top.** When your god is dealt, the game fills them in
   (`MY_COLOUR = "green"`). Another player with the same card might get `"blue"`.
3. **Return a number. Bigger means better.** There's no maximum and negative numbers are fine.
   The game only ever asks *"which of these two grids does this god like more?"*. It never cares
   whether the answer is 7 or 7,000. How many points you *win* is worked out separately from how
   rare your grid is (see §4).
4. **Same grid in, same score out.** No dice, no clock, no randomness. (`import` doesn't work, on
   purpose.)

### Tie-breaks: return a league table row

Sometimes lots of grids get the same score, and you'd still like to say which is *closer* to what
you want. Then return two numbers in brackets, like a football league table:

```python
return (perfect, halfway)      # points first; if tied, goal difference
```

Python compares the first number first. Only when the first numbers are equal does it look at the
second. So `(3, 0)` beats `(2, 99)`, and `(2, 5)` beats `(2, 4)`. You can use three numbers too,
but always return the **same number of numbers**.

---

## 2. The grid

A grid is a square of cells, `grid.size` cells wide and tall. Rows and columns count from **0 at the
top-left**.

| You write | You get |
|---|---|
| `grid.size` | how many cells wide (and tall) the grid is: 3 to 7 |
| `grid.cells` | every cell, row by row from the top-left |
| `grid.rows` | a list of rows, top to bottom. Each row reads left to right |
| `grid.columns` | a list of columns, left to right. Each column reads top to bottom |
| `grid.diagonals` | the two long diagonals: top-left → bottom-right, then top-right → bottom-left |
| `grid.edge_cells` | the outside ring of cells |
| `grid.cell(row, col)` | one cell. `grid.cell(0, 0)` is the top-left |
| `grid.palette` | every colour this kind of grid can use, in rainbow order |

Want to read a row backwards? `list(reversed(row))`. Want rows and columns together?
`grid.rows + grid.columns`.

## 3. A cell

| You write | You get |
|---|---|
| `cell.row`, `cell.col` | where it is (0 = top row / left column) |
| `cell.colour` | its colour, as a word: `"red"`, `"green"`, ... |
| `cell.symbol` | what's printed on it: `"7"`, `"B"`, `"K♥"` |
| `cell.value` | how many points the symbol is worth. Numbers: the number (`"B"` is 11). Cards: A = 1, 2 to 10, J = 11, Q = 12, K = 13 |
| `cell.left`, `cell.right`, `cell.up`, `cell.down` | the touching cell on that side, or `None` at the edge |
| `cell.up_left`, `cell.up_right`, `cell.down_left`, `cell.down_right` | the corner cells, or `None` |
| `cell.neighbours` | the 2 to 4 cells touching its sides (never `None`) |
| `cell.surrounding` | the 3 to 8 cells around it, corners included |
| `cell.on_edge` | `True` if it's in the outside ring |

**Watch out for `None`.** `cell.left` is `None` for cells on the left edge. A tidy trick is a little
helper that says "no" to `None`:

```python
def is_mine(cell):
    return cell is not None and cell.colour == MY_COLOUR
```

### Only on some grids

Some grids have extra powers. Use them only on grids that have them; your card will only ever be
dealt on grids where they work.

| Grids with... | You get |
|---|---|
| playing cards | `cell.suit`: `"spades"`, `"hearts"`, `"diamonds"` or `"clubs"` |
| playing cards | `cell.is_picture`: `True` for J, Q and K |
| any colours | `next_colour(colour)`: the next colour round the rainbow. The last one goes back to the first |
| colours that mix | `mix(a, b)`: the colour you get by mixing two paints, or `None`. In 6 colours: red + yellow = orange, yellow + blue = green, red + blue = violet. In 4 colours: yellow + blue = green |

## 4. Helpers for the tricky bits

Two jobs are fiddly to write yourself, so the grid does them for you.

**`grid.reachable(start, through)`: where can I walk?** Start on one cell (or a list of cells),
walk left/right/up/down, and only ever stand on cells where `through(cell)` says `True`. You get
back every cell you can reach.

```python
def not_wall(cell):
    return cell.colour != "red"

outside = grid.reachable(grid.edge_cells, through=not_wall)   # everything you can reach from the edge
```

**`grid.regions(same)`: split the grid into groups.** Two touching cells go in the same group when
`same(a, b)` says `True`. Every cell ends up in exactly one group; a lonely cell is a group of 1.

```python
def same_colour(a, b):
    return a.colour == b.colour

for country in grid.regions(same_colour):
    print(country[0].colour, "country with", len(country), "cells")
```

**`grid.quarter_turn(cell)`**: the cell where `cell` lands if you turn the whole grid a quarter
turn clockwise. (Card Windmill uses it.)

### How your score becomes points (you don't need this to play)

The game deals thousands of random grids in its head and asks your utility function about each.
If your grid beats almost all of them, it's rare, and rare is what wins. That's why only the
*order* matters: doubling every score, or adding 100 to every score, changes nothing. The game shows
it as **"1 in 145"**: only about one random grid in 145 is at least this good for you. Each time
that number doubles you get one more ✨.

## 5. TypeScript prelude (sketch)

The same contract in TypeScript. Names are camelCased; tuples become arrays, compared the same way
(first number first). A card is `function utility(grid: Grid): number | number[]` plus `const`
settings at the top. The prelude is loaded before the card; cards cannot `import`.

```ts
// ---- prelude: loaded before every card --------------------------------------------------------
type Colour = string;                         // "red", "green", ...
type Suit = "spades" | "hearts" | "diamonds" | "clubs";
type Score = number | number[];               // bigger is better; arrays compare like a league table

interface Cell {
  readonly row: number; readonly col: number;           // 0 = top row / left column
  readonly symbol: string;                              // "7", "B", "K♥"
  readonly value: number;                               // points: digits as is, A=1 .. K=13
  readonly colour: Colour;
  readonly left: Cell | null; readonly right: Cell | null;
  readonly up: Cell | null; readonly down: Cell | null;
  readonly upLeft: Cell | null; readonly upRight: Cell | null;
  readonly downLeft: Cell | null; readonly downRight: Cell | null;
  readonly neighbours: Cell[];                          // 2-4 side neighbours
  readonly surrounding: Cell[];                         // 3-8, corners included
  readonly onEdge: boolean;
  readonly suit?: Suit;                                 // card grids only
  readonly isPicture?: boolean;                         // card grids only (J, Q, K)
}

interface Grid {
  readonly size: number;
  readonly cells: Cell[];                               // row by row
  readonly rows: Cell[][];                              // each left to right
  readonly columns: Cell[][];                           // each top to bottom
  readonly diagonals: Cell[][];                         // the two long ones
  readonly edgeCells: Cell[];
  readonly palette: Colour[];                           // rainbow order
  cell(row: number, col: number): Cell;
  quarterTurn(cell: Cell): Cell;
  reachable(start: Cell | Cell[], through: (cell: Cell) => boolean): Cell[];
  regions(same: (a: Cell, b: Cell) => boolean): Cell[][];
}

declare function nextColour(colour: Colour): Colour;   // every grid (Spectral)
declare function mix(a: Colour, b: Colour): Colour | null;  // only grids whose colours mix (Mixable)

// Engine side (not shown to players): compare two scores.
function compareScores(a: Score, b: Score): number {
  const x = typeof a === "number" ? [a] : a, y = typeof b === "number" ? [b] : b;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

// Prelude implementation sketch (mirrors gridlab/kid.py).
function regions(grid: Grid, same: (a: Cell, b: Cell) => boolean): Cell[][] {
  const group = new Map<Cell, number>(), out: Cell[][] = [];
  for (const c of grid.cells) {
    if (group.has(c)) continue;
    const members = [c], todo = [c];
    group.set(c, out.length);
    while (todo.length) {
      const x = todo.pop()!;
      for (const n of x.neighbours) if (!group.has(n) && same(x, n)) { group.set(n, out.length); members.push(n); todo.push(n); }
    }
    out.push(members.sort((a, b) => a.row - b.row || a.col - b.col));
  }
  return out;
}

function reachable(grid: Grid, start: Cell | Cell[], through: (c: Cell) => boolean): Cell[] {
  const seen = new Set<Cell>(), todo = (Array.isArray(start) ? start : [start]).filter(through);
  todo.forEach((c) => seen.add(c));
  while (todo.length) for (const n of todo.pop()!.neighbours) if (!seen.has(n) && through(n)) { seen.add(n); todo.push(n); }
  return grid.cells.filter((c) => seen.has(c));
}
```

The same card in both languages:

```ts
// 🥪 Sandwich Maker
// A cell is sandwiched when the cells on both sides of it (left and right, or above and below)
// are blue and it isn't. Each sandwich is a point.
const MY_COLOUR = "blue";

function isMine(cell: Cell | null): boolean {
  return cell !== null && cell.colour === MY_COLOUR;
}

function utility(grid: Grid): Score {
  let sandwiches = 0;
  for (const cell of grid.cells) {
    if (isMine(cell)) continue;
    if (isMine(cell.left) && isMine(cell.right)) sandwiches += 1;
    if (isMine(cell.up) && isMine(cell.down)) sandwiches += 1;
  }
  return sandwiches;
}
```

Porting notes: Python's `None` is `null`; `(a, b)` is `[a, b]`; `for cell in grid.cells` is
`for (const cell of grid.cells)`; a Python `set()` of cells is a `Set<Cell>`. Determinism in TS
means no `Math.random`, `Date` or `performance` in cards; the sandbox should not expose them.
