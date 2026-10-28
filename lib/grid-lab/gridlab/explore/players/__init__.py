"""Realistic simulated players for Grid Lab (docs/explore/players.md).

Importing this package registers the SmartPolicy presets in gridlab.policy.POLICIES."""
from .policies import PRESETS, SmartPolicy, make_preset, register

register()
from . import extra  # noqa: E402,F401  second-round presets

__all__ = ["PRESETS", "SmartPolicy", "make_preset", "register"]
