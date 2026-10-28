"""Policies that understand tending clauses (simx.Tended / Ext.tend_all).

The stock value model scores a candidate by the mean Δπ over sampled objects. With a clause, only the
applications that pass it count; everything else is 0. Private gods evaluate the clause with what they
can see (their own surprisal of the result, the current peer aggregate held fixed), so for them "own",
"payoff" and "noharm" are all approximated by "my surprisal rises". Omniscient ones evaluate it exactly.

Registered names: <stock name>_t for greedy_private, greedy_omniscient, cooperative and saver.
"""
from __future__ import annotations

import numpy as np

from ...policy import POLICIES, CooperativePolicy, GreedyPolicy, OmniscientPolicy, SaverPolicy


class TendMixin:
    def _modes(self, progs) -> list:
        forced = getattr(getattr(self.world, "ext", None), "tend_all", None)
        return [forced or getattr(p, "tend", None) for p in progs]

    def mean_delta(self, progs: list) -> np.ndarray:
        w = self.world
        gt = w.gtype
        M = w.M
        idx = np.arange(M) if M <= self.M_eval else self.rng.choice(M, self.M_eval, replace=False)
        S = w.S[:M]
        sym, col, who, obj = [], [], [], []
        for p_i, prog in enumerate(progs):
            for oi in idx:
                y = prog.apply(w.objects[oi], gt, self.rng)
                if y is None or y.key in w.keys:
                    continue
                sym.append(y.sym); col.append(y.col); who.append(p_i); obj.append(oi)
        out = np.zeros(len(progs))
        if not who:
            return out
        sym, col = np.stack(sym), np.stack(col)
        who, obj = np.array(who), np.array(obj)
        gods = range(w.G) if self.omniscient else [self.god]
        snew = {}
        for j in gods:
            d = w.draws[j]
            snew[j] = np.asarray(w.tables[j].surprisal(d.family.evaluate_batch(sym, col, d.params, gt)), float)
        i = self.god
        Sx = S[obj]
        modes = self._modes(progs)
        mode_arr = np.array([modes[p] or "" for p in who])
        if not self.omniscient:
            peer = Sx.sum(axis=1) - Sx[:, i]
            dsi = snew[i] - Sx[:, i]
            delta = dsi * peer
            ok = np.where(mode_arr == "", True, dsi > 1e-9)
        else:
            Sy = np.stack([snew[j] for j in range(w.G)], axis=1)
            py, px = Sy * (Sy.sum(1, keepdims=True) - Sy), Sx * (Sx.sum(1, keepdims=True) - Sx)
            delta = (py.sum(1) - px.sum(1)) if self.objective == "total" else (py[:, i] - px[:, i])
            dS = Sy - Sx
            ok = np.ones(len(who), bool)
            ok[mode_arr == "own"] = (dS[:, i] > 1e-9)[mode_arr == "own"]
            ok[mode_arr == "payoff"] = (py[:, i] > px[:, i] + 1e-9)[mode_arr == "payoff"]
            nh = (dS >= -0.5).all(1) & (dS > 1e-9).any(1)
            ok[mode_arr == "noharm"] = nh[mode_arr == "noharm"]
        np.add.at(out, who, np.where(ok, delta, 0.0))
        return out / len(idx)


class TendGreedy(TendMixin, GreedyPolicy):
    pass


class TendOmniscient(TendMixin, OmniscientPolicy):
    pass


class TendCooperative(TendMixin, CooperativePolicy):
    pass


class TendSaver(TendMixin, SaverPolicy):
    pass


POLICIES.setdefault("greedy_private_t", TendGreedy)
POLICIES.setdefault("greedy_omniscient_t", TendOmniscient)
POLICIES.setdefault("cooperative_t", TendCooperative)
POLICIES.setdefault("saver_t", TendSaver)

TEND_AWARE = {"greedy_private": "greedy_private_t", "greedy_omniscient": "greedy_omniscient_t",
              "cooperative": "cooperative_t", "saver": "saver_t"}
