"""Paired game-bootstrap CIs for fairness differences between priors (policy-dependent).

    python3 -m gridlab.explore.priors.fairdiff --seed 700000 --games 100 --priors uniform,levin,emp:0.5:1

Loads cached games (games.py / heldout.py; runs any that are missing) and, resampling whole games
(the same resample for every prior, since the games are paired), reports:
  family z SD     SD over families of the policy-adjusted mean rank score z (additive fit), families
                  with >= 8 god-slots; 0 = every family equally likely to win
  camp gap        mean z of clumpers minus alternators
with the difference against the first prior and its 95% interval.
"""
from __future__ import annotations

import argparse
from collections import defaultdict

import numpy as np

from ...experiments import common as C
from ...rules import by_id
from . import heldout  # noqa: F401  (registers `<name>*k` priors)
from . import games
from .validate import md


def stats(rows) -> tuple[float, float]:
    adj, _ = C.additive_fit(rows, iters=12)
    n = defaultdict(int)
    for r in rows:
        n[r["family"]] += 1
    z = np.array([v for k, v in adj.items() if n[k] >= 8])
    camp = defaultdict(list)
    for r in rows:
        camp[by_id(r["family"]).camp].append(r["z"])
    return float(z.std()), float(np.mean(camp["clumper"]) - np.mean(camp["alternator"]))


def run(priors, specs, B: int = 300) -> str:
    res = {p: games.run_batch(p, specs, verbose=False) for p in priors}
    rows = {p: C.god_rows(v) for p, v in res.items()}
    by_game = {p: defaultdict(list) for p in priors}
    for p in priors:
        for r in rows[p]:
            by_game[p][r["game"]].append(r)
    G = len(specs)
    rng = np.random.default_rng(1)
    boots = {p: [] for p in priors}
    for _ in range(B):
        pick = rng.integers(0, G, G)
        for p in priors:
            bs = [r for g in pick for r in by_game[p][g]]
            boots[p].append(stats(bs))
    base = priors[0]
    out = []
    b0 = np.array(boots[base])
    for p in priors:
        pt = stats(rows[p])
        bp = np.array(boots[p])
        d = bp - b0
        out.append([p, f"{pt[0]:.3f}", f"{np.mean(d[:, 0]):+.3f} [{np.quantile(d[:, 0], .025):+.3f}, {np.quantile(d[:, 0], .975):+.3f}]",
                    f"{pt[1]:.3f}", f"{np.mean(d[:, 1]):+.3f} [{np.quantile(d[:, 1], .025):+.3f}, {np.quantile(d[:, 1], .975):+.3f}]"])
    return md(["prior", "family z SD", f"Δ vs {base} (95% CI)", "camp gap clum − alt", f"Δ vs {base} (95% CI)"], out)


def main(argv=None):
    ap = argparse.ArgumentParser(prog="gridlab.explore.priors.fairdiff")
    ap.add_argument("--types", default="5,base10,rgby;4,base12,rgb")
    ap.add_argument("--games", type=int, default=100)
    ap.add_argument("--seed", type=int, default=700_000)
    ap.add_argument("--priors", default="uniform,reach2,beta.25,levin,mix.5_reach2,emp:0.5:1")
    ap.add_argument("--B", type=int, default=300)
    a = ap.parse_args(argv)
    specs = C.make_specs(a.types.split(";"), a.games, a.seed)
    print(f"{len(specs)} games, seeds from {a.seed}, {a.B} paired game-bootstrap resamples\n")
    print(run(a.priors.split(","), specs, a.B))


if __name__ == "__main__":
    main()
