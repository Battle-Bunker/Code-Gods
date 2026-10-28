"""Round robin "one mutant in a field": for every ordered pair (mutant s, incumbent t), 4-god games with
one s and three t, on shared seeds (the mutant's seat rotates with the seed). The diagonal (s = t) is
the homogeneous population.

    python3 -m gridlab.explore.players.invasion --types "5,base10,rgby" --seeds 0:16 \
        --strategies random,greedy_private,saver,k32,afford,ridge,bandit,copycat,planner,parasite

Outputs (markdown to stdout, JSON with --json):
  * invasion fitness I[s, t] = mean over seeds of z(mutant s in field t) − z(a t player in field t at
    the same seat), paired by seed; > 0 means s invades t. z = (G − rank)/(G − 1), 0.5 = average.
  * mean payoff share of the mutant; homogeneous-population dynamism and welfare per strategy.
  * replicator dynamics on the pairwise payoff matrix A[s, t] = E z(s | field t).
"""
from __future__ import annotations

import argparse
import json

import numpy as np

from .tournament import Match, fmt_ci, md_table, mean_ci, run_matches, setting


def matches_for(gtypes, seeds, strategies, incumbents=None, G: int = 4):
    incumbents = incumbents or strategies
    out = []
    for gt in gtypes:
        for seed in seeds:
            seat = seed % G
            for t in incumbents:
                for s in strategies:
                    pol = [t] * G
                    pol[seat] = s
                    out.append(Match(gt, int(seed), tuple(pol)))
    return out


def analyse(results, strategies, incumbents=None, G: int = 4):
    incumbents = incumbents or strategies
    by = {}
    for r in results:
        m = r["match"]
        seat = m["seed"] % G
        pol = m["policies"]
        t = [p for k, p in enumerate(pol) if k != seat][0]
        s = pol[seat]
        by[(m["gtype"], m["seed"], s, t)] = r
    S, T = len(strategies), len(incumbents)
    Z = np.full((S, T), np.nan); I = np.full((S, T), np.nan); SH = np.full((S, T), np.nan)
    Ilo = np.full((S, T), np.nan); Ihi = np.full((S, T), np.nan)
    keys = sorted({(k[0], k[1]) for k in by})
    for a, s in enumerate(strategies):
        for b, t in enumerate(incumbents):
            z, d, sh = [], [], []
            for gt, seed in keys:
                r = by.get((gt, seed, s, t))
                r0 = by.get((gt, seed, t, t))
                if r is None:
                    continue
                seat = seed % G
                z.append(r["gods"][seat]["z"])
                sh.append(r["gods"][seat]["share"])
                if r0 is not None:
                    d.append(r["gods"][seat]["z"] - r0["gods"][seat]["z"])
            if z:
                Z[a, b], SH[a, b] = np.mean(z), np.mean(sh)
            if d:
                I[a, b], Ilo[a, b], Ihi[a, b] = mean_ci(d)
    homo = {}
    for t in incumbents:
        rs = [by[(gt, seed, t, t)] for gt, seed in keys if (gt, seed, t, t) in by]
        if rs:
            homo[t] = {k: mean_ci([r[k] for r in rs]) for k in
                       ("dynamism2", "dynamism", "welfare", "sig_tension_rate", "spirals_per_100_commits",
                        "climbs_held_accel_per_100s", "snap_tension", "crossings_per_pair_100s", "mutator_entropy_norm",
                        "energy_unspent_share", "steal_rate", "agents", "commits")}
            homo[t]["n"] = len(rs)
    return {"Z": Z, "I": I, "Ilo": Ilo, "Ihi": Ihi, "share": SH, "homo": homo, "n_seeds": len(keys)}


def replicator(A: np.ndarray, x0=None, steps: int = 20000, dt: float = 0.01) -> np.ndarray:
    """Discrete replicator dynamics x_s' = x_s (f_s − f̄) with f = A x (pairwise approximation)."""
    S = A.shape[0]
    x = np.full(S, 1.0 / S) if x0 is None else np.asarray(x0, float)
    for _ in range(steps):
        f = A @ x
        x = x + dt * x * (f - x @ f)
        x = np.clip(x, 0, None)
        x /= x.sum()
    return x


def report(res, strategies, incumbents=None) -> str:
    incumbents = incumbents or strategies
    out = [f"seeds per cell: {res['n_seeds']}", "", "Invasion fitness I[s, t] (rows: mutant s; cols: field t; "
           "Δz vs an incumbent at the same seat; * = 95% CI excludes 0):", ""]
    rows = []
    for a, s in enumerate(strategies):
        row = [s]
        for b, t in enumerate(incumbents):
            v, lo, hi = res["I"][a, b], res["Ilo"][a, b], res["Ihi"][a, b]
            row.append("·" if s == t else f"{v:+.2f}{'*' if (lo > 0 or hi < 0) else ''}")
        rows.append(row)
    out.append(md_table(["mutant \\ field"] + list(incumbents), rows))
    out += ["", "Mutant mean z in field (0.5 = average):", ""]
    out.append(md_table(["mutant \\ field"] + list(incumbents),
                        [[s] + [f"{res['Z'][a, b]:.2f}" for b in range(len(incumbents))] for a, s in enumerate(strategies)]))
    if list(strategies) == list(incumbents):
        A = res["Z"]
        x = replicator(np.nan_to_num(A, nan=0.5))
        out += ["", "Replicator dynamics (pairwise approximation, uniform start) end state: " +
                ", ".join(f"{s} {v:.2f}" for s, v in sorted(zip(strategies, x), key=lambda t: -t[1]) if v > 0.005)]
        inv = res["I"]
        ess = [t for b, t in enumerate(incumbents)
               if all(not (res["Ilo"][a, b] > 0) for a in range(len(strategies)) if strategies[a] != t)]
        out.append("Not invaded by any mutant at 95%: " + (", ".join(ess) or "none"))
    out += ["", "Homogeneous populations (all four gods play t):", ""]
    ks = ["dynamism2", "dynamism", "welfare", "sig_tension_rate", "climbs_held_accel_per_100s", "crossings_per_pair_100s",
          "mutator_entropy_norm", "steal_rate", "energy_unspent_share", "agents"]
    rows = []
    for t, h in res["homo"].items():
        rows.append([t] + [fmt_ci(h[k], 3 if k not in ("welfare", "agents") else 0) for k in ks])
    out.append(md_table(["population"] + ks, rows))
    return "\n".join(out)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--types", default="5,base10,rgby")
    ap.add_argument("--seeds", default="0:16")
    ap.add_argument("--strategies", default="random,greedy_private,saver,k32,afford,ridge,bandit,copycat,planner,parasite")
    ap.add_argument("--incumbents", default="")
    ap.add_argument("--config", default="{}", help="JSON GameConfig overrides on top of the 100 Hz engine defaults")
    ap.add_argument("--knobs", default="{}")
    ap.add_argument("--processes", type=int, default=4)
    ap.add_argument("--json", default="")
    a = ap.parse_args(argv)
    S = a.strategies.split(",")
    T = a.incumbents.split(",") if a.incumbents else S
    lo, hi = map(int, a.seeds.split(":"))
    st = setting(config=json.loads(a.config), knobs=json.loads(a.knobs))
    ms = matches_for(a.types.split(";"), range(lo, hi), S, T)
    rs = run_matches(ms, st, a.processes, label="invasion")
    res = analyse(rs, S, T)
    print(report(res, S, T))
    if a.json:
        with open(a.json, "w") as fh:
            json.dump({k: (v.tolist() if isinstance(v, np.ndarray) else v) for k, v in res.items()}, fh)


if __name__ == "__main__":
    main()
