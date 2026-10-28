"""The kid-facing grid API: what a utility function sees.

A god's utility function is one plain Python function, written for a 12-year-old to read:

    MY_COLOUR = "green"          # settings are UPPER_CASE constants, filled in when the card is dealt

    def utility(grid):
        points = 0
        for cell in grid.cells:
            if cell.colour == MY_COLOUR:
                points += 1
        return points            # bigger is better; only "which grid is better" matters

It may return a number, or a tuple for tie-breaks, read like a league table: `(points, goal_difference)`
compares points first and only looks at goal difference when the points are tied. Negative numbers
are fine and there is no maximum: the game turns "better than how many random grids" into rarity.

Everything here uses names, not indices: colours are names ("green"), symbols are what is printed on
the cell ("7", "B", "K♥"), and `value` is the points a symbol is worth (digits: the digit; cards:
A=1, 2..10, J=11, Q=12, K=13). Rows and columns count from 0 at the top-left.

Capability helpers exist only in GridTypes that have the capability (core.py names):
  Suited  -> cell.suit ("spades", "hearts", "diamonds", "clubs")
  Faced   -> cell.is_picture (J, Q, K)
  Spectral-> next_colour(colour)  (the next colour round the rainbow, wrapping)
  Mixable -> mix(a, b)            (the colour two paints make, or None)

`run_card(source, grid, gtype)` runs a card's source in a small sandbox: no imports, no randomness,
no clock, only a whitelist of builtins. Utility functions must be deterministic.
CLI: python3 -m gridlab.kid FILE [--type 5,cards,rainbow6] [--seed 0] [-n 3]   (run a card on random grids)
     python3 -m gridlab.kid --gallery                                          (every shortlisted card)
"""
from __future__ import annotations

import argparse
import builtins
from typing import Callable, Iterable, Optional

import numpy as np

from .core import COLOUR_NAMES, MIXES, RANK_GLYPHS, DIGIT_GLYPHS, GridType, Grid as LabGrid, spawn

SUIT_NAMES = ("spades", "hearts", "diamonds", "clubs")
SUIT_GLYPHS = "♠♥♦♣"


class Cell:
    """One square of the grid. Touching cells are `left`, `right`, `up`, `down` (None off the edge)."""
    __slots__ = ("row", "col", "symbol", "value", "colour", "_suit", "_picture", "_grid",
                 "left", "right", "up", "down", "up_left", "up_right", "down_left", "down_right")

    def __init__(self, grid: "Grid", row: int, col: int, symbol: str, value: int, colour: str,
                 suit: Optional[str], picture: Optional[bool]):
        self._grid = grid
        self.row, self.col = row, col
        self.symbol, self.value, self.colour = symbol, value, colour
        self._suit, self._picture = suit, picture

    # --- capabilities (cards only) ---------------------------------------------------------------
    @property
    def suit(self) -> str:
        """"spades", "hearts", "diamonds" or "clubs" (card grids only)."""
        if self._suit is None:
            raise AttributeError("cell.suit only exists on card grids")
        return self._suit

    @property
    def is_picture(self) -> bool:
        """True for J, Q and K (card grids only)."""
        if self._picture is None:
            raise AttributeError("cell.is_picture only exists on card grids")
        return self._picture

    # --- neighbours ------------------------------------------------------------------------------
    @property
    def neighbours(self) -> list["Cell"]:
        """The 2 to 4 cells touching this one along a side (left, right, up, down)."""
        return [c for c in (self.left, self.right, self.up, self.down) if c is not None]

    @property
    def surrounding(self) -> list["Cell"]:
        """The 3 to 8 cells around this one, corners included."""
        return [c for c in (self.up_left, self.up, self.up_right, self.left, self.right,
                            self.down_left, self.down, self.down_right) if c is not None]

    @property
    def on_edge(self) -> bool:
        """True for cells in the outside ring of the grid."""
        n = self._grid.size - 1
        return self.row in (0, n) or self.col in (0, n)

    def __repr__(self):
        return f"Cell(row={self.row}, col={self.col}, {self.symbol} {self.colour})"


class Grid:
    """An N×N grid of cells. Build one from a lab grid with `Grid.from_lab(g, gtype)`."""

    def __init__(self, size: int, cells: list[list[Cell]] | None = None, palette: tuple[str, ...] = ()):
        self.size = size
        self.palette = list(palette)      # every colour this kind of grid can use, in rainbow order
        self._rows = cells or []

    @classmethod
    def from_lab(cls, g: LabGrid, gtype: GridType) -> "Grid":
        N, cards = gtype.N, gtype.symbols == "cards"
        names = COLOUR_NAMES[gtype.colours]
        grid = cls(N, palette=names)
        sym, col = g.sym.tolist(), g.col.tolist()
        rows = []
        for r in range(N):
            row = []
            for c in range(N):
                s = sym[r][c]
                if cards:
                    glyph, value = RANK_GLYPHS[s % 13] + SUIT_GLYPHS[s // 13], s % 13 + 1
                    suit, picture = SUIT_NAMES[s // 13], s % 13 >= 10
                else:
                    glyph, value, suit, picture = DIGIT_GLYPHS[s], s, None, None
                row.append(Cell(grid, r, c, glyph, value, names[col[r][c]], suit, picture))
            rows.append(row)
        def at(rr, cc):
            return rows[rr][cc] if 0 <= rr < N and 0 <= cc < N else None

        for r in range(N):
            for c in range(N):
                x = rows[r][c]
                x.left, x.right, x.up, x.down = at(r, c - 1), at(r, c + 1), at(r - 1, c), at(r + 1, c)
                x.up_left, x.up_right = at(r - 1, c - 1), at(r - 1, c + 1)
                x.down_left, x.down_right = at(r + 1, c - 1), at(r + 1, c + 1)
        grid._rows = rows
        return grid

    # --- looking at cells ----------------------------------------------------------------------------
    @property
    def cells(self) -> list[Cell]:
        """Every cell, row by row from the top-left."""
        return [c for row in self._rows for c in row]

    @property
    def rows(self) -> list[list[Cell]]:
        """The rows, top to bottom; each row reads left to right."""
        return [list(row) for row in self._rows]

    @property
    def columns(self) -> list[list[Cell]]:
        """The columns, left to right; each column reads top to bottom."""
        return [[row[c] for row in self._rows] for c in range(self.size)]

    @property
    def diagonals(self) -> list[list[Cell]]:
        """The two long diagonals: top-left to bottom-right, then top-right to bottom-left."""
        n = self.size
        return [[self._rows[i][i] for i in range(n)], [self._rows[i][n - 1 - i] for i in range(n)]]

    @property
    def edge_cells(self) -> list[Cell]:
        """The outside ring of cells, row by row."""
        return [c for c in self.cells if c.on_edge]

    def cell(self, row: int, col: int) -> Cell:
        """The cell at (row, col), counting from 0 at the top-left."""
        return self._rows[row][col]

    def quarter_turn(self, cell: Cell) -> Cell:
        """Where `cell` lands if the whole grid is turned a quarter turn clockwise."""
        return self._rows[cell.col][self.size - 1 - cell.row]

    # --- helpers a 12-year-old shouldn't have to hand-write -------------------------------------------
    def reachable(self, start: Cell | Iterable[Cell], through: Callable[[Cell], bool]) -> list[Cell]:
        """Flood fill: every cell you can walk to from `start` (one cell or a list of cells), stepping
        left/right/up/down, and only ever standing on cells where `through(cell)` is True.
        Start cells where `through` is False are skipped. Returned in grid order."""
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

    def regions(self, same: Callable[[Cell, Cell], bool]) -> list[list[Cell]]:
        """Split the grid into connected groups: two touching cells are in the same group when
        `same(a, b)` is True. Every cell is in exactly one group (a lonely cell is a group of 1).
        Groups come in grid order of their first cell, and each group is in grid order."""
        group: dict[Cell, int] = {}
        out: list[list[Cell]] = []
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
        return "\n".join(" ".join(f"{c.symbol}{c.colour[0].upper()}".rjust(4) for c in row) for row in self._rows)


# --- capability helpers (installed per GridType by `card_globals`) -------------------------------------
def _next_colour_for(palette: tuple[str, ...]):
    def next_colour(colour: str) -> str:
        """The next colour round the rainbow; the last colour wraps back to the first."""
        return palette[(palette.index(colour) + 1) % len(palette)]
    return next_colour


def _mix_for(colours: str):
    table = MIXES[colours]

    def mix(a: str, b: str) -> Optional[str]:
        """The colour you get by mixing paints a and b, or None if they don't mix."""
        return table.get((a, b)) or table.get((b, a))
    return mix


SAFE_BUILTINS = {k: getattr(builtins, k) for k in (
    "abs", "all", "any", "bool", "dict", "enumerate", "filter", "int", "isinstance", "len", "list", "map",
    "max", "min", "print", "range", "reversed", "round", "set", "sorted", "str", "sum", "tuple", "zip",
    "True", "False", "None", "ValueError", "AttributeError")}


def card_globals(gtype: GridType) -> dict:
    """The names a card can use without importing anything, for this GridType."""
    g = {"__builtins__": SAFE_BUILTINS, "__name__": "card"}
    caps = gtype.caps
    if "Spectral" in caps:
        g["next_colour"] = _next_colour_for(COLOUR_NAMES[gtype.colours])
    if "Mixable" in caps:
        g["mix"] = _mix_for(gtype.colours)
    return g


def load_card(source: str, gtype: GridType) -> Callable[[Grid], object]:
    """Compile a card's source in the sandbox and return its `utility` function."""
    ns = card_globals(gtype)
    exec(compile(source, "<card>", "exec"), ns)
    fn = ns.get("utility")
    if not callable(fn):
        raise ValueError("a card must define `def utility(grid):`")
    return fn


def run_card(source: str, grid: LabGrid, gtype: GridType):
    return load_card(source, gtype)(Grid.from_lab(grid, gtype))


def main(argv=None):
    ap = argparse.ArgumentParser(prog="gridlab.kid", description="Run a utility-function card on random grids")
    ap.add_argument("file", nargs="?")
    ap.add_argument("--gallery", action="store_true", help="print every shortlisted card (markdown)")
    ap.add_argument("--type", default="5,base10,rgby", help="size,symbols,colours")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("-n", type=int, default=1, help="number of random grids")
    a = ap.parse_args(argv)
    if a.gallery:
        from .rules.cards import gallery
        print(gallery())
        return
    if not a.file:
        ap.error("give a card FILE or --gallery")
    n, s, c = a.type.split(",")
    gtype = GridType(int(n), s, c)
    utility = load_card(open(a.file).read(), gtype)
    rng = np.random.default_rng(a.seed)
    for _ in range(a.n):
        g = Grid.from_lab(spawn(gtype, rng), gtype)
        print(g)
        print("utility =", utility(g), "\n")


if __name__ == "__main__":
    main()
