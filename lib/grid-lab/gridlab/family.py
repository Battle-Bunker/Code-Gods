"""Utility families: the contract between rules, calibration and the simulator.

A utility function returns an *ordinal utility*: an int where only the order matters (higher is
better). Use `lex` to pack a lexicographic tuple into one int. The engine never reads magnitudes;
it converts ordinals to surprisal (bits) through the family's survival function under the prior.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Optional
import numpy as np

from .core import Grid, Room, Requires, req

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
    sample: Callable[[np.random.Generator, Room], Params]
    summary: Callable[[Params, Room], str]       # private, kid-readable incentive
    ordinal: Callable[[Grid, Params, Room], Ordinal]
    # Optional vectorised ordinal over a batch (sym, col) of shape (B, N, N) -> int64 (B,). Must agree with `ordinal`.
    batch: Optional[Callable[[np.ndarray, np.ndarray, Params, Room], np.ndarray]] = None
    # Map params to a representative of their symmetry orbit so draws can share a survival table
    # (e.g. any "your colour" -> colour 0 when the rule ignores colour order). Must preserve the
    # distribution of the ordinal under the prior. Default: params unchanged.
    canonical: Optional[Callable[[Params, Room], Params]] = None
    # Optional exact log2 μ{u >= t} (a "proof"); checked against sampling by tests.
    exact_log2_tail: Optional[Callable[[Ordinal, Params, Room], float]] = None
    # Optional: a legal grid achieving the family's maximum ordinal (reachability).
    exemplar: Optional[Callable[[Params, Room], Grid]] = None
    source: str = ""                             # brainstorm origin, e.g. "catalog#12 / games.md"
    tags: frozenset[str] = field(default_factory=frozenset)  # e.g. {"seed", "shortlist"}

    def available(self, room: Room) -> bool:
        return self.requires.check(room)

    def evaluate_batch(self, sym: np.ndarray, col: np.ndarray, params: Params, room: Room) -> np.ndarray:
        if self.batch is not None:
            return self.batch(sym, col, params, room).astype(np.int64)
        return np.fromiter((self.ordinal(Grid(s, c), params, room) for s, c in zip(sym, col)),
                           dtype=np.int64, count=len(sym))


@dataclass(frozen=True)
class Draw:
    """One god's concrete utility function: a family plus sampled params, in a room."""
    family: Family
    params: Params

    def ordinal(self, g: Grid, room: Room) -> Ordinal:
        return self.family.ordinal(g, self.params, room)

    def summary(self, room: Room) -> str:
        return self.family.summary(self.params, room)
