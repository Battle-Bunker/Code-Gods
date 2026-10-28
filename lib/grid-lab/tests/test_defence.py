"""Defence-goal tests (docs/defence-goals.md): python3 -m tests.test_defence

  - every defence variant, protector and penalty family passes the rule checks of tests.test_rules;
  - a variant's reward channel shares its base family's survival table;
  - Survival.prior_mean_bits is exact for an exact tail, and the defence term is zero-mean on spawns;
  - penalties are fair: P_μ(h >= k) <= 2^-(k+1), and damaging a typical grid costs many bits
    (while a combined ordinal floors near 0);
  - payoffs: no spite (π_i never falls when s_j rises), penalties are private, games without a defence
    goal score exactly the old formula, unscored and zero-weight games are identical;
  - simulation invariants (H matches the objects, final payoff = formula), the value model makes a repair
    agent worth summoning only when the penalty is scored, and the kid card reads right.
"""
from __future__ import annotations

import math
import sys
import time

import numpy as np

from gridlab.core import Grid, GridType, spawn_batch
from gridlab.family import Draw
from gridlab import calibrate as cal
from gridlab.defence import HINGE_BITS, hinge, card, object_line, constants, net_bits, payoff_matrix
from gridlab.rules import FAMILIES, DEFENCE_FAMILIES, PENALTIES, by_id
from gridlab.rules import defence as rd
from gridlab.rules._util import log2_binom_tail
from gridlab.sim import GameConfig, run_game, payoffs, draws_for, World
from gridlab.metrics import metrics
from gridlab.program import Program

GT = GridType(5, "base10", "rgby")
POOL = FAMILIES + DEFENCE_FAMILIES + rd.REWARDS


def test_rule_checks():
    from multiprocessing import Pool
    from tests.test_rules import check_family
    ids = [f.id for f in DEFENCE_FAMILIES + PENALTIES + rd.REWARDS]
    with Pool(4) as pool:
        res = pool.map(check_family, ids)
    bad = [(fid, errs[:2]) for fid, n, dt, errs in res if errs]
    assert not bad, bad
    assert all(n > 0 for _, n, _, _ in res)
    assert len(rd.PROTECTORS) >= 4 and len(rd.VARIANTS) >= 6
    for f in DEFENCE_FAMILIES:
        assert f.penalty is not None and "defence" in f.tags and f.id not in {g.id for g in FAMILIES}


def test_shared_reward_tables():
    rng = np.random.default_rng(0)
    v = by_id("seed3_green_ones+hate_colour")
    p = v.sample(rng, GT)
    assert p["defence"]["colour"] != p["colour"], "hated colour must differ from the favourite"
    d = Draw(v, p)
    base = Draw(by_id("seed3_green_ones"), {k: x for k, x in p.items() if k != "defence"})
    assert cal.cache_key(d.reward_draw(), GT) == cal.cache_key(base, GT)
    assert cal.survival(d, GT) is cal.survival(base, GT)
    pd = d.penalty_draw()
    assert pd.family.id == "hate_colour" and pd.params == p["defence"]
    assert Draw(by_id("seed3_green_ones"), base.params).penalty_draw() is None


def test_prior_mean_exact():
    """E_μ[max(0, s - c)] from the table equals the analytic value for the exact binomial tail."""
    pd = Draw(rd.HATE_COLOUR, {"colour": 1})
    T = cal.survival(pd, GT)
    n, q = GT.N ** 2, 1.0 / GT.C
    pk = np.array([math.comb(n, k) * q ** k * (1 - q) ** (n - k) for k in range(n + 1)])
    s = np.array([-log2_binom_tail(n, q, k) for k in range(n + 1)])
    for c in (0.0, HINGE_BITS):
        want = float((pk * np.maximum(0, s - c)).sum())
        # levels only cover ordinals seen while estimating; the unseen top values carry ~2^-40 mass
        assert abs(T.prior_mean_bits(c) - want) < 1e-6, (c, T.prior_mean_bits(c), want)
    want = float((pk * hinge(s)).sum())
    assert abs(T.prior_mean_bits(f=hinge) - want) < 1e-6


def test_fair_and_zero_mean():
    """Every penalty: P(h >= k) <= 2^-(k+1) on fresh spawns, and mean h ≈ h̄ (so the term is zero-mean)."""
    rng = np.random.default_rng(1)
    S, C = spawn_batch(GT, rng, 1 << 15)
    for pf in PENALTIES:
        if not pf.available(GT):
            continue
        p = pf.sample(rng, GT)
        T = cal.survival(Draw(pf, p), GT)
        h = hinge(T.surprisal(pf.evaluate_batch(S, C, p, GT)))
        hbar = T.prior_mean_bits(f=hinge)
        se = h.std() / math.sqrt(len(h))
        assert abs(h.mean() - hbar) < 5 * se + 0.03, (pf.id, h.mean(), hbar)
        for k in range(1, 8):
            frac = float((h >= k).mean())
            bound = 2.0 ** -k / 1.5   # h(s) <= s - log2(1.5) for s >= 1
            assert frac <= 1.3 * bound + 4 * math.sqrt(bound / len(h)), (pf.id, k, frac, bound)


def test_damage_costs_bits():
    """Painting a typical grid's row in the hated colour costs a red-hater bits; a combined ordinal floors."""
    rng = np.random.default_rng(2)
    S, C = spawn_batch(GT, rng, 4000)
    pd = Draw(rd.HATE_COLOUR, {"colour": 0})
    T = cal.survival(pd, GT)
    h0 = hinge(T.surprisal(rd.HATE_COLOUR.evaluate_batch(S, C, pd.params, GT)))
    C1 = C.copy()
    C1[:, 0, :] = 0
    C2 = np.zeros_like(C)
    h1 = hinge(T.surprisal(rd.HATE_COLOUR.evaluate_batch(S, C1, pd.params, GT)))
    h2 = hinge(T.surprisal(rd.HATE_COLOUR.evaluate_batch(S, C2, pd.params, GT)))
    assert h1.mean() - h0.mean() > 1.5 and h2.min() > 45
    # option (a): one ordinal u = #3s - #reds, one-sided surprisal, by Monte Carlo
    S0, C0 = spawn_batch(GT, rng, 1 << 16)
    u0 = np.sort(((S0 == 3).sum((1, 2)) - (C0 == 0).sum((1, 2))))

    def s_comb(Sx, Cx):
        u = (Sx == 3).sum((1, 2)) - (Cx == 0).sum((1, 2))
        G = 1.0 - np.searchsorted(u0, u, side="left") / len(u0)
        return -np.log2(np.maximum(G, 1 / len(u0)))
    loss_comb = s_comb(S, C).mean() - s_comb(S, C2).mean()
    assert loss_comb < 1.5 < h2.mean() - h0.mean(), (loss_comb, h2.mean() - h0.mean())


def _dc(mode, w=(1.0, 0.0, 1.0, 0.0), hbar=(0.7, 0.0, 0.5, 0.0), K=(4.0, 0.0, 3.0, 0.0)):
    from gridlab.defence import DefenceConstants
    w, hbar, K = map(np.array, (w, hbar, K))
    return DefenceConstants(w > 0, w, K, K, hbar, np.ones(4), mode)


def test_hinge_strict():
    s = np.linspace(0, 80, 4001)
    h = hinge(s)
    assert h[0] == 0.0 and (np.diff(h) > 0).all(), "soft hinge must be strictly increasing"
    assert abs(hinge(1.0) - (1 - math.log2(1.5))) < 1e-12 and abs(hinge(60.0) - (59 - math.log2(1.5))) < 1e-9
    assert (h <= np.maximum(s - math.log2(1.5), 1 - math.log2(1.5)) + 1e-12).all()


def test_monotone_theorem():
    """Theorem (docs/defence-goals.md §3): more points never give fewer bits and more penalty never gives a
    better net score; strictly, wherever the calibration is strict. Checked on real tables."""
    rng = np.random.default_rng(4)
    S_, C_ = spawn_batch(GT, rng, 3000)
    d = Draw(by_id("seed3_green_ones+hate_colour"), {"colour": 2, "value": 1, "defence": {"colour": 0}})
    T, PT = cal.survival(d, GT), cal.survival(d.penalty_draw(), GT)
    r = d.reward_draw().family.evaluate_batch(S_, C_, d.reward_draw().params, GT)
    q = d.penalty_draw().family.evaluate_batch(S_, C_, d.penalty_draw().params, GT)
    dc = constants([T], [PT])
    n = net_bits(T.surprisal(r)[:, None], hinge(PT.surprisal(q))[:, None], dc)[:, 0]
    for _ in range(4000):
        a, b = rng.integers(0, len(r), 2)
        if r[a] >= r[b] and q[a] <= q[b]:
            assert n[a] >= n[b] - 1e-12
        if r[a] > r[b] and q[a] <= q[b] and T.surprisal(int(r[a])) > T.surprisal(int(r[b])):
            assert n[a] > n[b]
        if r[a] >= r[b] and q[a] < q[b] and PT.surprisal(int(q[a])) < PT.surprisal(int(q[b])):
            assert n[a] > n[b]


def test_payoff_algebra():
    rng = np.random.default_rng(3)
    M, G = 400, 4
    S = rng.exponential(1.5, (M, G))
    H = rng.exponential(2.0, (M, G))
    H[:, [1, 3]] = 0
    plain = S * (S.sum(1, keepdims=True) - S)
    for mode in ("floored", "gated", "private"):
        # no scored goal: exactly the original formula
        assert np.array_equal(payoff_matrix(S, H, _dc(mode, w=(0, 0, 0, 0))), plain)
        assert np.array_equal(payoffs(S), plain)
    # floored: n_i · max(0, peers); never positive from two negatives (no farming)
    dc = _dc("floored")
    P = payoff_matrix(S, H, dc)
    n = net_bits(S, H, dc)
    peer = n.sum(1, keepdims=True) - n
    assert np.allclose(P, n * np.maximum(0, peer))
    assert (P[(n < 0)] <= 1e-12).all(), "own negative never scores positive"
    assert np.allclose(P[peer < 0], 0), "a negative collective multiplier zeroes the payoff"
    # flank: own negative with caring peers loses; the loss grows with the peers' bits
    m = (n[:, 0] < 0) & (peer[:, 0] > 0)
    assert m.any() and (P[m, 0] < 0).all()
    # gated: pathology check (own positive, gate open, peers negative -> negative payoff)
    Pg = payoff_matrix(S, H, _dc("gated"))
    bad = (n > 0) & (peer < 0) & (n.sum(1, keepdims=True) > 0)
    assert bad.any() and (Pg[bad] < 0).all()
    # private: no spite, penalties private, self-bonus bounded by K h̄
    dcp = _dc("private")
    Pp = payoff_matrix(S, H, dcp)
    for j in range(G):
        S2 = S.copy(); S2[:, j] += 0.5
        assert (payoff_matrix(S2, H, dcp) - Pp >= -1e-12).all()
        H2 = H.copy(); H2[:, j] += 2.0
        diff = payoff_matrix(S, H2, dcp) - Pp
        assert np.allclose(diff[:, [i for i in range(G) if i != j]], 0)
    assert (Pp - plain <= dcp.K * dcp.hbar + 1e-12).all()


def small(seed=5, **kw):
    base = dict(gtype=GT, n_gods=4, dealer="fixed", families=POOL,
                fixed_families=["seed3_green_ones+hate_colour", "kingdom", "blob_warden", "seed1_line_painter"],
                length="fixed", fixed_seconds=60.0, planning_seconds=20.0, seed=seed, snapshot_interval=1.0,
                policies=["greedy_private", "greedy_omniscient", "greedy_private", "cooperative"])
    base.update(kw)
    return GameConfig(**base)


def check_world(world, ev):
    S, H = world.S[:world.M], world.H[:world.M]
    assert np.allclose(S, np.array([world.svec(g) for g in world.objects]))
    assert np.allclose(H, np.array([world.hvec(g) for g in world.objects])), "stale penalty bits"
    assert (H >= 0).all() and np.allclose(H[:, ~world.dc.has], 0)


def test_game_invariants():
    for mode in ("gated", "private"):
        lg = run_game(small(payoff_mode=mode, fixed_seconds=30.0), hook=check_world)
        assert lg.defence.mode == mode
        want = payoffs(lg.final_s.astype(float), lg.final_h.astype(float), lg.defence).sum(0)
        assert np.allclose(want, lg.final_payoff, rtol=1e-4, atol=1e-2)
    log = run_game(small(), hook=check_world)
    assert log.defence.mode == "floored"
    assert log.has_penalty.tolist() == [True, False, True, False]
    assert (log.defence.w[log.has_penalty] > 0).all() and (log.defence.w[~log.has_penalty] == 0).all()
    want = payoffs(log.final_s.astype(float), log.final_h.astype(float), log.defence).sum(0)
    assert np.allclose(want, log.final_payoff, rtol=1e-4, atol=1e-2)
    m = metrics(log)
    assert len(m["defence"]) == 2 and m["penalty_scored"]
    assert all(d["damage_commits"] >= 0 and 0 <= d["undone_share"] <= 1 for d in m["defence"])
    # determinism
    log2 = run_game(small())
    assert np.array_equal(log.c_hafter, log2.c_hafter) and np.array_equal(log.final_payoff, log2.final_payoff)


def test_unscored_controls():
    """Shadow (unscored) and zero-weight games are the same game; with no defence family dealt, payoffs
    equal the old formula and the penalty logs are empty."""
    a = run_game(small(score_penalties=False))
    b = run_game(small(penalty_weight=0.0))
    for f in ("c_time", "c_agent", "c_after", "c_hafter", "final_payoff"):
        assert np.array_equal(getattr(a, f), getattr(b, f)), f
    assert (a.defence.w == 0).all() and a.has_penalty.sum() == 2
    assert np.allclose(payoffs(a.final_s.astype(float)).sum(0), a.final_payoff, rtol=1e-4, atol=1e-2)
    c = run_game(small(fixed_families=["seed3_green_ones", "kingdom", "islands", "seed1_line_painter"]))
    assert not c.has_penalty.any() and not c.c_hafter.any() and not metrics(c)["defence"]
    assert np.allclose(payoffs(c.final_s.astype(float)).sum(0), c.final_payoff, rtol=1e-4, atol=1e-3)


def test_repair_valued_only_when_scored():
    """A 'turn every red cell blue' agent is worth summoning to a red-hater on a reddened world, but has no
    value (it barely changes the reward) when the penalty is not scored."""
    from gridlab.policy import GreedyPolicy
    vals = {}
    for scored in (True, False):
        cfg = small(score_penalties=scored, fixed_families=["lucky_token+hate_colour", "kingdom", "islands",
                                                            "magic_accountant"])
        draws = draws_for(cfg)
        hated = draws[0].params["defence"]["colour"]
        fav = draws[0].params["X"]
        tables = [cal.survival(d, GT) for d in draws]
        w = World(cfg, draws, tables, np.random.default_rng(0))
        rng = np.random.default_rng(1)
        for _ in range(12):
            s, c = rng.integers(0, GT.S, (5, 5)), rng.integers(0, GT.C, (5, 5))
            c[:3] = hated   # damaged: 15+ hated cells
            w.add_object(Grid(s, c))
        new = [k for k in range(GT.C) if k not in (hated, fav)][0]
        prog = Program(steps=[("recolour", {"kind": "all", "pair": (hated, new)})])
        pol = GreedyPolicy(0, w, np.random.default_rng(2), None)
        vals[scored] = float(pol.mean_delta([prog])[0])
    assert vals[True] > 20 and vals[True] > 5 * abs(vals[False]), vals


def test_card():
    v = by_id("seed3_green_ones+hate_colour")
    d = Draw(v, {"colour": 2, "value": 1, "defence": {"colour": 0}})
    txt = card(d, GT, K=4.3)
    assert "✨" in txt and "⚠️" in txt and "−1 for each red cell" in txt and "about 4 points" in txt
    T, PT = cal.survival(d, GT), cal.survival(d.penalty_draw(), GT)
    red = Grid(np.ones((5, 5)), np.zeros((5, 5)))
    line = object_line(d, T, PT, red, GT)
    assert "redder than 99% of grids" in line and "rarer than" in line, line
    calm = Grid(np.ones((5, 5)), np.arange(25).reshape(5, 5) % 3 + 1)   # no red at all
    assert "fine" in object_line(d, T, PT, calm, GT)
    assert "⚠️" not in card(Draw(by_id("kingdom"), {"C": 0}), GT)


def test_constants():
    tabs = [cal.survival(Draw(by_id("seed3_green_ones"), {"colour": 0, "value": 1}), GT),
            cal.survival(Draw(by_id("kingdom"), {"C": 0}), GT)]
    pt = [cal.survival(Draw(rd.HATE_COLOUR, {"colour": 1}), GT), None]
    dc = constants(tabs, pt)
    assert dc.has.tolist() == [True, False]
    assert abs(dc.K[0] - tabs[1].prior_mean_bits()) < 1e-12 and dc.K[1] == 0 and dc.mode == "floored"
    assert 0.3 < tabs[1].prior_mean_bits() < 1 / math.log(2) + 1e-9
    assert constants(tabs, pt, rate=1.0).K[0] == 1.0
    assert (constants(tabs, pt, scored=False).K == 0).all() and not constants(tabs, pt, scored=False).scored


def main():
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            t0 = time.perf_counter()
            fn()
            print(f"ok {name} ({time.perf_counter() - t0:.2f}s)")


if __name__ == "__main__":
    main()
