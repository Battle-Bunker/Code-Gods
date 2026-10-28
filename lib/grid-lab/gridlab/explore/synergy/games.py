"""Validating dealers in full simulated games.

    python3 -m gridlab.explore.synergy.games --type 5,base10,rgby --games 200 --seed 1
    python3 -m gridlab.explore.synergy.games --type 5,base10,rgby --games 200 --seed 9000000   # held out

Each GameSpec (GridType, seed, number of gods, per-god policies; experiments.common.make_specs) is
played once per dealer: common random numbers, so dealer differences are paired. The dealer's family
list is passed to the simulator as dealer "fixed" (params are sampled by sim.deal). Everything else is
the engine default at 100 Hz (experiments.common.BASE), unless --config overrides it.

Per game we store experiments.common.ext_metrics plus:
  features      atlas-predicted features of the deal (dealers.FamilyMatrix.features)
  pairs         per god pair: atlas W (depth mean and per depth) and in-game statistics
                  d_corr     correlation of Δs_i and Δs_j over commits where either moves
                  opp        share of commits with Δs_i >= 1 and Δs_j <= -1 or the reverse
                  co_up      share of commits where both gain >= 1 bit
                  spirals_both  spirals (metrics.spirals) in which both gods' surprisal rose by >= 1 bit
                  pmi4       empirical PMI over snapshot objects of {s_i >= 4} and {s_j >= 4} (log2 ratio,
                             +0.5 smoothing)
                  s_corr     correlation of s_i and s_j over snapshot objects
Results are cached per (dealer, spec) under .cache/explore/synergy/games/.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import multiprocessing as mp
import os
import time
from collections import defaultdict
from typing import Sequence

import numpy as np

from ...experiments import common as C
from ...metrics import spirals
from ...sim import run_game, draws_for
from .atlas import CACHE, parse_type
from .dealers import DEALERS, FamilyMatrix, make_dealer

GAMES = CACHE / "games"
VERSION = 2


def pair_stats(log, i: int, j: int) -> dict:
    K = len(log.c_time)
    out = {}
    if K:
        d = (log.c_after - log.c_before).astype(float)
        di, dj = d[:, i], d[:, j]
        mv = (np.abs(di) > 1e-6) | (np.abs(dj) > 1e-6)
        if mv.sum() >= 5 and di[mv].std() > 1e-9 and dj[mv].std() > 1e-9:
            out["d_corr"] = float(np.corrcoef(di[mv], dj[mv])[0, 1])
        else:
            out["d_corr"] = 0.0
        out["opp"] = float((((di >= 1) & (dj <= -1)) | ((dj >= 1) & (di <= -1))).mean())
        out["co_up"] = float(((di >= 1) & (dj >= 1)).mean())
    else:
        out.update(d_corr=0.0, opp=0.0, co_up=0.0)
    S = np.concatenate([s.astype(float) for s in log.snap_s if len(s)]) if log.snap_s else np.zeros((0, log.n_gods))
    if len(S) >= 5:
        a, b = S[:, i] >= 4, S[:, j] >= 4
        n = len(S)
        out["pmi4"] = float(math.log2(((a & b).sum() + 0.5) * (n + 1) / ((a.sum() + 0.5) * (b.sum() + 0.5))))
        out["s_corr"] = float(np.corrcoef(S[:, i], S[:, j])[0, 1]) if S[:, i].std() > 1e-9 and S[:, j].std() > 1e-9 else 0.0
    else:
        out["pmi4"], out["s_corr"] = 0.0, 0.0
    return out


def spirals_both(log, G: int) -> np.ndarray:
    """(G, G) counts of spirals in which both gods' surprisal rose by >= 1 bit over the run."""
    M = np.zeros((G, G), int)
    if not len(log.c_time):
        return M
    sal_inc = (log.c_after - log.c_before).sum(1)
    order = np.lexsort((np.arange(len(log.c_obj)), log.c_obj))
    objs = log.c_obj[order]
    owner = log.a_owner[log.c_agent]
    bounds = np.flatnonzero(np.r_[True, objs[1:] != objs[:-1], True])
    for a, b in zip(bounds[:-1], bounds[1:]):
        idx = order[a:b]
        up = sal_inc[idx] > 1e-9
        k = 0
        while k < len(idx):
            if not up[k]:
                k += 1
                continue
            q = k
            while q < len(idx) and up[q]:
                q += 1
            run = idx[k:q]
            if len(run) >= 2 and len(set(owner[run].tolist())) >= 2:
                gain = log.c_after[run[-1]].astype(float) - log.c_before[run[0]].astype(float)
                g = np.flatnonzero(gain >= 1)
                for x in g:
                    for y in g:
                        if x < y:
                            M[x, y] += 1
                            M[y, x] += 1
            k = q
    return M


_J: list = []


def _key(dealer: str, st: dict, spec) -> str:
    return hashlib.sha256(json.dumps({"d": dealer, "k": C.game_key(st, spec), "v": VERSION}).encode()).hexdigest()[:40]


def _path(key: str):
    return GAMES / key[:2] / f"{key}.json"


def _worker(n: int):
    dealer, st, spec, key, feats, Wp = _J[n]
    cfg = C.config_for(st, spec)
    t0 = time.perf_counter()
    draws = draws_for(cfg)
    tables = C.tables_for(st, cfg, draws)
    log = run_game(cfg, tables=tables)
    r = C.ext_metrics(log, tables)
    for k in ("traj_t", "traj_payoff", "traj_mean_s", "bin_agents", "bin_commits", "bin_abs_dsal", "bin_net_dsal",
              "bin_owner_up", "summons_family", "top_spirals"):
        r.pop(k, None)
    G = log.n_gods
    sb = spirals_both(log, G)
    pairs = []
    for i in range(G):
        for j in range(i + 1, G):
            p = pair_stats(log, i, j)
            p.update(i=i, j=j, fi=log.families[i], fj=log.families[j], spirals_both=int(sb[i, j]),
                     W=Wp[(i, j)])
            pairs.append(p)
    r["pairs"] = pairs
    r["features"] = feats
    r["dealer"] = dealer
    r["seed"] = spec.seed
    r["spec_policies"] = list(spec.policies)
    r["wall_seconds"] = time.perf_counter() - t0
    p = _path(key)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(f".tmp{os.getpid()}")
    with open(tmp, "w") as fh:
        json.dump(r, fh, default=C._jsonable)
    os.replace(tmp, p)
    return n, r


def dealer_rng(dealer: str, spec) -> np.random.Generator:
    return np.random.default_rng([spec.seed, int(hashlib.sha256(dealer.encode()).hexdigest()[:8], 16)])


def run_dealers(gtype_s: str, specs: Sequence, dealers: Sequence[str], fm: FamilyMatrix, pool: Sequence[str],
                config: dict | None = None, processes: int = 4, verbose: bool = True,
                dealer_kw: dict | None = None) -> dict[str, list[dict]]:
    """{dealer: [result per spec]} (cached)."""
    global _J
    out: dict = {d: [None] * len(specs) for d in dealers}
    jobs = []
    for d in dealers:
        deal = make_dealer(d, fm, pool, **((dealer_kw or {}).get(d, {})))
        for s_i, spec in enumerate(specs):
            fams = deal(spec.n_gods, dealer_rng(d, spec))
            st = C.setting(config={**(config or {}), "dealer": "fixed", "fixed_families": list(fams)})
            key = _key(d, st, spec)
            p = _path(key)
            if p.exists():
                try:
                    with open(p) as fh:
                        out[d][s_i] = json.load(fh)
                    continue
                except Exception:
                    pass
            feats = fm.features(fams)
            Wp = {}
            for a in range(len(fams)):
                for b in range(a + 1, len(fams)):
                    ia, ib = fm.idx[fams[a]], fm.idx[fams[b]]
                    Wp[(a, b)] = [fm.w(fams[a], fams[b])] + [None if np.isnan(fm.W3[ia, ib, k]) else float(fm.W3[ia, ib, k])
                                                             for k in range(len(fm.depths))]
            jobs.append((d, st, spec, key, feats, Wp, s_i))
    if jobs:
        cfgs = [C.config_for(j[1], j[2]) for j in jobs]
        C.prepare(C.BASE, cfgs, processes, verbose)
        _J = [j[:6] for j in jobs]
        t0 = time.perf_counter()
        done = 0
        with mp.get_context("fork").Pool(processes) as pool_:
            for n, r in pool_.imap_unordered(_worker, range(len(jobs)), chunksize=1):
                out[jobs[n][0]][jobs[n][6]] = r
                done += 1
                if verbose and (done % 100 == 0 or done == len(jobs)):
                    print(f"  [games] {done}/{len(jobs)} ({time.perf_counter() - t0:.0f}s)", flush=True)
        _J = []
    return out


# ------------------------------------------------------------------------------------------------
# analysis
# ------------------------------------------------------------------------------------------------
METRICS = ["dynamism", "dynamism2", "tension_rate", "sig_tension_rate", "snap_tension", "spirals_per_100_commits",
           "spirals_big_per_100s", "spirals_accel_big_per_100s", "climbs_held_accel_per_100s", "lead_changes_per_100s",
           "crossings_per_pair_100s", "durable_lead_changes_per_obj_100s", "obj_hot_share", "payoff_gini",
           "top_object_share"]


def paired_diff(a: Sequence[float], b: Sequence[float], B: int = 1000, seed: int = 0) -> tuple[float, float, float]:
    d = np.asarray(a, float) - np.asarray(b, float)
    return C.boot_ci(d, B=B, seed=seed)


def spearman(x, y) -> float:
    x, y = np.asarray(x, float), np.asarray(y, float)
    ok = ~np.isnan(x) & ~np.isnan(y)
    if ok.sum() < 5:
        return float("nan")
    rx = np.argsort(np.argsort(x[ok])).astype(float)
    ry = np.argsort(np.argsort(y[ok])).astype(float)
    if rx.std() < 1e-9 or ry.std() < 1e-9:
        return float("nan")
    return float(np.corrcoef(rx, ry)[0, 1])


def boot_corr(x, y, B: int = 500, seed: int = 0, groups=None) -> tuple[float, float, float]:
    """Spearman correlation with a bootstrap CI (resampling groups, e.g. games, when given)."""
    x, y = np.asarray(x, float), np.asarray(y, float)
    pt = spearman(x, y)
    r = np.random.default_rng(seed)
    if groups is None:
        groups = np.arange(len(x))
    groups = np.asarray(groups)
    ug = np.unique(groups)
    members = {g: np.flatnonzero(groups == g) for g in ug}
    bs = []
    for _ in range(B):
        pick = r.choice(ug, len(ug))
        idx = np.concatenate([members[g] for g in pick])
        bs.append(spearman(x[idx], y[idx]))
    bs = np.array([b for b in bs if not np.isnan(b)])
    return pt, float(np.quantile(bs, 0.025)) if len(bs) else float("nan"), float(np.quantile(bs, 0.975)) if len(bs) else float("nan")


def analyse(res: dict[str, list[dict]], gtype_s: str, title: str = "") -> tuple[str, dict]:
    L = [f"### Dealers on {parse_type(gtype_s).key}{(' — ' + title) if title else ''}", ""]
    dealers = list(res)
    n = len(next(iter(res.values())))
    for rs in res.values():
        C.add_dyn2(rs)
    L.append(f"{n} game specs per dealer (paired). Mean [95% bootstrap CI]; Δ vs uniform is the paired difference.")
    L.append("")
    show = ["dynamism2", "dynamism", "sig_tension_rate", "snap_tension", "spirals_per_100_commits",
            "climbs_held_accel_per_100s", "crossings_per_pair_100s", "durable_lead_changes_per_obj_100s",
            "obj_hot_share", "payoff_gini"]
    L.append("| dealer | " + " | ".join(show) + " | z_sd_excess | share_unfair |")
    L.append("|---|" + "---|" * (len(show) + 2))
    summary = {}
    base = res.get("uniform")
    for d in dealers:
        rs = res[d]
        cells = []
        summary[d] = {}
        for k in show:
            v = [r[k] for r in rs]
            pt, lo, hi = C.boot_ci(v, B=500)
            summary[d][k] = (pt, lo, hi)
            if base is not None and d != "uniform":
                dp, dl, dh = paired_diff(v, [r[k] for r in base])
                summary[d]["Δ" + k] = (dp, dl, dh)
                star = "**" if (dl > 0 or dh < 0) else ""
                cells.append(f"{pt:.3g} ({star}{dp:+.3g}{star})")
            else:
                cells.append(f"{pt:.3g} [{lo:.3g}, {hi:.3g}]")
        ff = C.family_fairness(C.god_rows(rs), B=100, min_n=8)
        summary[d]["fair"] = {"z_sd_excess": ff["z_sd_excess"], "share_unfair": ff["share_unfair"],
                              "n_families": ff["n_families"], "families": ff["families"]}
        cells += [f"{ff['z_sd_excess']:.3f}", f"{ff['share_unfair']:.2f} ({ff['n_families']})"]
        L.append(f"| {d} | " + " | ".join(cells) + " |")
    L.append("")
    L.append("Cells: mean (paired Δ vs uniform; **bold** when the 95% CI excludes 0). z_sd_excess: spread of "
             "policy-adjusted family strength beyond noise (0 = all families equally strong); share_unfair: "
             "families (with ≥ 8 god-slots) whose mean z CI excludes 0.5.")
    L.append("")
    # translation: game-level
    allr = [r for d in dealers for r in res[d]]
    gid = [f"{r['seed']}" for r in allr]
    L.append("**Does the atlas predict the game?** Spearman ρ [95% CI, bootstrap over specs], all dealers pooled "
             f"({len(allr)} games):")
    L.append("")
    feats = ["W_mean_mean", "W_mean_min", "W_mean_var", "W_mean_rivals", "W_mean_allies", "W_d8_mean", "W_d24_mean"]
    outs = ["sig_tension_rate", "snap_tension", "spirals_per_100_commits", "climbs_held_accel_per_100s",
            "crossings_per_pair_100s", "dynamism2"]
    L.append("| feature | " + " | ".join(outs) + " |")
    L.append("|---|" + "---|" * len(outs))
    trans = {}
    for f in feats:
        x = [r["features"][f] / (r["n_gods"] * (r["n_gods"] - 1) / 2) if f.endswith(("rivals", "allies")) else r["features"][f]
             for r in allr]
        row = []
        for o in outs:
            pt, lo, hi = boot_corr(x, [r[o] for r in allr], B=300, groups=gid)
            trans[(f, o)] = (pt, lo, hi)
            row.append(f"{pt:+.2f} [{lo:+.2f}, {hi:+.2f}]")
        L.append(f"| {f} | " + " | ".join(row) + " |")
    L.append("")
    # translation: pair-level
    P = [(p, r["seed"]) for r in allr for p in r["pairs"]]
    L.append(f"Pair level ({len(P)} god pairs): Spearman ρ between atlas W of the pair and in-game pair statistics "
             "[95% CI, bootstrap over specs]:")
    L.append("")
    pstats = ["d_corr", "opp", "co_up", "spirals_both", "pmi4", "s_corr"]
    L.append("| atlas W | " + " | ".join(pstats) + " |")
    L.append("|---|" + "---|" * len(pstats))
    pair_tr = {}
    for wi, wn in enumerate(["depth mean", "8 bits", "16 bits", "24 bits"]):
        x = [np.nan if p["W"][wi] is None else p["W"][wi] for p, _ in P]
        row = []
        for s in pstats:
            pt, lo, hi = boot_corr(x, [p[s] for p, _ in P], B=300, groups=[g for _, g in P])
            pair_tr[(wn, s)] = (pt, lo, hi)
            row.append(f"{pt:+.2f} [{lo:+.2f}, {hi:+.2f}]")
        L.append(f"| {wn} | " + " | ".join(row) + " |")
    L.append("")
    return "\n".join(L), {"summary": summary, "trans": {f"{a}|{b}": v for (a, b), v in trans.items()},
                          "pair": {f"{a}|{b}": v for (a, b), v in pair_tr.items()}}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--type", default="5,base10,rgby")
    ap.add_argument("--games", type=int, default=200)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--mix", default="mixed")
    ap.add_argument("--dealers", default=",".join(DEALERS))
    ap.add_argument("--exclude", default="", help="family ids never dealt (comma-separated)")
    ap.add_argument("--config", default="{}", help="JSON GameConfig overrides")
    ap.add_argument("--processes", type=int, default=os.cpu_count() or 4)
    ap.add_argument("--tag", default="main")
    ap.add_argument("--out", default="")
    a = ap.parse_args(argv)
    fm = FamilyMatrix(a.type, a.tag)
    gt = parse_type(a.type)
    excl = set(x for x in a.exclude.split(",") if x)
    from ...rules import FAMILIES
    pool = [f.id for f in FAMILIES if f.available(gt) and f.id not in excl]
    specs = C.make_specs([a.type], a.games, a.seed, a.mix)
    res = run_dealers(a.type, specs, a.dealers.split(","), fm, pool, json.loads(a.config), a.processes)
    txt, data = analyse(res, a.type, f"seed {a.seed}, mix {a.mix}" + (f", excluding {len(excl)}" if excl else ""))
    print(txt)
    if a.out:
        with open(CACHE / a.out, "w") as fh:
            json.dump({"text": txt, "data": data}, fh, default=C._jsonable)


if __name__ == "__main__":
    main()
