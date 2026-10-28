"""Named design points used across the experiments.

  old  the engine defaults as delivered (docs/engine.md) at the real engine's 100 Hz.
  new  the recommended settings found by gridlab.experiments.search (docs/experiments.md §5).
"""
from __future__ import annotations

from .common import BASE, setting

SETTINGS: dict = {
    "old": BASE,
}
