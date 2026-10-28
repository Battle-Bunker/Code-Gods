"""Hand-made grid features for learning players.

`grid_features(sym, col, gtype)` maps a batch (B, N, N) to a float matrix (B, F). The features are
generic statistics a human might notice when looking at a grid, chosen to correlate with the kinds of
structure the 88 rule families reward (counts, clumping, alternation, lines, symmetry, ordering,
symbol sums), without reference to any particular family. Every feature is scaled to roughly [0, 1].

`diff_signature(x, y, gtype)` summarises one observed transformation x -> y as a small hashable tuple
(which layers changed, whether multisets were preserved, the spatial scope), so that an observer can
infer which mutator types other gods are using from public object changes alone.
"""
from __future__ import annotations

import numpy as np

from ...core import GridType


def _sorted_counts(a: np.ndarray, K: int) -> np.ndarray:
    """(B, K) per-value counts, each row sorted descending."""
    B = a.shape[0]
    flat = a.reshape(B, -1).astype(np.int64)
    cnt = np.zeros((B, K))
    np.add.at(cnt, (np.repeat(np.arange(B), flat.shape[1]), flat.ravel()), 1)
    return cnt, -np.sort(-cnt, axis=1)


def _same_frac(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    return (a == b).reshape(a.shape[0], -1).mean(1)


def _max_run(eq_h: np.ndarray, eq_v: np.ndarray) -> np.ndarray:
    """Longest run of equal neighbours along rows/columns, per grid (in cells, >= 1)."""
    B = eq_h.shape[0]
    best = np.ones(B)
    for eq in (eq_h, np.swapaxes(eq_v, 1, 2)):          # (B, N, N-1) equalities along the line
        run = np.zeros(eq.shape[:2])
        for k in range(eq.shape[2]):
            run = np.where(eq[:, :, k], run + 1, 0)
            best = np.maximum(best, run.max(1) + 1)
    return best


def feature_names(gtype: GridType) -> list[str]:
    C = gtype.C
    names = [f"colour_count_{c}" for c in range(C)] + [f"colour_rank_{k}" for k in range(C)]
    names += ["sym_top1", "sym_top2", "sym_distinct", "sym_mean", "sym_sd"]
    names += ["adj_same_colour", "adj_same_symbol", "adj_both", "run_colour", "run_symbol",
              "mono_lines_colour", "mono_lines_symbol", "mirror_lr", "mirror_ud", "transpose", "rot180",
              "mirror_lr_sym", "rot180_sym", "sorted_rows", "sorted_cols", "colour_step_rainbow",
              "line_sum_spread", "checker"]
    if gtype.symbols == "cards":
        names += ["suit_top1", "face_share"]
    return names + ["bias"]


def grid_features(sym: np.ndarray, col: np.ndarray, gtype: GridType) -> np.ndarray:
    sym = np.asarray(sym)
    col = np.asarray(col)
    if sym.ndim == 2:
        sym, col = sym[None], col[None]
    B, N = sym.shape[0], sym.shape[1]
    n2 = float(N * N)
    C, S = gtype.C, gtype.S
    out = []
    ccnt, csort = _sorted_counts(col, C)
    out += [ccnt / n2, csort / n2]
    scnt, ssort = _sorted_counts(sym, S)
    val = gtype.value[sym.astype(np.int64)].astype(float)
    vmax = float(gtype.value.max())
    out += [ssort[:, :1] / n2, ssort[:, 1:2] / n2, ((scnt > 0).sum(1, keepdims=True)) / min(S, n2),
            val.reshape(B, -1).mean(1, keepdims=True) / vmax, val.reshape(B, -1).std(1, keepdims=True) / vmax]
    ch, cv = col[:, :, 1:] == col[:, :, :-1], col[:, 1:, :] == col[:, :-1, :]
    sh, sv = sym[:, :, 1:] == sym[:, :, :-1], sym[:, 1:, :] == sym[:, :-1, :]
    npairs = 2.0 * N * (N - 1)
    adj_c = (ch.reshape(B, -1).sum(1) + cv.reshape(B, -1).sum(1)) / npairs
    adj_s = (sh.reshape(B, -1).sum(1) + sv.reshape(B, -1).sum(1)) / npairs
    adj_b = ((ch & sh).reshape(B, -1).sum(1) + (cv & sv).reshape(B, -1).sum(1)) / npairs
    run_c = _max_run(ch, cv) / N
    run_s = _max_run(sh, sv) / N
    mono_c = ((col == col[:, :, :1]).all(2).sum(1) + (col == col[:, :1, :]).all(1).sum(1)) / (2.0 * N)
    mono_s = ((sym == sym[:, :, :1]).all(2).sum(1) + (sym == sym[:, :1, :]).all(1).sum(1)) / (2.0 * N)
    lr = _same_frac(col, col[:, :, ::-1])
    ud = _same_frac(col, col[:, ::-1, :])
    tr = _same_frac(col, np.swapaxes(col, 1, 2))
    r180 = _same_frac(col, col[:, ::-1, ::-1])
    lr_s = _same_frac(sym, sym[:, :, ::-1])
    r180_s = _same_frac(sym, sym[:, ::-1, ::-1])
    sr = (np.diff(val, axis=2) >= 0).all(2).mean(1)
    sc = (np.diff(val, axis=1) >= 0).all(1).mean(1)
    step = ((col[:, :, 1:].astype(int) - col[:, :, :-1]) % C == 1).reshape(B, -1).mean(1)
    rs, cs = val.sum(2), val.sum(1)
    spread = (np.concatenate([rs, cs], 1).std(1)) / (vmax * N)
    checker = 0.5 * (~ch).reshape(B, -1).mean(1) + 0.5 * (~cv).reshape(B, -1).mean(1)
    out += [x[:, None] for x in (adj_c, adj_s, adj_b, run_c, run_s, mono_c, mono_s, lr, ud, tr, r180,
                                  lr_s, r180_s, sr, sc, step, spread, checker)]
    if gtype.symbols == "cards":
        suit = gtype.suit[sym.astype(np.int64)]
        _, ssu = _sorted_counts(suit, 4)
        face = gtype.face[sym.astype(np.int64)].reshape(B, -1).mean(1)
        out += [ssu[:, :1] / n2, face[:, None]]
    out.append(np.ones((B, 1)))
    return np.concatenate(out, axis=1)


# ------------------------------------------------------------------------------------------------
# transformation signatures (what an observer can tell about a change from the two grids alone)
# ------------------------------------------------------------------------------------------------
def _scope(mask: np.ndarray) -> str:
    n = int(mask.sum())
    if n == 0:
        return "none"
    if n == 1:
        return "cell"
    r, c = np.nonzero(mask)
    if len(set(r.tolist())) == 1 or len(set(c.tolist())) == 1:
        return "line"
    if r.max() - r.min() <= 2 and c.max() - c.min() <= 2:
        return "block"
    if n >= 0.6 * mask.size:
        return "global"
    return "region"


def diff_signature(xs, xc, ys, yc) -> tuple:
    """(colour changed, symbol changed, colour multiset kept, symbol multiset kept, cells moved as
    pairs, scope of the change, changed-cell bucket)."""
    dc, ds = xc != yc, xs != ys
    mask = dc | ds
    cm = bool(dc.any()) and np.array_equal(np.sort(xc, None), np.sort(yc, None))
    sm = bool(ds.any()) and np.array_equal(np.sort(xs, None), np.sort(ys, None))
    pair = bool(dc.any() and ds.any()) and np.array_equal(dc, ds) and \
        np.array_equal(np.sort((xs.astype(int) * 64 + xc)[mask]), np.sort((ys.astype(int) * 64 + yc)[mask]))
    n = int(mask.sum())
    bucket = 0 if n <= 1 else 1 if n <= 2 else 2 if n <= mask.shape[0] else 3 if n <= 3 * mask.shape[0] else 4
    return (bool(dc.any()), bool(ds.any()), cm, sm, pair, _scope(mask), bucket)
