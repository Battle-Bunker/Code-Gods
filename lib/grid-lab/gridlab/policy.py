"""Simulated gods: when and what to summon.

Disclosure rule: a god sees its own utility function (draw + survival table) and, per object, only
the SUM of the other gods' surprisal (peer surprisal S_-i), never an opponent's function. Only the
`greedy_omniscient` and `cooperative` policies break this (upper bounds).

Value model shared by the greedy policies. An agent is applied to uniformly random objects, so the
value of a candidate program P is estimated over the object population:

    d(P)  = mean over (a sample of) current objects x of Δπ(x -> P(x))    (0 if None or duplicate)
    apps  = interaction_rate * E[remaining time] / (A + 1)                (its expected applications)
    V(P)  = d(P) * apps * discount,       yield(P) = V(P) / cost(P)

Δπ is god i's payoff change on that object: private policies use their exact own surprisal and treat
peer surprisal as fixed, Δπ = (s_i(y) - s_i(x)) * S_-i(x); omniscient ones evaluate every god's
surprisal of y. With defence goals the same rule applies to the payoff of docs/defence-goals.md: a private
god updates its own reward and penalty bits and holds every peer's (signed) bits fixed. All candidate results are evaluated in one `evaluate_batch` call per family.
E[remaining] is the half-life mean (memoryless) for exponential games, the true remainder for fixed.

Other economies (GameConfig.economy, docs/agent-energy.md). Candidates are priced at what the god pays at
summon (energy.summon_bits). With `energy_aware` (default) the greedy family values them accordingly:

    agent_energy:  acts/s = min(agent income / E[bits per act], rate / (A + 1))
                   V(P) = d(P) * acts/s * E[remaining] * discount,   yield = V / summon_bits

Destroying agents (free, no refund; Policy.destroy, called before each decision). The greedy family
destroys an own agent once it has made >= `destroy_min_acts` attempts and its realised own payoff
change per attempt is negative, and, when the god is at max_agents, its worst agent to make room.
On by default under agent_energy (`destroy=None`), off otherwise; `destroy=True/False` forces it.
    owner_pays:    yield = d * apps * discount / (summon_bits + per-commit bits * apps * commit share)
"""
from __future__ import annotations

import hashlib
import inspect
import math
import os
import pickle
from pathlib import Path
from typing import Callable

import numpy as np

from .core import Grid, GridType
from .defence import hinge, payoff_matrix

LIB_VERSION = 1
LIB_DIR = Path(__file__).resolve().parent.parent / ".cache" / "programs"
_LIB: dict = {}


def _factory_tag(factory: Callable) -> str:
    """Identity + source hash of a program factory (and mutators.py beside it), so cost edits invalidate."""
    h = hashlib.sha256(f"{factory.__module__}.{factory.__qualname__}".encode())
    try:
        src = Path(inspect.getsourcefile(factory))
        for f in (src, src.parent / "mutators.py"):
            if f.exists():
                h.update(f.read_bytes())
    except (TypeError, OSError):
        pass
    try:  # runtime cost knobs (experiment sweeps) change prices without changing source
        import json
        from .mutators import COST_KNOBS
        h.update(json.dumps(COST_KNOBS, sort_keys=True, default=str).encode())
    except Exception:
        pass
    return h.hexdigest()


def program_library(gtype: GridType, factory: Callable, size: int = 4096) -> tuple[list, np.ndarray]:
    """A deterministic catalogue of `size` random programs and their costs for a GridType.

    Pricing a program can be expensive (the ratchet probe runs it to closure), so policies draw
    candidates from this library instead of pricing fresh programs at every decision. Seeded from
    sha256(GridType, factory, LIB_VERSION); cached in memory and under .cache/programs/."""
    tag = _factory_tag(factory)
    key = hashlib.sha256(f"{gtype.key}|{tag}|{size}|{LIB_VERSION}".encode()).hexdigest()
    if key in _LIB:
        return _LIB[key]
    path = LIB_DIR / f"{key}.pkl"
    if path.exists():
        try:
            with open(path, "rb") as fh:
                _LIB[key] = pickle.load(fh)
            return _LIB[key]
        except Exception:
            pass
    rng = np.random.default_rng(int(key[:32], 16))
    progs, seen = [], set()
    for _ in range(20 * size):
        p = factory(rng, gtype)
        k = getattr(p, "key", None)
        if k is not None:
            if k in seen:
                continue
            seen.add(k)
        progs.append(p)
        if len(progs) == size:
            break
    costs = np.array([float(p.cost(gtype)) for p in progs])
    _LIB[key] = (progs, costs)
    try:
        LIB_DIR.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(f".tmp{os.getpid()}")
        with open(tmp, "wb") as fh:
            pickle.dump(_LIB[key], fh, protocol=pickle.HIGHEST_PROTOCOL)
        os.replace(tmp, path)
    except Exception:
        pass
    return _LIB[key]


class Policy:
    omniscient = False

    def __init__(self, god: int, world, rng: np.random.Generator, factory: Callable,
                 program_kwargs: dict | None = None, **kw):
        self.god, self.world, self.rng, self.factory = god, world, rng, factory
        self.program_kwargs = program_kwargs or {}
        self.kw = kw

    # --- what this god may see -------------------------------------------------------------------
    def own_s(self) -> np.ndarray:
        return self.world.S[:self.world.M, self.god]

    def peer_s(self) -> np.ndarray:
        S = self.world.S[:self.world.M]
        return S.sum(axis=1) - S[:, self.god]

    def energy(self) -> float:
        return self.world.energy(self.god)

    def sample_program(self):
        return self.sample_programs(1)[0][0]

    def sample_programs(self, k: int) -> tuple[list, np.ndarray]:
        """k candidate programs and their costs (cost_scale applied): from the world's program library
        when there is one, else fresh from the factory."""
        cs = self.world.cfg.cost_scale
        lib = self.world.library
        langs = getattr(self.world, "lang_libraries", None)
        if langs is not None and langs[self.god] is not None:
            return self._sample_with_language(k, langs[self.god], cs)
        if lib is not None and not self.program_kwargs:
            progs, costs = lib
            idx = self.rng.integers(0, len(progs), k)
            ps, cost = [progs[i] for i in idx], costs[idx] * cs
        else:
            ps = [self.factory(self.rng, self.world.gtype, **self.program_kwargs) for _ in range(k)]
            cost = np.array([p.cost(self.world.gtype) * cs for p in ps], float)
        if self.world.cfg.economy != "summon":
            from .energy import profile
            cost = np.array([profile(p, self.world.gtype).summon * cs for p in ps], float)
        return ps, cost

    def _sample_with_language(self, k: int, lang: tuple, cs: float) -> tuple[list, np.ndarray]:
        """agent_language "mix": each candidate is a language agent with probability lang_share, else a
        program (library or factory); "only": language agents only."""
        cfg, (agents, acosts) = self.world.cfg, lang
        if cfg.open_agents != "off":
            share = 1.0 if cfg.open_agents == "only" else cfg.open_share
        else:
            share = 1.0 if cfg.agent_language == "only" else cfg.lang_share
        progs, costs = [], []
        for u in self.rng.random(k):
            if u < share:
                i = int(self.rng.integers(len(agents)))
                progs.append(agents[i]); costs.append(acosts[i])
            elif self.world.library is not None and not self.program_kwargs:
                lp, lc = self.world.library
                i = int(self.rng.integers(len(lp)))
                progs.append(lp[i]); costs.append(lc[i])
            else:
                p = self.factory(self.rng, self.world.gtype, **self.program_kwargs)
                progs.append(p); costs.append(p.cost(self.world.gtype))
        return progs, np.array(costs, float) * cs

    # --- hooks -------------------------------------------------------------------------------------
    def decide(self) -> list:
        return []

    def on_summon(self, aid: int, prog, cost: float) -> None:
        pass

    def on_commit(self, aid: int, obj_index: int, before: np.ndarray, after: np.ndarray,
                  hbefore: np.ndarray | None = None, hafter: np.ndarray | None = None) -> None:
        pass

    def destroy(self) -> list:
        """Ids of own agents to destroy now (free, no refund)."""
        return []


class RandomPolicy(Policy):
    """Summons an affordable random program with probability p each decision."""

    def __init__(self, *a, p: float = 0.5, **kw):
        super().__init__(*a, **kw)
        self.p = p

    def decide(self):
        if self.rng.random() >= self.p:
            return []
        progs, costs = self.sample_programs(1)
        return progs if costs[0] <= self.energy() else []


class GreedyPolicy(Policy):
    """greedy_private: sample K programs, estimate yield over the object population, summon the best
    if its yield exceeds `min_yield` and it is affordable, else save. Optional `learn`: rescale value
    estimates by realised/predicted payoff of this god's own agents (shrunk toward 1)."""

    objective = "own"   # "own" | "total"

    def __init__(self, *a, K: int = 12, M_eval: int = 24, discount: float = 0.5, min_yield: float = 0.0,
                 learn: bool = False, backoff: bool = True, energy_aware: bool = True,
                 destroy: bool | None = None, destroy_min_acts: int = 20, **kw):
        super().__init__(*a, **kw)
        self.K, self.M_eval, self.discount, self.min_yield, self.learn = K, M_eval, discount, min_yield, learn
        self.backoff = backoff
        self.energy_aware = energy_aware
        self.destroy_on = destroy
        self.destroy_min_acts = destroy_min_acts
        self.gain: dict[int, float] = {}       # aid -> realised own payoff change (all own agents)
        self.commit_share = None               # per candidate of the last mean_delta: share of sampled objects changed
        self.skip = 0
        self.fails = 0
        self.pred: dict[int, float] = {}       # aid -> predicted mean Δ per application
        self.realised: dict[int, float] = {}   # aid -> realised Δ sum
        self.last_best: tuple | None = None
        self.best_yields: list[float] = []

    # --- value model -----------------------------------------------------------------------------
    def remaining(self) -> float:
        w, c = self.world, self.world.cfg
        return c.half_life_seconds / math.log(2) if c.length != "fixed" else max(0.0, c.fixed_seconds - max(w.t, 0.0))

    def horizon_apps(self) -> float:
        w, c = self.world, self.world.cfg
        return c.interaction_rate_hz * self.remaining() / (len(w.agents) + 1)

    def acts_per_second(self, progs: list) -> np.ndarray:
        """agent_energy: expected acts/s of each candidate if summoned now (see module docstring)."""
        from .energy import profile
        w, c = self.world, self.world.cfg
        from .energy import naming_bits
        k = c.agent_act_naming
        per = np.array([profile(p, w.gtype).expected + (k * naming_bits(p, w.gtype) if k else 0.0)
                        + c.agent_act_floor_bits for p in progs]) * c.cost_scale
        return np.minimum(c.agent_income / np.maximum(per, 1e-3), c.interaction_rate_hz / (len(w.agents) + 1))

    def scale(self) -> float:
        if not self.learn or not self.pred:
            return 1.0
        w = self.world
        exp = sum(self.pred[a] * w.agent_attempts[a] for a in self.pred)
        got = sum(self.realised.get(a, 0.0) for a in self.pred)
        n = sum(w.agent_attempts[a] for a in self.pred)
        if abs(exp) < 1e-9:
            return 1.0
        r = got / exp
        wgt = n / (n + 200.0)
        return float(np.clip(wgt * r + (1 - wgt) * 1.0, 0.0, 2.0))

    def mean_delta(self, progs: list) -> np.ndarray:
        """d(P) for each candidate: mean Δπ over a sample of current objects, batch-evaluated."""
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
        self.commit_share = np.bincount(np.array(who, np.int64), minlength=len(progs)) / max(len(idx), 1)
        if not who:
            return out
        sym, col = np.stack(sym), np.stack(col)
        who, obj = np.array(who), np.array(obj)
        gods = range(w.G) if self.omniscient else [self.god]
        i = self.god
        Sx, Hx = S[obj], w.H[obj]
        Sy, Hy = Sx.copy(), Hx.copy()   # private gods hold every peer column fixed
        for j in gods:
            d = w.draws[j]
            Sy[:, j] = w.tables[j].surprisal(d.family.evaluate_batch(sym, col, d.params, gt))
            if w.dc.w[j] > 0:
                pd = w.pdraws[j]
                Hy[:, j] = hinge(w.ptables[j].surprisal(pd.family.evaluate_batch(sym, col, pd.params, gt)))
        py, px = payoff_matrix(Sy, Hy, w.dc), payoff_matrix(Sx, Hx, w.dc)
        delta = (py.sum(1) - px.sum(1)) if self.objective == "total" else (py[:, i] - px[:, i])
        np.add.at(out, who, delta)
        return out / len(idx)

    def evaluate(self, K: int):
        e = self.energy()
        cands, costs = self.sample_programs(K)
        ok = costs <= e
        if not ok.any():
            return None
        cands = [p for p, o in zip(cands, ok) if o]
        costs = costs[ok]
        d = self.mean_delta(cands)
        cfg = self.world.cfg
        econ = cfg.economy
        if econ == "summon" or not self.energy_aware:
            apps = self.horizon_apps()
            if cfg.open_agents != "off":      # open agents also pay per application: value against lifetime cost
                pa = np.array([getattr(p, "per_application_bits", 0.0) for p in cands], float)
                costs = costs + pa * cfg.open_app_scale * cfg.cost_scale * apps * self.discount
            y = d * apps * self.discount * self.scale() / np.maximum(costs, 1e-9)
        elif econ == "agent_energy":
            y = d * self.acts_per_second(cands) * self.remaining() * self.discount * self.scale() / np.maximum(costs, 1e-9)
        else:
            from .energy import profile
            apps = self.horizon_apps()
            per = np.array([profile(p, self.world.gtype).analytic for p in cands]) * cfg.cost_scale
            tco = costs + per * apps * self.commit_share
            y = d * apps * self.discount * self.scale() / np.maximum(tco, 1e-9)
        b = int(np.argmax(y))
        return cands[b], float(y[b]), float(d[b])

    def accept(self, yield_: float) -> bool:
        return yield_ > self.min_yield

    def decide(self):
        if self.skip > 0:
            self.skip -= 1
            return []
        r = self.evaluate(self.K)
        if r is None:
            return []
        prog, y, d = r
        self.best_yields.append(y)
        if self.accept(y):
            self.fails = 0
            self.last_best = (prog, d)
            return [prog]
        self.fails += 1
        if self.backoff:
            self.skip = min(self.fails, 4)
        return []

    def on_summon(self, aid, prog, cost):
        if self.last_best is not None and self.last_best[0] is prog:
            self.pred[aid] = self.last_best[1]

    def on_commit(self, aid, oi, before, after, hbefore=None, hafter=None):
        i = self.god
        dc = self.world.dc if hbefore is not None else None
        hb = None if dc is None else hbefore[None, :]
        ha = None if dc is None else hafter[None, :]
        r = float(payoff_matrix(after[None, :], ha, dc)[0, i] - payoff_matrix(before[None, :], hb, dc)[0, i])
        self.gain[aid] = self.gain.get(aid, 0.0) + r
        if self.learn and aid in self.pred:
            self.realised[aid] = self.realised.get(aid, 0.0) + r

    def destroy(self):
        w = self.world
        on = self.destroy_on if self.destroy_on is not None else w.cfg.economy == "agent_energy"
        if not on:
            return []
        mine = [a for a in w.agents if w.agent_owner[a] == self.god]
        rate = {a: self.gain.get(a, 0.0) / w.agent_attempts[a] for a in mine if w.agent_attempts[a] >= self.destroy_min_acts}
        out = [a for a, v in rate.items() if v < 0]
        if not out and len(mine) >= w.cfg.max_agents and rate:
            out = [min(rate, key=rate.get)]
        return out


class OmniscientPolicy(GreedyPolicy):
    """greedy_omniscient: own payoff change evaluated with every god's surprisal of the result."""
    omniscient = True


class CooperativePolicy(GreedyPolicy):
    """cooperative: omniscient, maximises the change in the SUM of all gods' payoffs (welfare)."""
    omniscient = True
    objective = "total"


class SaverPolicy(GreedyPolicy):
    """saver: waits until energy >= `save_fraction` * starting energy, samples more candidates, and
    summons only if the best yield is positive and at least the `q` quantile of its past best yields."""

    def __init__(self, *a, K: int = 32, save_fraction: float = 0.6, q: float = 0.75, **kw):
        super().__init__(*a, K=K, **kw)
        self.save_fraction, self.q = save_fraction, q

    def decide(self):
        if self.energy() < self.save_fraction * self.world.cfg.starting_energy:
            return []
        return super().decide()

    def accept(self, yield_):
        hist = self.best_yields[:-1]
        bar = max(self.min_yield, float(np.quantile(hist, self.q))) if len(hist) >= 4 else self.min_yield
        return yield_ > bar


class SpammerPolicy(Policy):
    """spammer (adversarial baseline): every decision, summon the cheapest of K random programs (by the
    price the god pays) if affordable, whatever it does. Tests whether flooding the world with cheap,
    useless agents pays."""

    def __init__(self, *a, K: int = 12, **kw):
        super().__init__(*a, **kw)
        self.K = K

    def decide(self):
        progs, costs = self.sample_programs(self.K)
        b = int(np.argmin(costs))
        return [progs[b]] if costs[b] <= self.energy() else []


POLICIES = {
    "random": RandomPolicy,
    "spammer": SpammerPolicy,
    "greedy_private": GreedyPolicy,
    "greedy_omniscient": OmniscientPolicy,
    "cooperative": CooperativePolicy,
    "saver": SaverPolicy,
    "idle": Policy,
}


def make_policy(name: str, god: int, world, rng, factory, **kw) -> Policy:
    cls = POLICIES[name]
    per = kw.pop(name, {}) if isinstance(kw.get(name), dict) else {}
    kw = {k: v for k, v in kw.items() if k not in POLICIES}
    return cls(god, world, rng, factory, **{**kw, **per})
