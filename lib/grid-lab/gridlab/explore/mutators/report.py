"""Tables from a landscape run.

    python3 -m gridlab.explore.mutators.report --type 5,base10,rgby [--preset default] [--draws 3] [--full]

Yields are held-out mean Δ calibrated surprisal per bit of program cost (bits/bit), averaged over the
family's draws. 'route' = the best of single step, 2-step and 3-step programs found.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict

import numpy as np

from .landscape import load_or_run

CTXS = ("game", "fresh", "mid", "near", "rival", "foreign")


def md(headers, rows) -> str:
    out = ["| " + " | ".join(map(str, headers)) + " |", "|" + "---|" * len(headers)]
    out += ["| " + " | ".join(map(str, r)) + " |" for r in rows]
    return "\n".join(out)


def family_summary(L: dict) -> dict:
    """family -> aggregates over its draws."""
    by = defaultdict(list)
    for r in L["draws"]:
        by[r["family"]].append(r)
    ids = L["ids"]
    out = {}
    for f, rs in by.items():
        d = {"n": len(rs), "ceil": float(np.mean([r["ceil"] for r in rs]))}
        for c in CTXS:
            have = [r for r in rs if c in r["ctx"]]
            if not have:
                continue
            Y = np.array([[r["ctx"][c]["rows"][m]["y"] for m in ids] for r in have])     # draws x mutators
            D = np.array([[r["ctx"][c]["rows"][m]["d"] for m in ids] for r in have])
            d[c] = {"Y": Y.mean(0), "D": D.mean(0), "best": float(Y.max(1).mean()),
                    "tool": Counter(ids[int(np.argmax(y))] for y in Y).most_common(1)[0][0],
                    "s0": float(np.mean([r["ctx"][c]["s0_mean"] for r in have]))}
        if all("multi" in r for r in rs):
            two = np.array([max(0.0, r["multi"]["two"]["y"]) for r in rs])
            three = np.array([max(0.0, r["multi"]["three"]["y"]) for r in rs])
            one = d["game"]["Y"].max() if "game" in d else 0.0
            single = np.array([max(r["ctx"]["game"]["rows"][m]["y"] for m in ids) for r in rs])
            route = np.maximum.reduce([single, two, three])
            d["route"] = float(route.mean())
            d["route_k"] = Counter(int(np.argmax([a, b, c])) + 1 for a, b, c in zip(single, two, three)).most_common(1)[0][0]
            best_r = rs[int(np.argmax(route))]
            k = int(np.argmax([max(best_r["ctx"]["game"]["rows"][m]["y"] for m in ids),
                               best_r["multi"]["two"]["y"], best_r["multi"]["three"]["y"]]))
            d["route_desc"] = (None if k == 0 else best_r["multi"][["", "two", "three"][k]]["desc"])
            d["two"], d["three"], d["one"] = float(two.mean()), float(three.mean()), float(single.mean())
        # cheapest jackpot (>= tau * ceiling on half the held-out game states), single or multi
        for tau in (0.5, 0.75):
            prices = []
            for r in rs:
                c = [r["ctx"]["game"]["jack"].get(tau, {}).get("cost", np.inf)]
                if "multi" in r:
                    c.append(r["multi"]["jack"].get(tau, {}).get("cost", np.inf))
                prices.append(min(c))
            prices = np.array(prices)
            d[f"jack{tau}"] = float(np.median(prices))
            d[f"jack_rate{tau}"] = float(np.mean([tau * r["ceil"] / p if np.isfinite(p) else 0.0
                                                  for r, p in zip(rs, prices)]))
        out[f] = d
    return out


def mutator_summary(L: dict, F: dict, ctx: str = "game", near: float = 0.8) -> dict:
    ids = L["ids"]
    res = {}
    fams = [f for f in F if ctx in F[f]]
    best = {f: F[f][ctx]["Y"].max() for f in fams}
    for k, m in enumerate(ids):
        ys = np.array([F[f][ctx]["Y"][k] for f in fams])
        res[m] = {"best_for": sorted(f for f in fams if F[f][ctx]["tool"] == m),
                  "competitive": sorted(f for f in fams if best[f] > 0 and F[f][ctx]["Y"][k] >= near * best[f]),
                  "max": float(ys.max()), "median": float(np.median(ys)), "useful": int((ys > 0.02).sum())}
    return res


def breadth(L: dict, ctx: str = "game", frac: float = 0.5, top: int = 12) -> list:
    """Single parameter settings that serve many families at once: for each bank step, the number of
    families (draw-averaged) for which its held-out yield is >= frac x that family's best single-step
    yield (and > 0.05)."""
    cost = L["bank_cost"]
    by = defaultdict(list)
    for r in L["draws"]:
        by[r["family"]].append(np.asarray(r["ctx"][ctx]["dte_all"], float) / cost)
    cnt = np.zeros(len(cost))
    who = defaultdict(list)
    for f, ys in by.items():
        y = np.mean(ys, 0)
        b = y.max()
        ok = (y >= frac * b) & (y > 0.05)
        cnt += ok
        for j in np.flatnonzero(ok):
            who[j].append(f)
    order = np.argsort(-cnt)[:top]
    return [(L["ids"][L["bank_mids"][j]], L["bank_params"][j], float(cost[j]), int(cnt[j]), who[j]) for j in order]


def fairness_stats(F: dict, key: str = "route") -> dict:
    v = np.array([F[f][key] for f in F if key in F[f]])
    med = float(np.median(v))
    lv = np.log2(np.maximum(v, 1e-3))
    return {"median": med, "n": len(v), "p10": float(np.quantile(v, .1)), "p90": float(np.quantile(v, .9)),
            "sd_log2": float(lv.std()), "share_half_to_double": float(np.mean((v >= med / 2) & (v <= 2 * med))),
            "starved": sorted((round(F[f][key], 3), f) for f in F if key in F[f] and F[f][key] < med / 2),
            "advantaged": sorted(((round(F[f][key], 3), f) for f in F if key in F[f] and F[f][key] > 2 * med),
                                 reverse=True)}


def render(L: dict, full: bool = False) -> str:
    F = family_summary(L)
    ids = L["ids"]
    out = [f"## {L['gtype']}, preset {L['preset']} ({len(L['draws'])} draws, {len(F)} families)", ""]
    fs = fairness_stats(F)
    out.append(f"Route yield (best of 1-3 step programs, game context, held out): median {fs['median']:.3f} bits/bit, "
               f"p10 {fs['p10']:.3f}, p90 {fs['p90']:.3f}, SD of log2 {fs['sd_log2']:.2f}, share within ½-2× median "
               f"{fs['share_half_to_double']:.2f}")
    out.append(f"Starved (< ½ median): {', '.join(f'{f} {y}' for y, f in fs['starved'])}")
    out.append(f"Advantaged (> 2× median): {', '.join(f'{f} {y}' for y, f in fs['advantaged'])}")
    out.append("")
    rows = []
    for f in sorted(F, key=lambda f: -F[f].get("route", 0)):
        d = F[f]
        g = d["game"]
        rows.append([f, f"{d['ceil']:.0f}", f"{d.get('route', 0):.3f}", d.get("route_k", ""), f"{d.get('one', 0):.3f}",
                     g["tool"], f"{d.get('two', 0):.3f}", f"{d.get('three', 0):.3f}",
                     f"{d['near']['best']:.2f} {d['near']['tool']}" if "near" in d else "-",
                     f"{d['rival']['best']:.2f} {d['rival']['tool']}" if "rival" in d else "-",
                     f"{d['foreign']['best']:.2f} {d['foreign']['tool']}",
                     f"{d['jack0.75']:.0f}", f"{d['jack_rate0.75']:.2f}"])
    out.append(md(["family", "ceil", "route y", "k", "1-step y", "best tool", "2-step", "3-step", "near (completion)",
                   "rival (theft)", "foreign", "jackpot¾ cost", "¾ceil/cost"], rows))
    out.append("")
    for ctx in ("game", "near", "rival", "foreign"):
        ms = mutator_summary(L, F, ctx)
        rows = [[m, len(v["best_for"]), len(v["competitive"]), v["useful"], f"{v['max']:.2f}", f"{v['median']:.3f}",
                 ", ".join(v["best_for"][:6]) + (" …" if len(v["best_for"]) > 6 else "")] for m, v in ms.items()]
        out.append(f"### mutators, context {ctx}")
        out.append(md(["mutator", "#best tool", "#within 80% of best", "#yield>0.02", "max y", "median y", "best for"], rows))
        out.append("")
    out.append("### broadest single parameter settings (game context)")
    out.append(md(["mutator", "params", "cost", "#families ≥ ½ their best", "families"],
                  [[m, p, f"{c:.1f}", n, ", ".join(w[:8])] for m, p, c, n, w in breadth(L)]))
    if full:
        out.append("")
        out.append("### full matrix: game-context yield ×100 (draw mean)")
        out.append(md(["family"] + ids, [[f] + [f"{100 * y:.0f}" for y in F[f]["game"]["Y"]] for f in sorted(F)]))
    return "\n".join(out)


if __name__ == "__main__":
    from ...experiments.common import parse_type
    ap = argparse.ArgumentParser()
    ap.add_argument("--type", default="5,base10,rgby")
    ap.add_argument("--preset", default="default")
    ap.add_argument("--draws", type=int, default=3)
    ap.add_argument("--full", action="store_true")
    a = ap.parse_args()
    for t in a.type.split(";"):
        print(render(load_or_run(parse_type(t), a.preset, a.draws, allow_old=True), full=a.full))
