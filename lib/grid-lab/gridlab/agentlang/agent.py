"""LangAgent: a compiled language agent bound to its owner, with the interface sim.py expects of a Program
(`apply`, `cost`, `cost_terms`, `describe`, `mutator_ids`, `key`)."""
from __future__ import annotations

from collections import OrderedDict
from typing import Optional

from ..core import Grid, GridType
from .elab import elaborate, unparse
from .interp import STEP_LIMIT, Owner, run
from .lang import Node
from .pricing import PRICING, owner_key, price, uses_score

MEMO = 4096


def _mutators_in(n, gt) -> tuple:
    out = set()

    def rec(x):
        if isinstance(x, Node):
            if x.tag in ("ConstCall", "DynCall"):
                out.add(x.val[0])
            elif x.tag == "Moves":
                out.add(x.val)
            elif x.tag == "EveryMove":
                out.add("every_move")
            for k in x.kids:
                rec(k)
        elif isinstance(x, (tuple, list)):
            for k in x:
                rec(k)
    rec(n)
    return tuple(sorted(out))


class LangAgent:
    """An agent written in the agent language. `owner` (an interp.Owner) is required if it calls score()."""

    def __init__(self, src: str, gtype: GridType, owner: Optional[Owner] = None, name: str = "", kind: str = "lang",
                 pricing: Optional[dict] = None, step_limit: Optional[int] = None):
        self.src, self.gtype, self.name, self.kind = src, gtype, name, kind
        self.prog: Node = elaborate(src, gtype)
        self.uses_score = uses_score(self.prog)
        if self.uses_score and owner is None:
            raise ValueError(f"{name or 'this agent'} calls score(...) and needs an owner")
        self.owner = owner if self.uses_score else None
        self.pricing = {**PRICING, **(pricing or {})}
        self.step_limit = step_limit or self.pricing["step_limit"]
        self.mutator_ids = _mutators_in(self.prog, gtype)
        self.key = ("lang", repr(self.prog.canon()), owner_key(self.owner, gtype))
        self._memo: OrderedDict = OrderedDict()
        self._terms = None

    @property
    def label(self) -> str:
        return f"{self.kind}:{self.name}"

    # --- running ---------------------------------------------------------------------------------
    def run(self, grid: Grid, gtype: GridType = None) -> Grid:
        k = grid.key
        y = self._memo.get(k)
        if y is None:
            y = run(self.prog, self.gtype, grid, self.owner, self.step_limit, record=False).grid
            self._memo[k] = y
            if len(self._memo) > MEMO:
                self._memo.popitem(last=False)
        else:
            self._memo.move_to_end(k)
        return y

    def apply(self, grid: Grid, gtype: GridType = None, rng=None) -> Optional[Grid]:
        y = self.run(grid)
        return None if y == grid else y

    # --- cost ------------------------------------------------------------------------------------
    def cost_terms(self, gtype: GridType = None) -> dict:
        if self._terms is None:
            self._terms = price(self.prog, self.gtype, self.owner, self.pricing)
        return self._terms

    def cost(self, gtype: GridType = None) -> float:
        return float(self.cost_terms()["total"])

    # --- text ------------------------------------------------------------------------------------
    def describe(self, gtype: GridType = None) -> str:
        body = unparse(self.prog, self.gtype).strip().replace("\n", " ⏎ ")
        return f"[{self.name}] {body}" if self.name else body

    def __getstate__(self):
        d = dict(self.__dict__)
        d["_memo"] = OrderedDict()
        return d
