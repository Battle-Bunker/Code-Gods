"""Precompute survival tables for the probe's draws:  python3 -m gridlab.explore.mutators.prep 5,base10,rgby [k]"""
import sys
import time

from ... import calibrate as cal
from ...experiments.common import parse_type
from .states import draws_for_type

if __name__ == "__main__":
    for t in sys.argv[1].split(";"):
        gt = parse_type(t)
        k = int(sys.argv[2]) if len(sys.argv) > 2 else 3
        t0 = time.time()
        r = cal.precompute(draws_for_type(gt, k), gt, processes=4)
        print(gt.key, r["built"], "built", r["cached"], "cached", f"{time.time() - t0:.0f}s", flush=True)
