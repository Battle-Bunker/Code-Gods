"""Named design points used across the experiments.

  old   the engine defaults as delivered (docs/engine.md) at the real engine's 100 Hz, flatten disabled.
  new   the successive-halving winner, verbatim (docs/experiments.md §4.2, rung 2 #0).
  core  the principled subset of `new`: more objects, fewer agents, bijections priced x2, flatten on.
        This is what the code defaults were changed to (docs/experiments.md §5).
"""
from __future__ import annotations

from .common import BASE, merge

SETTINGS: dict = {
    "old": BASE,
    "new": merge(BASE, {
        "config": {"metabolic_cost": 0.01, "agent_half_life": 400.0, "max_agents": 12, "spawn_rate_hz": 0.5,
                   "starting_objects": 80, "dealer": "uniform"},
        "knobs": {"erasure": "hartley", "kind": {"bijective": 2.0}, "disabled": []},
        "exclude_low_ceiling": 20.0,
    }),
    "core": merge(BASE, {
        "config": {"max_agents": 12, "spawn_rate_hz": 0.5, "starting_objects": 80},
        "knobs": {"kind": {"bijective": 2.0}, "disabled": []},
    }),
}
SETTINGS["core_nobij"] = merge(SETTINGS["core"], {"knobs": {"kind": {"bijective": 1.0}}})
SETTINGS["supply"] = merge(BASE, {"config": {"spawn_rate_hz": 0.5, "starting_objects": 80}})
