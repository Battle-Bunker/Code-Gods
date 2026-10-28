"""Defence goals: scoring maths and the kid-facing card (docs/defence-goals.md).

A god may hold a reward ordinal r (✨, bigger is better) and a penalty ordinal d (⚠️, bigger is worse),
each calibrated on its own survival function under the prior μ:

    s⁺(x) = -log2 μ{r >= r(x)}                 reward bits
    h(x)  = softhinge(-log2 μ{d >= d(x)})      penalty bits (≈ 0 unless worse than half of all grids)
    n(x)  = s⁺(x) - (h(x) - E_μ h)             signed bits: + for surprisingly good, - for surprisingly bad

and scores, per object (default "floored" mode),

    π_i(x) = n_i(x) · max(0, Σ_{j≠i} n_j(x))

"If, overall, the other gods don't care about a grid, nobody scores from it." With no defence goal in the
game n = s⁺ ≥ 0 and this is exactly the original s_i · Σ_{j≠i} s_j. `payoff_matrix` also implements the
"gated" and "private" alternatives compared in the doc.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional, Sequence

import numpy as np

from .core import Grid, GridType
from .family import Draw

HINGE_BITS = 1.0   # the median: half of all grids are at least this bad
_H0 = math.log2(1.0 + 2.0 ** -HINGE_BITS)
MODES = ("floored", "gated", "private")


def hinge(bits):
    """Penalty bits from badness surprisal s⁻ ≥ 0: a soft hinge at the median,

        h(s) = log2(1 + 2^(s - 1)) - log2(1 + 2^-1),

    strictly increasing, h(0) = 0, h ≈ 0.4 at the median and h ≈ s - 1.58 for bad grids. Scalar or array."""
    a = np.asarray(bits, dtype=np.float64)
    out = np.logaddexp2(0.0, a - HINGE_BITS) - _H0
    return float(out) if np.ndim(bits) == 0 else out


@dataclass(frozen=True)
class DefenceConstants:
    """Per-god constants of the defence scoring (arrays of length G) and the payoff mode."""
    has: np.ndarray          # bool: god has a defence goal
    w: np.ndarray            # penalty weight actually scored (0 without a goal or when unscored)
    K: np.ndarray            # "private" mode rate (bits² per penalty bit) = w · K_prior
    K_prior: np.ndarray      # Σ_{j≠i} E_μ[s⁺_j]
    hbar: np.ndarray         # E_μ[h_i] (0 for gods without a defence goal)
    reward_mean: np.ndarray  # E_μ[s⁺_i]
    mode: str = "floored"

    @property
    def any(self) -> bool:
        return bool(self.has.any())

    @property
    def scored(self) -> bool:
        return bool(np.any(self.w))


def constants(tables: Sequence, ptables: Sequence, rate="prior", weight: float = 1.0,
              scored: bool = True, mode: str = "floored") -> DefenceConstants:
    """Defence constants from reward tables and penalty tables (None for gods without a defence goal).
    rate ("private" mode only): "prior" (K_i = Σ_{j≠i} E_μ[s⁺_j]) or a float = bits per peer."""
    assert mode in MODES, mode
    G = len(tables)
    has = np.array([t is not None for t in ptables], bool)
    m = np.array([t.prior_mean_bits() for t in tables], float)
    Kp = m.sum() - m if rate == "prior" else np.full(G, (G - 1) * float(rate))
    hbar = np.array([t.prior_mean_bits(f=hinge) if t is not None else 0.0 for t in ptables], float)
    w = np.where(has, float(weight), 0.0) * (1.0 if scored else 0.0)
    return DefenceConstants(has, w, w * Kp, np.where(has, Kp, 0.0), hbar, m, mode)


def net_bits(S: np.ndarray, H: np.ndarray, dc: DefenceConstants) -> np.ndarray:
    """Signed bits per god: n_i = s⁺_i - w_i (h_i - h̄_i). Strictly increasing in the reward ordinal and
    strictly decreasing in the penalty ordinal; equals s⁺ for gods without a scored defence goal."""
    return S - (H - dc.hbar) * dc.w


def payoff_matrix(S: np.ndarray, H: Optional[np.ndarray] = None, dc: Optional[DefenceConstants] = None) -> np.ndarray:
    """Per-object payoffs π (M, G). Without a scored defence goal: s_i · Σ_{j≠i} s_j (the original formula).
    floored: n_i · max(0, Σ_{j≠i} n_j)          (the collective term is floored at 0)
    gated:   n_i · Σ_{j≠i} n_j if Σ_j n_j > 0 else 0
    private: s_i · Σ_{j≠i} s_j - K_i (h_i - h̄_i) (penalties never enter anyone else's payoff)"""
    if H is None or dc is None or not dc.scored:
        return S * (S.sum(axis=1, keepdims=True) - S)
    if dc.mode == "private":
        return S * (S.sum(axis=1, keepdims=True) - S) - (H - dc.hbar) * dc.K
    n = net_bits(S, H, dc)
    peer = n.sum(axis=1, keepdims=True) - n
    if dc.mode == "floored":
        return n * np.maximum(0.0, peer)
    return np.where(n.sum(axis=1, keepdims=True) > 0, n * peer, 0.0)


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
        if sm > HINGE_BITS:
            out.append(f"⚠️ {word} than {math.floor(100 * (1 - 2.0 ** -sm))}% of grids ({h:.1f} ⚠️)")
        else:
            out.append("⚠️ fine (no worse than usual)")
    return " · ".join(out)
