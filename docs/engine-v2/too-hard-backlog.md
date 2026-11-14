# Too-hard backlog (spec §7.5)

Rules whose calibration did not converge, or was flagged, at the budget it ran with. They are not dealable.
`pnpm --filter @workspace/v2-valuation calibrate -- --write` regenerates the rows of the rules it calibrates.

| Family | Params | Variant | Status | Why |
|---|---|---|---|---|
| triangle-area | `{"A":4}` | line-z | unconverged | not within 2% after 12116318 steps (budget 16000000) |
| crossing-check | `{"k":1,"q":2}` | line-z | unconverged | not within 2% after 12118426 steps (budget 16000000) |
