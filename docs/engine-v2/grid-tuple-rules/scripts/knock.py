import numpy as np
from rh2 import RH, calibrate, B
import gridlab, tally
f = RH(3, 6, "halves"); cal = calibrate(f)
def worst(movesfn, bitsfn, b):
    b0 = bitsfn(b); res = sorted(((bitsfn(nb) / b0, fee, n) for n, fee, nb in movesfn(b)), key=lambda x: (x[0], x[1]))
    # cheapest move that leaves <= 25% ; and best damage per ⚡
    cheap = min((r for r in res if r[0] <= 0.25), key=lambda r: r[1], default=None)
    single = [r[0] for r in res if r[2].startswith("add") and abs(int(r[2].split()[-1])) == 1]
    return b0, res[0], cheap, float(np.median(single)), min(single)
for s in ["5261256566961565", "2604071334543690"]:
    b = [int(c) for c in s]
    print("RoundHalves", s, worst(gridlab.moves, lambda x: B(f, cal, x)[0], b))
pr = tally.PrimeRow(0, 1)
for b in ([119,2,6,4, 3,2,1,3, 6,1,0,1, 3,2,2,0], [250,10,8,3, 9,0,1,0, 6,3,2,0, 2,0,0,0]):
    print("PrimeRows", tally.show(b), worst(lambda x: tally.moves(x, (1,-1,2,-2,5,-5)), lambda x: pr.bits(x)[0], b))
