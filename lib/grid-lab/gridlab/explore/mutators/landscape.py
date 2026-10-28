"""Calibrated mutator x family yield landscape.

    python3 -m gridlab.explore.mutators.landscape --type 5,base10,rgby [--draws 3] [--preset NAME] [--multi]

For every family (k fixed draws) and every mutator, the probe finds the best single-step agent and the
best short program (2-3 steps, beam search), and reports its *yield*: mean Δ surprisal per bit of action
cost, with surprisal from the engine's calibrated survival tables (gridlab.calibrate, up to ~70 bits).

  * Selection is on a training half of the starting states; every reported number is on the held-out
    half (so best-of-many selection does not inflate it).
  * The single-step search is exhaustive: every parameter setting of every mutator (Mutator.space).
  * An agent is applied blindly to whatever object it meets, so the yield is the MEAN Δs over states
    (no-ops and guard failures count as 0), as in policy.GreedyPolicy.

Contexts (starting states; see states.py):
  fresh    uniform spawns
  mid      objects observed in simulated games
  game     fresh ∪ mid (the main matrix: what an agent meets in a game)
  near     the god's own exemplar, 1-4 cells perturbed (completion)
  rival    exemplars of other draws of the same family (theft)
  foreign  exemplars of random families (structure built by others)

Results go to .cache/explore_mutators/landscape-<GridType>-<preset>.pkl; `report.py` prints tables.
"""
from __future__ import annotations

import argparse
import multiprocessing as mp
import pickle
import time
from dataclasses import dataclass

import numpy as np

from ... import calibrate as cal
from ...core import Grid, GridType
from ...program import ALWAYS, Program, Step
from . import states as ST
from .variants import install_preset, preset_tag

TAU = (0.5, 0.75)        # jackpot thresholds as fractions of the draw's ceiling
LANDSCAPE_V = "-v2"      # v2: stores program steps; whole-grid steps always in the beam's extension pool


# ------------------------------------------------------------------------------------------------
# parameter bank: every single-step program of the GridType
# ------------------------------------------------------------------------------------------------
@dataclass
class Bank:
    gt: GridType
    steps: list            # Step
    mids: np.ndarray       # mutator index per step
    ids: list              # mutator ids
    cost: np.ndarray       # full single-step program cost (agent base included)
    step_cost: np.ndarray  # step cost only


def make_bank(gt: GridType) -> Bank:
    from ...mutators import available
    steps, mids, ids, cost, sc = [], [], [], [], []
    for k, m in enumerate(available(gt)):
        ids.append(m.id)
        for p in m.space(gt):
            st = Step.make(m.id, p)
            steps.append(st)
            mids.append(k)
            c = Program(ALWAYS, (st,)).cost(gt)
            cost.append(c)
            sc.append(st.cost(gt))
    return Bank(gt, steps, np.array(mids), ids, np.array(cost), np.array(sc))


def apply_steps(steps, sym: np.ndarray, col: np.ndarray, gt: GridType) -> tuple[np.ndarray, np.ndarray]:
    """(P, n, N, N) outputs; a no-op leaves the input."""
    P, n = len(steps), len(sym)
    Ys = np.empty((P, n) + sym.shape[1:], sym.dtype)
    Yc = np.empty((P, n) + col.shape[1:], col.dtype)
    grids = [Grid(a, b) for a, b in zip(sym, col)]
    for i, st in enumerate(steps):
        for j, g in enumerate(grids):
            y = st.apply(g, gt)
            if y is None:
                Ys[i, j], Yc[i, j] = g.sym, g.col
            else:
                Ys[i, j], Yc[i, j] = y.sym, y.col
    return Ys, Yc


def apply_each(steps, Xs: np.ndarray, Xc: np.ndarray, gt: GridType):
    """steps[i] applied to its own batch Xs[i] (shape (P, n, N, N))."""
    Ys, Yc = Xs.copy(), Xc.copy()
    for i, st in enumerate(steps):
        for j in range(Xs.shape[1]):
            y = st.apply(Grid(Xs[i, j], Xc[i, j]), gt)
            if y is not None:
                Ys[i, j], Yc[i, j] = y.sym, y.col
    return Ys, Yc


def surprisal(draw, table, sym, col, gt) -> np.ndarray:
    shp = sym.shape[:-2]
    s = sym.reshape((-1,) + sym.shape[-2:])
    c = col.reshape((-1,) + col.shape[-2:])
    out = np.empty(len(s))
    for a in range(0, len(s), 1 << 15):
        out[a:a + (1 << 15)] = table.surprisal(draw.family.evaluate_batch(s[a:a + (1 << 15)], c[a:a + (1 << 15)],
                                                                         draw.params, gt))
    return out.reshape(shp)


# ------------------------------------------------------------------------------------------------
# worker state (built in the parent, inherited through fork)
# ------------------------------------------------------------------------------------------------
_G: dict = {}


def _ctx_states(gt, n_fresh, n_mid, n_foreign):
    fs, fc = ST.fresh(gt, n_fresh)
    ms, mc = ST.midgame(gt)
    r = ST.rng_of("midpick", gt.key)
    pick = r.permutation(len(ms))[:n_mid]
    ms, mc = ms[pick], mc[pick]
    os_, oc = ST.foreign(gt, n_foreign)
    return {"fresh": (fs, fc), "mid": (ms, mc), "foreign": (os_, oc)}


def _split(n):
    """train / test index halves, interleaved (so 'game' = fresh ∪ mid keeps both in each half)."""
    idx = np.arange(n)
    return idx[0::2], idx[1::2]


def _best(dS_tr, cost, mids, nm):
    """Per mutator: index of the best param by train yield (ties broken by Δs); -1 if no positive yield."""
    y = dS_tr / cost
    best = np.full(nm, -1)
    for k in range(nm):
        sel = np.flatnonzero(mids == k)
        if sel.size == 0:
            continue
        j = sel[int(np.argmax(y[sel] + 1e-9 * dS_tr[sel]))]
        if y[j] > 0:
            best[k] = j
    return best


def _single(draw, table, ctx, Ys, Yc, X, bank, ceil):
    gt = bank.gt
    s0 = surprisal(draw, table, X[0], X[1], gt)                       # (n,)
    S1 = surprisal(draw, table, Ys, Yc, gt)                           # (P, n)
    tr, te = _split(len(s0))
    D = S1 - s0[None, :]
    dtr, dte = D[:, tr].mean(1), D[:, te].mean(1)
    best = _best(dtr, bank.cost, bank.mids, len(bank.ids))
    rows = {}
    for k, mid in enumerate(bank.ids):
        j = best[k]
        if j < 0:
            rows[mid] = {"d": 0.0, "y": 0.0, "cost": float("nan"), "params": None, "d_tr": 0.0}
            continue
        rows[mid] = {"d": float(dte[j]), "y": float(dte[j] / bank.cost[j]), "cost": float(bank.cost[j]),
                     "params": bank.steps[j].params, "d_tr": float(dtr[j]),
                     "d_pos": float(np.clip(D[j, te], 0, None).mean()), "d_neg": float(np.clip(D[j, te], None, 0).mean())}
    # jackpot: share of TEST states lifted to >= tau * ceil, cheapest single step with share >= 1/2
    jack = {}
    for tau in TAU:
        hit = (S1[:, te] >= tau * ceil).mean(1)
        ok = np.flatnonzero(hit >= 0.5)
        if ok.size:
            j = ok[int(np.argmin(bank.cost[ok]))]
            jack[tau] = {"cost": float(bank.cost[j]), "mutator": bank.ids[bank.mids[j]], "params": bank.steps[j].params,
                         "hit": float(hit[j])}
    return {"s0_mean": float(s0[te].mean()), "rows": rows, "jack": jack, "dtr_all": dtr.astype(np.float32),
            "dte_all": dte.astype(np.float32)}, (S1, s0, D)


def _ext_pool(dtr, bank, rng, top_d=6, top_y=4, rand=3):
    sel = []
    y = dtr / bank.cost
    for k in range(len(bank.ids)):
        idx = np.flatnonzero(bank.mids == k)
        if idx.size == 0:
            continue
        a = idx[np.argsort(-dtr[idx])[:top_d]]
        b = idx[np.argsort(-y[idx])[:top_y]]
        c = rng.choice(idx, min(rand, idx.size), replace=False)
        sel.extend(set(a.tolist()) | set(b.tolist()) | set(c.tolist()))
    sel.extend(_global_idx(bank).tolist())
    return np.array(sorted(set(sel)))


def _global_idx(bank) -> np.ndarray:
    """Bank steps acting on the whole grid (kind 'all', or global-only mutators): always worth trying as a
    second step, whatever their single-step yield for this family (e.g. Seed 2: write 9 everywhere, then unclash)."""
    if not hasattr(bank, "_glob"):
        g = [i for i, st in enumerate(bank.steps)
             if st.params.get("kind") == "all" or st.mutator.scopes == ("global",) or st.params.get("which") == "all"]
        bank._glob = np.array(g, int)
    return bank._glob


def _multi(draw, table, X, Ys, Yc, S1, s0, bank, ceil, rng, n_seed=12, n_exact=24, beam3=6):
    """Beam search over 2- and 3-step programs (unguarded) on the 'game' context."""
    gt = bank.gt
    tr, te = _split(len(s0))
    D = S1 - s0[None, :]
    dtr = D[:, tr].mean(1)
    y1 = dtr / bank.cost
    seeds = list(dict.fromkeys(np.argsort(-y1)[:n_seed].tolist() + np.argsort(-dtr)[:n_seed // 2].tolist()))
    ext = _ext_pool(dtr, bank, rng)
    ab = float(bank.cost[0] - bank.step_cost[0])     # agent base
    Xtr = (X[0][tr], X[1][tr])
    cands = []                                        # (steps tuple of bank idx, train outputs Ys, Yc)

    def run_on(prefix_out, j):
        st = bank.steps[j]
        return apply_each([st], prefix_out[0][None], prefix_out[1][None], gt)

    # depth 2: seed then ext, ext then seed
    pairs = []
    for a in seeds:
        for b in ext:
            if a != b:
                pairs.append((a, b))
                pairs.append((b, a))
    pairs = list(dict.fromkeys(pairs))
    first = np.array([p[0] for p in pairs])
    second = [bank.steps[p[1]] for p in pairs]
    Ps, Pc = apply_each(second, Ys[first][:, tr], Yc[first][:, tr], gt)
    S2 = surprisal(draw, table, Ps, Pc, gt)
    d2 = (S2 - s0[tr][None]).mean(1)
    lb2 = ab + bank.step_cost[first] + np.array([bank.step_cost[p[1]] for p in pairs])
    out = {"pairs": len(pairs)}

    def exactify(progs_idx, d, lb, k):
        order = np.argsort(-(d / lb))[:k]
        res = []
        for o in order:
            if d[o] <= 0:
                continue
            prog = Program(ALWAYS, tuple(bank.steps[j] for j in progs_idx[o]))
            c = prog.cost(gt)
            res.append((d[o] / c, d[o], c, o, prog))
        res.sort(key=lambda r: -r[0])
        return res

    ex2 = exactify(pairs, d2, lb2, n_exact)
    # depth 3 from the best 2-step programs
    triples = []
    for _, _, _, o, _ in ex2[:beam3]:
        a, b = pairs[o]
        for c in ext:
            triples.append((a, b, c))
            triples.append((c, a, b))
    triples = list(dict.fromkeys(triples))
    best3 = []
    if triples:
        # (a,b,c): apply c to S2 outputs of (a,b); (c,a,b): apply a then b to Ys[c]
        T = triples
        Ts = np.empty((len(T), len(tr)) + X[0].shape[1:], X[0].dtype)
        Tc = np.empty_like(Ts)
        pidx = {p: i for i, p in enumerate(pairs)}
        # group by construction
        app = [(i, t) for i, t in enumerate(T) if (t[0], t[1]) in pidx and t[2] not in (t[0], t[1])]
        pre = [(i, t) for i, t in enumerate(T) if not ((t[0], t[1]) in pidx and t[2] not in (t[0], t[1]))]
        if app:
            ii = [i for i, _ in app]
            src = np.array([pidx[(t[0], t[1])] for _, t in app])
            a_s, a_c = apply_each([bank.steps[t[2]] for _, t in app], Ps[src], Pc[src], gt)
            Ts[ii], Tc[ii] = a_s, a_c
        if pre:
            ii = [i for i, _ in pre]
            m1 = apply_each([bank.steps[t[1]] for _, t in pre], Ys[[t[0] for _, t in pre]][:, tr],
                            Yc[[t[0] for _, t in pre]][:, tr], gt)
            m2 = apply_each([bank.steps[t[2]] for _, t in pre], m1[0], m1[1], gt)
            Ts[ii], Tc[ii] = m2
        S3 = surprisal(draw, table, Ts, Tc, gt)
        d3 = (S3 - s0[tr][None]).mean(1)
        lb3 = ab + np.array([bank.step_cost[list(t)].sum() for t in T])
        best3 = exactify(T, d3, lb3, n_exact)
        out["triples"] = len(T)
    # held-out evaluation of the best 2- and 3-step programs (exact cost)
    Xte = [Grid(a, b) for a, b in zip(X[0][te], X[1][te])]

    def test(prog):
        ys = [prog.run(g, gt) for g in Xte]
        s1 = surprisal(draw, table, np.stack([g.sym for g in ys]), np.stack([g.col for g in ys]), gt)
        return s1

    for name, lst in (("two", ex2), ("three", best3)):
        if not lst:
            out[name] = {"d": 0.0, "y": 0.0, "cost": float("nan"), "desc": None, "mutators": ()}
            continue
        yy, d, c, o, prog = lst[0]
        s1 = test(prog)
        dte = float((s1 - s0[te]).mean())
        out[name] = {"d": dte, "y": dte / c, "cost": c, "d_tr": float(d), "desc": prog.describe(gt),
                     "mutators": prog.mutator_ids, "steps": [(st.mutator_id, st.params) for st in prog.steps],
                     "top": [([(st.mutator_id, st.params) for st in r[4].steps], float(r[0])) for r in lst[:4]],
                     "jack": {tau: float((s1 >= tau * ceil).mean()) for tau in TAU}}
    # cheapest multi-step jackpot among exact-priced candidates
    jack = {}
    for tau in TAU:
        best = None
        for S_arr, idxs in ((S2, pairs),):
            hit = (S_arr >= tau * ceil).mean(1)
            ok = np.flatnonzero(hit >= 0.5)
            if ok.size:
                lb = lb2[ok]
                for o in ok[np.argsort(lb)[:5]]:
                    prog = Program(ALWAYS, tuple(bank.steps[j] for j in idxs[o]))
                    c = prog.cost(gt)
                    if best is None or c < best[0]:
                        best = (c, prog.describe(gt), prog.mutator_ids, float(hit[o]))
        if best:
            jack[tau] = {"cost": best[0], "desc": best[1], "mutators": best[2], "hit_tr": best[3]}
    out["jack"] = jack
    return out


def _work(i: int):
    draw, table_key = _G["draws"][i]
    gt, bank, shared = _G["gt"], _G["bank"], _G["shared"]
    table = cal.survival(draw, gt)
    ex = ST.exemplar(draw, gt)
    ceil = float(table.surprisal(draw.ordinal(ex, gt))) if ex is not None else float(table.max_observed_bits)
    rec = {"family": draw.family.id, "params": draw.params, "ceil": ceil, "table_max": float(table.max_observed_bits),
           "ctx": {}}
    rng = ST.rng_of("multi", gt.key, i)
    for name, (X, Y) in shared.items():
        r, (S1, s0, D) = _single(draw, table, name, Y[0], Y[1], X, bank, ceil)
        rec["ctx"][name] = r
        if name == "game" and _G["multi"]:
            rec["multi"] = _multi(draw, table, X, Y[0], Y[1], S1, s0, bank, ceil, rng)
    for name, fn in (("near", ST.near), ("rival", ST.rival)):
        X = fn(draw, gt, _G["n_own"])
        if len(X[0]) == 0:
            continue
        Y = apply_steps(bank.steps, X[0], X[1], gt)
        r, _ = _single(draw, table, name, Y[0], Y[1], X, bank, ceil)
        rec["ctx"][name] = r
    return i, rec


def run(gt: GridType, k: int = 3, preset: str = "default", multi: bool = True, processes: int = 4,
        n_fresh: int = 64, n_mid: int = 64, n_foreign: int = 64, n_own: int = 32, families=None,
        verbose: bool = True) -> dict:
    install_preset(preset)
    t0 = time.time()
    draws = ST.draws_for_type(gt, k)
    if families:
        draws = [d for d in draws if d.family.id in families]
    cal.precompute(draws, gt, processes=processes)
    bank = make_bank(gt)
    ctx = _ctx_states(gt, n_fresh, n_mid, n_foreign)
    # 'game' = fresh ∪ mid, interleaved so the train/test halves each hold both
    fs, fc = ctx["fresh"]
    ms, mc = ctx["mid"]
    n = min(len(fs), len(ms))
    gs = np.empty((2 * n,) + fs.shape[1:], fs.dtype)
    gc = np.empty_like(gs)
    gs[0::4], gs[1::4] = fs[0:n:2], fs[1:n:2]
    gs[2::4], gs[3::4] = ms[0:n:2], ms[1:n:2]
    gc[0::4], gc[1::4] = fc[0:n:2], fc[1:n:2]
    gc[2::4], gc[3::4] = mc[0:n:2], mc[1:n:2]
    ctx = {"game": (gs, gc), **ctx}
    shared = {}
    for name, X in ctx.items():
        if name in ("fresh", "mid"):
            continue        # derived from 'game' below
        shared[name] = (X, apply_steps(bank.steps, X[0], X[1], gt))
    # fresh / mid views of the game arrays (same train/test split)
    X, Y = shared["game"]
    for name, sl in (("fresh", np.r_[0:2 * n:4, 1:2 * n:4]), ("mid", np.r_[2:2 * n:4, 3:2 * n:4])):
        sl = np.sort(sl)
        shared[name] = ((X[0][sl], X[1][sl]), (Y[0][:, sl], Y[1][:, sl]))
    if verbose:
        print(f"[landscape] {gt.key} preset={preset}: {len(bank.steps)} single steps, {len(draws)} draws, "
              f"contexts {', '.join(f'{k}:{len(v[0][0])}' for k, v in shared.items())} ({time.time() - t0:.0f}s)",
              flush=True)
    _G.update(gt=gt, bank=bank, shared=shared, draws=[(d, None) for d in draws], multi=multi, n_own=n_own)
    recs = [None] * len(draws)
    done = 0
    with mp.get_context("fork").Pool(processes) as pool:
        for i, rec in pool.imap_unordered(_work, range(len(draws))):
            recs[i] = rec
            done += 1
            if verbose and (done % 20 == 0 or done == len(draws)):
                print(f"  {done}/{len(draws)} draws ({time.time() - t0:.0f}s)", flush=True)
    out = {"gtype": gt.key, "preset": preset, "tag": preset_tag(preset), "ids": bank.ids,
           "bank_mids": bank.mids, "bank_cost": bank.cost, "bank_params": [s.params for s in bank.steps],
           "draws": recs, "seconds": time.time() - t0}
    return out


def path_for(gt: GridType, preset: str, k: int, multi: bool) -> "ST.Path":
    return ST.CACHE / f"landscape-{gt.key}-{preset}-{preset_tag(preset)[:10]}-k{k}{'-m' if multi else ''}{LANDSCAPE_V}.pkl"


def load_or_run(gt: GridType, preset: str = "default", k: int = 3, multi: bool = True, allow_old: bool = False,
                **kw) -> dict:
    """Cached landscape; allow_old=True also accepts an earlier landscape version (v1: no stored program steps,
    narrower beam) instead of computing a new one."""
    p = path_for(gt, preset, k, multi)
    if not p.exists():
        tag = "*" if preset == "default" else preset_tag(preset)[:10]      # the default key changed once
        pat = f"landscape-{gt.key}-{preset}-{tag}-k{k}{'-m' if multi else ''}"
        old = sorted(ST.CACHE.glob(pat + LANDSCAPE_V + ".pkl"))
        if not old and allow_old:
            old = sorted(ST.CACHE.glob(pat + "*.pkl"), reverse=True)
        p = old[0] if old else p
    if p.exists():
        with open(p, "rb") as fh:
            return pickle.load(fh)
    out = run(gt, k=k, preset=preset, multi=multi, **kw)
    ST.CACHE.mkdir(parents=True, exist_ok=True)
    with open(p, "wb") as fh:
        pickle.dump(out, fh)
    return out


if __name__ == "__main__":
    from ...experiments.common import parse_type
    ap = argparse.ArgumentParser()
    ap.add_argument("--type", default="5,base10,rgby")
    ap.add_argument("--draws", type=int, default=3)
    ap.add_argument("--preset", default="default")
    ap.add_argument("--no-multi", action="store_true")
    ap.add_argument("--families", default="")
    ap.add_argument("--processes", type=int, default=4)
    a = ap.parse_args()
    for t in a.type.split(";"):
        gt = parse_type(t)
        if a.families:
            out = run(gt, k=a.draws, preset=a.preset, multi=not a.no_multi, processes=a.processes,
                      families=a.families.split(","))
            print({r["family"]: {c: max(v["y"] for v in r["ctx"][c]["rows"].values()) for c in r["ctx"]}
                   for r in out["draws"]})
        else:
            load_or_run(gt, a.preset, a.draws, not a.no_multi, processes=a.processes)
