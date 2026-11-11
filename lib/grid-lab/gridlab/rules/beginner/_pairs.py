"""What the beginner pair families share (lib/game-utilities/src/families/grid/beginner/_pairs.ts): fixed pairs of cells."""
from __future__ import annotations

import numpy as np


def half_turn(a: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """First half of the cells in reading order and their half-turn partners, for a batch (B, N, N): (B, k) each."""
    B, N = a.shape[0], a.shape[-1]
    flat = a.reshape(B, N * N)
    k = (N * N) // 2
    return flat[:, :k], flat[:, ::-1][:, :k]

