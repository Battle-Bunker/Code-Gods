# Old line rule ideas

The line rule families of the value-table era, deleted from `develop` on 17 November (Melbourne) when the dynamic
energy measure replaced the tables (docs/engine-v2/energy.md; owner-decisions.md, decision 50). The owner: "Throw out
old junk that no longer applies. It has been repeatedly causing confusion. Keep old rule ideas in docs." The code of
each is in git history before the deleting commit (and v1's rules on `archive/engine-v1`). Each line is the family's
main goal as its card put it, with one dealt parameter set filled in; most also had tie-breakers, now gone with the
tuple scores. An idea worth reviving is rewritten as one pure utility (dynamic-families.ts), not restored.

| Family | id | Main goal (as the card said it) |
|---|---|---|
| Prime Gradient | `prime-gradient` | The gradient, ignoring its sign, should round to a prime whose last digits are 1 (11, 31, 41, 61, …). Bigger is better; failing that, nearer is better. |
| Triangle Area | `triangle-area` | The line and the two axes make a triangle; make its area as close as possible to 4. |
| m Meets c | `m-meets-c` | Make the gradient and the y-intercept as close as possible to each other. |
| Crossing Check | `crossing-check` | Make y(1) and x(2) as close as possible: y(1) is the height at x = 1, x(2) is where the line reaches height 2. |
| Prime Staircase | `prime-staircase` | The values y(0), y(1), y(2), … should begin with as many different primes ending in 1 as possible. The first one that isn't counts a little if near one. |
| Square Area | `square-area` | The area of the triangle the line cuts off the axes, rounded down, should be a square above 1 ending in 9. Bigger is better; extra digits count less. |
| Whole Crossing | `whole-crossing` | Cross the x-axis on a whole number leaving 1 once its 5s are divided out (like 6, 30 or 150), with as many 5s as possible. Each extra counts less. |
| Divisibility Ladder | `divisibility-ladder` | y(1), y(2), y(3), … should be multiples of 1, 2, 3, … for as long as possible, not through (0, 0). Longer is better, though each extra counts less. |
| Treasure | `treasure` | When x is 3, y should land on a coin pile (1, 3, 6, 10, 15, …), the bigger the better; otherwise, the closer to a pile the better. |
| Prime Landing | `prime-landing` | Where the line crosses the x-axis should round to a prime ending in 1. Bigger primes are better, though each extra digit counts for less. |
| Same on Both Rulers | `same-on-both-rulers` | Where the line meets y = x should round to a number reading the same backwards with 1, 3, 5… digits, like 7 or −343. Bigger is better. |
| Ruler | `ruler` | Square the line's closest distance to (0, 0) and round down: it should be a prime ending in 1. Bigger primes are better, each extra digit counts for less. |
| Exact Change | `exact-change` | Reading the line as a·x + b·y = N (coins worth a and b paying N), the number of ways to pay should be as close as possible to 6. |
| Pythagorean Area | `pythagorean-area` | Triangle area, rounded down: a prime ending in 1. Bigger is better, each extra digit counts for less. |
| Whole Intercept | `whole-intercept` | Make the y-intercept as close as possible to a whole number. |
| Pell Gradient | `pell-gradient` | The gradient times itself should be as close as possible to 2. |
| Euclid's Long Way | `euclid-steps` | Write the gradient as a fraction in lowest terms and run Euclid's algorithm on its top and bottom (divide, keep the remainder, repeat): it should take as many steps as possible. |
| Farey Neighbours | `farey-neighbours` | Write the gradient and the y-intercept as fractions p/q and r/s in lowest terms: p·s − q·r should be as close as possible to 1 or −1 (then they are neighbours: no simpler fraction fits between them). |
| Egyptian Line | `egyptian-line` | The gradient, the y-intercept and y(1) = m + c should be unit fractions (one over a whole number, like ⅓): as many of the three as possible. |
| Long Division | `long-division` | Work the gradient out as a decimal: its repeating block should be as close as possible to six digits long, like 1/7 = 0.142857 142857 …. |
| Prime Slope | `prime-slope` | Writing the gradient as rise over run in simplest form, the rise (ignoring its sign) and the run should each be as close as possible to a prime (distances added). |
| Steady Gradient | `steady-gradient` | The gradient (how far the line goes up for each step right) should be as close as possible to a whole number. |
| Whole Area | `whole-area` | The triangle the line makes with the two axes should have an area as close as possible to a whole number. |
| Whole at x = T | `whole-at-t` | When x is 3/2, y should be as close as possible to a whole number. |
| Target Gradient | `target-gradient` | The gradient should be as close as possible to 5/3. |
| Near the Point | `near-point` | The line should pass as close as possible to the point (2, 7/3): when x is 2, y should be as close as possible to 7/3. |
| Smooth Crossing | `smooth-crossing` | The line should cross the x-axis as close as possible to a number made only by multiplying 2s, 3s, 5s and 7s (like 1, 12, 35, 64 or 360). |
| Smooth Intercept | `smooth-intercept` | The y-intercept (either sign) should be made only by multiplying 3s and 7s. More of them is better, though each extra one counts for less. |
| Steep and Tall | `steep-and-tall` | Make the gradient and the y-intercept both positive and both as big as possible: your score is the smaller of the two. |
| Smooth Gradient | `smooth-gradient` | The gradient should be as close as possible to a number made only by multiplying 2s, 3s, 5s and 7s (like 1, 12, 35, 64 or 360). Smooth numbers are built from small primes; 360 = 2·2·2·3·3·5 is smooth, 367 (a prime) is not. |
| Smooth Square | `smooth-square` | The triangle the line makes with the axes should have an area as close as possible to a square number. |
| Sunken Intercept | `sunken-intercept` | The y-intercept should be below zero, as far below as possible. |
| Close Landing | `close-landing` | Where the line crosses the x-axis should round to 1/n (like 1/2, 1/10, 1/100) for as big an n as possible: as close to (0, 0) as you can, but never on it. Each extra digit of n counts for less. |
| Close Intercept | `close-intercept` | The y-intercept should round to 1/n (like 1/2, 1/10, 1/100) for as big an n as possible: as close to 0 as you can, but never 0. Each extra digit of n counts for less. |
| Close Gradient | `close-gradient` | The gradient should round to 1/n (like 1/2, 1/10, 1/100) for as big an n as possible: as close to 0 as you can, but never 0. Each extra digit of n counts for less. |
| Twin Fractions | `twin-fractions` | Write the gradient and the y-intercept each as a whole number plus a fraction part between 0 and 1 (7/3 = 2 + 1/3; −5/4 = −2 + 3/4; a whole number has fraction part 0). The gap between the two fraction parts (the bigger minus the smaller) should be as close as possible to 0.6180339887… (the golden ratio minus 1). No fraction is exactly that number, so a closer gap is always possible. Score: the distance between the gap and that number; smaller is better (each halving of the distance is a step up). |
| Prime Intercept | `prime-intercept` | Look at the y-intercept, ignoring a minus sign, and find the prime number ending in 1 nearest to it (for example 11, 31, 41, 61, 71, 101 for 1). The bigger that prime, the better. |
| Power Area | `power-area` | The line and the two axes make a triangle. Find the power of 2 nearest its area (2, 4, 8, 16, …). The higher that power, the better. |
| Prime Landing (tuple) | `landing-tuple` | Find where the line crosses the x-axis, ignoring a minus sign (a flat line never crosses it: use its height instead), and the prime ending in 1 nearest to it. Primary: that prime, bigger is better. |
| Ruler (tuple) | `ruler-tuple` | Square the distance from (0, 0) to the line, and find the prime ending in 1 nearest to it. Primary: that prime, bigger is better. |
| Treasure (tuple) | `treasure-tuple` | Work out y when x is 3, ignoring a minus sign. Triangle numbers are 1, 3, 6, 10, 15, …: the n-th is 1 + 2 + … + n (rows of 1, 2, 3, … coins). Find the triangle number nearest to y. Primary: that number, bigger is better. |
| Same on Both Rulers (tuple) | `rulers-tuple` | Find where the line meets y = x, ignoring a minus sign (a line parallel to it never meets it: use its y-intercept instead). A palindrome reads the same backwards (7, 44, 343, 1221); find the one with an odd number of digits nearest to it. Primary: that palindrome, bigger is better. |
| Whole Crossing (tuple) | `crossing-tuple` | Find where the line crosses the x-axis, ignoring a minus sign (a flat line never crosses it: use its height instead). Ladder numbers are those that, once every 3 is divided out, leave 1 when divided by 3 (for example 1, 4, 3, 9). Find the ladder number nearest the crossing. Primary: how many 3s it holds, more is better. |
| Prime Top | `tree-nt-prime-top` | Find where the line crosses the x-axis, ignoring a minus sign (a flat line never crosses it: use its height instead). The targets are the fractions with bottom 2 whose top is a prime number ending in 3 (3/2, 13/2, 23/2, …). Find the target nearest the crossing. The bigger that target's top, the better. |
| Tangent Rings | `tree-geo-rings` | Rings are circles round (0, 0) with radius 1/2, 1, 3/2, 2, … (every multiple of 1/2). Square the distance from (0, 0) to the line, square each ring's radius, and find the ring whose squared radius is nearest (the bigger ring on a tie). The bigger that ring's radius, the better. Each ring has a direction point: radius × 3/5 across and radius × 4/5 up (it is on the ring because 3² + 4² = 5²). |
| Smooth Mixed | `tree-nt-smooth-mixed` | Find the line's height at x = 2, ignoring a minus sign. The targets are the whole numbers made by multiplying only 2, 3 (any number of times; 1 counts) plus 1/4: 1 1/4, 2 1/4, 3 1/4, 4 1/4, 6 1/4, … Find the target nearest that height. The bigger its whole part, the better. |
| Tower | `tree-nt-tower` | Find where the line meets the line y = 2·x, and read its x, ignoring a minus sign (a line parallel to it never meets it: read its y-intercept instead). The targets are a whole number n plus 1/(n + 0): 2 1/2, 3 1/3, 4 1/4, … Find the target nearest. The bigger its n, the better. |
| Leg Ratio | `tree-geo-legs` | The line and the two axes make a triangle; add its base and its height (ignoring minus signs). A 3 : 2 triangle of size s has base 3 × s and height 2 × s, so base plus height 5 × s; the sizes are 1/2, 1, 1 1/2, … Find the size whose base plus height is nearest the line's. The bigger that size, the better. |
| Quadrant Square | `tree-geo-quadrant` | The line and the two axes make a triangle. The targets are 3/2 of a square of side n: 1 1/2, 6, 13 1/2, … Find the target nearest the triangle's area. The bigger its side n, the better. |
| Borrowed Bottom | `tree-rep-borrowed` | Write the gradient as a fraction in lowest terms and call its bottom number B (a whole-number gradient has B = 1). The targets are the fractions with bottom B, in lowest terms, whose top ends in 37 (for B = 4: 37/4 and on, every top ending in 37 that shares no factor with 4). Find the target nearest the y-intercept, ignoring a minus sign. The bigger that target, the better. |
| Drawn Step | `tree-rep-step` | The targets are the whole-number multiples of 3/7 that are not whole numbers: 3/7, 6/7, 1 2/7, … (multiples of 7 × 3/7 = 3 are left out). Find the target nearest the y-intercept, ignoring a minus sign. Count how many steps of 3/7 it is: the more, the better. |
| Part Way | `tree-rep-partway` | Take two square numbers next to each other. The targets are the numbers 2/5 of the way from one to the next (2 1/5, 11 4/5, 19 3/5, …), leaving out any that are whole. Find the target nearest the y-intercept, ignoring a minus sign. The higher its gap (gap 1 is from the first to the second), the better. |
| Root Tilt | `tree-split-root-tilt` | The gradient, ignoring its sign, should agree with √2 = 1.41421356… in as many leading digits as possible (the whole part counts: 2.65 agrees with 2.6457… in 3 digits). More digits are better. |
| Surd Intercept | `tree-split-surd-intercept` | The y-intercept, ignoring its sign, should agree with (1 + √5) / 2 = 1.61803398… in as many leading digits as possible (the whole part counts). More digits are better. |
| Near Origin | `tree-split-near-origin` | Find where the line crosses the x-axis and take 1 over its distance from (0, 0) (a crossing at 1/4 or −1/4 gives 4). The targets are the whole numbers leaving 3 when divided by 7 (3, 10, 17, …). Find the target nearest that number: the bigger it is, the better (so the closer the crossing to (0, 0)). |
Plus Smooth Hug (`smooth-hug`, dynamic, removed 16 Nov in #1162): the y-intercept right on a number made only of the dealt primes; √(prime factors) − distance³.
