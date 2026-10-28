"""Game simulator (SPEC §1): a fixed-step interaction loop with Poisson spawns and periodic god decisions.

Time is world seconds. A planning phase (t in [-planning_seconds, 0)) lets gods summon with their
starting energy before any interaction; the running phase lasts `duration` seconds (exponential with
the configured half-life, or fixed). During running:

  * interactions fire every 1/interaction_rate_hz seconds while any agent exists: one uniformly
    random object and one uniformly random agent (over ALL gods' agents); the agent's Program is
    applied; the result is committed unless it is None or equals an existing object (incl. itself);
  * spawns arrive as a Poisson process at spawn_rate_hz (redrawn on collision);
  * every god's policy is consulted every `decision_interval` seconds (staggered);
  * snapshots (per-god total payoff, per-object surprisal vectors) every `snapshot_interval`.

Rate scaling: the real engine caps interactions at 100 Hz. With energy accruing at energy_per_second,
what matters for dynamics is interactions per energy unit and per agent. Running at 20 Hz is 5x
cheaper; to mimic 100 Hz, scale `energy_per_second` and `starting_energy` down by 5 (or the half-life
up by 5 at fixed energy). Metrics normalised per commit are rate-free.

Alternative economies (off by default): `metabolic_cost` charges the owner per application attempt
(an agent whose owner cannot pay is skipped), `agent_half_life` gives agents exponential lifetimes.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field, asdict
from typing import Callable, Optional, Sequence

import numpy as np

from .core import Grid, GridType, spawn
from .family import Draw, Family
from . import calibrate as cal
from . import defence as dfn


# ------------------------------------------------------------------------------------------------
# providers (real modules when present; injectable for tests)
# ------------------------------------------------------------------------------------------------
def default_families() -> list[Family]:
    """gridlab.rules.FAMILIES; until that exists, every Family found in gridlab/rules/*.py."""
    try:
        from .rules import FAMILIES  # rules worker
        return list(FAMILIES)
    except ImportError:
        import importlib, pkgutil
        from . import rules
        out, seen = [], set()
        for mod in pkgutil.iter_modules(rules.__path__):
            if mod.name.startswith("_"):
                continue
            m = importlib.import_module(f"{rules.__name__}.{mod.name}")
            for v in vars(m).values():
                if isinstance(v, Family) and v.id not in seen:
                    seen.add(v.id)
                    out.append(v)
        if not out:
            raise
        return out


def default_program_factory() -> Callable:
    from .program import random_program  # mutator worker
    return random_program


def program_mutator_ids(prog) -> tuple[str, ...]:
    """Mutator ids used by a Program (tolerant of the Program/step representation)."""
    m = getattr(prog, "mutator_ids", None)
    if m is not None:
        return tuple(m() if callable(m) else m)
    out = []
    for s in getattr(prog, "steps", ()):
        mid = None
        for attr in ("mutator_id", "id"):
            if isinstance(getattr(s, attr, None), str):
                mid = getattr(s, attr)
                break
        if mid is None:
            mu = getattr(s, "mutator", None)
            if mu is None and isinstance(s, (tuple, list)) and s:
                mu = s[0]
            mid = getattr(mu, "id", str(mu))
        out.append(mid)
    return tuple(out)


# ------------------------------------------------------------------------------------------------
# config
# ------------------------------------------------------------------------------------------------
@dataclass
class GameConfig:
    gtype: GridType = field(default_factory=GridType)
    n_gods: int = 4
    # dealing: "uniform" (iid over available families), "distinct" (no repeats while possible),
    # "balanced_camps" (round-robin over clumper/alternator/neutral camps), "fixed" (fixed_families)
    dealer: str = "distinct"
    fixed_families: Optional[Sequence[str]] = None
    # dealer constraints (any dealer except "fixed"): never deal these family ids; and for each group
    # in dealer_require, deal at least one family from that group (a random slot is replaced if needed)
    dealer_exclude: Sequence[str] = ()
    dealer_require: Sequence[Sequence[str]] = ()
    families: Optional[Sequence[Family]] = None          # pool; default gridlab.rules.FAMILIES
    # economy
    starting_energy: float = 100.0
    energy_per_second: float = 1.0
    cost_scale: float = 1.0
    metabolic_cost: float = 0.0
    agent_half_life: Optional[float] = None
    max_agents: int = 200
    # rates
    # Defaults changed by the experiment worker (docs/experiments.md §5). Old values: interaction 20 Hz
    # (the real engine runs 100 Hz), spawns 0.1 Hz, 10 starting objects. More objects dilute the
    # per-object hit rate from ~3.6/s to ~0.55/s: memory 0.28 -> 0.63, held climbs 1.7 -> 13.8 per 100 s.
    interaction_rate_hz: float = 100.0
    spawn_rate_hz: float = 0.5
    starting_objects: int = 80
    # length
    length: str = "exponential"                          # "exponential" | "fixed"
    half_life_seconds: float = 300.0
    fixed_seconds: float = 300.0
    planning_seconds: float = 60.0
    # gods
    policies: Sequence[str] | str = "greedy_private"
    policy_kwargs: dict = field(default_factory=dict)
    decision_interval: float = 2.0
    program_factory: Optional[Callable] = None           # default gridlab.program.random_program
    program_library: int = 4096                          # candidate catalogue size (0: price fresh programs)
    # logging
    snapshot_interval: float = 5.0
    keep_programs: bool = False                          # store Program.describe() per agent
    seed: int = 0
    # defence goals (docs/defence-goals.md); inert unless a dealt family has a `penalty`
    score_penalties: bool = True                         # False: compute and log penalties but do not score them
    payoff_mode: str = "floored"                         # "floored" | "gated" | "private" (defence.payoff_matrix)
    penalty_rate: str | float = "prior"                  # "private" mode: K_i = Σ_{j≠i} E_μ[s⁺_j], or bits per peer
    penalty_weight: float = 1.0                          # multiplies penalty bits

    def policy_list(self) -> list[str]:
        p = [self.policies] * self.n_gods if isinstance(self.policies, str) else list(self.policies)
        assert len(p) == self.n_gods, "one policy per god"
        return p

    def summary(self) -> dict:
        d = {k: v for k, v in asdict(self).items() if k not in ("gtype", "families", "program_factory")}
        d["gtype"] = self.gtype.key
        return d


# ------------------------------------------------------------------------------------------------
# dealing
# ------------------------------------------------------------------------------------------------
def deal(cfg: GameConfig, rng: np.random.Generator, pool: Sequence[Family]) -> list[Draw]:
    excl = set(cfg.dealer_exclude or ())
    fams = [f for f in pool if f.available(cfg.gtype) and (cfg.dealer == "fixed" or f.id not in excl)]
    assert fams, f"no family available for {cfg.gtype.key}"
    G = cfg.n_gods
    if cfg.dealer == "fixed":
        by = {f.id: f for f in pool}
        chosen = [by[i] for i in cfg.fixed_families][:G]
    elif cfg.dealer == "uniform":
        chosen = [fams[int(rng.integers(len(fams)))] for _ in range(G)]
    elif cfg.dealer == "distinct":
        order = list(rng.permutation(len(fams)))
        while len(order) < G:
            order += list(rng.permutation(len(fams)))
        chosen = [fams[i] for i in order[:G]]
    elif cfg.dealer == "balanced_camps":
        camps: dict[str, list[Family]] = {}
        for f in fams:
            camps.setdefault(f.camp, []).append(f)
        names = sorted(camps)
        names = [names[i] for i in rng.permutation(len(names))]
        decks = {c: [camps[c][i] for i in rng.permutation(len(camps[c]))] for c in names}
        chosen, k = [], 0
        while len(chosen) < G:
            c = names[k % len(names)]
            deck = decks[c]
            chosen.append(deck[(k // len(names)) % len(deck)])
            k += 1
    else:
        raise ValueError(f"unknown dealer {cfg.dealer}")
    if cfg.dealer != "fixed" and cfg.dealer_require:
        by = {f.id: f for f in fams}
        locked: set[int] = set()
        for group in cfg.dealer_require:
            opts = [by[i] for i in group if i in by]
            if not opts:
                continue
            have = [k for k, f in enumerate(chosen) if f.id in group and k not in locked]
            if have:
                locked.add(have[0])
                continue
            free = [k for k in range(G) if k not in locked]
            if not free:
                continue
            k = free[int(rng.integers(len(free)))]
            ids = {f.id for f in chosen}
            fresh = [f for f in opts if f.id not in ids] or opts
            chosen[k] = fresh[int(rng.integers(len(fresh)))]
            locked.add(k)
    return [Draw(f, f.sample(rng, cfg.gtype)) for f in chosen]


# ------------------------------------------------------------------------------------------------
# log
# ------------------------------------------------------------------------------------------------
@dataclass
class GameLog:
    config: dict
    gtype: GridType
    families: list[str]
    params: list[dict]
    policies: list[str]
    duration: float
    # commits (K rows)
    c_time: np.ndarray = None     # float32 (K,)
    c_obj: np.ndarray = None      # int32 (K,) object id
    c_agent: np.ndarray = None    # int32 (K,) agent id
    c_before: np.ndarray = None   # float32 (K, G) surprisal vector before
    c_after: np.ndarray = None    # float32 (K, G) after
    # agents (A rows)
    a_owner: np.ndarray = None    # int8
    a_time: np.ndarray = None     # float32 summon time
    a_cost: np.ndarray = None     # float32
    a_mutators: list = None       # list[tuple[str, ...]]
    a_desc: list = None           # list[str] when keep_programs
    a_attempts: np.ndarray = None # int32 applications attempted
    # spawns (incl. starting objects at t=0)
    s_time: np.ndarray = None
    s_obj: np.ndarray = None
    s_vec: np.ndarray = None      # float32 (n, G)
    # snapshots
    snap_time: np.ndarray = None  # float32 (T,)
    snap_payoff: np.ndarray = None  # float32 (T, G) total payoff
    snap_objs: list = None        # list of int32 arrays of object ids
    snap_s: list = None           # list of float32 (M_t, G)
    # final world
    final_obj: np.ndarray = None
    final_s: np.ndarray = None
    final_sym: np.ndarray = None  # uint8 (M, N, N)
    final_col: np.ndarray = None
    final_payoff: np.ndarray = None
    final_energy: np.ndarray = None
    spent: np.ndarray = None
    counters: dict = None
    # defence goals: penalty bits h (soft-hinged, uncentred; 0 for gods without one). Present in every log.
    c_hbefore: np.ndarray = None  # float32 (K, G)
    c_hafter: np.ndarray = None
    s_hvec: np.ndarray = None     # float32 (n, G) at spawn
    snap_h: list = None           # list of float32 (M_t, G)
    final_h: np.ndarray = None    # float32 (M, G)
    has_penalty: np.ndarray = None  # bool (G,)
    penalty_K: np.ndarray = None    # float (G,) rate used in the payoff (0 if unscored)
    penalty_K_prior: np.ndarray = None
    penalty_hbar: np.ndarray = None
    score_penalties: bool = True
    defence: "dfn.DefenceConstants" = None

    @property
    def n_gods(self) -> int:
        return len(self.families)

    def mutator_ids_of_commits(self) -> list[tuple[str, ...]]:
        return [self.a_mutators[a] for a in self.c_agent]

    def final_ranks(self) -> np.ndarray:
        """1 = highest final total payoff (ties share the better rank)."""
        p = self.final_payoff
        return np.array([1 + int((p > x).sum()) for x in p])


def payoffs(S: np.ndarray, H: np.ndarray | None = None, dc: "dfn.DefenceConstants | None" = None) -> np.ndarray:
    """Per-object payoff matrix π[x, i] = s_i(x) * S_-i(x) for a surprisal matrix S (M, G); with penalty
    bits H (M, G) and defence constants, the defence scoring of docs/defence-goals.md (defence.payoff_matrix)."""
    return dfn.payoff_matrix(S, H, dc)


def log_payoffs(log: "GameLog", S: np.ndarray, H: np.ndarray | None) -> np.ndarray:
    """payoffs() with a log's defence constants."""
    return payoffs(S, H, log.defence)


# ------------------------------------------------------------------------------------------------
# simulation
# ------------------------------------------------------------------------------------------------
class World:
    """Mutable game state; policies read it through policy.Observation."""

    def __init__(self, cfg: GameConfig, draws: list[Draw], tables: list[cal.Survival], rng: np.random.Generator,
                 ptables: Optional[list] = None):
        self.cfg, self.gtype, self.draws, self.tables, self.rng = cfg, cfg.gtype, draws, tables, rng
        self.G = len(draws)
        # defence goals: penalty draws/tables (None per god without one) and the payoff constants
        self.pdraws = [d.penalty_draw() for d in draws]
        self.ptables = ptables if ptables is not None else [None if pd is None else cal.survival(pd, cfg.gtype)
                                                            for pd in self.pdraws]
        self.dc = dfn.constants(tables, self.ptables, cfg.penalty_rate, cfg.penalty_weight, cfg.score_penalties,
                                cfg.payoff_mode)
        self.has_penalty = bool(self.dc.any)
        self.H = np.zeros((64, self.G))
        self.objects: list[Grid] = []
        self.obj_ids: list[int] = []
        self.keys: set[bytes] = set()
        self.S = np.zeros((64, self.G))
        self.next_obj_id = 0
        self.t = -cfg.planning_seconds
        self.spent = np.zeros(self.G)
        self.agents: list = []          # live agent ids
        self.agent_prog: list = []      # by agent id
        self.agent_owner: list[int] = []
        self.agent_death: list[float] = []
        self.agent_attempts: list[int] = []
        self.own_count = [0] * self.G
        self.library = None                 # (programs, costs) or None

    # --- state helpers -------------------------------------------------------------------------
    @property
    def M(self) -> int:
        return len(self.objects)

    def energy(self, god: int) -> float:
        c = self.cfg
        return c.starting_energy + c.energy_per_second * (self.t + c.planning_seconds) - self.spent[god]

    def svec(self, g: Grid) -> np.ndarray:
        gt = self.gtype
        return np.array([tb.surprisal(d.ordinal(g, gt)) for d, tb in zip(self.draws, self.tables)])

    def hvec(self, g: Grid) -> np.ndarray:
        """Penalty bits h_i(g) per god (0 for gods without a defence goal)."""
        gt = self.gtype
        return np.array([dfn.penalty_bits(pd, pt, g, gt) for pd, pt in zip(self.pdraws, self.ptables)])

    def surprisal_matrix(self) -> np.ndarray:
        return self.S[:self.M]

    def payoff_matrix(self) -> np.ndarray:
        M = self.M
        if not self.has_penalty:
            return payoffs(self.S[:M])
        return payoffs(self.S[:M], self.H[:M], self.dc)

    def total_payoff(self) -> np.ndarray:
        return self.payoff_matrix().sum(axis=0)

    def add_object(self, g: Grid) -> np.ndarray:
        if self.M >= len(self.S):
            self.S = np.vstack([self.S, np.zeros_like(self.S)])
            self.H = np.vstack([self.H, np.zeros_like(self.H)])
        self.objects.append(g)
        self.obj_ids.append(self.next_obj_id)
        self.next_obj_id += 1
        self.keys.add(g.key)
        v = self.svec(g)
        self.S[self.M - 1] = v
        if self.has_penalty:
            self.H[self.M - 1] = self.hvec(g)
        return v

    def spawn_unique(self) -> Grid:
        while True:
            g = spawn(self.gtype, self.rng)
            if g.key not in self.keys:
                return g

    def summon(self, god: int, prog, cost: float) -> int | None:
        if self.own_count[god] >= self.cfg.max_agents or self.energy(god) < cost:
            return None
        aid = len(self.agent_prog)
        self.spent[god] += cost
        self.agent_prog.append(prog)
        self.agent_owner.append(god)
        hl = self.cfg.agent_half_life
        self.agent_death.append(math.inf if not hl else max(self.t, 0.0) + self.rng.exponential(hl / math.log(2)))
        self.agent_attempts.append(0)
        self.agents.append(aid)
        self.own_count[god] += 1
        return aid

    def purge_dead(self) -> None:
        if self.cfg.agent_half_life:
            live = [a for a in self.agents if self.agent_death[a] > self.t]
            for a in self.agents:
                if self.agent_death[a] <= self.t:
                    self.own_count[self.agent_owner[a]] -= 1
            self.agents = live


def game_duration(cfg: GameConfig, rng: np.random.Generator) -> float:
    if cfg.length == "fixed":
        return float(cfg.fixed_seconds)
    return float(rng.exponential(cfg.half_life_seconds / math.log(2)))


def run_game(cfg: GameConfig, hook: Optional[Callable[[World, str], None]] = None,
             tables: Optional[list] = None) -> GameLog:
    """Simulate one game. `hook(world, event)` is called at each snapshot ("snapshot") and at the end
    ("end"), for tracing."""
    from .policy import make_policy

    ss = np.random.SeedSequence(cfg.seed)
    r_deal, r_world, r_len, *r_pol = [np.random.default_rng(s) for s in ss.spawn(3 + cfg.n_gods)]
    pool = cfg.families if cfg.families is not None else default_families()
    factory = cfg.program_factory or default_program_factory()
    draws = deal(cfg, r_deal, pool)
    gt = cfg.gtype
    if tables is None:
        tables = [cal.survival(d, gt) for d in draws]
    world = World(cfg, draws, tables, r_world)
    hp = world.has_penalty
    if cfg.program_library:
        from .policy import program_library
        world.library = program_library(gt, factory, cfg.program_library)
    duration = game_duration(cfg, r_len)
    names = cfg.policy_list()
    pols = [make_policy(names[i], i, world, r_pol[i], factory, **cfg.policy_kwargs) for i in range(cfg.n_gods)]

    # logs
    c_time, c_obj, c_agent, c_before, c_after = [], [], [], [], []
    s_time, s_obj, s_vec = [], [], []
    snap_time, snap_payoff, snap_objs, snap_s = [], [], [], []
    c_hb, c_ha, s_h, snap_h = [], [], [], []
    a_cost, a_time, a_mut, a_desc = [], [], [], []
    counters = {"attempts": 0, "none": 0, "duplicate": 0, "commits": 0, "metabolic_skips": 0,
                "decisions": 0, "summons": 0}

    def do_summons(god: int):
        for prog in pols[god].decide() or ():
            cost = float(prog.cost(gt)) * cfg.cost_scale
            aid = world.summon(god, prog, cost)
            if aid is None:
                continue
            counters["summons"] += 1
            a_cost.append(cost)
            a_time.append(world.t)
            a_mut.append(program_mutator_ids(prog))
            if cfg.keep_programs:
                a_desc.append(prog.describe(gt))
            pols[god].on_summon(aid, prog, cost)

    # --- planning phase: decisions only ---------------------------------------------------------
    offsets = [cfg.decision_interval * (i + 0.5) / cfg.n_gods for i in range(cfg.n_gods)]
    for g0 in range(cfg.starting_objects):
        g = world.spawn_unique()
        v = world.add_object(g)
        s_time.append(0.0); s_obj.append(world.obj_ids[-1]); s_vec.append(v)
        s_h.append(world.H[world.M - 1].copy())
    t = -cfg.planning_seconds
    while t < 0:
        world.t = t
        for i in range(cfg.n_gods):
            counters["decisions"] += 1
            do_summons(i)
        t += cfg.decision_interval

    # --- running phase --------------------------------------------------------------------------
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
    S = world.S
    while True:
        t = k * dt if rate > 0 else math.inf
        # events due before this interaction tick (spawns, decisions, snapshots) in time order
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
                snap_payoff.append(world.total_payoff())
                snap_objs.append(np.array(world.obj_ids, np.int32))
                snap_s.append(Sm.astype(np.float32))
                if hp:
                    snap_h.append(world.H[:M].astype(np.float32))
                if hook:
                    hook(world, "snapshot")
                next_snap += cfg.snapshot_interval
            elif ev_t == next_spawn:
                g = world.spawn_unique()
                v = world.add_object(g)
                s_time.append(ev_t); s_obj.append(world.obj_ids[-1]); s_vec.append(v)
                s_h.append(world.H[world.M - 1].copy())
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
        world.keys.discard(old.key)
        world.keys.add(nk)
        world.objects[oi] = new
        S = world.S
        before = S[oi].copy()
        after = world.svec(new)
        S[oi] = after
        counters["commits"] += 1
        c_time.append(t); c_obj.append(world.obj_ids[oi]); c_agent.append(aid)
        c_before.append(before); c_after.append(after)
        if hp:
            hb = world.H[oi].copy()
            ha = world.hvec(new)
            world.H[oi] = ha
            c_hb.append(hb); c_ha.append(ha)
            pols[owner].on_commit(aid, oi, before, after, hb, ha)
        else:
            pols[owner].on_commit(aid, oi, before, after)

    world.t = duration
    if hook:
        hook(world, "end")
    M = world.M
    G = cfg.n_gods
    f32 = np.float32
    Sm = world.S[:M]
    Hm = world.H[:M]
    nc = len(c_time)
    return GameLog(
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
        final_payoff=world.total_payoff().astype(f32),
        final_energy=np.array([world.energy(i) for i in range(G)], f32), spent=world.spent.astype(f32),
        counters=counters,
        c_hbefore=np.array(c_hb, f32).reshape(-1, G) if hp else np.zeros((nc, G), f32),
        c_hafter=np.array(c_ha, f32).reshape(-1, G) if hp else np.zeros((nc, G), f32),
        s_hvec=np.array(s_h, f32).reshape(-1, G),
        snap_h=snap_h if hp else [np.zeros_like(x) for x in snap_s],
        final_h=Hm.astype(f32), has_penalty=world.dc.has.copy(), penalty_K=world.dc.K.copy(),
        penalty_K_prior=world.dc.K_prior.copy(), penalty_hbar=world.dc.hbar.copy(),
        score_penalties=bool(cfg.score_penalties), defence=world.dc,
    )


def draws_for(cfg: GameConfig) -> list[Draw]:
    """The draws `run_game(cfg)` will deal (same RNG stream), e.g. for table precomputation."""
    ss = np.random.SeedSequence(cfg.seed)
    r_deal = np.random.default_rng(ss.spawn(3 + cfg.n_gods)[0])
    pool = cfg.families if cfg.families is not None else default_families()
    return deal(cfg, r_deal, pool)
