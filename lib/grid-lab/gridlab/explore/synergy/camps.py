"""Reading the synergy atlas: family-level matrices, camps, and the catalog's hand-made matrix.

    python3 -m gridlab.explore.synergy.camps --type 5,base10,rgby          # report (markdown) to stdout
    python3 -m gridlab.explore.synergy.camps --type 5,base10,rgby --json   # also save the family matrix

Family-level entry W_b[f, g] = mean PMI over the draw pairs (draw of f, draw of g) at depth b
("both gods at b bits"). Censored climbs (the joint climb stalled: the intersection is empty or
deeper than the kernel can reach) are imputed as min(bound, -b): at least one goal's worth of conflict.
`excl[f, g]` is the share of draw pairs that were censored ("exclusive").

Camps: the families are clustered on the depth-averaged matrix W̄ = mean_b W_b (over the depths both
families reach), with average-linkage agglomeration on the distance 1 - corr(row profiles of W̄):
two families land in one camp when they have the same allies and the same rivals. The leading
eigenvectors of W̄ give the dominant axes of alignment, compared with the hand-made labels
(Family.camp, layers).
"""
from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Sequence

import numpy as np

from .atlas import load_atlas, pmi_matrix, parse_type, CACHE

REPO = Path(__file__).resolve().parents[5]
CATALOG = REPO / "docs" / "research" / "grid" / "catalog.md"
CAT_IDS = {"S1": "seed1_line_painter", "S2": "seed2_patchwork", "S3": "seed3_green_ones", "SP": "stripe_painter",
           "CK": "castle_keeper", "CQ": "conqueror", "BB": "border_baron", "CH": "chessmaster", "RR": "rainbow_road",
           "MM": "mirrormancer", "OS": "othello_sandwich", "SS": "straight_shooter", "NB": "number_bonds",
           "PP": "parity_painter"}


def layer_class(layers: Sequence[str]) -> str:
    """'C' colour only, 'S' symbol only, 'CS' both (position ignored)."""
    c, s = "colour" in layers, "symbol" in layers
    return "CS" if c and s else ("C" if c else ("S" if s else "-"))


def family_matrices(state: dict) -> dict:
    """Family-level matrices from a draw-level atlas. Returns a dict with
    fams, camp, layer, W (F, F, A) mean PMI, sd (spread over draw pairs), n, excl, pos (share > 0),
    vals[(f, g, k)] -> list of draw-pair values."""
    P, E, Cn = pmi_matrix(state)
    depths = state["depths"]
    fam = state["families"]
    fams = sorted(set(fam), key=fam.index)
    fi = {f: k for k, f in enumerate(fams)}
    F, A = len(fams), len(depths)
    vals = defaultdict(list)
    cens = defaultdict(list)
    D = len(fam)
    for i in range(D):
        for j in range(D):
            if i == j:
                continue
            for k in range(A):
                v = P[i, j, k]
                if np.isnan(v):
                    continue
                if fam[i] == fam[j] and i > j:
                    continue
                c = bool(Cn[i, j, k])
                vals[(fi[fam[i]], fi[fam[j]], k)].append(min(v, -depths[k]) if c else v)
                cens[(fi[fam[i]], fi[fam[j]], k)].append(c)
    W = np.full((F, F, A), np.nan)
    sd = np.full((F, F, A), np.nan)
    n = np.zeros((F, F, A), int)
    excl = np.full((F, F, A), np.nan)
    pos = np.full((F, F, A), np.nan)
    for (a, b, k), v in vals.items():
        v = np.asarray(v)
        W[a, b, k] = v.mean()
        sd[a, b, k] = v.std() if len(v) > 1 else np.nan
        n[a, b, k] = len(v)
        excl[a, b, k] = float(np.mean(cens[(a, b, k)]))
        pos[a, b, k] = float((v > 0).mean())
    camp = {f: c for f, c in zip(fam, state["camps"])}
    lay = {f: layer_class(l) for f, l in zip(fam, state["layers"])}
    ceil = defaultdict(list)
    for f, c in zip(fam, state["ceiling"]):
        ceil[f].append(c)
    return {"fams": fams, "camp": [camp[f] for f in fams], "layer": [lay[f] for f in fams], "W": W, "sd": sd,
            "n": n, "excl": excl, "pos": pos, "vals": vals, "depths": depths,
            "ceiling": [float(np.mean(ceil[f])) for f in fams]}


def mean_over_depths(W: np.ndarray) -> np.ndarray:
    with np.errstate(invalid="ignore"):
        return np.nanmean(W, axis=2) if W.ndim == 3 else W


# ------------------------------------------------------------------------------------------------
# clustering (numpy only)
# ------------------------------------------------------------------------------------------------
def profile_distance(M: np.ndarray) -> np.ndarray:
    """1 - Pearson correlation of rows, ignoring the pair's own two entries and NaNs."""
    F = len(M)
    out = np.zeros((F, F))
    for a in range(F):
        for b in range(a + 1, F):
            m = np.ones(F, bool)
            m[[a, b]] = False
            x, y = M[a, m], M[b, m]
            ok = ~np.isnan(x) & ~np.isnan(y)
            if ok.sum() < 5 or x[ok].std() < 1e-9 or y[ok].std() < 1e-9:
                d = 1.0
            else:
                d = 1.0 - float(np.corrcoef(x[ok], y[ok])[0, 1])
            out[a, b] = out[b, a] = d
    return out


def average_linkage(Dm: np.ndarray, k: int) -> np.ndarray:
    """Agglomerative clustering with average linkage down to k clusters. Returns labels 0..k-1 by size."""
    F = len(Dm)
    clusters = [[i] for i in range(F)]
    while len(clusters) > k:
        best, bi, bj = np.inf, -1, -1
        for i in range(len(clusters)):
            for j in range(i + 1, len(clusters)):
                d = Dm[np.ix_(clusters[i], clusters[j])].mean()
                if d < best:
                    best, bi, bj = d, i, j
        clusters[bi] = clusters[bi] + clusters[bj]
        del clusters[bj]
    clusters.sort(key=len, reverse=True)
    lab = np.zeros(F, int)
    for c, mem in enumerate(clusters):
        lab[mem] = c
    return lab


def eig_axes(M: np.ndarray, n: int = 3) -> tuple[np.ndarray, np.ndarray]:
    X = np.nan_to_num(M.copy())
    np.fill_diagonal(X, 0.0)
    w, V = np.linalg.eigh((X + X.T) / 2)
    order = np.argsort(-np.abs(w))[:n]
    return w[order], V[:, order]


# ------------------------------------------------------------------------------------------------
# hand-made matrix (catalog §3)
# ------------------------------------------------------------------------------------------------
def catalog_matrix(path: Path = CATALOG) -> dict[tuple[str, str], str]:
    """{(family id a, family id b): 'A'|'C'|'M'|'0'} from the catalog's §3 table (marks * ! dropped).
    Includes the diagonal (same family, different draw)."""
    text = path.read_text()
    sec = text[text.index("## 3. Consolidated interaction matrix"):]
    sec = sec[:sec.index("**Disagreements")]
    rows = [l for l in sec.splitlines() if l.startswith("| **")]
    header = [l for l in sec.splitlines() if l.startswith("| |")][0]
    cols = [c.strip() for c in header.strip("|").split("|")][1:]
    out = {}
    for l in rows:
        cells = [c.strip() for c in l.strip().strip("|").split("|")]
        mt = re.match(r"\*\*(\w+)\*\*", cells[0])
        if not mt or mt.group(1) not in CAT_IDS:
            continue
        rk = mt.group(1)
        for ck, v in zip(cols, cells[1:]):
            v = v.replace("*", "").replace("!", "").strip()
            if v:
                a, b = CAT_IDS[rk], CAT_IDS[ck]
                out[(a, b)] = out[(b, a)] = v
    return out


def classify(vals_by_depth: list[list[float]], thr: float = 1.0) -> tuple[str, list[str]]:
    """Atlas class of a family pair from its draw-pair values at each depth.
    Per depth: 'A' if mean >= thr and >= 75% of draw pairs > 0; 'C' if mean <= -thr and >= 75% < 0;
    '0' if every draw pair is within ±2 bits and |mean| < thr; else 'M' (the draw decides).
    Overall: the common class when all reached depths agree, 'M' when they disagree (and 'flip'
    is reported when both 'A' and 'C' occur at different depths)."""
    per = []
    for v in vals_by_depth:
        if not v:
            per.append("")
            continue
        v = np.asarray(v)
        m = v.mean()
        if m >= thr and (v > 0).mean() >= 0.75:
            per.append("A")
        elif m <= -thr and (v < 0).mean() >= 0.75:
            per.append("C")
        elif abs(m) < thr and np.all(np.abs(v) <= 2.0):
            per.append("0")
        else:
            per.append("M")
    got = [p for p in per if p]
    if not got:
        return "", per
    if len(set(got)) == 1:
        return got[0], per
    if "A" in got and "C" in got:
        return "flip", per
    return "M", per


def compare_catalog(fm: dict, cat: dict, thr: float = 1.0) -> list[dict]:
    fi = {f: k for k, f in enumerate(fm["fams"])}
    out = []
    seen = set()
    for (a, b), v in sorted(cat.items()):
        if (b, a) in seen or a not in fi or b not in fi:
            continue
        seen.add((a, b))
        ia, ib = fi[a], fi[b]
        vb = [fm["vals"].get((ia, ib, k), []) or fm["vals"].get((ib, ia, k), []) for k in range(len(fm["depths"]))]
        cls, per = classify(vb, thr)
        means = [float(np.mean(x)) if x else float("nan") for x in vb]
        out.append({"a": a, "b": b, "catalog": v, "atlas": cls, "per_depth": per, "means": means,
                    "n": [len(x) for x in vb],
                    "agree": (cls == v) or (v == "M" and cls in ("M", "flip"))})
    return out


# ------------------------------------------------------------------------------------------------
# report
# ------------------------------------------------------------------------------------------------
def _f(x, fmt="+.1f"):
    return "–" if x is None or (isinstance(x, float) and np.isnan(x)) else format(x, fmt)


def block_means(fm: dict, key: str, k: int | None = None) -> dict:
    """Mean PMI between label groups (e.g. camp × camp), pooled over family pairs (i<j), at depth k or
    averaged over depths."""
    labels = fm[key]
    M = fm["W"][:, :, k] if k is not None else mean_over_depths(fm["W"])
    acc = defaultdict(list)
    F = len(labels)
    for a in range(F):
        for b in range(a + 1, F):
            if np.isnan(M[a, b]):
                continue
            acc[tuple(sorted((labels[a], labels[b])))].append(M[a, b])
    return {g: (float(np.mean(v)), float(np.std(v) / np.sqrt(len(v))), len(v)) for g, v in sorted(acc.items())}


def report(gtype_s: str, tag: str = "main", k_clusters: int = 6) -> tuple[str, dict]:
    gt = parse_type(gtype_s)
    st = load_atlas(gt, tag)
    fm = family_matrices(st)
    fams, depths = fm["fams"], fm["depths"]
    F = len(fams)
    L = [f"## Atlas {gt.key} ({len(st['families'])} draws of {F} families, {len(st['joint'])} joint climbs)", ""]
    W = fm["W"]
    iu = np.triu_indices(F, 1)
    L.append("| depth | pairs | mean PMI | sd | share > +1 | share < −1 | share exclusive | |PMI| > 4 |")
    L.append("|---|---|---|---|---|---|---|---|")
    for k, b in enumerate(depths):
        x = W[:, :, k][iu]
        e = fm["excl"][:, :, k][iu]
        ok = ~np.isnan(x)
        L.append(f"| {b:g} | {ok.sum()} | {np.mean(x[ok]):+.2f} | {np.std(x[ok]):.2f} | {np.mean(x[ok] > 1):.2f} | "
                 f"{np.mean(x[ok] < -1):.2f} | {np.nanmean(e[ok]):.2f} | {np.mean(np.abs(x[ok]) > 4):.2f} |")
    L.append("")
    # camp and layer blocks
    for key in ("camp", "layer"):
        L.append(f"Mean family-pair PMI by hand-made **{key}** (± s.e. over pairs; n pairs):")
        L.append("")
        L.append("| groups | " + " | ".join(f"b={b:g}" for b in depths) + " |")
        L.append("|---|" + "---|" * len(depths))
        bm = [block_means(fm, key, k) for k in range(len(depths))]
        for g in bm[0]:
            L.append(f"| {g[0]} × {g[1]} | " + " | ".join(
                f"{bm[k][g][0]:+.2f} ± {bm[k][g][1]:.2f} ({bm[k][g][2]})" if g in bm[k] else "–"
                for k in range(len(depths))) + " |")
        L.append("")
    # depth flips
    flips = []
    for a, b in zip(*iu):
        v = W[a, b]
        if np.isnan(v[0]) or np.isnan(v[-1]):
            continue
        if (v[0] >= 1.5 and v[-1] <= -1.5) or (v[0] <= -1.5 and v[-1] >= 1.5):
            flips.append((fams[a], fams[b], v))
    both = int(np.sum(~np.isnan(W[:, :, 0][iu]) & ~np.isnan(W[:, :, -1][iu])))
    L.append(f"Pairs whose alignment flips sign between {depths[0]:g} and {depths[-1]:g} bits (|PMI| ≥ 1.5 at both): "
             f"{len(flips)} of {both}.")
    flips.sort(key=lambda t: -abs(t[2][-1] - t[2][0]))
    for a, b, v in flips[:12]:
        L.append(f"- {a} × {b}: " + " → ".join(_f(x) for x in v))
    L.append("")
    # clusters
    Mbar = mean_over_depths(W)
    Dm = profile_distance(Mbar)
    lab = average_linkage(Dm, k_clusters)
    L.append(f"### Camps (average linkage on profile distance, k = {k_clusters})")
    L.append("")
    L.append("| camp | size | members | hand camps (c/a/n) | layers (C/S/CS) | mean PMI inside | mean PMI to others |")
    L.append("|---|---|---|---|---|---|---|")
    for c in range(k_clusters):
        mem = np.flatnonzero(lab == c)
        oth = np.flatnonzero(lab != c)
        inside = Mbar[np.ix_(mem, mem)][np.triu_indices(len(mem), 1)] if len(mem) > 1 else np.array([np.nan])
        cross = Mbar[np.ix_(mem, oth)].ravel()
        hc = [fm["camp"][i] for i in mem]
        hl = [fm["layer"][i] for i in mem]
        L.append(f"| {c} | {len(mem)} | {', '.join(fams[i] for i in mem)} | "
                 f"{hc.count('clumper')}/{hc.count('alternator')}/{hc.count('neutral')} | "
                 f"{hl.count('C')}/{hl.count('S')}/{hl.count('CS')} | {np.nanmean(inside):+.2f} | {np.nanmean(cross):+.2f} |")
    L.append("")
    # eigen axes
    w, V = eig_axes(Mbar, 3)
    campv = np.array([{"clumper": 1.0, "alternator": -1.0}.get(c, 0.0) for c in fm["camp"]])
    lay_c = np.array([1.0 if l == "C" else (-1.0 if l == "S" else 0.0) for l in fm["layer"]])
    L.append("Leading eigen-axes of the depth-averaged family matrix (|λ| order). r = correlation of the "
             "eigenvector with the hand camp (clumper +1 / alternator −1 / neutral 0) and with the layer "
             "(colour-only +1 / symbol-only −1 / both 0):")
    L.append("")
    for q in range(len(w)):
        v = V[:, q]
        r1 = float(np.corrcoef(v, campv)[0, 1])
        r2 = float(np.corrcoef(v, lay_c)[0, 1])
        top = [fams[i] for i in np.argsort(-v)[:6]]
        bot = [fams[i] for i in np.argsort(v)[:6]]
        L.append(f"- λ = {w[q]:+.1f}: r(camp) = {r1:+.2f}, r(layer) = {r2:+.2f}; + end: {', '.join(top)}; "
                 f"− end: {', '.join(bot)}")
    L.append("")
    # per-family summary
    L.append("### Per family (depth-averaged): mean PMI, #allies (PMI ≥ +2), #rivals (PMI ≤ −2), hand camp")
    L.append("")
    L.append("| family | hand camp | layer | ceiling bits | mean | allies | rivals | top ally | top rival | atlas camp |")
    L.append("|---|---|---|---|---|---|---|---|---|---|")
    for a in np.argsort([np.nanmean(Mbar[i]) for i in range(F)])[::-1]:
        row = Mbar[a].copy()
        row[a] = np.nan
        al, rv = int(np.nansum(row >= 2)), int(np.nansum(row <= -2))
        ta = fams[int(np.nanargmax(row))] if np.any(~np.isnan(row)) else "–"
        tr = fams[int(np.nanargmin(row))] if np.any(~np.isnan(row)) else "–"
        L.append(f"| {fams[a]} | {fm['camp'][a]} | {fm['layer'][a]} | {fm['ceiling'][a]:.0f} | {np.nanmean(row):+.2f} | "
                 f"{al} | {rv} | {ta} ({_f(np.nanmax(row))}) | {tr} ({_f(np.nanmin(row))}) | {lab[a]} |")
    L.append("")
    data = {"fams": fams, "camp": fm["camp"], "layer": fm["layer"], "depths": depths, "ceiling": fm["ceiling"],
            "W": np.where(np.isnan(W), None, np.round(W, 3)).tolist(),
            "sd": np.where(np.isnan(fm["sd"]), None, np.round(fm["sd"], 3)).tolist(),
            "excl": np.where(np.isnan(fm["excl"]), None, np.round(fm["excl"], 3)).tolist(),
            "clusters": lab.tolist()}
    return "\n".join(L), data


def catalog_report(gtype_s: str, tag: str) -> str:
    gt = parse_type(gtype_s)
    st = load_atlas(gt, tag)
    fm = family_matrices(st)
    cmp = compare_catalog(fm, catalog_matrix())
    L = [f"### Catalog §3 matrix vs atlas ({gt.key}, tag {tag})", ""]
    agree = sum(r["agree"] for r in cmp)
    L.append(f"Agreement: {agree} of {len(cmp)} cells. Confusion (rows = catalog, cols = atlas):")
    L.append("")
    cl = ["A", "C", "0", "M", "flip", ""]
    L.append("| catalog \\ atlas | " + " | ".join(c or "n/a" for c in cl) + " |")
    L.append("|---|" + "---|" * len(cl))
    for v in ["A", "C", "0", "M"]:
        L.append(f"| {v} | " + " | ".join(str(sum(1 for r in cmp if r['catalog'] == v and r['atlas'] == c)) for c in cl) + " |")
    L.append("")
    L.append("Disagreements (PMI means at " + ", ".join(f"{b:g}" for b in fm["depths"]) + " bits; per-depth class; draw pairs):")
    L.append("")
    L.append("| pair | catalog | atlas | means | per depth | n |")
    L.append("|---|---|---|---|---|---|")
    for r in sorted(cmp, key=lambda r: (r["agree"], r["catalog"])):
        if r["agree"]:
            continue
        L.append(f"| {r['a']} × {r['b']} | {r['catalog']} | {r['atlas']} | " + " / ".join(_f(x) for x in r["means"]) +
                 f" | {'/'.join(p or '–' for p in r['per_depth'])} | {'/'.join(map(str, r['n']))} |")
    L.append("")
    return "\n".join(L)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--type", default="5,base10,rgby")
    ap.add_argument("--tag", default="main")
    ap.add_argument("--k", type=int, default=6)
    ap.add_argument("--catalog-tag", default="", help="atlas tag to compare with the catalog matrix (e.g. catalog)")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    txt, data = report(a.type, a.tag, a.k)
    print(txt)
    print(catalog_report(a.type, a.catalog_tag or a.tag))
    if a.json:
        gt = parse_type(a.type)
        p = CACHE / f"family_matrix_{gt.size}_{gt.symbols}_{gt.colours}_{a.tag}.json"
        with open(p, "w") as fh:
            json.dump(data, fh)
        print(f"saved {p}")


if __name__ == "__main__":
    main()
