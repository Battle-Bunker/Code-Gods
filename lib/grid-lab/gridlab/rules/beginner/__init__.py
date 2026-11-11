"""The beginner pool (lib/game-utilities/src/families/grid/beginner): one module per family, listed here."""
from __future__ import annotations

from .opposite_nines import OPPOSITE_NINES
from .spread_three import SPREAD_THREE
from .step_stool import STEP_STOOL
from .two_pair import TWO_PAIR

FAMILIES = [OPPOSITE_NINES, STEP_STOOL, TWO_PAIR, SPREAD_THREE]
