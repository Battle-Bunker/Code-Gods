"""Held-out confirmation games, plus unit-rescaled priors.

    python3 -m gridlab.explore.priors.heldout --seed 800000 --games 60 \
        --priors "uniform,levin,mix.5_reach2,emp:0.5:1,emp:0.5:1*2.1,emp:0.9:1"

Same as games.py (which this reuses) on fresh seeds. Adds prior names of the form `<name>*<k>`:
every surprisal multiplied by k. That is a pure change of units for the policies (they rank
programs by yield and summon when yield > 0, so their choices are scale-free up to the energy
trade-off), while metrics with absolute bit thresholds (objects >= 20 bits, >= 2-bit tension steps,
>= 8-bit climbs) see the rescaled magnitudes. Comparing `emp:0.5:1` with `emp:0.5:1*2.1` separates
real changes in game dynamics from the empirical prior compressing bits.
(`*k` is registered here, by wrapping games.provider, so games.py and its caches stay untouched.)
"""
from __future__ import annotations

import argparse

from ... import calibrate as cal
from ...experiments import common as C
from . import games

_BASE_PROVIDER = games.provider
_SCALED: dict = {}


def provider(prior: str):
    if "*" not in prior:
        return _BASE_PROVIDER(prior)
    base, k = prior.rsplit("*", 1)
    k = float(k)
    btag, btab, bpre = _BASE_PROVIDER(base)

    def table(d, gt):
        t = btab(d, gt)
        key = (t.key, k)
        if key not in _SCALED:
            lv = t.levels
            lp = t.log2p if t.exact is None else t.log2_tail(lv)
            _SCALED[key] = cal.Survival(f"{t.key}*{k}", lv, lp * k, t.stderr_bits * k, t.extra_levels,
                                        dict(t.meta, scale=k))
        return _SCALED[key]
    return f"{btag}*{k}", table, bpre


games.provider = provider


def main(argv=None):
    ap = argparse.ArgumentParser(prog="gridlab.explore.priors.heldout")
    ap.add_argument("--types", default="5,base10,rgby;4,base12,rgb")
    ap.add_argument("--games", type=int, default=60)
    ap.add_argument("--seed", type=int, default=800_000)
    ap.add_argument("--priors", default="uniform,levin,mix.5_reach2,emp:0.5:1,emp:0.5:1*2.1,emp:0.9:1")
    ap.add_argument("--processes", type=int, default=4)
    a = ap.parse_args(argv)
    types = a.types.split(";")
    specs = C.make_specs(types, a.games, a.seed)
    res = {p: games.run_batch(p, specs, processes=a.processes) for p in a.priors.split(",")}
    print(f"### Held-out: {len(specs)} games ({a.games} per GridType: {', '.join(types)}), seeds from {a.seed}\n")
    print(games.compare(res))


if __name__ == "__main__":
    main()
