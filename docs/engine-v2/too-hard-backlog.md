# Too-hard backlog (spec §7.5)

Rules whose calibration did not converge, or was flagged, at the budget it ran with. They are not dealable.
`pnpm --filter @workspace/v2-valuation calibrate -- --write` regenerates the rows of the rules it calibrates.

| Family | Params | Tie-breaker | Variant | Status | Why |
|---|---|---|---|---|---|
| prime-gradient | `{}` | prime | line-z | unconverged | not within 2% after 26689215 steps (budget 32000000); rung 10: splitting estimate 7.052 against 7.200 |
| triangle-area | `{"A":4}` | legs | line-z | unconverged | not within 2% after 26683613 steps (budget 32000000) |
| triangle-area | `{"A":4}` | even | line-z | flagged | ladder truncated at rung 12: no state found at rung 13 (the legs to each other within 1) within 40000 climbing proposals |
| m-meets-c | `{}` | size | line-z | unconverged | not within 2% after 28361040 steps (budget 32000000) |
| crossing-check | `{"k":1,"q":2}` | size | line-z | too-coarse | ladder truncated at rung 7: no state found at rung 8 (|x(q)| at least 1) within 40000 climbing proposals; layer 1 (size) takes 1 distinct values where it counts, fewer than 6: too coarse to extend the ladder |
| crossing-check | `{"k":1,"q":2}` | whole | line-z | too-coarse | layer 1 (whole) takes 1 distinct values where it counts, fewer than 6: too coarse to extend the ladder |
| whole-intercept | `{}` | spf | line-z | too-coarse | not within 2% after 26685032 steps (budget 32000000); layer 0 (frac) takes 1 distinct values where it counts, fewer than 6: too coarse to extend the ladder |
| whole-intercept | `{}` | omega | line-z | too-coarse | not within 2% after 23359930 steps (budget 32000000); layer 0 (frac) takes 1 distinct values where it counts, fewer than 6: too coarse to extend the ladder |
| square-area | `{}` | factors | line-z | unconverged | not within 2% after 23382013 steps (budget 32000000) |
| square-area | `{}` | rootSpf | line-z | unconverged | not within 2% after 25034328 steps (budget 32000000) |
| prime-gradient | `{}` | prime | line-q | unconverged | not within 2% after 28359443 steps (budget 32000000); rung 4: splitting estimate 3.452 against 3.591; rung 9: splitting estimate 6.065 against 6.358; rung 10: splitting estimate 7.206 against 7.659; rung 11: splitting estimate 8.498 against 9.042; rung 12: splitting estimate 10.330 against 10.976; rung 16: splitting estimate 17.037 against 23.941 |
| prime-gradient | `{}` | cPrime | line-q | unconverged | not within 2% after 28345073 steps (budget 32000000) |
| triangle-area | `{"A":4}` | legs | line-q | unconverged | not within 2% after 28358067 steps (budget 32000000) |
| triangle-area | `{"A":4}` | even | line-q | unconverged | ladder truncated at rung 11: no state found at rung 12 (the legs to each other within 1) within 40000 climbing proposals; not within 2% after 20360088 steps (budget 32000000) |
| m-meets-c | `{}` | size | line-q | unconverged | not within 2% after 30041913 steps (budget 32000000); rung 7: splitting estimate 2.022 against 2.152; rung 8: splitting estimate 2.078 against 2.331; rung 16: splitting estimate 15.546 against 19.880; rung 17: splitting estimate 16.646 against 20.888 |
| m-meets-c | `{}` | meetPrime | line-q | unconverged | not within 2% after 28430680 steps (budget 32000000) |
| crossing-check | `{"k":1,"q":2}` | size | line-q | unconverged | ladder truncated at rung 10: no state found at rung 11 (|x(q)| at least 3) within 40000 climbing proposals; not within 2% after 18942443 steps (budget 32000000) |
| crossing-check | `{"k":1,"q":2}` | whole | line-q | unconverged | not within 2% after 28349014 steps (budget 32000000) |
| whole-intercept | `{}` | spf | line-q | unconverged | not within 2% after 26688821 steps (budget 32000000); rung 8: splitting estimate 3.011 against 3.334; rung 9: splitting estimate 4.415 against 4.674; rung 10: splitting estimate 5.918 against 6.173; rung 11: splitting estimate 7.292 against 7.617; rung 12: splitting estimate 9.154 against 10.043 |
| whole-intercept | `{}` | omega | line-q | unconverged | not within 2% after 23360763 steps (budget 32000000); rung 8: splitting estimate 3.046 against 3.429; rung 9: splitting estimate 4.083 against 4.574; rung 10: splitting estimate 5.429 against 6.108 |
| square-area | `{}` | factors | line-q | unconverged | not within 2% after 25029282 steps (budget 32000000); rung 7: splitting estimate 4.018 against 4.215 |
| square-area | `{}` | rootSpf | line-q | unconverged | not within 2% after 26706194 steps (budget 32000000) |
