"""Annotated game traces: replay one game deterministically and print a featured object's life around
its biggest cooperative spiral (or a tension episode): the grid at several moments, each god's
surprisal, and who changed it with which program.

    python3 -m gridlab.explore.spirals.traces --variant base --spec 5,base10,rgby:100003
    python3 -m gridlab.explore.spirals.traces --variant tend_pay --spec 5,base10,rgby:100003 --focus tension
"""
from __future__ import annotations

import argparse

import numpy as np

from ...metrics import episodes, is_spiral
from ...experiments.common import GameSpec
from .runner import play, specs_for
from .variants import VARIANTS


def _vec(v):
    return "[" + " ".join(f"{x:5.1f}" for x in v) + "]"


def _side_by_side(blocks: list[tuple[str, str]]) -> str:
    cols = [(h, b.split("\n")) for h, b in blocks]
    w = max(max(len(x) for x in b) for _, b in cols)
    w = max(w, max(len(h) for h, _ in cols))
    n = max(len(b) for _, b in cols)
    out = ["   ".join(h.ljust(w) for h, _ in cols)]
    for i in range(n):
        out.append("   ".join((b[i] if i < len(b) else "").ljust(w) for _, b in cols))
    return "\n".join(out)


def pick_episode(log, focus: str):
    eps = episodes(log)
    if focus == "spiral":
        sp = [e for e in eps if is_spiral(e)]
        if not sp:
            return None
        return max(sp, key=lambda e: e["gain"] * min(e["contributors"], 3) * (0.5 + max(e["retention"], 0)))
    # tension: the object with the most significant tension events, its busiest 30 s window
    d = log.c_after - log.c_before
    sig = (d >= 1).any(1) & (d <= -1).any(1)
    if not sig.any():
        return None
    objs, cnt = np.unique(log.c_obj[sig], return_counts=True)
    o = int(objs[np.argmax(cnt)])
    t = log.c_time[sig & (log.c_obj == o)]
    best = max(t, key=lambda x: ((t >= x) & (t < x + 30)).sum())
    idx = np.flatnonzero((log.c_obj == o) & (log.c_time >= best) & (log.c_time < best + 30))
    return {"obj": o, "first": int(idx[0]), "last": int(idx[-1]), "tension": True}


def trace(variant: dict, spec, focus: str = "spiral", frames: int = 6, context: int = 4) -> str:
    log, tables, cfg = play(variant, spec, keep_programs=True)
    e = pick_episode(log, focus)
    if e is None:
        return f"(no {focus} episode in this game)"
    o = e["obj"]
    grids = {}
    n = [0]

    def ch(world, oi, aid, before, after):
        if world.obj_ids[oi] == o:
            grids[n[0]] = world.objects[oi]
        n[0] += 1

    log2, _, _ = play(variant, spec, keep_programs=True, commit_hook=ch)
    assert len(log2.c_time) == len(log.c_time)
    gt = cfg.gtype
    ks = np.flatnonzero(log.c_obj == o)            # this object's commits in time order
    pos = {int(k): q for q, k in enumerate(ks)}
    a, b = pos[e["first"]], pos[e["last"]]
    lo, hi = max(0, a - context), min(len(ks) - 1, b + context)
    G = log.n_gods
    owner = log.a_owner[log.c_agent]
    out = []
    out.append(f"## {gt.key}, seed {spec.seed}, variant {variant.get('name')}: {G} gods, {log.duration:.0f} s, "
               f"{len(log.c_time)} commits, {len(log.a_owner)} agents")
    out.append("Gods (private rule; final payoff, rank):")
    ranks = log.final_ranks()
    for i in range(G):
        out.append(f"  g{i} {log.policies[i]:18s} {log.families[i]:22s} {log2_draw_summary(cfg, i)}  "
                   f"payoff {log.final_payoff[i]:.0f} (#{ranks[i]})")
    if not e.get("tension"):
        out.append(f"Featured: object {o}, spiral of {e['commits']} commits over {e['end'] - e['start']:.1f} s, "
                   f"salience {e['trough']:.1f} -> {e['peak']:.1f} (+{e['gain']:.1f} bits), {e['contributors']} contributing "
                   f"owners, {e['beneficiaries']} gods gain >= 1 bit, accel {e['accel']:+.2f}, retention {e['retention']:.2f}")
    else:
        out.append(f"Featured: object {o}, its busiest tension window ({b - a + 1} commits)")
    out.append("\nCommits on the object (t, owner, Δ salience, surprisal per god after, program):")
    for q in range(lo, hi + 1):
        k = int(ks[q])
        dv = log.c_after[k] - log.c_before[k]
        mark = "*" if a <= q <= b else " "
        out.append(f" {mark} t={log.c_time[k]:7.2f} g{owner[k]} Δσ {dv.sum():+6.1f} s={_vec(log.c_after[k])}  "
                   f"{log2.a_desc[log.c_agent[k]]}")
    # frames: before the episode, evenly through it, and after
    pick = sorted(set([max(lo, a - 1)] + list(np.linspace(a, b, max(2, frames - 2)).round().astype(int)) + [hi]))
    blocks = []
    for q in pick:
        k = int(ks[q])
        g = grids.get(k)
        if g is None:
            continue
        blocks.append((f"t={log.c_time[k]:.1f} σ={log.c_after[k].sum():.1f}", gt.render(g)))
    for i in range(0, len(blocks), 4):
        out.append("")
        out.append(_side_by_side(blocks[i:i + 4]))
    return "\n".join(out)


def log2_draw_summary(cfg, i):
    from ...sim import draws_for
    d = draws_for(cfg)[i]
    return d.summary(cfg.gtype)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--variant", default="base")
    ap.add_argument("--spec", required=True, help="GridType:seed, e.g. 5,base10,rgby:100003")
    ap.add_argument("--focus", default="spiral", choices=["spiral", "tension"])
    ap.add_argument("--games", type=int, default=40)
    a = ap.parse_args(argv)
    gt, seed = a.spec.split(":")
    spec = next(s for s in specs_for([gt], a.games, 1) if s.seed == int(seed)) 
    print(trace(VARIANTS[a.variant], spec, a.focus))


if __name__ == "__main__":
    main()
