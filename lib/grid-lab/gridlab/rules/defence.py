"""Defence goals (docs/defence-goals.md): penalty families, defence variants of existing rules, and
protector families whose main stake is a defence goal.

A *penalty family* is an ordinary Family whose ordinal measures **badness** (higher = worse). It is never
dealt on its own; it sits in another family's `penalty` field and reads params["defence"]. Its exemplar is
the *worst* grid. Its `theme` is the comparative the kid sees on a grid ("redder than 90% of grids"), and
`comparative(pdraw, gtype)` fills in sampled names.

`DEFENCE_FAMILIES` is opt-in (`gridlab.run --defence`): the default 88-family pool is unchanged.
"""
from __future__ import annotations

from collections import Counter
from functools import lru_cache

from ._util import *  # noqa: F401,F403
from ._util import sym_for_value, plateau_search
from ..family import with_defence
from . import seeds, strategy, arithmetic, colour as colour_lens

COMPARATIVE_COLOUR = {"red": "redder", "green": "greener", "blue": "bluer", "yellow": "yellower",
                      "orange": "more orange", "violet": "more violet"}


def _corners(a):
    return np.stack([a[..., 0, 0], a[..., 0, -1], a[..., -1, 0], a[..., -1, -1]], axis=-1)


def _value_name(gt, v):
    if gt.symbols == "cards":
        return {1: "ace", 11: "jack", 12: "queen", 13: "king"}.get(v, str(v))
    return str(v)


# ================================================================================================
# Penalty families (badness ordinals)
# ================================================================================================
# --- Hated colour: count of colour Y ------------------------------------------------------------
HATE_COLOUR = mk(
    id="hate_colour", name="Hated colour", theme="worse",
    requires=req(), layers={"colour"}, camp="neutral",
    sample=lambda rng, gt: {"colour": colour(rng, gt)},
    summary=lambda p, gt: f"−1 for each {cname(gt, p['colour'])} cell",
    ordinal=lambda g, p, gt: sum(1 for x in g.col.ravel().tolist() if x == p["colour"]),
    batch=lambda s, c, p, gt: (c == p["colour"]).sum((1, 2)),
    canonical=lambda p, gt: {"colour": 0},
    exact_log2_tail=lambda t, p, gt: log2_binom_tail(gt.N ** 2, 1.0 / gt.C, int(t)),
    exemplar=lambda p, gt: grid(np.zeros((gt.N, gt.N)), np.full((gt.N, gt.N), p["colour"])),
    source="defence goal: the user's 'penalised for the presence of red cells'", tags={"penalty"})


# --- Hated number: count of value v ---------------------------------------------------------------
def _hv_p(p, gt):
    return float(np.mean(gt.value == p["value"]))


HATE_VALUE = mk(
    id="hate_value", name="Hated number", theme="worse",
    requires=req(), layers={"symbol"}, camp="neutral",
    sample=lambda rng, gt: {"value": int(rng.choice(sorted(set(gt.value.tolist()))))},
    summary=lambda p, gt: f"−1 for each {_value_name(gt, p['value'])}",
    ordinal=lambda g, p, gt: sum(1 for x in gt.value[g.sym].ravel().tolist() if x == p["value"]),
    batch=lambda s, c, p, gt: (vals(s, gt) == p["value"]).sum((1, 2)),
    # every value has the same share of the symbol set (digits 1/S, cards 4/52), so all values are one orbit
    canonical=lambda p, gt: {"value": vmin(gt)},
    exact_log2_tail=lambda t, p, gt: log2_binom_tail(gt.N ** 2, _hv_p(p, gt), int(t)),
    exemplar=lambda p, gt: grid(np.full((gt.N, gt.N), sym_for_value(gt, p["value"])), np.zeros((gt.N, gt.N))),
    source="defence goal: a number you want kept off the board", tags={"penalty"})


# --- Hated blob: largest 4-connected patch of colour Y (Kingdom as a penalty) -------------------------
HATE_BLOB = mk(
    id="hate_blob", name="Hated patch", theme="worse",
    requires=req(), layers={"colour", "position"}, camp="neutral",
    sample=lambda rng, gt: {"C": colour(rng, gt)},
    summary=lambda p, gt: f"−1 for each cell in the biggest joined-up {cname(gt, p['C'])} patch",
    ordinal=colour_lens.kg_ord, batch=colour_lens.kg_batch, canonical=lambda p, gt: {"C": 0},
    exemplar=lambda p, gt: grid(np.zeros((gt.N, gt.N)), np.full((gt.N, gt.N), p["C"])),
    source="defence goal: Kingdom's ordinal, hated", tags={"penalty"})


# --- Takeover: count of the commonest colour ------------------------------------------------------
def to_ord(g, p, gt):
    return max(Counter(g.col.ravel().tolist()).values())


def to_batch(s, c, p, gt):
    return np.stack([(c == k).sum((1, 2)) for k in range(gt.C)]).max(0)


HATE_TAKEOVER = mk(
    id="hate_takeover", name="Takeover", theme="more taken over by one colour",
    requires=req(), layers={"colour"}, camp="neutral",
    sample=lambda rng, gt: {},
    summary=lambda p, gt: "−1 for each cell of whichever colour is commonest",
    ordinal=to_ord, batch=to_batch,
    exemplar=lambda p, gt: grid(np.zeros((gt.N, gt.N)), np.zeros((gt.N, gt.N))),
    source="defence goal: 'no colour may take over'", tags={"penalty"})


# --- Big blobs: largest one-colour 4-component of any colour -----------------------------------------
def bb_ord(g, p, gt):
    col = g.col.tolist()
    N = gt.N
    return max(len(c) for c in comps2d(col, [[True] * N for _ in range(N)]))


def bb_batch(s, c, p, gt):
    key = c.astype(np.int64)
    m = np.ones(key.shape, bool)
    lab = label_batch(key, m)
    return comp_sum(lab, np.ones_like(key), m).reshape(len(c), -1).max(1)


HATE_BIG_BLOB = mk(
    id="hate_big_blob", name="Big blobs", theme="blobbier",
    requires=req(), layers={"colour", "position"}, camp="neutral",
    sample=lambda rng, gt: {},
    summary=lambda p, gt: "−1 for each cell in the biggest joined-up patch of one colour (any colour)",
    ordinal=bb_ord, batch=bb_batch,
    exemplar=lambda p, gt: grid(np.zeros((gt.N, gt.N)), np.zeros((gt.N, gt.N))),
    source="defence goal: the clumpers' spoiler", tags={"penalty"})


# --- Matching corners: most corners sharing a colour, then a rank ---------------------------------------
def mc_ord(g, p, gt):
    N = gt.N
    cs = [(0, 0), (0, N - 1), (N - 1, 0), (N - 1, N - 1)]
    col = [int(g.col[r, c]) for r, c in cs]
    rk = [int(gt.rank[g.sym[r, c]]) for r, c in cs]
    return tup(max(Counter(col).values()), max(Counter(rk).values()))


def mc_batch(s, c, p, gt):
    cc, rr = _corners(c.astype(np.int64)), _corners(rank_key(s, gt))
    cm = (cc[..., :, None] == cc[..., None, :]).sum(-1).max(-1)
    rm = (rr[..., :, None] == rr[..., None, :]).sum(-1).max(-1)
    return tupb(cm, rm)


HATE_SAME_CORNERS = mk(
    id="hate_same_corners", name="Matching corners", theme="more alike in the corners",
    requires=req(), layers={"colour", "symbol", "position"}, camp="neutral",
    sample=lambda rng, gt: {},
    summary=lambda p, gt: "−1 for each corner that shares the commonest corner colour (then the commonest number)",
    ordinal=mc_ord, batch=mc_batch,
    exemplar=lambda p, gt: grid(np.zeros((gt.N, gt.N)), np.zeros((gt.N, gt.N))),
    source="defence goal: 'keep the corners varied'", tags={"penalty"})


# --- Repeats in a row: missing colours, then side-by-side repeats, in row R -------------------------------
def rr_ord(g, p, gt):
    row = g.col[p["row"]].tolist()
    N = gt.N
    return tup(N - len(set(row)), sum(a == b for a, b in zip(row, row[1:])))


def rr_batch(s, c, p, gt):
    row = c[:, p["row"], :]
    N = gt.N
    distinct = np.stack([(row == k).any(1) for k in range(gt.C)]).sum(0)
    adj = (row[:, 1:] == row[:, :-1]).sum(1)
    return tupb(N - distinct, adj)


HATE_REPEAT_ROW = mk(
    id="hate_repeat_row", name="Repeats in the row", theme="more repetitive in that row",
    requires=req(), layers={"colour", "position"}, camp="neutral",
    sample=lambda rng, gt: {"row": int(rng.integers(gt.N))},
    summary=lambda p, gt: (f"−1 for each repeated colour in row {p['row'] + 1} "
                           "(then for each pair of side-by-side cells there with the same colour)"),
    ordinal=rr_ord, batch=rr_batch,
    canonical=lambda p, gt: {"row": 0},  # permuting rows preserves the prior; the rule reads one row
    exemplar=lambda p, gt: grid(np.zeros((gt.N, gt.N)), np.zeros((gt.N, gt.N))),
    source="defence goal: 'protect the rainbow row'", tags={"penalty"})


# --- Number crowd: count of the commonest rank ----------------------------------------------------------
def sc_ord(g, p, gt):
    return max(Counter(gt.rank[g.sym].ravel().tolist()).values())


def sc_batch(s, c, p, gt):
    rk = rank_key(s, gt)
    return np.stack([(rk == r).sum((1, 2)) for r in range(gt.ranks)]).max(0)


HATE_SYMBOL_TAKEOVER = mk(
    id="hate_symbol_takeover", name="Number crowd", theme="more crowded with one number",
    requires=req(), layers={"symbol"}, camp="neutral",
    sample=lambda rng, gt: {},
    summary=lambda p, gt: "−1 for each copy of whichever number is commonest",
    ordinal=sc_ord, batch=sc_batch,
    exemplar=lambda p, gt: grid(np.zeros((gt.N, gt.N)), np.zeros((gt.N, gt.N))),
    source="defence goal: 'no number may take over'", tags={"penalty"})


PENALTIES = [HATE_COLOUR, HATE_VALUE, HATE_BLOB, HATE_TAKEOVER, HATE_BIG_BLOB, HATE_SAME_CORNERS,
             HATE_REPEAT_ROW, HATE_SYMBOL_TAKEOVER]


def comparative(pdraw, gtype) -> str:
    """The word before 'than 90% of grids' on the ⚠️ line."""
    f, p = pdraw.family, pdraw.params
    if f.id == "hate_colour":
        n = cname(gtype, p["colour"])
        return COMPARATIVE_COLOUR.get(n, f"more {n}")
    if f.id == "hate_value":
        return f"fuller of {_value_name(gtype, p['value'])}s"
    if f.id == "hate_blob":
        return f"with a bigger {cname(gtype, p['C'])} patch"
    return f.theme


# ================================================================================================
# Reward channels of the protector families (never dealt alone)
# ================================================================================================
def _fair_line(cnt, gt):
    """A line is fair when no colour fills more than its share ⌈N/C⌉ of it."""
    return max(cnt) <= -(-gt.N // gt.C)


def rc_ord(g, p, gt):
    cnt = Counter(g.col.ravel().tolist())
    col = g.col.tolist()
    lines = col + [list(x) for x in zip(*col)]
    fair = sum(_fair_line([ln.count(k) for k in range(gt.C)], gt) for ln in lines)
    return tup(min(cnt.get(k, 0) for k in range(gt.C)), fair)


def rc_batch(s, c, p, gt):
    mn = np.stack([(c == k).sum((1, 2)) for k in range(gt.C)]).min(0)
    share = -(-gt.N // gt.C)
    rows = np.stack([(c == k).sum(2) for k in range(gt.C)]).max(0) <= share
    cols = np.stack([(c == k).sum(1) for k in range(gt.C)]).max(0) <= share
    return tupb(mn, rows.sum(1) + cols.sum(1))


@lru_cache(maxsize=None)
def rc_exemplar(gt, iters: int = 300, k: int = 128):
    """Balanced colour totals by construction, then a seeded search over cell swaps (which keep the totals)
    for fair lines; the construction alone is unfair in columns when gcd(N, C) > 1."""
    rng = np.random.default_rng(0)
    N = gt.N
    col = (np.arange(N * N) % gt.C).reshape(N, N).astype(np.uint8)
    sym = np.zeros((N, N), np.uint8)
    cur = tuple(rc_batch(sym[None], col[None], {}, gt)[0].tolist())
    for _ in range(iters):
        C_ = np.repeat(col.reshape(1, -1), k, 0)
        a, b = rng.integers(0, N * N, k), rng.integers(0, N * N, k)
        ar = np.arange(k)
        C_[ar, a], C_[ar, b] = C_[ar, b], C_[ar, a]
        C_ = C_.reshape(k, N, N)
        v = [tuple(r) for r in rc_batch(np.zeros_like(C_), C_, {}, gt).tolist()]
        i = max(range(k), key=v.__getitem__)
        if v[i] >= cur:
            cur, col = v[i], C_[i].copy()
    return grid(sym, col)


RAREST_COLOUR = mk(
    id="rarest_colour", name="No Takeover", theme="Every colour gets a fair share",
    requires=req(), layers={"colour"}, camp="neutral", sample=lambda rng, gt: {},
    summary=lambda p, gt: ("+1 for each cell of whichever colour is rarest (so every colour needs its share), "
                           "then +1 for each row or column where no colour has more than its share"),
    ordinal=rc_ord, batch=rc_batch,
    exemplar=lambda p, gt: rc_exemplar(gt),
    source="protector reward: balanced colours (tie-breaker: fair lines)", tags={"reward"})


def cv_ord(g, p, gt):
    N = gt.N
    cs = [(0, 0), (0, N - 1), (N - 1, 0), (N - 1, N - 1)]
    blocks = sum(len({int(g.col[r + a, c + b]) for a in (0, 1) for b in (0, 1)})
                 for r, c in [(0, 0), (0, N - 2), (N - 2, 0), (N - 2, N - 2)])
    return tup(len({int(g.col[r, c]) for r, c in cs}), blocks, len({int(gt.rank[g.sym[r, c]]) for r, c in cs}))


def _distinct4(a):
    """Number of distinct values along the last axis (length 4)."""
    return (~np.triu(a[..., :, None] == a[..., None, :], 1).any(-2)).sum(-1)


def cv_batch(s, c, p, gt):
    N = gt.N
    c = c.astype(np.int64)
    blocks = sum(_distinct4(np.stack([c[:, r, q], c[:, r, q + 1], c[:, r + 1, q], c[:, r + 1, q + 1]], -1))
                 for r, q in [(0, 0), (0, N - 2), (N - 2, 0), (N - 2, N - 2)])
    return tupb(_distinct4(_corners(c)), blocks, _distinct4(_corners(rank_key(s, gt))))


def cv_exemplar(p, gt):
    N, C = gt.N, gt.C
    s, c = np.zeros((N, N), np.int64), np.zeros((N, N), np.int64)
    base = np.array([[0, 1], [2, 3]]) % C if C >= 4 else np.array([[0, 1], [2, 0]])
    for k, (r, q) in enumerate([(0, 0), (0, N - 2), (N - 2, 0), (N - 2, N - 2)]):
        blk = (base + k) % C
        if r:   # the corner cell is the outer cell of each block: put colour k there
            blk = blk[::-1]
        if q:
            blk = blk[:, ::-1]
        c[r:r + 2, q:q + 2] = blk
    for k, (r, q) in enumerate([(0, 0), (0, N - 1), (N - 1, 0), (N - 1, N - 1)]):
        s[r, q] = k % gt.ranks
    # the construction is optimal for N >= 4; the search repairs N = 3, where the blocks share the centre
    return plateau_search(cv_batch, grid(s, c), p, gt, layers=("colour", "symbol"), iters=60, k=64)


CORNER_VARIETY = mk(
    id="corner_variety", name="Four Corners", theme="Four different corners",
    requires=req(), layers={"colour", "symbol", "position"}, camp="alternator", sample=lambda rng, gt: {},
    summary=lambda p, gt: ("+1 for each different colour among the four corners, then for each different colour "
                           "inside each corner's 2×2 square, then each different number in the corners"),
    ordinal=cv_ord, batch=cv_batch, exemplar=cv_exemplar,
    source="protector reward: varied corners", tags={"reward"})


def rw_ord(g, p, gt):
    steps = [sum((b - a) % gt.C == 1 for a, b in zip(row, row[1:])) for row in g.col.tolist()]
    N = gt.N
    return tup(steps[p["row"]], sum(steps) - steps[p["row"]])


def rw_batch(s, c, p, gt):
    c = c.astype(np.int64)
    steps = ((c[:, :, 1:] - c[:, :, :-1]) % gt.C == 1).sum(2)
    N, mine = gt.N, steps[:, p["row"]]
    return tupb(mine, steps.sum(1) - mine)


RAINBOW_ROW = mk(
    id="rainbow_row", name="Rainbow Guardian", theme="Guard the rainbow row",
    requires=req("Spectral"), layers={"colour", "position"}, camp="alternator",
    sample=lambda rng, gt: {"row": int(rng.integers(gt.N))},
    summary=lambda p, gt: (f"+1 for each step along row {p['row'] + 1} that moves on one colour of the rainbow "
                           f"({' → '.join(gt.colour_names)} → {gt.colour_names[0]}), then for each such step "
                           "in the other rows"),
    ordinal=rw_ord, batch=rw_batch, canonical=lambda p, gt: {"row": 0},
    exemplar=lambda p, gt: grid(np.zeros((gt.N, gt.N)), np.tile(np.arange(gt.N) % gt.C, (gt.N, 1))),
    source="protector reward: rainbow steps in one row (tie-breaker: the other rows)", tags={"reward"})


def is_ord(g, p, gt):
    N = gt.N
    return len(comps2d(g.col.tolist(), [[True] * N for _ in range(N)]))


def is_batch(s, c, p, gt):
    lab = label_batch(c.astype(np.int64), np.ones(c.shape, bool))
    B, N = len(c), gt.N
    return (lab.reshape(B, -1) == np.arange(N * N)[None, :]).sum(1)


ISLANDS = mk(
    id="islands", name="Blob Warden", theme="Many small patches",
    requires=req(), layers={"colour", "position"}, camp="alternator", sample=lambda rng, gt: {},
    summary=lambda p, gt: "+1 for each separate one-colour patch (more, smaller patches are better)",
    ordinal=is_ord, batch=is_batch,
    exemplar=lambda p, gt: grid(np.zeros((gt.N, gt.N)), np.indices((gt.N, gt.N)).sum(0) % 2),
    source="protector reward: fragmented colours", tags={"reward"})


def sv_ord(g, p, gt):
    rk = gt.rank[g.sym].ravel().tolist()
    pairs = set(zip(rk, g.col.ravel().tolist()))
    return tup(len(set(rk)), len(pairs))


def sv_batch(s, c, p, gt):
    rk = rank_key(s, gt).reshape(len(s), -1)
    code = rk * gt.C + c.reshape(len(c), -1).astype(np.int64)
    d1 = np.stack([(rk == r).any(1) for r in range(gt.ranks)]).sum(0)
    d2 = np.stack([(code == k).any(1) for k in range(gt.ranks * gt.C)]).sum(0)
    return tupb(d1, d2)


def sv_exemplar(p, gt):
    i = np.arange(gt.N ** 2)
    return grid((i % gt.ranks).reshape(gt.N, gt.N), ((i // gt.ranks) % gt.C).reshape(gt.N, gt.N))


SYMBOL_VARIETY = mk(
    id="symbol_variety", name="Mixed Bag", theme="Every number on show",
    requires=req(), layers={"colour", "symbol"}, camp="neutral", sample=lambda rng, gt: {},
    summary=lambda p, gt: "+1 for each different number on the grid (then each different number-and-colour pair)",
    ordinal=sv_ord, batch=sv_batch, exemplar=sv_exemplar,
    source="protector reward: symbol variety", tags={"reward"})

REWARDS = [RAREST_COLOUR, CORNER_VARIETY, RAINBOW_ROW, ISLANDS, SYMBOL_VARIETY]


# ================================================================================================
# Dealt families
# ================================================================================================
def _other_colour(key):
    """sample_penalty: hate a colour other than the base's `key` colour."""
    def sp(rng, gt, p):
        opts = [k for k in range(gt.C) if k != p[key]]
        return {"colour": int(rng.choice(opts))}
    return sp


def _other_blob(key):
    def sp(rng, gt, p):
        opts = [k for k in range(gt.C) if k != p[key]]
        return {"C": int(rng.choice(opts))}
    return sp


V = dict(tags={"variant"})
VARIANTS = [
    with_defence(seeds.SEED3, HATE_COLOUR, sample_penalty=_other_colour("colour"),
                 name="Green Ones, hates a colour", **V),
    with_defence(seeds.SEED1, HATE_BLOB, sample_penalty=_other_blob("colour"),
                 name="Line Painter, hates a patch", **V),
    with_defence(seeds.SEED2, HATE_TAKEOVER, name="Patchwork, hates takeovers", **V),
    with_defence(strategy.LUCKY_TOKEN, HATE_COLOUR, sample_penalty=_other_colour("X"),
                 name="Lucky Token, hates a colour", **V),
    with_defence(colour_lens.KINGDOM, HATE_VALUE, name="Kingdom, hates a number", **V),
    with_defence(strategy.RAINBOW_ROAD, HATE_BIG_BLOB, name="Rainbow Road, hates blobs", **V),
    with_defence(arithmetic.NUMBER_BONDS, HATE_COLOUR, name="Number Bonds, hates a colour", **V),
    with_defence(arithmetic.MAGIC_ACCOUNTANT, HATE_VALUE, name="Magic Accountant, hates a number", **V),
]

P = dict(tags={"protector"})
PROTECTORS = [
    with_defence(RAREST_COLOUR, HATE_TAKEOVER, id="no_takeover", name="No Takeover",
                 theme="No colour may take over", source="defence-goals.md protector: 'no colour may take over'", **P),
    with_defence(CORNER_VARIETY, HATE_SAME_CORNERS, id="four_corners", name="Four Corners",
                 theme="Keep the corners varied", source="defence-goals.md protector: 'keep the corners varied'", **P),
    with_defence(RAINBOW_ROW, HATE_REPEAT_ROW, id="rainbow_guardian", name="Rainbow Guardian",
                 theme="Protect the rainbow row", sample_penalty=lambda rng, gt, p: {"row": p["row"]},
                 source="defence-goals.md protector: 'protect the rainbow row'", **P),
    with_defence(ISLANDS, HATE_BIG_BLOB, id="blob_warden", name="Blob Warden",
                 theme="No big blobs", source="defence-goals.md protector: spoiler of the clumpers", **P),
    with_defence(SYMBOL_VARIETY, HATE_SYMBOL_TAKEOVER, id="mixed_bag", name="Mixed Bag",
                 theme="No number may take over", source="defence-goals.md protector: 'no number may take over'", **P),
]

FAMILIES = [*VARIANTS, *PROTECTORS]   # dealt; opt-in pool extension
