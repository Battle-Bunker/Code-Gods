"""Empirical game-theoretic analysis: a heuristic payoff table over every composition of G = 4 gods
drawn from S strategies, then replicator dynamics on the population game it defines.

    python3 -m gridlab.explore.players.egta --types "5,base10,rgby" --seeds 0:8 \
        --strategies greedy_private,saver,k32_bar,ridge,planner,parasite

For each multiset composition c (C(S+3, 4) of them) and seed, the seats are a seed-dependent
permutation of c. Payoff to strategy s in c = mean z (rank score, 0.5 = average) of its gods.
The population game: a god of strategy s meets G − 1 opponents drawn iid from the population mix x,
so f_s(x) = Σ_c' Multinomial(c'; G−1, x) · H[c' + s][s]. Replicator dynamics x_s' = x_s (f_s − x·f)
are run from many Dirichlet starts; end states are reported with their basin share and the Nash
regret max_s f_s − x·f. A bootstrap over seeds gives the stability of the attractor.
"""
from __future__ import annotations

import argparse
import itertools
import json
import math
from collections import Counter, defaultdict

import numpy as np

from .tournament import Match, md_table, run_matches, setting


def compositions(S: int, G: int):
    return list(itertools.combinations_with_replacement(range(S), G))


def matches_for(gtypes, seeds, strategies, G: int = 4):
    out = []
    for gt in gtypes:
        for c in compositions(len(strategies), G):
            for seed in seeds:
                r = np.random.default_rng([int(seed), 4242])
                seats = [strategies[k] for k in np.array(c)[r.permutation(G)]]
                out.append(Match(gt, int(seed), tuple(seats)))
    return out


def table(results, strategies, metric: str = "z"):
    """{composition tuple of strategy indices: {s index: list of per-game mean metric}}"""
    ix = {s: k for k, s in enumerate(strategies)}
    H = defaultdict(lambda: defaultdict(list))
    for r in results:
        pol = r["match"]["policies"]
        c = tuple(sorted(ix[p] for p in pol))
        per = defaultdict(list)
        for g, p in zip(r["gods"], pol):
            per[ix[p]].append(g[metric])
        for s, v in per.items():
            H[c][s].append(float(np.mean(v)))
    return H


def payoff_fn(H, S: int, G: int, rng=None):
    """Mean (or, with rng, bootstrap-resampled) payoff table -> function x -> f(x)."""
    Hm = {}
    for c, d in H.items():
        Hm[c] = {}
        for s, v in d.items():
            v = np.asarray(v)
            Hm[c][s] = float(v[rng.integers(0, len(v), len(v))].mean()) if rng is not None else float(v.mean())
    others = compositions(S, G - 1)
    E = np.zeros((len(others), S))
    for o, oc in enumerate(others):
        for k in oc:
            E[o, k] += 1
    coef = np.array([math.factorial(G - 1) / np.prod([math.factorial(int(n)) for n in e]) for e in E])
    Hmat = np.full((S, len(others)), 0.5)
    for s in range(S):
        for o, oc in enumerate(others):
            c = tuple(sorted(oc + (s,)))
            if c in Hm and s in Hm[c]:
                Hmat[s, o] = Hm[c][s]

    def f(x):
        pr = coef * np.prod(np.asarray(x, float)[None, :] ** E, axis=1)
        return Hmat @ pr
    return f


def replicator(f, x0, steps: int = 3000, dt: float = 0.5):
    x = np.asarray(x0, float)
    for _ in range(steps):
        fx = f(x)
        x = x * (1 + dt * (fx - x @ fx))
        x = np.clip(x, 0, None)
        x /= x.sum()
    fx = f(x)
    return x, float(fx.max() - x @ fx)


def attractors(f, S: int, n_starts: int = 40, seed: int = 0, steps: int = 3000):
    r = np.random.default_rng(seed)
    starts = [np.full(S, 1.0 / S)] + [r.dirichlet(np.ones(S)) for _ in range(n_starts - 1)]
    ends = []
    for x0 in starts:
        x, reg = replicator(f, x0, steps)
        ends.append((np.round(x, 2), reg))
    groups = defaultdict(list)
    for x, reg in ends:
        groups[tuple(x)].append(reg)
    return sorted(((np.array(k), len(v) / len(ends), max(v)) for k, v in groups.items()), key=lambda t: -t[1])


def describe(x, strategies, thr: float = 0.02) -> str:
    return ", ".join(f"{s} {v:.2f}" for s, v in sorted(zip(strategies, x), key=lambda t: -t[1]) if v >= thr)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--types", default="5,base10,rgby")
    ap.add_argument("--seeds", default="0:8")
    ap.add_argument("--strategies", default="greedy_private,saver,k32_bar,ridge,planner,parasite")
    ap.add_argument("--metric", default="z", help="z (rank score) or share (payoff / mean payoff)")
    ap.add_argument("--config", default="{}")
    ap.add_argument("--knobs", default="{}")
    ap.add_argument("--boot", type=int, default=30)
    ap.add_argument("--processes", type=int, default=4)
    ap.add_argument("--json", default="")
    a = ap.parse_args(argv)
    S_ = a.strategies.split(",")
    S, G = len(S_), 4
    lo, hi = map(int, a.seeds.split(":"))
    st = setting(config=json.loads(a.config), knobs=json.loads(a.knobs))
    ms = matches_for(a.types.split(";"), range(lo, hi), S_)
    rs = run_matches(ms, st, a.processes, label="egta")
    H = table(rs, S_, a.metric)
    f = payoff_fn(H, S, G)
    print(f"{len(rs)} games, {len(H)} compositions, metric {a.metric}\n")
    # payoff against homogeneous fields and in the uniform mix
    rows = [[s, f"{f(np.full(S, 1.0 / S))[k]:.3f}"] + [f"{np.mean(H[tuple(sorted((j,) * (G - 1) + (k,)))][k]):.2f}"
                                                        for j in range(S)] for k, s in enumerate(S_)]
    print(md_table(["strategy", "f(uniform mix)"] + [f"vs 3×{s}" for s in S_], rows))
    print("\nReplicator attractors (basin share, Nash regret):")
    att = attractors(f, S)
    for x, share, reg in att:
        print(f"  {share:.2f}  regret {reg:.3f}  {describe(x, S_)}")
    if a.boot:
        r = np.random.default_rng(1)
        tops = Counter()
        mean_x = np.zeros(S)
        for b in range(a.boot):
            fb = payoff_fn(H, S, G, rng=r)
            x, _ = replicator(fb, np.full(S, 1.0 / S))
            mean_x += x / a.boot
            tops[S_[int(np.argmax(x))]] += 1
        print(f"\nBootstrap over seeds ({a.boot}×, uniform start): mean end state {describe(mean_x, S_)}; "
              f"largest share: " + ", ".join(f"{k} {v}/{a.boot}" for k, v in tops.most_common()))
    if a.json:
        with open(a.json, "w") as fh:
            json.dump({"strategies": S_, "H": {str(k): {S_[s]: v for s, v in d.items()} for k, d in H.items()},
                       "attractors": [(x.tolist(), sh, reg) for x, sh, reg in att]}, fh)


if __name__ == "__main__":
    main()
