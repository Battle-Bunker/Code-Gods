/**
 * The Grid kid API (lib/grid-lab/docs/kid-api.md) as generated Python and JS, mirroring
 * lib/grid-lab/gridlab/kid.py. Instance data is emitted as literal tables; only the helpers the
 * instantiation's classes provide are emitted (cell.suit / cell.is_picture: Suited/Faced; mix: Mixable).
 *
 * Private names (for mutator constructors too): Python _SIZE, _CODES (code → symbol index),
 * _SYMBOLS, _VALUES, _SUITS, _PICTURES, _LETTERS (letter → colour index), _COLOURS, _NEXT_COLOUR,
 * _MIXES; JS the same with a "__" prefix (Maps for the lookups).
 */
import { mixColours, type ColourComponent, type SymbolComponent } from "./components.ts";
import { helper, js, jsMap, py, pyDict, type BasePrelude } from "../prelude.ts";
import type { HelperDoc } from "../types.ts";

export function gridPrelude(size: number, s: SymbolComponent, c: ColourComponent, classes: readonly string[]): BasePrelude {
  const suited = classes.includes("Suited") && !!s.suits, faced = classes.includes("Faced") && !!s.faces;
  const mixable = classes.includes("Mixable");
  const codes = s.codes.map((code, i) => [code, i] as const), letters = c.letters.map((l, i) => [l, i] as const);
  const next = c.names.map((n, i) => [n, c.names[(i + 1) % c.count]] as const);
  const mixes: (readonly [string, string])[] = [];
  for (let a = 0; a < c.count; a++) for (let b = 0; b < c.count; b++) {
    const m = mixColours(c, a, b);
    if (m !== null) mixes.push([`${c.names[a]}+${c.names[b]}`, c.names[m]]);
  }
  const suitNames = suited ? s.suits!.map(u => s.suitNames![u]) : [];
  const extraSlots = [...(suited ? ["suit"] : []), ...(faced ? ["is_picture"] : [])];

  const python = `
_SIZE = ${size}
_CODES = ${pyDict(codes)}
_SYMBOLS = ${py(s.glyphs)}
_VALUES = ${py(s.values)}
${suited ? `_SUITS = ${py(suitNames)}\n` : ""}${faced ? `_PICTURES = ${py(s.faces!)}\n` : ""}_LETTERS = ${pyDict(letters)}
_COLOURS = ${py(c.names)}
_NEXT_COLOUR = ${pyDict(next)}
${mixable ? `_MIXES = ${pyDict(mixes.map(([k, v]) => [k, v]))}\n` : ""}

class Cell:
    """One square of the grid. Touching cells are left, right, up, down (None off the edge)."""
    __slots__ = ("row", "col", "symbol", "value", "colour", ${extraSlots.map(x => `"${x}", `).join("")}"left", "right", "up", "down",
                 "up_left", "up_right", "down_left", "down_right")

    @property
    def neighbours(self):
        """The 2 to 4 cells touching this one along a side (left, right, up, down)."""
        return [c for c in (self.left, self.right, self.up, self.down) if c is not None]

    @property
    def surrounding(self):
        """The 3 to 8 cells around this one, corners included."""
        return [c for c in (self.up_left, self.up, self.up_right, self.left, self.right,
                            self.down_left, self.down, self.down_right) if c is not None]

    @property
    def on_edge(self):
        """True for cells in the outside ring of the grid."""
        return self.row in (0, _SIZE - 1) or self.col in (0, _SIZE - 1)

    def __repr__(self):
        return "Cell(row=%d, col=%d, %s %s)" % (self.row, self.col, self.symbol, self.colour)


class Grid:
    """A square of cells, size cells wide and tall. Rows and columns count from 0 at the top-left."""
    __slots__ = ("size", "palette", "_rows")

    def __init__(self, rows):
        self.size = _SIZE
        self.palette = list(_COLOURS)
        self._rows = rows

    @property
    def cells(self):
        """Every cell, row by row from the top-left."""
        return [c for row in self._rows for c in row]

    @property
    def rows(self):
        """The rows, top to bottom; each row reads left to right."""
        return [list(row) for row in self._rows]

    @property
    def columns(self):
        """The columns, left to right; each column reads top to bottom."""
        return [[row[c] for row in self._rows] for c in range(_SIZE)]

    @property
    def diagonals(self):
        """The two long diagonals: top-left to bottom-right, then top-right to bottom-left."""
        return [[self._rows[i][i] for i in range(_SIZE)], [self._rows[i][_SIZE - 1 - i] for i in range(_SIZE)]]

    @property
    def edge_cells(self):
        """The outside ring of cells, row by row."""
        return [c for c in self.cells if c.on_edge]

    def cell(self, row, col):
        """The cell at (row, col), counting from 0 at the top-left."""
        if not (isinstance(row, int) and isinstance(col, int) and 0 <= row < _SIZE and 0 <= col < _SIZE):
            raise IndexError("there is no cell at row %r, column %r" % (row, col))
        return self._rows[row][col]

    def quarter_turn(self, cell):
        """Where cell lands if the whole grid is turned a quarter turn clockwise."""
        return self._rows[cell.col][_SIZE - 1 - cell.row]

    def reachable(self, start, through):
        """Every cell you can walk to from start (a cell or a list of cells), stepping left/right/up/down
        and only standing on cells where through(cell) is True. Returned in grid order."""
        starts = [start] if isinstance(start, Cell) else list(start)
        seen = set()
        todo = [c for c in starts if through(c)]
        seen.update(todo)
        while todo:
            c = todo.pop()
            for n in c.neighbours:
                if n not in seen and through(n):
                    seen.add(n)
                    todo.append(n)
        return [c for c in self.cells if c in seen]

    def regions(self, same):
        """Connected groups: touching cells a, b are in one group when same(a, b) is True.
        Groups come in grid order of their first cell, and each group is in grid order."""
        group = {}
        out = []
        for c in self.cells:
            if c in group:
                continue
            k = len(out)
            group[c] = k
            members, todo = [c], [c]
            while todo:
                x = todo.pop()
                for n in x.neighbours:
                    if n not in group and same(x, n):
                        group[n] = k
                        members.append(n)
                        todo.append(n)
            out.append(sorted(members, key=lambda m: (m.row, m.col)))
        return out

    def __repr__(self):
        return "\\n".join(" ".join("%s%s" % (c.symbol, c.colour[0].upper()) for c in row) for row in self._rows)


def next_colour(colour):
    """The next colour round the rainbow; the last colour wraps back to the first."""
    if colour not in _NEXT_COLOUR:
        raise ValueError("%r is not a colour in this room" % (colour,))
    return _NEXT_COLOUR[colour]

${mixable ? `
def mix(a, b):
    """The colour you get by mixing paints a and b, or None if they don't mix."""
    return _MIXES.get("%s+%s" % (a, b))

` : ""}
def __decode(wire):
    """Canonical wire string -> Grid (host-validated; checked again here)."""
    lines = wire.split("/")
    if len(lines) != _SIZE:
        raise ValueError("not a grid of this room")
    rows = []
    for r in range(_SIZE):
        texts = lines[r].split(",")
        if len(texts) != _SIZE:
            raise ValueError("not a grid of this room")
        row = []
        for k in range(_SIZE):
            text = texts[k]
            s, h = _CODES[text[:-1]], _LETTERS[text[-1:]]
            x = Cell()
            x.row, x.col, x.symbol, x.value, x.colour = r, k, _SYMBOLS[s], _VALUES[s], _COLOURS[h]
${suited ? "            x.suit = _SUITS[s]\n" : ""}${faced ? "            x.is_picture = _PICTURES[s]\n" : ""}            row.append(x)
        rows.append(row)

    def at(r, k):
        return rows[r][k] if 0 <= r < _SIZE and 0 <= k < _SIZE else None

    for r in range(_SIZE):
        for k in range(_SIZE):
            x = rows[r][k]
            x.left, x.right, x.up, x.down = at(r, k - 1), at(r, k + 1), at(r - 1, k), at(r + 1, k)
            x.up_left, x.up_right, x.down_left, x.down_right = at(r - 1, k - 1), at(r - 1, k + 1), at(r + 1, k - 1), at(r + 1, k + 1)
    return Grid(rows)
`;

  const jsText = `
const __SIZE = ${size};
const __CODES = ${jsMap(codes)};
const __SYMBOLS = ${js(s.glyphs)};
const __VALUES = ${js(s.values)};
${suited ? `const __SUITS = ${js(suitNames)};\n` : ""}${faced ? `const __PICTURES = ${js(s.faces!)};\n` : ""}const __LETTERS = ${jsMap(letters)};
const __COLOURS = ${js(c.names)};
const __NEXT_COLOUR = ${jsMap(next)};
${mixable ? `const __MIXES = ${jsMap(mixes)};\n` : ""}
class Cell {
  get neighbours() { return [this.left, this.right, this.up, this.down].filter((c) => c !== null); }
  get surrounding() {
    return [this.upLeft, this.up, this.upRight, this.left, this.right, this.downLeft, this.down, this.downRight]
      .filter((c) => c !== null);
  }
  get onEdge() { return this.row === 0 || this.row === __SIZE - 1 || this.col === 0 || this.col === __SIZE - 1; }
  toString() { return "Cell(row=" + this.row + ", col=" + this.col + ", " + this.symbol + " " + this.colour + ")"; }
}

class Grid {
  #rows;
  constructor(rows) {
    this.#rows = rows;
    this.size = __SIZE;
    this.palette = __COLOURS.slice();
  }
  get cells() { return this.#rows.flat(); }
  get rows() { return this.#rows.map((row) => row.slice()); }
  get columns() { return this.#rows[0].map((_, c) => this.#rows.map((row) => row[c])); }
  get diagonals() {
    return [this.#rows.map((row, i) => row[i]), this.#rows.map((row, i) => row[__SIZE - 1 - i])];
  }
  get edgeCells() { return this.cells.filter((c) => c.onEdge); }
  cell(row, col) {
    if (!(Number.isInteger(row) && Number.isInteger(col) && row >= 0 && row < __SIZE && col >= 0 && col < __SIZE)) {
      throw new RangeError("there is no cell at row " + row + ", column " + col);
    }
    return this.#rows[row][col];
  }
  quarterTurn(cell) { return this.#rows[cell.col][__SIZE - 1 - cell.row]; }
  reachable(start, through) {
    const seen = new Set(), todo = (start instanceof Cell ? [start] : Array.from(start)).filter((c) => through(c));
    todo.forEach((c) => seen.add(c));
    while (todo.length) for (const n of todo.pop().neighbours) if (!seen.has(n) && through(n)) { seen.add(n); todo.push(n); }
    return this.cells.filter((c) => seen.has(c));
  }
  regions(same) {
    const group = new Map(), out = [];
    for (const c of this.cells) {
      if (group.has(c)) continue;
      const members = [c], todo = [c];
      group.set(c, out.length);
      while (todo.length) {
        const x = todo.pop();
        for (const n of x.neighbours) if (!group.has(n) && same(x, n)) { group.set(n, out.length); members.push(n); todo.push(n); }
      }
      out.push(members.sort((a, b) => a.row - b.row || a.col - b.col));
    }
    return out;
  }
  toString() { return this.#rows.map((row) => row.map((c) => c.symbol + c.colour[0].toUpperCase()).join(" ")).join("\\n"); }
}

function nextColour(colour) {
  if (!__NEXT_COLOUR.has(colour)) throw new Error(JSON.stringify(colour) + " is not a colour in this room");
  return __NEXT_COLOUR.get(colour);
}
${mixable ? `
function mix(a, b) {
  const m = __MIXES.get(a + "+" + b);
  return m === undefined ? null : m;
}
` : ""}
function __decode(wire) {
  const lines = wire.split("/");
  if (lines.length !== __SIZE) throw new Error("not a grid of this room");
  const rows = lines.map((line, r) => {
    const texts = line.split(",");
    if (texts.length !== __SIZE) throw new Error("not a grid of this room");
    return texts.map((text, k) => {
      const s = __CODES.get(text.slice(0, -1)), h = __LETTERS.get(text.slice(-1));
      if (s === undefined || h === undefined) throw new Error("not a grid of this room");
      const x = new Cell();
      x.row = r; x.col = k; x.symbol = __SYMBOLS[s]; x.value = __VALUES[s]; x.colour = __COLOURS[h];
${suited ? "      x.suit = __SUITS[s];\n" : ""}${faced ? "      x.isPicture = __PICTURES[s];\n" : ""}      return x;
    });
  });
  const at = (r, k) => (r >= 0 && r < __SIZE && k >= 0 && k < __SIZE ? rows[r][k] : null);
  rows.forEach((row, r) => row.forEach((x, k) => {
    x.left = at(r, k - 1); x.right = at(r, k + 1); x.up = at(r - 1, k); x.down = at(r + 1, k);
    x.upLeft = at(r - 1, k - 1); x.upRight = at(r - 1, k + 1); x.downLeft = at(r + 1, k - 1); x.downRight = at(r + 1, k + 1);
    Object.freeze(x);
  }));
  return new Grid(rows);
}
`;

  const dts = `
type Colour = string;
type Suit = "spades" | "hearts" | "diamonds" | "clubs";
/** Bigger is better; arrays compare like a league table (first number first). */
type Score = number | number[];

declare class Cell {
  private constructor();
  /** 0 = top row / left column. */
  readonly row: number;
  readonly col: number;
  /** What's printed on it: "7", "B", "K♥". */
  readonly symbol: string;
  /** Points: digits as they are, cards A=1 .. K=13. */
  readonly value: number;
  readonly colour: Colour;
${suited ? "  readonly suit: Suit;\n" : ""}${faced ? "  /** J, Q and K. */\n  readonly isPicture: boolean;\n" : ""}  readonly left: Cell | null;
  readonly right: Cell | null;
  readonly up: Cell | null;
  readonly down: Cell | null;
  readonly upLeft: Cell | null;
  readonly upRight: Cell | null;
  readonly downLeft: Cell | null;
  readonly downRight: Cell | null;
  /** The 2 to 4 cells touching its sides. */
  readonly neighbours: Cell[];
  /** The 3 to 8 cells around it, corners included. */
  readonly surrounding: Cell[];
  readonly onEdge: boolean;
}

declare class Grid {
  private constructor();
  readonly size: ${size};
  /** Row by row from the top-left. */
  readonly cells: Cell[];
  readonly rows: Cell[][];
  readonly columns: Cell[][];
  readonly diagonals: Cell[][];
  readonly edgeCells: Cell[];
  /** Every colour this kind of grid can use, in rainbow order. */
  readonly palette: Colour[];
  cell(row: number, col: number): Cell;
  quarterTurn(cell: Cell): Cell;
  reachable(start: Cell | readonly Cell[], through: (cell: Cell) => boolean): Cell[];
  regions(same: (a: Cell, b: Cell) => boolean): Cell[][];
}

declare function nextColour(colour: Colour): Colour;
${mixable ? "declare function mix(a: Colour, b: Colour): Colour | null;\n" : ""}declare function __decode(wire: string): Grid;
`;

  const helpers: HelperDoc[] = [
    helper("grid.size", "grid.size -> int", "grid.size: number", "How many cells wide (and tall) the grid is"),
    helper("grid.cells", "grid.cells -> list[Cell]", "grid.cells: Cell[]", "Every cell, row by row from the top-left"),
    helper("grid.rows", "grid.rows -> list[list[Cell]]", "grid.rows: Cell[][]", "The rows, top to bottom; each reads left to right"),
    helper("grid.columns", "grid.columns -> list[list[Cell]]", "grid.columns: Cell[][]", "The columns, left to right; each reads top to bottom"),
    helper("grid.diagonals", "grid.diagonals -> list[list[Cell]]", "grid.diagonals: Cell[][]", "The two long diagonals"),
    helper("grid.edge_cells", "grid.edge_cells -> list[Cell]", "grid.edgeCells: Cell[]", "The outside ring of cells"),
    helper("grid.cell", "grid.cell(row, col) -> Cell", "grid.cell(row: number, col: number): Cell", "One cell; grid.cell(0, 0) is the top-left"),
    helper("grid.palette", "grid.palette -> list[str]", "grid.palette: Colour[]", "Every colour this grid can use, in rainbow order"),
    helper("grid.reachable", "grid.reachable(start, through) -> list[Cell]", "grid.reachable(start: Cell | Cell[], through: (cell: Cell) => boolean): Cell[]",
      "Every cell you can walk to from start, only stepping on cells where through(cell) is True"),
    helper("grid.regions", "grid.regions(same) -> list[list[Cell]]", "grid.regions(same: (a: Cell, b: Cell) => boolean): Cell[][]",
      "Split the grid into groups of touching cells where same(a, b) is True"),
    helper("grid.quarter_turn", "grid.quarter_turn(cell) -> Cell", "grid.quarterTurn(cell: Cell): Cell",
      "Where cell lands when the grid turns a quarter turn clockwise"),
    helper("cell.row", "cell.row, cell.col -> int", "cell.row, cell.col: number", "Where the cell is (0 = top row / left column)"),
    helper("cell.colour", "cell.colour -> str", "cell.colour: Colour", `Its colour as a word: ${c.names.map(n => `"${n}"`).join(", ")}`),
    helper("cell.symbol", "cell.symbol -> str", "cell.symbol: string", `What's printed on it: "${s.glyphs[1]}", "${s.glyphs[s.count - 1]}"`),
    helper("cell.value", "cell.value -> int", "cell.value: number", s.suits ? "Points: A = 1, 2 to 10, J = 11, Q = 12, K = 13" : "Points: the digit's value"),
    helper("cell.left", "cell.left, .right, .up, .down -> Cell | None", "cell.left, .right, .up, .down: Cell | null", "The touching cell on that side, or None at the edge"),
    helper("cell.up_left", "cell.up_left, .up_right, .down_left, .down_right -> Cell | None",
      "cell.upLeft, .upRight, .downLeft, .downRight: Cell | null", "The corner cells, or None"),
    helper("cell.neighbours", "cell.neighbours -> list[Cell]", "cell.neighbours: Cell[]", "The 2 to 4 cells touching its sides"),
    helper("cell.surrounding", "cell.surrounding -> list[Cell]", "cell.surrounding: Cell[]", "The 3 to 8 cells around it, corners included"),
    helper("cell.on_edge", "cell.on_edge -> bool", "cell.onEdge: boolean", "True if it's in the outside ring"),
    ...(suited ? [helper("cell.suit", "cell.suit -> str", "cell.suit: Suit", `"spades", "hearts", "diamonds" or "clubs"`, "Suited")] : []),
    ...(faced ? [helper("cell.is_picture", "cell.is_picture -> bool", "cell.isPicture: boolean", "True for J, Q and K", "Faced")] : []),
    helper("next_colour", "next_colour(colour) -> str", "nextColour(colour: Colour): Colour",
      "The next colour round the rainbow; the last one goes back to the first", "Spectral"),
    ...(mixable ? [helper("mix", "mix(a, b) -> str | None", "mix(a: Colour, b: Colour): Colour | null",
      `The colour two paints make, or None: ${c.mixes.map(([a, b, m]) => `${c.names[a]} + ${c.names[b]} = ${c.names[m]}`).join(", ")}`, "Mixable")] : []),
  ];
  return { python, js: jsText, dts, helpers };
}
