"""Tests for the players package: python3 -m gridlab.explore.players.test_players  (about 1 min)."""
from __future__ import annotations

import time

import numpy as np

from . import PRESETS
from .features import diff_signature, feature_names, grid_features
from .policies import colour_proxy_bits
from ...core import GridType, spawn_batch
from ...sim import GameConfig, run_game

GT = GridType(4, "base12", "rgb")


def cfg(pols, seed=1, **kw):
    base = dict(gtype=GT, n_gods=len(pols), policies=list(pols), seed=seed, length="fixed", fixed_seconds=60.0,
                interaction_rate_hz=20.0)
    base.update(kw)
    return GameConfig(**base)


def test_features():
    for gt in (GT, GridType(5, "base10", "rgby"), GridType(6, "cards", "rainbow6")):
        s, c = spawn_batch(gt, np.random.default_rng(0), 50)
        F = grid_features(s, c, gt)
        assert F.shape == (50, len(feature_names(gt)))
        assert np.isfinite(F).all() and F.min() >= 0 and F.max() <= 1 + 1e-9
        assert diff_signature(s[0], c[0], s[0], c[0])[5] == "none"
        c2 = c[0].copy(); c2[0, 0] = (c2[0, 0] + 1) % gt.C
        sig = diff_signature(s[0], c[0], s[0], c2)
        assert sig[0] and not sig[1] and sig[5] == "cell"


def test_colour_proxy():
    b = colour_proxy_bits(GT)
    assert b[0] == 0 and np.all(np.diff(b) >= 0) and abs(b[-1] - 16 * np.log2(3)) < 1e-6


def test_smart_greedy_is_greedy_private():
    a = run_game(cfg(["greedy_private", "saver", "random"]))
    b = run_game(cfg(["smart_greedy", "saver", "random"]))
    assert a.counters == b.counters and np.array_equal(a.final_payoff, b.final_payoff)


def test_presets_run_and_are_deterministic():
    for name in PRESETS:
        pols = [name, "greedy_private", name]
        t0 = time.perf_counter()
        a = run_game(cfg(pols, seed=2))
        b = run_game(cfg(pols, seed=2))
        assert a.counters == b.counters and np.array_equal(a.final_payoff, b.final_payoff), name
        assert time.perf_counter() - t0 < 30, name


def test_chat():
    seen = {}

    def hook(w, ev):
        if ev == "end":
            seen["chat"] = list(getattr(w, "_players_chat", []))
            seen["pols"] = dict(w._players)
            seen["draws"] = list(w.draws)

    run_game(cfg(["talker", "liar", "listener", "skeptic"], seed=3), hook=hook)
    chat = seen["chat"]
    assert sorted(m["god"] for m in chat) == [0, 1, 3]          # the listener never posts
    by = {m["god"]: m for m in chat}
    assert by[0]["draw"] is seen["draws"][0] and by[0]["true"]
    assert by[1]["draw"].family.id != seen["draws"][1].family.id and not by[1]["true"]
    for g in (0, 1, 2, 3):
        p = seen["pols"][g]
        assert set(p.partners) == {m["god"] for m in chat} - {g}


def main():
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            t0 = time.perf_counter()
            fn()
            print(f"ok {name} ({time.perf_counter() - t0:.1f}s)", flush=True)


if __name__ == "__main__":
    main()
