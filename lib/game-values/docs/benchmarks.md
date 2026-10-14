# Practical host evaluation benchmark

Command: `pnpm --filter @workspace/game-values benchmark`.
Measured in this Replit Linux workspace on Node v24.13.0. One run, seed 42,
three gods. Wall time is descriptive, not a latency SLA or hardware-independent
threshold. Tests and benchmark were run concurrently, so noise is expected.

| Domain | Generation + screening | Evaluations | Mean µs/evaluation | Evaluations/second |
|---|---:|---:|---:|---:|
| Signed full-range Int | 4.20 ms | 200,000 | .0383 | 26,124,367 |
| ASCII cap 128 | 24.91 ms | 20,000 | 5.352 | 186,830 |
| ASCII cap 4096 | 152.34 ms | 2,000 | 122.008 | 8,196 |

Method: generate once, draw 64 deterministic uniform-domain inputs, perform
1,000 warmup calls, then cycle across inputs and gods. Accumulate a checksum so
results are observed. The script prints runtime, settings, timings, counts and
checksum. Validation is included in each evaluation. These numbers measure
the trusted JavaScript host, **not** subprocess/sandbox startup or Python speed.

Int evaluation is O(1). String evaluation is O(n * 4) with O(4) scratch space
and no target enumeration. A string cap protects both input validation and
distance cost. The supported maximum is 4096, but the normal default is 128.

Generation is offline, with at most 130 string candidates, 128 spawn samples,
and 8 gods. The bounded candidate comparison is quadratic in candidate count
and polynomial in roster size; the tiny binary candidate enumeration is fixed
at length six regardless of cap. Never regenerate or rescreen per interaction.
Cache the returned host evaluator closures for the room lifetime.
