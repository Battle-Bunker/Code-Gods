"""The three seed rules (BRIEF.md) in ordinal form."""
from __future__ import annotations

from ._util import *  # noqa: F401,F403
from ._util import scalar_lines, runs

DIRS = {False: [(0, 1), (1, 0)], True: [(0, 1), (1, 0), (1, 1), (1, -1)]}


# --- Seed 1: Line Painter ---------------------------------------------------------------------
def s1_sample(rng, gtype):
    return {"colour": colour(rng, gtype), "diag": bool(rng.random() < 0.25)}


def s1_ord(g, p, gtype):
    N, X = gtype.N, p["colour"]
    col, v = g.col.tolist(), gtype.value[g.sym].tolist()
    tot = 0
    for d in DIRS[p["diag"]]:
        for ln in scalar_lines(N, d):
            for i, L in runs([col[r][c] == X for r, c in ln]):
                if L >= 2:
                    tot += sum(v[r][c] for r, c in ln[i:i + L])
    return tot


def s1_batch(sym, col, p, gtype):
    X = col == p["colour"]
    v = vals(sym, gtype)
    tot = np.zeros(len(sym), np.int64)
    for dr, dc in DIRS[p["diag"]]:
        inrun = X & (shift(X, dr, dc, False) | shift(X, -dr, -dc, False))
        tot += (v * inrun).sum((1, 2))
    return tot


def s1_exemplar(p, gtype):
    N = gtype.N
    return grid(np.full((N, N), sym_for_value(gtype, vmax(gtype))), np.full((N, N), p["colour"]))


SEED1 = mk(
    id="seed1_line_painter", name="Line Painter", theme="Straight lines of one colour",
    requires=req("Valued"), layers={"colour", "symbol", "position"}, camp="clumper",
    sample=s1_sample,
    summary=lambda p, gt: (f"Every straight line of 2 or more {cname(gt, p['colour'])} cells touching in a row "
                           f"(across or down{', or diagonally' if p['diag'] else ''}) scores the sum of its numbers."),
    ordinal=s1_ord, batch=s1_batch,
    canonical=lambda p, gt: recolour(p, ["colour"]), exemplar=s1_exemplar,
    source="seed rule 1 / catalog#13 (D7: colour=mine, runs>=2, diag option)", tags={"seed", "shortlist"})


# --- Seed 2: Patchwork --------------------------------------------------------------------------
def s2_ord(g, p, gtype):
    key = rank_key(g.sym, gtype).tolist()
    col, v = g.col.tolist(), gtype.value[g.sym].tolist()
    N = gtype.N
    allm = [[True] * N for _ in range(N)]
    tot = 0
    for comp in comps2d(key, allm):
        if len(comp) < 2:
            continue
        cs = set(comp)
        ok = all(not ((x, y) in cs and col[x][y] == col[r][c]) for r, c in comp for x, y in nbrs4(N, r, c))
        if ok:
            r, c = comp[0]
            tot += len(comp) * v[r][c]
    return tot


def s2_batch(sym, col, p, gtype):
    key = rank_key(sym, gtype)
    allm = np.ones(key.shape, bool)
    lab = label_batch(key, allm)
    size = comp_sum(lab, np.ones_like(key), allm)
    bad_h = (key[:, :, 1:] == key[:, :, :-1]) & (col[:, :, 1:] == col[:, :, :-1])
    bad_v = (key[:, 1:, :] == key[:, :-1, :]) & (col[:, 1:, :] == col[:, :-1, :])
    badc = np.zeros(key.shape, bool)
    badc[:, :, 1:] |= bad_h
    badc[:, :, :-1] |= bad_h
    badc[:, 1:, :] |= bad_v
    badc[:, :-1, :] |= bad_v
    bad = comp_sum(lab, badc.astype(np.int64), allm) > 0
    ok = (size >= 2) & ~bad
    return (vals(sym, gtype) * ok).sum((1, 2))


def s2_exemplar(p, gtype):
    N = gtype.N
    r, c = np.indices((N, N))
    return grid(np.full((N, N), sym_for_value(gtype, vmax(gtype))), (r + c) % 2)


SEED2 = mk(
    id="seed2_patchwork", name="Patchwork", theme="Same-symbol patches with no two touching colours alike",
    requires=req("Valued"), layers={"colour", "symbol", "position"}, camp="alternator",
    sample=lambda rng, gt: {},
    summary=lambda p, gt: ("Find groups of 2 or more touching cells with the same symbol where no two touching cells "
                           "share a colour. Each group scores its size times its number."),
    ordinal=s2_ord, batch=s2_batch, exemplar=s2_exemplar,
    source="seed rule 2 / catalog#12 (min region size 2; cards compare rank)", tags={"seed", "shortlist"})


# --- Seed 3: Green Ones (and the generic token count it shares code with) ------------------------
def _token_counts(match_s, match_c):
    tok = match_s & match_c
    half = match_s ^ match_c
    return tok, half


def tok_tail_factory(ps_fn):
    """Exact tail for lex((tokens, n+1), (half-tokens, n+1)) with iid cells."""
    def tail(t, p, gtype):
        n = gtype.N ** 2
        ps, pc = ps_fn(p, gtype), 1.0 / gtype.C
        p1, p2 = ps * pc, ps * (1 - pc) + (1 - ps) * pc
        p3 = 1 - p1 - p2
        a, b = divmod(int(t), n + 1)
        if t <= 0:
            return 0.0
        if a > n:
            return float("-inf")
        lg = math.lgamma
        terms = []
        for k in range(a, n + 1):
            for h in range(0, n - k + 1):
                if k == a and h < b:
                    continue
                terms.append(lg(n + 1) - lg(k + 1) - lg(h + 1) - lg(n - k - h + 1)
                             + k * math.log(p1) + (h * math.log(p2) if h else 0.0)
                             + ((n - k - h) * math.log(p3) if n - k - h else 0.0))
        if not terms:
            return float("-inf")
        m = max(terms)
        return (m + math.log(sum(math.exp(x - m) for x in terms))) / math.log(2)
    return tail


def s3_sample(rng, gtype):
    c = gtype.colour("green")
    vs = set(int(x) for x in gtype.value)
    return {"colour": c if c is not None else colour(rng, gtype),
            "value": 1 if 1 in vs else int(rng.choice(sorted(vs)))}


def s3_ord(g, p, gtype):
    n = gtype.N ** 2
    v, col = gtype.value[g.sym].ravel().tolist(), g.col.ravel().tolist()
    tok = sum(1 for a, b in zip(v, col) if a == p["value"] and b == p["colour"])
    half = sum(1 for a, b in zip(v, col) if (a == p["value"]) != (b == p["colour"]))
    return lex((tok, n + 1), (half, n + 1))


def s3_batch(sym, col, p, gtype):
    n = gtype.N ** 2
    tok, half = _token_counts(vals(sym, gtype) == p["value"], col == p["colour"])
    return lexb((tok.sum((1, 2)), n + 1), (half.sum((1, 2)), n + 1))


def s3_ps(p, gtype):
    return float(np.mean(gtype.value == p["value"]))


SEED3 = mk(
    id="seed3_green_ones", name="Green Ones", theme="Lucky green ones",
    requires=req(), layers={"colour", "symbol"}, camp="clumper",
    sample=s3_sample,
    summary=lambda p, gt: (f"Count the {cname(gt, p['colour'])} "
                           f"{'aces' if gt.symbols == 'cards' and p['value'] == 1 else str(p['value']) + 's'}. "
                           "More is better; a cell with only the right colour or only the right number is a small step."),
    ordinal=s3_ord, batch=s3_batch,
    canonical=lambda p, gt: {"colour": 0, "value": vmin(gt)},
    exact_log2_tail=tok_tail_factory(s3_ps),
    exemplar=lambda p, gt: grid(np.full((gt.N, gt.N), sym_for_value(gt, p["value"])), np.full((gt.N, gt.N), p["colour"])),
    source="seed rule 3 / catalog#14 (D8); tie-breaker = half-tokens", tags={"seed", "shortlist"})

FAMILIES = [SEED1, SEED2, SEED3]
