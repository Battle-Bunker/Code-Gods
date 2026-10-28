"""Game metrics (SPEC §2 names). `metrics(log) -> dict` of plain floats/ints/lists (JSON-friendly).

Definitions (Δ over one committed transformation of object x, s = surprisal vector, G gods):
  tension_rate          share of commits with some Δs_i > 0 and some Δs_j < 0 (i ≠ j)
  harmony_rate          share of commits where no god's surprisal falls and some rises
  salience_up_rate      share of commits with Δ salience > 0
  spiral                maximal run of consecutive commits of ONE object in which salience rises at
                        every step, length >= 2, made by >= 2 distinct owners
  spiral_accelerating   share of spirals of length >= 3 whose salience increments have a positive
                        least-squares slope
  lead_changes          number of times the argmax of total payoff changes between snapshots
                        (snapshots where every payoff is 0 are skipped)
  payoff_spread         max - min of final total payoffs; payoff_gini: Gini of final total payoffs
  object_volatility     mean over objects with >= 2 commits of the std of per-commit change in
                        that object's summed payoff Σ_i π_i(x) (bits²)
  t_stagnation          |Δ salience| is binned into 10 s windows; the world has stagnated from the
                        start of the final run of windows whose activity is < 5% of the busiest
                        window's (and stays so to the end). = duration if the last window is active.
                        stagnation_frac = t_stagnation / duration (1.0 = still changing at the end)
  late_activity         share of total |Δ salience| in the last 20% of the game (0.2 = uniform)
  mutator_shares        share of mutator occurrences across committed applications
  mutator_entropy       Shannon entropy (bits) of mutator_shares; _norm divides by log2(#mutators
                        registered in gridlab.mutators, else #distinct used)
  family_rank           [(family id, final rank)], rank 1 = highest final total payoff

Defence goals (docs/defence-goals.md). With scored penalties, tension and harmony use net bits
s_i - h_i (unchanged when no god has one). For every god with a defence goal, scored or shadow:
  floor_*               signed-bit floor statistics (always computed with the penalty scored, so shadow games
                        report what the floor *would* do): floor_neg_share = share of (final object, god
                        with a goal) where n_i < 0; floor_veto_share = share of final objects where some
                        god's multiplier max(0, Σ_{j≠i} n_j) is clipped; floor_dead_share = share where the
                        collective Σ_j n_j <= 0; trash_rate = share of commits whose owner had n < 0 on the
                        object and that lowered the owner's peers' summed signed bits without raising its own
  defence               per god: damage_bits / repair_bits (Σ of rises / falls of h over commits),
                        by self / others, damage_commits, undone_share (damage commits whose object
                        later returns to h <= its pre-damage level), undo_median_s, final_h_mean,
                        h_auc (mean over snapshots of the mean h over objects), repair_agents (own
                        agents whose committed Δh sums < 0) and own_agents

Headline `dynamism` in [0, 1] (weights sum to 1):
  0.25 * tension_rate
+ 0.20 * sq(spirals per 100 commits)
+ 0.20 * sq(lead changes per 100 s)
+ 0.20 * min(1, late_activity / 0.2)        (liveness)
+ 0.15 * mutator_entropy_norm
where sq(x) = x / (1 + x). It rewards conflict, cooperative spirals, changing leaders, worlds that
keep moving, and varied mutator use; each term is rate-normalised so game length matters little.
"""
from __future__ import annotations

import math
from collections import Counter

import numpy as np

from .sim import GameLog, payoffs, log_payoffs

DYNAMISM_WEIGHTS = {"tension": 0.25, "spirals": 0.20, "lead_changes": 0.20, "liveness": 0.20, "entropy": 0.15}
EPS = 1e-9
STAGNATION_WINDOW = 10.0
STAGNATION_LEVEL = 0.05


def gini(x) -> float:
    x = np.sort(np.asarray(x, float))
    if x.size == 0 or x.sum() <= 0:
        return 0.0
    n = x.size
    return float((2 * np.arange(1, n + 1) - n - 1).dot(x) / (n * x.sum()))


def _sq(x: float) -> float:
    return x / (1.0 + x)


def _n_mutators_registered() -> int | None:
    try:
        from .mutators import MUTATORS
        return len(MUTATORS)
    except Exception:
        return None


def spirals(log: GameLog) -> list[dict]:
    """All cooperative spirals: [{obj, start, length, owners, gain, increments}]."""
    if len(log.c_time) == 0:
        return []
    sal_b, sal_a = log.c_before.sum(1), log.c_after.sum(1)
    inc = sal_a - sal_b
    owner = log.a_owner[log.c_agent]
    out = []
    order = np.lexsort((np.arange(len(log.c_obj)), log.c_obj))  # by object, then time order
    objs = log.c_obj[order]
    bounds = np.flatnonzero(np.r_[True, objs[1:] != objs[:-1], True])
    for a, b in zip(bounds[:-1], bounds[1:]):
        idx = order[a:b]
        up = inc[idx] > EPS
        k = 0
        while k < len(idx):
            if not up[k]:
                k += 1
                continue
            j = k
            while j < len(idx) and up[j]:
                j += 1
            run = idx[k:j]
            if len(run) >= 2 and len(set(owner[run].tolist())) >= 2:
                out.append({"obj": int(objs[a]), "start": float(log.c_time[run[0]]), "length": len(run),
                            "owners": len(set(owner[run].tolist())),
                            "gain": float(sal_a[run[-1]] - sal_b[run[0]]), "increments": inc[run].tolist()})
            k = j
    return out


def metrics(log: GameLog) -> dict:
    G = log.n_gods
    K = len(log.c_time)
    T = max(log.duration, EPS)
    m: dict = {"gtype": log.gtype.key, "families": list(log.families), "policies": list(log.policies),
               "duration": float(log.duration), "commits": K, "agents": int(len(log.a_owner)),
               "commit_rate": K / T, **{f"n_{k}": v for k, v in log.counters.items()}}
    att = log.counters.get("attempts", 0)
    m["success_rate"] = K / att if att else 0.0
    d = log.c_after - log.c_before if K else np.zeros((0, G))
    dc = log.defence
    scored_h = dc is not None and dc.scored
    if K and scored_h:
        d = d - (log.c_hafter - log.c_hbefore) * dc.w[None, :]
    up, down = (d > EPS).any(1), (d < -EPS).any(1)
    m["tension_rate"] = float((up & down).mean()) if K else 0.0
    m["harmony_rate"] = float((up & ~down).mean()) if K else 0.0
    dsal = d.sum(1)
    m["salience_up_rate"] = float((dsal > EPS).mean()) if K else 0.0

    # spirals
    sp = spirals(log)
    lengths = [s["length"] for s in sp]
    acc = []
    for s in sp:
        if s["length"] >= 3:
            y = np.asarray(s["increments"])
            acc.append(np.polyfit(np.arange(len(y)), y, 1)[0] > 0)
    m["spirals"] = len(sp)
    m["spirals_per_100_commits"] = 100.0 * len(sp) / K if K else 0.0
    m["spiral_len_mean"] = float(np.mean(lengths)) if sp else 0.0
    m["spiral_len_max"] = int(max(lengths)) if sp else 0
    m["spiral_len_hist"] = {str(k): int(v) for k, v in sorted(Counter(min(l, 6) for l in lengths).items())}
    m["spiral_max_gain"] = float(max(s["gain"] for s in sp)) if sp else 0.0
    m["spiral_accelerating"] = float(np.mean(acc)) if acc else 0.0

    # leaderboard over time
    P = log.snap_payoff
    lc, prev = 0, None
    for row in P:
        if not (row > EPS).any():
            continue
        lead = int(np.argmax(row))
        if prev is not None and lead != prev:
            lc += 1
        prev = lead
    m["lead_changes"] = lc
    m["lead_changes_per_100s"] = 100.0 * lc / T
    fp = log.final_payoff.astype(float)
    m["final_payoff"] = fp.round(3).tolist()
    m["payoff_spread"] = float(fp.max() - fp.min()) if G else 0.0
    m["payoff_gini"] = gini(fp)
    m["welfare"] = float(fp.sum())
    sal = log.final_s.sum(1) if len(log.final_s) else np.zeros(0)
    m["final_salience_mean"] = float(sal.mean()) if sal.size else 0.0
    m["final_salience_max"] = float(sal.max()) if sal.size else 0.0
    m["final_objects"] = int(len(log.final_obj))

    # per-object volatility of summed payoff
    if K:
        hb = log.c_hbefore.astype(float) if scored_h else None
        ha = log.c_hafter.astype(float) if scored_h else None
        dp = log_payoffs(log, log.c_after.astype(float), ha).sum(1) - \
            log_payoffs(log, log.c_before.astype(float), hb).sum(1)
        vols = []
        for o in np.unique(log.c_obj):
            x = dp[log.c_obj == o]
            if x.size >= 2:
                vols.append(float(x.std()))
        m["object_volatility"] = float(np.mean(vols)) if vols else 0.0
    else:
        m["object_volatility"] = 0.0

    # stagnation
    a = np.abs(dsal)
    tot = a.sum()
    if K and tot > EPS:
        W = STAGNATION_WINDOW
        nb = max(1, int(math.ceil(T / W)))
        act = np.bincount(np.minimum((log.c_time / W).astype(int), nb - 1), weights=a, minlength=nb)
        quiet = act < STAGNATION_LEVEL * act.max()
        j = nb
        while j > 0 and quiet[j - 1]:
            j -= 1
        m["t_stagnation"] = min(T, j * W)
        m["stagnation_frac"] = m["t_stagnation"] / T
        m["late_activity"] = float(a[log.c_time >= 0.8 * T].sum() / tot)
    else:
        m["t_stagnation"], m["stagnation_frac"], m["late_activity"] = 0.0, 0.0, 0.0

    # mutator usage
    cnt = Counter()
    for aid in log.c_agent.tolist():
        cnt.update(log.a_mutators[aid])
    total = sum(cnt.values())
    shares = {k: v / total for k, v in sorted(cnt.items())} if total else {}
    H = -sum(p * math.log2(p) for p in shares.values() if p > 0)
    nreg = _n_mutators_registered() or len(shares)
    m["mutator_shares"] = {k: round(v, 4) for k, v in shares.items()}
    m["mutator_entropy"] = H
    m["mutator_entropy_norm"] = H / math.log2(nreg) if nreg and nreg > 1 else 0.0
    m["summon_cost_mean"] = float(log.a_cost.mean()) if len(log.a_cost) else 0.0

    # fairness
    ranks = log.final_ranks()
    m["family_rank"] = [(f, int(r)) for f, r in zip(log.families, ranks)]
    m["policy_rank"] = [(p, int(r)) for p, r in zip(log.policies, ranks)]

    m["defence"] = defence_metrics(log)
    m["penalty_scored"] = bool(scored_h)
    m["payoff_mode"] = dc.mode if dc is not None else "plain"
    m.update(floor_metrics(log))

    w = DYNAMISM_WEIGHTS
    m["dynamism"] = (w["tension"] * m["tension_rate"] + w["spirals"] * _sq(m["spirals_per_100_commits"])
                     + w["lead_changes"] * _sq(m["lead_changes_per_100s"])
                     + w["liveness"] * min(1.0, m["late_activity"] / 0.2)
                     + w["entropy"] * m["mutator_entropy_norm"])
    return m


def defence_metrics(log: GameLog) -> list[dict]:
    """Damage and repair of each defence goal (see the module docstring); [] if no god has one."""
    if log.has_penalty is None or not log.has_penalty.any():
        return []
    K = len(log.c_time)
    owner = log.a_owner[log.c_agent] if K else np.zeros(0, int)
    out = []
    for i in np.flatnonzero(log.has_penalty):
        dh = (log.c_hafter[:, i] - log.c_hbefore[:, i]).astype(float) if K else np.zeros(0)
        own = owner == i
        dmg, rep = dh > EPS, dh < -EPS
        # undone: a later commit on the same object brings h back to <= the pre-damage level
        undone, waits = 0, []
        for o in np.unique(log.c_obj[dmg]) if K else []:
            idx = np.flatnonzero(log.c_obj == o)
            hb, ha, tt = log.c_hbefore[idx, i], log.c_hafter[idx, i], log.c_time[idx]
            for a in np.flatnonzero(ha - hb > EPS):
                later = np.flatnonzero(ha[a + 1:] <= hb[a] + EPS)
                if later.size:
                    undone += 1
                    waits.append(float(tt[a + 1 + later[0]] - tt[a]))
        agents = np.flatnonzero(log.a_owner == i)
        per_agent = np.zeros(len(log.a_owner))
        if K:
            np.add.at(per_agent, log.c_agent, dh)
        auc = [float(h[:, i].mean()) for h in (log.snap_h or []) if len(h)]
        out.append({
            "god": int(i), "family": log.families[i], "scored": bool(log.defence.w[i] > 0),
            "K": float(log.penalty_K_prior[i]), "hbar": float(log.penalty_hbar[i]),
            "damage_bits": float(dh[dmg].sum()), "repair_bits": float(-dh[rep].sum()),
            "damage_by_others": float(dh[dmg & ~own].sum()), "damage_by_self": float(dh[dmg & own].sum()),
            "repair_by_self": float(-dh[rep & own].sum()), "repair_by_others": float(-dh[rep & ~own].sum()),
            "damage_commits": int(dmg.sum()), "undone_share": undone / max(1, int(dmg.sum())),
            "undo_median_s": float(np.median(waits)) if waits else None,
            "final_h_mean": float(log.final_h[:, i].mean()) if len(log.final_h) else 0.0,
            "spawn_h_mean": float(log.s_hvec[:, i].mean()) if len(log.s_hvec) else 0.0,
            "h_auc": float(np.mean(auc)) if auc else 0.0,
            "own_agents": int(agents.size), "repair_agents": int((per_agent[agents] < -EPS).sum()),
            "own_commits": int(own.sum()),
        })
    return out


def floor_metrics(log: GameLog) -> dict:
    """Floor occupancy and noise-trashing (module docstring); zeros if no god has a defence goal."""
    out = {"floor_neg_share": 0.0, "floor_veto_share": 0.0, "floor_dead_share": 0.0, "trash_rate": 0.0,
           "flank_repair_rate": 0.0}
    dc = log.defence
    if dc is None or not dc.any:
        return out
    from dataclasses import replace
    from .defence import net_bits
    dcs = replace(dc, w=dc.has.astype(float)) if not dc.scored else dc
    if len(log.final_s):
        n = net_bits(log.final_s.astype(float), log.final_h.astype(float), dcs)
        peer = n.sum(1, keepdims=True) - n
        out["floor_neg_share"] = float((n[:, dc.has] < -EPS).mean())
        out["floor_veto_share"] = float((peer < -EPS).any(1).mean())
        out["floor_dead_share"] = float((n.sum(1) <= EPS).mean())
    K = len(log.c_time)
    if K:
        nb = net_bits(log.c_before.astype(float), log.c_hbefore.astype(float), dcs)
        na = net_bits(log.c_after.astype(float), log.c_hafter.astype(float), dcs)
        o = log.a_owner[log.c_agent].astype(int)
        ar = np.arange(K)
        own_b, own_a = nb[ar, o], na[ar, o]
        peer_b, peer_a = nb.sum(1) - own_b, na.sum(1) - own_a
        neg = own_b < -EPS
        out["trash_rate"] = float((neg & (peer_a < peer_b - EPS) & (own_a <= own_b + EPS)).mean())
        out["flank_repair_rate"] = float((neg & (own_a > own_b + EPS)).mean())
    return out
