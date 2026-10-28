"""The Grid agent language: a small, Python-flavoured language for summonable agents.

An agent is a short program in a *restricted subset of Python* (parsed with `ast`, every node kind
whitelisted). It reads the grid it was applied to, may search over candidate mutations, may ask its
owner's utility function `score(...)` which of two results is better, and changes the grid only by
calling mutators. Example:

    best_row = best(grid.rows, by=lambda row: row.count(red))
    paint(best_row, red)

Pipeline
--------
  source --(elaborate)--> IR (typed, desugared, names resolved) --(walk with Coder)--> description bits
                           IR --(interp.run)--> moves emitted on one grid
  IR is the canonical form: two sources that differ only in spelling (`x += 1` vs `x = x + 1`,
  variable names, optional default arguments) give the same IR and therefore the same code.

Description code (MDL)
----------------------
`walk` derives the IR as a sequence of choices from a probabilistic grammar. At every choice point the
context (expected type, variables in scope, defs, GridType) fixes a finite list of alternatives with
weights; the choice costs -log2 p(alternative | context). Literals cost log2 of their range (a row
index log2 N, a colour log2 C, a count log2 (N²+1), other small numbers log2 64). A mutator call with
only literal arguments (`ConstCall`) is coded as "which mutator" (log2 #mutators) followed by the
mutator's own parameter fields, exactly the prefix code of `Mutator.describe_bits`, so its cost is the
Program step's base + D terms bit for bit. The same walker, driven by a `Sampler` instead of a `Coder`,
draws random programs from the same distribution; that is how tests check Kraft's inequality.
"""
from __future__ import annotations

import ast
import itertools
import math
from dataclasses import dataclass, field, replace
from typing import Optional

import numpy as np

from ..core import GridType
from ..mutators import available, by_id, region_choices

log2 = math.log2

# ------------------------------------------------------------------------------------------------
# types
# ------------------------------------------------------------------------------------------------
NUM, BOOL, COLOUR, CELL, LINE, REGION, MOVE, GRID = "Num", "Bool", "Colour", "Cell", "Line", "Region", "Move", "Grid"


def L(t: str) -> str:
    return f"List[{t}]"


def elem_of(t: str) -> Optional[str]:
    return t[5:-1] if t.startswith("List[") else None


VALUE_TYPES = (NUM, BOOL, COLOUR, CELL, LINE, REGION, MOVE, L(NUM), L(BOOL), L(COLOUR), L(CELL), L(LINE), L(MOVE))
LIST_TYPES = (L(NUM), L(BOOL), L(COLOUR), L(CELL), L(LINE), L(MOVE))
ITER_TYPES = (L(NUM), L(COLOUR), L(CELL), L(LINE), L(MOVE))
PARAM_TYPES = (NUM, COLOUR, CELL, LINE, MOVE)
RET_TYPES = (NUM, BOOL)
BEST_TYPES = (NUM, COLOUR, CELL, LINE, MOVE)
NUM_OPS = ("==", "!=", "<", "<=", ">", ">=")
COL_OPS = ("==", "!=")
ARITH = ("+", "-", "*", "//", "%")
GEN_RANGE = 64          # a "small number" literal: 0..63
MAX_LISTLIT = 8         # [a, b, ...] literals hold 1..8 items
KID_TYPE = {NUM: "number", BOOL: "yes/no", COLOUR: "colour", CELL: "cell", LINE: "row or column",
            REGION: "area", MOVE: "move", GRID: "grid"}


def kid_type(t: str) -> str:
    e = elem_of(t)
    return f"list of {KID_TYPE[e]}s" if e else KID_TYPE.get(t, t)


# ------------------------------------------------------------------------------------------------
# number domains: the range a literal is coded in
# ------------------------------------------------------------------------------------------------
def dom_values(dom, gt: GridType) -> list:
    if isinstance(dom, tuple):            # ("field", choices) for mutator int fields
        return list(dom[1])
    N = gt.N
    if dom == "idx":
        return list(range(N))
    if dom == "cnt":
        return list(range(N * N + 1))
    if dom == "sym":
        return list(range(gt.S))
    if dom == "val":
        return sorted(set(int(v) for v in gt.value))
    if dom == "rank":
        return list(range(gt.ranks))
    if dom == "suit":
        return [0, 1, 2, 3]
    if dom == "ring":
        return list(range((N + 1) // 2))
    if dom == "diag":
        return [0, 1]
    return list(range(GEN_RANGE))         # "gen"


ATTR_DOM = {"row": "idx", "column": "idx", "value": "val", "rank": "rank", "symbol": "sym", "suit": "suit"}


def num_attrs(gt: GridType) -> tuple:
    return ("row", "column", "value", "rank", "symbol") + (("suit",) if gt.symbols == "cards" else ())


# ------------------------------------------------------------------------------------------------
# IR
# ------------------------------------------------------------------------------------------------
@dataclass(eq=False)
class Node:
    tag: str
    type: str = ""
    kids: tuple = ()
    val: object = None
    line: int = 0

    def canon(self):
        """Structure without variable names (alpha-equivalence) and line numbers."""
        v = self.val
        if self.tag in ("Var", "Assign", "For", "Lambda", "DefRef", "DefCall"):
            v = None if self.tag != "Assign" else v[1]
        if self.tag == "Def":
            v = (v[2], v[3])
        if self.tag == "Comp":
            v = None
        if self.tag == "DynCall":
            v = (v[0], tuple(s if s[0] != "lit" else ("lit", tuple(sorted(s[1].items()))) for s in v[1]))
        if self.tag == "ConstCall":
            v = (v[0], tuple(sorted(v[1].items())))
        return (self.tag, self.type, _canon_val(v), tuple(_canon(k) for k in self.kids))


def _canon(k):
    if isinstance(k, Node):
        return k.canon()
    if isinstance(k, (tuple, list)):
        return tuple(_canon(x) for x in k)
    return k


def _canon_val(v):
    if isinstance(v, dict):
        return tuple(sorted(v.items()))
    if isinstance(v, list):
        return tuple(v)
    return v


class LangError(Exception):
    """A compile error with a kid-readable message."""

    def __init__(self, msg: str, line: int = 0):
        super().__init__(f"line {line}: {msg}" if line else msg)
        self.msg, self.line = msg, line


# ------------------------------------------------------------------------------------------------
# mutator call slots: how a call's arguments map onto the mutator's parameter fields
# ------------------------------------------------------------------------------------------------
PAIR_TYPE = {("recolour", "pair"): COLOUR, ("swap_colours", "pair"): COLOUR, ("pattern_line", "pair"): COLOUR,
             ("motif", "pair"): COLOUR, ("paint_by_key", "pair"): COLOUR,
             ("swap_symbols", "pair"): NUM, ("suit_swap", "pair"): NUM}
PAIR_DOM = {("swap_symbols", "pair"): "rank", ("suit_swap", "pair"): "suit"}
NUM_FIELDS = {"k", "start", "dir", "axis", "shift", "suit"}
KID_ORDER = {"swap_cells": ("cells", "layer"), "shift_line": ("line", "k", "layer"), "reverse_line": ("line", "layer"),
             "mirror_fold": ("where", "side", "layer")}
DEFAULTS = {"swap_cells": {"layer": "both"}, "shift_line": {"layer": "both", "k": 1}, "reverse_line": {"layer": "both"},
            "mirror_fold": {"layer": "both", "side": 0}, "hue_turn": {"k": 1}, "step_rank": {"k": 1},
            "sort_line": {"dir": 1}, "write_ramp": {"dir": 1}, "turn_block": {"move": "rot90"},
            "turn_grid": {"move": "rot90"}}


@dataclass(frozen=True)
class Slot:
    name: str
    fields: tuple          # Field objects, in mutator order
    type: str              # REGION | LINE | COLOUR | NUM | "Pair:<T>" | "Choice"
    dom: object = "gen"

    @property
    def arity(self) -> int:
        return 2 if self.type.startswith("Pair:") else 1

    @property
    def computable(self) -> bool:
        return self.type != "Choice"


def slots_of(mid: str) -> tuple[Slot, ...]:
    m = by_id(mid)
    fs, out, i = list(m.fields), [], 0
    while i < len(fs):
        f = fs[i]
        nxt = fs[i + 1].name if i + 1 < len(fs) else None
        if f.name == "kind" and nxt in ("region", "line"):
            out.append(Slot("where", (f, fs[i + 1]), REGION)); i += 2; continue
        if mid == "swap_cells" and f.name == "near" and nxt == "pair":
            out.append(Slot("cells", (f, fs[i + 1]), "Pair:" + CELL)); i += 2; continue
        if mid == "swap_lines" and f.name == "axis" and nxt == "pair":
            out.append(Slot("lines", (f, fs[i + 1]), "Pair:" + LINE)); i += 2; continue
        if f.name == "line":
            out.append(Slot("line", (f,), LINE))
        elif f.name == "colour":
            out.append(Slot("colour", (f,), COLOUR))
        elif f.name == "symbol":
            out.append(Slot("symbol", (f,), NUM, "sym"))
        elif (mid, f.name) in PAIR_TYPE:
            out.append(Slot(f.name, (f,), "Pair:" + PAIR_TYPE[(mid, f.name)], PAIR_DOM.get((mid, f.name), "gen")))
        elif f.name in NUM_FIELDS:
            out.append(Slot(f.name, (f,), NUM))
        else:
            out.append(Slot(f.name, (f,), "Choice"))
        i += 1
    return tuple(out)


def kid_order(mid: str) -> tuple:
    return KID_ORDER.get(mid, tuple(s.name for s in slots_of(mid)))


class _Missing(Exception):
    pass


class _Partial(dict):
    """Params dict that raises _Missing for fields computed at run time (so dependent choices are detected)."""

    def __getitem__(self, k):
        if k not in self:
            raise _Missing(k)
        return dict.__getitem__(self, k)


def field_choices(f, gt: GridType, p: dict):
    """f.choices(gt, p), raising _Missing if it depends on a field that is not a literal."""
    try:
        return f.choices(gt, _Partial(p))
    except _Missing:
        raise
    except KeyError as e:
        raise _Missing(str(e))


# --- literal region/line values <-> field values -------------------------------------------------
def region_fields(val, slot_fields, gt: GridType) -> dict:
    """A region literal value (see interp value encoding) -> {kind, region|line} field values."""
    kind_f, reg_f = slot_fields
    tag = val[0]
    if tag == "c":
        kind, rv = "cell", (val[1], val[2])
    elif tag == "l":
        kind, rv = "line", (val[1], val[2])
    elif tag == "b":
        kind, rv = "block", (val[1], val[2], val[3])
    elif tag == "r":
        kind, rv = "ring", val[1]
    elif tag == "d":
        kind, rv = "diag", val[1]
    elif tag == "o":
        kind, rv = "core", ()
    elif tag == "a":
        kind, rv = "all", ()
    elif tag == "*":
        kind, rv = "line*", ()
    else:
        raise ValueError(val)
    if reg_f.name == "line":
        return {"kind": kind, "line": rv} if kind == "line" else {"kind": kind}
    return {"kind": kind, "region": rv}


def region_value(kind: str, rv) -> tuple:
    return {"cell": lambda: ("c",) + tuple(rv), "line": lambda: ("l",) + tuple(rv),
            "block": lambda: ("b",) + tuple(rv), "ring": lambda: ("r", rv), "diag": lambda: ("d", rv),
            "core": lambda: ("o",), "all": lambda: ("a",), "line*": lambda: ("*",)}[kind]()


def slot_params(slot: Slot, value, gt: GridType, p: dict) -> dict:
    """Field values for one slot given its (literal or run-time) value. Raises ValueError if invalid."""
    t = slot.type
    if slot.name == "where":
        return region_fields(value, slot.fields, gt)
    if t == LINE:
        if value[0] != "l":
            raise ValueError("needs a row or column")
        return {slot.fields[0].name: (value[1], value[2])}
    if t == "Pair:" + CELL:
        a, b = (value[0][1], value[0][2]), (value[1][1], value[1][2])
        adj = abs(a[0] - b[0]) + abs(a[1] - b[1]) == 1
        near = "next door" if adj else "anywhere"
        pairs = slot.fields[1].choices(gt, {"near": near})
        pr = (a, b) if (a, b) in pairs else (b, a)
        return {"near": near, "pair": pr}
    if t == "Pair:" + LINE:
        if value[0][0] != "l" or value[1][0] != "l" or value[0][1] != value[1][1]:
            raise ValueError("needs two rows or two columns")
        i, j = sorted((value[0][2], value[1][2]))
        return {"axis": value[0][1], "pair": (i, j)}
    if t.startswith("Pair:"):
        a, b = int(value[0]), int(value[1])
        ch = field_choices(slot.fields[0], gt, p)
        pr = (a, b) if (a, b) in ch else (b, a)
        return {slot.fields[0].name: pr}
    return {slot.fields[0].name: value if not isinstance(value, (np.integer,)) else int(value)}


def check_params(mid: str, params: dict, gt: GridType) -> None:
    """Every field value must be one of its choices (given earlier fields). Raises ValueError."""
    q = {}
    for f in by_id(mid).fields:
        ch = f.choices(gt, q)
        if ch is None:
            if f.name in params:
                raise ValueError(f"{f.name} not used here")
            continue
        if f.name not in params:
            raise ValueError(f"missing {f.name}")
        if params[f.name] not in ch:
            raise ValueError(f"{f.name}={params[f.name]!r} is not allowed")
        q[f.name] = params[f.name]


# ------------------------------------------------------------------------------------------------
# context for the grammar walker
# ------------------------------------------------------------------------------------------------
@dataclass(frozen=True)
class Var:
    name: str
    type: str
    dom: object = "gen"


@dataclass(frozen=True)
class Def:
    name: str
    ptypes: tuple
    ret: str


@dataclass(frozen=True)
class Ctx:
    gt: GridType
    scope: tuple = ()          # tuple[Var]
    defs: tuple = ()           # tuple[Def]
    mode: str = "main"         # main | def
    ret: Optional[str] = None  # def return type
    dom: object = "gen"        # domain of a Num literal in this position

    def vars_of(self, t: str) -> list[Var]:
        return [v for v in self.scope if v.type == t]

    def lookup(self, name: str) -> Optional[Var]:
        for v in self.scope:
            if v.name == name:
                return v
        return None

    def bind(self, v: Var) -> "Ctx":
        if self.lookup(v.name):
            return self
        return replace(self, scope=self.scope + (v,))

    def with_dom(self, dom) -> "Ctx":
        return self if dom == self.dom else replace(self, dom=dom)

    @property
    def mids(self) -> tuple:
        return mutator_ids(self.gt)


_MIDS: dict = {}


def mutator_ids(gt: GridType) -> tuple:
    from ..mutators import _disabled
    k = (gt, _disabled())
    if k not in _MIDS:
        _MIDS[k] = tuple(m.id for m in available(gt))
    return _MIDS[k]


def block_sizes(gt: GridType) -> list:
    return sorted({v[2] for v in region_choices("block", gt.N)})


# ------------------------------------------------------------------------------------------------
# production weights (default uniform: every choice among k alternatives costs log2 k bits)
# ------------------------------------------------------------------------------------------------
WEIGHTS: dict = {}


def _w(nt: str, alt) -> float:
    return WEIGHTS.get((nt, alt), 1.0)


class Coder:
    """Charges -log2 p for each choice the IR makes. `per_line` attributes bits to source lines."""

    def __init__(self):
        self.bits = 0.0
        self.per_line: dict[int, float] = {}
        self.line = 0
        self.events: list = []

    def _charge(self, b: float, what):
        self.bits += b
        self.per_line[self.line] = self.per_line.get(self.line, 0.0) + b
        self.events.append((self.line, what, b))

    def choose(self, nt: str, alts, actual):
        alts = list(alts)
        if actual not in alts:
            raise LangError(f"internal: {actual!r} is not an alternative for {nt} ({alts})", self.line)
        if len(alts) > 1:
            w = [_w(nt, a) for a in alts]
            self._charge(-log2(w[alts.index(actual)] / sum(w)), (nt, actual))
        return actual

    def index(self, nt: str, n: int, actual: int) -> int:
        if not 0 <= actual < n:
            raise LangError(f"internal: index {actual} out of {n} for {nt}", self.line)
        if n > 1:
            self._charge(log2(n), (nt, actual))
        return actual

    def name(self, prefix: str, actual: Optional[str]) -> str:
        return actual


class Sampler:
    """Draws the same choices at random; logp accumulates log2 p of the draw (tests: == -Coder.bits)."""

    def __init__(self, rng: np.random.Generator, max_nodes: int = 60, max_depth: int = 7):
        self.rng, self.logp, self.nodes = rng, 0.0, 0
        self.max_nodes, self.max_depth, self.depth = max_nodes, max_depth, 0
        self.counter = itertools.count()
        self.line = 0

    def _tick(self):
        self.nodes += 1
        if self.nodes > self.max_nodes or self.depth > self.max_depth:
            raise _TooBig()

    def choose(self, nt, alts, actual=None):
        self._tick()
        alts = list(alts)
        w = np.array([_w(nt, a) for a in alts], float)
        i = int(self.rng.choice(len(alts), p=w / w.sum()))
        self.logp += log2(w[i] / w.sum())
        return alts[i]

    def index(self, nt, n, actual=None):
        self._tick()
        self.logp -= log2(n) if n > 1 else 0.0
        return int(self.rng.integers(n))

    def name(self, prefix: str, actual=None) -> str:
        return f"{prefix}{next(self.counter)}"


class _TooBig(Exception):
    pass
