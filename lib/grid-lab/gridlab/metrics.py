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

Headline `dynamism` in [0, 1] (weights sum to 1):
  0.25 * tension_rate
+ 0.20 * sq(spirals per 100 commits)
+ 0.20 * sq(lead changes per 100 s)
+ 0.20 * min(1, late_activity / 0.2)        (liveness)
+ 0.15 * mutator_entropy_norm
where sq(x) = x / (1 + x). It rewards conflict, cooperative spirals, changing leaders, worlds that
keep moving, and varied mutator use; each term is rate-normalised so game length matters little.

Sharpened spiral / tension metrics (`spiral_metrics(log)`, merged into `metrics(log)` under ep_/fb_/tn_ keys).
The per-commit `spiral` above counts any 2+ consecutive salience rises; at ~4 commits per object per
second most such runs are chance (a random walk with P(up) ~ 0.4 makes them constantly). These are
stricter and come with a permutation null:
  episode (climb)       per object, a zigzag upswing of its salience path σ (spawn value, then after each
                        commit): from a trough to the running peak, ended when σ falls more than
                        tol = max(EP_TOL_MIN, EP_TOL_FRAC * (peak - trough)) below the peak, or below the
                        trough. Dips within tol do not end it. Properties: gain (bits), commits, seconds,
                        up-steps (Δσ >= 0.5), contributors (distinct owners of up-steps), beneficiaries
                        (gods whose surprisal rose >= 1 bit over it), losers (fell >= 1 bit), top_share
                        (largest single step / gain: 1 = one jackpot commit), accel ((gain in the second
                        half of its commits - first half) / gain, > 0 = convex), retention (share of the
                        gain still there EP_HOLD s after the peak, or at the end of the game)
  cooperative spiral    an episode with gain >= EP_MIN_GAIN, >= 3 up-steps, >= 2 contributors,
                        >= 2 beneficiaries and top_share <= EP_MAX_TOP (contiguous, not one jackpot)
  ep_spirals_per_100s   cooperative spirals per 100 s; _accel those with accel > 0; _held those with
                        retention >= 0.75
  ep_spiral_excess      observed / permutation-null count (each object's commit increments shuffled,
                        owners and surprisal vectors carried along, EP_NULL_REPS reps): > 1 means
                        increments on one object are positively autocorrelated (feedback), not chance
  fb_autocorr           pooled lag-1 correlation of consecutive Δσ on the same object
  fb_up_after_up        P(Δσ > 0.5 | previous Δσ > 0.5) - P(Δσ > 0.5 | previous Δσ < -0.5)
  fb_drift_<bin>        mean Δσ per commit for objects whose salience is in that bin (bits), and
  fb_rate_<bin>         commits per object-second in that bin (pile-on: are salient objects hit more?)
  tension event         a commit raising some god's surprisal >= 1 bit and lowering another's >= 1 bit
  tn_*                  for each loser: share whose surprisal on that object recovers to within 25%
                        of the loss within TN_HORIZON s (tn_recovered), split into recovered by the
                        loser's own agent (tn_counter) or by someone else's (tn_incidental);
                        tn_theft_rate = share of commits where the owner gains >= 2 and another god
                        loses >= 2; tn_theft_kept = share of thefts whose owner gain survives TN_HORIZON s
  tn_reversal_rate      share of commits with |Δσ| >= 2 undone (σ back within 0.5 bits of its prior
                        value) within the next 3 commits on that object: churn without progress
"""
from __future__ import annotations

import math
from collections import Counter

import numpy as np

from .sim import GameLog, payoffs

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


def metrics(log: GameLog, spiral_detail: bool = True) -> dict:
    G = log.n_gods
    K = len(log.c_time)
    T = max(log.duration, EPS)
    m: dict = {"gtype": log.gtype.key, "families": list(log.families), "policies": list(log.policies),
               "duration": float(log.duration), "commits": K, "agents": int(len(log.a_owner)),
               "commit_rate": K / T, **{f"n_{k}": v for k, v in log.counters.items()}}
    att = log.counters.get("attempts", 0)
    m["success_rate"] = K / att if att else 0.0
    d = log.c_after - log.c_before if K else np.zeros((0, G))
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
        dp = payoffs(log.c_after.astype(float)).sum(1) - payoffs(log.c_before.astype(float)).sum(1)
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

    if spiral_detail:
        m.update(spiral_metrics(log))

    w = DYNAMISM_WEIGHTS
    m["dynamism"] = (w["tension"] * m["tension_rate"] + w["spirals"] * _sq(m["spirals_per_100_commits"])
                     + w["lead_changes"] * _sq(m["lead_changes_per_100s"])
                     + w["liveness"] * min(1.0, m["late_activity"] / 0.2)
                     + w["entropy"] * m["mutator_entropy_norm"])
    return m


# ------------------------------------------------------------------------------------------------
# sharpened spirals, feedback and tension (see module docstring)
# ------------------------------------------------------------------------------------------------
EP_TOL_MIN, EP_TOL_FRAC = 2.0, 0.25
EP_MIN_GAIN, EP_MAX_TOP, EP_HOLD = 8.0, 0.6, 10.0
EP_REPORT_GAIN = 4.0
EP_NULL_REPS = 3
TN_HORIZON = 20.0
SAL_BINS = (0.0, 4.0, 8.0, 16.0, 32.0, 64.0, math.inf)


def _object_paths(log: GameLog) -> list[tuple]:
    """Per object with >= 1 commit: (obj id, commit indices in time order, salience path σ (n+1,),
    surprisal path V (n+1, G))."""
    K = len(log.c_time)
    if not K:
        return []
    order = np.lexsort((np.arange(K), log.c_obj))
    objs = log.c_obj[order]
    bounds = np.flatnonzero(np.r_[True, objs[1:] != objs[:-1], True])
    out = []
    for a, b in zip(bounds[:-1], bounds[1:]):
        idx = order[a:b]
        V = np.vstack([log.c_before[idx[0]][None, :], log.c_after[idx]]).astype(float)
        out.append((int(objs[a]), idx, V.sum(1), V))
    return out


def _upswings(v: np.ndarray, tol_min: float = EP_TOL_MIN, tol_frac: float = EP_TOL_FRAC,
              report: float = EP_REPORT_GAIN) -> list[tuple[int, int, bool]]:
    """Zigzag upswings (trough index, peak index, still open at the end) of a path, gain >= report."""
    out = []
    a = b = 0
    n = len(v)
    for i in range(1, n):
        x = v[i]
        if x > v[b]:
            b = i
        elif x < v[a] or v[b] - x > max(tol_min, tol_frac * (v[b] - v[a])):
            if v[b] - v[a] >= report:
                out.append((a, b, False))
            a = b = i
    if v[b] - v[a] >= report:
        out.append((a, b, True))
    return out


def episodes(log: GameLog, paths=None) -> list[dict]:
    """Every salience climb (gain >= EP_REPORT_GAIN) with the properties listed in the module docstring."""
    paths = _object_paths(log) if paths is None else paths
    owner_all = log.a_owner[log.c_agent].astype(int) if len(log.c_time) else np.zeros(0, int)
    t_all = log.c_time.astype(float)
    out = []
    for obj, idx, v, V in paths:
        tt = t_all[idx]
        own = owner_all[idx]
        for a, b, open_ in _upswings(v):
            inc = np.diff(v[a:b + 1])
            gain = float(v[b] - v[a])
            upm = inc >= 0.5
            n = b - a
            h = n // 2
            g1, g2 = float(inc[:h].sum()), float(inc[n - h:].sum())
            dv = V[b] - V[a]
            t_peak = float(tt[b - 1])
            # value EP_HOLD s after the peak (after the last commit inside that window; the game end caps it)
            held_v = v[b + int((tt[b:] <= t_peak + EP_HOLD).sum())]
            out.append({"obj": obj, "start": float(tt[a]), "end": t_peak, "commits": int(n), "gain": gain,
                        "trough": float(v[a]), "peak": float(v[b]), "up_steps": int(upm.sum()),
                        "contributors": len(set(own[a:b][upm].tolist())),
                        "beneficiaries": int((dv >= 1).sum()), "losers": int((dv <= -1).sum()),
                        "top_share": float(inc.max() / gain), "accel": (g2 - g1) / gain if n >= 2 else 0.0,
                        "retention": float((held_v - v[a]) / gain), "open": bool(open_),
                        "first": int(idx[a]), "last": int(idx[b - 1])})
    return out


def is_spiral(e: dict) -> bool:
    return (e["gain"] >= EP_MIN_GAIN and e["up_steps"] >= 3 and e["contributors"] >= 2
            and e["beneficiaries"] >= 2 and e["top_share"] <= EP_MAX_TOP)


def _null_paths(log: GameLog, paths, rng) -> tuple[list, np.ndarray]:
    """Permutation null: each object's commits reordered at random, increments and owners carried along.
    Returns (paths, agent ids in permuted order) so owners line up with the shuffled increments."""
    c_agent = log.c_agent.copy()
    out = []
    for obj, idx, v, V in paths:
        dV = np.diff(V, axis=0)
        p = rng.permutation(len(idx))
        V2 = np.vstack([V[:1], V[0] + np.cumsum(dV[p], axis=0)])
        c_agent[idx] = log.c_agent[idx[p]]
        out.append((obj, idx, V2.sum(1), V2))
    return out, c_agent


def spiral_metrics(log: GameLog, null_reps: int = EP_NULL_REPS, seed: int = 0) -> dict:
    """ep_* (episodes and cooperative spirals), fb_* (feedback) and tn_* (tension resolution) summaries."""
    m: dict = {}
    T = max(float(log.duration), EPS)
    K = len(log.c_time)
    paths = _object_paths(log)
    eps_ = episodes(log, paths)
    sp = [e for e in eps_ if is_spiral(e)]
    big = [e for e in eps_ if e["gain"] >= EP_MIN_GAIN]
    m["ep_climbs_per_100s"] = 100.0 * len(big) / T
    m["ep_spirals"] = len(sp)
    m["ep_spirals_per_100s"] = 100.0 * len(sp) / T
    m["ep_spirals_accel_per_100s"] = 100.0 * sum(e["accel"] > 0 for e in sp) / T
    m["ep_spirals_held_per_100s"] = 100.0 * sum(e["retention"] >= 0.75 for e in sp) / T
    m["ep_spiral_share"] = len(sp) / len(big) if big else 0.0
    for k in ("gain", "commits", "contributors", "beneficiaries", "accel", "retention", "top_share"):
        m[f"ep_spiral_{k}_mean"] = float(np.mean([e[k] for e in sp])) if sp else 0.0
    m["ep_spiral_gain_max"] = float(max((e["gain"] for e in sp), default=0.0))
    m["ep_spiral_contested"] = float(np.mean([e["losers"] > 0 for e in sp])) if sp else 0.0
    if null_reps and K:
        rng = np.random.default_rng(seed)
        cnt = []
        for _ in range(null_reps):
            npaths, ag = _null_paths(log, paths, rng)
            saved = log.c_agent
            log.c_agent = ag
            try:
                cnt.append(sum(is_spiral(e) for e in episodes(log, npaths)))
            finally:
                log.c_agent = saved
        m["ep_spirals_null_per_100s"] = 100.0 * float(np.mean(cnt)) / T
        m["ep_spiral_excess"] = (len(sp) + 1.0) / (float(np.mean(cnt)) + 1.0)
    else:
        m["ep_spirals_null_per_100s"], m["ep_spiral_excess"] = 0.0, 1.0

    # --- feedback: is progress on an object followed by more progress? does salience attract hits?
    a_inc, b_inc, drift = [], [], {k: [0.0, 0] for k in range(len(SAL_BINS) - 1)}
    expo = np.zeros(len(SAL_BINS) - 1)
    hits = np.zeros(len(SAL_BINS) - 1)
    spawn_t = dict(zip(log.s_obj.tolist(), log.s_time.astype(float).tolist())) if log.s_obj is not None else {}
    for obj, idx, v, V in paths:
        inc = np.diff(v)
        a_inc.append(inc[:-1]); b_inc.append(inc[1:])
        bins = np.searchsorted(SAL_BINS, v[:-1], side="right") - 1
        for bi, x in zip(bins.tolist(), inc.tolist()):
            drift[bi][0] += x
            drift[bi][1] += 1
        tt = np.r_[max(spawn_t.get(obj, 0.0), 0.0), log.c_time[idx].astype(float), T]
        allb = np.searchsorted(SAL_BINS, v, side="right") - 1
        np.add.at(expo, allb, np.diff(tt))
        np.add.at(hits, bins, 1)
    if a_inc:
        x, y = np.concatenate(a_inc), np.concatenate(b_inc)
        m["fb_autocorr"] = float(np.corrcoef(x, y)[0, 1]) if len(x) > 3 and x.std() > 0 and y.std() > 0 else 0.0
        pu = (y[x > 0.5] > 0.5).mean() if (x > 0.5).any() else 0.0
        pd = (y[x < -0.5] > 0.5).mean() if (x < -0.5).any() else 0.0
        m["fb_up_after_up"] = float(pu - pd)
    else:
        m["fb_autocorr"], m["fb_up_after_up"] = 0.0, 0.0
    names = [f"{int(SAL_BINS[i])}" for i in range(len(SAL_BINS) - 1)]
    for i, nm in enumerate(names):
        s_, n_ = drift[i]
        m[f"fb_drift_{nm}"] = s_ / n_ if n_ else float("nan")
        m[f"fb_rate_{nm}"] = hits[i] / expo[i] if expo[i] > 0 else float("nan")
        m[f"fb_n_{nm}"] = int(n_)

    # --- tension events and their resolution
    if K:
        d = (log.c_after - log.c_before).astype(float)
        owner = log.a_owner[log.c_agent].astype(int)
        ar = np.arange(K)
        sig = (d >= 1).any(1) & (d <= -1).any(1)
        od = d[ar, owner]
        dd = d.copy()
        dd[ar, owner] = np.inf
        theft = (od >= 2) & (dd.min(1) <= -2)
        m["tn_event_rate"] = float(sig.mean())
        m["tn_theft_rate"] = float(theft.mean())
        rec = cnt_ = inc_ = lost = 0
        kept = nthe = 0
        rev = nbig = 0
        tim = log.c_time.astype(float)
        for obj, idx, v, V in paths:
            n = len(idx)
            tt = tim[idx]
            for q in range(n):
                k = idx[q]
                win = np.flatnonzero(tt[q + 1:] <= tt[q] + TN_HORIZON) + q + 1
                if abs(v[q + 1] - v[q]) >= 2:
                    nbig += 1
                    nxt = v[q + 2:q + 5]
                    if nxt.size and (np.abs(nxt - v[q]) <= 0.5).any():
                        rev += 1
                if sig[k]:
                    for j in np.flatnonzero(d[k] <= -1):
                        loss = -d[k, j]
                        target = V[q, j] - 0.25 * loss
                        hit = np.flatnonzero(V[win + 1, j] >= target) if win.size else np.zeros(0, int)
                        if hit.size:
                            rec += 1
                            who = owner[idx[win[hit[0]]]]
                            if who == j:
                                cnt_ += 1
                            else:
                                inc_ += 1
                        else:
                            lost += 1
                if theft[k]:
                    nthe += 1
                    o = owner[k]
                    end = V[win[-1] + 1, o] if win.size else V[q + 1, o]
                    kept += int(end - V[q, o] >= 0.75 * od[k])
        tot = rec + lost
        m["tn_losses"] = tot
        m["tn_recovered"] = rec / tot if tot else 0.0
        m["tn_counter"] = cnt_ / tot if tot else 0.0
        m["tn_incidental"] = inc_ / tot if tot else 0.0
        m["tn_theft_kept"] = kept / nthe if nthe else 0.0
        m["tn_reversal_rate"] = rev / nbig if nbig else 0.0
    else:
        for k in ("tn_event_rate", "tn_theft_rate", "tn_recovered", "tn_counter", "tn_incidental",
                  "tn_theft_kept", "tn_reversal_rate"):
            m[k] = 0.0
        m["tn_losses"] = 0
    return m
