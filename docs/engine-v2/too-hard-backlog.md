# Too-hard backlog (spec §7.5)

Rules that are not dealt: too coarse, unreachable, or with fewer than 6 rungs converged to the error target (coordinator's call (g); a rule that misses only its rarest rungs is dealt with its ladder capped instead). `pnpm --filter @workspace/v2-valuation calibrate -- --write` regenerates the rows of the rules it calibrates; `recap` regenerates the whole file from the committed artefacts.

| Family | Params | Tie-breaker | Variant | Status | Why |
|---|---|---|---|---|---|
| crossing-check | `{"k":1,"q":2}` | size | line-q | unconverged | ladder truncated at rung 37: no state found at rung 38 (y(k) to x(q) exactly; |x(q)| at least 8) within 40000 climbing proposals; not within 2% after 17828384 steps (budget 32000000) |
| crossing-check | `{"k":1,"q":2}` | whole | line-q | unconverged | not within 2% after 18880608 steps (budget 32000000) |
| exact-change | `{"ways":6}` | big-piles | line-q | unconverged | not within 2% after 26811005 steps (budget 32000000) |
| prime-gradient | `{}` | cPrime | line-q | unconverged | not within 2% after 18880608 steps (budget 32000000) |
| prime-landing | `{}` | big-prime | line-q | unconverged | not within 2% after 18423200 steps (budget 32000000) |
| prime-staircase | `{}` | first-prime | line-q | unconverged | ladder truncated at rung 23: no state found at rung 24 (a run of primes at least 6) within 40000 climbing proposals; not within 2% after 21058464 steps (budget 32000000) |
| prime-staircase | `{}` | last-prime | line-q | unconverged | ladder truncated at rung 23: no state found at rung 24 (a run of primes at least 6) within 40000 climbing proposals; not within 2% after 21058464 steps (budget 32000000) |
| prime-staircase | `{}` | near-miss | line-q | unconverged | ladder truncated at rung 23: no state found at rung 24 (a run of primes at least 6) within 40000 climbing proposals; not within 2% after 21058464 steps (budget 32000000); rung 19: chain not equilibrated (rate into rung 20 moved 40.0 points between the halves of its samples, 4.1 standard errors) |
| pythagorean-area | `{"A":6}` | prime-height | line-q | unconverged | not within 2% after 17508384 steps (budget 32000000); rung 18: chain not equilibrated (rate into rung 19 moved -4.2 points between the halves of its samples, -5.4 standard errors) |
| pythagorean-area | `{"A":6}` | slanted-square | line-q | unconverged | not within 2% after 18423200 steps (budget 32000000) |
| pythagorean-area | `{"A":6}` | whole-legs | line-q | unconverged | not within 2% after 17508384 steps (budget 32000000); rung 22: splitting estimate 9.019 against 8.428 |
| ruler | `{}` | far | line-q | unconverged | not within 2% after 20710240 steps (budget 32000000) |
| ruler | `{}` | prime-gradient | line-q | unconverged | ladder truncated at rung 40: no state found at rung 41 (distance² to a square exactly; m to a prime within 1/4) within 40000 climbing proposals; not within 2% after 19200608 steps (budget 32000000) |
| ruler | `{}` | square-area | line-q | unconverged | ladder truncated at rung 42: no state found at rung 43 (distance² to a square exactly; the area to a square exactly) within 40000 climbing proposals; not within 2% after 20115424 steps (budget 32000000) |
| square-area | `{}` | lpf | line-q | unconverged | not within 2% after 22085069 steps (budget 32000000); rung 42: splitting estimate 15.122 against 17.352; rung 45: splitting estimate 21.024 against 27.719; rung 46: splitting estimate 23.100 against 30.186; rung 47: splitting estimate 24.584 against 31.690 |
| square-area | `{}` | omega | line-q | unconverged | not within 2% after 20260724 steps (budget 32000000) |
| square-area | `{}` | spf | line-q | unconverged | not within 2% after 22084832 steps (budget 32000000) |
| treasure | `{"T":37,"k":2}` | prime-gradient | line-q | unconverged | not within 2% after 19795424 steps (budget 32000000) |
| treasure | `{"T":37,"k":2}` | prime-terms | line-q | unconverged | ladder truncated at rung 42: no state found at rung 43 (y(k) to T exactly; different primes at least 7) within 40000 climbing proposals; not within 2% after 20115424 steps (budget 32000000); rung 2: splitting estimate 4.008 against 4.202; rung 4: splitting estimate 4.034 against 4.234 |
| triangle-area | `{"A":4}` | even | line-q | unconverged | ladder truncated at rung 37: no state found at rung 38 (the area exactly; the legs to each other within 1/4) within 40000 climbing proposals; not within 2% after 17828384 steps (budget 32000000) |
| triangle-area | `{"A":4}` | legs | line-q | unconverged | not within 2% after 18880608 steps (budget 32000000) |
| pythagorean-area | `{"A":6}` | slanted-square | line-z | unconverged | ladder truncated at rung 38: no state found at rung 39 (the area to A exactly; side² to a square exactly) within 40000 climbing proposals; not within 2% after 18274433 steps (budget 32000000) |
| pythagorean-area | `{"A":6}` | whole-legs | line-z | unconverged | not within 2% after 17497025 steps (budget 32000000); rung 19: chain not equilibrated (rate into rung 20 moved 5.6 points between the halves of its samples, 4.5 standard errors) |
| same-on-both-rulers | `{"T":6}` | whole-values | line-z | too-coarse | not within 2% after 20241473 steps (budget 32000000); layer 1 (whole-values) takes 2 distinct values, fewer than 6: too coarse to extend the ladder |
| square-area | `{}` | lpf | line-z | unconverged | not within 2% after 22071105 steps (budget 32000000) |
| triangle-area | `{"A":4}` | even | line-z | unconverged | ladder truncated at rung 33: no state found at rung 34 (the area exactly; the legs to each other within 1) within 40000 climbing proposals; not within 2% after 29635265 steps (budget 32000000); rung 25: splitting estimate 6.522 against 6.258; rung 27: splitting estimate 7.228 against 6.893 |
| whole-intercept | `{}` | omega | line-z | too-coarse | not within 2% after 30174081 steps (budget 32000000); layer 0 (frac) takes 1 distinct values, fewer than 6: too coarse to extend the ladder |
| whole-intercept | `{}` | spf | line-z | too-coarse | not within 2% after 18411841 steps (budget 32000000); layer 0 (frac) takes 1 distinct values, fewer than 6: too coarse to extend the ladder |
