"""python3 -m gridlab.explore.mutators.test_newmuts : contract checks for the candidate mutators."""
import numpy as np

from ...core import Grid, GridType, all_grid_types, spawn
from .newmuts import NEW_MUTATORS


def main():
    rng = np.random.default_rng(0)
    n = 0
    for gt in all_grid_types():
        for m in NEW_MUTATORS.values():
            if not m.available(gt):
                continue
            space = list(m.space(gt))
            for _ in range(30):
                p = space[int(rng.integers(len(space)))]
                g = spawn(gt, rng)
                y = m.apply(g, p, gt) or g
                z = m.apply(y, p, gt)
                assert z is None, (m.id, gt.key, p)                       # idempotent
                assert (m.apply(g, p, gt) or g) == y                      # deterministic
                assert y.sym.dtype == g.sym.dtype and y.col.dtype == g.col.dtype
                assert y.col.max() < gt.C and y.sym.max() < gt.S and y.sym.min() >= 0
                c = m.cost(p, gt)
                assert np.isfinite(c) and c > 0
                n += 1
    print(f"ok: {n} checks over {len(all_grid_types())} GridTypes")


if __name__ == "__main__":
    main()
