# Silent cutoffs and inexact arithmetic in the dealt line rules and the estimator (17 Nov)

The coordinator's list, for a fix that makes each rule exact at any size. Line numbers are on `develop` after #1205.
**Status: every row is done.** #1206 fixed Stepping Coefficients, Whole Stair, Corner, Golden Path and Recurrence Pair
and deleted the unused prime helpers that held the last 10^10 guard (the agents' copies follow, #1208). The next PR
made Bearing exact (tan φ in whole-number fixed point to 2·bits(bottom) + 64 bits; 2 µs a call on small lines, 0.1 ms
at 10^40), Ring exact (|N² − ρM| in bigint), dropped both rules' cap of 50, made Unit Fraction's penalty a bigint cube,
and made the estimator's large same-size starts keep random low digits. The agents' Ring is exact too; their Bearing
is a float approximation without the cap (exact to about 2^−50 of the gradient). The nearest prime with a digit
suffix (exact Miller–Rabin, stepping through the suffix) takes 0.1–1.3 ms up to 10^40 in Node, so no table is needed
when a prime rule returns.

| Rule | Where | What | Effect | Fix |
|---|---|---|---|---|
| Stepping Coefficients | dynamic-families.ts:21, 197 | cutoff: NaN when max(\|a\|, \|b\|, \|c\|) ≥ 10^10 | a ×10 past 10^10 zeroes the energy of a good line | drop the guard; `log2Big(top)`; the step gaps `b − a − d` as bigint, then `log2Big` of their size or a float of a small bigint |
| Stepping Coefficients (search) | dynamic-families.ts:213–217 | inexact: `Number(babs(a0))`, `abs(a) < LIMIT` | the search proposes nothing past 10^10 | step in bigint |
| Whole Stair | candidate-families.ts:193–196 | inexact past 2^53 (`p·p + q·q` in floats, top or bottom past 2^26); cutoff: NaN past 2^100 | the distance to `n × a square` is rounding noise for big gradients, then NaN | `h2 = p² + q²` in bigint; `c = isqrt(h2 / n)` (and c + 1); distance exact |
| Corner | candidate-families.ts:231–234 | inexact past 2^53 (`2n·p·q` in floats); cutoff: NaN past 2^100 | the same | `A` in bigint; `s = isqrt(A)` (and s + 1); distance exact |
| Bearing | candidate-families.ts:22, 53 | cutoff: utility capped at CAP = 50; inexact: the gradient as a double and tan φ as a double (about 52 bits) | no rung beyond 50 bits counts; two gradients within 2^−52 read the same | tan φ to arbitrary precision (a rational of 2^(u+64) bits, e.g. from a series in bigint), the difference in bigint; drop CAP (decision 26: no maxima) |
| Ring | candidate-families.ts:22, 95–97 | cutoff: CAP = 50; inexact: `Number(a)**2`, the distance as a double, `d − √ρ` cancels | the same | compare `(a·u + b·v + c)²` with `ρ·(a² + b²)` exactly in bigint; the utility from `log2Big` of their difference less the size; drop CAP |
| Golden Path | dynamic-families.ts:178 (`continuedFraction`, at most 200 terms) | cutoff: 200 whole parts | a gradient whose path is longer scores 200 at most | no cap (the expansion takes log steps of the size) |
| Recurrence Pair | dynamic-families.ts:267 (`recurrence`, at most 400 terms) | cutoff: 400 terms | a bottom beyond x(400) is matched to x(400) | grow while x(n) ≤ 2·bottom + 2, no count cap |
| Unit Fraction | dynamic-families.ts:163 | inexact: `cube(Number(top) − 1)` | only a penalty, already huge where it is inexact: harmless | bigint cube, then a float of it, for tidiness |
| Hensel, Archimedes, Long Run, Prime Balance | candidate-families.ts:150, 125, 300; dynamic-families.ts:246 | exact (bigint; `log2Big` for sizes) | none | none |
| (display) | dynamic-families.ts:81 | the shown utility is rounded to 10^−6 | display only | none |

The estimator, outside the rules:

| Where | What | Effect | Fix |
|---|---|---|---|
| energy.ts:50–53 (`sameBits`) | inexact: a start's size is drawn as `2 ** (L + band·t)` in a double, rounded | past 2^53 every start is a multiple of a large power of two (its low bits are zeros), so fine-structure rules (Long Run, Hensel, Prime Balance) see same-size starts that are not random; past 2^1024 `BigInt(Infinity)` throws | draw the top 52 bits as now and the low bits uniformly with the rng, in bigint |

How this could be wrong: read from the code, not measured; a rule may reach these sizes only rarely under gravity 20.
