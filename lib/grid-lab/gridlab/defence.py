"""Defence goals: scoring maths and the kid-facing card (docs/defence-goals.md).

A god may hold a reward ordinal r (✨, bigger is better) and a penalty ordinal d (⚠️, bigger is worse),
each calibrated on its own survival function under the prior μ:

    s⁺(x) = -log2 μ{r >= r(x)}                         reward bits
    h(x)  = max(0, -log2 μ{d >= d(x)} - HINGE_BITS)    penalty bits (0 unless worse than half of all grids)

and scores, per object,

    π_i(x) = s⁺_i(x) · Σ_{j≠i} s⁺_j(x)  -  K_i · (h_i(x) - h̄_i),   K_i = Σ_{j≠i} E_μ[s⁺_j],  h̄_i = E_μ[h_i].

The product is the unchanged payoff formula; the penalty term is private (it never enters another god's
payoff), priced at the prior mean of the peer factor (so no god gains when another's surprisal falls), and
centred so that it is zero-mean on fresh spawns. Gods without a defence goal have no second term.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional, Sequence

import numpy as np

from .core import Grid, GridType
from .family import Draw

HINGE_BITS = 1.0   # the median: half of all grids are at least this bad


def hinge(bits):
    """Penalty bits from badness surprisal: max(0, s⁻ - HINGE_BITS); scalar or array."""
    if np.ndim(bits) == 0:
        return max(0.0, float(bits) - HINGE_BITS)
    return np.maximum(0.0, np.asarray(bits, dtype=np.float64) - HINGE_BITS)


@dataclass(frozen=True)
class DefenceConstants:
    """Per-god constants of the defence term (arrays of length G)."""
    has: np.ndarray          # bool: god has a defence goal
    K: np.ndarray            # exchange rate (bits² per penalty bit) actually used in the payoff (0 if unscored)
    K_prior: np.ndarray      # Σ_{j≠i} E_μ[s⁺_j], before weight/rate overrides and scoring switch
    hbar: np.ndarray         # E_μ[h_i] (0 for gods without a defence goal)
    reward_mean: np.ndarray  # E_μ[s⁺_i]

    @property
    def any(self) -> bool:
        return bool(self.has.any())


def constants(tables: Sequence, ptables: Sequence, rate="prior", weight: float = 1.0,
              scored: bool = True) -> DefenceConstants:
    """Defence constants from reward tables and penalty tables (None for gods without a defence goal).
    rate: "prior" (K_i = Σ_{j≠i} E_μ[s⁺_j]) or a float = bits per peer (K_i = (G-1)·rate)."""
    G = len(tables)
    has = np.array([t is not None for t in ptables], bool)
    m = np.array([t.prior_mean_bits() for t in tables], float)
    if rate == "prior":
        Kp = m.sum() - m
    else:
        Kp = np.full(G, (G - 1) * float(rate))
    hbar = np.array([t.prior_mean_bits(HINGE_BITS) if t is not None else 0.0 for t in ptables], float)
    K = np.where(has, Kp * weight, 0.0) * (1.0 if scored else 0.0)
    return DefenceConstants(has, K, np.where(has, Kp, 0.0), hbar, m)


def defence_term(H: np.ndarray, K: np.ndarray, hbar: np.ndarray) -> np.ndarray:
    """-K_i (h_i(x) - h̄_i) for a penalty matrix H (M, G); zero columns where K = 0."""
    return -(H - hbar[None, :]) * K[None, :]


def penalty_bits(pdraw: Optional[Draw], ptable, g: Grid, gtype: GridType) -> float:
    if pdraw is None:
        return 0.0
    return hinge(ptable.surprisal(pdraw.ordinal(g, gtype)))


# ------------------------------------------------------------------------------------------------
# kid-facing text
# ------------------------------------------------------------------------------------------------
def card(draw: Draw, gtype: GridType, K: float | None = None) -> str:
    """The dealt card: ✨ line (reward) and, for a defence goal, a ⚠️ line and its price."""
    f = draw.family
    lines = [f"✨ {f.name.split(',')[0]}: {draw.summary(gtype)}"]
    pd = draw.penalty_draw()
    if pd is not None:
        lines.append(f"⚠️ {pd.family.name}: {pd.summary(gtype)} (only counts when a grid is worse than usual)")
        if K is not None and K > 0:
            lines.append(f"   each ⚠️ costs you about {K:.0f} points this game")
    return "\n".join(lines)


def object_line(draw: Draw, table, ptable, g: Grid, gtype: GridType) -> str:
    """What the god sees on one grid: '✨ rarer than 976/1000 grids · ⚠️ redder than 90% of grids'."""
    s = float(table.surprisal(draw.reward_draw().ordinal(g, gtype)))
    out = [f"✨ rarer than {round(1000 * (1 - 2.0 ** -s))}/1000 grids ({s:.1f} bits)"]
    pd = draw.penalty_draw()
    if pd is not None:
        sm = float(ptable.surprisal(pd.ordinal(g, gtype)))
        h = hinge(sm)
        from .rules.defence import comparative
        word = comparative(pd, gtype)
        if h > 0:
            out.append(f"⚠️ {word} than {math.floor(100 * (1 - 2.0 ** -sm))}% of grids ({h:.1f} ⚠️)")
        else:
            out.append("⚠️ fine (no worse than usual)")
    return " · ".join(out)
