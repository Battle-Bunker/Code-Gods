"""OpenAgent: an open (plain-Python) agent bound to its owner, with the interface sim.py expects of a Program
(`apply`, `cost`, `cost_terms`, `describe`, `mutator_ids`, `key`, `label`) plus `per_application_bits`."""
from __future__ import annotations

from collections import OrderedDict
from typing import Optional

from ..core import Grid, GridType
from .measure import PRICING, owner_key, price
from .sandbox import CompiledAgent, Owner, derive_seed

MEMO = 4096


class OpenAgent:
    """An agent written in plain Python against the closed mutation API.

    cost() is the summon price (description bits); per_application_bits is charged by the engine on
    every application. A deterministic agent's results are memoised per grid; a randomized one is
    re-run with a fresh play seed every time (`play_seed`)."""

    def __init__(self, src: str, gtype: GridType, owner: Optional[Owner] = None, name: str = "", kind: str = "open",
                 pricing: Optional[dict] = None):
        self.src, self.gtype, self.name, self.kind = src, gtype, name, kind
        self.agent = CompiledAgent(src, gtype)
        if self.agent.calls_score and owner is None:
            raise ValueError(f"{name or 'this agent'} calls score(...) and needs an owner")
        self.owner = owner if self.agent.calls_score else None
        self.pricing = {**PRICING, **(pricing or {})}
        self.key = ("open", src, owner_key(self.owner, gtype))
        self._memo: OrderedDict = OrderedDict()
        self._terms = None
        self.play_salt = 0
        self.applications = 0
        self.summon_scale = 1.0           # energy per description bit (GameConfig.open_summon_scale)

    @property
    def label(self) -> str:
        return f"{self.kind}:{self.name}"

    @property
    def mutator_ids(self) -> tuple:
        return tuple(sorted(self.cost_terms().get("mutators", ())))

    # --- running ---------------------------------------------------------------------------------
    def run(self, grid: Grid, seed: int = 0):
        return self.agent.run(grid, seed, self.owner, self.pricing["step_limit"], self.pricing["randomness"])

    def apply(self, grid: Grid, gtype: GridType = None, rng=None) -> Optional[Grid]:
        randomized = self.cost_terms()["randomized"]
        if not randomized:
            k = grid.key
            y = self._memo.get(k)
            if y is None:
                y = self.run(grid).grid
                self._memo[k] = y
                if len(self._memo) > MEMO:
                    self._memo.popitem(last=False)
            else:
                self._memo.move_to_end(k)
        else:
            u = int(rng.integers(0, 1 << 62)) if rng is not None else self.applications
            self.applications += 1
            y = self.run(grid, derive_seed("play", self.play_salt, u)).grid
        return None if y == grid else y

    # --- cost ------------------------------------------------------------------------------------
    def cost_terms(self, gtype: GridType = None) -> dict:
        if self._terms is None:
            t = price(self.src, self.gtype, self.owner, self.pricing)
            self._terms = t
        return self._terms

    def cost(self, gtype: GridType = None) -> float:
        """The summon price: description bits × summon_scale."""
        return float(self.cost_terms()["summon_bits"]) * self.summon_scale

    @property
    def per_application_bits(self) -> float:
        return float(self.cost_terms()["per_application_bits"])

    # --- text ------------------------------------------------------------------------------------
    def describe(self, gtype: GridType = None) -> str:
        body = self.src.strip().replace("\n", " ⏎ ")
        return f"[{self.name}] {body}" if self.name else body

    def __getstate__(self):
        d = dict(self.__dict__)
        d["_memo"] = OrderedDict()
        d["agent"] = None
        return d

    def __setstate__(self, d):
        self.__dict__.update(d)
        self.agent = CompiledAgent(self.src, self.gtype)
