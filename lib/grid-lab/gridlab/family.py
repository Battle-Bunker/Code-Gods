"""Utility families: the contract between rules, calibration and the simulator.

A utility function returns an *ordinal utility*: only the order matters (higher is better). An
ordinal is either an int, or a fixed-length tuple of ints compared lexicographically (Python's native
tuple order: "points first; if tied, goal difference"). A family always returns the same kind, and
tuples always have the same length. `batch` returns int64 shape (B,) for int ordinals or (B, k) for
k-tuples. The engine never reads magnitudes; it converts ordinals to surprisal (bits) through the
family's survival function under the prior.

Engine code that needs one sortable array works on *ordinal keys* (`ordinal_keys`, `ordinal_key`):
int64 for int ordinals, and a fixed-width byte string for tuples whose bytewise order is the tuple
order. Keys of the same family compare, sort, `np.unique` and `searchsorted` exactly like the
ordinals, with no bounds to get wrong. `dense_rank` maps ordinals to 0..L-1 integers when a plain
integer is needed (e.g. a KS statistic).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Optional, Union
import numpy as np

from .core import Grid, GridType, Requires, req

Params = dict
Ordinal = Union[int, tuple[int, ...]]

_SIGN = np.uint64(1 << 63)


def ordinal_keys(values) -> np.ndarray:
    """Batch of ordinals -> 1-D array of keys with the same order (see module docstring).

    (B,) ints -> int64 unchanged. (B, k) ints -> 'S{8k+1}' byte strings: each component as a
    big-endian uint64 with the sign bit flipped (so signed order = unsigned byte order), plus a
    trailing 0x01 so numpy never strips trailing NUL bytes. Keys already in key form pass through."""
    a = np.asarray(values)
    if a.dtype.kind == "S":
        return a
    if a.ndim == 1:
        return a.astype(np.int64)
    assert a.ndim == 2, f"ordinal batch must be (B,) or (B, k), got {a.shape}"
    B, k = a.shape
    u = (a.astype(np.int64).view(np.uint64) ^ _SIGN).astype(">u8")
    raw = np.empty((B, 8 * k + 1), np.uint8)
    raw[:, :8 * k] = u.view(np.uint8).reshape(B, 8 * k)
    raw[:, 8 * k] = 1
    return raw.view(f"S{8 * k + 1}").reshape(B)


def ordinal_key(o):
    """Key of one ordinal: an int stays an int, a tuple becomes the bytes key `ordinal_keys` uses."""
    if isinstance(o, tuple):
        return bytes(ordinal_keys(np.array([o], dtype=np.int64))[0])
    if isinstance(o, bytes):
        return o
    return int(o)


def key_to_ordinal(key) -> Ordinal:
    """Inverse of `ordinal_key` (for display)."""
    if isinstance(key, (bytes, np.bytes_)):
        b = bytes(key)
        k = (len(b) - 1) // 8
        u = np.frombuffer(b[:8 * k], dtype=">u8").astype(np.uint64) ^ _SIGN
        return tuple(int(x) for x in u.view(np.int64))
    return int(key)


def dense_rank(*batches) -> list[np.ndarray]:
    """Rank the ordinals of several batches jointly to dense ints 0..L-1 (same order, ties kept).
    Deterministic: the rank of a value depends only on the set of distinct values present."""
    keys = [ordinal_keys(b) for b in batches]
    _, inv = np.unique(np.concatenate(keys), return_inverse=True)
    out, i = [], 0
    for k in keys:
        out.append(inv[i:i + len(k)].astype(np.int64))
        i += len(k)
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
    # Optional vectorised ordinal over a batch (sym, col) of shape (B, N, N) -> int64 (B,), or (B, k) for
    # k-tuple ordinals. Must agree with `ordinal`.
    batch: Optional[Callable[[np.ndarray, np.ndarray, Params, GridType], np.ndarray]] = None
    # Map params to a representative of their symmetry orbit so draws can share a survival table
    # (e.g. any "your colour" -> colour 0 when the rule ignores colour order). Must preserve the
    # distribution of the ordinal under the prior. Default: params unchanged.
    canonical: Optional[Callable[[Params, GridType], Params]] = None
    # Optional exact log2 μ{u >= t} (a "proof"); checked against sampling by tests.
    exact_log2_tail: Optional[Callable[[Ordinal, Params, GridType], float]] = None
    # Optional: a legal grid achieving the family's maximum ordinal (reachability).
    exemplar: Optional[Callable[[Params, GridType], Grid]] = None
    # Optional kid-readable card: a complete, runnable Python program (see gridlab/kid.py) with the
    # draw's settings filled in as UPPER_CASE constants, whose `utility(grid)` induces exactly the same
    # order as `ordinal`. The card is the source of truth players read.
    card_source: Optional[Callable[[Params, GridType], str]] = None
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
        """Ordinals of a batch: int64 (B,) or (B, k)."""
        if self.batch is not None:
            return np.asarray(self.batch(sym, col, params, gtype)).astype(np.int64)
        # A list of ints becomes (B,), a list of k-tuples (B, k).
        return np.array([self.ordinal(Grid(s, c), params, gtype) for s, c in zip(sym, col)], dtype=np.int64)

    def evaluate_keys(self, sym: np.ndarray, col: np.ndarray, params: Params, gtype: GridType) -> np.ndarray:
        """Ordinal keys of a batch: 1-D, ordered like the ordinals (see `ordinal_keys`)."""
        return ordinal_keys(self.evaluate_batch(sym, col, params, gtype))


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
