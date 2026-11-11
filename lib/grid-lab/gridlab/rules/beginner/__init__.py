"""The beginner pool (lib/game-utilities/src/families/grid/beginner): one module per family, listed here."""
from __future__ import annotations

from .crosswise_threes import CROSSWISE_THREES
from .magic_eighteen import MAGIC_EIGHTEEN
from .opposite_nines import OPPOSITE_NINES
from .spread_three import SPREAD_THREE
from .step_stool import STEP_STOOL
from .two_pair import TWO_PAIR

FAMILIES = [OPPOSITE_NINES, STEP_STOOL, TWO_PAIR, SPREAD_THREE, CROSSWISE_THREES, MAGIC_EIGHTEEN]
