"""The beginner pool's families (one module per family; lib/game-utilities/src/families/grid/beginner)."""
from __future__ import annotations

from .spread_three import SPREAD_THREE
from .two_pair import TWO_PAIR

FAMILIES = [TWO_PAIR, SPREAD_THREE]
