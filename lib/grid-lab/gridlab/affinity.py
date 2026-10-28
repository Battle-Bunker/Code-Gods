"""Empirical mutator x family affinity probe (mutator worker).

    python3 -m gridlab.affinity [--size 5 --symbols base10 --colours rgby --k 16 --draws 3]

For each family available in the GridType, and each mutator, this estimates how much one single-step agent
built from that mutator helps a god holding that family when the agent is applied to fresh spawns:

  1. draw the family's params (a god), estimate an EMPIRICAL surprisal s(t) = -log2((#{u >= t} + 1)/(n + 1))
     from n = 4096 prior samples (so it is capped at 12 bits, and it is NOT the engine's calibrated
     surprisal: it under-rates rare jumps);
  2. sample k parameter settings of the mutator and keep the one with the best mean Δs on training grids
     (an agent's params are fixed at summon time, so we pick per agent, not per object);
  3. report its mean Δs on held-out grids, averaged over draws, and the yield Δs / cost (bits per bit).

Fresh spawns are the worst case for bijections (they cannot raise expected surprisal on the prior at all,
see docs/mutators.md), so bijections show ~0 here; their value appears on objects other gods have
already structured, which this probe does not model.
"""
from __future__ import annotations

import argparse
import importlib
import pkgutil

import numpy as np

from .core import Grid, GridType, spawn_batch
from .family import ordinal_keys
from .mutators import available


def load_families() -> list:
    try:
        from .rules import FAMILIES  # type: ignore
        return list(FAMILIES)
    except Exception:
        fams = []
        from . import rules
        for mod in pkgutil.iter_modules(rules.__path__):
            if mod.name.startswith("_"):
                continue
            fams += list(getattr(importlib.import_module(f".rules.{mod.name}", __package__), "FAMILIES", []))
        return fams


def _surprisal_fn(fam, params, gt, rng, n=4096):
    s, c = spawn_batch(gt, rng, n)
    ref = np.sort(fam.evaluate_keys(s, c, params, gt))

    def f(u):  # u: a batch of ordinals, (B,) or (B, k)
        ge = n - np.searchsorted(ref, ordinal_keys(u), side="left")
        return -np.log2((ge + 1) / (n + 1))
    return f


def _structure(gt, rng, sym, col, edits=3):
    """'structured' context: each grid first receives `edits` random overwrite steps (a crude stand-in
    for a world that other gods' agents have already worked on)."""
    over = [m for m in available(gt) if not m.bijective]
    out = []
    for a, b in zip(sym, col):
        g = Grid(a, b)
        for _ in range(edits):
            m = over[int(rng.integers(len(over)))]
            g = m.apply(g, m.sample(rng, gt), gt) or g
        out.append(g)
    return np.array([g.sym for g in out]), np.array([g.col for g in out])


def probe(gt: GridType, k: int = 16, draws: int = 3, train: int = 24, test: int = 48, seed: int = 0,
          families=None, mutators=None, context: str = "fresh"):
    rng = np.random.default_rng(seed)
    fams = [f for f in (families or load_families()) if f.available(gt)]
    ms = mutators or available(gt)
    out = {}   # (family id, mutator id) -> (mean Δs, mean yield)
    for fam in fams:
        acc = {m.id: [] for m in ms}
        for _ in range(draws):
            params = fam.sample(rng, gt)
            sf = _surprisal_fn(fam, params, gt, rng)
            ts, tc = spawn_batch(gt, rng, train)
            hs, hc = spawn_batch(gt, rng, test)
            if context == "structured":
                ts, tc = _structure(gt, rng, ts, tc)
                hs, hc = _structure(gt, rng, hs, hc)
            tg = [Grid(a, b) for a, b in zip(ts, tc)]
            hg = [Grid(a, b) for a, b in zip(hs, hc)]
            s_tr = sf(fam.evaluate_batch(ts, tc, params, gt))
            s_te = sf(fam.evaluate_batch(hs, hc, params, gt))
            for m in ms:
                cands = [m.sample(rng, gt) for _ in range(k)]
                ys, yc = [], []
                for p in cands:
                    for g in tg:
                        y = m.apply(g, p, gt) or g
                        ys.append(y.sym); yc.append(y.col)
                d = (sf(fam.evaluate_batch(np.array(ys), np.array(yc), params, gt)).reshape(k, train) - s_tr).mean(1)
                best = cands[int(np.argmax(d))]
                ys = [(m.apply(g, best, gt) or g) for g in hg]
                dt = sf(fam.evaluate_batch(np.array([y.sym for y in ys]), np.array([y.col for y in ys]), params, gt)) - s_te
                acc[m.id].append((float(dt.mean()), float(dt.mean()) / m.cost(best, gt)))
        for mid, v in acc.items():
            out[(fam.id, mid)] = tuple(np.mean(v, axis=0))
    return fams, ms, out


def table(gt: GridType, what: str = "delta", **kw) -> str:
    """what = 'delta' (mean Δs, bits) or 'yield' (mean Δs per bit of cost, ×100)."""
    fams, ms, out = probe(gt, **kw)
    ids = [m.id for m in ms]
    j, fmt = (0, "{:.1f}") if what == "delta" else (1, "{:.0f}")
    scale = 1 if what == "delta" else 100
    head = ("Mean Δ empirical surprisal (bits, capped at 12)" if what == "delta"
            else "Yield ×100 (mean Δ empirical surprisal per bit of agent cost)")
    lines = [f"{head} of the best-of-{kw.get('k', 16)} single-step agent, {kw.get('context', 'fresh')} grids, {gt.key}.",
             "| family | " + " | ".join(ids) + " | best |", "|---" * (len(ids) + 2) + "|"]
    for f in fams:
        row = [out[(f.id, mid)][j] * scale for mid in ids]
        b = ids[int(np.argmax(row))]
        lines.append(f"| {f.id} | " + " | ".join(fmt.format(v) for v in row) + f" | {b} |")
    col_best = [max(out[(f.id, mid)][j] for f in fams) * scale for mid in ids]
    lines.append("| (max over families) | " + " | ".join(fmt.format(v) for v in col_best) + " | |")
    return "\n".join(lines)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--size", type=int, default=5)
    ap.add_argument("--symbols", default="base10")
    ap.add_argument("--colours", default="rgby")
    ap.add_argument("--k", type=int, default=16)
    ap.add_argument("--draws", type=int, default=3)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--context", choices=["fresh", "structured"], default="fresh")
    ap.add_argument("--what", choices=["delta", "yield"], default="delta")
    a = ap.parse_args()
    print(table(GridType(a.size, a.symbols, a.colours), what=a.what, k=a.k, draws=a.draws, seed=a.seed,
                context=a.context))
