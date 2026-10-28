"""The closed mutation interface: what an open agent can see and the only way it can change a grid.

An agent is ordinary Python. It is handed a READ-ONLY view of one grid (the kid cell API of
gridlab/kid.py) and returns a list of moves:

    def agent(grid):
        return [paint_row(2, "red")]

A *move* is a mutator call with its parameters (`Move(mid, params)`), made by the constructors below.
Constructing a move does nothing to any grid; the engine validates the returned list and applies it.
Nothing else the agent does can change the world: the view is a private copy, its cells refuse
assignment, and the underlying arrays are immutable.

Every constructor validates its arguments against the GridType at once, so a mistake raises
`MoveError` inside the agent (the application then does nothing). The constructors are friendly
spellings of the mutator fields of gridlab/mutators.py; `move(mutator_id, **fields)` is the raw form.
Two spellings that build the same (mutator, fields) are the same move, and cost the same bits.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Iterable, Optional

from .. import kid
from ..core import COLOUR_NAMES, Grid, GridType
from ..mutators import FOLDS, D4_MOVES, available, by_id, region_choices

SUIT_NAMES = kid.SUIT_NAMES


class MoveError(ValueError):
    """A move that the mutator does not allow on this GridType."""


# ------------------------------------------------------------------------------------------------
# moves
# ------------------------------------------------------------------------------------------------
def _freeze(v):
    if isinstance(v, (list, tuple)):
        return tuple(_freeze(x) for x in v)
    return v


class Move:
    """One mutator call: `mid` (mutator id) and its field values. Immutable and hashable."""
    __slots__ = ("mid", "_items", "_hash")

    def __init__(self, mid: str, params: dict):
        object.__setattr__(self, "mid", mid)
        items = tuple((k, _freeze(v)) for k, v in params.items())
        object.__setattr__(self, "_items", items)
        object.__setattr__(self, "_hash", hash((mid, items)))

    def __setattr__(self, k, v):
        raise AttributeError("moves are read-only")

    @property
    def params(self) -> dict:
        return dict(self._items)

    @property
    def key(self) -> tuple:
        return (self.mid, self._items)

    def __eq__(self, other):
        return isinstance(other, Move) and self.mid == other.mid and self._items == other._items

    def __hash__(self):
        return self._hash

    def __repr__(self):
        return f"move({self.mid!r}, " + ", ".join(f"{k}={v!r}" for k, v in self._items) + ")"

    def __reduce__(self):
        return (Move, (self.mid, dict(self._items)))


def check_params(mid: str, params: dict, gt: GridType) -> dict:
    """Return params in field order if they are a legal setting of mutator `mid` on gt, else raise."""
    m = by_id(mid)
    if not m.available(gt):
        raise MoveError(f"{mid} is not available on {gt.key}")
    out: dict = {}
    for f in m.fields:
        ch = f.choices(gt, out)
        if ch is None:
            if f.name in params:
                raise MoveError(f"{mid}: '{f.name}' does not apply here")
            continue
        if f.name not in params:
            raise MoveError(f"{mid} needs {f.name}")
        v = _freeze(params[f.name])
        if v not in ch:
            raise MoveError(f"{mid}: {f.name}={v!r} is not allowed")
        out[f.name] = v
    extra = set(params) - set(out) - {f.name for f in m.fields}
    if extra:
        raise MoveError(f"{mid} has no field {sorted(extra)[0]!r}")
    return out


def make_move(mid: str, params: dict, gt: GridType) -> Move:
    return Move(mid, check_params(mid, params, gt))


@lru_cache(maxsize=None)
def all_moves(gt: GridType, mid: Optional[str] = None) -> tuple:
    """Every legal move of one mutator (or of every available mutator), in field-space order."""
    if mid is None:
        return tuple(x for m in available(gt) for x in all_moves(gt, m.id))
    return tuple(Move(mid, p) for p in by_id(mid).space(gt))


def resolve_line_star(mv: Move, g: Grid, gt: GridType) -> Move:
    """The same move with a `best_line` target replaced by the line it picks on g (for action keys)."""
    p = mv.params
    if p.get("kind") != "line*":
        return mv
    import numpy as np
    from ..mutators import _majority_feature, line_scores
    if mv.mid in ("paint", "recolour"):        # the same features the mutators use (argmax, lowest wins)
        k = p["colour"] if mv.mid == "paint" else p["pair"][1]
        sc = line_scores(g.col == k)
    elif mv.mid == "majority_line":
        sc = _majority_feature(gt)(g)
    else:
        return mv
    i = int(np.argmax(sc))
    return Move(mv.mid, {**p, "kind": "line", "region": (0, i) if i < gt.N else (1, i - gt.N)})


# ------------------------------------------------------------------------------------------------
# areas
# ------------------------------------------------------------------------------------------------
class Area:
    """A region of the grid: (kind, region) exactly as the mutator fields name them."""
    __slots__ = ("kind", "region")

    def __init__(self, kind: str, region=()):
        object.__setattr__(self, "kind", kind)
        object.__setattr__(self, "region", _freeze(region))

    def __setattr__(self, k, v):
        raise AttributeError("areas are read-only")

    def __eq__(self, o):
        return isinstance(o, Area) and (self.kind, self.region) == (o.kind, o.region)

    def __hash__(self):
        return hash((self.kind, self.region))

    def __repr__(self):
        return f"Area({self.kind!r}, {self.region!r})"


def _area(x, gt: GridType) -> Area:
    """Accept an Area, a cell of the view, or a full row / column / diagonal (a list of view cells)."""
    if isinstance(x, Area):
        return x
    if isinstance(x, kid.Cell):
        return Area("cell", (x.row, x.col))
    if isinstance(x, (list, tuple)) and x and all(isinstance(c, kid.Cell) for c in x):
        N = gt.N
        pos = [(c.row, c.col) for c in x]
        if len(pos) == N:
            if all(r == pos[0][0] for r, _ in pos) and sorted(c for _, c in pos) == list(range(N)):
                return Area("line", (0, pos[0][0]))
            if all(c == pos[0][1] for _, c in pos) and sorted(r for r, _ in pos) == list(range(N)):
                return Area("line", (1, pos[0][1]))
            if sorted(pos) == [(i, i) for i in range(N)]:
                return Area("diag", 0)
            if sorted(pos) == sorted((i, N - 1 - i) for i in range(N)):
                return Area("diag", 1)
        if len(pos) == 1:
            return Area("cell", pos[0])
    raise MoveError(f"{x!r} is not an area: use cell(r, c), row(i), column(i), block(r, c), ring(d), "
                    "diagonal(k), core, everything or best_line")


def _line(x, gt: GridType) -> tuple:
    a = _area(x, gt)
    if a.kind != "line":
        raise MoveError("this mutator needs a row or a column")
    return a.region


def _cell_pos(x, gt: GridType) -> tuple:
    a = _area(x, gt)
    if a.kind != "cell":
        raise MoveError("this needs a single cell")
    return a.region


def _colour(x, gt: GridType) -> int:
    if isinstance(x, str):
        k = gt.colour(x)
        if k is None:
            raise MoveError(f"{x!r} is not a colour of this grid (colours: {', '.join(gt.colour_names)})")
        return k
    if isinstance(x, int) and not isinstance(x, bool) and 0 <= x < gt.C:
        return x
    raise MoveError(f"{x!r} is not a colour")


def _symbol(x, gt: GridType) -> int:
    """A symbol index from a glyph ("7", "K♥") or an index."""
    if isinstance(x, str):
        for s in range(gt.S):
            if gt.glyph(s) == x:
                return s
        raise MoveError(f"{x!r} is not a symbol of this grid")
    if isinstance(x, int) and not isinstance(x, bool) and 0 <= x < gt.S:
        return x
    raise MoveError(f"{x!r} is not a symbol")


def _suit(x) -> int:
    if isinstance(x, str) and x in SUIT_NAMES:
        return SUIT_NAMES.index(x)
    if isinstance(x, int) and not isinstance(x, bool) and 0 <= x < 4:
        return x
    raise MoveError(f"{x!r} is not a suit")


def _region_params(a: Area) -> dict:
    if a.kind in ("line*", "core", "all"):
        return {"kind": a.kind, "region": ()}
    return {"kind": a.kind, "region": a.region}


# ------------------------------------------------------------------------------------------------
# the constructors (bound to a GridType)
# ------------------------------------------------------------------------------------------------
def constructors(gt: GridType) -> dict:
    """name -> callable for every API name an agent can use on this GridType (areas, colours, moves).
    The same names exist on every GridType; a mutator the GridType lacks raises MoveError when called."""
    M = lambda mid, **p: make_move(mid, p, gt)   # noqa: E731
    C = lambda x: _colour(x, gt)                  # noqa: E731
    A = lambda x: _region_params(_area(x, gt))    # noqa: E731

    def paint(area, colour):
        """Paint an area one colour."""
        return M("paint", **A(area), colour=C(colour))

    def recolour(area, old, new):
        """Every `old`-coloured cell in the area turns `new`."""
        return M("recolour", **A(area), pair=(C(old), C(new)))

    def swap_colours(area, a, b):
        """Colours a and b trade places in the area."""
        x, y = sorted((C(a), C(b)))
        return M("swap_colours", **A(area), pair=(x, y))

    def hue_turn(area, k=1):
        return M("hue_turn", **A(area), k=k)

    def pattern_line(line, pattern="ramp", start=None, dir=1, pair=None):
        if pattern == "ramp":
            return M("pattern_line", line=_line(line, gt), pattern="ramp",
                     start=C(start if start is not None else 0), dir=dir)
        if pair is None:
            raise MoveError("pattern_line(..., pattern='alternate') needs pair=(colour, colour)")
        return M("pattern_line", line=_line(line, gt), pattern="alternate", pair=(C(pair[0]), C(pair[1])))

    def motif(style="stripes", axis=0, start=None, dir=1, pair=None):
        if style == "checker":
            if pair is None:
                raise MoveError("motif('checker') needs pair=(colour, colour)")
            return M("motif", style="checker", pair=(C(pair[0]), C(pair[1])))
        return M("motif", style=style, axis=axis, start=C(start if start is not None else 0), dir=dir)

    def majority_line(line=None):
        a = _area(line, gt) if line is not None else Area("line*")
        return M("majority_line", **_region_params(a))

    def write(area, symbol):
        return M("write", **A(area), symbol=_symbol(symbol, gt))

    def step_rank(area, k=1):
        return M("step_rank", **A(area), k=k)

    def write_ramp(line, start=0, dir=1):
        return M("write_ramp", line=_line(line, gt), start=start, dir=dir)

    def swap_symbols(area, a, b):
        x, y = sorted((a, b))
        return M("swap_symbols", **A(area), pair=(x, y))

    def flatten(area):
        return M("flatten", **A(area))

    def paint_by_key(area, key="parity", pair=None, shift=0):
        if key == "mod":
            return M("paint_by_key", **A(area), key="mod", shift=shift)
        if pair is None:
            raise MoveError(f"paint_by_key(..., key={key!r}) needs pair=(colour, colour)")
        return M("paint_by_key", **A(area), key=key, pair=(C(pair[0]), C(pair[1])))

    def stamp(area, colour, symbol):
        return M("stamp", **A(area), colour=C(colour), symbol=_symbol(symbol, gt))

    def tally(area, colour):
        return M("tally", **A(area), colour=C(colour))

    def blend(area, recipe=None):
        from ..mutators import _recipes
        rs = _recipes(gt)
        if recipe is None:
            if not rs:
                raise MoveError("no paints mix on this grid")
            r = rs[0]
        else:
            a, b = C(recipe[0]), C(recipe[1])
            r = next((x for x in rs if {x[0], x[1]} == {a, b}), None)
            if r is None:
                raise MoveError(f"{recipe[0]} and {recipe[1]} don't mix")
        return M("blend", **A(area), recipe=r)

    def suit_swap(area, a, b):
        x, y = sorted((_suit(a), _suit(b)))
        return M("suit_swap", **A(area), pair=(x, y))

    def suit_set(area, suit):
        return M("suit_set", **A(area), suit=_suit(suit))

    def swap_cells(a, b, layer="both"):
        p, q = sorted((_cell_pos(a, gt), _cell_pos(b, gt)))
        near = "next door" if abs(p[0] - q[0]) + abs(p[1] - q[1]) == 1 else "anywhere"
        return M("swap_cells", layer=layer, near=near, pair=(p, q))

    def shift_line(line, k=1, layer="both"):
        return M("shift_line", layer=layer, line=_line(line, gt), k=k % gt.N if k % gt.N else k)

    def reverse_line(line, layer="both"):
        return M("reverse_line", layer=layer, line=_line(line, gt))

    def swap_lines(a, b):
        (ax, i), (bx, j) = _line(a, gt), _line(b, gt)
        if ax != bx:
            raise MoveError("swap_lines swaps two rows or two columns")
        return M("swap_lines", axis=ax, pair=tuple(sorted((i, j))))

    def turn_block(block_area, move="rot90"):
        a = _area(block_area, gt)
        if a.kind != "block":
            raise MoveError("turn_block needs block(r, c, size)")
        return M("turn_block", kind="block", region=a.region, move=move)

    def turn_grid(move="rot90"):
        return M("turn_grid", move=move)

    def sort_line(line, dir=1):
        return M("sort_line", line=_line(line, gt), dir=dir)

    def mirror_fold(area=None, side=None, layer="both"):
        a = _area(area, gt) if area is not None else Area("all")
        if a.kind == "line":
            return M("mirror_fold", layer=layer, kind="line", line=a.region, side=0 if side is None else side)
        if a.kind == "all":
            return M("mirror_fold", layer=layer, kind="all", side=FOLDS[0] if side is None else side)
        raise MoveError("mirror_fold works on a row, a column or everything")

    def move(mutator, **fields):
        """The raw constructor: move("paint", kind="line", region=(0, 2), colour=0)."""
        return M(mutator, **fields)

    # friendly shorthands (all paint)
    def paint_row(i, colour):
        return paint(Area("line", (0, i)), colour)

    def paint_column(j, colour):
        return paint(Area("line", (1, j)), colour)

    def paint_cell(r, c, colour):
        return paint(Area("cell", (r, c)), colour)

    def paint_all(colour):
        return paint(Area("all"), colour)

    # areas
    def cell(r, c):
        return Area("cell", (r, c))

    def row(i):
        return Area("line", (0, i))

    def column(j):
        return Area("line", (1, j))

    def diagonal(k=0):
        return Area("diag", k)

    def block(r, c, size=2):
        return Area("block", (r, c, size))

    def ring(d=0):
        return Area("ring", d)

    def moves(mutator=None):
        """Every legal move of one mutator (by id, e.g. moves("paint")) or of all mutators."""
        if mutator is not None and not isinstance(mutator, str):
            mutator = getattr(mutator, "__name__", mutator)
        if mutator is not None and mutator not in {m.id for m in available(gt)}:
            raise MoveError(f"no mutator {mutator!r} on this grid")
        return list(all_moves(gt, mutator))

    out = {f.__name__: f for f in (
        paint, recolour, swap_colours, hue_turn, pattern_line, motif, majority_line, write, step_rank,
        write_ramp, swap_symbols, flatten, paint_by_key, stamp, tally, blend, suit_swap, suit_set,
        swap_cells, shift_line, reverse_line, swap_lines, turn_block, turn_grid, sort_line, mirror_fold, move,
        paint_row, paint_column, paint_cell, paint_all, cell, row, column, diagonal, block, ring, moves)}
    out.update(core=Area("core"), everything=Area("all"), best_line=Area("line*"))
    for name in COLOUR_NAMES["rainbow6"]:
        out[name] = name
    out["D4_MOVES"] = D4_MOVES
    return out


# The API vocabulary: every name the sandbox binds besides builtins (identical on every GridType, so a
# program's description length never depends on the GridType except through its literal moves).
API_NAMES: tuple = tuple(sorted(list(constructors(GridType()).keys()) + ["score"]))
MUTATOR_CONSTRUCTORS: frozenset = frozenset(n for n in API_NAMES if n not in {
    "cell", "row", "column", "diagonal", "block", "ring", "moves", "core", "everything", "best_line", "score",
    "D4_MOVES"} and n not in COLOUR_NAMES["rainbow6"])
AREA_NAMES: frozenset = frozenset({"cell", "row", "column", "diagonal", "block", "ring", "core", "everything",
                                   "best_line"})


# ------------------------------------------------------------------------------------------------
# the read-only grid view
# ------------------------------------------------------------------------------------------------
class ROCell(kid.Cell):
    __slots__ = ()

    def __setattr__(self, k, v):
        raise AttributeError("the grid is read-only: change it by returning moves")


class GridView(kid.Grid):
    """The kid grid API (gridlab/kid.py), read-only, plus `count`, `colours`, `after` and `moves`."""

    def __init__(self, g: Grid, gt: GridType, score_hook=None):
        o = object.__setattr__
        o(self, "size", gt.N)
        o(self, "palette", tuple(gt.colour_names))
        o(self, "_lab", g)
        o(self, "_gt", gt)
        o(self, "_hook", score_hook)
        o(self, "_rows", _build_rows(self, g, gt))

    def __setattr__(self, k, v):
        raise AttributeError("the grid is read-only: change it by returning moves")

    @property
    def colours(self) -> tuple:
        """Every colour this kind of grid uses, in rainbow order."""
        return self.palette

    def count(self, x) -> int:
        """How many cells show colour x (a colour name) or symbol x (a glyph like "7", or a value)."""
        if isinstance(x, str) and self._gt.colour(x) is not None:
            return int((self._lab.col == self._gt.colour(x)).sum())
        if isinstance(x, str):
            return sum(1 for c in self.cells if c.symbol == x)
        return sum(1 for c in self.cells if c.value == x)

    def after(self, moves) -> "GridView":
        """The grid as it would be after these moves (one move or a list). Nothing is changed."""
        if self._hook is not None:
            self._hook.tick_preview()
        return GridView(apply_moves(self._lab, moves, self._gt), self._gt, self._hook)

    def __eq__(self, o):
        return isinstance(o, GridView) and o._lab == self._lab

    def __hash__(self):
        return hash(self._lab)


def _build_rows(grid: GridView, g: Grid, gt: GridType) -> tuple:
    N, cards = gt.N, gt.symbols == "cards"
    names = gt.colour_names
    sym, col = g.sym.tolist(), g.col.tolist()
    o = object.__setattr__
    rows = []
    for r in range(N):
        row = []
        for c in range(N):
            s = sym[r][c]
            x = ROCell.__new__(ROCell)
            if cards:
                glyph, value, suit, pic = kid.RANK_GLYPHS[s % 13] + kid.SUIT_GLYPHS[s // 13], s % 13 + 1, \
                    SUIT_NAMES[s // 13], s % 13 >= 10
            else:
                glyph, value, suit, pic = kid.DIGIT_GLYPHS[s], s, None, None
            for k, v in (("_grid", grid), ("row", r), ("col", c), ("symbol", glyph), ("value", value),
                         ("colour", names[col[r][c]]), ("_suit", suit), ("_picture", pic)):
                o(x, k, v)
            row.append(x)
        rows.append(row)

    def at(rr, cc):
        return rows[rr][cc] if 0 <= rr < N and 0 <= cc < N else None

    for r in range(N):
        for c in range(N):
            x = rows[r][c]
            for k, v in (("left", at(r, c - 1)), ("right", at(r, c + 1)), ("up", at(r - 1, c)),
                         ("down", at(r + 1, c)), ("up_left", at(r - 1, c - 1)), ("up_right", at(r - 1, c + 1)),
                         ("down_left", at(r + 1, c - 1)), ("down_right", at(r + 1, c + 1))):
                o(x, k, v)
    return tuple(tuple(r) for r in rows)


# ------------------------------------------------------------------------------------------------
# the engine side: validate and apply
# ------------------------------------------------------------------------------------------------
MAX_MOVES = 64


def normalise_action(out, gt: GridType) -> tuple:
    """The agent's return value as a tuple of validated moves; raise MoveError if it is not one.
    Accepts a list or tuple of moves, a single move, or None / [] (do nothing)."""
    if out is None:
        return ()
    if isinstance(out, Move):
        out = [out]
    if not isinstance(out, (list, tuple)):
        raise MoveError(f"an agent returns a list of moves, not {type(out).__name__}")
    if len(out) > MAX_MOVES:
        raise MoveError(f"at most {MAX_MOVES} moves per application")
    res = []
    for m in out:
        if not isinstance(m, Move):
            raise MoveError(f"{m!r} is not a move")
        check_params(m.mid, m.params, gt)       # re-validate: moves may come from another GridType
        res.append(m)
    return tuple(res)


def apply_moves(g: Grid, moves, gt: GridType) -> Grid:
    """Apply moves in order (each sees the previous one's result). A no-op move leaves the grid as is."""
    if isinstance(moves, Move):
        moves = (moves,)
    for m in moves:
        y = by_id(m.mid).apply(g, m.params, gt)
        if y is not None:
            g = y
    return g


def iter_cells(xs: Iterable) -> list:
    return list(xs)
