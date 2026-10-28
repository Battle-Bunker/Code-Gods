"""Per-god catalogues of open agents for the simulator (GameConfig.open_agents = "mix" | "only")."""
from __future__ import annotations

from typing import Optional, Sequence

import numpy as np

from ..core import GridType
from .agent import OpenAgent
from .examples import template_instances
from .sandbox import Owner

_SHARED: dict = {}


def open_libraries(gt: GridType, draws, tables, templates: Optional[Sequence[str]] = None,
                   pricing: Optional[dict] = None, summon_scale: float = 1.0) -> list[tuple[list, np.ndarray]]:
    """For each god: (agents, summon costs). Agents that call score() are bound to (and priced for) that
    god's own utility; the others are shared between gods and priced once. An agent's summon cost is its
    description bits × summon_scale; its per-application bits are charged by the engine."""
    inst = template_instances(gt, templates)
    out = []
    for d, tb in zip(draws, tables):
        owner = Owner(d, tb)
        agents = []
        for name, kind, src in inst:
            if "score" in src:
                a = OpenAgent(src, gt, owner, name, kind, pricing)
            else:
                k = (gt, src, repr(sorted((pricing or {}).items())))
                if k not in _SHARED:
                    _SHARED[k] = OpenAgent(src, gt, None, name, kind, pricing)
                a = _SHARED[k]
            a.summon_scale = summon_scale
            agents.append(a)
        costs = np.array([a.cost() for a in agents], float)
        out.append((agents, costs))
    return out
