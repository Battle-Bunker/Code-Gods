"""Programs (agents): an optional Guard plus 1-3 mutator steps, priced in bits.

    cost(P) = agent_base + guard_cost + Σ step costs + ratchet surcharge

Guard cost = guard_base·log2(#guard kinds) + describe·D(params) + measure·H_b(q), where q is the
guard's pass rate under the spawn prior. H_b(q) ≤ 1 bit is the Szilard price of one yes/no
measurement: a guarded program is a little Maxwell's demon, and Bennett's resolution says the
demon pays for the bits it records.

Ratchet surcharge. Every single mutator is idempotent or a bijection, so re-applying one agent to
the same object gains nothing new. Guards and multi-step programs can break that: "if cell (1,1) is
not red, move its colour one step along the rainbow" re-applied converges to "cell (1,1) is red",
and "paint (1,1) red, then slide row 1" converges to a whole red row. Since an agent lives for the
whole game and hits each object many times, it must pay for its *closure* (the state reached by
re-applying it until it stops), not for one application. We probe it: run the program to its
closure on a fixed set of spawned grids and charge log2(alphabet) for every cell-layer that the
closure pins (same value in ≥ 7/8 of probes) beyond what one application pins. Unguarded programs
made only of bijections compose to a bijection and skip the probe (their closure erases nothing).

Targeting. Mutators offer absolute regions (row 3) and one relative region, line* ("the row or column
where this is already most true"). Relative targeting is what makes a single agent useful on the
many unrelated objects it will hit; it costs the same as naming a line (the log2 2N bits move from
the description into the measurement term), so it is a fair trade rather than a free lunch.
"""
from __future__ import annotations

import json
import math
import zlib
from dataclasses import dataclass
from typing import Iterable, Optional

import numpy as np

from .core import RANK_GLYPHS, Grid, GridType, spawn
from .mutators import (COST_KNOBS, Field, _describe_bits, _lg, _sample_fields, _space, available, by_id,
                       region_choices, region_mask)

# ------------------------------------------------------------------------------------------------
# guards
# ------------------------------------------------------------------------------------------------


def _binom_ge(n: int, p: float, m: int) -> float:
    return float(sum(math.comb(n, k) * p ** k * (1 - p) ** (n - k) for k in range(max(m, 0), n + 1)))


def _hb(q: float) -> float:
    q = min(max(q, 0.0), 1.0)
    return 0.0 if q in (0.0, 1.0) else -(q * math.log2(q) + (1 - q) * math.log2(1 - q))


F_NEG = Field("neg", lambda gt, p: [False, True])
F_CELL = Field("cell", lambda gt, p: region_choices("cell", gt.N))
F_GLINE = Field("line", lambda gt, p: region_choices("line", gt.N))
F_GCOL = Field("colour", lambda gt, p: list(range(gt.C)))
F_GRANK = Field("rank", lambda gt, p: list(range(gt.ranks)))


def _count_m(gt, p):
    N2, mean = gt.N ** 2, gt.N ** 2 / gt.C
    return list(range(math.ceil(mean) + 1, N2 + 1)) if p["cmp"] == ">=" else list(range(0, math.floor(mean)))


GUARD_KINDS = {
    "cell_colour": (F_CELL, F_GCOL, F_NEG),
    "cell_rank": (F_CELL, F_GRANK, F_NEG),
    "line_count": (F_GLINE, F_GCOL, Field("m", lambda gt, p: list(range(2, gt.N + 1))), F_NEG),
    "line_mono": (F_GLINE, F_NEG),
    "count_colour": (F_GCOL, Field("cmp", lambda gt, p: [">=", "<="]), Field("m", _count_m)),
    "any_line": (F_GCOL, Field("m", lambda gt, p: list(range(max(2, (gt.N + 1) // 2), gt.N + 1)))),
    "count_rank": (F_GRANK, Field("m", lambda gt, p: list(range(max(1, math.ceil(gt.N ** 2 / gt.ranks) + 1),
                                                                    gt.N ** 2 + 1)))),
}


def _freeze(d: dict) -> tuple:
    return tuple(sorted(d.items()))


@dataclass(frozen=True)
class Guard:
    """A cheap predicate deciding whether the agent acts. kind=None means 'always act'."""
    kind: Optional[str] = None
    items: tuple = ()

    @property
    def params(self) -> dict:
        return dict(self.items)

    @staticmethod
    def make(kind: Optional[str], params: dict | None = None) -> "Guard":
        return Guard(kind, _freeze(params or {}))

    @staticmethod
    def sample(rng: np.random.Generator, gtype: GridType) -> "Guard":
        kinds = list(GUARD_KINDS)
        k = kinds[int(rng.integers(len(kinds)))]
        return Guard.make(k, _sample_fields(GUARD_KINDS[k], rng, gtype))

    # --- evaluation ------------------------------------------------------------------------------
    def check(self, g: Grid, gt: GridType) -> bool:
        if self.kind is None:
            return True
        p = self.params
        k = self.kind
        if k == "cell_colour":
            v = int(g.col[p["cell"]]) == p["colour"]
        elif k == "cell_rank":
            v = int(gt.rank[int(g.sym[p["cell"]])]) == p["rank"]
        elif k == "line_count":
            v = int((g.col[region_mask("line", p["line"], gt.N)] == p["colour"]).sum()) >= p["m"]
        elif k == "line_mono":
            v = len(np.unique(g.col[region_mask("line", p["line"], gt.N)])) == 1
        elif k == "count_colour":
            n = int((g.col == p["colour"]).sum())
            return n >= p["m"] if p["cmp"] == ">=" else n <= p["m"]
        elif k == "any_line":
            hit = g.col == p["colour"]
            return bool(max(hit.sum(0).max(), hit.sum(1).max()) >= p["m"])
        elif k == "count_rank":
            return int((gt.rank[g.sym.astype(np.int64)] == p["rank"]).sum()) >= p["m"]
        else:
            raise ValueError(k)
        return bool(v) != bool(p.get("neg", False))

    def pass_rate(self, gt: GridType) -> float:
        """Probability the guard passes on a fresh spawn (analytic; any_line is approximate)."""
        if self.kind is None:
            return 1.0
        p, k, N, C = self.params, self.kind, gt.N, gt.C
        if k == "cell_colour":
            q = 1 / C
        elif k == "cell_rank":
            q = 1 / gt.ranks
        elif k == "line_count":
            q = _binom_ge(N, 1 / C, p["m"])
        elif k == "line_mono":
            q = C ** (1 - N)
        elif k == "count_colour":
            ge = _binom_ge(N * N, 1 / C, p["m"])
            return ge if p["cmp"] == ">=" else 1 - _binom_ge(N * N, 1 / C, p["m"] + 1)
        elif k == "any_line":
            return 1 - (1 - _binom_ge(N, 1 / C, p["m"])) ** (2 * N)
        elif k == "count_rank":
            return _binom_ge(N * N, 1 / gt.ranks, p["m"])
        return 1 - q if p.get("neg") else q

    def cost_terms(self, gt: GridType) -> dict:
        if self.kind is None:
            return {"base": 0.0, "describe": 0.0, "measure": 0.0}
        K = COST_KNOBS
        return {"base": K["guard_base"] * _lg(len(GUARD_KINDS)),
                "describe": K["describe"] * _describe_bits(GUARD_KINDS[self.kind], self.params, gt),
                "measure": K["measure"] * _hb(self.pass_rate(gt))}

    def cost(self, gt: GridType) -> float:
        return float(sum(self.cost_terms(gt).values()))

    def describe(self, gt: GridType) -> str:
        if self.kind is None:
            return ""
        p, k = self.params, self.kind
        cn = lambda c: gt.colour_names[c]
        rk = lambda r: RANK_GLYPHS[r] if gt.symbols == "cards" else gt.glyph(r)
        cell = lambda rc: f"the cell at row {rc[0] + 1}, column {rc[1] + 1}"
        line = lambda al: f"{'row' if al[0] == 0 else 'column'} {al[1] + 1}"
        neg = p.get("neg", False)
        if k == "cell_colour":
            return f"{cell(p['cell'])} is {'not ' if neg else ''}{cn(p['colour'])}"
        if k == "cell_rank":
            return f"{cell(p['cell'])} {'does not show' if neg else 'shows'} a {rk(p['rank'])}"
        if k == "line_count":
            return f"{line(p['line'])} has {'fewer than' if neg else 'at least'} {p['m']} {cn(p['colour'])} cells"
        if k == "line_mono":
            return f"{line(p['line'])} is {'not ' if neg else ''}all one colour"
        if k == "count_colour":
            return f"the grid has {'at least' if p['cmp'] == '>=' else 'at most'} {p['m']} {cn(p['colour'])} cells"
        if k == "any_line":
            return f"some row or column has at least {p['m']} {cn(p['colour'])} cells"
        return f"the grid has at least {p['m']} {rk(p['rank'])}s"


ALWAYS = Guard()

# ------------------------------------------------------------------------------------------------
# steps and programs
# ------------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Step:
    mutator_id: str
    items: tuple

    @staticmethod
    def make(mutator_id: str, params: dict) -> "Step":
        return Step(mutator_id, _freeze(params))

    @property
    def mutator(self):
        return by_id(self.mutator_id)

    @property
    def params(self) -> dict:
        return dict(self.items)

    def cost(self, gt: GridType) -> float:
        return self.mutator.cost(self.params, gt)

    def apply(self, g: Grid, gt: GridType) -> Optional[Grid]:
        return self.mutator.apply(g, self.params, gt)

    def describe(self, gt: GridType) -> str:
        return self.mutator.describe(self.params, gt)


_COST_CACHE: dict = {}
PROBES = 24
PIN_FRACTION = 7 / 8


def _probe_grids(gt: GridType) -> list[Grid]:
    key = ("probes", gt)
    if key not in _COST_CACHE:
        rng = np.random.default_rng(zlib.crc32(("probe:" + gt.key).encode()))
        _COST_CACHE[key] = [spawn(gt, rng) for _ in range(PROBES)]
    return _COST_CACHE[key]


def _pinned_bits(grids: list[Grid], gt: GridType) -> float:
    """Σ over cell-layers whose value is the same in ≥ PIN_FRACTION of the grids, of log2(alphabet)."""
    col = np.stack([g.col for g in grids]).astype(np.int64)
    sym = np.stack([g.sym for g in grids]).astype(np.int64)
    P = len(grids)
    cmax = np.stack([(col == k).sum(0) for k in range(gt.C)]).max(0)
    smax = np.zeros_like(cmax)
    for s in np.unique(sym):
        smax = np.maximum(smax, (sym == s).sum(0))
    return float((cmax >= PIN_FRACTION * P).sum() * math.log2(gt.C) + (smax >= PIN_FRACTION * P).sum() * math.log2(gt.S))


@dataclass(frozen=True)
class Program:
    """An agent: if guard(x) then apply steps in order. Steps that would be no-ops are skipped."""
    guard: Guard = ALWAYS
    steps: tuple = ()

    def __post_init__(self):
        st = tuple(s if isinstance(s, Step) else Step.make(s[0], s[1]) for s in self.steps)
        object.__setattr__(self, "steps", st)
        assert 1 <= len(st) <= 3, "a program has 1-3 steps"

    @property
    def key(self) -> tuple:
        return (self.guard.kind, self.guard.items, tuple((s.mutator_id, s.items) for s in self.steps))

    @property
    def mutator_ids(self) -> tuple[str, ...]:
        return tuple(s.mutator_id for s in self.steps)

    @property
    def bijective(self) -> bool:
        return self.guard.kind is None and all(s.mutator.bijective for s in self.steps)

    # --- running -------------------------------------------------------------------------------
    def run(self, g: Grid, gt: GridType) -> Grid:
        """Result of one application (the input itself if the guard fails or nothing changes)."""
        if not self.guard.check(g, gt):
            return g
        for s in self.steps:
            y = s.apply(g, gt)
            if y is not None:
                g = y
        return g

    def apply(self, grid: Grid, gtype: GridType, rng=None) -> Optional[Grid]:
        y = self.run(grid, gtype)
        return None if y == grid else y

    def apply_batch(self, sym: np.ndarray, col: np.ndarray, gtype: GridType, rng=None):
        """Loop over a (B, N, N) batch: returns (sym', col', ok) with ok[b] = the object changed."""
        S, C, ok = sym.copy(), col.copy(), np.zeros(len(sym), bool)
        for b in range(len(sym)):
            y = self.apply(Grid(sym[b], col[b]), gtype)
            if y is not None:
                S[b], C[b], ok[b] = y.sym, y.col, True
        return S, C, ok

    def closure(self, g: Grid, gt: GridType, cap: int | None = None) -> Grid:
        """Re-apply until nothing changes or a state repeats (cap = 3N² + 8 applications)."""
        cap = cap or 3 * gt.N ** 2 + 8
        seen = {g.key}
        for _ in range(cap):
            y = self.run(g, gt)
            if y == g or y.key in seen:
                return y
            seen.add(y.key)
            g = y
        return g

    # --- cost ----------------------------------------------------------------------------------
    def ratchet_bits(self, gt: GridType) -> float:
        if self.guard.kind is None and (len(self.steps) == 1 or self.bijective):
            return 0.0
        probes = _probe_grids(gt)
        one = [self.run(x, gt) for x in probes]
        inf = [self.closure(x, gt) for x in probes]
        return max(0.0, _pinned_bits(inf, gt) - _pinned_bits(one, gt))

    def cost_terms(self, gtype: GridType) -> dict:
        fp = json.dumps(COST_KNOBS, sort_keys=True)
        ck = (self.key, gtype, fp)
        if ck not in _COST_CACHE:
            K = COST_KNOBS
            steps = [s.cost(gtype) for s in self.steps]
            _COST_CACHE[ck] = {"agent_base": K["agent_base"], "guard": self.guard.cost(gtype),
                               "steps": steps, "ratchet": K["ratchet"] * self.ratchet_bits(gtype)}
        return _COST_CACHE[ck]

    def cost(self, gtype: GridType) -> float:
        t = self.cost_terms(gtype)
        return float(t["agent_base"] + t["guard"] + sum(t["steps"]) + t["ratchet"])

    # --- text ----------------------------------------------------------------------------------
    def describe(self, gtype: GridType) -> str:
        body = ", then ".join(s.describe(gtype) for s in self.steps)
        if self.guard.kind is not None:
            return f"If {self.guard.describe(gtype)}: {body}."
        return body[0].upper() + body[1:] + "."


# ------------------------------------------------------------------------------------------------
# generation helpers for policies
# ------------------------------------------------------------------------------------------------
STEP_WEIGHTS = (0.6, 0.3, 0.1)


def random_step(rng: np.random.Generator, gtype: GridType, mutator_ids: Iterable[str] | None = None) -> Step:
    ms = [m for m in available(gtype) if mutator_ids is None or m.id in set(mutator_ids)]
    m = ms[int(rng.integers(len(ms)))]
    return Step.make(m.id, m.sample(rng, gtype))


def random_program(rng: np.random.Generator, gtype: GridType, max_steps: int = 3, guard_prob: float = 0.3,
                   step_weights: tuple = STEP_WEIGHTS, mutator_ids: Iterable[str] | None = None) -> Program:
    """A random agent: 1..max_steps steps (weights STEP_WEIGHTS), mutators uniform over those available,
    params drawn field by field (so with probability 2^-D), guard with probability guard_prob."""
    mutator_ids = None if mutator_ids is None else tuple(mutator_ids)
    w = np.array(step_weights[:max_steps], float)
    n = 1 + int(rng.choice(len(w), p=w / w.sum()))
    steps = tuple(random_step(rng, gtype, mutator_ids) for _ in range(n))
    guard = Guard.sample(rng, gtype) if rng.random() < guard_prob else ALWAYS
    return Program(guard, steps)


def candidates(rng: np.random.Generator, gtype: GridType, k: int, **kw) -> list[Program]:
    """k distinct random programs (see random_program for kwargs)."""
    out, seen = [], set()
    for _ in range(50 * k):
        p = random_program(rng, gtype, **kw)
        if p.key not in seen:
            seen.add(p.key)
            out.append(p)
            if len(out) == k:
                break
    return out


def single_step_programs(gtype: GridType, mutator_ids: Iterable[str] | None = None) -> Iterable[Program]:
    """Every unguarded one-step program (exhaustive; a few thousand to ~15k depending on GridType)."""
    ids = None if mutator_ids is None else set(mutator_ids)
    for m in available(gtype):
        if ids is not None and m.id not in ids:
            continue
        for p in m.space(gtype):
            yield Program(ALWAYS, (Step.make(m.id, p),))


def neighbour(rng: np.random.Generator, gtype: GridType, prog: Program, guard_prob: float = 0.3) -> Program:
    """A small random edit, for local search: resample one step, add/drop a step, or redraw the guard."""
    steps = list(prog.steps)
    r = rng.random()
    if r < 0.5:
        i = int(rng.integers(len(steps)))
        m = steps[i].mutator
        steps[i] = Step.make(m.id, m.sample(rng, gtype))
    elif r < 0.65 and len(steps) < 3:
        steps.insert(int(rng.integers(len(steps) + 1)), random_step(rng, gtype))
    elif r < 0.8 and len(steps) > 1:
        steps.pop(int(rng.integers(len(steps))))
    elif r < 0.9:
        i = int(rng.integers(len(steps)))
        steps[i] = random_step(rng, gtype)
    else:
        g = Guard.sample(rng, gtype) if (prog.guard.kind is None and rng.random() < 0.5 + guard_prob) else ALWAYS
        return Program(g, tuple(steps))
    return Program(prog.guard, tuple(steps))
