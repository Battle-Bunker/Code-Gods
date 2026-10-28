"""Shared helpers for rule families: sampling, canonicalisation, shifts, components, exact tails.

Conventions used by every rule module:
- `gtype` is the GridType. `sym`, `col` are uint8 arrays: (N, N) for a scalar grid, (B, N, N) for a batch.
- Scalar `ordinal` implementations are written independently of the vectorised `batch` ones (plain
  Python loops / BFS), so the tests' scalar-vs-batch agreement check is a real cross-check.
- Lexicographic ordinals are tuples: `tup(a, b, ...)` (scalar, a tuple of Python ints) or
  `tupb(a, b, ...)` (batch, int64 (B, k)). Python compares them "first component first; if tied,
  the next", so no bounds are needed.
"""
from __future__ import annotations

import math
from collections import deque
from typing import Iterable

import numpy as np

from ..core import Grid, GridType, Requires, req
from ..family import Family

__all__ = ["np", "math", "Grid", "GridType", "Requires", "req", "Family", "tup", "tupb", "mk",
           "vmax", "vmin", "vals", "rank_key", "suits", "colour", "colours", "cname", "sglyph",
           "recolour", "shift", "valid", "orient", "label_batch", "label_links", "comp_sum", "comps2d",
           "log2_binom_tail", "log2_dist_tail", "dist_conv", "grid", "best_of", "DIRS4",
           "D4_DIR_NAMES", "nbrs4", "nbrs8", "lines_rc", "LINE_AXES"]

DIRS4 = ("→", "←", "↓", "↑")
D4_DIR_NAMES = {"→": "left to right", "←": "right to left", "↓": "top to bottom", "↑": "bottom to top"}
LINE_AXES = ("rows", "cols")


def mk(**kw) -> Family:
    """Family constructor with string-friendly tags."""
    tags = kw.pop("tags", ())
    kw["layers"] = frozenset(kw["layers"])
    return Family(tags=frozenset(tags), **kw)


# --- carriers --------------------------------------------------------------------------------
def vmax(gtype: GridType) -> int:
    return int(gtype.value.max())


def vmin(gtype: GridType) -> int:
    return int(gtype.value.min())


def vals(sym: np.ndarray, gtype: GridType) -> np.ndarray:
    return gtype.value[sym].astype(np.int64)


def rank_key(sym: np.ndarray, gtype: GridType) -> np.ndarray:
    """Symbol identity for 'same symbol' rules: rank for cards (suit ignored), digit otherwise."""
    return gtype.rank[sym].astype(np.int64)


def suits(sym: np.ndarray, col: np.ndarray, gtype: GridType) -> np.ndarray:
    """games.md convention: printed suit for cards, the cell's colour otherwise."""
    if gtype.suit is not None:
        return gtype.suit[sym].astype(np.int64)
    return col.astype(np.int64)


# --- sampling and naming ------------------------------------------------------------------------
def colour(rng, gtype: GridType) -> int:
    return int(rng.integers(gtype.C))


def colours(rng, gtype: GridType, k: int) -> list[int]:
    return [int(x) for x in rng.choice(gtype.C, k, replace=False)]


def cname(gtype: GridType, c: int) -> str:
    return gtype.colour_names[c]


def sglyph(gtype: GridType, s: int) -> str:
    return gtype.glyph(int(s))


def recolour(params: dict, keys: Iterable[str]) -> dict:
    """Rename colour-valued params by first appearance -> 0, 1, 2 ... (valid when the rule only
    tests colour equality against these params)."""
    p = dict(params)
    m: dict[int, int] = {}
    for k in keys:
        v = p.get(k)
        if v is None:
            continue
        if v not in m:
            m[v] = len(m)
        p[k] = m[v]
    return p


# --- array geometry (works on (N,N) and (B,N,N)) ----------------------------------------------
def shift(a: np.ndarray, dr: int, dc: int, fill=0) -> np.ndarray:
    """out[..., r, c] = a[..., r+dr, c+dc], or `fill` outside the grid."""
    N = a.shape[-1]
    out = np.full_like(a, fill)
    r0, r1 = max(0, -dr), N - max(0, dr)
    c0, c1 = max(0, -dc), N - max(0, dc)
    if r0 < r1 and c0 < c1:
        out[..., r0:r1, c0:c1] = a[..., r0 + dr:r1 + dr, c0 + dc:c1 + dc]
    return out


def valid(N: int, dr: int, dc: int) -> np.ndarray:
    """(N,N) bool: cell (r+dr, c+dc) is inside the grid."""
    return shift(np.ones((N, N), bool), dr, dc, False)


def orient(a: np.ndarray, d: str) -> np.ndarray:
    """Re-lay `a` so that each row is a line read in direction d."""
    if d == "→":
        return a
    if d == "←":
        return a[..., :, ::-1]
    t = np.swapaxes(a, -1, -2)
    return t if d == "↓" else t[..., :, ::-1]


def lines_rc(a: np.ndarray, axis: str) -> np.ndarray:
    """Lines as rows: 'rows' (L→R), 'cols' (T→B) or 'both' (rows then cols)."""
    if axis == "rows":
        return a
    if axis == "cols":
        return np.swapaxes(a, -1, -2)
    return np.concatenate([a, np.swapaxes(a, -1, -2)], axis=-2)


def nbrs4(N: int, r: int, c: int):
    for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        rr, cc = r + dr, c + dc
        if 0 <= rr < N and 0 <= cc < N:
            yield rr, cc


def nbrs8(N: int, r: int, c: int):
    for dr in (-1, 0, 1):
        for dc in (-1, 0, 1):
            if dr or dc:
                rr, cc = r + dr, c + dc
                if 0 <= rr < N and 0 <= cc < N:
                    yield rr, cc


# --- connected components -------------------------------------------------------------------------
def _pair_slices(N, dr, dc):
    r0, r1 = 0, N - dr
    c0, c1 = max(0, -dc), N - max(0, dc)
    return ((slice(None), slice(r0, r1), slice(c0, c1)),
            (slice(None), slice(r0 + dr, r1 + dr), slice(c0 + dc, c1 + dc)))


def _propagate(pairs, B, N):
    """Min-label propagation + pointer jumping, iterating only the grids whose labels still change."""
    NN = N * N
    lab = np.broadcast_to(np.arange(NN, dtype=np.int32).reshape(N, N), (B, N, N)).copy()
    pairs = [(s1, s2, c) for s1, s2, c in pairs if c.any()]
    if not pairs:
        return lab.astype(np.int64)
    active = np.arange(B)
    sub = lab
    links = [c for _, _, c in pairs]
    while len(active):
        old = sub.copy()
        for (s1, s2, _), c in zip(pairs, links):
            mn = np.minimum(sub[s1], sub[s2])
            np.copyto(sub[s1], mn, where=c)
            np.copyto(sub[s2], np.minimum(mn, sub[s2]), where=c)
        flat = sub.reshape(len(sub), NN)
        sub = np.take_along_axis(flat, flat, axis=1).reshape(len(sub), N, N)
        changed = (sub != old).reshape(len(sub), NN).any(1)
        lab[active] = sub
        if not changed.all():
            active = active[changed]
            sub = sub[changed]
            links = [c[changed] for c in links]
    return lab.astype(np.int64)


def label_batch(key: np.ndarray, mask: np.ndarray | None = None, diag: bool = False) -> np.ndarray:
    """Component labels for (B,N,N): neighbours are linked when both are in `mask` and have equal
    `key`. Each cell's label is the smallest flat index in its component (unmasked cells keep their
    own index). Min-propagation plus pointer jumping."""
    B, N, _ = key.shape
    m = np.ones(key.shape, bool) if mask is None else mask
    offs = [(0, 1), (1, 0)] + ([(1, 1), (1, -1)] if diag else [])
    pairs = []
    for dr, dc in offs:
        s1, s2 = _pair_slices(N, dr, dc)
        pairs.append((s1, s2, (key[s1] == key[s2]) & m[s1] & m[s2]))
    return _propagate(pairs, B, N)


def label_links(link_h: np.ndarray, link_v: np.ndarray) -> np.ndarray:
    """Component labels from explicit links: link_h (B,N,N-1) joins (r,c)-(r,c+1); link_v (B,N-1,N)."""
    B, N = link_h.shape[0], link_h.shape[1]
    sh, sv = _pair_slices(N, 0, 1), _pair_slices(N, 1, 0)
    return _propagate([(sh[0], sh[1], link_h), (sv[0], sv[1], link_v)], B, N)


def comp_sum(lab: np.ndarray, weights: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """Per cell: the sum of `weights` over the masked cells of its component (0 off-mask)."""
    B, N, _ = lab.shape
    NN = N * N
    g = lab.reshape(B, NN) + (np.arange(B, dtype=np.int64) * NN)[:, None]
    w = np.where(mask, weights, 0).reshape(-1)
    tot = np.bincount(g.ravel(), weights=w, minlength=B * NN)
    return np.where(mask, tot[g].reshape(B, N, N), 0).astype(np.int64)


def comps2d(key, mask, diag: bool = False) -> list[list[tuple[int, int]]]:
    """Scalar BFS components of masked cells linked by equal key (lists of nested lists OK)."""
    N = len(key)
    seen = [[False] * N for _ in range(N)]
    out = []
    nb = nbrs8 if diag else nbrs4
    for r in range(N):
        for c in range(N):
            if not mask[r][c] or seen[r][c]:
                continue
            comp, q = [], deque([(r, c)])
            seen[r][c] = True
            while q:
                a, b = q.popleft()
                comp.append((a, b))
                for x, y in nb(N, a, b):
                    if mask[x][y] and not seen[x][y] and key[x][y] == key[a][b]:
                        seen[x][y] = True
                        q.append((x, y))
            out.append(comp)
    return out


# --- tuple ordinals ------------------------------------------------------------------------------
def tup(*parts) -> tuple[int, ...]:
    """Scalar lexicographic ordinal: a tuple of Python ints."""
    return tuple(int(v) for v in parts)


def tupb(*parts) -> np.ndarray:
    """Batch lexicographic ordinal: int64 (B, k), one column per component."""
    return np.stack([np.asarray(v, dtype=np.int64) for v in parts], axis=-1)


# --- exact tails ------------------------------------------------------------------------------------
def log2_binom_tail(n: int, p: float, t: int) -> float:
    """log2 P(Bin(n, p) >= t)."""
    if t <= 0:
        return 0.0
    if t > n:
        return float("-inf")
    terms = [math.lgamma(n + 1) - math.lgamma(k + 1) - math.lgamma(n - k + 1)
             + k * math.log(p) + ((n - k) * math.log1p(-p) if p < 1 else 0.0) for k in range(t, n + 1)]
    m = max(terms)
    return (m + math.log(sum(math.exp(x - m) for x in terms))) / math.log(2)


def dist_conv(cells: list[dict[int, float]]) -> tuple[int, np.ndarray]:
    """Distribution of a sum of independent integer variables, each given as {value: prob}.
    Returns (offset, probs) with probs[i] = P(sum = offset + i)."""
    off, pr = 0, np.ones(1)
    for d in cells:
        lo, hi = min(d), max(d)
        a = np.zeros(hi - lo + 1)
        for v, p in d.items():
            a[v - lo] += p
        pr = np.convolve(pr, a)
        off += lo
    return off, pr


def log2_dist_tail(off: int, pr: np.ndarray, t: int) -> float:
    i = t - off
    if i <= 0:
        return 0.0
    if i >= len(pr):
        return float("-inf")
    s = float(pr[i:].sum())
    return math.log2(s) if s > 0 else float("-inf")


# --- grid construction --------------------------------------------------------------------------
def grid(sym, col) -> Grid:
    return Grid(np.asarray(sym, dtype=np.uint8), np.asarray(col, dtype=np.uint8))


def best_of(fam_ordinal, cands: list[Grid], params, gtype) -> Grid:
    return max(cands, key=lambda g: fam_ordinal(g, params, gtype))


def sym_for_value(gtype: GridType, v: int, suit: int = 0) -> int:
    """A symbol index with value v (cards: in the given suit)."""
    if gtype.symbols == "cards":
        return suit * 13 + (v - 1)
    return v


__all__ += ["sym_for_value"]


def scalar_lines(N: int, d: tuple[int, int]) -> list[list[tuple[int, int]]]:
    """All maximal straight lines in direction d ∈ {(0,1), (1,0), (1,1), (1,-1)}, as coordinate lists."""
    dr, dc = d
    starts = []
    for r in range(N):
        for c in range(N):
            pr, pc = r - dr, c - dc
            if not (0 <= pr < N and 0 <= pc < N):
                starts.append((r, c))
    out = []
    for r, c in starts:
        ln = []
        while 0 <= r < N and 0 <= c < N:
            ln.append((r, c))
            r, c = r + dr, c + dc
        out.append(ln)
    return out


def runs(seq) -> list[tuple[int, int]]:
    """Maximal runs of equal truthy predicate: list of (start, length) where seq[i] is truthy."""
    out, i, n = [], 0, len(seq)
    while i < n:
        if seq[i]:
            j = i
            while j < n and seq[j]:
                j += 1
            out.append((i, j - i))
            i = j
        else:
            i += 1
    return out


__all__ += ["scalar_lines", "runs"]


def unorient(a: np.ndarray, d: str) -> np.ndarray:
    """Inverse of `orient`: the grid whose lines read in direction d are the rows of a."""
    if d == "→":
        return a
    if d == "←":
        return a[..., :, ::-1]
    if d == "↓":
        return np.swapaxes(a, -1, -2)
    return np.swapaxes(a[..., :, ::-1], -1, -2)


def rim_mask(N: int) -> np.ndarray:
    r, c = np.indices((N, N))
    return (r == 0) | (c == 0) | (r == N - 1) | (c == N - 1)


__all__ += ["unorient", "rim_mask"]


def _ords(batch, S, C, params, gtype) -> list:
    """Batch ordinals as Python values (ints or tuples) so plain `max` / `>` compare them correctly."""
    v = np.asarray(batch(S, C, params, gtype)).tolist()
    return [tuple(x) if isinstance(x, list) else x for x in v]


def _argmax(v: list) -> int:
    return max(range(len(v)), key=v.__getitem__)  # first maximum, like np.argmax


def hill_climb(batch, start: Grid, params, gtype, layers=("colour",), max_steps: int = 200,
               sym_choices=None) -> Grid:
    """Deterministic steepest-ascent search over single-cell edits, scored with the family's `batch`.
    Used for exemplars of rules whose optimum has no simple closed form ("best found")."""
    N = gtype.N
    sym, col = start.sym.astype(np.uint8).copy(), start.col.astype(np.uint8).copy()
    cur = _ords(batch, sym[None], col[None], params, gtype)[0]
    schoices = list(range(gtype.S)) if sym_choices is None else list(sym_choices)
    for _ in range(max_steps):
        cs, cc = [], []
        for r in range(N):
            for c in range(N):
                if "colour" in layers:
                    for k in range(gtype.C):
                        if k != col[r, c]:
                            x = col.copy(); x[r, c] = k
                            cs.append(sym); cc.append(x)
                if "symbol" in layers:
                    for k in schoices:
                        if k != sym[r, c]:
                            x = sym.copy(); x[r, c] = k
                            cs.append(x); cc.append(col)
        S_, C_ = np.stack(cs), np.stack(cc)
        sc = _ords(batch, S_, C_, params, gtype)
        i = _argmax(sc)
        if sc[i] <= cur:
            break
        cur, sym, col = sc[i], S_[i].copy(), C_[i].copy()
    return Grid(sym, col)


def multi_climb(batch, starts: list[Grid], params, gtype, layers=("colour",), restarts: int = 6,
                sym_choices=None, seed: int = 0) -> Grid:
    """hill_climb from each start plus `restarts` seeded random grids; return the best result."""
    from ..core import spawn
    rng = np.random.default_rng(seed)
    starts = list(starts) + [spawn(gtype, rng) for _ in range(restarts)]
    best, bv = None, None
    for g in starts:
        h = hill_climb(batch, g, params, gtype, layers, sym_choices=sym_choices)
        v = _ords(batch, h.sym[None], h.col[None], params, gtype)[0]
        if bv is None or v > bv:
            best, bv = h, v
    return best


__all__ += ["hill_climb", "multi_climb"]


def plateau_search(batch, start: Grid, params, gtype, layers=("colour",), iters: int = 150, k: int = 128,
                   sym_choices=None, seed: int = 0) -> Grid:
    """Seeded random local search: each iteration proposes k random single-cell edits and moves to the best
    one if it is at least as good (so it can drift across plateaus). Deterministic for a given seed."""
    rng = np.random.default_rng(seed)
    N = gtype.N
    sym, col = start.sym.astype(np.uint8).copy(), start.col.astype(np.uint8).copy()
    cur = _ords(batch, sym[None], col[None], params, gtype)[0]
    best = (cur, sym.copy(), col.copy())
    sc_ = np.array(list(range(gtype.S)) if sym_choices is None else list(sym_choices), dtype=np.uint8)
    for _ in range(iters):
        S_ = np.repeat(sym[None], k, 0)
        C_ = np.repeat(col[None], k, 0)
        rr, cc = rng.integers(0, N, k), rng.integers(0, N, k)
        which = rng.integers(0, len(layers), k)
        for i in range(k):
            if layers[which[i]] == "symbol":
                S_[i, rr[i], cc[i]] = sc_[rng.integers(len(sc_))]
            else:
                C_[i, rr[i], cc[i]] = rng.integers(gtype.C)
        v = _ords(batch, S_, C_, params, gtype)
        i = _argmax(v)
        if v[i] >= cur:
            cur, sym, col = v[i], S_[i].copy(), C_[i].copy()
            if cur > best[0]:
                best = (cur, sym.copy(), col.copy())
    return Grid(best[1], best[2])


__all__ += ["plateau_search"]
