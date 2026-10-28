"""Every brainstorm utility function, converted to ordinal form, split by lens.

`FAMILIES` lists them all (seeds first); `by_id(id)` looks one up. See docs/rules.md.
"""
from __future__ import annotations

from ..family import Family
from . import seeds, geometry, arithmetic, colour, games, strategy

FAMILIES: list[Family] = [*seeds.FAMILIES, *strategy.FAMILIES, *geometry.FAMILIES, *arithmetic.FAMILIES,
                          *colour.FAMILIES, *games.FAMILIES]

_BY_ID = {f.id: f for f in FAMILIES}
assert len(_BY_ID) == len(FAMILIES), "duplicate family id"

LENS = {f.id: mod.__name__.rsplit(".", 1)[-1]
        for mod in (seeds, geometry, arithmetic, colour, games, strategy) for f in mod.FAMILIES}


def by_id(id: str) -> Family:
    return _BY_ID[id]


def shortlist() -> list[Family]:
    return [f for f in FAMILIES if "shortlist" in f.tags]


__all__ = ["FAMILIES", "by_id", "shortlist", "LENS"]
