"""Open agents tests: python3 -m tests.test_openagents   (re-executes itself with PYTHONHASHSEED=0)

Covers the closed mutation interface (constructors, validation, read-only grid), the sandbox (stateless,
deterministic clock and seeds, whitelisted imports, step budget), ast-bits-v1 (universal codes, spelling
and renaming invariance, unification with the mutator code, 8 × ast-bytes in the degenerate scheme,
Kraft at every choice point and by sampling, the published test vectors), the black-box decision
estimators (deterministic bounds, the randomized shuffle-corrected I), the price split, the attack,
the second-law bound, and the simulator option (defaults unchanged)."""
from __future__ import annotations

import ast
import json
import math
import os
import sys
import time

import numpy as np

from gridlab import calibrate as cal
from gridlab.core import GridType, spawn
from gridlab.family import Draw
from gridlab.mutators import available, by_id
from gridlab.program import Program, Step
from gridlab.agentlang.astbytes import ast_bytes
from gridlab.openagents.api import GridView, Move, MoveError, all_moves, constructors, normalise_action
from gridlab.openagents.astbits import (Q_MOVE, ast_bits, float_bits, gamma_bits, load_tables, sample_program,
                                        string_bits)
from gridlab.openagents.examples import EXAMPLES, PROBES, attack, colour_fill, example
from gridlab.openagents.measure import (SplitMix64, decision_deterministic, decision_randomized, entropy_stats,
                                        jackknife, naming_bits, price)
from gridlab.openagents.sandbox import EPOCH, CompiledAgent, Owner, derive_seed

GT = GridType(5, "base10", "rgby")
TYPES = [GT, GridType(3, "cards", "rainbow6"), GridType(7, "base16", "rgb")]
FAST = {"n_uniform": 48, "n_structured": 24, "n_game": 0, "n_self": 8, "probes": 8, "replicates": 4, "shuffles": 8}


def owner_for(fid: str, gt: GridType, seed: int = 1) -> Owner:
    from gridlab.rules import by_id as fam
    f = fam(fid)
    d = Draw(f, f.sample(np.random.default_rng(seed), gt))
    return Owner(d, cal.survival(d, gt))


def grids(n=16, seed=0, gt=GT):
    rng = np.random.default_rng(seed)
    return [spawn(gt, rng) for _ in range(n)]


# ------------------------------------------------------------------------------------------------
# the closed interface
# ------------------------------------------------------------------------------------------------
def test_constructors_and_validation():
    for gt in TYPES:
        K = constructors(gt)
        red = gt.colour_names[0]
        m = K["paint_row"](1, red)
        assert m == K["paint"](K["row"](1), red) == K["move"]("paint", kind="line", region=(0, 1), colour=0)
        v = GridView(grids(1, gt=gt)[0], gt)
        assert K["paint"](v.rows[1], red) == m and K["paint"](v.cell(1, 2), red).params["kind"] == "cell"
        for bad in (lambda: K["paint_row"](gt.N, red), lambda: K["paint"](K["row"](0), "purple"),
                    lambda: K["recolour"](K["cell"](0, 0), red, red), lambda: K["move"]("paint", kind="line")):
            try:
                bad()
                raise AssertionError("accepted an illegal move")
            except MoveError:
                pass
        # every legal move of every mutator is constructible and re-validates
        for mv in all_moves(gt)[::37]:
            assert normalise_action([mv], gt) == (mv,)
    try:
        normalise_action(["paint"], GT)
        raise AssertionError
    except MoveError:
        pass


def test_view_is_read_only():
    g = grids(1)[0]
    v = GridView(g, GT)
    for f in (lambda: setattr(v.cells[0], "colour", "red"), lambda: setattr(v, "size", 3),
              lambda: setattr(Move("turn_grid", {"move": "rot90"}), "mid", "x")):
        try:
            f()
            raise AssertionError("mutation allowed")
        except AttributeError:
            pass
    assert v.count(v.cells[0].colour) >= 1 and v.after(constructors(GT)["paint_all"]("red")).count("red") == 25


# ------------------------------------------------------------------------------------------------
# the sandbox
# ------------------------------------------------------------------------------------------------
def test_sandbox_stateless_deterministic_closed():
    g = grids(1)[0]
    runs = {n: CompiledAgent(colour_fill(s, GT), GT) for n, s in PROBES.items()}
    st = [runs["stateful"].run(g).moves for _ in range(5)]
    assert len(set(st)) == 1 and st[0][0].params["region"] == (0, 1)          # module state never survives
    ms = [runs["module_stash"].run(g) for _ in range(3)]
    assert all(r.error is None for r in ms) and len({r.moves for r in ms}) == 1   # modules refuse assignment
    ck = [runs["clock_reader"].run(g, seed=s) for s in range(4)]
    assert len({r.moves for r in ck}) == 1 and all(r.used_time and not r.used_random for r in ck)
    # the clock starts at EPOCH on every application and ticks per call
    a = CompiledAgent("import time\ndef agent(grid):\n    t = [time.time() for _ in range(3)]\n"
                      f"    assert t == [{EPOCH} + k * 1e-6 for k in (1, 2, 3)], t\n    return []\n", GT)
    assert a.run(g).error is None
    # seeded randomness: same seed same action, different seeds differ
    r = CompiledAgent(example("random_row", GT), GT)
    assert r.run(g, 5).moves == r.run(g, 5).moves
    assert len({r.run(g, s).moves for s in range(20)}) > 1
    # closed: no files, no eval, no non-preloaded modules; errors do nothing
    for src in ("def agent(grid):\n    open('x')\n", "def agent(grid):\n    return eval('1')\n",
                "import os\ndef agent(grid):\n    return []\n", "def agent(grid):\n    return [1]\n",
                "import random\ndef agent(grid):\n    return [random.SystemRandom().random()]\n"):
        res = CompiledAgent(src, GT).run(g)
        assert res.error is not None and res.moves == () and res.grid == g, (src, res.error)


def test_step_budget():
    g = grids(1)[0]
    for src in ("def agent(grid):\n    while True:\n        pass\n",
                "def agent(grid):\n    while True:\n        try:\n            pass\n        except BaseException:\n            pass\n",
                "def agent(grid):\n    return [x for x in range(10**9)]\n"):
        res = CompiledAgent(src, GT).run(g, step_limit=20_000)
        assert res.error == "ran out of steps" and res.steps > 20_000 and res.moves == ()
    # previews and scores cost N² steps each
    o = owner_for("seed1_line_painter", GT)
    res = CompiledAgent("def agent(grid):\n    [score(m) for m in moves('paint')]\n    return []\n", GT).run(g, 0, o)
    assert res.steps >= 272 * 25 and res.error is None


def test_seeds():
    assert derive_seed("measure", GT.key, 0, 0) != derive_seed("play", GT.key, 0, 0)
    assert derive_seed("x", 1) == derive_seed("x", 1) and 0 <= derive_seed("x", 1) < 2 ** 64
    sm = SplitMix64(0)
    assert sm.next() == 0xE220A8397B1DCDAF        # the published SplitMix64 reference value
    assert sorted(SplitMix64(1).permutation(10)) == list(range(10))


# ------------------------------------------------------------------------------------------------
# ast-bits-v1
# ------------------------------------------------------------------------------------------------
def test_universal_codes():
    assert [gamma_bits(n) for n in (1, 2, 3, 4, 7, 8)] == [1, 3, 3, 5, 5, 7]
    assert sum(2.0 ** -gamma_bits(n) for n in range(1, 1 << 14)) > 1 - 1e-3
    assert abs(string_bits("red") - (gamma_bits(4) + 3 * math.log2(98))) < 1e-12
    assert string_bits("é") > string_bits("e") and float_bits(1.5) == gamma_bits(4) + 3 * math.log2(18)


def test_spelling_and_renaming_invariance():
    same = ['def agent(grid):\n    return [paint_row(2, "red")]\n',
            'def agent(g):\n    return [paint(row(2), red)]\n',
            'def agent(x):\n    return [move("paint", kind="line", region=(0, 2), colour=0)]\n',
            'def agent(grid):\n    return [paint(row(2), "red")]\n']
    bits = {round(ast_bits(s, GT)["total"], 9) for s in same}
    assert len(bits) == 1, bits
    a = "def agent(grid):\n    best = max(grid.cells, key=lambda c: c.value)\n    return []\n"
    b = "def agent(q):\n    zz = max(q.cells, key=lambda w: w.value)\n    return []\n"
    assert abs(ast_bits(a, GT)["total"] - ast_bits(b, GT)["total"]) < 1e-9


def test_literal_move_is_the_mutator_code():
    """A literal move costs the flag plus log2(#mutators) + D: the Program step's base + describe."""
    frame = ast_bits("def agent(grid):\n    return [x]\n", GT)
    for gt in TYPES:
        rng = np.random.default_rng(3)
        for m in available(gt):
            p = m.sample(rng, gt)
            src = f'def agent(grid):\n    return [move("{m.id}", ' + ", ".join(f"{k}={v!r}" for k, v in p.items()) + ")]\n"
            r = ast_bits(src, gt)
            t = Step.make(m.id, p).mutator.terms(p, gt)
            assert abs(r["moves"] - (-math.log2(Q_MOVE) + t["base"] + t["describe"])) < 1e-9, (m.id, r["moves"])
            if gt == GT:
                # everything but the move is the same frame as `return [x]` (minus the name x)
                assert r["literals"] == 0.0


def test_ast_bytes_is_the_degenerate_scheme():
    for n in EXAMPLES:
        src = example(n, GT)
        assert abs(ast_bits(src, GT, "ast-bytes")["total"] - 8 * ast_bytes(src)) < 1e-9, n
    for n, s in PROBES.items():
        assert abs(ast_bits(s, GT, "ast-bytes")["total"] - 8 * ast_bytes(s)) < 1e-9, n


def test_kraft_every_choice_point():
    for scheme in ("corpus", "uniform"):
        T = load_tables(scheme)
        for cls, fields in T.classes.items():
            for f, k in fields:
                if k["k"] == "node":
                    for m in ("one", "opt", "seq", "seq_opt", "implied_opt"):
                        assert abs(sum(T.node_dist(cls, f, k["cat"], m).values()) - 1) < 1e-9, (cls, f, m)
        for d in [T.ext, T.attr, T.kwarg, T.modpath, *T.modattr.values()]:
            assert abs(sum(d.values()) - 1) < 1e-9


def test_kraft_by_sampling():
    """Programs drawn from the code's own distribution: every one that round-trips through Python has code
    length exactly -log2 of its sampling probability, so Σ 2^-L ≤ P(sampler halts) ≤ 1."""
    for scheme in ("corpus", "uniform"):
        rng = np.random.default_rng(11)
        matched = 0
        for _ in range(800):
            tree, lp = sample_program(rng, GT, scheme, 120)
            if tree is None:
                continue
            try:
                src = ast.unparse(tree)
                if ast.dump(ast.parse(src)) != ast.dump(tree):
                    continue
            except Exception:  # noqa: BLE001
                continue
            assert abs(ast_bits(src, GT, scheme)["total"] + lp) < 1e-6, (scheme, src)
            matched += 1
        assert matched >= 30, matched


def test_stdlib_encodes():
    from gridlab.openagents.build_tables import corpus_files
    files = corpus_files()
    for f in files[:: max(1, len(files) // 25)]:
        r = ast_bits(f.read_text(encoding="utf-8"), GT)
        assert r["total"] > 0


def test_published_vectors():
    from pathlib import Path
    p = Path(__file__).resolve().parents[1] / "gridlab" / "openagents" / "test_vectors.json"
    v = json.loads(p.read_text())
    for name, e in v["programs"].items():
        for scheme in ("corpus", "uniform"):
            r = ast_bits(e["source"], GT, scheme)
            for k, x in e[scheme].items():
                assert abs(r[k] - x) < 1e-5, (name, scheme, k, r[k], x)
        assert ast_bytes(e["source"]) == e["ast_bytes"]
    for n, b in v["codes"]["gamma"].items():
        assert gamma_bits(int(n)) == b
    assert v["seeds"]["derive_seed('play', 7, 0)"] == derive_seed("play", 7, 0)


# ------------------------------------------------------------------------------------------------
# decision estimators
# ------------------------------------------------------------------------------------------------
def _pc(r, c, k=0):
    return Move("paint", {"kind": "cell", "region": (r, c), "colour": k})


def test_deterministic_estimators():
    const = decision_deterministic([(_pc(0, 0),)] * 32, GT, 0.5)
    assert const["bits"] == 0.0
    half = decision_deterministic([(_pc(0, 0),)] * 16 + [(_pc(0, 1),)] * 16, GT, 0.5)
    assert abs(half["bits"] - (1 + 1 / (2 * 32 * math.log(2)))) < 1e-9, half
    # an action that is a set of up to 25 cells: the joint saturates, the set bound resolves it
    rng = np.random.default_rng(0)
    acts = [tuple(_pc(r, c) for r in range(5) for c in range(5) if rng.random() < 0.25) for _ in range(256)]
    d = decision_deterministic(acts, GT, 0.5)
    assert d["binding"] == "set" and 15 < d["bits"] < 22, d
    # all estimates are at most the naming bound's order and naming is an upper bound on the joint
    assert d["estimates"]["naming"] >= d["bits"]


def test_randomized_estimator():
    # pure noise: I ≈ 0 after the shuffle correction
    rng = np.random.default_rng(1)
    rows = [[(_pc(0, int(rng.integers(5))),) for _ in range(8)] for _ in range(64)]
    d = decision_randomized(rows, GT, 0.5, 16, 7)
    assert d["I_plugin"] > 0.2 and d["bits"] < 0.1, d
    # a deterministic function of the grid hidden in randomized rows: I ≈ H(A) = 1 bit
    rows = [[(_pc(0, i % 2),)] * 8 for i in range(64)]
    d = decision_randomized(rows, GT, 0.5, 16, 7)
    assert abs(d["bits"] - 1.0) < 0.15, d


def test_known_mutual_information():
    """An agent that paints a uniformly random blue cell: I(X; A) is known exactly on the reference grids."""
    from gridlab.openagents.evaluate import RANDOM_BLUE, exact_I_random_blue
    from gridlab.openagents.measure import reference, PRICING
    P = {**FAST, "n_self": 0, "replicates": 8}
    r = price(colour_fill(RANDOM_BLUE, GT), GT, None, P)
    refs, _ = reference(GT, {**PRICING, **P})
    truth = exact_I_random_blue(GT, refs)
    assert r["randomized"] and abs(r["decision"] - truth) < 0.35, (r["decision"], truth, r["I_plugin"])
    assert r["I_plugin"] > r["decision"]          # the plug-in overcharges; the jackknife removes most of it


def test_price_split_and_estimates():
    o = owner_for("seed1_line_painter", GT)
    r = price(example("paint_one_row", GT), GT, None, FAST)
    step = Program(steps=(Step.make("paint", {"kind": "line", "region": (0, 2), "colour": 0}),))
    t = step.steps[0].mutator.terms(step.steps[0].params, GT)
    assert r["decision"] == 0.0 and r["summon_bits"] == r["description"]
    assert abs(r["per_application_bits"] - (t["erase"] + t["move"])) < 1e-9
    rb = price(example("paint_best_line", GT), GT, None, FAST)
    assert abs(rb["decision"] - math.log2(10)) < 0.5, rb["decision"]         # ≈ the mutator's own M = log2 2N
    rh = price(example("recolour_by_hand", GT), GT, None, FAST)
    assert rh["binding"] == "set" and 12 < rh["decision"] < 25, rh["estimates"]
    rr, hh = price(example("random_row", GT), GT, None, FAST), price(example("hashed_row", GT), GT, None, FAST)
    assert rr["randomized"] and rr["decision"] < 0.3 and not hh["randomized"] and hh["decision"] > 1.5, (rr, hh)
    rf = price(example("random_row", GT), GT, None, {**FAST, "randomness": "forbidden"})
    assert rf["error_rate"] == 1.0 and rf["per_application_bits"] == 0.0
    g = price(example("greedy_paint", GT), GT, o, FAST)
    assert g["uses_score"] and g["decision"] <= g["estimates"]["naming"] and g["decision"] <= math.log2(272)
    try:
        price(example("greedy_paint", GT), GT, None, FAST)
        raise AssertionError("score without an owner")
    except ValueError:
        pass
    # deterministic and cached
    assert price(example("reddest_row", GT), GT, None, FAST, cache=False)["decision"] == \
        price(example("reddest_row", GT), GT, None, FAST, cache=False)["decision"]


def test_attack_is_caught():
    P = {"n_uniform": 128, "n_structured": 64, "n_game": 64, "n_self": 8, "probes": 8}
    r = price(attack(GT, 13), GT, None, P)
    bc = r["by_component"]
    assert bc["uniform"]["decision"] < 0.3 and bc["game"]["decision"] > 0.8 and r["decision"] > 2 * bc["uniform"]["decision"], bc


def test_second_law_bound():
    from gridlab.openagents.evaluate import dv_bound
    assert abs(dv_bound(0.0) - 1 / math.log(2)) < 1e-3
    X = grids(256, seed=9)
    fams = ["seed1_line_painter", "conqueror", "rainbow_road", "number_bonds"]
    owners = {f: owner_for(f, GT) for f in fams}
    for n in ("fill_grid", "recolour_tool", "reddest_row", "biggest_to_corner"):
        src = example(n, GT)
        r = price(src, GT, None, FAST)
        u = r["by_component"]["uniform"]
        B = dv_bound(u["erase"] + u["decision"])
        a = CompiledAgent(src, GT)
        Y = [a.run(x).grid for x in X]
        for f, o in owners.items():
            s = np.array([o.score(y, GT) for y in Y])
            assert s.mean() - 3 * s.std() / math.sqrt(len(s)) <= B, (n, f, s.mean(), B)


# ------------------------------------------------------------------------------------------------
# simulator
# ------------------------------------------------------------------------------------------------
def test_sim_option():
    from gridlab.sim import GameConfig, run_game
    base = dict(gtype=GT, n_gods=3, length="fixed", fixed_seconds=40.0, planning_seconds=20.0,
                policies=["random", "greedy_private", "saver"], seed=4)
    a = run_game(GameConfig(**base))
    b = run_game(GameConfig(**base, open_agents="off"))
    assert np.array_equal(a.c_after, b.c_after) and set(a.a_label) <= {"program"}
    cfg = GameConfig(**base, open_agents="mix", open_share=0.9, open_pricing=FAST, open_summon_scale=0.2,
                     open_templates=["paint_best_line", "recolour_tool", "careful_greedy", "random_row"])
    x, y = run_game(cfg), run_game(cfg)
    assert np.array_equal(x.c_after, y.c_after) and x.a_label == y.a_label
    assert any(l != "program" for l in x.a_label), x.a_label
    assert x.counters["open_applications"] > 0 and x.counters["open_app_energy"] > 0
    # an owner who cannot pay per application is skipped
    poor = GameConfig(**base, open_agents="only", open_pricing=FAST, open_summon_scale=0.2, open_app_scale=1e6,
                      open_templates=["paint_best_line"])
    z = run_game(poor)
    assert z.counters["open_skips"] > 0 and z.counters["commits"] == 0


def main():
    if os.environ.get("PYTHONHASHSEED") != "0":
        os.environ["PYTHONHASHSEED"] = "0"
        os.execv(sys.executable, [sys.executable] + sys.orig_argv[1:])
    t0 = time.time()
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            t = time.time()
            fn()
            print(f"ok  {name}  ({time.time() - t:.1f} s)", flush=True)
    print(f"all open agents tests passed in {time.time() - t0:.1f} s")


if __name__ == "__main__":
    main()
