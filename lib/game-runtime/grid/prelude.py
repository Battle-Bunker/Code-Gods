"""Trusted Grid prelude: what a Grid agent sees in the Python sandbox.

An agent for a Grid room is one expression that evaluates to a function from a read-only grid to a
LIST of mutator calls, e.g.  lambda grid: [paint(row(0), "red")].  It can change the grid ONLY
through those calls; the host validates, prices and applies them.

This file is plain Python with no I/O; its only import is the standard json encoder. The runner
executes it once during trusted bootstrap and runs `_warm()` (so it lives, already specialised by
the adaptive interpreter, in the restored snapshot), then per execution calls `_job(...)` outside
the guest budget. Host tests import it directly. Mirror of grid/prelude.js: keep them in step.

Index conventions match lib/game-core/src/grid.ts and lib/grid-lab/gridlab/core.py:
  symbols  digit sets: index = digit value; cards: index = suit * 13 + rank (A,2..10,J,Q,K; ♠ ♥ ♦ ♣)
  colours  rainbow order: rgb = R G B, rgby = R Y G B, rainbow6 = R O Y G B V
Calls are encoded as {"m": <mutator id>, "p": <Grid Lab params>} with tuples as arrays.
"""

_SIZES = (3, 4, 5, 6, 7)
_DIGITS = "0123456789ABCDEF"
_DIGIT_SETS = {"base10": 10, "base12": 12, "base16": 16}
_RANK_CODES = "A23456789TJQK"
_RANK_GLYPHS = ("A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K")
_SUIT_CODES = "SHDC"
_SUIT_GLYPHS = "♠♥♦♣"
_SUIT_NAMES = ("spades", "hearts", "diamonds", "clubs")
_PALETTES = {
    "rgb": ("red", "green", "blue"),
    "rgby": ("red", "yellow", "green", "blue"),
    "rainbow6": ("red", "orange", "yellow", "green", "blue", "violet"),
}
_LETTERS = {"red": "R", "orange": "O", "yellow": "Y", "green": "G", "blue": "B", "violet": "V"}
# Paint mixing, in Grid Lab's MIXES order: (parent, parent, child).
_MIXES = {
    "rgb": (),
    "rgby": (("yellow", "blue", "green"),),
    "rainbow6": (("red", "yellow", "orange"), ("yellow", "blue", "green"), ("red", "blue", "violet")),
}
_MOVES = ("rot90", "rot180", "rot270", "flipH", "flipV", "transpose", "antitranspose")
_FOLDS = ("left->right", "right->left", "top->bottom", "bottom->top",
          "below->above diagonal", "above->below diagonal",
          "below->above other diagonal", "above->below other diagonal")
_LAYERS = ("both", "colour", "symbol")
_STYLES = {"stripes across": ("stripes", 0), "stripes down": ("stripes", 1),
           "diagonal": ("diagonal", 0), "other diagonal": ("diagonal", 1), "checker": ("checker", None)}
_KEYS = ("parity", "mod", "redblack")
_MAX_CALLS = 8
_MAX_OUTPUT = 8192
_KIND_TEXT = {"cell": "one cell (at)", "line": "a row or column", "line*": "busiest_line()",
              "diag": "a diagonal", "block": "a square", "ring": "a ring", "core": "middle()",
              "all": "everywhere()"}
_READ_ONLY = "grids are read-only: change them by returning moves like [paint(row(0), \"red\")]"
_mappingproxy = type(type.__dict__)
_tuple_new = tuple.__new__
_second = __import__("operator").itemgetter(1)
_INDEX = __import__("operator").attrgetter("_index")


def _json_encoder():
    """Compact ASCII JSON (byte-identical to the JS prelude's), via the C encoder when present."""
    encoder = __import__("json").encoder

    def refuse(o):
        raise TypeError("unencodable parameter")
    if encoder.c_make_encoder is None:   # pragma: no cover - every supported build has _json
        return __import__("json").JSONEncoder(separators=(",", ":")).encode
    chunks = encoder.c_make_encoder(None, refuse, encoder.encode_basestring_ascii, None, ":", ",",
                                    False, False, True)
    return lambda o: "".join(chunks(o, 0))


_encode_json = _json_encoder()


class _GridError(ValueError):
    """A move or grid helper was used in a way that can't work. The message is for the player."""


class _Cell:
    """One square of the grid. Touching cells are left, right, up, down (None off the edge)."""
    # _sides, _around, _index and _edge are precomputed at decode time (outside the guest budget).
    __slots__ = ("row", "col", "symbol", "value", "colour", "_suit", "_picture", "_sides", "_around",
                 "_index", "_edge",
                 "left", "right", "up", "down", "up_left", "up_right", "down_left", "down_right")

    def __setattr__(self, name, value):
        raise AttributeError(_READ_ONLY)

    def __delattr__(self, name):
        raise AttributeError(_READ_ONLY)

    @property
    def suit(self):
        """"spades", "hearts", "diamonds" or "clubs" (card grids only)."""
        if self._suit is None:
            raise AttributeError("cell.suit only exists on card grids")
        return self._suit

    @property
    def is_picture(self):
        """True for J, Q and K (card grids only)."""
        if self._picture is None:
            raise AttributeError("cell.is_picture only exists on card grids")
        return self._picture

    @property
    def neighbours(self):
        """The 2 to 4 cells touching this one along a side (left, right, up, down)."""
        return list(self._sides)

    @property
    def surrounding(self):
        """The 3 to 8 cells around this one, corners included."""
        return list(self._around)

    @property
    def on_edge(self):
        """True for cells in the outside ring of the grid."""
        return self._edge

    def __repr__(self):
        return f"Cell(row={self.row}, col={self.col}, {self.symbol} {self.colour})"


class _Grid:
    """A read-only N×N grid of cells (the same API utility functions see)."""
    __slots__ = ("size", "_rows", "_cells", "_edge_cells", "_palette", "_env")

    def __setattr__(self, name, value):
        raise AttributeError(_READ_ONLY)

    def __delattr__(self, name):
        raise AttributeError(_READ_ONLY)

    @property
    def cells(self):
        """Every cell, row by row from the top-left."""
        return list(self._cells)

    @property
    def rows(self):
        """The rows, top to bottom; each row reads left to right."""
        return [list(row) for row in self._rows]

    @property
    def columns(self):
        """The columns, left to right; each column reads top to bottom."""
        return [[row[c] for row in self._rows] for c in range(self.size)]

    @property
    def diagonals(self):
        """The two long diagonals: top-left to bottom-right, then top-right to bottom-left."""
        n = self.size
        return [[self._rows[i][i] for i in range(n)], [self._rows[i][n - 1 - i] for i in range(n)]]

    @property
    def edge_cells(self):
        """The outside ring of cells, row by row."""
        return list(self._edge_cells)

    @property
    def palette(self):
        """Every colour this kind of grid can use, in rainbow order."""
        return list(self._palette)

    def cell(self, row, col):
        """The cell at (row, col), counting from 0 at the top-left."""
        n = self.size
        if type(row) is not int or not 0 <= row < n:
            self._env.fail(f"row {_show(row)} doesn't exist on a {n}×{n} grid (rows go from 0 to {n - 1})")
        if type(col) is not int or not 0 <= col < n:
            self._env.fail(f"column {_show(col)} doesn't exist on a {n}×{n} grid (columns go from 0 to {n - 1})")
        return self._rows[row][col]

    def quarter_turn(self, cell):
        """Where `cell` lands if the whole grid is turned a quarter turn clockwise."""
        return self._rows[cell.col][self.size - 1 - cell.row]

    def reachable(self, start, through):
        """Flood fill: every cell you can walk to from `start` (one cell or a list of cells), stepping
        left/right/up/down and only standing on cells where `through(cell)` is True. Grid order."""
        starts = [start] if isinstance(start, _Cell) else list(start)
        seen = set()
        todo = [c for c in starts if through(c)]
        seen.update(todo)
        while todo:
            for n in todo.pop()._sides:
                if n not in seen and through(n):
                    seen.add(n)
                    todo.append(n)
        return [c for c in self._cells if c in seen]

    def regions(self, same):
        """Split the grid into connected groups: touching cells a, b share a group when same(a, b).
        Groups come in grid order of their first cell; each group is in grid order."""
        grouped = set()
        out = []
        for c in self._cells:
            if c in grouped:
                continue
            grouped.add(c)
            members, todo = [c], [c]
            while todo:
                x = todo.pop()
                for n in x._sides:
                    if n not in grouped and same(x, n):
                        grouped.add(n)
                        members.append(n)
                        todo.append(n)
            members.sort(key=_INDEX)
            out.append(members)
        return out

    def __repr__(self):
        return "\n".join(" ".join(f"{c.symbol}{c.colour[0].upper()}".rjust(4) for c in row)
                         for row in self._rows)


class _Region(tuple):
    """A place on the grid that a move acts on: (kind, value). Make one with row(), at(), ..."""
    __slots__ = ()
    kind = property(lambda self: self[0], doc="cell, line, line*, diag, block, ring, core or all")
    value = property(lambda self: self[1], doc="Grid Lab's region value for that kind")

    def __repr__(self):
        k, v = self[0], self[1]
        if k == "cell":
            return f"at({v[0]}, {v[1]})"
        if k == "line":
            return f"{'row' if v[0] == 0 else 'column'}({v[1]})"
        if k == "diag":
            return f"diagonal({v})"
        if k == "block":
            return f"square({v[0]}, {v[1]}, {v[2]})"
        if k == "ring":
            return f"ring({v})"
        return {"line*": "busiest_line()", "core": "middle()", "all": "everywhere()"}[k]


class _Call(tuple):
    """One move: (mutator id, its wire form {"m": id, "p": Grid Lab parameters in field order})."""
    __slots__ = ()
    m = property(lambda self: self[0], doc="the mutator id")
    p = property(lambda self: _mappingproxy(dict(self[1]["p"])), doc="its Grid Lab parameters (read-only)")

    def __repr__(self):
        return _encode_json(self[1])


_CALL_ONLY = frozenset((_Call,))


def _new(cls, **fields):
    obj = object.__new__(cls)
    for k, v in fields.items():
        object.__setattr__(obj, k, v)
    return obj


def _show(x):
    """A short, readable rendering of a player-supplied value for error messages."""
    if type(x) is str:
        return '"' + (x if len(x) <= 24 else x[:24] + "...") + '"'
    if type(x) is int or type(x) is bool or x is None:
        return str(x)
    if type(x) is _Cell:
        return f"the cell at row {x.row}, column {x.col}"
    if type(x) is _Region:
        return repr(x)
    if type(x) is _Call:
        return f"a {x[0]} move"
    return "a " + type(x).__name__


class _Env:
    """The GridType environment: tables, region helpers and one constructor per mutator."""

    def __init__(self, size, symbols, colours, record=None):
        if size not in _SIZES or symbols not in ("base10", "base12", "base16", "cards") \
                or colours not in _PALETTES:
            raise ValueError("Unsupported GridType")
        self.N = size
        self.cards = symbols == "cards"
        self.S = 52 if self.cards else _DIGIT_SETS[symbols]
        self.ranks = 13 if self.cards else self.S
        self.palette = _PALETTES[colours]
        self.C = len(self.palette)
        self.mixes = tuple(tuple(self.palette.index(n) for n in m) for m in _MIXES[colours])
        if self.cards:
            self.glyphs = tuple(_RANK_GLYPHS[s % 13] + _SUIT_GLYPHS[s // 13] for s in range(52))
            self.codes = tuple(_RANK_CODES[s % 13] + _SUIT_CODES[s // 13] for s in range(52))
        else:
            self.glyphs = self.codes = tuple(_DIGITS[s] for s in range(self.S))
        self.symbol_index = {}
        for i in range(self.S):
            self.symbol_index[self.codes[i]] = i
            self.symbol_index[self.glyphs[i]] = i
        self.record = record
        self.mutators = tuple(m for m in (
            "swap_cells", "shift_line", "reverse_line", "swap_lines", "turn_block", "turn_grid",
            "sort_line", "mirror_fold",
            "paint", "recolour", "swap_colours", "hue_turn", "pattern_line", "motif", "majority_line",
            "write", "step_rank", "write_ramp", "swap_symbols", "flatten",
            "paint_by_key", "stamp", "tally", "blend", "suit_swap", "suit_set",
        ) if not (m == "tally" and self.cards) and not (m == "blend" and not self.mixes)
            and not (m in ("suit_swap", "suit_set") and not self.cards))

    # --- plumbing ------------------------------------------------------------------------------
    def fail(self, message, code="EXECUTION"):
        error = _GridError(message)
        if self.record is not None:
            self.record["error"] = error
            self.record["code"] = code
            self.record["message"] = message
        raise error

    def names(self):
        """The public names an agent sees, for this GridType."""
        out = {}
        for name in ("row", "column", "at", "diagonal", "square", "ring", "middle", "everywhere",
                     "busiest_line", "next_colour") + self.mutators:
            out[name] = getattr(self, name)
        if self.mixes:
            out["mix"] = self.mix
        return out

    def call(self, m, p):
        return _tuple_new(_Call, (m, {"m": m, "p": p}))

    def region(self, kind, value):
        return _tuple_new(_Region, (kind, value))

    def grid(self, text):
        """Decode a canonical grid string (already validated by the host)."""
        n = self.N
        cells = [[None] * n for _ in range(n)]
        lines = text.split("/")
        letters = {_LETTERS[name]: name for name in self.palette}
        for r in range(n):
            items = lines[r].split(",")
            for c in range(n):
                code, colour = items[c][:-1], letters[items[c][-1]]
                s = self.symbol_index[code]
                if self.cards:
                    value, suit, picture = s % 13 + 1, _SUIT_NAMES[s // 13], s % 13 >= 10
                else:
                    value, suit, picture = s, None, None
                cells[r][c] = _new(_Cell, row=r, col=c, symbol=self.glyphs[s], value=value,
                                   colour=colour, _suit=suit, _picture=picture, _index=r * n + c,
                                   _edge=r in (0, n - 1) or c in (0, n - 1))

        def at(rr, cc):
            return cells[rr][cc] if 0 <= rr < n and 0 <= cc < n else None
        for r in range(n):
            for c in range(n):
                x = cells[r][c]
                near = {"left": at(r, c - 1), "right": at(r, c + 1), "up": at(r - 1, c), "down": at(r + 1, c),
                        "up_left": at(r - 1, c - 1), "up_right": at(r - 1, c + 1),
                        "down_left": at(r + 1, c - 1), "down_right": at(r + 1, c + 1)}
                for name, value in near.items():
                    object.__setattr__(x, name, value)
                object.__setattr__(x, "_sides", tuple(
                    near[k] for k in ("left", "right", "up", "down") if near[k] is not None))
                object.__setattr__(x, "_around", tuple(
                    near[k] for k in ("up_left", "up", "up_right", "left", "right", "down_left", "down", "down_right")
                    if near[k] is not None))
        flat = tuple(c for row in cells for c in row)
        return _new(_Grid, size=n, _rows=cells, _cells=flat, _edge_cells=tuple(c for c in flat if c._edge),
                    _palette=self.palette, _env=self)

    def encode(self, calls):
        """The agent's result as the wire JSON. Untrusted-equivalent: the host re-validates it."""
        if type(calls) is not list:
            if type(calls) is _Call:
                self.fail("the agent must return a list of moves: put the move in square brackets, "
                          f"like [{calls[0]}(...)]", "DOMAIN")
            self.fail(f"the agent must return a list of moves, like [paint(row(0), \"red\")], "
                      f"not {_show(calls)}", "DOMAIN")
        if len(calls) > _MAX_CALLS:
            self.fail(f"an agent can make at most {_MAX_CALLS} moves at a time; this one made {len(calls)}",
                      "DOMAIN")
        if not set(map(type, calls)) <= _CALL_ONLY:
            for i, c in enumerate(calls):
                if type(c) is not _Call:
                    self.fail(f"item {i} of the agent's list isn't a move (it is {_show(c)})", "DOMAIN")
        # One C-accelerated encode, compact separators: byte-identical to the JS prelude's text.
        text = _encode_json(list(map(_second, calls)))
        if type(text) is not str or len(text) > _MAX_OUTPUT or not text.isascii():
            self.fail("the agent's moves are too long to send", "DOMAIN")
        return text

    # --- argument readers ---------------------------------------------------------------------
    def int_in(self, x, low, high, what):
        if not type(x) is int or not low <= x <= high:
            self.fail(f"{what} should be a whole number from {low} to {high}, not {_show(x)}")
        return x

    def pos(self, x, name):
        """A position: a cell, at(r, c), or (row, col)."""
        if type(x) is _Cell:
            return (x.row, x.col)
        if type(x) is _Region and x[0] == "cell":
            return x[1]
        if type(x) in (tuple, list) and len(x) == 2 and type(x[0]) is int and type(x[1]) is int:
            return self.at(x[0], x[1])[1]
        self.fail(f"{name} needs cells, like grid.cell(0, 1), at(0, 1) or (0, 1), not {_show(x)}")

    def where(self, x, name, kinds):
        if type(x) is _Region:
            reg = x
        elif type(x) is _Cell or (type(x) in (tuple, list) and len(x) == 2
                                   and type(x[0]) is int and type(x[1]) is int):
            reg = self.region("cell", self.pos(x, name))
        else:
            self.fail(f"{name} needs a place on the grid, like row(0), at(2, 3), square(0, 0) or "
                      f"everywhere(), not {_show(x)}")
        if reg[0] not in kinds:
            allowed = ", ".join(_KIND_TEXT[k] for k in kinds if not (k == "core" and self.N < 4))
            self.fail(f"{name} can't use {_KIND_TEXT[reg[0]]}; it works on {allowed}")
        return reg

    def line(self, x, name):
        if type(x) is _Region and x[0] == "line":
            return x[1]
        self.fail(f"{name} needs a row or a column, like row(0) or column(2), not {_show(x)}")

    def colour(self, x):
        if type(x) is str and x in self.palette:
            return self.palette.index(x)
        if type(x) is int and 0 <= x < self.C:
            return x
        self.fail(f"{_show(x)} isn't a colour on this grid; use one of {', '.join(self.palette)} "
                  f"(or 0 to {self.C - 1})")

    def symbol(self, x):
        if type(x) is str and x in self.symbol_index:
            return self.symbol_index[x]
        if type(x) is int and 0 <= x < self.S:
            return x
        if self.cards:
            self.fail(f"{_show(x)} isn't a card; use a card like \"7♥\" or \"QS\", or 0 to 51")
        self.fail(f"{_show(x)} isn't a symbol on this grid; use {self.glyphs[0]} to {self.glyphs[-1]} "
                  f"(or 0 to {self.S - 1})")

    def rank(self, x):
        """A number in counting order. Digits: the digit. Cards: its value A=1 .. K=13, or a rank."""
        if self.cards:
            if type(x) is int and 1 <= x <= 13:
                return x - 1
            if type(x) is str:
                if x in _RANK_GLYPHS:
                    return _RANK_GLYPHS.index(x)
                if len(x) == 1 and x in _RANK_CODES:
                    return _RANK_CODES.index(x)
                if x in self.symbol_index:
                    return self.symbol_index[x] % 13
            self.fail(f"{_show(x)} isn't a card number; use 1 (ace) to 13 (king), or \"A\", \"2\" ... \"10\", "
                      f"\"J\", \"Q\", \"K\"")
        if type(x) is int and 0 <= x < self.S:
            return x
        if type(x) is str and x in self.symbol_index:
            return self.symbol_index[x]
        self.fail(f"{_show(x)} isn't a number on this grid; use 0 to {self.S - 1}")

    def suit_of(self, x):
        if type(x) is str:
            for i in range(4):
                if x in (_SUIT_NAMES[i], _SUIT_GLYPHS[i], _SUIT_CODES[i]):
                    return i
        if type(x) is int and 0 <= x < 4:
            return x
        self.fail(f"{_show(x)} isn't a suit; use \"spades\", \"hearts\", \"diamonds\" or \"clubs\"")

    def layer(self, x):
        if type(x) is str and x in _LAYERS:
            return x
        self.fail(f"layer should be \"both\", \"colour\" or \"symbol\", not {_show(x)}")

    def flag(self, x, name):
        if type(x) is not bool:
            self.fail(f"{name} should be True or False, not {_show(x)}")
        return x

    def steps(self, x, modulus, what):
        if not type(x) is int:
            self.fail(f"{what} should be a whole number of steps, not {_show(x)}")
        k = x % modulus
        if k == 0:
            self.fail(f"{what} by {x} steps changes nothing; use 1 to {modulus - 1} steps")
        return k

    def pair(self, a, b, read, name, ordered):
        x, y = read(a), read(b)
        if x == y:
            self.fail(f"{name} needs two different values, not {_show(a)} twice")
        return (x, y) if ordered or x < y else (y, x)

    def area(self, name, kinds, where):
        reg = self.where(where, name, kinds)
        return {"kind": reg[0], "region": reg[1]}

    # --- regions --------------------------------------------------------------------------------
    def row(self, i):
        """The row i (0 is the top row)."""
        n = self.N
        if not type(i) is int or not 0 <= i < n:
            self.fail(f"row {_show(i)} doesn't exist on a {n}×{n} grid (rows go from 0 to {n - 1})")
        return self.region("line", (0, i))

    def column(self, i):
        """The column i (0 is the left column)."""
        n = self.N
        if not type(i) is int or not 0 <= i < n:
            self.fail(f"column {_show(i)} doesn't exist on a {n}×{n} grid (columns go from 0 to {n - 1})")
        return self.region("line", (1, i))

    def at(self, row, col=None):
        """One cell: at(row, col), or at(cell)."""
        if col is None and type(row) is _Cell:
            return self.region("cell", (row.row, row.col))
        if col is None and type(row) in (tuple, list) and len(row) == 2:
            row, col = row
        n = self.N
        if not type(row) is int or not 0 <= row < n:
            self.fail(f"row {_show(row)} doesn't exist on a {n}×{n} grid (rows go from 0 to {n - 1})")
        if not type(col) is int or not 0 <= col < n:
            self.fail(f"column {_show(col)} doesn't exist on a {n}×{n} grid (columns go from 0 to {n - 1})")
        return self.region("cell", (row, col))

    def diagonal(self, i=0):
        """diagonal(0): top-left to bottom-right; diagonal(1): top-right to bottom-left."""
        if not type(i) is int or i not in (0, 1):
            self.fail(f"diagonal {_show(i)} doesn't exist: diagonal(0) runs from the top-left corner to the "
                      "bottom-right, diagonal(1) from the top-right to the bottom-left")
        return self.region("diag", i)

    def square(self, row, col=None, size=2):
        """A 2×2 or 3×3 square whose top-left cell is (row, col); or square(cell, size)."""
        if type(row) is _Cell:
            row, col, size = row.row, row.col, (2 if col is None else col)
        n = self.N
        sizes = tuple(k for k in (2, 3) if k < n)
        if not type(size) is int or size not in sizes:
            self.fail(f"a square can be {' or '.join(str(k) for k in sizes)} cells wide on a {n}×{n} grid, "
                      f"not {_show(size)}")
        top = n - size
        if not type(row) is int or not type(col) is int or not 0 <= row <= top or not 0 <= col <= top:
            self.fail(f"a {size}×{size} square at row {_show(row)}, column {_show(col)} doesn't fit on a "
                      f"{n}×{n} grid (its top-left cell can be at rows and columns 0 to {top})")
        return self.region("block", (row, col, size))

    def ring(self, depth=0):
        """ring(0) is the outside edge; ring(1) the ring inside it, and so on to the centre."""
        n = self.N
        deepest = (n + 1) // 2 - 1
        if not type(depth) is int or not 0 <= depth <= deepest:
            self.fail(f"ring {_show(depth)} doesn't exist on a {n}×{n} grid (rings go from 0, the outside "
                      f"edge, to {deepest} in the middle)")
        return self.region("ring", depth)

    def middle(self):
        """Everything except the outside edge (grids 4 wide or more)."""
        if self.N < 4:
            self.fail(f"middle() needs a grid at least 4 cells wide; on a {self.N}×{self.N} grid use at(1, 1)")
        return self.region("core", ())

    def everywhere(self):
        """The whole grid."""
        return self.region("all", ())

    def busiest_line(self):
        """Whichever row or column already has the most of what the move puts there."""
        return self.region("line*", ())

    # --- capability helpers ----------------------------------------------------------------------
    def next_colour(self, colour):
        """The next colour round the rainbow; the last colour wraps back to the first."""
        if type(colour) is not str or colour not in self.palette:
            self.fail(f"{_show(colour)} isn't a colour on this grid; use one of {', '.join(self.palette)}")
        return self.palette[(self.palette.index(colour) + 1) % self.C]

    def mix(self, a, b):
        """The colour you get by mixing paints a and b, or None if they don't mix."""
        for name in (a, b):
            if type(name) is not str or name not in self.palette:
                self.fail(f"{_show(name)} isn't a colour on this grid; use one of {', '.join(self.palette)}")
        x, y = self.palette.index(a), self.palette.index(b)
        for p, q, child in self.mixes:
            if (x, y) in ((p, q), (q, p)):
                return self.palette[child]
        return None

    # --- mutators: positional bijections ---------------------------------------------------------
    def swap_cells(self, a, b, layer="both"):
        """Swap two cells, or just their colours (layer="colour") or symbols (layer="symbol")."""
        layer = self.layer(layer)
        x, y = self.pos(a, "swap_cells"), self.pos(b, "swap_cells")
        if x == y:
            self.fail("swap_cells needs two different cells")
        x, y = (x, y) if x < y else (y, x)
        near = "next door" if abs(x[0] - y[0]) + abs(x[1] - y[1]) == 1 else "anywhere"
        return self.call("swap_cells", {"layer": layer, "near": near, "pair": (x, y)})

    def shift_line(self, line, k=1, layer="both"):
        """Slide a row (to the right) or column (down) by k steps, wrapping round. Negative k slides back."""
        layer = self.layer(layer)
        ln = self.line(line, "shift_line")
        return self.call("shift_line", {"layer": layer, "line": ln, "k": self.steps(k, self.N, "sliding")})

    def reverse_line(self, line, layer="both"):
        """Read a row or column backwards."""
        layer = self.layer(layer)
        return self.call("reverse_line", {"layer": layer, "line": self.line(line, "reverse_line")})

    def swap_lines(self, a, b):
        """Swap two whole rows, or two whole columns."""
        x, y = self.line(a, "swap_lines"), self.line(b, "swap_lines")
        if x[0] != y[0]:
            self.fail("swap_lines needs two rows or two columns, not one of each")
        if x[1] == y[1]:
            self.fail("swap_lines needs two different lines")
        return self.call("swap_lines", {"axis": x[0], "pair": (min(x[1], y[1]), max(x[1], y[1]))})

    def move(self, move):
        if type(move) is not str or move not in _MOVES:
            self.fail(f"{_show(move)} isn't a move; use one of {', '.join(_MOVES)}")
        return move

    def turn_block(self, square, move):
        """Turn or flip a square: move is "rot90" (a quarter turn anticlockwise), "rot180", "rot270",
        "flipH", "flipV", "transpose" or "antitranspose"."""
        reg = self.where(square, "turn_block", ("block",))
        return self.call("turn_block", {"kind": "block", "region": reg[1], "move": self.move(move)})

    def turn_grid(self, move):
        """Turn or flip the whole grid (moves as for turn_block)."""
        return self.call("turn_grid", {"move": self.move(move)})

    # --- mutators: positional overwrites ---------------------------------------------------------
    def sort_line(self, line, backwards=False):
        """Sort a row or column into counting order, smallest first (or biggest first if backwards)."""
        ln = self.line(line, "sort_line")
        return self.call("sort_line", {"line": ln, "dir": -1 if self.flag(backwards, "backwards") else 1})

    def mirror_fold(self, where, fold, layer="both"):
        """Copy one half onto the other as a mirror image. For a row: "left->right" or "right->left";
        for a column: "top->bottom" or "bottom->top"; for everywhere(): any of the 8 folds."""
        layer = self.layer(layer)
        reg = self.where(where, "mirror_fold", ("line", "all"))
        if reg[0] == "all":
            if type(fold) is not str or fold not in _FOLDS:
                self.fail(f"{_show(fold)} isn't a fold for the whole grid; use one of {', '.join(_FOLDS)}")
            return self.call("mirror_fold", {"layer": layer, "kind": "all", "side": fold})
        names = ("left->right", "right->left") if reg[1][0] == 0 else ("top->bottom", "bottom->top")
        if fold in names and type(fold) is str:
            side = names.index(fold)
        elif type(fold) is int and fold in (0, 1):
            side = fold
        else:
            self.fail(f"to mirror {reg!r} use \"{names[0]}\" or \"{names[1]}\", not {_show(fold)}")
        return self.call("mirror_fold", {"layer": layer, "kind": "line", "line": reg[1], "side": side})

    # --- mutators: colour layer -----------------------------------------------------------------
    def paint(self, where, colour):
        """Paint an area one colour."""
        p = self.area("paint", ("cell", "line", "line*", "diag", "block", "ring", "core", "all"), where)
        p["colour"] = self.colour(colour)
        return self.call("paint", p)

    def recolour(self, where, old, new):
        """Turn every `old`-coloured cell in an area into `new`."""
        p = self.area("recolour", ("line", "line*", "block", "ring", "core", "all"), where)
        p["pair"] = self.pair(old, new, self.colour, "recolour", True)
        return self.call("recolour", p)

    def swap_colours(self, where, a, b):
        """Colours a and b trade places inside an area."""
        p = self.area("swap_colours", ("line", "block", "ring", "all"), where)
        p["pair"] = self.pair(a, b, self.colour, "swap_colours", False)
        return self.call("swap_colours", p)

    def hue_turn(self, where, k=1):
        """Move every colour in an area k steps along the rainbow, wrapping round."""
        p = self.area("hue_turn", ("cell", "line", "block", "ring", "all"), where)
        p["k"] = self.steps(k, self.C, "turning the colours")
        return self.call("hue_turn", p)

    def pattern_line(self, line, pattern, colour, other=None, backwards=False):
        """pattern_line(line, "ramp", start, backwards=False): a rainbow run from `start`;
        pattern_line(line, "alternate", a, b): a, b, a, b, ..."""
        ln = self.line(line, "pattern_line")
        if pattern == "ramp" and type(pattern) is str:
            if type(other) is bool:
                backwards = other
            elif other is not None:
                self.fail("a \"ramp\" pattern takes one colour (where the rainbow starts), "
                          "then optionally True to run it backwards")
            back = self.flag(backwards, "backwards")
            return self.call("pattern_line", {"line": ln, "pattern": "ramp", "start": self.colour(colour),
                                              "dir": -1 if back else 1})
        if pattern == "alternate" and type(pattern) is str:
            if other is None:
                self.fail("an \"alternate\" pattern needs two colours, like pattern_line(row(0), \"alternate\", "
                          "\"red\", \"blue\")")
            if backwards is not False:
                self.fail("an \"alternate\" pattern can't run backwards; swap its two colours instead")
            return self.call("pattern_line", {"line": ln, "pattern": "alternate",
                                              "pair": self.pair(colour, other, self.colour, "alternate", True)})
        self.fail(f"pattern should be \"ramp\" or \"alternate\", not {_show(pattern)}")

    def motif(self, style, colour, other=None, backwards=False):
        """Wallpaper the whole grid: motif("stripes across" | "stripes down" | "diagonal" |
        "other diagonal", start, backwards=False), or motif("checker", a, b)."""
        if type(style) is not str or style not in _STYLES:
            self.fail(f"{_show(style)} isn't a wallpaper; use one of {', '.join(_STYLES)}")
        kind, axis = _STYLES[style]
        if kind == "checker":
            if other is None:
                self.fail("a \"checker\" wallpaper needs two colours, like motif(\"checker\", \"red\", \"blue\")")
            if backwards is not False:
                self.fail("a \"checker\" wallpaper can't run backwards; swap its two colours instead")
            return self.call("motif", {"style": "checker",
                                       "pair": self.pair(colour, other, self.colour, "checker", True)})
        if type(other) is bool:
            backwards = other
        elif other is not None:
            self.fail(f"\"{style}\" takes one colour (where the rainbow starts), then optionally True to "
                      "run it backwards")
        back = self.flag(backwards, "backwards")
        return self.call("motif", {"style": kind, "axis": axis, "start": self.colour(colour),
                                   "dir": -1 if back else 1})

    def majority_line(self, line):
        """A row or column votes: every cell takes its most common colour."""
        return self.call("majority_line", self.area("majority_line", ("line", "line*"), line))

    # --- mutators: symbol layer -----------------------------------------------------------------
    def write(self, where, symbol):
        """Write one symbol into an area."""
        p = self.area("write", ("cell", "line", "line*", "diag", "block", "ring", "core", "all"), where)
        p["symbol"] = self.symbol(symbol)
        return self.call("write", p)

    def step_rank(self, where, k=1):
        """Count every number in an area on by k, wrapping round (cards keep their suit)."""
        p = self.area("step_rank", ("cell", "line", "block", "ring", "all"), where)
        p["k"] = self.steps(k, self.ranks, "counting on")
        return self.call("step_rank", p)

    def write_ramp(self, line, start, backwards=False):
        """Write a counting run along a row or column from `start` (cards keep their suit)."""
        ln = self.line(line, "write_ramp")
        start = self.rank(start)
        return self.call("write_ramp", {"line": ln, "start": start,
                                        "dir": -1 if self.flag(backwards, "backwards") else 1})

    def swap_symbols(self, where, a, b):
        """Two numbers trade places inside an area (cards: two ranks, keeping suits)."""
        p = self.area("swap_symbols", ("line", "block", "ring", "all"), where)
        p["pair"] = self.pair(a, b, self.rank, "swap_symbols", False)
        return self.call("swap_symbols", p)

    def flatten(self, where):
        """In an area, every number except the highest drops to the lowest one there."""
        return self.call("flatten", self.area("flatten", ("line", "block", "ring", "all"), where))

    # --- mutators: couplers ---------------------------------------------------------------------
    def paint_by_key(self, where, key, first, second=None):
        """paint_by_key(where, "parity", even_colour, odd_colour); paint_by_key(where, "mod", shift);
        paint_by_key(where, "redblack", hearts_and_diamonds_colour, spades_and_clubs_colour) (cards)."""
        p = self.area("paint_by_key", ("line", "all"), where)
        keys = _KEYS if self.cards else _KEYS[:2]
        if type(key) is not str or key not in keys:
            self.fail(f"{_show(key)} isn't a key on this grid; use {' or '.join(chr(34) + k + chr(34) for k in keys)}")
        p["key"] = key
        if key == "mod":
            if second is not None:
                self.fail("the \"mod\" key takes one number: how far round the rainbow to shift")
            if not type(first) is int:
                self.fail(f"the \"mod\" shift should be a whole number, not {_show(first)}")
            p["shift"] = first % self.C
        else:
            if second is None:
                self.fail(f"the \"{key}\" key needs two colours")
            p["pair"] = self.pair(first, second, self.colour, key, True)
        return self.call("paint_by_key", p)

    def stamp(self, where, colour, symbol):
        """Every `colour` cell inside an area gets `symbol` stamped on it."""
        p = self.area("stamp", ("line", "block", "all"), where)
        p["colour"] = self.colour(colour)
        p["symbol"] = self.symbol(symbol)
        return self.call("stamp", p)

    def tally(self, where, colour):
        """`colour` cells are mines; every other cell in the area shows how many mines touch it."""
        p = self.area("tally", ("line", "block", "all"), where)
        p["colour"] = self.colour(colour)
        return self.call("tally", p)

    # --- mutators: capability-specific -----------------------------------------------------------
    def blend(self, where, a, b):
        """Where paints a and b meet, the cells touching both turn the mixed colour."""
        p = self.area("blend", ("line", "all"), where)
        x, y = self.colour(a), self.colour(b)
        for recipe in self.mixes:
            if (x, y) in ((recipe[0], recipe[1]), (recipe[1], recipe[0])):
                p["recipe"] = recipe
                return self.call("blend", p)
        recipes = "; ".join(f"{self.palette[r[0]]} + {self.palette[r[1]]} = {self.palette[r[2]]}"
                            for r in self.mixes)
        self.fail(f"{self.palette[x]} and {self.palette[y]} don't mix on this grid ({recipes})")

    def suit_swap(self, where, a, b):
        """Two suits trade places inside an area."""
        p = self.area("suit_swap", ("cell", "line", "block", "all"), where)
        p["pair"] = self.pair(a, b, self.suit_of, "suit_swap", False)
        return self.call("suit_swap", p)

    def suit_set(self, where, suit):
        """Every card in an area changes to one suit, keeping its rank."""
        p = self.area("suit_set", ("line", "block", "ring", "all"), where)
        p["suit"] = self.suit_of(suit)
        return self.call("suit_set", p)


def _job(size, symbols, colours, text):
    """Trusted per-execution setup: the guest globals, the decoded grid, the encoder, the error record."""
    record = {}
    env = _Env(size, symbols, colours, record)
    return {"globals": env.names(), "grid": env.grid(text), "encode": env.encode, "errors": record}


def _warm(rounds=4):
    """Trusted bootstrap only: exercise every helper so CPython's adaptive interpreter specialises
    the prelude's bytecode before the snapshot is taken. Each execution then starts warm, so a
    Grid agent's budget is spent on its own work. Pure: it returns nothing and keeps no state."""
    for size, symbols, colours in ((5, "base10", "rgby"), (3, "base12", "rgb"), (6, "cards", "rainbow6"),
                                   (7, "base16", "rainbow6")):
        letters = [_LETTERS[n] for n in _PALETTES[colours]]
        env = _Env(size, symbols, colours, {})
        text = "/".join(",".join(env.codes[(r * 7 + c * 3) % env.S] + letters[(r + c) % len(letters)]
                                 for c in range(size)) for r in range(size))
        for _ in range(rounds):
            names, g = env.names(), env.grid(text)
            first = g.cell(0, 0)
            for name in ("cells", "rows", "columns", "diagonals", "edge_cells", "palette"):
                getattr(g, name)
            for c in g.cells:
                (c.neighbours, c.surrounding, c.on_edge, g.quarter_turn(c), c.left, c.up_right)
            g.regions(lambda a, b: a.colour == b.colour)
            g.reachable(g.edge_cells, lambda c: c.value > 1)
            places = (env.row(1), env.column(0), env.at(1, 1), env.at(first), env.diagonal(1), env.square(0, 0),
                      env.square(first, 2), env.ring(1), env.everywhere(), env.busiest_line(), (0, 1), first)
            red, other = env.palette[0], env.palette[-1]
            calls = [env.swap_cells(first, (0, 1), "colour"), env.shift_line(env.row(0), -1),
                     env.reverse_line(env.column(1), "symbol"), env.swap_lines(env.row(0), env.row(2)),
                     env.turn_block(env.square(0, 0), "rot90"), env.turn_grid("flipH"),
                     env.sort_line(env.row(1), True), env.mirror_fold(env.row(0), "left->right"),
                     env.mirror_fold(env.everywhere(), "top->bottom", "colour"),
                     env.recolour(env.ring(0), red, other), env.swap_colours(env.everywhere(), 0, 1),
                     env.hue_turn(first, 2), env.pattern_line(env.row(0), "ramp", red, True),
                     env.pattern_line(env.column(0), "alternate", 0, 1), env.motif("stripes down", other),
                     env.motif("checker", 1, 0), env.majority_line(env.busiest_line()),
                     env.step_rank(env.row(1), -1), env.write_ramp(env.column(0), first.value),
                     env.swap_symbols(env.square(0, 0), 2, 3), env.flatten(env.ring(0)),
                     env.paint_by_key(env.row(0), "parity", 0, 1), env.paint_by_key(env.everywhere(), "mod", 2),
                     env.stamp(env.row(0), red, first.symbol), env.next_colour(red)]
            for where in places:
                calls.append(env.paint(where, red))
                calls.append(env.write(where, first.symbol))
                calls.append(env.paint(where, 1))
            if env.cards:
                calls += [env.suit_swap(first, "hearts", "♠"), env.suit_set(env.row(0), first.suit),
                          env.paint_by_key(env.row(0), "redblack", 0, 1), env.write(first, "QH")]
            else:
                calls.append(env.tally(env.row(0), red))
            if env.mixes:
                a, b, _ = env.mixes[0]
                calls += [env.blend(env.row(0), a, b), env.mix(env.palette[a], env.palette[b])]
            moves = [c for c in calls if type(c) is _Call]
            for i in range(0, len(moves), _MAX_CALLS):
                env.encode(moves[i:i + _MAX_CALLS])
            for bad in (lambda: env.row(size), lambda: env.paint(env.row(0), "pink"), lambda: env.encode([1])):
                try:
                    bad()
                except _GridError:
                    pass
            repr(moves[0]), repr(places[0]), repr(first), moves[0].m, moves[0].p, places[0].kind
