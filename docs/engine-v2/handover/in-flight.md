# Hand-over: work needed whatever the scoring becomes (stopped 16 November, on the coordinator's instruction)

Branch: `fix/birth-walk-fidelity` (from `develop` at 2ef3ba28). Nothing is merged. No pull request is open.
Only item 1 was started. Items 2 to 5 are untouched.

## Item 1. Engine and Node draw different birth walks: cause found, fix half done

### The cause (measured, not conjecture)

- `a ** b` (Math.pow) is not bit-identical between Node and the Convex runtime for fractional exponents.
  Probe run in both: `2 ** 1.5` is `2.82842712474619` in Node and `2.8284271247461903` on the engine; `2 ** 2.5`,
  `2 ** -0.25` and `2 ** -5.39` differ the same way. Whole exponents, `Math.log`, `Math.log2`, `Math.log1p`,
  `Math.exp`, `Math.atan`, BigInt arithmetic, sorting and the rng stream were the same on every value probed.
- The one bit matters because of `Rng.chance(bits)` (`lib/v2-core/src/rng.ts`): a whole number of bits is drawn from
  fair bits, anything else from one `unit()`. In `walkStep` (`lib/v2-core/src/walk.ts`) the read-length growth of a
  proposed step came out `9` on the engine and `8.999999999999998` in Node, so `chance` used a different number of
  random draws on each side and the two streams parted for good. Seen at walk step 21 of `line-q`, seed `x` (random
  call 591, the first that differs).
- Grid walks agree (`grid-4-d10` passes); every line and pair variant diverges.

How this could be wrong: the probe covered a handful of values per function, so `Math.exp` and `Math.log` agreeing
everywhere is seen in a narrow test, not proven. `powDigest()` (below) is there to check 24,000 values in both
runtimes. I did not confirm that the `9` against `8.999999999999998` comes from a power rather than from another
operation; the proof is the fidelity test going green after the replacement.

### Done on this branch

- `artifacts/engine/test/v2-birth-fidelity.test.ts`: a cheap test (seconds) that asks the engine for its birth walk
  and compares it with Node's, for every preset variant and two seeds. **It fails now**, on every line and pair variant.
- `artifacts/engine/convex/v2/testing.ts`: the fixture query `v2/testing:birthWalk` the test calls.
- `artifacts/engine/test/v2-turnover-table.test.ts`: the both-ways test from `feat/turnover-proof`. **It fails now**
  (line 1 is `1,1,-2` on the engine and `-42,9,-10` in Node).
- `lib/v2-core/src/pow.ts` (`pow`, `pow2`, `powDigest`), exported from the package, and
  `lib/v2-core/test/pow.test.ts` (5 tests, passing). `pow` uses repeated multiplication for whole exponents,
  `Math.sqrt` for a half, and `exp(b · ln a)` otherwise. **Nothing calls it yet.**

### Next steps

1. Replace every numeric `**` and `Math.pow` with `pow` in `lib/v2-*/src` and `artifacts/engine/convex/v2` (about
   140 places; `codes.ts` 23, `v2-agents/catalogue.ts` 19, `v2-pair/families.ts` 17, `v2-valuation/value.ts` 16).
   Leave BigInt powers, `lib/v2-ai`, `lib/v2-sandbox/src/guest.gen.ts` and `quickjs.ts`. A TypeScript-AST codemod is
   the safe way; the root typecheck catches a BigInt passed to `pow`.
2. Add `lib/v2-core/test/pow-boundary.test.ts` (named in `pow.ts`'s comment; not written): no `**` or `Math.pow` on
   numbers in those directories, in the manner of `import-boundary.test.ts`.
3. Add to the fidelity test: the engine's `powDigest()` equals Node's (needs a second fixture query).
4. Run `v2-birth-fidelity`, then `v2-turnover-table`. If the fidelity test still fails, repeat the trace: wrap the
   rng, record every call in both runtimes, and look at the first that differs.
5. Expect unit tests that pin exact prices or exact walk states to move by one unit in the last place, or to draw a
   different walk for the same seed. Fix expectations by hand; do not loosen them.
6. Then the rest of item 1: check develop's `lib/v2-agents` `starters.test`; the rulers-tuple starter fix is on
   `claude/engine-v2-agents` (a36cb74d) if it is still red.

### For the coordinator to weigh

- The fix changes prices and bits by at most one unit in the last place, and changes which walk a given seed draws in
  Node. The law is the same; the stored value files stay valid measurements of it but are no longer reproducible bit
  for bit from their seeds. I judged this inside "fidelity" and outside "changes how bits are computed", and had not
  yet told you.
- A cheaper alternative, not taken: make `chance` treat a near-whole number as whole. It would pass the tests, but
  every `unit() < 2 ** x` comparison would still flip between runtimes about once in a million draws, so games would
  still diverge now and then.
- Browsers were not checked. `Math.exp` and `Math.log` may differ between V8 and other engines, so a What-if computed
  in Safari or Firefox may differ from the engine in the last place.

## Items 2 to 5: not started

- 2 (grid parity): branches `claude/grid-v1-moves` (192 commits behind develop, 6 ahead) and `claude/boards-v1-numbers`
  (124 behind, 4 ahead) were fetched and not read.
- 3 (Seesaw's possible cheap top), 4 (the 17 missing rows in `v1-parity.json`), 5 (`test:v2` in CI): nothing done.

## Local state

The dev engine was started with `pnpm --filter @workspace/engine dev` and stopped at hand-over. A single engine test
file runs with `node --experimental-transform-types --disable-warning=ExperimentalWarning --test test/<file>.test.ts`
from `artifacts/engine`.
