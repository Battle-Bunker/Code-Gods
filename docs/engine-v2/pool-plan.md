# The line pool, redesigned: a plan (spec lead, 16 November, before building)

Asked for by the coordinator after the owner's instructions of 15 November (owner decision 44; design-principles.md
principles 11 to 13, rows 10, 12 and 13). Nothing here is built yet. The owner will work through examples with us,
so each family below is given as a player would see it.

## What every dealt line rule must do (the rows this plan answers)

| | The owner's words | What it means for a card |
|---|---|---|
| Keeps value under a bump (row 10) | "Rules should still keep some of their value when modest sized perturbations occur." | A small move of the line loses a little score, in proportion to its size; never everything. |
| Fraction-native (row 13) | "we want rational numbers as our number type not integers" | The good lines include lines with fractional gradient and intercept. The rule reads a number that fractions make naturally: a crossing, an area, a distance, a ratio, y at a dealt x. A rule that needs the gradient or the intercept itself to be whole fails. |
| Precise card (row 12) | "What's the function over 3 and 17 prime factor indices to utility?" "I don't know what a 'coin pile' is" | The card says exactly how the score is computed, gives worked examples, and explains every concept a 12-year-old would not know. No "each extra counts for less". |
| Parameters (decision 41, row 4) | "genuine parameters with a substantial state space" | At least four dealt versions, from several parameters. |
| Three secondaries (row 3a) | decision 14 | Three, of different forms, each defined by the main part's score. |

## One remedy for every ladder: a score with shoulders

Today a ladder scores its rung's level only when the reading rounds onto a rung, and anything else scores below the
lowest rung (minus its distance). A bump off a high rung loses everything. The remedy, in the shared ladder helper:

> **score = the biggest, over every rung r, of (r's level − distance from the reading to r), and never below 0.**

A reading exactly on a rung scores its level. A bump of size d loses d (a straight shoulder), and a reading between two
rungs scores the better of the two shoulders. The level is something the card can state and a player can count:
digits, or how many times a dealt number divides in. The rarity in bits still comes from how often random lines score
that well; the app shows the "how rare is each score" table beside the card (the coordinator has asked the app session
for it).

Effects to measure before it lands (the coordinator's table): the bits of each score (the value files are rebuilt),
the energy gate, and the knock asymmetry. Today a knock costs about 4⚡ and a rebuild 61 times more; with shoulders a
knock of size d costs d levels, so the asymmetry should shrink by roughly the shoulder's slope.

**A tension the owner should know about (rows 10 and 13).** A number-theory property of a fraction is fragile by
nature: 22/7 bumped by 1/100 is 2207/700, so its bottom number jumps from 7 to 700. Rules that read numerators and
denominators exactly cannot keep value under a bump. So in this plan a main part reads a *size* (a crossing, an area,
a distance, y at a dealt x), which fractions make freely and which moves by d when the line moves a little. Number kinds
(primes, palindromes, numbers built from dealt primes) enter only as the targets that size is scored against, with the
shoulders above. Rules on numerators and denominators exactly are kept for secondaries, if at all.

## Family by family

Verdicts: **repair** keeps the family and its parameters, adds shoulders and rewrites the card; **replace** takes it out
of the deal. All examples below use the shoulder rule; "bits" are left to the measured table.

### 1. Prime Landing: repair

*Card:* Find where the line crosses the x-axis; call it x. For every prime ending in 1 (11, 31, 41, 61, 71, 101, 131, …)
work out: (how many digits the prime has) − (how far x is from it). Your score is the biggest of these, and never below
0. *Versions:* the ending (1, 3, 7, 9) and the side (x or −x): 8.

| line | x | score | why | after a bump |
|---|---|---|---|---|
| y = −x/2 + 11/2 | 11 | 2 | on 11, two digits | y = −x/2 + 5.6 crosses at 11.2: 1.8 |
| y = 2x/3 − 202/3 | 101 | 3 | on 101, three digits | shift c up by 1/3: x = 100.5, 2.5 |
| y = x − 50 | 50 | 0 | 41 and 61 are 9 and 11 away | — |

### 2. Ruler (the grids session's, now mine): repair

*Card:* Square the distance from the origin (0, 0) to the line: call it D. Score as Prime Landing, with primes ending in
the dealt digit and D in place of x. *Versions:* 8 as Prime Landing.

### 3. Treasure: repair, and explain the numbers

*Card:* Work out y when x is the dealt number k. The triangle numbers are 1, 3, 6, 10, 15, 21, …: the n-th is
1 + 2 + … + n (stack coins in rows of 1, 2, 3, … and count them). For every triangle number t, work out (how many
digits t has) − (how far y is from t). Your score is the biggest, never below 0. *Versions:* k = 3, 4, 5, 7 and the
side: 8.

| line (k = 3) | y(3) | score | why | after a bump |
|---|---|---|---|---|
| y = x/3 + 9 | 10 | 2 | on 10 = 1 + 2 + 3 + 4 | tilt by 1/30: y(3) = 10.1, 1.9 |
| y = 5x/2 + 97/2 | 56 | 1 | 55 = 1 + … + 10 is 1 away: 2 − 1; 66 is 10 away | tilt by 1/6: y(3) = 56.5, 0.5 |
| y = 7x + 99 | 120 | 3 | on 120 = 1 + … + 15 | shift by 1/2: 2.5 |

### 4. Same on Both Rulers: repair

*Card:* Find where the line meets the line y = x; call that x. A palindrome reads the same backwards (7, 44, 343, 1221).
For every palindrome with an odd number of digits, work out (its digits) − (how far |x| is from it); your score is the
biggest, never below 0. *Versions:* odd or even digits, y = x or y = −x: 4 (more by a dealt base, below).

### 5. Whole Crossing: repair, and say the rule exactly

*Card:* Find where the line crosses the x-axis; call it x. Score the whole numbers that, once you divide out every 5,
leave the dealt remainder r when divided by 5 (r = 2: 2, 7, 10 = 5 × 2, 35 = 5 × 7, 50 = 25 × 2, …). For each such number
n, work out (how many 5s n holds) − (how far x is from n). Your score is the biggest, never below 0. *Versions:* r = 1 to
4, and the base (3, 5, 7): 12.

### 6. Prime Gradient: replace

It reads the gradient alone, which must be close to a whole prime: fractional gradients are only misses (row 13). Its
job in the pool was a size adversary (a steep line shrinks the crossing, the area and the distance), which the
replacements below keep.

### 7. Smooth Intercept: replace

It reads the y-intercept alone, which must be exactly a whole number made of the dealt primes (the owner's complaint
about fractions). Its kind (numbers built from small primes) moves to a reading fractions make: the area.

### 8. Prime Staircase: replace

y(0), y(1), y(2), … are all whole only when the gradient and intercept are whole: the rule cannot have fractional good
lines (row 13).

### 9. Pythagorean Area and Square Area: replace one, merge one

Four dealt families read "on as big a prime as possible" (Prime Landing, Prime Gradient, Ruler, Pythagorean Area), over
row 7's limit of three. Pythagorean Area leaves; Square Area (the grids session's redesign: the area on a square ending
in 1 or 9) stays with shoulders, if it lands with them.

### Replacements (fraction-native; each a size scored against a parameterised target, with shoulders)

| new family | main part (card, short) | versions | the kind it rewards |
|---|---|---|---|
| **Smooth Area** | The triangle the line makes with the axes has area A. Numbers made only of the dealt primes (e.g. 2, 3 and 7: 6, 14, 42, 84, …) are the rungs; a rung's level is how many primes multiply to it (84 = 2 × 2 × 3 × 7: 4). Score: the best (level − distance from A), never below 0. | 3 primes out of 2, 3, 5, 7, 11, 13: 20 | smooth numbers |
| **Steep Meeting** | Where the line meets y = t·x (t a dealt fraction, e.g. 2/3), call it x. Score: how many times the dealt q divides into the nearest whole number to x, minus the distance, never below 0. | t from 6 fractions × q in 2, 3, 5: 18 | powers of a base |
| **Steep Line** (an adversary of size) | The gradient's size |m|, read on a ladder of the dealt base b's powers (b = 3: 1, 3, 9, 27, …). Score: the power reached, rising evenly between powers (|m| = 9 scores 2; 18, halfway from 9 to 27, scores 2.5). Fractional gradients score between powers like any other. | b = 2, 3, 5, 10, each side: 8 | a steep gradient, which shrinks every crossing, area and distance the other rules want big |

Divisibility Ladder's replacement (owner decision 44) is Steep Meeting: it reads both numbers of the line, has 18
versions and a card a 12-year-old can follow.

### Secondaries: three forms per family, all continuous

Each secondary reads the rung the main part scored on (call its number N) and relates another number on the line to it,
scored by distance, so it also keeps value under a bump (row 10) and is defined by the main part (row 3):

| form | secondary (as on the card) |
|---|---|
| ratio | The y-intercept should be as close as possible to N × t, for the dealt fraction t. |
| point | The line should pass as close as possible to the point (N, t), for the dealt t. |
| reciprocal | The gradient should be as close as possible to t / N. |
| meeting | The line should meet y = x as close as possible to N ÷ the dealt q. |
| angle | The line's angle with the x-axis should be as close as possible to N degrees (wrapped to 0–180). |
| gap | The y-intercept minus the crossing should be as close as possible to N. |

Six forms over eight families, three per family, each form in at most three families (row 7 limit) for 24 slots: 6 × 3 =
18 is not enough, so two more forms are needed (candidates: a sum |m| + |c| near N; y at x = N near the dealt t). This is
open.

## What can be done by 12:00 UTC on 16 November, honestly

| | by 12:00 | after |
|---|---|---|
| the shoulder helper, with its table (bits, gate, knock asymmetry) for the repaired families | yes, measured in a copy | lands in the batch |
| repaired cards with exact text and examples, for the five repaired families | yes | lands in the batch |
| value files, starters, gate and rule check for the repaired five | likely | |
| the three replacements, with values and starters | no | about a day after the owner agrees the cards |
| three secondaries for every family | no: the forms above need building and row 3 measuring | with the replacements |
| PMI and dynamics for the new pool | no | with the replacements |

So the batch that could land after the owner's test is five repaired families with shoulders and exact cards, each
still with one or two secondaries (3a stays exempt for them, visibly, in the rule check). The replacements and full
repertoires follow once the owner has read the cards. Until the batch lands, the pool stays as it is now (ten families,
Divisibility Ladder gone).
