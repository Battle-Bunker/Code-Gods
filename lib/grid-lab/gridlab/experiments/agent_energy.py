"""Per-agent energy economy vs the all-at-summon economy and the owner-pays time split (docs/agent-energy.md).

    python3 -m gridlab.experiments.agent_energy                    # the full study (main sweep + spam test)
    python3 -m gridlab.experiments.agent_energy --games 20 --settings summon,energy_I1_B2_A1

Every setting runs on the same paired specs: 4 gods, one each of random / greedy_private / saver /
greedy_omniscient in a seed-dependent order (spam test: `spammer` replaces `random`), on the same
seeds and GridTypes. Games are cached per (setting, spec, code) under .cache/experiments/energy/.
All settings start from the harness BASE (the engine defaults at the real engine's 100 Hz).
"""
from __future__ import annotations

import argparse
import json
import math
import multiprocessing as mp
import os
import time
from collections import defaultdict

import numpy as np

from .common import (BASE, CACHE, GameSpec, add_dyn2, apply_knobs, boot_ci, config_for, ext_metrics, family_fairness,
                     game_key, god_rows, md_table, policy_table, prepare, setting, tables_for, _jsonable, parse_type)
from ..sim import draws_for, run_game

TYPES = ["5,base10,rgby", "6,cards,rainbow6", "4,base12,rgb"]
MIX = ("random", "greedy_private", "saver", "greedy_omniscient")
SPAM_MIX = ("spammer", "greedy_private", "saver", "greedy_omniscient")
EV = 1   # bump to invalidate this script's extra fields


def energy_setting(income: float, battery: float = 2.0, alpha: float = 1.0, **extra) -> dict:
    cfg = {"economy": "agent_energy", "agent_income": income, "agent_battery": battery, "agent_income_alpha": alpha}
    cfg.update(extra)
    return setting(config=cfg)


def _name(i, b, a):
    f = lambda x: f"{x:g}".replace(".", "p")
    return f"energy_I{f(i)}_B{f(b)}_A{f(a)}"


SETTINGS: dict = {"summon": BASE, "owner_pays": setting(config={"economy": "owner_pays"})}
for _i in (0.25, 1.0, 2.0, 4.0, 16.0):
    SETTINGS[_name(_i, 2, 1)] = energy_setting(_i)
for _b in (1.0, 8.0):
    SETTINGS[_name(1, _b, 1)] = energy_setting(1.0, _b)
for _i in (1.0, 4.0):
    SETTINGS[_name(_i, 2, 0.5)] = energy_setting(_i, 2.0, 0.5)
SETTINGS["energy_I1_B2_A1_start1"] = energy_setting(1.0, agent_start="one")
SETTINGS["energy_I1_B2_A1_naive"] = energy_setting(1.0, policy_kwargs={"energy_aware": False})
MAIN = list(SETTINGS)
FOCUS = ("energy_I1_B2_A1", "energy_I1_B2_A0p5")   # settings whose family moves vs summon are listed
SPAM = ["summon", "owner_pays", "energy_I1_B2_A1", "energy_I2_B2_A1", "energy_I4_B2_A1", "energy_I1_B2_A0p5", "energy_I4_B2_A0p5"]


def make_specs(types, n, seed0, mix=MIX) -> list[GameSpec]:
    out = []
    for t, gt in enumerate(types):
        for k in range(n):
            seed = seed0 + 100_000 * t + k
            r = np.random.default_rng([seed, 11])
            out.append(GameSpec(gt, seed, tuple(mix[i] for i in r.permutation(len(mix)))))
    return out


# ------------------------------------------------------------------------------------------------
# per-game energy statistics
# ------------------------------------------------------------------------------------------------
def energy_stats(log, progs) -> dict:
    from .. import energy
    gt = log.gtype
    G = log.n_gods
    A = len(log.a_owner)
    prof = [energy.profile(p, gt) for p in progs]
    sb = np.array([p.summon for p in prof]) if A else np.zeros(0)
    ex = np.array([p.expected for p in prof]) if A else np.zeros(0)
    owner = log.a_owner.astype(int)
    K = len(log.c_time)
    dpi = np.zeros(A)
    if K:
        co = owner[log.c_agent]
        b, a = log.c_before.astype(float), log.c_after.astype(float)
        ar = np.arange(K)
        pb = b[ar, co] * (b.sum(1) - b[ar, co])
        pa = a[ar, co] * (a.sum(1) - a[ar, co])
        np.add.at(dpi, log.c_agent, pa - pb)
    commits = np.bincount(log.c_agent, minlength=A) if K else np.zeros(A, int)
    out = {"ev": EV, "agents_per_god": np.bincount(owner, minlength=G).tolist(),
           "summon_bits": sb.round(2).tolist(), "exp_bits": ex.round(3).tolist(),
           "attempts_a": log.a_attempts.tolist(), "commits_a": commits.tolist(), "dpi_a": dpi.round(1).tolist(),
           "owner_a": owner.tolist(), "a_time": log.a_time.round(1).tolist(),
           "bij_a": [bool(p.bijective) for p in progs], "nsteps_a": [len(p.steps) for p in progs],
           "guard_a": [p.guard.kind is not None for p in progs]}
    ticks = max(1.0, log.duration * log.config["interaction_rate_hz"])
    out["idle_share"] = log.counters.get("idle_ticks", 0) / ticks
    out["energy_skip_share"] = log.counters.get("energy_skips", 0) / ticks
    out["attempt_share"] = log.counters["attempts"] / ticks
    if log.act_bits is not None and len(log.act_bits):
        ab = log.act_bits.astype(float)
        out["act_bits_pct"] = np.percentile(ab, [10, 25, 50, 75, 90]).round(3).tolist()
        out["act_bits_mean"] = float(ab.mean())
        out["act_bits_commit_mean"] = float(ab[log.act_commit].mean()) if log.act_commit.any() else 0.0
        out["charged_per_god"] = np.bincount(owner[log.act_agent], weights=ab, minlength=G).round(1).tolist()
    if log.a_income is not None:
        bal = log.a_start + log.a_income - log.a_charged - log.a_wasted - log.a_energy_end
        out["conservation_err"] = float(np.abs(bal).max()) if A else 0.0
        out["wasted_share"] = float(log.a_wasted.sum() / max(log.a_income.sum(), 1e-9))
        out["debt_share"] = float((log.a_energy_end < 0).mean()) if A else 0.0
    return out


_JOBS: list = []


def _worker(i):
    st, spec, key, path = _JOBS[i]
    cfg = config_for(st, spec)
    t0 = time.perf_counter()
    draws = draws_for(cfg)
    tables = tables_for(st, cfg, draws)
    box = {}
    log = run_game(cfg, tables=tables, hook=lambda w, ev: box.__setitem__("progs", list(w.agent_prog)) if ev == "end" else None)
    r = ext_metrics(log, tables)
    r.update(energy_stats(log, box["progs"]))
    r["wall_seconds"] = time.perf_counter() - t0
    r["seed"] = spec.seed
    r["spec_policies"] = list(spec.policies)
    tmp = path + f".tmp{os.getpid()}"
    with open(tmp, "w") as fh:
        json.dump(r, fh, default=_jsonable)
    os.replace(tmp, path)
    return i, r


def prepare_energy(st: dict, specs, processes: int) -> None:
    """Tables and program libraries (common.prepare) plus the library's act profiles."""
    from .. import energy
    from ..policy import program_library
    from ..sim import default_program_factory
    cfgs = [config_for(st, s) for s in specs]
    prepare(st, cfgs, processes, verbose=True)
    for gt in sorted({c.gtype for c in cfgs}, key=lambda g: g.key):
        progs, _ = program_library(gt, default_program_factory(), 4096)
        energy.library_profiles(gt, progs, processes=processes, tag="lib4096")


def run_batch(name: str, specs, processes: int = 4) -> list[dict]:
    global _JOBS
    st = SETTINGS[name]
    out, todo = [None] * len(specs), []
    for i, s in enumerate(specs):
        key = game_key({"energy_study": EV, **st}, s)
        path = CACHE / "energy" / key[:2] / f"{key}.json"
        if path.exists():
            try:
                out[i] = json.loads(path.read_text())
                continue
            except Exception:
                pass
        path.parent.mkdir(parents=True, exist_ok=True)
        todo.append((i, key, str(path)))
    if todo:
        apply_knobs(st.get("knobs", {}))
        try:
            prepare_energy(st, [specs[i] for i, _, _ in todo], processes)
            _JOBS = [(st, specs[i], k, p) for i, k, p in todo]
            t0 = time.perf_counter()
            with mp.get_context("fork").Pool(processes) as pool:
                for n, (j, r) in enumerate(pool.imap_unordered(_worker, range(len(todo)), chunksize=1), 1):
                    out[todo[j][0]] = r
                    if n % 50 == 0 or n == len(todo):
                        print(f"  [{name}] {n}/{len(todo)} games ({time.perf_counter() - t0:.0f}s)", flush=True)
            _JOBS = []
        finally:
            apply_knobs({})
    add_dyn2(out)
    return out


# ------------------------------------------------------------------------------------------------
# reports
# ------------------------------------------------------------------------------------------------
HEAD = ["dynamism", "dynamism2", "tension_rate", "spirals_per_100_commits", "lead_changes_per_100s",
        "stagnation_frac", "late_activity", "commit_rate"]


def ci(x) -> str:
    p, lo, hi = boot_ci(np.asarray(x, float), B=400)
    return f"{p:.3g} [{lo:.3g}, {hi:.3g}]"


def paired(base: list[dict], other: list[dict], k: str) -> str:
    d = np.array([o[k] - b[k] for b, o in zip(base, other)], float)
    return f"{d.mean():+.3g} ± {1.96 * d.std(ddof=1) / math.sqrt(len(d)):.2g}"


def policy_wins(rs: list[dict]) -> dict:
    """Win share per policy (ties split), each game has one god per policy."""
    w = defaultdict(float)
    for r in rs:
        best = min(g["rank"] for g in r["gods"])
        top = [g for g in r["gods"] if g["rank"] == best]
        for g in top:
            w[g["policy"]] += 1.0 / len(top)
    return {k: v / len(rs) for k, v in w.items()}


def agent_rows(rs: list[dict]) -> dict:
    """Pooled per-agent arrays (with the game's duration and the owner's rank)."""
    cols = defaultdict(list)
    for r in rs:
        ranks = [g["rank"] for g in r["gods"]]
        pols = [g["policy"] for g in r["gods"]]
        for j in range(len(r["owner_a"])):
            o = r["owner_a"][j]
            life = max(r["duration"] - max(r["a_time"][j], 0.0), 1.0)
            cols["sb"].append(r["summon_bits"][j]); cols["ex"].append(r["exp_bits"][j])
            cols["att"].append(r["attempts_a"][j]); cols["com"].append(r["commits_a"][j])
            cols["dpi"].append(r["dpi_a"][j]); cols["life"].append(life); cols["rank"].append(ranks[o])
            cols["policy"].append(pols[o]); cols["bij"].append(r["bij_a"][j]); cols["guard"].append(r["guard_a"][j])
    return {k: np.array(v) for k, v in cols.items()}


def report(results: dict[str, list[dict]], spam: dict[str, list[dict]] | None, n_games: int) -> str:
    out = []
    base = results.get("summon")
    names = list(results)
    out.append(f"### Headline metrics (mean [95% bootstrap CI]; {n_games} games per GridType × {len(TYPES)} GridTypes)\n")
    rows = []
    for n in names:
        rs = results[n]
        rows.append([n] + [ci([r[k] for r in rs]) for k in HEAD[:5]])
    out.append(md_table(["setting"] + HEAD[:5], rows))
    rows = []
    for n in names:
        rs = results[n]
        wr = ""
        if base:
            lr = np.log(np.maximum([r["welfare"] for r in rs], 1) / np.maximum([b["welfare"] for b in base], 1))
            wr = f"{math.exp(lr.mean()):.2f}"
        rows.append([n] + [ci([r[k] for r in rs]) for k in HEAD[5:]] +
                    [ci([r["final_salience_mean"] for r in rs]), wr,
                     f"{np.mean([r['idle_share'] for r in rs]):.2f}", f"{np.mean([r['attempt_share'] for r in rs]):.2f}"])
    out.append("\n" + md_table(["setting"] + HEAD[5:] + ["final salience (bits)", "welfare ratio vs summon (geo-mean)",
                                                       "idle tick share", "attempt share"], rows))
    if base:
        rows = [[n] + [paired(base, results[n], k) for k in ("dynamism", "dynamism2", "tension_rate",
                                                           "spirals_per_100_commits", "lead_changes_per_100s",
                                                           "late_activity")] for n in names if n != "summon"]
        out.append("\n**Paired difference vs summon** (mean ± 95% CI over games)\n")
        out.append(md_table(["setting", "Δ dynamism", "Δ dynamism2", "Δ tension", "Δ spirals/100", "Δ lead ch./100s",
                             "Δ late activity"], rows))
    # policies
    rows = []
    for n in names:
        rs = results[n]
        w = policy_wins(rs)
        pt = policy_table(god_rows(rs))
        rows.append([n] + [f"{w.get(p, 0):.2f} (z {pt[p]['z']:.2f})" for p in MIX])
    out.append("\n### Policy balance: win share (mean z), fair = 0.25 (z 0.5)\n")
    out.append(md_table(["setting"] + list(MIX), rows))
    # fairness
    rows = []
    for n in names:
        ff = family_fairness(god_rows(results[n]), B=60, min_n=10)
        rows.append([n, f"{ff['z_sd']:.3f}", f"{ff['z_sd_excess']:.3f}", f"{ff['share_unfair']:.2f}", ff["n_families"]])
    out.append("\n### Per-family fairness (policy-adjusted z; excess SD over sampling noise)\n")
    out.append(md_table(["setting", "family z SD", "excess SD", "share of families with CI excluding 0.5", "families"], rows))
    rows = []
    for n in names:
        per = []
        for t in TYPES:
            rs = [r for r in results[n] if r["gtype"] == parse_type(t).key]
            per.append(f"{policy_wins(rs).get('saver', 0):.2f}" if rs else "–")
        rows.append([n] + per)
    out.append("\n**Saver win share per GridType**\n")
    out.append(md_table(["setting"] + TYPES, rows))
    if base:
        fb = family_fairness(god_rows(base), B=20, min_n=10)["families"]
        for n in names:
            if n not in FOCUS:
                continue
            fn = family_fairness(god_rows(results[n]), B=20, min_n=10)["families"]
            common = [f for f in fb if f in fn and fb[f]["n"] >= 10 and fn[f]["n"] >= 10]
            mv = sorted(common, key=lambda f: fn[f]["adj_z"] - fb[f]["adj_z"])
            pick = mv[:5] + mv[-5:]
            out.append(f"\n**Largest family moves, summon → {n}** (policy-adjusted z; n god-slots)\n")
            out.append(md_table(["family", "summon z", f"{n} z", "Δ", "n"],
                                [[f, f"{fb[f]['adj_z']:.2f}", f"{fn[f]['adj_z']:.2f}",
                                  f"{fn[f]['adj_z'] - fb[f]['adj_z']:+.2f}", fn[f]["n"]] for f in pick]))
    # agents
    rows = []
    for n in names:
        rs = results[n]
        ag = agent_rows(rs)
        per_god = defaultdict(list)
        for r in rs:
            for g, k in zip(r["gods"], r["agents_per_god"]):
                per_god[g["policy"]].append(k)
        rate = ag["att"] / ag["life"]
        ab = [r["act_bits_pct"][2] for r in rs if "act_bits_pct" in r]
        rows.append([n] + [f"{np.mean(per_god[p]):.1f}" for p in MIX] +
                    [f"{np.median(ag['sb']):.1f}", f"{np.median(ag['ex']):.2f}", f"{np.mean(ag['ex']):.1f}",
                     f"{np.median(ag['att']):.0f}", f"{np.median(rate):.2f}",
                     f"{np.median(ab):.2f}" if ab else "–", f"{ag['bij'].mean():.2f}", f"{ag['guard'].mean():.2f}"])
    out.append("\n### Agents: count per god by policy; description and per-act bits; acts\n")
    out.append(md_table(["setting"] + [f"agents {p}" for p in MIX] +
                        ["median summon bits", "median E[act bits]", "mean E[act bits]", "median acts/agent",
                         "median acts/s", "median charged bits/act", "bijective share", "guarded share"], rows))
    # who wins: simple and efficient?
    rows = []
    for n in names:
        ag = agent_rows(results[n])
        if not len(ag["sb"]):
            continue
        val = ag["dpi"] / ag["life"]
        qs = np.quantile(ag["sb"], [1 / 3, 2 / 3])
        qe = np.quantile(ag["ex"], [1 / 3, 2 / 3])
        cell = []
        for lo_s, hi_s in ((-1, qs[0]), (qs[1], 1e9)):
            for lo_e, hi_e in ((-1, qe[0]), (qe[1], 1e9)):
                m = (ag["sb"] > lo_s) & (ag["sb"] <= hi_s) & (ag["ex"] > lo_e) & (ag["ex"] <= hi_e)
                cell.append(f"{val[m].mean():.1f} (n {m.sum()})" if m.any() else "–")
        rho_s = _spearman(ag["sb"], val)
        rho_e = _spearman(ag["ex"], val)
        rows.append([n] + cell + [f"{rho_s:+.2f}", f"{rho_e:+.2f}"])
    out.append("\n### Do simple, information-efficient agents win? Realised own Δpayoff per second of life, by "
               "summon-bits tercile × E[act bits] tercile; Spearman ρ with each\n")
    out.append(md_table(["setting", "cheap desc + cheap acts", "cheap desc + dear acts", "dear desc + cheap acts",
                         "dear desc + dear acts", "ρ(summon bits, value)", "ρ(E[act bits], value)"], rows))
    rows = []
    for n in names:
        g = god_level(results[n])
        rows.append([n] + [f"{g[k][0]:+.2f} ± {g[k][1]:.2f}" for k in ("sb", "ex", "k", "acts")] +
                    [f"{g['coef'][j]:+.3f}" for j in range(3)])
    out.append("\n### Same question at the god level: within-game Spearman ρ between a god's payoff and its agents' "
               "mean summon bits, mean E[act bits], agent count and total acts (mean ± 95% CI over games); and the "
               "policy-adjusted regression of z on the standardised god means (summon bits, E[act bits], agents)\n")
    out.append(md_table(["setting", "ρ(payoff, summon bits)", "ρ(payoff, E[act bits])", "ρ(payoff, agents)",
                         "ρ(payoff, acts)", "β summon bits", "β E[act bits]", "β agents"], rows))
    if spam:
        rows = []
        for n, rs in spam.items():
            w = policy_wins(rs)
            sp_agents, sp_acts, tot_acts = [], [], []
            for r in rs:
                k = [g["policy"] for g in r["gods"]].index("spammer")
                sp_agents.append(r["agents_per_god"][k])
                o = np.array(r["owner_a"])
                att = np.array(r["attempts_a"])
                sp_acts.append(att[o == k].sum() / max(att.sum(), 1))
            rows.append([n, f"{w.get('spammer', 0):.2f}"] + [f"{w.get(p, 0):.2f}" for p in SPAM_MIX[1:]] +
                        [f"{np.mean(sp_agents):.0f}", f"{np.mean(sp_acts):.2f}", ci([r["dynamism2"] for r in rs]),
                         ci([r["welfare"] for r in rs])])
        out.append("\n### Anti-spam: one `spammer` (cheapest of 12 random programs every decision) vs 3 value policies\n")
        out.append(md_table(["setting", "spammer wins"] + [f"{p} wins" for p in SPAM_MIX[1:]] +
                            ["spammer agents", "spammer share of acts", "dynamism2", "welfare"], rows))
    return "\n".join(out)


def god_level(rs: list[dict]) -> dict:
    """Per game: Spearman ρ across its gods between payoff and (mean summon bits, mean E[act bits], agent
    count, total acts); plus a pooled OLS of z on standardised god means with policy dummies."""
    acc = defaultdict(list)
    X, y, P = [], [], []
    for r in rs:
        o = np.array(r["owner_a"], int)
        sb, ex, att = np.array(r["summon_bits"]), np.array(r["exp_bits"]), np.array(r["attempts_a"])
        G = len(r["gods"])
        pay = np.array([g["payoff"] for g in r["gods"]], float)
        feats = {"sb": [], "ex": [], "k": [], "acts": []}
        for i in range(G):
            m = o == i
            feats["sb"].append(sb[m].mean() if m.any() else np.nan)
            feats["ex"].append(ex[m].mean() if m.any() else np.nan)
            feats["k"].append(float(m.sum()))
            feats["acts"].append(float(att[m].sum()))
        for k, v in feats.items():
            v = np.array(v, float)
            ok = ~np.isnan(v)
            if ok.sum() >= 3 and np.ptp(v[ok]) > 0 and np.ptp(pay[ok]) > 0:
                acc[k].append(_spearman(v[ok], pay[ok]))
        for i, g in enumerate(r["gods"]):
            if not np.isnan(feats["sb"][i]):
                X.append([feats["sb"][i], feats["ex"][i], feats["k"][i]])
                y.append((G - g["rank"]) / (G - 1))
                P.append(g["policy"])
    out = {k: (float(np.mean(v)), 1.96 * float(np.std(v, ddof=1)) / math.sqrt(len(v))) if len(v) > 1 else (0.0, 0.0)
           for k, v in ((k, acc[k]) for k in ("sb", "ex", "k", "acts"))}
    X = np.array(X, float)
    if len(X) > 10:
        Z = (X - X.mean(0)) / np.maximum(X.std(0), 1e-9)
        pols = sorted(set(P))
        D = np.array([[p == q for q in pols] for p in P], float)
        beta = np.linalg.lstsq(np.hstack([Z, D]), np.array(y), rcond=None)[0]
        out["coef"] = beta[:3].tolist()
    else:
        out["coef"] = [0.0, 0.0, 0.0]
    return out


def _spearman(x, y) -> float:
    if len(x) < 3:
        return 0.0
    rx, ry = np.argsort(np.argsort(x)), np.argsort(np.argsort(y))
    return float(np.corrcoef(rx, ry)[0, 1])


def main(argv=None):
    ap = argparse.ArgumentParser(prog="gridlab.experiments.agent_energy", description=__doc__.split("\n")[0])
    ap.add_argument("--types", default=";".join(TYPES))
    ap.add_argument("--games", type=int, default=60, help="games per GridType")
    ap.add_argument("--spam-games", type=int, default=40)
    ap.add_argument("--seed", type=int, default=700_000)
    ap.add_argument("--settings", default=",".join(MAIN))
    ap.add_argument("--spam", default=",".join(SPAM))
    ap.add_argument("--processes", type=int, default=4)
    ap.add_argument("--out", default="")
    a = ap.parse_args(argv)
    types = a.types.split(";")
    specs = make_specs(types, a.games, a.seed)
    res = {n: run_batch(n, specs, a.processes) for n in a.settings.split(",") if n}
    spam = None
    if a.spam and a.spam_games:
        sspecs = make_specs(types, a.spam_games, a.seed + 50_000, SPAM_MIX)
        spam = {n: run_batch(n, sspecs, a.processes) for n in a.spam.split(",")}
    txt = report(res, spam, a.games)
    print(txt)
    if a.out:
        with open(a.out, "w") as fh:
            fh.write(txt)


if __name__ == "__main__":
    main()
