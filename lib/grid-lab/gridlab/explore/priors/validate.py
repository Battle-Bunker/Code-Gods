"""Validation of the latent-space sampler (latent.py).

    python3 -m gridlab.explore.priors.validate [--quick] [--processes 4]

  toy     exact check: a library of 20 "paint a whole line red/blue" programs, k uniform on 0..3, and
          the count of red cells. The exact ρ-tail is a finite mixture of shifted binomials
          (enumerate all 8421 program sequences), so bias, spread and the reported se can be compared
          level by level down to ~30 bits, where reaching the top needs the kernel to change programs.
  k0      with K = 0 the latent sampler is the engine's estimator: compare with exact tails.
  mc      brute force: 2^20 fresh ρ samples (held-out seeds) against the tables, at every level with
          >= 64 Monte Carlo hits (to ~14 bits), as z-scores. The same samples give the p-value check
          P_ρ(s >= k)·2^k <= 1 (up to noise and ties).
  reps    8 independently seeded tables per (family, prior): observed spread vs reported se.
"""
from __future__ import annotations

import argparse
import itertools
import math
import multiprocessing as mp
import time

import numpy as np

from ...core import Grid, GridType
from ...family import Draw
from ...program import Program, Step, ALWAYS
from ...rules import by_id
from ... import calibrate as cal
from . import latent as la

GT = GridType(5, "base10", "rgby")


def md(headers, rows):
    out = ["| " + " | ".join(headers) + " |", "|" + "---|" * len(headers)]
    for r in rows:
        out.append("| " + " | ".join(f"{x:.3g}" if isinstance(x, float) else str(x) for x in r) + " |")
    return "\n".join(out)


# ------------------------------------------------------------------------------------------------
# toy with an exact answer
# ------------------------------------------------------------------------------------------------
def toy_law(gt: GridType = GT, K: int = 3) -> la.ProgramLaw:
    progs = [Program(ALWAYS, (Step.make("paint", {"kind": "line", "region": (a, i), "colour": c}),))
             for c in (0, gt.C - 1) for a in (0, 1) for i in range(gt.N)]
    spec = la.PriorSpec("toy_paint_lines", K=K)
    n = len(progs)
    return la.ProgramLaw(gt, spec, progs, np.full(n, 23.0), np.full(n, 1.0 / n), np.full(K + 1, 1.0 / (K + 1)),
                         tag=f"toy-paint-lines|{gt.key}|{K}|{la.LATENT_VERSION}")


def toy_exact(law: la.ProgramLaw) -> np.ndarray:
    """exact log2 ρ{#red >= t} for t = 0..N²."""
    gt = law.gtype
    N2, p = gt.N * gt.N, 1.0 / gt.C
    regions = []
    for prog in law.progs:
        prm = prog.steps[0].params
        m = np.zeros((gt.N, gt.N), bool)
        a, i = prm["region"]
        if a == 0:
            m[i, :] = True
        else:
            m[:, i] = True
        regions.append((m.ravel(), prm["colour"] == 0))
    binom = np.array([[math.comb(n, j) * p ** j * (1 - p) ** (n - j) for j in range(N2 + 1)] for n in range(N2 + 1)])
    tail = np.zeros(N2 + 2)
    for k, qk in enumerate(law.q):
        dist = np.zeros(N2 + 1)
        seqs = list(itertools.product(range(len(regions)), repeat=k))
        for seq in seqs:
            painted = np.zeros(N2, bool)
            red = np.zeros(N2, bool)
            for j in seq:
                m, isred = regions[j]
                painted |= m
                red[m] = isred
            nf, nr = int((~painted).sum()), int(red.sum())
            dist[nr:nr + nf + 1] += binom[nf, :nf + 1]
        dist /= len(seqs)
        tail[:N2 + 1] += qk * np.cumsum(dist[::-1])[::-1]
    return np.log2(np.maximum(tail[:N2 + 1], 1e-300))


def check_toy(reps: int = 6) -> str:
    from tests.toys import COLOUR_COUNT_EST
    law = toy_law()
    ex = toy_exact(law)
    d = Draw(COLOUR_COUNT_EST, {"colour": 0})
    ts = list(range(8, 26))
    est = np.full((reps, len(ts)), np.nan)
    ses = np.full((reps, len(ts)), np.nan)
    secs = []
    for r in range(reps):
        T = la.build_table(d, GT, law.spec, salt=f"rep{r}", law=law)
        secs.append(T.meta["seconds"])
        for j, t in enumerate(ts):
            if t <= T.levels[-1]:
                est[r, j] = T.surprisal(t)
                ses[r, j] = T.stderr(t)
    rows = []
    for j, t in enumerate(ts):
        e = est[:, j]
        rows.append([t, f"{-ex[t]:.2f}", f"{np.nanmean(e) + ex[t]:+.2f}", f"{np.nanstd(e):.2f}",
                     f"{np.nanmean(ses[:, j]):.2f}", int(np.isfinite(e).sum())])
    return (f"Toy: 20 line-paint programs, k ~ U{{0..3}}, #red on {GT.key}; {reps} seeds, "
            f"{np.mean(secs):.1f} s/table\n\n" +
            md(["t (#red)", "exact bits", "bias", "sd", "reported se", "seeds reaching t"], rows))


# ------------------------------------------------------------------------------------------------
# K = 0 against exact tails
# ------------------------------------------------------------------------------------------------
EXACT_FAMS = ["seed3_green_ones", "conqueror", "homebody", "parity_painter"]


def check_k0() -> str:
    rng = np.random.default_rng(5)
    spec = la.PriorSpec("k0", K=0)
    rows = []
    for fid in EXACT_FAMS:
        f = by_id(fid)
        if not f.available(GT) or f.exact_log2_tail is None:
            continue
        d = Draw(f, f.sample(rng, GT))
        T = la.build_table(d, GT, spec)
        p = cal.canonical_params(d, GT)
        lv = T.levels[T.levels > T.meta["body_top"]]
        errs = []
        for t in lv[:: max(1, len(lv) // 12)]:
            exb = -f.exact_log2_tail(int(t), p, GT)
            if exb < 66:
                errs.append((exb, T.surprisal(int(t)) - exb, T.stderr(int(t))))
        e = np.array(errs)
        deep = e[e[:, 0] > 30] if (e[:, 0] > 30).any() else e[-1:]
        rows.append([fid, len(e), f"{e[:, 1].mean():+.2f}", f"{np.abs(e[:, 1]).max():.2f}",
                     f"{deep[:, 1].mean():+.2f} @ {deep[:, 0].mean():.0f} bits", f"{e[:, 2].mean():.2f}"])
    return "K = 0 (latent sampler without programs) against exact tails\n\n" + md(
        ["family", "levels checked", "mean err (bits)", "max |err|", "deep err", "mean reported se"], rows)


# ------------------------------------------------------------------------------------------------
# brute-force Monte Carlo on ρ
# ------------------------------------------------------------------------------------------------
_MC: dict = {}


def _mc_chunk(args):
    gt, spec, seed, n = args
    law = la.program_law(gt, spec)
    rng = np.random.default_rng(seed)
    L = la.Latent.sample(law, rng, n)
    return L.ys, L.yc


def mc_sample(gt: GridType, spec, n: int, processes: int = 4, seed: int = 991):
    la.program_law(gt, spec)
    chunks = [(gt, spec, seed * 1000 + i, n // 16) for i in range(16)]
    with mp.get_context("fork").Pool(processes) as p:
        out = p.map(_mc_chunk, chunks)
    return np.concatenate([o[0] for o in out]), np.concatenate([o[1] for o in out])


MC_FAMS = ["conqueror", "rainbow_road", "seed1_line_painter", "mirrormancer", "stripe_painter", "lucky_token",
           "number_bonds", "seed2_patchwork"]


def check_mc(specs=("reach2", "levin", "beta.25"), n: int = 1 << 20, processes: int = 4) -> str:
    rng = np.random.default_rng(11)
    draws = []
    for fid in MC_FAMS:
        try:
            f = by_id(fid)
        except KeyError:
            continue
        if f.available(GT):
            draws.append(Draw(f, f.sample(rng, GT)))
    rows, prow = [], []
    for sname in specs:
        spec = la.get_spec(sname)
        t0 = time.perf_counter()
        ys, yc = mc_sample(GT, spec, n, processes)
        tmc = time.perf_counter() - t0
        la.precompute(draws, GT, spec, processes)
        pv_acc = np.zeros(13)
        for d in draws:
            T = la.survival(d, GT, spec)
            p = cal.canonical_params(d, GT)
            V = np.asarray(d.family.evaluate_batch(ys, yc, p, GT), np.int64)
            w, c = np.unique(V, return_counts=True)
            tc = np.cumsum(c[::-1])[::-1]
            sel = (w > T.meta["body_top"]) & (tc >= 64)
            zs, diffs = [], []
            for t, cnt in zip(w[sel], tc[sel]):
                mcb = -math.log2(cnt / len(V))
                mse = math.sqrt((1 - cnt / len(V)) / cnt) / cal.LN2
                diff = T.surprisal(int(t)) - mcb
                se = math.hypot(T.stderr(int(t)), mse)
                zs.append(diff / se)
                diffs.append((mcb, diff))
            s = T.surprisal(V)
            for k in range(1, 13):
                pv_acc[k] = max(pv_acc[k], float((s >= k).mean() * 2 ** k))
            if zs:
                dd = np.array(diffs)
                rows.append([sname, d.family.id, len(zs), f"{dd[:, 0].max():.1f}", f"{dd[:, 1].mean():+.2f}",
                             f"{np.mean(zs):+.2f}", f"{np.sqrt(np.mean(np.square(zs))):.2f}", f"{np.abs(zs).max():.2f}"])
        prow.append([sname, f"{tmc:.0f}"] + [f"{pv_acc[k]:.2f}" for k in (2, 4, 6, 8, 10, 12)])
    return (f"Brute-force Monte Carlo ({n} fresh ρ samples, held-out seeds) vs latent splitting, levels "
            f"beyond the pool body with >= 64 MC hits\n\n" +
            md(["prior", "family", "levels", "deepest MC bits", "mean diff (bits)", "mean z", "rms z", "max |z|"], rows) +
            "\n\np-value check: max over families of P_ρ(s >= k)·2^k (should be <= ~1)\n\n" +
            md(["prior", "MC seconds", "k=2", "4", "6", "8", "10", "12"], prow))


# ------------------------------------------------------------------------------------------------
# replicate spread
# ------------------------------------------------------------------------------------------------
_RJ: list = []


def _rep_job(i):
    d, spec, r = _RJ[i]
    T = la.build_table(d, GT, spec, salt=f"rep{r}")
    return i, T


def check_reps(fams=("conqueror", "rainbow_road", "mirrormancer", "lucky_token"), specs=("reach2", "levin"),
               reps: int = 8, processes: int = 4) -> str:
    global _RJ
    rng = np.random.default_rng(12)
    draws = [Draw(by_id(f), by_id(f).sample(rng, GT)) for f in fams]
    rows = []
    for sname in specs:
        spec = la.get_spec(sname)
        la.program_law(GT, spec)
        for r in range(reps):
            la.pool(GT, spec, la.DEFAULT_LBUDGET.n_pool, salt=f"rep{r}")
        _RJ = [(d, spec, r) for d in draws for r in range(reps)]
        with mp.get_context("fork").Pool(processes) as p:
            res = dict(p.map(_rep_job, range(len(_RJ))))
        for a, d in enumerate(draws):
            Ts = [res[a * reps + r] for r in range(reps)]
            # common checkpoints: the uniform table's levels at 16, 24, 32, ... bits of the first replicate
            T0 = Ts[0]
            for target in (16, 24, 32, 40):
                j = np.flatnonzero(-T0.log2p >= target)
                if not len(j):
                    continue
                t = int(T0.levels[j[0]])
                v = np.array([T.surprisal(t) for T in Ts])
                se = np.array([T.stderr(t) for T in Ts])
                rows.append([sname, d.family.id, t, f"{v.mean():.1f}", f"{v.std(ddof=1):.2f}", f"{se.mean():.2f}"])
    return (f"Replicates: {reps} independently seeded tables (pool and splitting) per family\n\n" +
            md(["prior", "family", "ordinal t", "mean bits", "sd across seeds", "mean reported se"], rows))


def main(argv=None):
    ap = argparse.ArgumentParser(prog="gridlab.explore.priors.validate")
    ap.add_argument("--only", default="toy,k0,mc,reps")
    ap.add_argument("--quick", action="store_true", help="2^18 MC samples, 4 replicates")
    ap.add_argument("--processes", type=int, default=4)
    a = ap.parse_args(argv)
    parts = a.only.split(",")
    out = []
    if "toy" in parts:
        out.append(check_toy(4 if a.quick else 6))
        print(out[-1] + "\n", flush=True)
    if "k0" in parts:
        out.append(check_k0())
        print(out[-1] + "\n", flush=True)
    if "mc" in parts:
        out.append(check_mc(n=(1 << 18) if a.quick else (1 << 20), processes=a.processes))
        print(out[-1] + "\n", flush=True)
    if "reps" in parts:
        out.append(check_reps(reps=4 if a.quick else 8, processes=a.processes))
        print(out[-1] + "\n", flush=True)


if __name__ == "__main__":
    main()
