"""Illustrative games: pick a cooperative-spiral game, a sharp-tension game and a stagnant game from a
cached batch, replay them (deterministically) with programs recorded, and print what happened:
the rules (private summaries), the agents summoned (kid-readable programs), the leaderboard as
sparklines, and the featured object rendered at several moments with its surprisal vector.

    python3 -m gridlab.experiments.traces                         # from the baseline batch (old, seed 1)
    python3 -m gridlab.experiments.traces --setting new --seed 9000000
    python3 -m gridlab.experiments.traces --pick 5,base10,rgby:17  # replay one spec (GridType:seed)
"""
from __future__ import annotations

import argparse
from collections import Counter

import numpy as np

from ..sim import run_game, draws_for
from .common import (GTYPES, add_dyn2, config_for, load_manifest, make_specs, run_batch, sparkline, tables_for,
                     apply_knobs)
from .settings import SETTINGS


def pick_games(rs: list[dict]) -> dict:
    add_dyn2(rs)
    ok = [r for r in rs if r["duration"] >= 150]
    spiral = max(ok, key=lambda r: (r["climbs_held_accel_per_100s"] * min(1, r["duration"] / 300), r["climb_gain_mean"]))
    tension = max(ok, key=lambda r: r["durable_lead_changes_per_obj_100s"] * max(r["snap_autocorr"], 0) +
                  0.2 * r["crossings_per_pair_100s"])
    stag = min(ok, key=lambda r: r["dynamism2"])
    return {"spiral": spiral, "tension": tension, "stagnant": stag}


def replay(st: dict, spec, focus: str, every: float = 30.0) -> None:
    apply_knobs(st.get("knobs", {}))
    cfg = config_for(st, spec)
    cfg.keep_programs = True
    draws = draws_for(cfg)
    tables = tables_for(st, cfg, draws)
    frames = []

    def hook(w, ev):
        S = w.S[:w.M].copy()
        frames.append((w.t, list(w.obj_ids), [g for g in w.objects], S, len(w.agents)))

    log = run_game(cfg, hook=hook, tables=tables)
    gt = cfg.gtype
    print(f"\n{gt.key}, seed {spec.seed}, {cfg.n_gods} gods, {log.duration:.0f} s, "
          f"{len(log.c_time)} commits, {len(log.a_owner)} agents")
    print("\nGods (rule = private utility; ranked by final payoff):")
    ranks = log.final_ranks()
    for i in np.argsort(ranks):
        d = draws[i]
        mut = Counter(m for a, o in enumerate(log.a_owner) if o == i for m in log.a_mutators[a])
        print(f"  #{ranks[i]} god {i} {log.policies[i]:17s} {d.family.name} — {d.summary(gt)}")
        print(f"      payoff {log.final_payoff[i]:.0f}, {int((log.a_owner == i).sum())} agents; mutators: "
              + ", ".join(f"{k}×{v}" for k, v in mut.most_common(5)))
    P = log.snap_payoff
    print("\nLeaderboard (total payoff, one character ≈ "
          f"{log.duration / 40:.0f} s):")
    for i in range(cfg.n_gods):
        print(f"  god {i} {sparkline(P[:, i])}  final {P[-1, i]:.0f}")
    # featured object
    if focus == "spiral":
        from ..metrics import spirals
        sp = sorted(spirals(log), key=lambda s: -s["gain"] * (s["length"] >= 3))
        oid = sp[0]["obj"] if sp else int(log.final_obj[0])
        t0 = sp[0]["start"] if sp else 0.0
    elif focus == "tension":
        cnt = Counter()
        for k in range(len(log.c_time)):
            dd = log.c_after[k] - log.c_before[k]
            if (dd >= 2).any() and (dd <= -2).any():
                cnt[int(log.c_obj[k])] += 1
        oid = cnt.most_common(1)[0][0] if cnt else int(log.final_obj[0])
        t0 = 0.0
    else:
        oid = int(log.final_obj[np.argmax(log.final_s.sum(1))]) if len(log.final_obj) else 0
        t0 = 0.0
    sel = log.c_obj == oid
    print(f"\nObject #{oid}: {int(sel.sum())} commits. Surprisal per god over its commits "
          f"(sparklines), then the grid at a few moments:")
    A = log.c_after[sel]
    for i in range(cfg.n_gods):
        if len(A):
            print(f"  s_{i} {sparkline(A[:, i], 60)}  range {A[:, i].min():.1f}–{A[:, i].max():.1f}")
    shown = 0
    last = -1e9
    for t, ids, objs, S, na in frames:
        if oid not in ids or t < t0 - 10 or t - last < every:
            continue
        j = ids.index(oid)
        print(f"\n  t = {t:6.1f} s  agents {na}  s = [{', '.join(f'{x:.1f}' for x in S[j])}]  "
              f"salience {S[j].sum():.1f}")
        for line in gt.render(objs[j]).splitlines():
            print("      " + line)
        last = t
        shown += 1
        if shown >= 6:
            break
    # which programs touched the object most
    ag = Counter(int(a) for a in log.c_agent[sel])
    print("\n  Agents that changed it most:")
    for a, n in ag.most_common(6):
        print(f"    {n:5d}×  god {log.a_owner[a]} ({log.a_cost[a]:.0f} bits): {log.a_desc[a]}")
    apply_knobs({})


def main(argv=None):
    ap = argparse.ArgumentParser(prog="gridlab.experiments.traces", description=__doc__.split("\n")[0])
    ap.add_argument("--types", default=";".join(GTYPES))
    ap.add_argument("--games", type=int, default=160)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--mix", default="mixed")
    ap.add_argument("--setting", default="old", choices=sorted(SETTINGS))
    ap.add_argument("--pick", default="", help="GridType:seed[:focus] to replay one game")
    ap.add_argument("--manifest", default="", help="choose games from a saved batch manifest (e.g. "
                    "baseline-old-mixed-1) instead of running the batch; replays use the current code")
    a = ap.parse_args(argv)
    st = SETTINGS[a.setting]
    specs = make_specs(a.types.split(";"), a.games, a.seed, a.mix)
    if a.pick:
        gt, seed, *rest = a.pick.split(":")
        spec = next(s for s in specs if s.gtype == gt and s.seed == int(seed))
        replay(st, spec, rest[0] if rest else "spiral")
        return
    rs = load_manifest(a.manifest) if a.manifest else run_batch(st, specs, label="traces", verbose=False)
    picks = pick_games(rs)
    for focus, r in picks.items():
        spec = next(s for s in specs if s.seed == r["seed"] and s.gtype == r["gtype"].replace("Grid(", "").rstrip(")"))
        print(f"\n## {focus} game (dynamism2 {r['dynamism2']:.3f}, held climbs/100s {r['climbs_held_per_100s']:.2f}, "
              f"durable leads {r['durable_lead_changes_per_obj_100s']:.2f}, autocorr {r['snap_autocorr']:.2f})")
        replay(st, spec, focus)


if __name__ == "__main__":
    main()
