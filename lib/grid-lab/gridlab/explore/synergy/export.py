"""Export family synergy matrices for the production dealer (fair_aligned).

    python3 -m gridlab.explore.synergy.export --type 5,base10,rgby

Writes docs/explore/synergy_matrices/<instKey-slug>.<priorId>.json shaped as
SynergyMatrix {instKey, priorId, families[], w[][], meta}: w = depth-averaged (8/16/24 bits) family-level
PMI in bits, symmetric, zero diagonal; unmeasured pairs (a family that never reaches 8 bits, or binary
rules) = 0. The atlas depends only on the GridType and the prior, not on world or economy settings.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from .atlas import parse_type, load_atlas
from .dealers import FamilyMatrix

OUT = Path(__file__).resolve().parents[3] / "docs" / "explore" / "synergy_matrices"


def export(gtype_s: str, tag: str = "main", prior_id: str = "uniform") -> Path:
    gt = parse_type(gtype_s)
    fm = FamilyMatrix(gtype_s, tag)
    st = load_atlas(gt, tag)
    W = np.round(fm.W, 3)
    W = (W + W.T) / 2
    np.fill_diagonal(W, 0.0)
    measured = [bool(np.any(fm.W[k] != 0)) for k in range(len(fm.fams))]
    doc = {"instKey": gt.key, "priorId": prior_id, "families": fm.fams, "w": W.round(3).tolist(),
           "meta": {"units": "bits (pointwise mutual information of upper contour sets)",
                    "w": "mean over depths 8, 16, 24 bits (depths a pair cannot reach are skipped) of the "
                         "mean over param-draw pairs; exclusive pairs imputed as min(bound, -depth)",
                    "prior": prior_id + " (product-uniform spawn prior of the GridType)",
                    "world_settings": "none: the atlas is a property of the utility functions under the prior; "
                                      "it does not depend on spawn rate, object count, economy or policies",
                    "draws_per_family": st["n_draws"], "joint_climbs": len(st["joint"]),
                    "unmeasured_families": [f for f, m in zip(fm.fams, measured) if not m],
                    "source": "gridlab.explore.synergy (docs/explore/synergy.md), atlas tag " + tag}}
    OUT.mkdir(parents=True, exist_ok=True)
    p = OUT / f"Grid_{gt.size}_{gt.symbols}_{gt.colours}.{prior_id}.json"
    with open(p, "w") as fh:
        json.dump(doc, fh, indent=0)
    return p


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--type", default="5,base10,rgby")
    ap.add_argument("--tag", default="main")
    a = ap.parse_args()
    print(export(a.type, a.tag))
