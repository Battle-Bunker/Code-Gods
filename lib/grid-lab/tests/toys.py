"""Toy utility families and toy mutators/programs for engine tests (stand-ins for the real modules)."""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from gridlab.core import Grid, GridType, req
from gridlab.family import Family


def binom_log2_tail(t: int, n: int, p: float) -> float:
    """log2 P[Bin(n, p) >= t], exact via log-sum-exp."""
    if t <= 0:
        return 0.0
    if t > n:
        return -math.inf
    terms = [math.lgamma(n + 1) - math.lgamma(k + 1) - math.lgamma(n - k + 1)
             + k * math.log(p) + (n - k) * math.log1p(-p) for k in range(t, n + 1)]
    m = max(terms)
    return (m + math.log(sum(math.exp(x - m) for x in terms))) / math.log(2)


def _cc_batch(sym, col, p, gt):
    return (col == p["colour"]).sum(axis=(1, 2))


COLOUR_COUNT = Family(
    id="toy_colour_count", name="Colour count", theme="lots of one colour", requires=req(),
    layers=frozenset({"colour"}), camp="clumper",
    sample=lambda rng, gt: {"colour": int(rng.integers(gt.C))},
    summary=lambda p, gt: f"count of {gt.colour_names[p['colour']]} cells",
    ordinal=lambda g, p, gt: int((g.col == p["colour"]).sum()),
    batch=_cc_batch,
    canonical=lambda p, gt: {"colour": 0},
    exact_log2_tail=lambda t, p, gt: binom_log2_tail(int(t), gt.N * gt.N, 1.0 / gt.C),
    exemplar=lambda p, gt: Grid(np.zeros((gt.N, gt.N)), np.full((gt.N, gt.N), p["colour"])),
)

# Same rule without the exact tail (so the tests exercise the estimator).
COLOUR_COUNT_EST = Family(**{**COLOUR_COUNT.__dict__, "id": "toy_colour_count_est", "exact_log2_tail": None})


def _sum_batch(sym, col, p, gt):
    return gt.value[sym].sum(axis=(1, 2)).astype(np.int64)


SYMBOL_SUM = Family(
    id="toy_symbol_sum", name="Big sum", theme="high numbers", requires=req("Valued"),
    layers=frozenset({"symbol"}), camp="neutral",
    sample=lambda rng, gt: {},
    summary=lambda p, gt: "sum of all symbol values",
    ordinal=lambda g, p, gt: int(gt.value[g.sym].sum()),
    batch=_sum_batch,
)


def _row_alt(g, p, gt):
    """Number of horizontally adjacent pairs with different colours (an 'alternator')."""
    return int((g.col[:, 1:] != g.col[:, :-1]).sum())


ROW_ALTERNATE = Family(
    id="toy_row_alternate", name="Stripes", theme="colours that change", requires=req(),
    layers=frozenset({"colour"}), camp="alternator",
    sample=lambda rng, gt: {},
    summary=lambda p, gt: "adjacent cells in a row differ in colour",
    ordinal=_row_alt,
    batch=None,  # exercises the slow (per-grid) path
)

TOY_FAMILIES = [COLOUR_COUNT, SYMBOL_SUM, ROW_ALTERNATE]


# --- toy mutators / programs (stand-ins matching the SPEC contract) ---------------------------------
@dataclass(frozen=True)
class ToyMutator:
    id: str
    name: str
    summary: str
    sample: object
    cost: object
    apply: object
    requires: object = req()


def _paint(g, p, gt, rng):
    col = g.col.copy(); col[p["r"], p["c"]] = p["colour"]
    return g.replace(col=col)


def _bump(g, p, gt, rng):
    sym = g.sym.copy(); sym[p["r"], p["c"]] = gt.step(int(sym[p["r"], p["c"]]), 1)
    return g.replace(sym=sym)


def _swap(g, p, gt, rng):
    sym, col = g.sym.copy(), g.col.copy()
    a, b = (p["r"], p["c"]), (p["r2"], p["c2"])
    sym[a], sym[b] = g.sym[b], g.sym[a]
    col[a], col[b] = g.col[b], g.col[a]
    return g.replace(sym=sym, col=col)


def _cell(rng, gt):
    return {"r": int(rng.integers(gt.N)), "c": int(rng.integers(gt.N))}


TOY_MUTATORS = [
    ToyMutator("paint", "Paint", "set a cell's colour",
               lambda rng, gt: {**_cell(rng, gt), "colour": int(rng.integers(gt.C))},
               lambda p, gt: math.log2(gt.N * gt.N * gt.C), _paint),
    ToyMutator("bump", "Bump", "add one to a cell's symbol", _cell,
               lambda p, gt: math.log2(gt.N * gt.N), _bump),
    ToyMutator("swap", "Swap", "swap two cells",
               lambda rng, gt: {**_cell(rng, gt), "r2": int(rng.integers(gt.N)), "c2": int(rng.integers(gt.N))},
               lambda p, gt: 2 * math.log2(gt.N * gt.N), _swap),
]


@dataclass(frozen=True)
class ToyStep:
    mutator: ToyMutator
    params: dict


@dataclass(frozen=True)
class ToyProgram:
    guard: object
    steps: tuple

    def cost(self, gt):
        return 1.0 + sum(s.mutator.cost(s.params, gt) for s in self.steps)

    def apply(self, g, gt, rng):
        for s in self.steps:
            g = s.mutator.apply(g, s.params, gt, rng)
            if g is None:
                return None
        return g

    def describe(self, gt):
        return " then ".join(s.mutator.name for s in self.steps)


def toy_random_program(rng, gt, max_steps=3, **kw):
    k = int(rng.integers(1, max_steps + 1))
    steps = []
    for _ in range(k):
        m = TOY_MUTATORS[int(rng.integers(len(TOY_MUTATORS)))]
        steps.append(ToyStep(m, m.sample(rng, gt)))
    return ToyProgram(None, tuple(steps))
