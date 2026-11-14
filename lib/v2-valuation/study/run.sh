#!/bin/bash
# The analytic calibration study (docs/engine-v2/analytic-calibration.md): exact sums, a simulation without
# gen.nudge and the dominant-state estimate for the four separable beginner pairings on line-z, then the comparison.
# About 10 minutes on four cores. Run from lib/v2-valuation.
set -e
mkdir -p study/results
for w in pg-prime pg-cprime pl-big pl-pg; do
  node --experimental-strip-types study/job-exact.ts $w study/results/res-exact-$w.json &
  node --experimental-strip-types study/job-sim.ts $w study/results/res-sim-$w.json &
  wait
done
for w in pg-prime pl-big; do node --experimental-strip-types study/job-dom.ts $w study/results/res-dom-$w.json; done
node study/compare.mjs study/results
