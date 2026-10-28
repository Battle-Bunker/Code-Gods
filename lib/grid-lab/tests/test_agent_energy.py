"""Per-agent energy economy tests: python3 -m tests.test_agent_energy

Pointwise costs (gridlab/energy.py) and the agent_energy / owner_pays economies in gridlab/sim.py.
Games use the stand-in families of tests/toys.py (fast calibration) with real programs."""
from __future__ import annotations

import math
import time

import numpy as np

from gridlab import energy
from gridlab.core import GridType, spawn
from gridlab.mutators import available
from gridlab.program import ALWAYS, Guard, Program, Step, random_program
from gridlab.sim import GameConfig, run_game
from tests.toys import TOY_FAMILIES

GT = GridType(5, "base10", "rgby")
TYPES = [GT, GridType(6, "cards", "rainbow6"), GridType(4, "base12", "rgb")]


def game(seed=3, **kw):
    base = dict(gtype=GT, n_gods=3, length="fixed", fixed_seconds=80.0, planning_seconds=20.0,
                policies=["random", "greedy_private", "saver"], seed=seed, families=TOY_FAMILIES,
                program_factory=random_program, program_library=512, economy="agent_energy", agent_income=1.0)
    base.update(kw)
    return run_game(GameConfig(**base))


def test_split_sums_to_cost():
    rng = np.random.default_rng(0)
    for gt in TYPES:
        for _ in range(150):
            p = random_program(rng, gt)
            s, a = energy.split_terms(p, gt)
            assert s > 0 and a >= 0
            assert abs(s + a - p.cost(gt)) < 1e-9, (p.describe(gt), s, a, p.cost(gt))


def test_pointwise_erasure_and_motion_match_expected():
    """E_prior[pointwise erasure] = the Shannon erasure term, and E[pointwise motion] = the motion term,
    for every mutator with an absolute region (line* and flatten are documented exceptions)."""
    rng = np.random.default_rng(1)
    for gt in TYPES:
        xs = [spawn(gt, rng) for _ in range(1200)]
        for m in available(gt):
            if m.id == "flatten":
                continue
            for _ in range(3):
                p = m.sample(rng, gt)
                if p.get("kind") == "line*":
                    continue
                st = Step.make(m.id, p)
                t = m.terms_fn(p, gt)
                es, ms = [], []
                for x in xs:
                    y = m.apply_fn(x, p, gt)
                    y = x if y is None else y
                    es.append(energy.pointwise_erasure(st, x, y, gt))
                    ms.append(energy.pointwise_motion(st, x, y, gt))
                es, ms = np.array(es), np.array(ms)
                se = es.std() / math.sqrt(len(es))
                assert abs(es.mean() - t.erase) <= 5 * se + 0.02 * max(t.erase, 1.0), (gt.key, m.id, p, es.mean(), t.erase)
                mot = (math.log2(gt.C) * t.dcol ** 2 + math.log2(gt.S) * t.dsym ** 2) / gt.N ** 2
                mse = ms.std() / math.sqrt(len(ms))
                # analytic changed-cell counts are approximations for a few maps (cards rank swaps): 10%
                assert abs(ms.mean() - mot) <= 5 * mse + 0.1 * max(mot, 0.1), (gt.key, m.id, p, ms.mean(), mot)
                if m.bijective:
                    assert es.max() == 0.0


def test_pointwise_erasure_exact_cases():
    """Hand-checked preimage sizes."""
    from gridlab.core import Grid
    gt = GT
    col = np.zeros((5, 5), np.uint8)
    col[0] = [0, 1, 2, 1, 3]
    g = Grid(np.zeros((5, 5), np.uint8), col)
    st = Step.make("recolour", {"kind": "line", "region": (0, 0), "pair": (0, 1)})   # red -> green in row 1
    y = st.apply(g, gt)
    # output row 1 has 3 cells of colour 1 (one was 0, two were 1): each could have been 0 or 1 -> 3 bits
    assert energy.pointwise_erasure(st, g, y, gt) == 3.0
    st = Step.make("sort_line", {"line": (0, 0), "dir": 1})
    sym = np.zeros((5, 5), np.uint8)
    sym[0] = [3, 1, 2, 1, 1]
    g = Grid(sym, np.zeros((5, 5), np.uint8))
    y = st.apply(g, gt)
    assert abs(energy.pointwise_erasure(st, g, y, gt) - math.log2(math.factorial(5) / math.factorial(3))) < 1e-9
    st = Step.make("paint", {"kind": "line", "region": (0, 2), "colour": 3})
    assert energy.pointwise_erasure(st, g, st.apply(g, gt), gt) == 5 * 2.0


def test_majority_pointwise_is_shannon():
    """Σ_k f_k log2 count_k = N log2 C − H(plurality), the majority_line erasure term."""
    from gridlab.mutators import _majority_stats
    for N, C in ((4, 3), (5, 4), (6, 6)):
        cnt = energy._plurality_counts(N, C)
        f = cnt / cnt.sum()
        assert abs(float((f * np.log2(cnt)).sum()) - _majority_stats(N, C)[0]) < 1e-9


def test_decision_bits_expectation():
    """Guard decision bits average to H_b(q); line* selection bits average to the entropy of the
    reference selection frequencies."""
    rng = np.random.default_rng(2)
    xs = [spawn(GT, rng) for _ in range(4000)]
    g = Guard.make("cell_colour", {"cell": (1, 2), "colour": 1, "neg": False})
    prog = Program(g, (Step.make("swap_cells", {"layer": "both", "near": "next door", "pair": ((0, 0), (0, 1))}),))
    pr = energy.profile(prog, GT)
    dec = np.array([energy.act(prog, x, GT, pr)[1] for x in xs])
    q = 0.25
    hb = -(q * math.log2(q) + (1 - q) * math.log2(1 - q))
    assert abs(dec.mean() - hb) < 0.03, (dec.mean(), hb)
    prog = Program(ALWAYS, (Step.make("paint", {"kind": "line*", "region": (), "colour": 2}),))
    pr = energy.profile(prog, GT)
    bits = pr.sel_bits[0]
    p = 2.0 ** -bits
    assert abs(p.sum() - 1) < 1e-9
    ent = float((p * bits).sum())
    dec = np.array([energy.act(prog, x, GT, pr)[1] for x in xs])
    assert abs(dec.mean() - ent) < 0.15, (dec.mean(), ent)
    assert ent <= math.log2(2 * GT.N) + 1e-9


def test_act_matches_program_apply():
    rng = np.random.default_rng(3)
    for gt in TYPES:
        for _ in range(60):
            p = random_program(rng, gt)
            pr = energy.profile(p, gt)
            for _ in range(5):
                x = spawn(gt, rng)
                y, dec, er, mo = energy.act(p, x, gt, pr)
                z = p.apply(x, gt)
                assert (y is None and z is None) or (y is not None and z is not None and y == z)
                assert dec >= 0 and er >= 0 and mo >= 0
                if y is None:
                    assert er == 0 and mo == 0


def test_expected_matches_mean_charge():
    """For unguarded programs the profile's expected cost is the mean charge over the reference spawns,
    and close to the mean charge over fresh spawns."""
    rng = np.random.default_rng(4)
    xs = [spawn(GT, rng) for _ in range(600)]
    for _ in range(25):
        p = random_program(rng, GT, guard_prob=0.0)
        pr = energy.profile(p, GT)
        ref = []
        for x in energy.reference_grids(GT):
            y, d, e, m = energy.act(p, x, GT, pr)
            ref.append(d + (e + m if y is not None else 0.0))
        assert abs(np.mean(ref) - pr.expected) < 1e-6 * max(1.0, pr.expected)
        fresh = []
        for x in xs:
            y, d, e, m = energy.act(p, x, GT, pr)
            fresh.append(d + (e + m if y is not None else 0.0))
        sd = np.std(fresh)
        assert abs(np.mean(fresh) - pr.expected) <= 4 * sd / math.sqrt(len(energy.reference_grids(GT))) + 0.5, \
            (p.describe(GT), np.mean(fresh), pr.expected)


def test_conservation_eligibility_battery():
    for kw in ({}, {"agent_battery": 1.0, "agent_income": 0.3},
               {"agent_start": "one"}, {"agent_half_life": 30.0}):
        log = game(seed=5, **kw)
        B = kw.get("agent_battery", 2.0)
        assert len(log.act_bits) == log.counters["attempts"] > 0
        # conservation: start + income = charged + wasted + balance, per agent
        bal = log.a_start.astype(float) + log.a_income - log.a_charged - log.a_wasted - log.a_energy_end
        assert np.abs(bal).max() < 1e-3 * max(1.0, log.a_income.max()), (kw, np.abs(bal).max())
        assert abs(log.a_charged.sum() - log.act_bits.astype(float).sum()) < 1e-3 * max(1.0, log.a_charged.sum())
        # the god paid the description bits (+ the starting charge)
        assert abs(log.spent.sum() - (log.a_summon_bits.sum() + log.a_start.sum())) < 1e-3 * log.spent.sum()
        # eligibility: every act started at or above the expected cost; battery: never above B x expected
        ex = log.a_act_exp.astype(float)[log.act_agent]
        assert (log.act_energy >= ex - 1e-6).all(), kw
        assert (log.act_energy <= B * ex + 1e-6).all(), kw
        # actual charge: decision bits only on failures, at least that on commits
        assert (log.act_bits >= 0).all()
        assert int(log.act_commit.sum()) == log.counters["commits"]
        assert log.counters["attempts"] + log.counters["idle_ticks"] <= int(80.0 * 20) + 2


def test_no_eligible_no_interaction():
    log = game(seed=6, agent_income=1e-4)
    expensive = log.a_act_exp > 1e-4 * 100       # can never save up one expected act in 100 s
    assert expensive.any() and log.a_attempts[expensive].sum() == 0
    if not (log.a_act_exp <= 1e-4 * 100).any():
        assert log.counters["attempts"] == 0 and log.counters["idle_ticks"] > 0


def test_constant_income_separate_from_god():
    """Each agent earns the same constant income whatever its owner's agent count; agent energy never
    touches the god's account (the god pays exactly the description bits)."""
    log = game(seed=7, fixed_seconds=40.0, planning_seconds=20.0, agent_income=2.0,
               policies=["spammer", "spammer", "idle"], starting_energy=300.0, decision_interval=1.0)
    assert (log.a_owner == 0).sum() > 5
    life = np.minimum(log.a_death.astype(float), log.duration) - log.a_time.astype(float)
    assert np.abs(log.a_income - 2.0 * life).max() < 0.05, np.abs(log.a_income - 2.0 * life).max()
    assert abs(log.spent.sum() - log.a_summon_bits.sum()) < 1e-3 * log.spent.sum()


def test_negative_balances():
    """The full actual cost is deducted even below zero; eligibility still uses the expected cost."""
    neg = 0
    for seed in range(12, 16):
        log = game(seed=seed, agent_income=0.5)
        after = log.act_energy - log.act_bits
        neg += int((after < -1e-9).sum())
        ex = log.a_act_exp.astype(float)[log.act_agent]
        assert (log.act_energy >= ex - 1e-6).all()
    assert neg > 0, "no act took a balance below zero"


def test_destroy_is_free():
    log = game(seed=17, agent_income=1.0, fixed_seconds=120.0, policies=["greedy_private", "saver", "greedy_omniscient"],
               policy_kwargs={"destroy_min_acts": 5})
    d = log.a_destroyed
    assert d.sum() == log.counters["destroys"] > 0
    # free: the gods paid exactly the description bits of everything they summoned, nothing refunded
    assert abs(log.spent.sum() - log.a_summon_bits.sum()) < 1e-3 * log.spent.sum()
    # a destroyed agent never acts again, and stops earning
    for a in np.flatnonzero(d):
        t = log.c_time[log.c_agent == a]
        assert (t <= log.a_death[a] + 1e-6).all()
        assert abs(log.a_income[a] - 1.0 * (log.a_death[a] - log.a_time[a])) < 0.05
    off = game(seed=17, agent_income=1.0, fixed_seconds=120.0, policies=["greedy_private", "saver", "greedy_omniscient"],
               policy_kwargs={"destroy": False})
    assert off.counters["destroys"] == 0


def test_act_naming_variant():
    """agent_act_naming = 1 charges each act its program's naming bits on top of the pointwise cost."""
    log = game(seed=18, agent_act_naming=1.0, agent_income=4.0)
    base = game(seed=18, agent_income=4.0)
    assert len(log.act_bits) > 0
    assert (log.a_act_exp > 2.0).all()                    # naming is >= one tool name (log2 #mutators)
    assert (log.act_bits >= 2.0).all()
    assert np.median(log.act_bits) > 5 * max(np.median(base.act_bits), 1e-3)


def test_act_floor():
    """agent_act_floor_bits is charged on every act (committed or not) and included in the threshold."""
    log = game(seed=19, agent_act_floor_bits=2.0, agent_income=2.0)
    assert len(log.act_bits) > 0
    assert (log.act_bits >= 2.0 - 1e-6).all()
    assert (log.a_act_exp >= 2.0 - 1e-6).all()
    assert (log.act_energy >= log.a_act_exp.astype(float)[log.act_agent] - 1e-6).all()


def test_determinism():
    a = game(seed=8)
    b = game(seed=8)
    for f in ("act_agent", "act_bits", "act_energy", "c_after", "final_payoff", "a_summon_bits", "a_energy_end"):
        assert np.array_equal(getattr(a, f), getattr(b, f)), f
    c = game(seed=9)
    assert not np.array_equal(a.act_bits, c.act_bits) or not np.array_equal(a.c_after, c.c_after)


def test_owner_pays():
    log = game(seed=10, economy="owner_pays")
    paid = log.act_bits.astype(float)
    assert (paid[~log.act_commit] == 0).all()
    assert abs(log.spent.sum() - (log.a_summon_bits.sum() + paid.sum())) < 1e-3 * log.spent.sum()
    assert (log.final_energy >= -1e-6).all()


def test_default_economy_unchanged():
    """economy="summon" logs no energy fields and charges the full Program.cost at summon."""
    log = game(seed=11, economy="summon")
    assert log.act_bits is None and log.a_summon_bits is None
    assert log.counters["idle_ticks"] == 0


def main():
    t0 = time.perf_counter()
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            t = time.perf_counter()
            fn()
            print(f"  ok {name} ({time.perf_counter() - t:.1f}s)")
    print(f"all agent-energy tests passed ({time.perf_counter() - t0:.1f}s)")


if __name__ == "__main__":
    main()
