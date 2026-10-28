"""Mutators: the ONLY interface through which agents change a Grid, each with a bespoke cost in bits.

Design summary (full rationale, tables and risks: docs/mutators.md)
--------------------------------------------------------------------
Every mutator is a deterministic map T -> T that is either
  * a **bijection** (swap, shift, reverse, turn, hue turn, colour/symbol/suit swap, rank step): it
    erases nothing; or
  * an **idempotent overwrite** (paint, write, recolour, fold, sort, pattern, key, stamp, ...):
    applying it twice equals applying it once (tests/test_mutators.py checks both properties).
No mutator is a "ratchet" (a map that makes a little more progress every time it is re-applied, e.g.
"paint the first non-red cell red"), and none uses randomness at apply time: an agent hits many
objects many times, so a ratchet or a random-target painter would behave like a whole-grid fill
sold at a single-cell price. Ratchets built by *combining* steps or adding a guard are priced by the
closure probe in program.py.

Cost of one step, in bits (all knobs in COST_KNOBS):

    cost = scope_mult * kind_mult * ( step_base * log2(#mutators available)      # which tool
                                    + describe  * D(params)                       # MDL: which params
                                    + erase     * E(params)                       # Landauer: bits destroyed
                                    + move      * Σ_layer B_L² / B_L,total       # thermodynamic length
                                    + measure   * M(params) )                     # demon: runtime choice

  D  = Σ log2(#choices) over the parameter fields, read left to right (a prefix code; sampling a
       mutator's params uniformly field by field draws them with probability 2^-D).
  E  = expected erasure H(X) - H(f(X)) under the uniform spawn prior (Shannon/Landauer). Overwriting
       n colour cells with a constant erases n·log2 C, merging colour a into b erases 2n/C bits,
       bijections erase 0. COST_KNOBS["erasure"] = "hartley" switches to the worst-case
       log2(max preimage size), which is subadditive under composition (no cheap multi-agent chains).
  B_L = expected information changed in layer L (cells changed × log2 alphabet). The quadratic
       Σ B_L²/B_total charges little for local edits and a lot for edits that move most of the object,
       for bijections too ("expensive to change the object a lot").
  M  = bits of runtime selection (relative targeting: "the row with the most red" chooses among 2N
       lines, log2 2N bits, the Szilard/Bennett price of a measurement).

Why erasure is the right main lever: for ANY utility u and ANY map f, by the Donsker-Varadhan bound
on the pushforward ν = f_*μ, E_{x~μ}[s_u(f(x))] <= min_λ (E(f) + log2 1/(1-λ)) / λ ≈ E(f) + log2 E(f) + 2.
So a mutator cannot manufacture more expected surprisal, for any family, than about the bits it erases.
Bijections (E = 0) cannot raise any rule's expected surprisal on fresh spawns at all; they only move
rarity between rules (redirect, steal, align) on objects other agents have already structured.

Regions: many mutators take a region field. Kinds: cell, line (row/column), line* (the line where
this mutator's target is already most common; relative targeting), diag, block (2×2 or 3×3), ring
(depth d from the edge), core (everything off the edge), all.
"""
from __future__ import annotations

import itertools
import math
import zlib
from dataclasses import dataclass
from functools import lru_cache
from typing import Callable, Iterable, Optional

import numpy as np

from .core import D4, MIXES, RANK_GLYPHS, SUITS, Grid, GridType, Requires, req

Params = dict

# ------------------------------------------------------------------------------------------------
# knobs
# ------------------------------------------------------------------------------------------------
COST_KNOBS: dict = {
    "step_base": 1.0,    # × log2(#mutators available in the GridType): naming the tool
    "describe": 1.0,     # × D: parameter description bits
    "erase": 1.0,        # × E: expected bits erased (Landauer)
    "move": 0.35,        # × Σ_L B_L²/B_L,total: quadratic "how much of the object changes"
    "measure": 1.0,      # × M: runtime selection bits (relative targeting, guards)
    "ratchet": 1.0,      # × closure surcharge measured by program.py
    "agent_base": 2.0,   # flat bits per Program
    "guard_base": 1.0,   # × log2(#guard kinds)
    "erasure": "shannon",  # "shannon" (expected, default) | "hartley" (worst case, subadditive)
    "scope": {"local": 1.0, "line": 1.0, "block": 1.0, "region": 1.0, "global": 1.0},
    "kind": {"bijective": 1.0, "overwrite": 1.0},
    "disabled": [],      # mutator ids removed from every GridType (experiments; e.g. ["flatten"] = pre-flatten set)
}

SCOPES = ("local", "line", "block", "region", "global")
log2 = math.log2


def _lg(x: float) -> float:
    return log2(x) if x > 1 else 0.0


# ------------------------------------------------------------------------------------------------
# parameter fields (prefix code)
# ------------------------------------------------------------------------------------------------
@dataclass(frozen=True)
class Field:
    name: str
    choices: Callable[[GridType, dict], Optional[list]]   # None = field absent for these params


def _sample_fields(fields, rng, gt) -> dict:
    p: dict = {}
    for f in fields:
        ch = f.choices(gt, p)
        if ch is None:
            continue
        p[f.name] = ch[int(rng.integers(len(ch)))]
    return p


def _describe_bits(fields, p, gt) -> float:
    d, q = 0.0, {}
    for f in fields:
        ch = f.choices(gt, q)
        if ch is None:
            continue
        d += _lg(len(ch))
        q[f.name] = p[f.name]
    return d


def _space(fields, gt) -> Iterable[dict]:
    def rec(i, p):
        if i == len(fields):
            yield dict(p)
            return
        ch = fields[i].choices(gt, p)
        if ch is None:
            yield from rec(i + 1, p)
            return
        for v in ch:
            p[fields[i].name] = v
            yield from rec(i + 1, p)
            del p[fields[i].name]
    yield from rec(0, {})


# ------------------------------------------------------------------------------------------------
# regions
# ------------------------------------------------------------------------------------------------
REGION_SCOPE = {"cell": "local", "line": "line", "line*": "line", "diag": "line", "block": "block",
                "ring": "region", "core": "region", "all": "global"}


def _block_sizes(N: int) -> tuple[int, ...]:
    return tuple(k for k in (2, 3) if k < N)


@lru_cache(maxsize=None)
def region_choices(kind: str, N: int) -> list:
    if kind == "cell":
        return [(r, c) for r in range(N) for c in range(N)]
    if kind == "line":
        return [(a, i) for a in (0, 1) for i in range(N)]
    if kind == "diag":
        return [0, 1]
    if kind == "block":
        return [(r, c, k) for k in _block_sizes(N) for r in range(N - k + 1) for c in range(N - k + 1)]
    if kind == "ring":
        return list(range((N + 1) // 2))
    return [()]   # line*, core, all


def _kinds_ok(kinds, gt) -> list:
    return [k for k in kinds if not (k == "core" and gt.N < 4)]


@lru_cache(maxsize=None)
def _ring_depth(N: int) -> np.ndarray:
    r, c = np.indices((N, N))
    return np.minimum(np.minimum(r, c), np.minimum(N - 1 - r, N - 1 - c))


@lru_cache(maxsize=None)
def region_mask(kind: str, val, N: int) -> np.ndarray:
    m = np.zeros((N, N), bool)
    if kind == "cell":
        m[val] = True
    elif kind == "line":
        a, i = val
        if a == 0:
            m[i, :] = True
        else:
            m[:, i] = True
    elif kind == "diag":
        idx = np.arange(N)
        m[idx, idx if val == 0 else N - 1 - idx] = True
    elif kind == "block":
        r, c, k = val
        m[r:r + k, c:c + k] = True
    elif kind == "ring":
        m = _ring_depth(N) == val
    elif kind == "core":
        m = _ring_depth(N) >= 1
    elif kind == "all":
        m[:] = True
    else:
        raise ValueError(kind)
    m.flags.writeable = False
    return m


def region_size(kind: str, val, N: int) -> int:
    return N if kind == "line*" else int(region_mask(kind, val, N).sum())


def line_mask(idx: int, N: int) -> np.ndarray:
    return region_mask("line", (0, idx) if idx < N else (1, idx - N), N)


def line_scores(hit: np.ndarray) -> np.ndarray:
    """Per-line count of True cells: rows 0..N-1 then columns N..2N-1."""
    return np.concatenate([hit.sum(axis=1), hit.sum(axis=0)])


def resolve_mask(p: dict, gt: GridType, grid: Grid, feature: Optional[Callable] = None) -> np.ndarray:
    kind, val = p["kind"], p.get("region", ())
    if kind == "line*":
        return line_mask(int(np.argmax(feature(grid))), gt.N)   # argmax: lowest index wins ties
    return region_mask(kind, val, gt.N)


def region_text(p: dict, gt: GridType, star: str = "the line where it is most common") -> str:
    kind, val = p["kind"], p.get("region", ())
    if kind == "cell":
        return f"the cell at row {val[0] + 1}, column {val[1] + 1}"
    if kind == "line":
        return f"{'row' if val[0] == 0 else 'column'} {val[1] + 1}"
    if kind == "line*":
        return star
    if kind == "diag":
        return "the main diagonal" if val == 0 else "the other diagonal"
    if kind == "block":
        r, c, k = val
        return f"the {k}x{k} square at row {r + 1}, column {c + 1}"
    if kind == "ring":
        if region_size("ring", val, gt.N) == 1:
            return "the centre cell"
        return "the outer edge" if val == 0 else f"ring {val + 1} in from the edge"
    if kind == "core":
        return "everything off the edge"
    return "the whole grid"


def F_kind(*kinds) -> Field:
    return Field("kind", lambda gt, p: _kinds_ok(kinds, gt))


F_REGION = Field("region", lambda gt, p: region_choices(p["kind"], gt.N))
F_LINE = Field("line", lambda gt, p: region_choices("line", gt.N))


def _line_p(p):   # adapt a bare "line" field to region form
    return {"kind": "line", "region": p["line"]}


# value fields
def F_colour(name="colour") -> Field:
    return Field(name, lambda gt, p: list(range(gt.C)))


def F_colour_pair_ordered(name="pair") -> Field:
    return Field(name, lambda gt, p: [(a, b) for a in range(gt.C) for b in range(gt.C) if a != b])


def F_colour_pair(name="pair") -> Field:
    return Field(name, lambda gt, p: list(itertools.combinations(range(gt.C), 2)))


F_LAYER = Field("layer", lambda gt, p: ["both", "colour", "symbol"])


# ------------------------------------------------------------------------------------------------
# the Mutator record
# ------------------------------------------------------------------------------------------------
@dataclass(frozen=True, eq=False)
class Terms:
    erase: float = 0.0       # expected bits erased
    dcol: float = 0.0        # expected colour cells changed
    dsym: float = 0.0        # expected symbol cells changed
    measure: float = 0.0     # runtime selection bits
    scope: str = "local"


@dataclass(frozen=True, eq=False)
class Mutator:
    id: str
    name: str
    summary: str                     # kid-readable, parameter-free
    requires: Requires
    layer: str                       # colour | symbol | both | suit | mixed (layer is a parameter)
    bijective: bool
    scopes: tuple[str, ...]          # scopes its params can reach
    fields: tuple[Field, ...]
    terms_fn: Callable[[dict, GridType], Terms]
    apply_fn: Callable[[Grid, dict, GridType], Optional[Grid]]
    text_fn: Callable[[dict, GridType], str]

    # --- contract ----------------------------------------------------------------------------
    def available(self, gtype: GridType) -> bool:
        return self.requires.check(gtype)

    def sample(self, rng: np.random.Generator, gtype: GridType) -> Params:
        return _sample_fields(self.fields, rng, gtype)

    def space(self, gtype: GridType) -> Iterable[Params]:
        """Every parameter setting (finite). Sizes run from 7 to a few thousand."""
        return _space(self.fields, gtype)

    def describe_bits(self, params: Params, gtype: GridType) -> float:
        return _describe_bits(self.fields, params, gtype)

    def terms(self, params: Params, gtype: GridType) -> dict:
        """Cost breakdown in bits (already multiplied by the knobs, before scope/kind multipliers)."""
        K = COST_KNOBS
        t = self.terms_fn(params, gtype)
        bc, bs = log2(gtype.C), log2(gtype.S)
        N2 = gtype.N ** 2
        move = (t.dcol ** 2 * bc + t.dsym ** 2 * bs) / N2
        out = {"base": K["step_base"] * _lg(n_available(gtype)),
               "describe": K["describe"] * self.describe_bits(params, gtype),
               "erase": K["erase"] * float(t.erase),
               "move": K["move"] * move,
               "measure": K["measure"] * t.measure}
        out["scope"] = t.scope
        out["mult"] = K["scope"][t.scope] * K["kind"]["bijective" if self.bijective else "overwrite"]
        return out

    def cost(self, params: Params, gtype: GridType) -> float:
        t = self.terms(params, gtype)
        return float(t["mult"] * (t["base"] + t["describe"] + t["erase"] + t["move"] + t["measure"]))

    def scope_of(self, params: Params, gtype: GridType) -> str:
        return self.terms_fn(params, gtype).scope

    def apply(self, grid: Grid, params: Params, gtype: GridType, rng=None) -> Optional[Grid]:
        """Deterministic; rng is accepted for the contract and ignored. None = no-op."""
        out = self.apply_fn(grid, params, gtype)
        if out is None or out == grid:
            return None
        return out

    def describe(self, params: Params, gtype: GridType) -> str:
        return self.text_fn(params, gtype)


def _cn(gt, k):
    return gt.colour_names[k]


def _sym_text(gt, s):
    return gt.glyph(int(s))


def _rank_text(gt, r):
    return RANK_GLYPHS[r] if gt.symbols == "cards" else gt.glyph(r)


def _layer_bits(gt, layer):
    return {"both": log2(gt.C) + log2(gt.S), "colour": log2(gt.C), "symbol": log2(gt.S)}[layer]


def _moved(gt, layer, n):
    """Expected (colour, symbol) cells changed when n cells receive another cell's content."""
    dc = n * (1 - 1 / gt.C) if layer in ("both", "colour") else 0.0
    ds = n * (1 - 1 / gt.S) if layer in ("both", "symbol") else 0.0
    return dc, ds


def _layers(layer):
    return {"both": ("sym", "col"), "colour": ("col",), "symbol": ("sym",)}[layer]


def _arrays(g: Grid):
    return {"sym": g.sym.copy(), "col": g.col.copy()}


def _grid(a) -> Grid:
    return Grid(a["sym"], a["col"])


LAYER_WORD = {"both": "", "colour": " colours", "symbol": " symbols"}
OF_LAYER = {"both": "", "colour": "the colours of ", "symbol": "the symbols of "}

# ------------------------------------------------------------------------------------------------
# cached statistics under the prior (for non-trivial erasure terms)
# ------------------------------------------------------------------------------------------------
@lru_cache(maxsize=None)
def _majority_stats(N: int, C: int):
    """Over all C^N lines: (Shannon erasure, Hartley erasure, expected cells changed)."""
    idx = np.arange(C ** N, dtype=np.int64)
    digits = np.stack([(idx // C ** t) % C for t in range(N)], axis=1)
    counts = np.stack([(digits == k).sum(1) for k in range(C)], axis=1)
    plur = counts.argmax(1)
    mx = counts.max(1)
    freq = np.bincount(plur, minlength=C) / len(idx)
    H = -sum(f * log2(f) for f in freq if f > 0)
    shannon = N * log2(C) - H
    hartley = log2(np.bincount(plur, minlength=C).max())
    return shannon, hartley, float(N - mx.mean())


@lru_cache(maxsize=None)
def _sort_stats(gt: GridType):
    """Monte Carlo (fixed seed): (Shannon erasure, Hartley erasure, expected cells changed) for sorting
    a line of (symbol, colour) items by (rank, symbol, colour)."""
    rng = np.random.default_rng(zlib.crc32(gt.key.encode()))
    B, N = 4096, gt.N
    s = rng.integers(0, gt.S, (B, N))
    c = rng.integers(0, gt.C, (B, N))
    key = (gt.rank[s].astype(np.int64) * gt.S + s) * gt.C + c
    srt = np.sort(key, axis=1)
    changed = (srt != key).sum(1).mean()
    lgf = [math.lgamma(k + 1) / math.log(2) for k in range(N + 1)]
    er = []
    for row in srt:
        _, m = np.unique(row, return_counts=True)
        er.append(lgf[N] - sum(lgf[x] for x in m))
    return float(np.mean(er)), lgf[N], float(changed)


@lru_cache(maxsize=None)
def _degrees(N: int) -> np.ndarray:
    d = np.full((N, N), 4)
    d[0, :] -= 1; d[-1, :] -= 1; d[:, 0] -= 1; d[:, -1] -= 1
    return d


@lru_cache(maxsize=None)
def _available(gt: GridType, disabled: tuple = ()) -> tuple:
    return tuple(m for m in MUTATORS if m.available(gt) and m.id not in disabled)


def _disabled() -> tuple:
    return tuple(sorted(COST_KNOBS.get("disabled", ()) or ()))


def n_available(gt: GridType) -> int:
    return len(_available(gt, _disabled()))


def available(gtype: GridType) -> list:
    return list(_available(gtype, _disabled()))


def by_id(mid: str) -> Mutator:
    return _BY_ID[mid]


# ================================================================================================
# 1. positional bijections (move whole cells or one layer of them)
# ================================================================================================
def _pairs_adjacent(N):
    return [((r, c), (r, c + 1)) for r in range(N) for c in range(N - 1)] + \
           [((r, c), (r + 1, c)) for r in range(N - 1) for c in range(N)]


@lru_cache(maxsize=None)
def _pairs(N, near):
    adj = _pairs_adjacent(N)
    if near == "next door":
        return adj
    s = set(adj)
    cells = [(r, c) for r in range(N) for c in range(N)]
    return [pq for pq in itertools.combinations(cells, 2) if pq not in s]


def _swap_cells(g, p, gt):
    a = _arrays(g)
    (r1, c1), (r2, c2) = p["pair"]
    for L in _layers(p["layer"]):
        a[L][r1, c1], a[L][r2, c2] = a[L][r2, c2], a[L][r1, c1]
    return _grid(a)


swap_cells = Mutator(
    "swap_cells", "Swap", "Swap two cells (or just their colours, or just their symbols).",
    req(), "mixed", True, ("local",),
    (F_LAYER, Field("near", lambda gt, p: ["next door", "anywhere"]),
     Field("pair", lambda gt, p: _pairs(gt.N, p["near"]))),
    lambda p, gt: Terms(dcol=_moved(gt, p["layer"], 2)[0], dsym=_moved(gt, p["layer"], 2)[1], scope="local"),
    _swap_cells,
    lambda p, gt: (f"swap {OF_LAYER[p['layer']] or 'the '}cells at "
                   f"({p['pair'][0][0] + 1},{p['pair'][0][1] + 1}) and ({p['pair'][1][0] + 1},{p['pair'][1][1] + 1})"),
)


def _line_view(arr, a, i):
    return arr[i, :] if a == 0 else arr[:, i]


def _shift_line(g, p, gt):
    a = _arrays(g)
    ax, i = p["line"]
    for L in _layers(p["layer"]):
        v = _line_view(a[L], ax, i)
        v[:] = np.roll(v.copy(), p["k"])
    return _grid(a)


shift_line = Mutator(
    "shift_line", "Slide", "Slide a row or column along, wrapping round the end like a conveyor belt.",
    req(), "mixed", True, ("line",),
    (F_LAYER, F_LINE, Field("k", lambda gt, p: list(range(1, gt.N)))),
    lambda p, gt: Terms(dcol=_moved(gt, p["layer"], gt.N)[0], dsym=_moved(gt, p["layer"], gt.N)[1], scope="line"),
    _shift_line,
    lambda p, gt: (f"slide {OF_LAYER[p['layer']]}{region_text(_line_p(p), gt)} "
                   f"{p['k']} step{'s' if p['k'] > 1 else ''} {'right' if p['line'][0] == 0 else 'down'}, wrapping round"),
)


def _reverse_line(g, p, gt):
    a = _arrays(g)
    ax, i = p["line"]
    for L in _layers(p["layer"]):
        v = _line_view(a[L], ax, i)
        v[:] = v[::-1].copy()
    return _grid(a)


reverse_line = Mutator(
    "reverse_line", "Reverse", "Read a row or column backwards: flip its order end to end.",
    req(), "mixed", True, ("line",),
    (F_LAYER, F_LINE),
    lambda p, gt: Terms(dcol=_moved(gt, p["layer"], gt.N - gt.N % 2)[0],
                        dsym=_moved(gt, p["layer"], gt.N - gt.N % 2)[1], scope="line"),
    _reverse_line,
    lambda p, gt: f"reverse {OF_LAYER[p['layer']]}{region_text(_line_p(p), gt)}",
)


def _swap_lines(g, p, gt):
    a = _arrays(g)
    i, j = p["pair"]
    for L in ("sym", "col"):
        if p["axis"] == 0:
            a[L][[i, j], :] = a[L][[j, i], :]
        else:
            a[L][:, [i, j]] = a[L][:, [j, i]]
    return _grid(a)


swap_lines = Mutator(
    "swap_lines", "Swap rows", "Swap two whole rows (or two whole columns).",
    req(), "both", True, ("line",),
    (Field("axis", lambda gt, p: [0, 1]), Field("pair", lambda gt, p: list(itertools.combinations(range(gt.N), 2)))),
    lambda p, gt: Terms(dcol=_moved(gt, "both", 2 * gt.N)[0], dsym=_moved(gt, "both", 2 * gt.N)[1], scope="line"),
    _swap_lines,
    lambda p, gt: f"swap {'rows' if p['axis'] == 0 else 'columns'} {p['pair'][0] + 1} and {p['pair'][1] + 1}",
)

D4_MOVES = ("rot90", "rot180", "rot270", "flipH", "flipV", "transpose", "antitranspose")
D4_TEXT = {"rot90": "a quarter turn anticlockwise", "rot180": "a half turn", "rot270": "a quarter turn clockwise",
           "flipH": "a left-right flip", "flipV": "an upside-down flip", "transpose": "a flip across the main diagonal",
           "antitranspose": "a flip across the other diagonal"}


@lru_cache(maxsize=None)
def _moved_cells(g: str, k: int) -> int:
    idx = np.arange(k * k).reshape(k, k)
    return int((D4[g](idx) != idx).sum())


def _turn_block(g, p, gt):
    a = _arrays(g)
    r, c, k = p["region"]
    for L in ("sym", "col"):
        a[L][r:r + k, c:c + k] = D4[p["move"]](a[L][r:r + k, c:c + k].copy())
    return _grid(a)


turn_block = Mutator(
    "turn_block", "Spin a square", "Turn or flip a small square of cells, like a tile on a puzzle board.",
    req(), "both", True, ("block",),
    (Field("kind", lambda gt, p: ["block"]), F_REGION, Field("move", lambda gt, p: list(D4_MOVES))),
    lambda p, gt: Terms(dcol=_moved(gt, "both", _moved_cells(p["move"], p["region"][2]))[0],
                        dsym=_moved(gt, "both", _moved_cells(p["move"], p["region"][2]))[1], scope="block"),
    _turn_block,
    lambda p, gt: f"give {region_text(p, gt)} {D4_TEXT[p['move']]}",
)


def _turn_grid(g, p, gt):
    return Grid(D4[p["move"]](g.sym), D4[p["move"]](g.col))


turn_grid = Mutator(
    "turn_grid", "Spin the grid", "Turn or flip the whole grid.",
    req(), "both", True, ("global",),
    (Field("move", lambda gt, p: list(D4_MOVES)),),
    lambda p, gt: Terms(dcol=_moved(gt, "both", _moved_cells(p["move"], gt.N))[0],
                        dsym=_moved(gt, "both", _moved_cells(p["move"], gt.N))[1], scope="global"),
    _turn_grid,
    lambda p, gt: f"give the whole grid {D4_TEXT[p['move']]}",
)


# ================================================================================================
# 2. positional overwrites (rearrange with loss)
# ================================================================================================
def _sort_line(g, p, gt):
    a = _arrays(g)
    ax, i = p["line"]
    s, c = _line_view(a["sym"], ax, i), _line_view(a["col"], ax, i)
    key = (gt.rank[s.astype(np.int64)].astype(np.int64) * gt.S + s) * gt.C + c
    order = np.argsort(key, kind="stable")
    if p["dir"] < 0:
        order = order[::-1]
    s[:], c[:] = s[order].copy(), c[order].copy()
    return _grid(a)


def _sort_terms(p, gt):
    sh, ha, ch = _sort_stats(gt)
    dc, ds = _moved(gt, "both", ch)
    return Terms(erase=sh if COST_KNOBS["erasure"] == "shannon" else ha, dcol=dc, dsym=ds, scope="line")


sort_line = Mutator(
    "sort_line", "Sort", "Sort a row or column into counting order (cells keep their colours).",
    req("Ranked"), "both", False, ("line",),
    (F_LINE, Field("dir", lambda gt, p: [1, -1])),
    _sort_terms, _sort_line,
    lambda p, gt: f"sort {region_text(_line_p(p), gt)} {'smallest' if p['dir'] > 0 else 'biggest'} first",
)

FOLDS = ("left->right", "right->left", "top->bottom", "bottom->top",
         "below->above diagonal", "above->below diagonal", "below->above other diagonal", "above->below other diagonal")


@lru_cache(maxsize=None)
def _fold_map(N: int, kind: str, val, side) -> tuple[np.ndarray, np.ndarray]:
    """(dest flat indices, source flat indices) for a fold."""
    r, c = np.indices((N, N))
    if kind == "line":
        ax, i = val
        t = np.arange(N)
        dest_t = t[t > (N - 1) / 2] if side == 0 else t[t < (N - 1) / 2]
        src_t = N - 1 - dest_t
        if ax == 0:
            return i * N + dest_t, i * N + src_t
        return dest_t * N + i, src_t * N + i
    f = FOLDS.index(side)
    if f in (0, 1):
        dmask = (c > (N - 1) / 2) if f == 0 else (c < (N - 1) / 2)
        sr, sc = r, N - 1 - c
    elif f in (2, 3):
        dmask = (r > (N - 1) / 2) if f == 2 else (r < (N - 1) / 2)
        sr, sc = N - 1 - r, c
    elif f in (4, 5):
        dmask = (c > r) if f == 4 else (c < r)
        sr, sc = c, r
    else:
        dmask = (r + c > N - 1) if f == 7 else (r + c < N - 1)
        sr, sc = N - 1 - c, N - 1 - r
    dest = (r * N + c)[dmask]
    src = (sr * N + sc)[dmask]
    return dest, src


def _fold(g, p, gt):
    a = _arrays(g)
    dest, src = _fold_map(gt.N, p["kind"], p.get("line", ()), p["side"])
    for L in _layers(p["layer"]):
        flat = a[L].reshape(-1)
        flat[dest] = flat[src]
    return _grid(a)


def _fold_terms(p, gt):
    n = len(_fold_map(gt.N, p["kind"], p.get("line", ()), p["side"])[0])
    dc, ds = _moved(gt, p["layer"], n)
    return Terms(erase=n * _layer_bits(gt, p["layer"]), dcol=dc, dsym=ds,
                 scope="line" if p["kind"] == "line" else "global")


def _fold_text(p, gt):
    w = LAYER_WORD[p["layer"]].strip() or "cells"
    if p["kind"] == "line":
        half = "first half onto the second" if p["side"] == 0 else "second half onto the first"
        return f"make {region_text(_line_p(p), gt)} a palindrome: mirror its {half} ({w})"
    return f"mirror the whole grid {p['side']} ({w})"


mirror_fold = Mutator(
    "mirror_fold", "Mirror", "Copy one half onto the other half as a mirror image (of one row, or the whole grid).",
    req(), "mixed", False, ("line", "global"),
    (F_LAYER, Field("kind", lambda gt, p: ["line", "all"]),
     Field("line", lambda gt, p: region_choices("line", gt.N) if p["kind"] == "line" else None),
     Field("side", lambda gt, p: [0, 1] if p["kind"] == "line" else list(FOLDS))),
    _fold_terms, _fold, _fold_text,
)


# ================================================================================================
# 3. colour layer
# ================================================================================================
PAINT_KINDS = ("cell", "line", "line*", "diag", "block", "ring", "core", "all")


def _paint(g, p, gt):
    k = p["colour"]
    m = resolve_mask(p, gt, g, lambda x: line_scores(x.col == k))
    col = g.col.copy()
    col[m] = k
    return g.replace(col=col)


def _paint_terms(p, gt):
    n = region_size(p["kind"], p.get("region"), gt.N)
    return Terms(erase=n * log2(gt.C), dcol=n * (1 - 1 / gt.C),
                 measure=_lg(2 * gt.N) if p["kind"] == "line*" else 0.0, scope=REGION_SCOPE[p["kind"]])


paint = Mutator(
    "paint", "Paint", "Paint a cell, a line, a square, a ring or the whole grid in one colour.",
    req(), "colour", False, SCOPES,
    (F_kind(*PAINT_KINDS), F_REGION, F_colour()),
    _paint_terms, _paint,
    lambda p, gt: f"paint {region_text(p, gt, 'the row or column with the most ' + _cn(gt, p['colour']))} {_cn(gt, p['colour'])}",
)


def _recolour(g, p, gt):
    a, b = p["pair"]
    m = resolve_mask(p, gt, g, lambda x: line_scores(x.col == b)) & (g.col == a)
    col = g.col.copy()
    col[m] = b
    return g.replace(col=col)


def _recolour_terms(p, gt):
    n = region_size(p["kind"], p.get("region"), gt.N)
    e = n * 2 / gt.C if COST_KNOBS["erasure"] == "shannon" else float(n)
    return Terms(erase=e, dcol=n / gt.C, measure=_lg(2 * gt.N) if p["kind"] == "line*" else 0.0,
                 scope=REGION_SCOPE[p["kind"]])


recolour = Mutator(
    "recolour", "Recolour", "Turn every cell of one colour into another colour, inside an area.",
    req(), "colour", False, ("line", "block", "region", "global"),
    (F_kind("line", "line*", "block", "ring", "core", "all"), F_REGION, F_colour_pair_ordered()),
    _recolour_terms, _recolour,
    lambda p, gt: (f"turn every {_cn(gt, p['pair'][0])} cell in "
                   f"{region_text(p, gt, 'the row or column with the most ' + _cn(gt, p['pair'][1]))} {_cn(gt, p['pair'][1])}"),
)


def _swap_colours(g, p, gt):
    a, b = p["pair"]
    m = resolve_mask(p, gt, g)
    col = g.col.copy()
    col[m & (g.col == a)] = b
    col[m & (g.col == b)] = a
    return g.replace(col=col)


swap_colours = Mutator(
    "swap_colours", "Trade colours", "Two colours trade places inside an area: every A becomes B and every B becomes A.",
    req(), "colour", True, ("line", "block", "region", "global"),
    (F_kind("line", "block", "ring", "all"), F_REGION, F_colour_pair()),
    lambda p, gt: Terms(dcol=2 * region_size(p["kind"], p["region"], gt.N) / gt.C, scope=REGION_SCOPE[p["kind"]]),
    _swap_colours,
    lambda p, gt: f"swap {_cn(gt, p['pair'][0])} and {_cn(gt, p['pair'][1])} in {region_text(p, gt)}",
)


def _hue_turn(g, p, gt):
    m = resolve_mask(p, gt, g)
    col = g.col.copy()
    col[m] = (col[m].astype(np.int64) + p["k"]) % gt.C
    return g.replace(col=col)


hue_turn = Mutator(
    "hue_turn", "Rainbow step", "Move colours along the rainbow by some steps (wrapping round), inside an area.",
    req("Spectral"), "colour", True, ("local", "line", "block", "region", "global"),
    (F_kind("cell", "line", "block", "ring", "all"), F_REGION, Field("k", lambda gt, p: list(range(1, gt.C)))),
    lambda p, gt: Terms(dcol=float(region_size(p["kind"], p["region"], gt.N)), scope=REGION_SCOPE[p["kind"]]),
    _hue_turn,
    lambda p, gt: f"move every colour in {region_text(p, gt)} {p['k']} step{'s' if p['k'] > 1 else ''} along the rainbow",
)


def _pattern_line(g, p, gt):
    t = np.arange(gt.N)
    if p["pattern"] == "ramp":
        vals = (p["start"] + p["dir"] * t) % gt.C
    else:
        a, b = p["pair"]
        vals = np.where(t % 2 == 0, a, b)
    col = g.col.copy()
    ax, i = p["line"]
    if ax == 0:
        col[i, :] = vals
    else:
        col[:, i] = vals
    return g.replace(col=col)


def _pattern_text(p, gt):
    where = region_text(_line_p(p), gt)
    if p["pattern"] == "ramp":
        return (f"paint {where} as a rainbow starting {_cn(gt, p['start'])}, "
                f"{'forwards' if p['dir'] > 0 else 'backwards'} along the rainbow")
    return f"paint {where} {_cn(gt, p['pair'][0])}, {_cn(gt, p['pair'][1])}, {_cn(gt, p['pair'][0])}, ... alternating"


pattern_line = Mutator(
    "pattern_line", "Pattern a line", "Paint a row or column as a rainbow run or as two alternating colours.",
    req("Spectral"), "colour", False, ("line",),
    (F_LINE, Field("pattern", lambda gt, p: ["ramp", "alternate"]),
     Field("start", lambda gt, p: list(range(gt.C)) if p["pattern"] == "ramp" else None),
     Field("dir", lambda gt, p: [1, -1] if p["pattern"] == "ramp" else None),
     Field("pair", lambda gt, p: [(a, b) for a in range(gt.C) for b in range(gt.C) if a != b]
           if p["pattern"] == "alternate" else None)),
    lambda p, gt: Terms(erase=gt.N * log2(gt.C), dcol=gt.N * (1 - 1 / gt.C), scope="line"),
    _pattern_line, _pattern_text,
)


def _motif_colours(p, gt):
    r, c = np.indices((gt.N, gt.N))
    if p["style"] == "stripes":
        t = r if p["axis"] == 0 else c
        return (p["start"] + p["dir"] * t) % gt.C
    if p["style"] == "checker":
        a, b = p["pair"]
        return np.where((r + c) % 2 == 0, a, b)
    t = r + c if p["axis"] == 0 else r - c
    return (p["start"] + p["dir"] * t) % gt.C


def _motif_text(p, gt):
    if p["style"] == "stripes":
        return (f"paint the whole grid in rainbow {'stripes across' if p['axis'] == 0 else 'stripes down'} "
                f"starting {_cn(gt, p['start'])}{'' if p['dir'] > 0 else ', going backwards'}")
    if p["style"] == "checker":
        return f"paint the whole grid as a {_cn(gt, p['pair'][0])}/{_cn(gt, p['pair'][1])} chessboard"
    return (f"paint the whole grid in diagonal rainbow stripes starting {_cn(gt, p['start'])}"
            f"{'' if p['dir'] > 0 else ', going backwards'}")


motif = Mutator(
    "motif", "Wallpaper", "Repaint the whole grid with a pattern: rainbow stripes, diagonal rainbows or a chessboard.",
    req("Spectral"), "colour", False, ("global",),
    (Field("style", lambda gt, p: ["stripes", "checker", "diagonal"]),
     Field("axis", lambda gt, p: [0, 1] if p["style"] != "checker" else None),
     Field("start", lambda gt, p: list(range(gt.C)) if p["style"] != "checker" else None),
     Field("dir", lambda gt, p: [1, -1] if p["style"] != "checker" else None),
     Field("pair", lambda gt, p: [(a, b) for a in range(gt.C) for b in range(gt.C) if a != b]
           if p["style"] == "checker" else None)),
    lambda p, gt: Terms(erase=gt.N ** 2 * log2(gt.C), dcol=gt.N ** 2 * (1 - 1 / gt.C), scope="global"),
    lambda g, p, gt: g.replace(col=_motif_colours(p, gt)),
    _motif_text,
)


def _plurality(col_line: np.ndarray, C: int) -> int:
    return int(np.bincount(col_line, minlength=C).argmax())


def _majority_feature(gt):
    def f(x):
        oh = x.col[..., None] == np.arange(gt.C)
        return np.concatenate([oh.sum(axis=1).max(axis=1), oh.sum(axis=0).max(axis=1)])
    return f


def _majority(g, p, gt):
    m = resolve_mask({"kind": p["kind"], "region": p.get("region", ())}, gt, g, _majority_feature(gt))
    col = g.col.copy()
    col[m] = _plurality(g.col[m], gt.C)
    return g.replace(col=col)


def _majority_terms(p, gt):
    sh, ha, ch = _majority_stats(gt.N, gt.C)
    return Terms(erase=sh if COST_KNOBS["erasure"] == "shannon" else ha, dcol=ch,
                 measure=_lg(2 * gt.N) if p["kind"] == "line*" else 0.0, scope="line")


majority_line = Mutator(
    "majority_line", "Majority vote", "A row or column votes: every cell takes the line's most common colour.",
    req(), "colour", False, ("line",),
    (F_kind("line", "line*"), F_REGION),
    _majority_terms, _majority,
    lambda p, gt: f"make {region_text(p, gt, 'the row or column that is closest to one colour')} all its most common colour",
)


# ================================================================================================
# 4. symbol layer
# ================================================================================================
def _write(g, p, gt):
    s = p["symbol"]
    m = resolve_mask(p, gt, g, lambda x: line_scores(x.sym == s))
    sym = g.sym.copy()
    sym[m] = s
    return g.replace(sym=sym)


def _write_terms(p, gt):
    n = region_size(p["kind"], p.get("region"), gt.N)
    return Terms(erase=n * log2(gt.S), dsym=n * (1 - 1 / gt.S),
                 measure=_lg(2 * gt.N) if p["kind"] == "line*" else 0.0, scope=REGION_SCOPE[p["kind"]])


write = Mutator(
    "write", "Write", "Write one symbol into a cell, a line, a square, a ring or the whole grid.",
    req(), "symbol", False, SCOPES,
    (F_kind(*PAINT_KINDS), F_REGION, Field("symbol", lambda gt, p: list(range(gt.S)))),
    _write_terms, _write,
    lambda p, gt: (f"write {_sym_text(gt, p['symbol'])} in {'' if p['kind'] == 'cell' else 'every cell of '}"
                   f"{region_text(p, gt, 'the row or column with the most ' + _sym_text(gt, p['symbol']) + 's')}"),
)


def _flatten(g, p, gt):
    m = resolve_mask(p, gt, g)
    sym = g.sym.astype(np.int64)
    r = gt.rank[sym]
    rr = r[m]
    if rr.size < 2:
        return None
    hi, lo = int(rr.max()), int(rr.min())
    sel = m & (r != hi) & (r != lo)
    if hi == lo or not sel.any():
        return None
    out = sym.copy()
    out[sel] = (sym[sel] // 13) * 13 + lo if gt.symbols == "cards" else lo
    return g.replace(sym=out)


def _flatten_terms(p, gt):
    n = region_size(p["kind"], p["region"], gt.N)
    R = gt.ranks
    # every cell but the peak loses its rank: (n - 1) log2 R bits (a slight over-charge: the output
    # still records which cells were peaks), the same in both erasure modes
    return Terms(erase=max(n - 1, 0) * log2(R), dsym=max(n - 1, 0) * (1 - 2 / R), scope=REGION_SCOPE[p["kind"]])


flatten = Mutator(
    "flatten", "Flatten", "Flatten the lowlands: in an area, every number except the highest drops to the area's lowest "
    "(cards keep their suit).",
    req("Ranked"), "symbol", False, ("line", "block", "region", "global"),
    (F_kind("line", "block", "ring", "all"), F_REGION),
    _flatten_terms, _flatten,
    lambda p, gt: f"in {region_text(p, gt)}, every number except the highest drops to the lowest one there",
)


def _step_rank(g, p, gt):
    m = resolve_mask(p, gt, g)
    sym = g.sym.copy()
    sym[m] = gt.step(sym[m].astype(np.int64), p["k"])
    return g.replace(sym=sym)


step_rank = Mutator(
    "step_rank", "Count on", "Count every number in an area on by some steps (wrapping round; cards keep their suit).",
    req("Ranked"), "symbol", True, ("local", "line", "block", "region", "global"),
    (F_kind("cell", "line", "block", "ring", "all"), F_REGION, Field("k", lambda gt, p: list(range(1, gt.ranks)))),
    lambda p, gt: Terms(dsym=float(region_size(p["kind"], p["region"], gt.N)), scope=REGION_SCOPE[p["kind"]]),
    _step_rank,
    lambda p, gt: f"count every number in {region_text(p, gt)} on by {p['k']}",
)


def _write_ramp(g, p, gt):
    t = np.arange(gt.N)
    ranks = (p["start"] + p["dir"] * t) % gt.ranks
    sym = g.sym.copy()
    ax, i = p["line"]
    v = _line_view(sym, ax, i)
    if gt.symbols == "cards":
        v[:] = (v // 13) * 13 + ranks
    else:
        v[:] = ranks
    return g.replace(sym=sym)


write_ramp = Mutator(
    "write_ramp", "Count along", "Write a counting run along a row or column: 3, 4, 5, 6, ... (cards keep their suit).",
    req("Ranked"), "symbol", False, ("line",),
    (F_LINE, Field("start", lambda gt, p: list(range(gt.ranks))), Field("dir", lambda gt, p: [1, -1])),
    lambda p, gt: Terms(erase=gt.N * log2(gt.ranks), dsym=gt.N * (1 - 1 / gt.ranks), scope="line"),
    _write_ramp,
    lambda p, gt: (f"write a counting run in {region_text(_line_p(p), gt)} starting at {_rank_text(gt, p['start'])}, "
                   f"counting {'up' if p['dir'] > 0 else 'down'}"),
)


def _swap_symbols(g, p, gt):
    a, b = p["pair"]
    m = resolve_mask(p, gt, g)
    sym = g.sym.copy()
    rk = gt.rank[g.sym.astype(np.int64)]
    ma, mb = m & (rk == a), m & (rk == b)
    sym[ma] = gt.step(g.sym[ma].astype(np.int64), b - a)
    sym[mb] = gt.step(g.sym[mb].astype(np.int64), a - b)
    return g.replace(sym=sym)


swap_symbols = Mutator(
    "swap_symbols", "Trade numbers", "Two numbers trade places inside an area: every 3 becomes 7 and every 7 becomes 3.",
    req("Ranked"), "symbol", True, ("line", "block", "region", "global"),
    (F_kind("line", "block", "ring", "all"), F_REGION,
     Field("pair", lambda gt, p: list(itertools.combinations(range(gt.ranks), 2)))),
    lambda p, gt: Terms(dsym=2 * region_size(p["kind"], p["region"], gt.N) / gt.ranks, scope=REGION_SCOPE[p["kind"]]),
    _swap_symbols,
    lambda p, gt: f"swap {_rank_text(gt, p['pair'][0])}s and {_rank_text(gt, p['pair'][1])}s in {region_text(p, gt)}",
)


# ================================================================================================
# 5. couplers (one layer written from the other)
# ================================================================================================
def _key_colours(p, gt, sym):
    v = gt.value[sym.astype(np.int64)].astype(np.int64)
    if p["key"] == "parity":
        P, Q = p["pair"]
        return np.where(v % 2 == 0, P, Q)
    if p["key"] == "mod":
        return (v + p["shift"]) % gt.C
    P, Q = p["pair"]   # redblack: hearts/diamonds -> P, spades/clubs -> Q
    s = gt.suit[sym.astype(np.int64)]
    return np.where((s == 1) | (s == 2), P, Q)


def _paint_by_key(g, p, gt):
    m = resolve_mask(p, gt, g)
    col = g.col.copy()
    col[m] = _key_colours(p, gt, g.sym)[m]
    return g.replace(col=col)


def _key_text(p, gt):
    where = region_text(p, gt)
    if p["key"] == "parity":
        return f"in {where}, paint even numbers {_cn(gt, p['pair'][0])} and odd numbers {_cn(gt, p['pair'][1])}"
    if p["key"] == "mod":
        return f"in {where}, paint each cell by its number (colour = number + {p['shift']}, round the rainbow)"
    return f"in {where}, paint hearts and diamonds {_cn(gt, p['pair'][0])} and spades and clubs {_cn(gt, p['pair'][1])}"


paint_by_key = Mutator(
    "paint_by_key", "Paint by number", "Colour cells by what they show: even/odd, number-to-colour, or red/black suits.",
    req("Valued"), "colour", False, ("line", "global"),
    (F_kind("line", "all"), F_REGION,
     Field("key", lambda gt, p: ["parity", "mod"] + (["redblack"] if "Suited" in gt.caps else [])),
     Field("pair", lambda gt, p: [(a, b) for a in range(gt.C) for b in range(gt.C) if a != b]
           if p["key"] != "mod" else None),
     Field("shift", lambda gt, p: list(range(gt.C)) if p["key"] == "mod" else None)),
    lambda p, gt: Terms(erase=region_size(p["kind"], p["region"], gt.N) * log2(gt.C),
                        dcol=region_size(p["kind"], p["region"], gt.N) * (1 - 1 / gt.C), scope=REGION_SCOPE[p["kind"]]),
    _paint_by_key, _key_text,
)


def _stamp(g, p, gt):
    m = resolve_mask(p, gt, g) & (g.col == p["colour"])
    sym = g.sym.copy()
    sym[m] = p["symbol"]
    return g.replace(sym=sym)


def _stamp_terms(p, gt):
    n = region_size(p["kind"], p["region"], gt.N)
    frac = 1 / gt.C if COST_KNOBS["erasure"] == "shannon" else 1.0
    return Terms(erase=n * frac * log2(gt.S), dsym=n / gt.C * (1 - 1 / gt.S), scope=REGION_SCOPE[p["kind"]])


stamp = Mutator(
    "stamp", "Stamp", "Every cell of one colour gets the same symbol stamped on it, inside an area.",
    req(), "symbol", False, ("line", "block", "global"),
    (F_kind("line", "block", "all"), F_REGION, F_colour(), Field("symbol", lambda gt, p: list(range(gt.S)))),
    _stamp_terms, _stamp,
    lambda p, gt: f"stamp {_sym_text(gt, p['symbol'])} on every {_cn(gt, p['colour'])} cell in {region_text(p, gt)}",
)


def _mine_counts(col, X):
    mines = (col == X).astype(np.int64)
    pad = np.pad(mines, 1)
    N = col.shape[0]
    tot = sum(pad[1 + dr:1 + dr + N, 1 + dc:1 + dc + N] for dr in (-1, 0, 1) for dc in (-1, 0, 1)
              if (dr, dc) != (0, 0))
    return tot


def _tally(g, p, gt):
    X = p["colour"]
    m = resolve_mask(p, gt, g) & (g.col != X)
    sym = g.sym.copy()
    sym[m] = np.minimum(_mine_counts(g.col, X), gt.S - 1)[m]
    return g.replace(sym=sym)


def _tally_terms(p, gt):
    n = region_size(p["kind"], p["region"], gt.N)
    frac = (1 - 1 / gt.C) if COST_KNOBS["erasure"] == "shannon" else 1.0
    return Terms(erase=n * frac * log2(gt.S), dsym=n * (1 - 1 / gt.C) * (1 - 1 / gt.S), scope=REGION_SCOPE[p["kind"]])


tally = Mutator(
    "tally", "Count the mines", "Cells of one colour are mines; every other cell shows how many mines touch it.",
    req("Numeral"), "symbol", False, ("line", "block", "global"),
    (F_kind("line", "block", "all"), F_REGION, F_colour()),
    _tally_terms, _tally,
    lambda p, gt: f"treat {_cn(gt, p['colour'])} cells as mines: every other cell in {region_text(p, gt)} shows how many mines touch it",
)


# ================================================================================================
# 6. capability-specific: paint mixing and suits
# ================================================================================================
def _recipes(gt):
    return [(gt.colour(a), gt.colour(b), gt.colour(ch)) for (a, b), ch in MIXES[gt.colours].items()]


def _neigh_has(col, k):
    hit = (col == k)
    pad = np.pad(hit, 1)
    N = col.shape[0]
    return pad[:-2, 1:-1][:N, :N] | pad[2:, 1:-1] | pad[1:-1, :-2] | pad[1:-1, 2:]


def _blend(g, p, gt):
    a, b, ch = p["recipe"]
    m = resolve_mask(p, gt, g) & (g.col != a) & (g.col != b) & _neigh_has(g.col, a) & _neigh_has(g.col, b)
    col = g.col.copy()
    col[m] = ch
    return g.replace(col=col)


def _blend_terms(p, gt):
    C = gt.C
    m = region_mask(p["kind"], p["region"], gt.N)
    d = _degrees(gt.N)[m]
    q = (1 - 2 / C) * (1 - 2 * (1 - 1 / C) ** d + (1 - 2 / C) ** d)
    shannon = COST_KNOBS["erasure"] == "shannon"
    e = float((q if shannon else np.ones_like(q)).sum() * _lg(C - 2))
    return Terms(erase=e, dcol=float(q.sum() * (C - 3) / (C - 2)), scope=REGION_SCOPE[p["kind"]])


blend = Mutator(
    "blend", "Mix paint", "Where two paints meet (say red and yellow), the cells touching both turn the mixed colour (orange).",
    req("Mixable"), "colour", False, ("line", "global"),
    (F_kind("line", "all"), F_REGION, Field("recipe", lambda gt, p: _recipes(gt))),
    _blend_terms, _blend,
    lambda p, gt: (f"in {region_text(p, gt)}, every cell touching both {_cn(gt, p['recipe'][0])} and "
                   f"{_cn(gt, p['recipe'][1])} turns {_cn(gt, p['recipe'][2])}"),
)


def _suit_swap(g, p, gt):
    a, b = p["pair"]
    m = resolve_mask(p, gt, g)
    s = g.sym.astype(np.int64)
    su = s // 13
    out = s.copy()
    out[m & (su == a)] += (b - a) * 13
    out[m & (su == b)] += (a - b) * 13
    return g.replace(sym=out)


suit_swap = Mutator(
    "suit_swap", "Trade suits", "Two suits trade places inside an area: every heart becomes a spade and every spade a heart.",
    req("Suited"), "suit", True, ("local", "line", "block", "global"),
    (F_kind("cell", "line", "block", "all"), F_REGION, Field("pair", lambda gt, p: list(itertools.combinations(range(4), 2)))),
    lambda p, gt: Terms(dsym=2 * region_size(p["kind"], p["region"], gt.N) / 4, scope=REGION_SCOPE[p["kind"]]),
    _suit_swap,
    lambda p, gt: f"swap {SUITS[p['pair'][0]]} and {SUITS[p['pair'][1]]} in {region_text(p, gt)}",
)


def _suit_set(g, p, gt):
    m = resolve_mask(p, gt, g)
    s = g.sym.astype(np.int64)
    out = s.copy()
    out[m] = p["suit"] * 13 + s[m] % 13
    return g.replace(sym=out)


suit_set = Mutator(
    "suit_set", "Change suit", "Every card in an area changes to one suit (keeping its rank).",
    req("Suited"), "suit", False, ("line", "block", "region", "global"),
    (F_kind("line", "block", "ring", "all"), F_REGION, Field("suit", lambda gt, p: list(range(4)))),
    lambda p, gt: Terms(erase=2.0 * region_size(p["kind"], p["region"], gt.N),
                        dsym=0.75 * region_size(p["kind"], p["region"], gt.N), scope=REGION_SCOPE[p["kind"]]),
    _suit_set,
    lambda p, gt: f"make every card in {region_text(p, gt)} a {SUITS[p['suit']]}",
)


# ------------------------------------------------------------------------------------------------
MUTATORS: list[Mutator] = [
    # positional bijections
    swap_cells, shift_line, reverse_line, swap_lines, turn_block, turn_grid,
    # positional overwrites
    sort_line, mirror_fold,
    # colour
    paint, recolour, swap_colours, hue_turn, pattern_line, motif, majority_line,
    # symbol
    write, step_rank, write_ramp, swap_symbols, flatten,
    # couplers
    paint_by_key, stamp, tally,
    # capability-specific
    blend, suit_swap, suit_set,
]
_BY_ID = {m.id: m for m in MUTATORS}
assert len(_BY_ID) == len(MUTATORS)


def cost_table(gtype: GridType, examples: dict[str, dict]) -> list[tuple[str, float, dict]]:
    """Helper for docs: (id, cost, terms) for chosen example params."""
    return [(mid, by_id(mid).cost(p, gtype), by_id(mid).terms(p, gtype)) for mid, p in examples.items()]
