"""Economy and agent-lifecycle variants of gridlab.sim.run_game.

`run_econ_game(cfg, econ)` is `gridlab.sim.run_game` (same RNG streams, same event order) plus the
economy mechanics below. With `Econ()` (all defaults) it reproduces `run_game(cfg)` bit for bit
(tests in gridlab.explore.economy.selftest). Shared modules are not modified: the loop is a copy
with hooks, and policies are wrapped, not edited.

Economy knobs (Econ):
  gas, gas_frac     metabolic cost per application ATTEMPT: gas + gas_frac * (agent's summon cost).
                    An owner who cannot pay: unpaid="skip" (the pick is wasted, agent survives) or
                    "starve" (the agent dies).
  refund            share of the gas refunded when the application fails (None result, or the
                    uniqueness check rejects it as a duplicate of an existing object).
  charges           an agent dies after this many charged applications. charge_on="attempt" uses a
                    charge on every attempt; "commit" only on committed transformations (a refund of
                    the charge when the uniqueness check fails).
  half_life         exponential agent lifetimes (seconds); `lifetime`: fixed lifetime (seconds).
  crowd_tax         summon price multiplier 1 + crowd_tax * (owner's live agents): a soft agent cap.
  energy_cap        banked energy above this is lost (use it or lose it). None = unlimited.
  income_tilt       k in [-1, 1]. The base income stream (cfg.energy_per_second per god, G gods) is
                    redistributed every snapshot by total-payoff share s_i: k > 0 pays leaders,
                    w_i = (1-k)/G + k*s_i; k < 0 pays laggards, w_i = (1-|k|)/G + |k|*(1-s_i)/(G-1).
                    Total income is unchanged; only its split depends on the standings.
  income_own        energy per bit of surprisal gained BY THE OWNER on commits of its own agents
                    (an earned-income loop; adds energy).
  income_any        energy per bit of surprisal gained by EACH god on ANY commit (income from the
                    world becoming more interesting to you, whoever caused it).
  price_exp         convex (> 1) or concave (< 1) summon pricing: price = c * (c / price_ref)^(price_exp - 1)
                    for a program of c bits (after cost_scale); 1 = linear (the engine). price_ref = 20 bits,
                    about a typical program, so typical agents keep their price and jackpots get dearer.
  aware             policies price an agent at its total cost of ownership: summon cost + expected
                    gas over its expected applications (lifetime- and charge-limited).

Energy is an explicit per-god bank (accrued lazily at cfg.energy_per_second x income weight) so caps
and income can act on it. Policies read it through World.energy as before.

Extra logs on the returned GameLog: `econ` (the knobs), `a_death`, `a_commits`, `a_up`, `a_dsum`,
`a_last_up`, `a_gas`, `snap_energy` (T, G), `snap_live` (T, G), `snap_attempts` (T, G) cumulative,
`age_stats` (attempts / commits / owner-up commits / owner Δs by agent age bin), `bin_stats` (60 s
world-time bins: attempt-weighted live agents, attempts, commits, owner-up, |Δ salience|),
`income` (G,), `gas_paid` (G,), `refunded` (G,), `cap_lost` (G,).
"""
from __future__ import annotations

import bisect
import math
from dataclasses import dataclass, asdict
from typing import Optional

import numpy as np

from ... import calibrate as cal
from ...sim import (GameConfig, GameLog, World, deal, default_families, default_program_factory,
                    game_duration, payoffs, program_mutator_ids)

AGE_EDGES = [15.0, 30.0, 60.0, 120.0, 240.0, 480.0]   # bins: [0,15) [15,30) ... [480, inf)
BIN_W = 60.0
N_BINS = 20


@dataclass
class Econ:
    gas: float = 0.0
    gas_frac: float = 0.0
    unpaid: str = "skip"
    refund: float = 0.0
    charges: Optional[int] = None
    charge_on: str = "attempt"
    half_life: Optional[float] = None
    lifetime: Optional[float] = None
    crowd_tax: float = 0.0
    energy_cap: Optional[float] = None
    income_tilt: float = 0.0
    income_own: float = 0.0
    income_any: float = 0.0
    aware: bool = False
    price_exp: float = 1.0
    price_ref: float = 20.0

    @property
    def mortal(self) -> bool:
        return bool(self.charges or self.half_life or self.lifetime)

    @property
    def gassy(self) -> bool:
        return bool(self.gas or self.gas_frac)

    def expected_life(self, cfg: GameConfig, apps_rate: float) -> float:
        """Expected agent lifetime in seconds given its expected applications per second."""
        L = math.inf
        if self.half_life:
            L = min(L, self.half_life / math.log(2))
        if self.lifetime:
            L = min(L, self.lifetime)
        if self.charges and apps_rate > 0:
            L = min(L, self.charges / apps_rate)   # charge_on="commit" makes this pessimistic
        return L


class EconWorld(World):
    def __init__(self, cfg, draws, tables, rng, econ: Econ):
        super().__init__(cfg, draws, tables, rng)
        self.econ = econ
        G = self.G
        self.bank = np.full(G, float(cfg.starting_energy))
        self.weight = np.ones(G)                # income weight (mean 1)
        self.t_acc = -cfg.planning_seconds
        self.income = np.zeros(G)               # earned income (own / any gain)
        self.gas_paid = np.zeros(G)
        self.refunded = np.zeros(G)
        self.cap_lost = np.zeros(G)
        self.base_cost: list[float] = []

    # --- energy -----------------------------------------------------------------------------------
    def accrue(self) -> None:
        dt = self.t - self.t_acc
        if dt > 0:
            self.bank += self.cfg.energy_per_second * dt * self.weight
            self.t_acc = self.t
            self._cap()

    def _cap(self) -> None:
        c = self.econ.energy_cap
        if c is not None:
            over = self.bank > c
            if over.any():
                self.cap_lost[over] += self.bank[over] - c
                self.bank[over] = c

    def energy(self, god: int) -> float:
        self.accrue()
        return float(self.bank[god])

    def credit(self, god: int, x: float) -> None:
        self.accrue()
        self.bank[god] += x
        self._cap()

    def cost_mult(self, god: int) -> float:
        return 1.0 + self.econ.crowd_tax * self.own_count[god]

    def price(self, god: int, base):
        """Summon price for base cost(s) `base` (program bits x cost_scale): convexity, then crowd tax."""
        e = self.econ
        if e.price_exp != 1.0:
            base = base * (np.maximum(base, 1e-9) / e.price_ref) ** (e.price_exp - 1.0)
        return base * self.cost_mult(god)

    # --- agents -----------------------------------------------------------------------------------
    def summon(self, god: int, prog, cost: float) -> int | None:
        """`cost` is the base price (program bits x cost_scale); the crowd tax is applied here."""
        price = float(self.price(god, cost))
        if self.own_count[god] >= self.cfg.max_agents or self.energy(god) < price:
            return None
        aid = len(self.agent_prog)
        self.bank[god] -= price
        self.spent[god] += price
        self.agent_prog.append(prog)
        self.agent_owner.append(god)
        e = self.econ
        hl = e.half_life or self.cfg.agent_half_life
        death = math.inf
        if hl:
            death = max(self.t, 0.0) + self.rng.exponential(hl / math.log(2))
        if e.lifetime:
            death = min(death, max(self.t, 0.0) + e.lifetime)
        self.agent_death.append(death)
        self.agent_attempts.append(0)
        self.agents.append(aid)
        self.own_count[god] += 1
        self.base_cost.append(cost)
        self.last_price = price
        return aid

    def kill(self, aid: int) -> None:
        if self.agent_death[aid] > self.t:
            self.agent_death[aid] = self.t
        self.purge_dead(force=True)

    def purge_dead(self, force: bool = False) -> None:
        if force or self.econ.mortal or self.cfg.agent_half_life or self.econ.unpaid == "starve":
            live = []
            for a in self.agents:
                if self.agent_death[a] <= self.t:
                    self.own_count[self.agent_owner[a]] -= 1
                else:
                    live.append(a)
            self.agents = live


# ------------------------------------------------------------------------------------------------
# policies: wrap the shared classes so they see taxed prices and (optionally) total cost of ownership
# ------------------------------------------------------------------------------------------------
_WRAPPED: dict = {}


def _wrap(cls):
    if cls in _WRAPPED:
        return _WRAPPED[cls]

    class Econ_(cls):
        def sample_programs(self, k):
            progs, costs = super().sample_programs(k)
            self._base_costs = costs
            return progs, self.world.price(self.god, costs)

        def evaluate(self, K):
            w = self.world
            e = w.econ
            if not (e.aware and (e.gassy or e.mortal)) or not hasattr(self, "mean_delta"):
                return super().evaluate(K)
            energy = self.energy()
            cands, costs = self.sample_programs(K)
            ok = costs <= energy
            if not ok.any():
                return None
            cands = [p for p, o in zip(cands, ok) if o]
            costs = costs[ok]
            base = self._base_costs[ok]
            d = self.mean_delta(cands)
            c = w.cfg
            rem = c.half_life_seconds / math.log(2) if c.length != "fixed" else max(0.0, c.fixed_seconds - max(w.t, 0.0))
            rate = c.interaction_rate_hz / (len(w.agents) + 1)
            life = min(rem, e.expected_life(c, rate))
            apps = rate * life
            tco = costs + (e.gas + e.gas_frac * base) * apps
            y = d * apps * self.discount * self.scale() / np.maximum(tco, 1e-9)
            b = int(np.argmax(y))
            return cands[b], float(y[b]), float(d[b])

    Econ_.__name__ = f"Econ{cls.__name__}"
    _WRAPPED[cls] = Econ_
    return Econ_


def make_econ_policy(name: str, god: int, world, rng, factory, **kw):
    from ...policy import POLICIES
    cls = _wrap(POLICIES[name])
    per = kw.pop(name, {}) if isinstance(kw.get(name), dict) else {}
    kw = {k: v for k, v in kw.items() if k not in POLICIES}
    kw = {**kw, **per}
    cap = world.econ.energy_cap
    if name == "saver" and cap is not None:
        sf = kw.get("save_fraction", 0.6)
        kw["save_fraction"] = min(sf, 0.9 * cap / max(world.cfg.starting_energy, 1e-9))
    return cls(god, world, rng, factory, **kw)


# ------------------------------------------------------------------------------------------------
# the game loop (a copy of gridlab.sim.run_game with economy hooks)
# ------------------------------------------------------------------------------------------------
def run_econ_game(cfg: GameConfig, econ: Optional[Econ] = None, tables: Optional[list] = None) -> GameLog:
    econ = econ or Econ()
    ss = np.random.SeedSequence(cfg.seed)
    r_deal, r_world, r_len, *r_pol = [np.random.default_rng(s) for s in ss.spawn(3 + cfg.n_gods)]
    pool = cfg.families if cfg.families is not None else default_families()
    factory = cfg.program_factory or default_program_factory()
    draws = deal(cfg, r_deal, pool)
    gt = cfg.gtype
    if tables is None:
        tables = [cal.survival(d, gt) for d in draws]
    world = EconWorld(cfg, draws, tables, r_world, econ)
    if cfg.program_library:
        from ...policy import program_library
        world.library = program_library(gt, factory, cfg.program_library)
    duration = game_duration(cfg, r_len)
    names = cfg.policy_list()
    pols = [make_econ_policy(names[i], i, world, r_pol[i], factory, **cfg.policy_kwargs) for i in range(cfg.n_gods)]
    G = cfg.n_gods

    c_time, c_obj, c_agent, c_before, c_after = [], [], [], [], []
    s_time, s_obj, s_vec = [], [], []
    snap_time, snap_payoff, snap_objs, snap_s = [], [], [], []
    snap_energy, snap_live, snap_att = [], [], []
    a_cost, a_time, a_mut = [], [], []
    a_commits, a_up, a_dsum, a_last_up, a_gas = [], [], [], [], []
    counters = {"attempts": 0, "none": 0, "duplicate": 0, "commits": 0, "metabolic_skips": 0,
                "decisions": 0, "summons": 0, "starved": 0, "charge_deaths": 0}
    nA = len(AGE_EDGES) + 1
    age_att, age_com, age_up, age_ds = (np.zeros(nA) for _ in range(4))
    bin_live, bin_att, bin_com, bin_up, bin_abs = (np.zeros(N_BINS + 1) for _ in range(5))
    att_by_god = np.zeros(G)
    charges_left: list = []

    def do_summons(god: int):
        for prog in pols[god].decide() or ():
            cost = float(prog.cost(gt)) * cfg.cost_scale
            aid = world.summon(god, prog, cost)
            if aid is None:
                continue
            counters["summons"] += 1
            a_cost.append(world.last_price)
            a_time.append(world.t)
            a_mut.append(program_mutator_ids(prog))
            a_commits.append(0); a_up.append(0); a_dsum.append(0.0); a_last_up.append(-1.0); a_gas.append(0.0)
            charges_left.append(econ.charges or 0)
            pols[god].on_summon(aid, prog, world.last_price)

    def retilt():
        k = econ.income_tilt
        if not k:
            return
        P = world.total_payoff()
        tot = P.sum()
        s = P / tot if tot > 1e-9 else np.full(G, 1.0 / G)
        if k > 0:
            w = (1 - k) / G + k * s
        else:
            w = (1 + k) / G + (-k) * (1 - s) / max(G - 1, 1)
        world.accrue()
        world.weight = G * w

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
    gas0, gasf, refund = econ.gas, econ.gas_frac, econ.refund
    starve = econ.unpaid == "starve"
    ch_commit = econ.charge_on == "commit"
    inc_own, inc_any = econ.income_own, econ.income_any
    rng = r_world
    BLK = 4096
    ublk, upos = rng.random((BLK, 2)), 0
    k = 0
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
                world.accrue()
                snap_energy.append(world.bank.copy())
                snap_live.append(np.array(world.own_count, float))
                snap_att.append(att_by_god.copy())
                retilt()
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
            world.bank[owner] -= met
            world.spent[owner] += met
        gas = 0.0
        if gas0 or gasf:
            gas = gas0 + gasf * world.base_cost[aid]
            if world.energy(owner) < gas:
                counters["metabolic_skips"] += 1
                if starve:
                    counters["starved"] += 1
                    world.kill(aid)
                continue
            world.bank[owner] -= gas
            world.spent[owner] += gas
            world.gas_paid[owner] += gas
            a_gas[aid] += gas
        counters["attempts"] += 1
        world.agent_attempts[aid] += 1
        att_by_god[owner] += 1
        age = t - max(a_time[aid], 0.0)
        ab = bisect.bisect_right(AGE_EDGES, age)
        age_att[ab] += 1
        tb = min(int(t / BIN_W), N_BINS)
        bin_att[tb] += 1
        bin_live[tb] += A
        if econ.charges and not ch_commit:
            charges_left[aid] -= 1
        old = world.objects[oi]
        new = world.agent_prog[aid].apply(old, gt, rng)
        fail = new is None
        if fail:
            counters["none"] += 1
        else:
            nk = new.key
            if nk in world.keys:
                counters["duplicate"] += 1
                fail = True
        if fail:
            if gas and refund:
                world.bank[owner] += refund * gas
                world.spent[owner] -= refund * gas
                world.refunded[owner] += refund * gas
                world._cap()
            if econ.charges and not ch_commit and charges_left[aid] <= 0:
                counters["charge_deaths"] += 1
                world.kill(aid)
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
        dso = float(after[owner] - before[owner])
        a_commits[aid] += 1
        a_dsum[aid] += dso
        age_com[ab] += 1
        age_ds[ab] += dso
        bin_com[tb] += 1
        bin_abs[tb] += abs(float(after.sum() - before.sum()))
        if dso > 1e-9:
            a_up[aid] += 1
            a_last_up[aid] = t
            age_up[ab] += 1
            bin_up[tb] += 1
        if inc_own and dso > 0:
            world.credit(owner, inc_own * dso)
            world.income[owner] += inc_own * dso
        if inc_any:
            gain = np.clip(after - before, 0, None) * inc_any
            if gain.any():
                world.accrue()
                world.bank += gain
                world.income += gain
                world._cap()
        pols[owner].on_commit(aid, oi, before, after)
        if econ.charges:
            if ch_commit:
                charges_left[aid] -= 1
            if charges_left[aid] <= 0:
                counters["charge_deaths"] += 1
                world.kill(aid)

    world.t = duration
    world.accrue()
    M = world.M
    f32 = np.float32
    Sm = world.S[:M]
    log = GameLog(
        config=cfg.summary(), gtype=gt, families=[d.family.id for d in draws],
        params=[cal.canonical_json(d.params) for d in draws], policies=names, duration=duration,
        c_time=np.array(c_time, f32), c_obj=np.array(c_obj, np.int32), c_agent=np.array(c_agent, np.int32),
        c_before=np.array(c_before, f32).reshape(-1, G), c_after=np.array(c_after, f32).reshape(-1, G),
        a_owner=np.array(world.agent_owner, np.int8), a_time=np.array(a_time, f32), a_cost=np.array(a_cost, f32),
        a_mutators=a_mut, a_desc=None,
        a_attempts=np.array(world.agent_attempts, np.int32),
        s_time=np.array(s_time, f32), s_obj=np.array(s_obj, np.int32), s_vec=np.array(s_vec, f32).reshape(-1, G),
        snap_time=np.array(snap_time, f32), snap_payoff=np.array(snap_payoff, f32).reshape(-1, G),
        snap_objs=snap_objs, snap_s=snap_s,
        final_obj=np.array(world.obj_ids, np.int32), final_s=Sm.astype(f32),
        final_sym=np.array([g.sym for g in world.objects], np.uint8),
        final_col=np.array([g.col for g in world.objects], np.uint8),
        final_payoff=payoffs(Sm).sum(axis=0).astype(f32),
        final_energy=world.bank.astype(f32), spent=world.spent.astype(f32),
        counters=counters,
    )
    log.econ = asdict(econ)
    log.a_death = np.array([min(x, duration) for x in world.agent_death], f32)
    log.a_commits = np.array(a_commits, np.int32)
    log.a_up = np.array(a_up, np.int32)
    log.a_dsum = np.array(a_dsum, f32)
    log.a_last_up = np.array(a_last_up, f32)
    log.a_gas = np.array(a_gas, f32)
    log.snap_energy = np.array(snap_energy, f32).reshape(-1, G)
    log.snap_live = np.array(snap_live, f32).reshape(-1, G)
    log.snap_attempts = np.array(snap_att, f32).reshape(-1, G)
    log.age_stats = {"edges": AGE_EDGES, "attempts": age_att.tolist(), "commits": age_com.tolist(),
                     "up": age_up.tolist(), "dsum": age_ds.round(3).tolist()}
    log.bin_stats = {"w": BIN_W, "live_x_att": bin_live.tolist(), "attempts": bin_att.tolist(),
                     "commits": bin_com.tolist(), "up": bin_up.tolist(), "abs_dsal": bin_abs.round(2).tolist()}
    log.income = world.income.astype(f32)
    log.gas_paid = world.gas_paid.astype(f32)
    log.refunded = world.refunded.astype(f32)
    log.cap_lost = world.cap_lost.astype(f32)
    return log
