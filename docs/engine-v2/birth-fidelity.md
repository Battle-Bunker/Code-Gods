# Engine and Node draw the same walks (16 November)

**What was wrong.** For the same seed, the Convex runtime and Node drew different birth walks (starting lines), so
the table (lib/v2-agents runTable) and replays computed off the server did not describe the engine's game. `a ** b`
for a fractional exponent differs in the last bit between the two runtimes; a read length summed from such terms came
out 9 on the engine and 8.999999999999998 in Node, and `Rng.chance(bits)` drew whole bits one fair bit at a time and
fractional bits from one `unit()`, so the streams parted for good.

**The fix (PR #1126).** `chance` snaps `bits` to a 2^−24 grid before choosing its branch. Tests:
`artifacts/engine/test/v2-birth-fidelity.test.ts` (every preset variant, 64 draws, two seeds, engine against Node) and
`v2-turnover-table.test.ts` (a whole game both ways). Value files unchanged.

**Residual risk (a recorded follow-up, the coordinator's call).** Any comparison of a random draw with a computed
float (`unit() < 2 ** -bits`, the mutator draw's cumulative `2 ** -which`) can still come out differently in the two
runtimes when a draw lands between the two last-bit values: about 4 in ten million draws (a 2^−32 grid against a
~1e-16 gap). A game would then diverge from its simulation from that draw on. The full fix is the hand-over's plan
(branch `fix/birth-walk-fidelity`): replace every numeric `**` and `Math.pow` in `lib/v2-*/src` and
`artifacts/engine/convex/v2` (about 140 sites) with v2-core's deterministic `pow`, add a boundary test forbidding
`**` there, and compare `powDigest()` in both runtimes. Not done: the cost is a codemod and value files no longer
bit-reproducible from their seeds; the risk is rare.

How this could be wrong: the 4e-7 estimate assumes a one-ulp gap and uniform draws; if some runtime differs by more
than an ulp on `Math.exp`/`Math.log` (probed on a handful of values only) the rate is higher.
