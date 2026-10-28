"""Per-god catalogues of language agents for the simulator (GameConfig.agent_language = "mix" | "only")."""
from __future__ import annotations

from typing import Optional, Sequence

import numpy as np

from ..core import GridType
from .agent import LangAgent
from .examples import template_instances
from .interp import Owner

_SHARED: dict = {}


def lang_libraries(gt: GridType, draws, tables, templates: Optional[Sequence[str]] = None,
                   pricing: Optional[dict] = None) -> list[tuple[list, np.ndarray]]:
    """For each god: (agents, costs). Agents that call score() are bound to (and priced for) that god's
    own utility; the others are shared between gods and priced once."""
    inst = template_instances(gt, templates)
    out = []
    for d, tb in zip(draws, tables):
        owner = Owner(d, tb)
        agents = []
        for name, kind, src in inst:
            if "score" in src:
                agents.append(LangAgent(src, gt, owner, name, kind, pricing))
            else:
                k = (gt, src, repr(sorted((pricing or {}).items())))
                if k not in _SHARED:
                    _SHARED[k] = LangAgent(src, gt, None, name, kind, pricing)
                agents.append(_SHARED[k])
        costs = np.array([a.cost() for a in agents], float)
        out.append((agents, costs))
    return out
