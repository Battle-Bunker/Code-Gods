# Hand-over: large parameter spaces for the dealt line families

Branch `claude/prime-gradient-suffix` (from `develop` at 2ef3ba28). Written 16 November 2026, about 20:15 Melbourne
time, when the session was stopped by the coordinator. **No code is written yet**: this branch holds only this file.
Everything below is reading, measurement and design, so that the next session does not repeat it.

The owner's instruction (16 November) and the job are in the coordinator's brief; in short: Prime Gradient's parameter
becomes a suffix of digits of any drawable length, its sign parameter goes, and every dealt beginner line family gets a
large parameter space; instances drawn from a large space need values without a precomputed file each.

## 1. Status

| Item | Status |
|---|---|
| Route for values chosen and accepted by the coordinator | done (section 2) |
| Prime Gradient: suffix parameter, sign removed | designed (section 4), not coded |
| Value function for any suffix | designed (section 3), not coded, not tested |
| Dealer drawing parameters; consumers of the pool | mapped (section 5), not coded |
| Starters, mirror page, tests | mapped (section 6), not coded |
| The other nine families | not started |

## 2. The route for values (accepted by the coordinator)

One parameter-free law per family reading, the instance as an argument. A family reads a few numbers off a line (Prime
Gradient: the whole number the gradient's size rounds to, and the y-intercept's whole part). The valuation knows the
stationary law of that reading once; an instance's curve is that law pushed through the instance's own utility,
computed on first use and memoised, behind the existing seam `ruleKey → value record` (`convex/v2/values.ts`
`valueRecord` / `valueHead`), so the tick, agents, faces and replays do not change.

- True by construction: if a rule's score depends on the line only through the reading, its rarity is a sum over the
  reading's law, for every parameter.
- Why not compute at deal time: one sampled curve takes about 4 s (measured: `pnpm --filter @workspace/v2-valuation
  values -- --variant line-q --family prime-gradient`, 98,264 accepted draws of 300,000). That cannot run in a mutation;
  it would need an action, a stored-curves table and every reader moved from the bundle to the database.
- Why not precompute every instance: 4,444 suffixes of up to 4 digits at about 22 KB each is about 100 MB;
  `convex/v2/values.gen.ts` is 9.4 MB today.
- It survives the owner's open question (worth as rarity or as cost to reach): the seam is "worth = f(family,
  parameters, score), computed on demand". Under cost, f is φ of the cheapest witness, which ladder families already
  declare (`RuleFamily.witness`, `ladderCaps` in `lib/v2-valuation/src/value.ts`), and needs no table.
- The coordinator asked for, in the PR description: one small table computed by the code for two or three suffixes,
  bits on the approach against bits on the first target (the "nearly flat until the first rung" claim, which is still
  a conjecture: section 7).

## 3. What I learnt about how to build that law (do not rediscover)

**A weighted sample of readings does not work as the table.** I measured it: of the 98,264 accepted line-q draws,
56,055 have a distinct (|m|, ⌊|c|⌋), 50,970 a distinct (⌊4|m|⌋, ⌊|c|⌋) and 47,039 a distinct (round |m|, ⌊|c|⌋); on line-z
all 162,765 of 300,000 are distinct. The tilted draws live in the tail, so aggregating by reading does not shrink the
sample. Evaluating an instance on about 50,000 rows (a nearest-prime search each, on numbers of up to 24 digits) takes
seconds: too slow for a Convex function's first use (isolates are recycled; the limit is about 1 s).

**The law of the gradient can be summed exactly instead.** On line-q the state is a primitive triple (a, b, c), b > 0,
with independent codes (`lib/v2-linear/src/line.ts` `LINE_Q_CODES`): a and c by the mixed code with p(0) = 1/8, b by
steps with p(0) = 1/16. Two facts make exact sums cheap:

- The mixed code is completely multiplicative: `mixedPosBits(n) = ½·Σ e·p + log2 Z` over n = Π p^e
  (`lib/v2-core/src/codes.ts`). So p(n) = p(1)·2^(−factorWeight(n)), P(p ∤ n) = 1 − 2^(−p/2), and a number with a prime
  factor above about 100 has negligible mass (a prime p costs p/2 bits).
- The steps code is geometric: p_b(b) ∝ 2^(−b/2). Denominators above about 24 hold under 2^−11 of the mass of b = 2.

So, with r_p = 2^(−p/2), κ(1) = 1 and κ(g) = (1 − p_c(0))·Π_{p | g}(1 − r_p) for g > 1 (the chance that c is coprime to g):

    G(n) = P(|m| rounds to n) = (1/Z_c) Σ_{b ≥ 1} p_b(b) Σ_{a in the window} s(a)·p_a(a)·κ(gcd(a, b)),
    window: ⌈(2n − 1)b/2⌉ ≤ a ≤ ⌈(2n + 1)b/2⌉ − 1 (halves round up), s(a) = 2 for a > 0 (both signs), 1 for a = 0.

Z_c is the mass of canonical triples, vertical lines included (they score WORST, so they are in the denominator and in
no survival sum). I derived a closed form for Z_c but did not check it: **check Z_c against the sampler's acceptance
rate (98,264 / 300,000 = 0.3275 at these seeds) and G(n) for small n against sampled frequencies before trusting
anything.** A prime n gets almost nothing from b = 1 (cost n/2 bits); its mass comes from fractions with smooth
numerators (11 ← 21/2, 32/3, 45/4), so G on primes is not smooth in n: it must be summed per prime, not fitted.
At 300 values of a per rung (b ≤ 24), each needing trial division by the 25 primes below 100 only, a rung costs well
under a millisecond, so on-rung values can be computed at run time for any rung size, with no tail rule.

**The curve for a target set T (the primes with the suffix), utility as today** (on a rung: `digitLevel(p)`; off:
−(distance − ½); tie-breaker gcd(p + 1, ⌊|c|⌋)):

- On a rung t with tie-breaker value g: S = Σ_{t′ ∈ T, t′ > t} G(t′) + G(t)·P(gcd(t + 1, W) ≥ g | rung t).
  The sum over later targets needs a tail estimate past the last target summed (a fit A·x^−β of G on primes, times the
  density of T, 1/(φ(10^L)·ln x)); for dense sets (one digit) the tail is not small relative to the last term.
- The tie-breaker's law on a rung is a mixture over b: W = ⌊|c|/b⌋, weights ω_b(t) ∝ p_b(b)·(the b-th term of G(t)),
  computed in the same loop. Then P(gcd(N, W) = d) = Σ_{e | N/d} μ(e)·D_t(d·e), D_t(d) = Σ_b ω_b(t)·D[b][d],
  D[b][d] = P(W ≥ 1 and d | W, given b), a small build-time table (b ≤ 24, d ≤ 64, a fitted tail beyond) summed over
  smooth c. Approximation (label it): the coupling of c with gcd(a, b) is kept in the mass (κ) but not in W's law.
- Off the rungs, cells at whole distance k from the nearest target have utility in (−k, −k + 1], so
  P(main ≥ −k) = Σ on-rung + Σ_{cells within k} G(j), exact but for the atoms at half-integers just above a target.
  That needs G(j) for every j up to some N (a build-time table, about 4,096 numbers, 40 KB) and gives knots one unit
  apart; the tie-breaker is worth nothing off the rungs in this first cut (today it is worth about 0.3 bits there).
- Build `{ knots, tail }` in the existing shapes and call `tailOf(knots, TAIL_CEILING, layerMeasures(family, tb),
  undefined, ladderCaps(...))` as `lineValueFunction` does, so `valueLookup` is unchanged.
- The transfer test the coordinator requires: for three suffixes ("1", "7", "13"), the derived curve against
  `lineValueFunction` on the same family and parameters, at every sampled knot up to about 14 bits, within
  max(0.35 bits, the sampled interval). A free cross-check: the new "1" (sign free) should be 1 bit below the old
  `{ ends: 1 }` curve at every rung (both signs double the mass). Old curve, for reference: first rung (p = 11)
  7.77 bits, p = 131 13.5, p = 281 14.3, p ≈ 1,361 16.0, top knot 18.0.

Prime Gradient has no value files on line-z (`lib/v2-valuation/values/line-z/` has no `prime-gradient`), so it is
dealt on line-q only (and line-q-lenses, which takes line-q's values). If it is wanted on line-z the law there is a
closed form: P(|m| = n) = 2·2^(−mixedIntBits(n)), and c is independent of m.

**Other families.** The same shape (a reading rounds to a target in a parameterised set; level on the rung, distance
off it; a gcd tie-breaker with another reading's whole part) covers Prime Landing (crossing −c/a) and probably Whole
Crossing; each needs its own sum over two coefficients. Families whose score needs the whole line (Treasure, the two
rulers, Pythagorean Area) may have no small reading: report those to the coordinator, as agreed. A fallback provider
is a sampled histogram of a one-dimensional reading from a large build-time sample, good to about 18 bits.

## 4. Prime Gradient as designed

- Parameters: `{ suffix: string }`, a string of 1 to 4 digits whose last digit is 1, 3, 7 or 9
  (`/^[0-9]{0,3}[1379]$/`). Then the suffix as a residue is coprime to 10^L, so by Dirichlet's theorem infinitely many
  primes end in it: every drawable suffix has targets.
- Leading zeros: the suffix is read as written digits. A target is a prime whose decimal digits end with the string,
  so it has at least as many digits: "007" is met by 4007, 6007 …, not by 7. In code: `n.toString().endsWith(suffix)`;
  the candidates are v, v + 10^L, … with v the suffix's value, starting at v + 10^L when v has fewer than L digits.
- Sign: unconstrained. The rule reads |m| (rounded, halves up). The ghost mark takes the gradient's own sign.
- Card: "The gradient, ignoring its sign, should round to a prime whose last digits are 13 (13, 113, 313, 613 …).
  Bigger primes are better, though each extra digit counts for less." with the first few listed from the code. (The
  last clause is the existing wording; principle 12 calls it vague, but it is not this task's change.)
- Lengths: 20% / 50% / 25% / 5% for 1 to 4 digits (4 + 40 + 400 + 4,000 = 4,444 instances; two draws coincide about
  1.6% of the time). The coordinator confirmed this is mine (now yours) to choose. If the "flat until the first rung"
  conjecture holds, consider not drawing 4 digits under rarity.
- New helpers for `lib/v2-linear/src/numbers.ts`: `isSuffix`, `isPrimeWithSuffix`, `nearestPrimeWithSuffix` (as
  `nearestPrimeEnding`, stepping 10^L), `primesWithSuffix(s, count)`, `drawSuffix(rng)`. `gradientWitness`
  (`witnesses.ts`): the smallest n-digit prime with the suffix, both signs, none for n < L (`ladderCaps` tolerates up to
  3 empty units in a row).
- Prime Landing and Prime Staircase share the type `Ends = { ends, side }` in `beginner.ts`; leave them for their own PRs.

## 5. The contract and the dealer (designed, not coded)

**One interface for large spaces is needed now.** Three other sessions (tree families: geometry
session_0119hWTTE887vhxabPTaVQTt, number theory session_0119hWTTmdT3mr8dRAYfmbJX, tree-rep
session_0119hWTTLTstfbL5MgYvnrB5) each asked me for the shape and each proposed a slightly different one. I did not
answer them. All three agree on: `dealable(variant)` keeps returning a short showcase list (about 8) so every existing
consumer works, plus an optional space with `size`, `draw(rng)`, `parse(text) → P | { invalid }` and a label. I had
the same plan: an optional `space` on `RuleFamily` in `lib/v2-core/src/contracts.ts`, with `has(params)` too (the
server must validate stored or typed parameters). The coordinator should pick one shape and tell all four.

**The pool.** `dealablePool(preset)` (`convex/v2/deal.ts`) is a list of concrete rules and is used as one in many
places. For a family with a space, keep its showcase entries in the pool and change only these:

- Drawing: every `entries[r.below(entries.length)]` (in `dealFrom`, `anchoredDeal`, `withOpponent`,
  `bidDealer.dealFamily`) becomes one function that, for a family with a space, draws parameters from the space and
  builds the rule key and content hash. Seating clashes read dealt parameters (`lib/v2-linear/src/seating.ts`), so the
  draw must happen there, not after the deal.
- Values: `valueHead` / `valueRecord` (`convex/v2/values.ts`) on an index miss must parse the rule key (add a
  `parseRuleKey` beside `ruleKey` in `lib/v2-valuation/src/keys.ts`, with a round-trip test), check `space.has`, and
  build the record; `valueHead` must stay cheap (a content hash from the law's version and the key, no curve).
- `rematchDeal` (`lobby.ts` about line 299) looks the last game's rules up in the pool by key: it must accept a drawn
  instance (the stored `v2Rules` row has family, params and tie-breaker).
- `candidates` (`play.ts` about line 69, `ops/rule.ts` about line 49) tells players "the others' rules are among
  these": for a family with a space it must list the family once per tie-breaker with a card that says the digits are
  hidden, not the showcase instances.
- `fitGame` (`fit.ts`) infers rivals' rules from the pool's entries: with a space it can only name a showcase
  instance. That it gets harder is the owner's intent; say so in the code and tell the coordinator.
- Drift (`drift.ts`, `lib/v2-core/src/drift.ts`) redraws from `dealable()`; Prime Gradient keeps its parameters
  (`keepsParams`), so nothing changes now, but a non-ladder family with a space needs `space.draw` there.
- `scripts/gen-v2-values.mjs` bundles `lib/v2-valuation/values/**`: delete the four old Prime Gradient files under
  `values/line-q/prime-gradient/` and regenerate.

## 6. Everything else that names Prime Gradient's parameters

`{ ends }` / `side` appear in: `lib/v2-agents/src/catalogue.ts` (the starter's `main`, `rungs`, `mainSays`, both guest
languages: `near(x, prime, p.ends)` must become a suffix search and `p.side` goes);
`lib/v2-linear/test/{families,beginner,design-principles}.test.ts`; `lib/v2-views/test/{annotate,plot,contributors,
equation-text}.test.*`; `lib/v2-agents/test/{commit-clause,locks,others-secrecy,parity,host}.test.ts`;
`lib/v2-valuation/scripts/mirror-values.ts`; `artifacts/engine/test/unit/{v2-rule-check,v2-rule-forms,
v2-params-equal}.test.ts`; `artifacts/player-web/src/gallery/{v2.tsx,line-examples.ts}`; `lib/v2-linear/src/sums.ts`
(a stale `separable` plan for Prime Gradient naming layers that no longer exist: delete it). The mirror:
`artifacts/player-web/src/gallery/rules-mirror/{pool.ts,main.tsx}` and `test/rules-mirror-pool.test.ts` (it reads the
value files' keys from disk; with a space it must ask the valuation instead).

## 7. Claims, labelled

- True by construction: the route's transfer (section 2); the Dirichlet filter (section 4).
- Measured in a narrow test: the sample counts and the 4 s (section 3); the old curve's numbers.
- Derived, unchecked: the formula for G(n), κ and Z_c (section 3). Check against the sampler first.
- Conjecture: under rarity a sparse target set is nearly flat until its first rung (my estimate from the old curve's
  fit, G(n) ≈ 0.22/n²: a 4-digit suffix's first rung about 27 bits, a 3-digit one's 15 to 22). How it could be wrong:
  G on primes is not smooth, so single targets may sit well off the fit; and the off-rung distance grading does give
  some bits near a target. The table the coordinator asked for settles it.
- Conjecture: treating W's law as a mixture over b without the coprimality coupling stays within the test's tolerance.

## 8. Next steps, in order

1. Agree the `space` shape with the coordinator (section 5) and add it to `contracts.ts`.
2. Tests first: suffix helpers (`numbers.ts`), Prime Gradient's scores and card for "7", "13", "007", both signs.
3. The gradient law: build-time table script, run-time rung sums, checked against the sampler (Z_c, G for small n).
4. The curve builder and the transfer test; then the "approach against first rung" table for the PR.
5. `keys.ts` parse, `values.ts` fallback, the dealer's draw, `rematchDeal`, `candidates`.
6. Starters (both languages), mirror page (draw another, type a suffix), the tests of section 6.
7. Selective suites once, root `pnpm run typecheck`, the design-principles check table in the PR, merge, tell the
   coordinator so the mirror is republished. Then the other nine families, one PR each.
