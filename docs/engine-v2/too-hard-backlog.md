# Too-hard backlog (spec §7.5)

Rules that are not dealt: too coarse, unreachable, or with fewer than 6 rungs converged to the error target (coordinator's call (g); a rule that misses only its rarest rungs is dealt with its ladder capped instead). `pnpm --filter @workspace/v2-valuation calibrate -- --write` regenerates the rows of the rules it calibrates; `recap` regenerates the whole file from the committed artefacts.

| Family | Params | Tie-breaker | Variant | Status | Why |
|---|---|---|---|---|---|
| crossing-check | `{"k":1,"q":2}` | size | line-q | unconverged | ladder truncated at rung 37: no state found at rung 38 (y(k) to x(q) exactly; |x(q)| at least 8) within 40000 climbing proposals; not within 2% after 17853926 steps (budget 32000000) |
| crossing-check | `{"k":1,"q":2}` | whole | line-q | unconverged | not within 2% after 18880608 steps (budget 32000000) |
| exact-change | `{"ways":6}` | prime-coins | line-q | unconverged | not within 2% after 25891360 steps (budget 32000000) |
| m-meets-c | `{}` | meetPrime | line-q | unconverged | not within 2% after 18880608 steps (budget 32000000) |
| m-meets-c | `{}` | size | line-q | unconverged | not within 2% after 19338814 steps (budget 32000000) |
| prime-landing | `{}` | big-prime | line-q | unconverged | not within 2% after 18423200 steps (budget 32000000); rung 37: splitting estimate 16.431 against 22.783; rung 38: splitting estimate 18.771 against 32.261; rung 39: splitting estimate 20.224 against 35.418 |
| prime-landing | `{}` | prime-gradient | line-q | unconverged | not within 2% after 30185440 steps (budget 32000000) |
| prime-staircase | `{}` | first-prime | line-q | unconverged | ladder truncated at rung 23: no state found at rung 24 (a run of primes at least 6) within 40000 climbing proposals; not within 2% after 21058464 steps (budget 32000000); rung 5: chain not equilibrated (rate into rung 6 moved 15.0 points between the halves of its samples, 4.6 standard errors) |
| prime-staircase | `{}` | last-prime | line-q | unconverged | ladder truncated at rung 23: no state found at rung 24 (a run of primes at least 6) within 40000 climbing proposals; not within 2% after 21058464 steps (budget 32000000) |
| prime-staircase | `{}` | near-miss | line-q | unconverged | ladder truncated at rung 23: no state found at rung 24 (a run of primes at least 6) within 40000 climbing proposals; not within 2% after 21058464 steps (budget 32000000); rung 18: chain not equilibrated (rate into rung 19 moved 47.8 points between the halves of its samples, 5.7 standard errors) |
| pythagorean-area | `{"A":6}` | prime-height | line-q | unconverged | not within 2% after 17508384 steps (budget 32000000) |
| pythagorean-area | `{"A":6}` | slanted-square | line-q | unconverged | not within 2% after 18423200 steps (budget 32000000) |
| pythagorean-area | `{"A":6}` | whole-legs | line-q | unconverged | not within 2% after 17508384 steps (budget 32000000) |
| ruler | `{}` | far | line-q | unconverged | not within 2% after 20710240 steps (budget 32000000) |
| ruler | `{}` | prime-gradient | line-q | unconverged | ladder truncated at rung 40: no state found at rung 41 (distance² to a square exactly; m to a prime within 1/4) within 40000 climbing proposals; not within 2% after 19200608 steps (budget 32000000) |
| ruler | `{}` | square-area | line-q | unconverged | ladder truncated at rung 42: no state found at rung 43 (distance² to a square exactly; the area to a square exactly) within 40000 climbing proposals; not within 2% after 20115424 steps (budget 32000000) |
| same-on-both-rulers | `{"T":6}` | prime-start | line-q | unconverged | not within 2% after 17508384 steps (budget 32000000) |
| same-on-both-rulers | `{"T":6}` | steep | line-q | unconverged | not within 2% after 18423200 steps (budget 32000000); rung 2: splitting estimate 0.568 against 0.668; rung 3: splitting estimate 0.574 against 0.684; rung 4: splitting estimate 0.578 against 0.690; rung 5: splitting estimate 0.582 against 0.693; rung 6: splitting estimate 0.652 against 0.769; rung 7: splitting estimate 0.663 against 0.780; rung 8: splitting estimate 0.669 against 0.785; rung 9: splitting estimate 0.696 against 0.817; rung 11: splitting estimate 2.639 against 2.883 |
| same-on-both-rulers | `{"T":6}` | whole-lamp | line-q | unconverged | not within 2% after 17508384 steps (budget 32000000) |
| same-on-both-rulers | `{"T":6}` | whole-values | line-q | unconverged | not within 2% after 20252832 steps (budget 32000000); rung 17: chain not equilibrated (rate into rung 18 moved -5.5 points between the halves of its samples, -4.7 standard errors) |
| square-area | `{}` | lpf | line-q | unconverged | not within 2% after 22086881 steps (budget 32000000); rung 43: splitting estimate 15.174 against 17.728; rung 47: splitting estimate 23.918 against 31.663 |
| square-area | `{}` | omega | line-q | unconverged | not within 2% after 20263968 steps (budget 32000000) |
| square-area | `{}` | spf | line-q | unconverged | not within 2% after 22083770 steps (budget 32000000); rung 45: splitting estimate 22.237 against 34.381; rung 46: splitting estimate 25.365 against 37.837; rung 47: splitting estimate 26.742 against 37.861 |
| treasure | `{"T":37,"k":2}` | square-start | line-q | unconverged | not within 2% after 19795424 steps (budget 32000000); rung 40: splitting estimate 14.189 against 11.618; rung 42: splitting estimate 14.820 against 12.489 |
| triangle-area | `{"A":4}` | even | line-q | unconverged | ladder truncated at rung 37: no state found at rung 38 (the area exactly; the legs to each other within 1/4) within 40000 climbing proposals; not within 2% after 17828384 steps (budget 32000000); rung 0: chain not equilibrated (rate into rung 1 moved 5.3 points between the halves of its samples, 4.5 standard errors) |
| triangle-area | `{"A":4}` | legs | line-q | unconverged | not within 2% after 18880608 steps (budget 32000000) |
| whole-intercept | `{}` | omega | line-q | unconverged | not within 2% after 30186597 steps (budget 32000000) |
| whole-intercept | `{}` | spf | line-q | unconverged | not within 2% after 18423200 steps (budget 32000000) |
| same-on-both-rulers | `{"T":6}` | whole-values | line-z | too-coarse | layer 1 (whole-values) takes 2 distinct values, fewer than 6: too coarse to extend the ladder |
| whole-intercept | `{}` | omega | line-z | too-coarse | layer 0 (frac) takes 1 distinct values, fewer than 6: too coarse to extend the ladder |
| whole-intercept | `{}` | spf | line-z | too-coarse | not within 2% after 18411841 steps (budget 32000000); layer 0 (frac) takes 1 distinct values, fewer than 6: too coarse to extend the ladder |
