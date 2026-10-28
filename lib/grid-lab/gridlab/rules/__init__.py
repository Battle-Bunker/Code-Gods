"""Every brainstorm utility function, converted to ordinal form, split by lens.

`FAMILIES` lists them all (seeds first); `by_id(id)` looks one up. See docs/rules.md. Shortlisted
families carry a kid-readable `card_source` (rules/cards.py, docs/kid-cards.md).
"""
from __future__ import annotations

from dataclasses import replace

from ..family import Family
from . import seeds, geometry, arithmetic, colour, games, strategy
from .cards import CARDS

# Kid-readable cards (rules/cards.py) are attached here so each rule module stays about the maths.
FAMILIES: list[Family] = [replace(f, card_source=CARDS[f.id]) if f.id in CARDS else f
                          for f in (*seeds.FAMILIES, *strategy.FAMILIES, *geometry.FAMILIES, *arithmetic.FAMILIES,
                                    *colour.FAMILIES, *games.FAMILIES)]

_BY_ID = {f.id: f for f in FAMILIES}
assert len(_BY_ID) == len(FAMILIES), "duplicate family id"

# Defence goals (docs/defence-goals.md): opt-in, so FAMILIES and its dealing stay as they were.
from . import defence  # noqa: E402

DEFENCE_FAMILIES: list[Family] = list(defence.FAMILIES)
PENALTIES: list[Family] = list(defence.PENALTIES)
for _f in [*DEFENCE_FAMILIES, *PENALTIES, *defence.REWARDS]:
    assert _f.id not in _BY_ID, f"duplicate family id {_f.id}"
    _BY_ID[_f.id] = _f

LENS = {f.id: mod.__name__.rsplit(".", 1)[-1]
        for mod in (seeds, geometry, arithmetic, colour, games, strategy) for f in mod.FAMILIES}


def by_id(id: str) -> Family:
    return _BY_ID[id]


def shortlist() -> list[Family]:
    return [f for f in FAMILIES if "shortlist" in f.tags]


__all__ = ["FAMILIES", "by_id", "shortlist", "LENS", "DEFENCE_FAMILIES", "PENALTIES"]
