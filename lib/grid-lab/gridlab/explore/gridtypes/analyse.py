"""Analysis of the GridType landscape and games: tables, simple models metric ~ size + symbols + colours,
held-out validation, GridType-specific failures.

    python3 -m gridlab.explore.gridtypes.analyse                     # writes .cache/explore/gridtypes/report.md
    python3 -m gridlab.explore.gridtypes.analyse --train-seed 1 --test-seed 9000000 --games 64 --test-games 32

Reads landscape.json (gridlab.explore.gridtypes.landscape) and the cached games
(gridlab.explore.gridtypes.games; missing games are run).
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict

import numpy as np

from ...experiments import common as C
from . import games as GM
from . import landscape as LS

SIZES, SYMS, COLS = (3, 4, 5, 6, 7), ("base10", "base12", "base16", "cards"), ("rgb", "rgby", "rainbow6")
REF = (5, "base10", "rgby")


# ------------------------------------------------------------------------------------------------
# models
# ------------------------------------------------------------------------------------------------
def design(rows: list[tuple[int, str, str]], size_numeric: bool = False) -> tuple[np.ndarray, list[str]]:
    names = ["(intercept)"]
    cols = [np.ones(len(rows))]
    if size_numeric:
        names.append("size (per +1)")
        cols.append(np.array([n - 5 for n, _, _ in rows], float))
    else:
        for n in SIZES:
            if n != REF[0]:
                names.append(f"size {n}")
                cols.append(np.array([float(r[0] == n) for r in rows]))
    for s in SYMS:
        if s != REF[1]:
            names.append(s)
            cols.append(np.array([float(r[1] == s) for r in rows]))
    for c in COLS:
        if c != REF[2]:
            names.append(c)
            cols.append(np.array([float(r[2] == c) for r in rows]))
    return np.stack(cols, 1), names


def ols(X: np.ndarray, y: np.ndarray) -> dict:
    """OLS with HC1 robust standard errors."""
    n, p = X.shape
    XtX_inv = np.linalg.pinv(X.T @ X)
    b = XtX_inv @ X.T @ y
    e = y - X @ b
    meat = (X * e[:, None] ** 2).T @ X
    V = XtX_inv @ meat @ XtX_inv * n / max(n - p, 1)
    r2 = 1 - (e ** 2).sum() / max(((y - y.mean()) ** 2).sum(), 1e-12)
    return {"b": b, "se": np.sqrt(np.clip(np.diag(V), 0, None)), "r2": float(r2), "n": n}


def fit(rows, y, size_numeric=False) -> dict:
    X, names = design(rows, size_numeric)
    out = ols(X, np.asarray(y, float))
    out["names"] = names
    return out


def predict(model: dict, rows, size_numeric=False) -> np.ndarray:
    X, _ = design(rows, size_numeric)
    return X @ model["b"]


def fmt_model(m: dict, digits: str = ".3g") -> str:
    parts = []
    for nm, b, se in zip(m["names"], m["b"], m["se"]):
        star = "*" if abs(b) > 1.96 * se and nm != "(intercept)" else ""
        parts.append(f"{nm} {b:+{digits}}±{1.96 * se:{digits}}{star}")
    return "; ".join(parts) + f"  (R² {m['r2']:.2f}, n {m['n']})"


def key3(gtype_str: str) -> tuple[int, str, str]:
    s = gtype_str.replace("Grid(", "").replace(")", "")
    n, sy, co = s.split(",")
    return int(n), sy, co


# ------------------------------------------------------------------------------------------------
# landscape (policy-free)
# ------------------------------------------------------------------------------------------------
LAND_KEYS = ["n_families", "n_mutators", "ceil_med", "ceil_p10", "ceil_p90", "ceil_cv", "share_ceil_lt16",
             "share_ceil_lt24", "flip_vis_med", "flip_any_med", "flip_abs_med", "spawn_pos_med", "levels_med",
             "cost_paint_cell", "cost_paint_grid", "fill_over_cell", "cost_write_grid", "lib_cost_med",
             "lib_affordable_100", "prior_bits"]


def land_rows(db: dict) -> dict:
    out = {}
    for k, rec in db.items():
        fd = rec.get("families_detail")
        if not fd:
            continue
        ce = np.array([v["ceil"] for v in fd.values()])
        r = {"n_families": rec["n_families"], "n_mutators": rec["n_mutators"],
             "ceil_med": float(np.median(ce)), "ceil_p10": float(np.quantile(ce, .1)),
             "ceil_p90": float(np.quantile(ce, .9)), "ceil_cv": float(ce.std() / ce.mean()),
             "share_ceil_lt16": float((ce < 16).mean()), "share_ceil_lt24": float((ce < 24).mean()),
             "flip_vis_med": float(np.median([v["flip_vis"] for v in fd.values()])),
             "flip_any_med": float(np.median([v["flip_any"] for v in fd.values()])),
             "flip_abs_med": float(np.median([v["flip_abs"] for v in fd.values()])),
             "spawn_pos_med": float(np.median([v["spawn_pos"] for v in fd.values()])),
             "levels_med": float(np.median([v["levels"] for v in fd.values()])),
             "cost_paint_cell": rec["cost_paint_cell"], "cost_paint_grid": rec["cost_paint_grid"],
             "fill_over_cell": rec["fill_over_cell"], "cost_write_grid": rec["cost_write_grid"],
             "lib_cost_med": rec.get("lib_cost_q", {}).get("0.5", float("nan")),
             "lib_affordable_100": rec.get("lib_affordable_100", float("nan")), "prior_bits": rec["prior_bits"]}
        out[k] = r
    return out


def marginal_table(rows: dict, keys) -> str:
    """Marginal means of each metric by size, symbol set and colour set (exact main effects on the full
    5x4x3 factorial)."""
    hdr = ["metric"] + [f"N={n}" for n in SIZES] + list(SYMS) + list(COLS) + ["additive R²"]
    tab = []
    trip = {k: key3(k) for k in rows}
    for m in keys:
        line = [m]
        for i, levels in ((0, SIZES), (1, SYMS), (2, COLS)):
            for lv in levels:
                v = [rows[k][m] for k in rows if trip[k][i] == lv]
                line.append(f"{np.mean(v):.3g}" if v else "")
        ks = list(rows)
        if len(ks) > 8:
            mod = fit([trip[k] for k in ks], [rows[k][m] for k in ks])
            line.append(f"{mod['r2']:.2f}")
        else:
            line.append("")
        tab.append(line)
    return C.md_table(hdr, tab)


def family_ceiling_matrix(db: dict, fams=None) -> dict:
    """family -> {gtype: ceiling}."""
    out = defaultdict(dict)
    for k, rec in db.items():
        for f, v in (rec.get("families_detail") or {}).items():
            out[f][k] = v["ceil"]
    return out


# ------------------------------------------------------------------------------------------------
# games
# ------------------------------------------------------------------------------------------------
GAME_KEYS = ["dynamism2", "dynamism", "sig_tension_rate", "snap_tension", "durable_lead_changes_per_obj_100s",
             "spirals_per_100_commits", "climbs_held_accel_per_100s", "climbs_per_100s", "crossings_per_pair_100s",
             "rise_fall_share", "obj_hot_share", "snap_autocorr", "stagnation_frac", "late_activity", "churn",
             "steal_rate", "mutator_entropy_norm", "hits_per_obj_s", "agents", "commits", "energy_unspent_share",
             "payoff_gini", "top_object_share",
             "cells_mean", "cells_frac", "small_share", "move_rate", "vis_rate", "flicker_rate", "legible_rate",
             "legible_share", "bits_per_cell", "vis_per_obj_min", "vis_per_obj_min_own", "big_legible_share"]


def stagnated(r: dict) -> float:
    """1 if the world went quiet before the last 20% of the game."""
    return float(r["stagnation_frac"] < 0.8)


def per_game_extra(r: dict) -> None:
    r["stagnated"] = stagnated(r)
    gods = r["gods"]
    ce = np.array([g["ceil"] for g in gods])
    z = np.array([(r["n_gods"] - g["rank"]) / (r["n_gods"] - 1) for g in gods])
    r["ceil_spread"] = float(ce.max() - ce.min())
    r["ceil_rank_corr"] = float(np.corrcoef(ce, z)[0, 1]) if ce.std() > 1e-9 and z.std() > 1e-9 else 0.0
    r["dead_god_share"] = float(np.mean([g["gain_own"] < 1.0 for g in gods]))
    r["max_s_peak_mean"] = float(np.mean(r["max_s_peak"]))


def type_table(results: list[dict], keys) -> str:
    by = defaultdict(list)
    for r in results:
        by[r["gtype"]].append(r)
    types = sorted(by, key=key3)
    hdr = ["GridType", "n"] + keys
    tab = []
    for t in types:
        rs = by[t]
        line = [t.replace("Grid", ""), len(rs)]
        for k in keys:
            v = [x[k] for x in rs if k in x]
            p, lo, hi = C.boot_ci(v, B=300)
            line.append(f"{p:.3g}±{(hi - lo) / 2:.2g}")
        tab.append(line)
    return C.md_table(hdr, tab)


def model_table(results: list[dict], keys, test: list[dict] | None = None) -> str:
    rows = [key3(r["gtype"]) for r in results]
    out = []
    hdr = ["metric", "R² (games)", "R² type means", "held-out r (type means)"] + \
          [f"size {n}" for n in SIZES if n != 5] + [s for s in SYMS if s != "base10"] + [c for c in COLS if c != "rgby"]
    tab = []
    for k in keys:
        y = np.array([r[k] for r in results], float)
        m = fit(rows, y)
        # R² of the additive model on per-type means
        tm = defaultdict(list)
        for rr, v in zip(rows, y):
            tm[rr].append(v)
        ks = list(tm)
        means = np.array([np.mean(tm[q]) for q in ks])
        pm = predict(m, ks)
        r2m = 1 - ((means - pm) ** 2).sum() / max(((means - means.mean()) ** 2).sum(), 1e-12)
        hr = ""
        if test:
            tt = defaultdict(list)
            for r in test:
                tt[key3(r["gtype"])].append(r[k])
            qs = [q for q in tt if q in tm]
            if len(qs) >= 4:
                a = np.array([np.mean(tt[q]) for q in qs])
                b = predict(m, qs)
                hr = f"{np.corrcoef(a, b)[0, 1]:.2f}" if a.std() > 1e-12 else ""
        cells = []
        for nm, b, se in zip(m["names"][1:], m["b"][1:], m["se"][1:]):
            star = "*" if abs(b) > 1.96 * se else ""
            cells.append(f"{b:+.3g}{star}")
        tab.append([k, f"{m['r2']:.2f}", f"{r2m:.2f}", hr] + cells)
    out.append(C.md_table(hdr, tab))
    out.append("\nCoefficients are differences from Grid(5,base10,rgby) (intercept omitted); * = 95% CI "
               "(HC1 robust SE) excludes 0. 'held-out r' = correlation of the training model's predicted type "
               "means with the held-out seeds' type means.")
    return "\n".join(out)


def mutator_by_type(results: list[dict]) -> dict:
    """gtype -> {mutator: share of commit occurrences}, plus the summon share."""
    out = {}
    by = defaultdict(list)
    for r in results:
        by[r["gtype"]].append(r)
    for t, rs in by.items():
        c = Counter()
        up = Counter()
        for r in rs:
            for f, dct in r["mut_family"].items():
                for mid, v in dct.items():
                    c[mid] += v[0]
                    up[mid] += v[1]
        tot = sum(c.values())
        out[t] = {m: (c[m] / max(tot, 1), up[m] / max(c[m], 1)) for m in c}
    return out


def family_by_type(results: list[dict]) -> dict:
    """gtype -> family -> list of (z, gain_own, ceil, final_mean_s, policy)."""
    out = defaultdict(lambda: defaultdict(list))
    for r in results:
        G = r["n_gods"]
        for g in r["gods"]:
            out[r["gtype"]][g["family"]].append(((G - g["rank"]) / (G - 1), g["gain_own"], g["ceil"],
                                                g["final_mean_s"], g["policy"]))
    return out


def fairness_by_group(results: list[dict], group) -> str:
    groups = defaultdict(list)
    for r in results:
        groups[group(r)].append(r)
    tab = []
    for gname in sorted(groups, key=str):
        rs = groups[gname]
        rows = C.god_rows(rs)
        ff = C.family_fairness(rows, B=60, min_n=10)
        cr = [r["ceil_rank_corr"] for r in rs]
        p, lo, hi = C.boot_ci(cr, B=300)
        tab.append([gname, len(rs), ff["n_families"], f"{ff['z_sd']:.3f}", f"{ff['z_sd_excess']:.3f}",
                    f"{ff['share_unfair']:.2f}", f"{p:+.3f} [{lo:+.3f}, {hi:+.3f}]"])
    return C.md_table(["group", "games", "families n≥10", "SD adj z", "excess SD", "share CI∌0.5",
                       "corr(ceiling, rank score) within game"], tab)


def main(argv=None):
    ap = argparse.ArgumentParser(prog="gridlab.explore.gridtypes.analyse")
    ap.add_argument("--types", default=";".join(GM.SAMPLE))
    ap.add_argument("--games", type=int, default=64)
    ap.add_argument("--test-games", type=int, default=32)
    ap.add_argument("--train-seed", type=int, default=1)
    ap.add_argument("--test-seed", type=int, default=9000000)
    ap.add_argument("--mix", default="mixed")
    ap.add_argument("--processes", type=int, default=4)
    ap.add_argument("--out", default=str(GM.OUT / "report.md"))
    a = ap.parse_args(argv)
    parts = []
    db = LS.load()
    lr = land_rows(db)
    if lr:
        parts += [f"# GridType landscape ({len(lr)} GridTypes calibrated)", "",
                  "## Policy-free marginal means by parameter", marginal_table(lr, LAND_KEYS), ""]
        tab = [[k, *(f"{lr[k][m]:.3g}" for m in LAND_KEYS)] for k in sorted(lr, key=key3)]
        parts += ["## Per GridType (policy-free)", C.md_table(["GridType"] + LAND_KEYS, tab), ""]
    types = a.types.split(";")
    train = GM.run(types, a.games, a.train_seed, a.mix, a.processes)
    test = GM.run(types, a.test_games, a.test_seed, a.mix, a.processes) if a.test_games else []
    for r in train + test:
        per_game_extra(r)
    keys = GAME_KEYS + ["stagnated", "ceil_spread", "ceil_rank_corr", "dead_god_share", "max_s_peak_mean"]
    parts += [f"# Games: {len(train)} training (seed {a.train_seed}), {len(test)} held out (seed {a.test_seed}), "
              f"mix {a.mix}", "", "## Per GridType (training; mean ± 95% CI half-width)",
              type_table(train, keys), "", "## Models metric ~ size + symbols + colours (training games)",
              model_table(train, keys, test), ""]
    parts += ["## Fairness by size", fairness_by_group(train + test, lambda r: key3(r["gtype"])[0]), "",
              "## Fairness by symbol set", fairness_by_group(train + test, lambda r: key3(r["gtype"])[1]), "",
              "## Fairness by colour set", fairness_by_group(train + test, lambda r: key3(r["gtype"])[2]), ""]
    mb = mutator_by_type(train + test)
    allm = sorted({m for d in mb.values() for m in d})
    tab = []
    for t in sorted(mb, key=key3):
        tab.append([t.replace("Grid", "")] + [f"{100 * mb[t][m][0]:.1f}" if m in mb[t] else "–" for m in allm])
    parts += ["## Mutator share of commits (%) by GridType", C.md_table(["GridType"] + allm, tab), ""]
    with open(a.out, "w") as fh:
        fh.write("\n".join(parts))
    print("\n".join(parts))
    print(f"\nwritten {a.out}")


if __name__ == "__main__":
    main()
