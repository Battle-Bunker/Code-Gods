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

# Old grid rule ideas

The grid families of the value-table era (the beginner pool, the more-rules pool, v1's ports, the arithmetic playtest
and the undealt ones), deleted from `develop` on 17 November (Melbourne) with their tie-breakers, seating rule,
value files and grid valuation code, when every grid setup moved to the nine dynamic grid rules
(lib/v2-grid dynamic-families.ts; energy.md, "Grids"). The code is in git history before the deleting commit. Each line
is the family's main goal as its card put it, with its first dealt parameter set. The penalties of the defence goals
(Hated number, Number crowd) are kept in lib/v2-grid defence.ts.

| Family | id | Main goal (as the card said it) |
|---|---|---|
| Mirrormancer | `mirrormancer` | Every row should read the same backwards, like 3 1 1 3. |
| Magic Eighteen | `magic-eighteen` | Every row should add up to 18. |
| Opposite Nines | `opposite-nines` | Every cell and its opposite (where a half turn of the board takes it) should add up to 9. |
| Two Pair | `two-pair` | Each corner box of four cells should hold two different pairs, like 3 3 8 8 in any order. |
| Spread of Three | `spread-of-three` | Every 2×2 square should have a spread of exactly 3: its biggest number 3 more than its smallest. The squares overlap. |
| Strangers | `strangers` | Touching numbers in the same corner box should be strangers: both bigger than 1, no common divisor bigger than 1, and at least 2 apart (like 2 and 5). |
| Leapfrog | `leapfrog` | In every row, each number and the number two cells along (leaping over the one between) should be one apart, like 4 _ 5. |
| Crosswise Threes | `crosswise-threes` | Fold the board along the diagonal from the top-right corner: each number and the number it lands on should be 3 apart, like 2 and 5. |
| Steady Steps | `steady-steps` | Along every row the numbers should go up (or down) in equal steps, like 1 3 5 7. |
| Box Totals | `box-totals` | Each corner box of four cells should add up to 12. |
| Prime Cells | `prime-cells` | As many cells as possible should hold a prime number (2, 3, 5 or 7). |
| Magic Totals | `magic-totals` | Every column's and every corner box's total should leave 2 when divided by 6, and no two rows or two columns may hold the same numbers. |
| Spread | `spread` | Every 2×2 square and every three cells one above another in a column should have a spread of exactly 1 (its biggest number minus its smallest), and no two rows or two columns may hold the same numbers. |
| Number Lines | `number-lines` | Read each column from top to bottom as one number: each should be as close as possible to a number that is a multiple of 11, and no two rows or two columns may hold the same numbers. |
| Pair Sums | `pair-sums` | Every cell and its opposite (where a half turn of the board takes it) should add up to 4, 9 or 14, and no two rows or two columns may hold the same numbers. |
| Divisibility | `divisibility` | Read the top half and the bottom half row by row, and the left half and the right half column by column, each as one number: each should be divisible by as high a power of 3 as possible (count the 3s that divide it), and no two rows or two columns may hold the same numbers. |
| Leading Digits | `leading-digits` | Read the top half and the bottom half row by row, and the left half and the right half column by column, each as one number: each should start with the same digits as some power of 2 (up to the 1000th), for as many digits as possible, and no two rows or two columns may hold the same numbers. |
| Round Numbers | `round-numbers` | Every row should add up to a round number: a multiple of 10, like 10, 20 or 30. Each row's total is as far off as it is from the nearest multiple of 10 (17 is 3 off, 25 is 5 off), and the distances are added up. |
| Number Bonds | `number-bonds` | Two touching cells (side by side, or one above the other) are a bond when their numbers add up to 10, like 3 and 7. Make as many bonds as possible; a cell can be in several bonds. |
| Column Addition | `column-addition` | Rows 1 and 2 (counting from the top) are added like a written sum, and row 3 should be the answer. Work from the right-hand end and carry 1 whenever a column adds up to 10 or more; a column is right when row 3 shows the right digit. Count the right columns in an unbroken run from the right-hand end. If row 1 is all 0s, nothing counts. |
| Full House | `full-house` | Make poker hands: look along each row. Every pair of cells in it holding the same number counts 1. Three of a kind makes 3 pairs, and four of a kind makes 6. More is better. |
| Twenty-One | `twenty-one` | Get close to 15 without going bust. Each row and each column is a blackjack hand: add it up. A hand of 15 or less scores its total in points, and exactly 15 scores 15 more. A hand over 15 is bust and scores nothing. More points is better. |
| Seesaw | `seesaw` | Make every row balance like a seesaw: its two sides are its left half and right half. Add up the numbers on each side; the gap between the two sides should be as small as possible, added up over the rows. |
| Snap! | `snap` | Put cells holding the same number side by side and shout Snap! for each pair: every two touching cells (across or down) holding the same number count 1. More is better. |
| Looking-Glass | `looking-glass` | Try to make every cell match its mirror twin. Fold the board across the middle, top onto bottom: every cell lands on a twin. Each pair of twins holding the same number scores 1 point. |
| Pinwheel | `pinwheel` | Try to make a quarter turn leave the board looking the same. Turn the board a quarter turn: the cells swap places in sets of 4. A set of 4 that all hold the same number scores 1 point. |
| Constellation | `constellation` | Try to make one big cluster of stars, the cells holding 0. Stars that touch, even at a corner, form a cluster. Each star in your biggest cluster scores 1 point. |
| Bingo Caller | `bingo-caller` | Your called numbers are 1, 4, 6 and 9. Dab every cell showing one of them: each dab scores 1 point. A complete row, column or long diagonal of dabs is BINGO and scores 4 more points. Score as many points as possible. |
| Ladder of Numbers | `ladder-of-numbers` | Read each row as one 4-digit number. Going down the page, make the longest unbroken climb of rows that each beat the row before: count the rows on it (the row it starts from doesn't count). |
| Sudoku Scholar | `sudoku-scholar` | No number should appear twice in a row, a column or a long diagonal. Count the rows, columns and long diagonals where no number appears twice. |
| Kings and Subjects | `kings-and-subjects` | In each corner box of four cells, the biggest number (the king) should equal the other three added up, like 9 with 2, 3 and 4. A box whose biggest number appears twice has no king and is 20 off. |
| Stepping Stones | `stepping-stones` | Make the biggest group of cells you can hop between: you can hop between touching cells whose numbers differ by exactly 2. |
| Mountain Climb | `mountain-climb` | Starting at the top-left cell, climb as far as you can: each step goes to a touching cell exactly 1 bigger. Count the cells on your longest climb. |
| Uphill | `uphill` | Walk toward the bottom-right corner along every row and column: as many steps as possible should reach a bigger number. |
| Staircase | `staircase` | As many numbers as possible should be exactly 1 more than the number to their left. |
| Magic Accountant | `magic-accountant` | Every row should add up to 18. |
| Fillomino | `fillomino` | Every patch of touching equal numbers should have as many cells as its number, like a 3 in a patch of three cells. Count the cells in patches of the right size. |
