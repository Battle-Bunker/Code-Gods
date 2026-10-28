"""Atlas-driven dealers: schemes that pick which families the gods in a game get.

Every dealer returns G distinct family ids (G <= pool size), deterministically from its rng.
Params are then sampled by sim.deal (dealer "fixed"), so dealers act on families, not draws.

  uniform         distinct families uniformly at random (= sim dealer "distinct")
  hand_camps      round-robin over the hand-made camps (clumper / alternator / neutral)
                  (= sim dealer "balanced_camps")
  atlas_camps     round-robin over the atlas camps (clusters of the family matrix)
  cross_layer     at least one colour-only and one symbol-only family (rest uniform)
  ally_rival      every god has >= 1 ally (W >= +a) and >= 1 rival (W <= -a) among the others
                  (rejection sampling, up to 400 tries; else the deal with the most satisfied gods)
  max_var         best of 32 uniform deals by the variance of the pairwise W (strong allies and rivals)
  baron           Border Baron always dealt (a structure-feeding parasite), rest uniform
  aligned         best of 32 by mean pairwise W   (probe: a friendly table; not a recommendation)
  hostile         worst of 32 by mean pairwise W  (probe: a hostile table)

W is the family-level atlas matrix at one depth (default: the depth average), read from the JSON
written by `camps --json`. Pairs that the atlas could not measure (a family that never reaches the
depth) count as 0 (orthogonal).
"""
from __future__ import annotations

import json
from typing import Callable, Sequence

import numpy as np

from .atlas import CACHE, parse_type


class FamilyMatrix:
    def __init__(self, gtype_s: str, tag: str = "main", depth: str | int = "mean"):
        gt = parse_type(gtype_s)
        p = CACHE / f"family_matrix_{gt.size}_{gt.symbols}_{gt.colours}_{tag}.json"
        with open(p) as fh:
            d = json.load(fh)
        self.fams: list[str] = d["fams"]
        self.idx = {f: k for k, f in enumerate(self.fams)}
        W = np.array([[[np.nan if x is None else x for x in r2] for r2 in r1] for r1 in d["W"]], float)
        self.W3 = W
        self.depths = d["depths"]
        with np.errstate(invalid="ignore"):
            self.W = np.nanmean(W, axis=2) if depth == "mean" else W[:, :, int(depth)]
        self.W = np.nan_to_num(self.W)
        np.fill_diagonal(self.W, 0.0)
        self.clusters = d["clusters"]
        self.camp = d["camp"]
        self.layer = d["layer"]

    def w(self, a: str, b: str) -> float:
        return float(self.W[self.idx[a], self.idx[b]])

    def pairs(self, fams: Sequence[str]) -> np.ndarray:
        ix = [self.idx[f] for f in fams]
        sub = self.W[np.ix_(ix, ix)]
        return sub[np.triu_indices(len(ix), 1)]

    def features(self, fams: Sequence[str]) -> dict:
        """Atlas-predicted table features of a deal (per depth and depth-averaged)."""
        ix = [self.idx[f] for f in fams]
        out = {}
        for name, M in [("mean", self.W)] + [(f"d{b:g}", np.nan_to_num(self.W3[:, :, k]))
                                              for k, b in enumerate(self.depths)]:
            sub = M[np.ix_(ix, ix)]
            v = sub[np.triu_indices(len(ix), 1)]
            out[f"W_{name}_mean"] = float(v.mean())
            out[f"W_{name}_min"] = float(v.min())
            out[f"W_{name}_max"] = float(v.max())
            out[f"W_{name}_var"] = float(v.var())
            out[f"W_{name}_allies"] = int((v >= 2).sum())
            out[f"W_{name}_rivals"] = int((v <= -2).sum())
            out[f"W_{name}_neg_sum"] = float(np.clip(-v, 0, None).sum())
            out[f"W_{name}_pos_sum"] = float(np.clip(v, 0, None).sum())
        return out


def _uniform(pool: Sequence[str], G: int, rng) -> list[str]:
    return [pool[i] for i in rng.permutation(len(pool))[:G]]


def _round_robin(groups: dict, G: int, rng) -> list[str]:
    names = sorted(groups)
    names = [names[i] for i in rng.permutation(len(names))]
    decks = {c: [groups[c][i] for i in rng.permutation(len(groups[c]))] for c in names}
    out, k = [], 0
    while len(out) < G:
        c = names[k % len(names)]
        f = decks[c][(k // len(names)) % len(decks[c])]
        if f not in out:
            out.append(f)
        k += 1
        if k > 10 * G * len(names):
            break
    return out


def make_dealer(name: str, fm: FamilyMatrix, pool: Sequence[str], a: float = 2.0, tries: int = 32,
                baron: str = "border_baron") -> Callable[[int, np.random.Generator], list[str]]:
    pool = [f for f in pool if f in fm.idx]

    if name == "uniform":
        return lambda G, rng: _uniform(pool, G, rng)
    if name in ("hand_camps", "atlas_camps"):
        groups: dict = {}
        for f in pool:
            k = fm.idx[f]
            groups.setdefault(fm.camp[k] if name == "hand_camps" else fm.clusters[k], []).append(f)
        return lambda G, rng: _round_robin(groups, G, rng)
    if name == "cross_layer":
        cs = [f for f in pool if fm.layer[fm.idx[f]] == "C"]
        ss = [f for f in pool if fm.layer[fm.idx[f]] == "S"]

        def deal(G, rng):
            first = [cs[int(rng.integers(len(cs)))], ss[int(rng.integers(len(ss)))]]
            rest = [f for f in pool if f not in first]
            out = first + _uniform(rest, G - 2, rng)
            return [out[i] for i in rng.permutation(len(out))]
        return deal
    if name == "baron":
        def deal(G, rng):
            rest = [f for f in pool if f != baron]
            out = [baron] + _uniform(rest, G - 1, rng)
            return [out[i] for i in rng.permutation(len(out))]
        return deal
    if name == "ally_rival":
        def ok_count(fams):
            ix = [fm.idx[f] for f in fams]
            sub = fm.W[np.ix_(ix, ix)].copy()
            np.fill_diagonal(sub, 0.0)
            return int(((sub >= a).any(1) & (sub <= -a).any(1)).sum())

        def deal(G, rng):
            best, bs = None, -1
            for _ in range(400):
                d = _uniform(pool, G, rng)
                s = ok_count(d)
                if s == G:
                    return d
                if s > bs:
                    best, bs = d, s
            return best
        return deal
    if name in ("max_var", "aligned", "hostile"):
        key = {"max_var": lambda v: v.var(), "aligned": lambda v: v.mean(), "hostile": lambda v: -v.mean()}[name]

        def deal(G, rng):
            cands = [_uniform(pool, G, rng) for _ in range(tries)]
            return max(cands, key=lambda d: key(fm.pairs(d)))
        return deal
    raise ValueError(name)


DEALERS = ("uniform", "hand_camps", "atlas_camps", "cross_layer", "ally_rival", "max_var", "baron",
           "aligned", "hostile")
