"""Agent language tests: python3 -m tests.test_agentlang

Covers parsing and kid-readable errors, IR round trips, the description code (Kraft, unification with
the mutator parameter code), the interpreter (semantics, budget, batch fast path), the decision-bit
estimator and its bounds (search ≤ log2 K, the structured-grid attack), determinism, and the
simulator option (defaults unchanged)."""
from __future__ import annotations

import math
import time

import numpy as np

from gridlab import calibrate as cal
from gridlab.core import GridType, spawn
from gridlab.family import Draw
from gridlab.mutators import _describe_bits, available, by_id
from gridlab.program import Program, Step, random_program
from gridlab.agentlang.agent import LangAgent
from gridlab.agentlang.astbytes import ast_bytes
from gridlab.agentlang.elab import elaborate, unparse
from gridlab.agentlang.examples import ATTACK, EXAMPLES, example
from gridlab.agentlang.grammar import describe_bits, sample_program
from gridlab.agentlang.interp import BATCH_COLOUR, BATCH_SYMBOL, Owner, all_moves, batch_results, run
from gridlab.agentlang.lang import LangError
from gridlab.agentlang.pricing import price

GT = GridType(5, "base10", "rgby")
TYPES = [GT, GridType(3, "cards", "rainbow6"), GridType(7, "base16", "rgb"), GridType(4, "base12", "rgb")]
FAST = {"n_uniform": 48, "n_structured": 24, "n_game": 0, "n_self": 8, "probes": 8}


def owner_for(fid: str, gt: GridType, seed: int = 1) -> Owner:
    from gridlab.rules import by_id as fam
    f = fam(fid)
    d = Draw(f, f.sample(np.random.default_rng(seed), gt))
    return Owner(d, cal.survival(d, gt))


def test_examples_parse_and_round_trip():
    for gt in TYPES:
        for name in EXAMPLES:
            src = example(name, gt)
            ir = elaborate(src, gt)
            u = unparse(ir, gt)
            assert elaborate(u, gt).canon() == ir.canon(), (name, gt.key, u)
            b1, _, _ = describe_bits(ir, gt)
            b2, _, _ = describe_bits(elaborate(u, gt), gt)
            assert abs(b1 - b2) < 1e-9 and b1 > 0
    # spelling does not matter: names, += and default arguments give the same code
    a = elaborate("x = 1\nx += 2\nshift_line(row(x), 1)", GT)
    b = elaborate("total = 1\ntotal = total + 2\nshift_line(row(total), 1, layer='both')", GT)
    assert a.canon() == b.canon()


def test_kid_errors():
    bad = {
        "while True:\n    paint(row(0), red)": "no while loops",
        "import os": "no imports",
        "paint(row(9), red)": "row numbers go from 0 to 4",
        "def f(c):\n    return f(c)\n\npaint(best(grid.cells, by=f), red)": "no recursion",
        "paint(row(1), violet)": "not a colour in this grid type",
        "x = 3\nx = red": "expected a number",
        "row(1)": "does nothing",
        "paint(best_line)": "needs colour",
        "grid.cells": "does nothing",
        "paint(best(grid.rows, by=score), red)": "by=score works on a list of moves",
    }
    for src, msg in bad.items():
        try:
            elaborate(src, GT)
        except LangError as e:
            assert msg in str(e), (src, str(e))
        else:
            raise AssertionError(f"accepted: {src!r}")


def test_mutator_code_is_complete():
    """Σ over every parameter setting of 2^-D = 1: the mutator field code is a complete prefix code,
    so a literal mutator call wastes no code space."""
    for gt in TYPES:
        for m in available(gt):
            s = sum(2.0 ** -_describe_bits(m.fields, p, gt) for p in m.space(gt))
            assert abs(s - 1.0) < 1e-9, (m.id, gt.key, s)


def test_kraft_by_sampling():
    """The coder's lengths are -log2 of the sampler's probabilities, program by program; so Σ 2^-bits
    over all programs is the sampler's halting probability ≤ 1 (Kraft)."""
    rng = np.random.default_rng(7)
    for gt in (GT, GridType(3, "cards", "rainbow6")):
        n = 0
        for _ in range(300):
            prog, logp = sample_program(gt, rng, max_nodes=80, max_depth=8)
            src = unparse(prog, gt)
            ir = elaborate(src, gt)
            assert ir.canon() == prog.canon(), src
            bits, _, _ = describe_bits(ir, gt)
            assert abs(bits + logp) < 1e-6, (src, bits, -logp)
            n += 1
        assert n == 300


def test_unification_with_program_steps():
    """A one-move agent costs the Program step's tool + D bits plus a constant framing, and its
    destruction equals the step's erasure + motion."""
    rng = np.random.default_rng(3)
    frames = set()
    for _ in range(60):
        p = random_program(rng, GT, max_steps=1, guard_prob=0.0)
        st = p.steps[0]
        t = st.mutator.terms(st.params, GT)
        src = unparse_const(st)
        ir = elaborate(src, GT)
        assert ir.kids[1][0].kids[0].tag == "ConstCall", src
        c = price(ir, GT, pricing=FAST, cache=False)
        frames.add(round(c["description"] - t["base"] - t["describe"], 9))
        assert abs(c["destruction"] - t["erase"] - t["move"]) < 1e-9, src
        if st.params.get("kind") == "line*":
            assert c["decision"] <= t["measure"] + 1e-9
        else:
            assert c["decision"] == 0.0
    assert len(frames) == 1, frames


def unparse_const(st: Step) -> str:
    from gridlab.agentlang.lang import Node
    prog = Node("Program", "", ((), (Node("Act", "", (Node("ConstCall", "Move", (), (st.mutator_id, st.params)),)),)))
    return unparse(prog, GT)


def test_ast_bytes():
    assert ast_bytes("paint(row(2), red)") == 11
    assert ast_bytes("x = 300") == 1 + 1 + 1 + 1 + 2   # Module, Assign, Name, Store, Constant(300: 2 bytes)


def test_semantics():
    rng = np.random.default_rng(11)
    by_hand = elaborate(example("recolour_by_hand", GT), GT)
    tool = elaborate(example("recolour_tool", GT), GT)
    for _ in range(30):
        g = spawn(GT, rng)
        assert run(by_hand, GT, g).grid == run(tool, GT, g).grid
    # reddest_row == paint the row with the most red (ties: first row)
    rr = elaborate(example("reddest_row", GT), GT)
    for _ in range(30):
        g = spawn(GT, rng)
        i = int(np.argmax((g.col == 0).sum(1)))
        col = g.col.copy(); col[i, :] = 0
        assert (run(rr, GT, g).grid.col == col).all()
    # a run-time error does nothing
    ir = elaborate("paint(row(1), red)\npaint(cell(grid.size, 0), red)", GT)
    r = run(ir, GT, spawn(GT, rng))
    assert r.aborted and not r.actions


def test_step_budget():
    ir = elaborate("for a in grid.cells:\n    for b in grid.cells:\n        for c in grid.cells:\n            x = a.value", GT)
    r = run(ir, GT, spawn(GT, np.random.default_rng(0)), limit=10_000)
    assert r.aborted and r.reason == "ran out of steps"
    r = run(ir, GT, spawn(GT, np.random.default_rng(0)), limit=1_000_000)
    assert not r.aborted


def test_batch_fast_path():
    for gt in TYPES:
        g = spawn(gt, np.random.default_rng(5))
        for mid in list(BATCH_COLOUR) + list(BATCH_SYMBOL):
            if mid not in {m.id for m in available(gt)}:
                continue
            ms = all_moves(gt, mid)
            sym, col = batch_results(g, ms, gt)
            for i, m in enumerate(ms):
                y = by_id(mid).apply(g, m.params, gt) or g
                assert (y.sym == sym[i]).all() and (y.col == col[i]).all(), (gt.key, m)


def test_search_costs_at_most_log2_k():
    own = owner_for("seed1_line_painter", GT)
    for name, K, extra in (("greedy_paint", len(all_moves(GT, "paint")), 0.0),
                           ("careful_greedy", len(all_moves(GT, "paint")), 1.0),
                           ("row_painter_search", GT.N * GT.C, 1.0),
                           ("greedy_swap", 40, 1.0)):
        c = price(elaborate(example(name, GT), GT), GT, own, pricing=FAST, cache=False)
        assert c["decision"] <= math.log2(K) + extra + 1e-9, (name, c["decision"])


def test_decision_bounds_and_attack():
    # 25 independent yes/no choices: the joint plug-in saturates at log2 n, the chain bound does not
    c = price(elaborate(example("recolour_by_hand", GT), GT), GT, cache=False)
    assert c["H"]["coverage"] < 0.5 and c["binding"] == "chain" and c["decision"] > 15
    assert c["decision"] <= c["path_bound"] + 1e-9 <= c["static_bound"] + 1e-9
    # the attack is nearly free on uniform grids but not on the mixture
    c = price(elaborate(ATTACK.replace("13", "13"), GT), GT, cache=False)
    hu = c["H_by_component"]["uniform"]["mm"]
    hg = c["H_by_component"]["game"]["mm"]
    assert hu < 0.2 and hg > 1.0 and c["decision"] > 3 * hu, (hu, hg, c["decision"])


def test_determinism_and_cache():
    own = owner_for("seed1_line_painter", GT)
    ir = elaborate(example("careful_greedy", GT), GT)
    a = price(ir, GT, own, pricing=FAST, cache=False)
    b = price(ir, GT, own, pricing=FAST, cache=False)
    for k in ("description", "decision", "destruction", "total"):
        assert a[k] == b[k]
    try:
        price(ir, GT)
    except ValueError:
        pass
    else:
        raise AssertionError("score agents need an owner")


def test_sim_option():
    from gridlab.sim import GameConfig, run_game
    base = dict(gtype=GT, n_gods=3, length="fixed", fixed_seconds=40.0, planning_seconds=20.0,
                policies=["random", "greedy_private", "saver"], seed=4)
    a = run_game(GameConfig(**base))
    b = run_game(GameConfig(**base, agent_language="off"))
    assert np.array_equal(a.c_after, b.c_after) and set(a.a_label) <= {"program"}
    cfg = GameConfig(**base, agent_language="mix", lang_share=0.8, lang_pricing=FAST,
                     lang_templates=["paint_best_line", "recolour_tool", "careful_greedy"])
    x, y = run_game(cfg), run_game(cfg)
    assert np.array_equal(x.c_after, y.c_after) and x.a_label == y.a_label
    assert any(l != "program" for l in x.a_label), x.a_label
    ag = LangAgent(example("careful_greedy", GT), GT, owner_for("seed1_line_painter", GT), "careful_greedy",
                   "search", FAST)
    assert ag.mutator_ids == ("paint",) and ag.cost() > 0


def main():
    t0 = time.time()
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            t = time.time()
            fn()
            print(f"ok  {name}  ({time.time() - t:.1f} s)")
    print(f"all agent language tests passed in {time.time() - t0:.1f} s")


if __name__ == "__main__":
    main()
