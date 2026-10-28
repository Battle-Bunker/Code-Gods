"""Utility families: the contract between rules, calibration and the simulator.

A utility function returns an *ordinal utility*: an int where only the order matters (higher is
better). Use `lex` to pack a lexicographic tuple into one int. The engine never reads magnitudes;
it converts ordinals to surprisal (bits) through the family's survival function under the prior.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Optional
import numpy as np

from .core import Grid, GridType, Requires, req

Params = dict
Ordinal = int


def lex(*parts: tuple[int, int]) -> int:
    """Pack (value, bound) pairs lexicographically: lex((a, A), (b, B)) orders by a, then b.
    Each value must lie in [0, bound)."""
    out = 0
    for v, bound in parts:
        out = out * bound + int(v)
    return out


@dataclass(frozen=True)
class Family:
    id: str
    name: str
    theme: str                                   # public, parameter-free
    requires: Requires
    layers: frozenset[str]                       # subset of {"colour", "symbol", "position"}
    camp: str                                    # "clumper" | "alternator" | "neutral"
    sample: Callable[[np.random.Generator, GridType], Params]
    summary: Callable[[Params, GridType], str]       # private, kid-readable incentive
    ordinal: Callable[[Grid, Params, GridType], Ordinal]
    # Optional vectorised ordinal over a batch (sym, col) of shape (B, N, N) -> int64 (B,). Must agree with `ordinal`.
    batch: Optional[Callable[[np.ndarray, np.ndarray, Params, GridType], np.ndarray]] = None
    # Map params to a representative of their symmetry orbit so draws can share a survival table
    # (e.g. any "your colour" -> colour 0 when the rule ignores colour order). Must preserve the
    # distribution of the ordinal under the prior. Default: params unchanged.
    canonical: Optional[Callable[[Params, GridType], Params]] = None
    # Optional exact log2 μ{u >= t} (a "proof"); checked against sampling by tests.
    exact_log2_tail: Optional[Callable[[Ordinal, Params, GridType], float]] = None
    # Optional: a legal grid achieving the family's maximum ordinal (reachability).
    exemplar: Optional[Callable[[Params, GridType], Grid]] = None
    source: str = ""                             # brainstorm origin, e.g. "catalog#12 / games.md"
    tags: frozenset[str] = field(default_factory=frozenset)  # e.g. {"seed", "shortlist"}
    # Optional defence goal (docs/defence-goals.md): a Family whose ordinal is *badness* (higher = worse),
    # read with params["defence"]. Calibrated like any ordinal; scored as a penalty, never as a reward.
    penalty: Optional["Family"] = None
    # Set on variants built by `with_defence`: the family whose reward ordinal this one reuses. The reward
    # channel is calibrated as the base (same survival table), with the "defence" params stripped.
    base: Optional["Family"] = None

    def available(self, gtype: GridType) -> bool:
        return self.requires.check(gtype)

    def evaluate_batch(self, sym: np.ndarray, col: np.ndarray, params: Params, gtype: GridType) -> np.ndarray:
        if self.batch is not None:
            return self.batch(sym, col, params, gtype).astype(np.int64)
        return np.fromiter((self.ordinal(Grid(s, c), params, gtype) for s, c in zip(sym, col)),
                           dtype=np.int64, count=len(sym))


@dataclass(frozen=True)
class Draw:
    """One god's concrete utility function: a family plus sampled params, in a gtype."""
    family: Family
    params: Params

    def ordinal(self, g: Grid, gtype: GridType) -> Ordinal:
        return self.family.ordinal(g, self.params, gtype)

    def summary(self, gtype: GridType) -> str:
        return self.family.summary(self.params, gtype)

    def reward_draw(self) -> "Draw":
        """The draw whose survival table scores the reward channel (the base family for variants)."""
        f = self.family
        if f.base is None:
            return self
        return Draw(f.base, {k: v for k, v in self.params.items() if k != "defence"})

    def penalty_draw(self) -> Optional["Draw"]:
        """The defence goal as a draw of its own (badness ordinal), or None."""
        f = self.family
        return None if f.penalty is None else Draw(f.penalty, self.params["defence"])


def with_defence(base: Family, penalty: Family, *, id: str | None = None, name: str | None = None,
                 theme: str | None = None,
                 sample_penalty: Optional[Callable[[np.random.Generator, GridType, Params], Params]] = None,
                 source: str = "", tags=()) -> Family:
    """A variant of `base` that keeps its reward and adds the defence goal `penalty`.

    Params are base params plus params["defence"] = penalty params (`sample_penalty(rng, gtype, base_params)`
    when the penalty must avoid the base's choices, e.g. hate a colour other than the favourite)."""
    sp = sample_penalty or (lambda rng, gt, p: penalty.sample(rng, gt))

    def sample(rng, gt):
        p = base.sample(rng, gt)
        return {**p, "defence": sp(rng, gt, p)}

    def strip(p):
        return {k: v for k, v in p.items() if k != "defence"}

    def canonical(p, gt):
        q = base.canonical(strip(p), gt) if base.canonical is not None else strip(p)
        d = penalty.canonical(p["defence"], gt) if penalty.canonical is not None else p["defence"]
        return {**q, "defence": d}

    from dataclasses import replace
    return replace(
        base, id=id or f"{base.id}+{penalty.id}", name=name or f"{base.name}, hates {penalty.name}",
        theme=theme or f"{base.theme}; hates {penalty.name.lower()}",
        requires=Requires(base.requires.classes | penalty.requires.classes,
                          max(base.requires.min_size, penalty.requires.min_size),
                          min(base.requires.max_size, penalty.requires.max_size),
                          base.requires.parity or penalty.requires.parity,
                          max(base.requires.min_colours, penalty.requires.min_colours),
                          max(base.requires.min_symbols, penalty.requires.min_symbols)),
        sample=sample, summary=lambda p, gt: base.summary(strip(p), gt),
        ordinal=lambda g, p, gt: base.ordinal(g, strip(p), gt),
        batch=None if base.batch is None else (lambda s, c, p, gt: base.batch(s, c, strip(p), gt)),
        canonical=canonical,
        exact_log2_tail=None if base.exact_log2_tail is None else
        (lambda t, p, gt: base.exact_log2_tail(t, strip(p), gt)),
        exemplar=None if base.exemplar is None else (lambda p, gt: base.exemplar(strip(p), gt)),
        source=source or f"{base.id} + defence goal {penalty.id}",
        tags=frozenset(tags) | {"defence"}, penalty=penalty, base=base)
