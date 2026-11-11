"""The beginner pool (lib/game-utilities/src/families/grid/beginner): one module per family, listed here."""
from __future__ import annotations

from .crosswise_threes import CROSSWISE_THREES
from .magic_eighteen import MAGIC_EIGHTEEN
from .leapfrog import LEAPFROG
from .opposite_nines import OPPOSITE_NINES
from .spread_three import SPREAD_THREE
from .strangers import STRANGERS
from .two_pair import TWO_PAIR

FAMILIES = [OPPOSITE_NINES, LEAPFROG, TWO_PAIR, SPREAD_THREE, STRANGERS, CROSSWISE_THREES, MAGIC_EIGHTEEN]
