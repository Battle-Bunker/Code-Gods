"""A fork of gridlab.sim.run_game with ecosystem prototypes for the spirals study (shared modules untouched).

With `Ext()` (all defaults) `run_game_x` is bit-identical to `gridlab.sim.run_game` (tests/test_spirals.py).
Prototypes, each off by default:

  select_alpha   object choice weighted by (1 + salience)^alpha instead of uniform (the engine). alpha > 0
                 makes salient objects hit more often ("salience-weighted touch"); < 0 shelters them.
  select_by      "salience" (Σ_i s_i) or "max" (max_i s_i) as the weight's base.
  tend           programs may carry a *tending clause* (see `Tended`): the engine evaluates the result
                 before committing and drops it unless it passes the clause:
                   "own"     the owner's surprisal does not fall and rises for at least one... (Δs_owner > 0)
                   "payoff"  the owner's payoff s_o · S_-o on that object rises
                   "noharm"  nobody's surprisal falls by more than 0.5 bit and someone's rises
                 A rejected application is counted (`counters["tend_reject"]`) and changes nothing.
  tend_all       force every agent's clause (an engine rule instead of a purchasable option).
  library        (programs, costs) used by the policies instead of the stock program library.

Everything else (RNG streams, events, logging) follows gridlab.sim exactly.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Callable, Optional

import numpy as np

from ...core import Grid
from ...sim import (GameConfig, GameLog, World, deal, default_families, default_program_factory, game_duration,
                    payoffs, program_mutator_ids)
from ... import calibrate as cal


@dataclass
class Ext:
    select_alpha: float = 0.0
    select_by: str = "salience"
    heat: float = 0.0              # > 0: object choice weight 1 + heat * h, h = recent salience gains (bits)
    heat_tau: float = 5.0          # e-folding time (s) of h
    tend_all: Optional[str] = None
    library: Optional[tuple] = None
    policy_map: dict = field(default_factory=dict)   # policy name -> replacement name (e.g. tend-aware)

    def is_default(self) -> bool:
        return self.select_alpha == 0.0 and self.tend_all is None and self.heat == 0.0


class Tended:
    """A Program with a tending clause: the engine commits its result only if the clause holds for the
    agent's owner (see module docstring). Price: the wrapped program + `TEND_BITS[mode]` bits."""

    def __init__(self, prog, mode: str):
        self.prog, self.tend = prog, mode

    @property
    def key(self):
        return ("tend", self.tend, self.prog.key)

    @property
    def mutator_ids(self):
        return self.prog.mutator_ids

    @property
    def steps(self):
        return self.prog.steps

    def apply(self, grid, gtype, rng=None):
        return self.prog.apply(grid, gtype, rng)

    def run(self, g, gt):
        return self.prog.run(g, gt)

    def cost(self, gtype) -> float:
        return float(self.prog.cost(gtype)) + TEND_BITS[self.tend]

    def describe(self, gtype) -> str:
        what = {"own": "if it makes the object better for me", "payoff": "if it raises my points on the object",
                "noharm": "if it hurts nobody"}[self.tend]
        return f"{self.prog.describe(gtype)[:-1]}, but only {what}."


# Szilard/Bennett price of the clause: one yes/no measurement of the result against the owner's own
# rule (<= 1 bit) plus naming the clause among 3 (log2 3). "payoff" also reads the peers' aggregate.
TEND_BITS = {"own": 1.0 + math.log2(3), "payoff": 2.0 + math.log2(3), "noharm": 2.0 + math.log2(3)}


def tend_ok(mode: str, owner: int, before: np.ndarray, after: np.ndarray) -> bool:
    if mode == "own":
        return after[owner] > before[owner] + 1e-9
    if mode == "payoff":
        pb = before[owner] * (before.sum() - before[owner])
        pa = after[owner] * (after.sum() - after[owner])
        return pa > pb + 1e-9
    if mode == "noharm":
        d = after - before
        return bool((d >= -0.5).all() and (d > 1e-9).any())
    raise ValueError(mode)


def run_game_x(cfg: GameConfig, ext: Ext | None = None, hook: Optional[Callable] = None,
               tables: Optional[list] = None, commit_hook: Optional[Callable] = None) -> GameLog:
    """gridlab.sim.run_game plus the `Ext` prototypes. `commit_hook(world, oi, aid, before, after)` is
    called after every commit (for traces)."""
    from ...policy import make_policy, program_library
    from . import policies as _xp  # noqa: F401  (registers tend-aware policies)
    ext = ext or Ext()
    ss = np.random.SeedSequence(cfg.seed)
    r_deal, r_world, r_len, *r_pol = [np.random.default_rng(s) for s in ss.spawn(3 + cfg.n_gods)]
    pool = cfg.families if cfg.families is not None else default_families()
    factory = cfg.program_factory or default_program_factory()
    draws = deal(cfg, r_deal, pool)
    gt = cfg.gtype
    if tables is None:
        tables = [cal.survival(d, gt) for d in draws]
    world = World(cfg, draws, tables, r_world)
    if ext.library is not None:
        world.library = ext.library
    elif cfg.program_library:
        world.library = program_library(gt, factory, cfg.program_library)
    world.ext = ext
    duration = game_duration(cfg, r_len)
    names = cfg.policy_list()
    pnames = [ext.policy_map.get(n, n) for n in names]
    pols = [make_policy(pnames[i], i, world, r_pol[i], factory, **cfg.policy_kwargs) for i in range(cfg.n_gods)]

    c_time, c_obj, c_agent, c_before, c_after = [], [], [], [], []
    s_time, s_obj, s_vec = [], [], []
    snap_time, snap_payoff, snap_objs, snap_s = [], [], [], []
    a_cost, a_time, a_mut, a_desc = [], [], [], []
    counters = {"attempts": 0, "none": 0, "duplicate": 0, "commits": 0, "metabolic_skips": 0,
                "decisions": 0, "summons": 0, "tend_reject": 0, "tended_agents": 0}
    tend_of: list = []

    def do_summons(god: int):
        for prog in pols[god].decide() or ():
            cost = float(prog.cost(gt)) * cfg.cost_scale
            aid = world.summon(god, prog, cost)
            if aid is None:
                continue
            counters["summons"] += 1
            mode = ext.tend_all or getattr(prog, "tend", None)
            tend_of.append(mode)
            counters["tended_agents"] += int(mode is not None)
            a_cost.append(cost)
            a_time.append(world.t)
            a_mut.append(program_mutator_ids(prog))
            if cfg.keep_programs:
                a_desc.append(prog.describe(gt))
            pols[god].on_summon(aid, prog, cost)

    offsets = [cfg.decision_interval * (i + 0.5) / cfg.n_gods for i in range(cfg.n_gods)]
    for g0 in range(cfg.starting_objects):
        g = world.spawn_unique()
        v = world.add_object(g)
        s_time.append(0.0); s_obj.append(world.obj_ids[-1]); s_vec.append(v)
    t = -cfg.planning_seconds
    while t < 0:
        world.t = t
        for i in range(cfg.n_gods):
            counters["decisions"] += 1
            do_summons(i)
        t += cfg.decision_interval

    rate = cfg.interaction_rate_hz
    dt = 1.0 / rate if rate > 0 else math.inf
    next_dec = list(offsets)
    next_snap = 0.0
    next_spawn = r_world.exponential(1.0 / cfg.spawn_rate_hz) if cfg.spawn_rate_hz > 0 else math.inf
    met = cfg.metabolic_cost
    rng = r_world
    BLK = 4096
    ublk, upos = rng.random((BLK, 2)), 0
    k = 0
    alpha = ext.select_alpha
    hb = ext.heat
    heat_h = np.zeros(64)          # by object index: heat as of heat_t
    heat_t = np.zeros(64)
    use_max = ext.select_by == "max"
    while True:
        t = k * dt if rate > 0 else math.inf
        while True:
            nd = min(next_dec)
            ev_t = min(next_spawn, nd, next_snap)
            if ev_t > t or ev_t > duration:
                break
            world.t = ev_t
            if ev_t == next_snap:
                M = world.M
                Sm = world.S[:M]
                snap_time.append(ev_t)
                snap_payoff.append(payoffs(Sm).sum(axis=0))
                snap_objs.append(np.array(world.obj_ids, np.int32))
                snap_s.append(Sm.astype(np.float32))
                if hook:
                    hook(world, "snapshot")
                next_snap += cfg.snapshot_interval
            elif ev_t == next_spawn:
                g = world.spawn_unique()
                v = world.add_object(g)
                s_time.append(ev_t); s_obj.append(world.obj_ids[-1]); s_vec.append(v)
                next_spawn += rng.exponential(1.0 / cfg.spawn_rate_hz)
            else:
                i = next_dec.index(nd)
                world.purge_dead()
                counters["decisions"] += 1
                do_summons(i)
                next_dec[i] += cfg.decision_interval
        if t > duration:
            break
        world.t = t
        k += 1
        A = len(world.agents)
        if not A:
            continue
        if upos >= BLK:
            ublk, upos = rng.random((BLK, 2)), 0
        u1, u2 = ublk[upos]
        upos += 1
        M = len(world.objects)
        if hb:
            if len(heat_h) < M:
                heat_h = np.r_[heat_h, np.zeros(len(heat_h))]
                heat_t = np.r_[heat_t, np.zeros(len(heat_t))]
            w = np.cumsum(1.0 + hb * heat_h[:M] * np.exp(-(t - heat_t[:M]) / ext.heat_tau))
            oi = min(int(np.searchsorted(w, u1 * w[-1], side="right")), M - 1)
        elif alpha:
            Sm = world.S[:M]
            base = Sm.max(1) if use_max else Sm.sum(1)
            w = np.cumsum((1.0 + base) ** alpha)
            oi = min(int(np.searchsorted(w, u1 * w[-1], side="right")), M - 1)
        else:
            oi = int(u1 * M)
        aid = world.agents[int(u2 * A)]
        if world.agent_death[aid] <= t:
            world.purge_dead()
            continue
        owner = world.agent_owner[aid]
        if met:
            if world.energy(owner) < met:
                counters["metabolic_skips"] += 1
                continue
            world.spent[owner] += met
        counters["attempts"] += 1
        world.agent_attempts[aid] += 1
        old = world.objects[oi]
        new = world.agent_prog[aid].apply(old, gt, rng)
        if new is None:
            counters["none"] += 1
            continue
        nk = new.key
        if nk in world.keys:
            counters["duplicate"] += 1
            continue
        S = world.S
        mode = tend_of[aid]
        if mode is not None:
            after = world.svec(new)
            if not tend_ok(mode, owner, S[oi], after):
                counters["tend_reject"] += 1
                continue
        world.keys.discard(old.key)
        world.keys.add(nk)
        world.objects[oi] = new
        before = S[oi].copy()
        if mode is None:
            after = world.svec(new)
        S[oi] = after
        if hb:
            gain = float(after.sum() - before.sum())
            heat_h[oi] = heat_h[oi] * math.exp(-(t - heat_t[oi]) / ext.heat_tau) + max(gain, 0.0)
            heat_t[oi] = t
        counters["commits"] += 1
        c_time.append(t); c_obj.append(world.obj_ids[oi]); c_agent.append(aid)
        c_before.append(before); c_after.append(after)
        pols[owner].on_commit(aid, oi, before, after)
        if commit_hook:
            commit_hook(world, oi, aid, before, after)

    world.t = duration
    if hook:
        hook(world, "end")
    M = world.M
    G = cfg.n_gods
    f32 = np.float32
    Sm = world.S[:M]
    log = GameLog(
        config=cfg.summary(), gtype=gt, families=[d.family.id for d in draws],
        params=[cal.canonical_json(d.params) for d in draws], policies=names, duration=duration,
        c_time=np.array(c_time, f32), c_obj=np.array(c_obj, np.int32), c_agent=np.array(c_agent, np.int32),
        c_before=np.array(c_before, f32).reshape(-1, G), c_after=np.array(c_after, f32).reshape(-1, G),
        a_owner=np.array(world.agent_owner, np.int8), a_time=np.array(a_time, f32), a_cost=np.array(a_cost, f32),
        a_mutators=a_mut, a_desc=a_desc if cfg.keep_programs else None,
        a_attempts=np.array(world.agent_attempts, np.int32),
        s_time=np.array(s_time, f32), s_obj=np.array(s_obj, np.int32), s_vec=np.array(s_vec, f32).reshape(-1, G),
        snap_time=np.array(snap_time, f32), snap_payoff=np.array(snap_payoff, f32).reshape(-1, G),
        snap_objs=snap_objs, snap_s=snap_s,
        final_obj=np.array(world.obj_ids, np.int32), final_s=Sm.astype(f32),
        final_sym=np.array([g.sym for g in world.objects], np.uint8),
        final_col=np.array([g.col for g in world.objects], np.uint8),
        final_payoff=payoffs(Sm).sum(axis=0).astype(f32),
        final_energy=np.array([world.energy(i) for i in range(G)], f32), spent=world.spent.astype(f32),
        counters=counters,
    )
    log.a_tend = list(tend_of)
    return log
