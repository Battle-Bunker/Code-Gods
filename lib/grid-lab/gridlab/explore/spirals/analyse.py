"""Summaries for the spirals study: headline tables with bootstrap CIs, paired variant contrasts,
family-pair spiral and theft rates, mutator spiral lift, and fairness."""
from __future__ import annotations

import math
from collections import Counter, defaultdict

import numpy as np

KEYS = ["ep_spirals_per_100s", "ep_spirals_accel_per_100s", "ep_spirals_held_per_100s", "ep_spiral_excess",
        "ep_spiral_gain_mean", "ep_spiral_contributors_mean", "ep_spiral_beneficiaries_mean", "ep_spiral_retention_mean",
        "ep_spiral_contested", "fb_autocorr", "fb_up_after_up", "fb_drift_16", "fb_drift_32", "fb_rate_ratio",
        "tn_event_rate", "tn_theft_rate", "tn_recovered", "tn_counter", "tn_reversal_rate",
        "final_salience_mean", "final_salience_max", "welfare_per_obj", "payoff_gini", "lead_changes_per_100s",
        "commits", "agents", "tend_reject_share", "dynamism"]


def derive(r: dict) -> dict:
    """Derived keys (computed on load so cached results need no rerun)."""
    a, b = r.get("fb_rate_16"), r.get("fb_rate_0")
    vals = [r.get(f"fb_rate_{k}") for k in ("16", "32", "64")]
    hi = [x for x in vals if x is not None and not (isinstance(x, float) and math.isnan(x))]
    lo = [r.get(f"fb_rate_{k}") for k in ("0", "4")]
    lo = [x for x in lo if x is not None and not (isinstance(x, float) and math.isnan(x))]
    r["fb_rate_ratio"] = (np.mean(hi) / np.mean(lo)) if hi and lo and np.mean(lo) > 0 else float("nan")
    r["welfare_per_obj"] = r["welfare"] / max(r.get("final_objects", 1), 1)
    c = r.get("counters", {})
    att = c.get("attempts", 0)
    r["tend_reject_share"] = c.get("tend_reject", 0) / att if att else 0.0
    return r


def boot(x, B=1000, seed=0):
    x = np.asarray([v for v in x if v is not None and not (isinstance(v, float) and math.isnan(v))], float)
    if x.size == 0:
        return float("nan"), float("nan"), float("nan")
    r = np.random.default_rng(seed)
    bs = x[r.integers(0, len(x), (B, len(x)))].mean(1)
    return float(x.mean()), float(np.quantile(bs, 0.025)), float(np.quantile(bs, 0.975))


def fmt(p, lo, hi):
    if math.isnan(p):
        return "–"
    h = (hi - lo) / 2
    d = 2 if abs(p) < 10 else 1 if abs(p) < 100 else 0
    return f"{p:.{d}f} ± {h:.{d}f}"


def md(header, rows):
    out = ["| " + " | ".join(header) + " |", "|" + "---|" * len(header)]
    out += ["| " + " | ".join(str(c) for c in row) + " |" for row in rows]
    return "\n".join(out)


def headline(batches: dict, keys=KEYS) -> str:
    """batches: {variant name: [results]} -> markdown table, mean ± 95% CI half-width."""
    names = list(batches)
    for rs in batches.values():
        for r in rs:
            derive(r)
    rows = []
    for k in keys:
        rows.append([k] + [fmt(*boot([r.get(k) for r in batches[n]])) for n in names])
    return md(["metric"] + [f"{n} (n={len(batches[n])})" for n in names], rows)


def paired(base: list, other: list, keys=KEYS, B=2000, seed=0) -> str:
    """Paired (same spec) mean difference other - base with a bootstrap CI over games."""
    bk = {r["key_spec"] if "key_spec" in r else (r["gtype"], r["seed"]): r for r in base}
    rows = []
    pairs = [(bk.get((r["gtype"], r["seed"])), r) for r in other]
    pairs = [(a, b) for a, b in pairs if a is not None]
    for r in [x for p in pairs for x in p]:
        derive(r)
    rng = np.random.default_rng(seed)
    for k in keys:
        d = np.array([b.get(k, np.nan) - a.get(k, np.nan) for a, b in pairs], float)
        d = d[~np.isnan(d)]
        if not d.size:
            continue
        bs = d[rng.integers(0, len(d), (B, len(d)))].mean(1)
        lo, hi = np.quantile(bs, [0.025, 0.975])
        base_mean = np.nanmean([a.get(k, np.nan) for a, _ in pairs])
        star = "**" if (lo > 0 or hi < 0) else ""
        rows.append([k, f"{base_mean:.3g}", f"{star}{d.mean():+.3g}{star}", f"[{lo:+.3g}, {hi:+.3g}]"])
    return md(["metric", "base mean", "Δ (paired)", "95% CI"], rows)


def by_type(rs: list, key: str) -> dict:
    out = defaultdict(list)
    for r in rs:
        out[r["gtype"]].append(r.get(key))
    return {t: boot(v) for t, v in sorted(out.items())}


def pair_table(rs: list, what: str = "pair_spirals", min_n: int = 4) -> list:
    """Per unordered family pair: games co-dealt, mean count per 100 s (spirals both benefit from / thefts)."""
    acc = defaultdict(list)
    for r in rs:
        T = max(r["duration"], 1e-9)
        for a, b, c in r[what]:
            acc[tuple(sorted((a, b)))].append(100.0 * c / T)
    out = [(k, len(v), float(np.mean(v))) for k, v in acc.items() if len(v) >= min_n]
    return sorted(out, key=lambda x: -x[2])


def family_spiral(rs: list) -> dict:
    """Per family: mean spirals it benefits from per 100 s, and that it contributes to, per god slot."""
    b, c, n = defaultdict(float), defaultdict(float), Counter()
    for r in rs:
        T = max(r["duration"], 1e-9)
        for i, g in enumerate(r["gods"]):
            f = g["family"]
            n[f] += 1
            b[f] += 100.0 * r["god_spiral_benefit"][i] / T
            c[f] += 100.0 * r["god_spiral_contrib"][i] / T
    return {f: (n[f], b[f] / n[f], c[f] / n[f]) for f in n}


def mutator_lift(rs: list) -> list:
    """Per mutator: share of up-steps inside spirals / share of all commits (> 1 = spiral driver)."""
    sp, al = Counter(), Counter()
    for r in rs:
        sp.update(r["mut_spiral"])
        al.update(r["mut_all"])
    ts, ta = sum(sp.values()), sum(al.values())
    out = [(m, al[m] / ta, (sp[m] / ts) / (al[m] / ta) if al[m] and ts else 0.0) for m in al]
    return sorted(out, key=lambda x: -x[2])


def fairness(rs: list) -> dict:
    """Family z = (G - rank)/(G - 1) means and their spread; policy z means."""
    fz, pz = defaultdict(list), defaultdict(list)
    for r in rs:
        G = r["n_gods"]
        for g in r["gods"]:
            z = (G - g["rank"]) / (G - 1)
            fz[g["family"]].append(z)
            pz[g["policy"]].append(z)
    fam = {f: (len(v), float(np.mean(v))) for f, v in fz.items()}
    big = [m for n, m in fam.values() if n >= 6]
    return {"family": fam, "policy": {p: (len(v), float(np.mean(v))) for p, v in pz.items()},
            "family_z_sd": float(np.std(big)) if big else float("nan"), "n_big": len(big)}
