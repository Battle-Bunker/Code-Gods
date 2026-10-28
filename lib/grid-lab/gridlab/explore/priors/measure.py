"""Per-family ceilings and achievable yield per bit under each reference prior (policy-free).

    python3 -m gridlab.explore.priors.measure --type 5,base10,rgby --priors uniform,reach2,levin
    python3 -m gridlab.explore.priors.measure --type 4,base12,rgb --context played

For one fixed draw per family (seeded from the family id), and each prior:

  ceiling     surprisal of the family's best known grid (exemplar ordinal, else the deepest level)
  body        bits at the deepest Monte Carlo level of the prior's pool (diagnostic)
  best yield  max over the 4096 library programs P of mean_x [s(P x) - s(x)] / cost(P), the program
              chosen on 64 training grids and scored on 64 held-out grids (selection bias removed).
              Context `spawn`: fresh uniform spawns. Context `played`: grids that occur in simulated
              games (empirical.py), i.e. the structured objects agents actually meet.
  top tool    the mutator(s) of the winning program

Fairness across families = how evenly best yields (and ceilings) are spread: SD of log2 best yield,
max/min ratio over the middle 90%, Gini, and the share of starved families (best yield < 0.02).
Program outputs on the context grids are computed once and shared by every family and prior.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import pickle
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

from ...core import Grid, GridType
from ...family import Draw
from ...rules import FAMILIES
from ... import calibrate as cal
from . import latent as la

OUT = la.CACHE / "measure"


def parse_type(s: str) -> GridType:
    n, a, b = s.split(",")
    return GridType(int(n), a, b)


def family_draws(gt: GridType, families=None) -> list[Draw]:
    out = []
    for f in FAMILIES:
        if not f.available(gt) or (families and f.id not in families):
            continue
        r = np.random.default_rng(int(hashlib.sha256(f.id.encode()).hexdigest()[:8], 16))
        out.append(Draw(f, f.sample(r, gt)))
    return out


def top_ordinal(d: Draw, gt: GridType, T) -> int:
    p = cal.canonical_params(d, gt)
    if d.family.exemplar is not None:
        try:
            return int(d.family.ordinal(d.family.exemplar(p, gt), p, gt))
        except Exception:
            pass
    return int(T.levels[-1])


# ------------------------------------------------------------------------------------------------
# contexts and program outputs
# ------------------------------------------------------------------------------------------------
def context_grids(gt: GridType, kind: str, n: int = 128, seed: int = 4242):
    rng = np.random.default_rng(seed)
    if kind == "spawn":
        return (rng.integers(0, gt.S, (n, gt.N, gt.N), dtype=np.uint8),
                rng.integers(0, gt.C, (n, gt.N, gt.N), dtype=np.uint8))
    if kind == "played":
        from .empirical import played_grids
        S, C = played_grids(gt)
        pick = rng.choice(len(S), n, replace=len(S) < n)
        return S[pick].copy(), C[pick].copy()
    raise ValueError(kind)


_OUTS: dict = {}


def program_outputs(gt: GridType, kind: str, n: int = 128):
    """(xs, xc, ys, yc, costs, mids): xs (n,N,N); ys (P, n, N, N) outputs of every library program."""
    k = (gt, kind, n)
    if k in _OUTS:
        return _OUTS[k]
    law = la.program_law(gt, "uniform")
    path = OUT / f"outs-{hashlib.sha256(f'{law.tag}|{kind}|{n}'.encode()).hexdigest()[:24]}.pkl"
    if path.exists():
        with open(path, "rb") as fh:
            _OUTS[k] = pickle.load(fh)
        return _OUTS[k]
    xs, xc = context_grids(gt, kind, n)
    P = len(law.progs)
    ys = np.empty((P, n, gt.N, gt.N), np.uint8)
    yc = np.empty((P, n, gt.N, gt.N), np.uint8)
    grids = [Grid(xs[i], xc[i]) for i in range(n)]
    for p, prog in enumerate(law.progs):
        for i, g in enumerate(grids):
            y = prog.run(g, gt)
            ys[p, i], yc[p, i] = y.sym, y.col
    mids = [prog.mutator_ids for prog in law.progs]
    _OUTS[k] = (xs, xc, ys, yc, law.costs.copy(), mids)
    la._save(path, _OUTS[k])
    return _OUTS[k]


def ordinals(d: Draw, gt: GridType, outs) -> tuple[np.ndarray, np.ndarray]:
    xs, xc, ys, yc, _, _ = outs
    p = cal.canonical_params(d, gt)
    f = d.family
    u0 = np.asarray(f.evaluate_batch(xs, xc, p, gt), np.int64)
    P, n = ys.shape[:2]
    u1 = np.asarray(f.evaluate_batch(ys.reshape(P * n, gt.N, gt.N), yc.reshape(P * n, gt.N, gt.N), p, gt),
                    np.int64).reshape(P, n)
    return u0, u1


def best_yield(T, u0, u1, costs, mids, n_train: int = 64) -> dict:
    s0 = np.asarray(T.surprisal(u0), float)
    s1 = np.asarray(T.surprisal(u1.ravel()), float).reshape(u1.shape)
    ds = s1 - s0[None, :]
    tr, te = ds[:, :n_train].mean(1), ds[:, n_train:].mean(1)
    ytr, yte = tr / costs, te / costs
    order = np.argsort(-ytr)
    b = int(order[0])
    top5 = order[:5]
    return {"best": float(yte[b]), "best_train": float(ytr[b]), "top5": float(yte[top5].mean()),
            "tool": "+".join(mids[b]), "cost": float(costs[b]), "gain_bits": float(te[b]),
            "tools5": ["+".join(mids[int(j)]) for j in top5]}


# ------------------------------------------------------------------------------------------------
# driver
# ------------------------------------------------------------------------------------------------
def tables(draws, gt, prior, processes=4):
    spec = la.get_spec(prior)
    la.precompute(draws, gt, spec, processes=processes, verbose=True)
    return [la.survival(d, gt, spec) for d in draws]


def measure(gt: GridType, priors, context: str = "spawn", processes: int = 4, families=None) -> dict:
    draws = family_draws(gt, families)
    outs = program_outputs(gt, context)
    ords = [ordinals(d, gt, outs) for d in draws]
    uni = tables(draws, gt, "uniform", processes)
    res = {"gtype": gt.key, "context": context, "families": [d.family.id for d in draws],
           "camps": [d.family.camp for d in draws], "priors": {}}
    for pr in priors:
        T = tables(draws, gt, pr, processes)
        spec = la.get_spec(pr)
        q0 = 1.0 if spec.is_uniform else la.program_law(gt, spec).q[0]
        rows = []
        for d, t, tu, (u0, u1) in zip(draws, T, uni, ords):
            top = top_ordinal(d, gt, tu)
            by = best_yield(t, u0, u1, outs[4], outs[5])
            rows.append({"family": d.family.id, "camp": d.family.camp, "ceiling": float(t.surprisal(top)),
                         "ceiling_uniform": float(tu.surprisal(top)), "max_bits": t.max_observed_bits,
                         "body": t.meta.get("body_bits", float("nan")),
                         "mix_bound_excess": float(t.surprisal(top) - (tu.surprisal(top) - math.log2(q0))),
                         "se": float(t.stderr(top)), "recipe": t.meta.get("recipe"), **by})
        res["priors"][pr] = rows
        print(f"  {pr}: done", flush=True)
    return res


def gini(x):
    x = np.sort(np.clip(np.asarray(x, float), 0, None))
    if x.sum() <= 0:
        return 0.0
    n = len(x)
    return float((2 * np.arange(1, n + 1) - n - 1).dot(x) / (n * x.sum()))


def fairness_summary(rows) -> dict:
    y = np.array([r["best"] for r in rows])
    c = np.array([r["ceiling"] for r in rows])
    ly = np.log2(np.clip(y, 1e-3, None))
    lo, hi = np.quantile(np.clip(y, 1e-3, None), [0.05, 0.95])
    tools = Counter(r["tool"].split("+")[0] for r in rows)
    tools5 = Counter(t.split("+")[0] for r in rows for t in r["tools5"])
    camp = defaultdict(list)
    for r in rows:
        camp[r["camp"]].append(r["best"])
    return {"n": len(rows), "yield_median": float(np.median(y)), "yield_mean": float(y.mean()),
            "sd_log2_yield": float(ly.std()), "p95_p5_ratio": float(hi / lo), "gini_yield": gini(y),
            "starved_share": float((y < 0.02).mean()), "ceiling_median": float(np.median(c)),
            "ceiling_sd": float(c.std()), "ceiling_min": float(c.min()), "ceiling_max": float(c.max()),
            "distinct_best_tools": len(tools), "distinct_top5_tools": len(tools5),
            "camp_yield": {k: float(np.median(v)) for k, v in camp.items()},
            "mix_bound_violations": int(sum(r["mix_bound_excess"] > 2 * r["se"] + 0.5 for r in rows))}


def report(res: dict) -> str:
    from .validate import md
    pr = list(res["priors"])
    rows = []
    for p in pr:
        s = fairness_summary(res["priors"][p])
        rows.append([p, f"{s['ceiling_median']:.1f}", f"{s['ceiling_sd']:.1f}", f"{s['ceiling_min']:.1f}–{s['ceiling_max']:.1f}",
                     f"{s['yield_median']:.3f}", f"{s['sd_log2_yield']:.2f}", f"{s['p95_p5_ratio']:.1f}",
                     f"{s['gini_yield']:.2f}", f"{s['starved_share']:.2f}", s["distinct_best_tools"],
                     " ".join(f"{k[:4]} {v:.3f}" for k, v in sorted(s["camp_yield"].items())),
                     s["mix_bound_violations"]])
    head = (f"### {res['gtype']}, context {res['context']}, {len(res['families'])} families (one draw each)\n\n" +
            md(["prior", "ceiling median", "ceiling SD", "ceiling range", "best yield median", "SD log2 yield",
                "p95/p5", "Gini", "starved (<0.02)", "distinct best tools", "camp median yield", "mixture-bound violations"],
               rows))
    # per-family ceilings
    fam_rows = []
    for i, f in enumerate(res["families"]):
        fam_rows.append([f, res["camps"][i][:4]] + [f"{res['priors'][p][i]['ceiling']:.0f}" for p in pr] +
                        [f"{res['priors'][p][i]['best']:.3f}" for p in pr] +
                        [res["priors"][pr[-1]][i]["tool"]])
    fam = md(["family", "camp"] + [f"ceil {p}" for p in pr] + [f"yield {p}" for p in pr] + [f"tool ({pr[-1]})"], fam_rows)
    return head + "\n\n<details><summary>per family</summary>\n\n" + fam + "\n\n</details>\n"


def main(argv=None):
    ap = argparse.ArgumentParser(prog="gridlab.explore.priors.measure")
    ap.add_argument("--type", default="5,base10,rgby")
    ap.add_argument("--priors", default="uniform,reach1,reach2,reach4,beta.25,beta.5,levin,mix.5_reach2,mix.9_reach2")
    ap.add_argument("--context", default="spawn")
    ap.add_argument("--families", default="")
    ap.add_argument("--processes", type=int, default=4)
    ap.add_argument("--json", default="")
    a = ap.parse_args(argv)
    gt = parse_type(a.type)
    res = measure(gt, a.priors.split(","), a.context, a.processes, set(a.families.split(",")) - {""} or None)
    print(report(res))
    path = Path(a.json) if a.json else OUT / f"measure-{gt.key}-{a.context}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(res, default=str))
    print(f"saved {path}")


if __name__ == "__main__":
    main()
