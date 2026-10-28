"""Named economy design points and the one-at-a-time sweep groups.

Scale guide (engine defaults, 100 Hz, 4 gods): each god earns 1 energy/s and its agents get on the order of
100/G = 25 application attempts per second, so a gas of 0.01 per attempt is about 25% of income once a
god holds its share of the agents, and 0.04 is about all of it.
"""
from __future__ import annotations

from .batch import esetting

NAMED: dict = {"old": esetting()}


def _g(group: str, vals, f):
    return [(f"{group}={v}", f(v)) for v in vals]


SWEEP: dict = {
    "start": _g("start", [25, 50, 200, 400], lambda v: esetting(config={"starting_energy": float(v)})),
    "rate": _g("rate", [0.25, 0.5, 2.0, 4.0], lambda v: esetting(config={"energy_per_second": v})),
    "cscale": _g("cscale", [0.25, 0.5, 2.0, 4.0], lambda v: esetting(config={"cost_scale": v})),
    "cap": _g("cap", [5, 10, 20, 50], lambda v: esetting(config={"max_agents": v})),
    "gas": _g("gas", [0.005, 0.01, 0.02, 0.04], lambda v: esetting(econ={"gas": v})),
    "gasfrac": _g("gasfrac", [0.0005, 0.001, 0.002], lambda v: esetting(econ={"gas_frac": v})),
    "starve": _g("starve", [0.01, 0.02], lambda v: esetting(econ={"gas": v, "unpaid": "starve"})),
    "refund": _g("refund", [0.5, 1.0], lambda v: esetting(econ={"gas": 0.02, "refund": v})),
    "halflife": _g("halflife", [30, 60, 120, 240], lambda v: esetting(econ={"half_life": float(v)})),
    "lifetime": _g("lifetime", [60, 120], lambda v: esetting(econ={"lifetime": float(v)})),
    "charges": _g("charges", [100, 300, 1000, 3000], lambda v: esetting(econ={"charges": v})),
    "ccharges": _g("ccharges", [10, 30, 100], lambda v: esetting(econ={"charges": v, "charge_on": "commit"})),
    "crowd": _g("crowd", [0.05, 0.1, 0.25], lambda v: esetting(econ={"crowd_tax": v})),
    "ecap": _g("ecap", [30, 60, 120], lambda v: esetting(econ={"energy_cap": float(v)})),
    "tilt": _g("tilt", [-1.0, -0.5, 0.5, 1.0], lambda v: esetting(econ={"income_tilt": v})),
    "iown": _g("iown", [0.1, 0.25, 0.5, 1.0], lambda v: esetting(econ={"income_own": v})),
    "iany": _g("iany", [0.05, 0.1, 0.25], lambda v: esetting(econ={"income_any": v})),
}
for _grp in SWEEP.values():
    for _n, _st in _grp:
        NAMED[_n] = _st
