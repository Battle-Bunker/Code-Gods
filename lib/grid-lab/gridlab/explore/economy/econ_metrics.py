"""Economy / lifecycle metrics for logs from run_econ_game (added on top of experiments.common.ext_metrics).

Lifecycle (per agent: active span = summon (or t=0 if summoned while planning) to death or game end)
  live_mean, live_end            live agents (all gods) averaged over snapshots / at the end
  lifespan_mean                  mean active span (s)
  useful_share                   share of agents with >= 1 commit that raised their owner's surprisal
  useful_life_ratio              mean over agents with span >= 10 s of (last owner-up commit - start) / span:
                                 1 = useful until it died (or the game ended), 0 = never useful
  idle_tail_s                    mean seconds an agent lives after its last owner-up commit (dead weight)
  up_rate_by_age                 owner-up commits per attempt in agent-age bins (econ_sim.AGE_EDGES)
  up_rate_age_ratio              up rate at age >= 120 s / up rate at age < 30 s (usefulness decay)
Accumulation / stagnation (60 s world-time bins)
  bin_live, bin_success, bin_up_per_att, bin_abs_per_att
  success_first / success_last   commits per attempt in the first / last populated bin
  up_per_att_first / _last       owner-up commits per attempt, first / last populated bin
Standings
  leader_share_final             final total-payoff share of the leader
  hold_25, hold_50               1 if the leader at 25% (50%) of the game is the final leader
  tau_25, tau_50                 Kendall tau between payoff ranks at 25% (50%) and final ranks
                                 (1 = order fixed early: snowball; 0 = unrelated)
Energy
  energy_gini_final, income_total, income_gini, gas_share (gas / all spending), cap_lost_share,
  activity_gini                  Gini of application attempts across gods (who acts in the world)
"""
from __future__ import annotations

import numpy as np

from ...metrics import gini
from .econ_sim import AGE_EDGES


def _tau(a, b) -> float:
    a, b = np.asarray(a, float), np.asarray(b, float)
    n = len(a)
    num, den = 0.0, 0
    for i in range(n):
        for j in range(i + 1, n):
            s = np.sign(a[i] - a[j]) * np.sign(b[i] - b[j])
            num += s
            den += 1
    return num / den if den else 0.0


def econ_metrics(log) -> dict:
    m: dict = {}
    G = log.n_gods
    T = max(float(log.duration), 1e-9)
    start = np.maximum(log.a_time.astype(float), 0.0)
    death = np.minimum(log.a_death.astype(float), T)
    span = np.maximum(death - start, 0.0)
    nA = len(span)
    m["live_mean"] = float(log.snap_live.sum(1).mean()) if len(log.snap_live) else 0.0
    m["live_end"] = float(log.snap_live[-1].sum()) if len(log.snap_live) else 0.0
    m["lifespan_mean"] = float(span.mean()) if nA else 0.0
    m["useful_share"] = float((log.a_up > 0).mean()) if nA else 0.0
    ok = span >= 10
    if ok.any():
        lu = log.a_last_up.astype(float)
        r = np.where(lu >= 0, (np.maximum(lu, start) - start) / np.maximum(span, 1e-9), 0.0)
        m["useful_life_ratio"] = float(r[ok].mean())
        tail = np.where(lu >= 0, death - np.maximum(lu, start), span)
        m["idle_tail_s"] = float(tail[ok].mean())
    else:
        m["useful_life_ratio"], m["idle_tail_s"] = 0.0, 0.0
    m["attempts_per_agent"] = float(log.a_attempts.mean()) if nA else 0.0
    ag = log.age_stats
    att, up = np.array(ag["attempts"]), np.array(ag["up"])
    m["up_rate_by_age"] = (up / np.maximum(att, 1)).round(5).tolist()
    m["att_by_age"] = att.tolist()
    young = up[:2].sum() / max(att[:2].sum(), 1)
    old = up[4:].sum() / max(att[4:].sum(), 1)
    m["up_rate_young"], m["up_rate_old"] = float(young), float(old)
    m["up_rate_age_ratio"] = float(old / young) if young > 0 and att[4:].sum() >= 50 else float("nan")

    b = log.bin_stats
    batt = np.array(b["attempts"])
    live = np.array(b["live_x_att"]) / np.maximum(batt, 1)
    succ = np.array(b["commits"]) / np.maximum(batt, 1)
    upa = np.array(b["up"]) / np.maximum(batt, 1)
    absa = np.array(b["abs_dsal"]) / np.maximum(batt, 1)
    pop = np.flatnonzero(batt >= 200)
    m["bin_live"] = live.round(2).tolist()
    m["bin_success"] = succ.round(4).tolist()
    m["bin_up_per_att"] = upa.round(4).tolist()
    m["bin_abs_per_att"] = absa.round(4).tolist()
    m["bin_att"] = batt.tolist()
    if len(pop):
        f, l = pop[0], pop[-1]
        m["success_first"], m["success_last"] = float(succ[f]), float(succ[l])
        m["up_per_att_first"], m["up_per_att_last"] = float(upa[f]), float(upa[l])
        m["abs_per_att_first"], m["abs_per_att_last"] = float(absa[f]), float(absa[l])
    else:
        for k in ("success", "up_per_att", "abs_per_att"):
            m[f"{k}_first"] = m[f"{k}_last"] = 0.0

    P = log.snap_payoff.astype(float)
    fp = log.final_payoff.astype(float)
    m["leader_share_final"] = float(fp.max() / fp.sum()) if fp.sum() > 0 else 1.0 / G
    tt = log.snap_time.astype(float)
    for q in (25, 50):
        if len(P) >= 4:
            k = int(np.searchsorted(tt, q / 100 * T))
            k = min(max(k, 0), len(P) - 1)
            row = P[k]
            m[f"hold_{q}"] = float(np.argmax(row) == np.argmax(fp)) if row.max() > 0 else float("nan")
            m[f"tau_{q}"] = _tau(row, fp) if row.max() > 0 else float("nan")
        else:
            m[f"hold_{q}"] = m[f"tau_{q}"] = float("nan")

    m["energy_gini_final"] = gini(np.maximum(log.final_energy.astype(float), 0))
    m["income_total"] = float(log.income.sum())
    m["income_gini"] = gini(log.income) if log.income.sum() > 0 else 0.0
    spent = float(log.spent.sum())
    m["gas_total"] = float(log.gas_paid.sum())
    m["gas_share"] = float(log.gas_paid.sum() / spent) if spent > 0 else 0.0
    m["refund_total"] = float(log.refunded.sum())
    m["cap_lost_total"] = float(log.cap_lost.sum())
    att_g = log.snap_attempts[-1] if len(log.snap_attempts) else np.zeros(G)
    m["activity_gini"] = gini(att_g)
    m["metabolic_skip_rate"] = log.counters["metabolic_skips"] / max(log.counters["attempts"] + log.counters["metabolic_skips"], 1)
    m["dup_rate"] = log.counters["duplicate"] / max(log.counters["attempts"], 1)
    m["none_rate"] = log.counters["none"] / max(log.counters["attempts"], 1)
    m["gods_econ"] = [{"attempts": float(att_g[i]), "income": float(log.income[i]), "gas": float(log.gas_paid[i]),
                       "live_end": float(log.snap_live[-1][i]) if len(log.snap_live) else 0.0,
                       "cap_lost": float(log.cap_lost[i])} for i in range(G)]
    return m
