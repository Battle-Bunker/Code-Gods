# Close Landing: a size adversary, prototyped (15 November)

The coordinator asked for this after design-principles row 7. Five of the eleven dealt line rules reward "some reading
rounds to a prime ending in k". The spec lead's reading of the PMI matrix is in design-principles.md principle 6:
readings round, so number-class adversaries dissolve, and only size opposes. Almost every dealt rule rewards a big number.

This prototype rewards a small one, on Prime Landing's own reading. It is not dealt. No trial is proposed until the
coordinator has seen this table.

**Close Landing** (`lib/v2-linear/src/close-landing.ts`):
- **Main part, a ladder.** The x-axis crossing X should round to 1/n: 1/|X| rounds to n, the bigger n the better, in
  triangular levels of n's digits (as Prime Landing's primes).
- **Below the ladder.** |X| ≥ 2 scores below every rung, graded by its distance to 2.
- **Through the origin.** A line through the origin scores nothing, since 1/0 is no number.
- **Tie-breaker, a new form.** The y-intercept's nearest whole number r should divide n, the bigger r the better.
- **Value function.** `lib/v2-valuation/values/line-q/close-landing`, sampled at the same 655,000 accepted draws as
  Prime Landing's.
- **Witnesses.** The lines y = ±n·x ∓ 1, whose crossing is ±1/n.

## PMI against the dealt pool (line-q, `pmi.ts --families …`, 1,000,000 draws per tilt × 5)

| | DL | PG | PL | PS | PA | R | SOBR | SI | SA | T | WC | mean (46 pairs) | anti-aligned pairs |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **Close Landing** | −3.1 | +1.5 | −6.5 | −2.1 | −11.7 | −6.5 | −6.6 | −1.5 | +2.3 | −0.3 | −5.8 | −3.62 | 25 |
| Prime Gradient, for comparison | +1.4 | (−3.5) | −1.5 | +0.2 | +0.2 | −0.8 | −0.6 | +0.8 | −0.6 | −0.8 | −2.4 | −0.40 | 19 of 172 |
| Prime Landing, for comparison | +2.2 | −1.5 | (−3.1) | +1.0 | +1.7 | +2.4 | +0.5 | +1.2 | +2.2 | +0.6 | +2.1 | +0.93 | 5 of 172 |

The diagonal entries, in brackets, are two tie-breakers of one family.

**Reading: as built, it is a sledgehammer, not an adversary.**
- **It excludes Prime Landing and Ruler outright.** No line holds 4 bits of both, so these cells are bounds.
- **It nearly excludes Pythagorean Area, Same on Both Rulers and Whole Crossing.** Its mean of −3.6 sits beside Egyptian
  Line's −5.2, the most exclusive rule measured. Prime Gradient, the pool's working adversary of size, is mild by
  comparison: −1.5 against Prime Landing, −2.4 against Whole Crossing.
- **Opposite directions on one reading (X small against X big) make the two rules zero-sum on every object.** That is
  the setting for a two-state tug, the fault playtest round 32 found with the sign reflections. Seating Close Landing
  with Prime Landing or Ruler would build one on purpose.

## Is the ladder climbed by small moves, and is there a cliff at the origin?

These come from the energy gate's greedy climber, run on this rule alone with the whole beginner menu.

- **Energy gate.** The best is 9.7 bits on lines-beginner (2,500⚡) and 13.0 bits on lines-lenses (19,800⚡), far under
  35.
- **The climb is incremental.**
  - On beginner it uses tilts of 1 to 100, priced by their size, after a shift onto a rung. Nudges of a vertical line's
    a (x = 1/a) climb at about 6⚡ a step to 3.5 bits.
  - On lenses it uses zooms by ½ to ⅕ at the trial 29 fee floor, with tilts between.
- **The origin is a cliff, but no steeper than Prime Landing's rung edges.**
  - From each end state of a climb, the cheapest move that drops the rule below 2 bits costs 6.3 to 144⚡ (median about
    9). It is a half-unit shift, a nudge of c, or a slide.
  - For Prime Landing's end states it is 4.4 to 5.7⚡: a unit tilt or a mirror off the prime.
  - Best states have |c| of 1 or a fraction, so the origin is one small shift away. The same holds for any rung edge.

## Recommendation

- Do not deal Close Landing as built.
- If a size adversary is wanted, put the small reading on a coupled but different number, as Prime Gradient does. Two
  candidates to measure next:
  - **A small y-intercept** (c rounds to 1/n). It opposes Smooth Intercept, Prime Staircase and Divisibility Ladder
    directly, and Prime Landing only through the gradient.
  - **A shallow gradient** (m rounds to 1/n). It opposes Prime Gradient directly and the area through c.
- Each should land near Prime Gradient's profile (mean PMI between −1 and −0.3, no exclusions) before any trial.

## The coupled candidates: Close Intercept and Close Gradient (also prototyped, not dealt)

These are in `lib/v2-linear/src/close-readings.ts`. The coordinator asked for the small intercept first, then the shallow
gradient.
- **Close Intercept:** the y-intercept should round to 1/n.
- **Close Gradient:** the gradient should round to 1/n.
- **Both:** bigger n is better, by triangular digit levels; 0 scores nothing. The tie-breaker is the other coefficient's
  nearest whole number being a multiple of n, the bigger the multiple the better.
- **Witnesses for the tail cap:** 1/n at n = 10^(k−1). Close Landing's witness had the same mistake as these (n itself
  in place of the k-th digit) and is fixed with them; its caps now step at every digit.

PMI against the dealt pool (the same run settings):

| | CG | CI | DL | PG | PL | PS | PA | R | SOBR | SI | SA | T | WC | mean | anti-aligned of 47 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **Close Intercept** | +5.9 | | −5.9 | −1.1 | −6.1 | −6.0 | −6.1 | −6.1 | −6.4 | −6.2 | +1.0 | −1.2 | −5.4 | −4.49 | 35 |
| **Close Gradient** | | +5.9 | −5.9 | −6.2 | +1.1 | −0.8 | +0.8 | +0.1 | −0.1 | −2.0 | −1.4 | −2.5 | +0.9 | −0.94 | 11 |

The energy gate (whole beginner menu) gives these on lines-beginner and lines-lenses.

| | best bits, beginner | energy for it | best bits, lenses | how |
|---|--:|--:|--:|---|
| Close Intercept | 26.5–32.5 | 519–982⚡ | 26.5–26.9 | nudges of b by 1 (c = ±1/b), after a stretch or a mirror |
| Close Gradient | 27.7–34.7 | 654–1,277⚡ | 26.6–34.7 | nudges and moves along an axis (m = ±1/b) |
| Prime Landing, for comparison | 15.8–16.9 | about 2,500⚡ | 12.9–20.1 | |

**Reading: both fail, for a reason that will catch any "small" goal on the rationals.**
- A number close to 0 is a fraction, so n sits in the line's b, a denominator. The law makes a big b rare, so these lines
  are genuinely worth 26–35 bits, but a nudge of b by 1 costs about 6⚡. The climb stops at a local top after
  550–1,300⚡, far below a seat's 2,500⚡, so these are the cheapest hills in the pool by about tenfold: cheap peaks.
- Close Intercept also excludes eight families. Close Gradient has nearly the profile wanted (mean −0.94, half its
  pairs independent), but it excludes Prime Gradient: opposite directions on one reading again.
- The coordinator also asked for play numbers (flips, two-state cycles and rungs stepped when seated against the
  families they oppose). They were not run, since both fail before play.
- A size adversary on the line is better found in whole numbers. Prime Gradient already is one: a steep whole gradient
  shrinks the crossing, the area and the distance. The dealer can seat it opposite the prime readers before a new
  family is invented.

## Two tie-breaker forms that are not "that prime minus 1 shares a factor with the intercept"

Row 7 asks for these. Each is defined by the rung's number and relates it to another aspect of the line (decision 29):

- **Prime Staircase: the near miss.** The run of primes y(0), y(1), … y(L − 1) ends at the first term y(L) that is not
  a prime ending in k. That term's smallest prime factor should be as big as possible: the staircase should fail as
  narrowly as it can.
  - It is graded and unbounded (a breaking term with a big smallest factor is rare and costly).
  - It is tied to the rung: a longer run moves the breaking term, so the climb starts again.
  - It reads a third number, neither c nor m.
- **Pythagorean Area: the same ending.** The y-intercept's whole part should end in the same digits as the area's prime
  p, the more trailing digits the better.
  - It is graded, unbounded, and tied to the rung: a new p changes its digits.
  - It relates p to the height |c|.
  - Its form is a digit pattern, not a factor.
Both are now layers of their families, undealt (`near-miss` in beginner.ts, `same-ending` in beginner-areas.ts), with
value files on line-q.

### Measured (15 November)

Setup:
- An experiment copy dealt each new form in place of "shared-factor", with the TypeScript starters scoring it.
  Prime Staircase still draws between it and step-back.
- Focused runs: pool-dynamics `--focus <family>`, 16 games, the same seeds as the current form. Whole-pool run: 20
  games, the same seeds as the develop baseline.
- Row 3 is the share of the seat's main-part steps that lowered its tie-breaker. A rung that moves the tie-breaker
  restarts its climb.

| | points gained per instance (focused) | row 3: main steps that lowered the tie-breaker | rungs stepped (focused run) | gate, best bits (beginner / lenses) |
|---|---|---|--:|---|
| Prime Staircase, near miss | 254 / 374 / 399 / 445 | 13–31% (pool run: 44%) | 518 | 12.3–28.4 / 12.3–31.9 |
| Prime Staircase, shared factor (now) | 248 / 339 / 351 / 490 | 0–36% (pool run: 24%) | 534 | 12.2–22.4 / 13.0–24.9 |
| Pythagorean Area, same ending | 237 / 340 / 383 / 546 | 0–3% (pool run: 2%) | 440 | 11.3–15.5 / 17.1–24.6 |
| Pythagorean Area, shared factor (now) | 274 / 341 / 426 / 442 | 4–61% (pool run: 63%) | 439 | 11.3–14.2 / 11.2–14.6 |

Over the whole pool with both new forms dealt:
- balance is 1.9 against 2.0;
- two-state cycles are 44% of the last third's moves against 54%;
- rungs stepped are 628 against 643.

**Reading:**
- **Near miss is a usable form.** It is entangled (a longer run moves the breaking term), fair, and passes the gate. It
  reaches higher than the current form on ending 9 (28.4 and 31.9 bits, against 22.4 and 24.9): closer to the limit
  but under it.
- **Same ending fails row 3.** Most heights share no trailing digit with the prime, so the tie-breaker sits at 0 and a
  new rung rarely lowers it. Pythagorean Area needs another form, such as a relation between the prime and the base
  instead of a digit pattern.
- The starters never climbed either tie-breaker back after a rung (recovered: 0% in nearly every row). Row 3 therefore
  shows only the cost side.
- Neither is dealt. A change to a dealt rule is a declared trial with the full check table, row 7 included.
