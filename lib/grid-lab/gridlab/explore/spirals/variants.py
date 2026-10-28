"""Named design points for the spirals study (see runner.py for the keys)."""
from __future__ import annotations

from .extend import EXTEND_IDS

VARIANTS: dict = {
    "base": {"name": "base"},
    # --- salience-weighted touch (engine object choice)
    "sel+1": {"name": "sel+1", "select_alpha": 1.0},
    "sel+2": {"name": "sel+2", "select_alpha": 2.0},
    "sel-1": {"name": "sel-1", "select_alpha": -1.0},
    # --- tending clauses: purchasable (half the library offers one) or an engine rule for every agent
    "tend_own": {"name": "tend_own", "tend_prob": 0.5, "tend_mode": "own"},
    "tend_pay": {"name": "tend_pay", "tend_prob": 0.5, "tend_mode": "payoff"},
    "all_own": {"name": "all_own", "tend_all": "own"},
    "all_pay": {"name": "all_pay", "tend_all": "payoff"},
    "all_noharm": {"name": "all_noharm", "tend_all": "noharm"},
    # --- cheap conditional extension
    "extend": {"name": "extend", "extend": list(EXTEND_IDS)},
    "gdisc": {"name": "gdisc", "guard_discount": True},
    # --- spawn / world size
    "obj5": {"name": "obj5", "config": {"starting_objects": 5, "spawn_rate_hz": 0.05}},
    "obj20": {"name": "obj20", "config": {"starting_objects": 20, "spawn_rate_hz": 0.2}},
    "rate20": {"name": "rate20", "config": {"interaction_rate_hz": 20.0}},
}


def combo(name: str, *parts: str, **extra) -> dict:
    v: dict = {}
    for p in parts:
        for k, x in VARIANTS[p].items():
            if k == "name":
                continue
            if k == "config":
                v.setdefault("config", {}).update(x)
            elif k == "extend":
                v["extend"] = sorted(set(v.get("extend", [])) | set(x))
            else:
                v[k] = x
    v.update(extra)
    v["name"] = name
    return v


VARIANTS["tend_pay+sel1"] = combo("tend_pay+sel1", "tend_pay", "sel+1")
VARIANTS["tend_pay+extend"] = combo("tend_pay+extend", "tend_pay", "extend")
VARIANTS["tend_pay+extend+sel1"] = combo("tend_pay+extend+sel1", "tend_pay", "extend", "sel+1")
VARIANTS["extend+sel1"] = combo("extend+sel1", "extend", "sel+1")
