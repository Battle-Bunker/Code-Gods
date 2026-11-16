# The line pool in the owner's tuple shape: a plan (spec lead, 16 November, v2)

This replaces the first version of this plan, which proposed a "shoulder" formula; that version is in git history.
The owner then gave the shape for line rules (design-principles.md principle 3b):

> "primary preferences that use nearest desired value and then a secondary preferences that scores proximity to it and
> then we can use a tertiary preference to integrate another dimension of the line."

Nothing here is dealt. The owner's two examples are built in the spec lead's copy (not on develop, so the rule gallery
does not change while the owner tests), with value files, and every number below for them is measured. The other families are cards to agree before building.

## How a player computes a tuple

A rule's score is a list of up to three numbers, compared in order: the first decides; when the first is equal, the
second decides; then the third. Every line has a score: there is always a nearest target, so no line is "off the
ladder".

1. **Primary.** Find the target nearest to a reading of the line (the nearest prime ending in 1 to the y-intercept;
   the nearest power of 2 to the area). Its size is the primary: the bigger the target, the better.
2. **Secondary.** How far the reading is from that target: the closer, the better.
3. **Third.** Another number of the line, judged against that same target.

A bump that stays nearest the same target keeps the primary and loses a little closeness. A bump that crosses to a
neighbouring target changes the primary by one step.

## How a tuple turns into points: two choices for the owner

Points come from rarity: how many random lines score at least as well (owner decisions 23 and 38). With a tuple
there are two ways to count "at least as well", and the owner should choose.

**(a) In order (lexicographic).** A line beats every line with a smaller primary, whatever their closeness. Then
being exactly on a target can never be rarer than every line with a bigger target, so the secondary and third parts
are worth only a fraction of a bit. Points are, in effect, the size of the target alone.

**(b) Level plus closeness.** Points = the rarity of the target's size *plus* the rarity of being this close to the
target, measured within that target's range. Being exactly on 31 is then worth several points more than being one
away, so proximity counts, and a bump costs points in proportion to its size. Within one target the order is still the
card's order.

Measured on the owner's examples (bits from 100,000 to 655,000 random lines):

| line | tuple | (a) bits | (b) bits | after a shift of 1, (b) |
|---|---|--:|--:|--:|
| Prime Intercept (ends in 1): y = x/31 + 31 | (31, 0, 0) | 4.6 | 9.7 | 4.9 |
| y = x/31 + 32 | (31, 1 away, 0) | 4.6 | 4.9 | 9.7 or 4.0 |
| y = x/101 + 101 | (101, 0, 0) | 5.7 | 15.1 | 7.2 |
| Power Area (k = 2): y = −x/2 + 8, area 64 = 2⁶ | (6, 0, 0) | 3.2 | 6.8 | 2.6 or 3.1 |
| y = −x/2 + 9, area 81 | (6, 17 away, ½) | 2.9 | 2.6 | 3.6 or 6.8 |

| | (a) in order | (b) level plus closeness |
|---|---|---|
| A cheap move (unit shift or tilt, a nudge, a reflection) from a good line keeps | 99–100% of the bits | about half, more for tilts |
| Does proximity count? | hardly (under 0.5 bit) | yes: 4 to 8 bits |
| A greedy climber with one seat's whole-game energy (3,115⚡) | Prime Intercept 25.4 bits for 3,045⚡; Power Area **30 bits for 495⚡** | Prime Intercept stops at 9.7 bits (exact on 31, then every step toward 41 first loses closeness); Power Area **20.8 bits for 250⚡** |

The recommendation is (b): it is what makes "proximity" real points, and its landscape is rugged (to reach the next
target a player gives up closeness on the way), which is against settled optima. It needs the starters to plan two
steps ahead to change target.

**What limits a size primary.** "Bigger is better" is wanted (decision 30), so something must make size dear:
- the price of growth: (c′), measured 15 November, makes reaching beyond par steeply dearer (not yet decided);
- opposing families: a family that wants the same number small, or a steep gradient where others want a big area.

Power Area's area c²/2|m| grows cheaply by tilting the gradient towards 0: 30 bits for 495⚡ under (a). It needs (c′),
or an opposing family seated with it, before it can be dealt.

## The owner's two examples, as cards

### Prime Intercept (versions: the ending 1, 3, 7 or 9; 4)

*Card:* Look at the y-intercept, ignoring a minus sign. Find the prime number ending in 1 nearest to it (11, 31, 41, 61,
71, 101, …). **Primary:** that prime: bigger is better. **Secondary:** how far the y-intercept is from it: closer is
better. **Third:** multiply the gradient (ignoring a minus sign) by that prime; it should be as close to 1 as possible,
counted in doublings (2 and ½ are both one doubling from 1).

Changed from the owner's wording: the y-intercept's size, not its sign. As built it reads the sign, and the reflection
y → −y sends the nearest prime to 11 (a one-move knock to 0.1 bits).

| line | tuple | why | a shift of 1 | a tilt of 1 |
|---|---|---|---|---|
| y = x/31 + 31 | (31, 0, 0) | on 31; 31 × 1/31 = 1 | (31, 1, 0) | (31, 0, 5 doublings) |
| y = 2x/7 + 51½ | (61, 9½, 4.1) | 61 is nearer than 41; 61 × 2/7 ≈ 17 | 52½: (61, 8½, 4.1) | (61, 9½, 6.3) |
| y = x/101 + 101 | (101, 0, 0) | on 101 | (101, 1, 0) | (101, 0, 6.7) |

Repertoire of thirds: the gradient times the prime near 1 (above); the x-crossing near a multiple of the prime; the
line passing near the point (prime, 1).

### Power Area (versions: k = 2, 3, 5, 7; 4)

*Card:* The line and the two axes make a triangle. Find the power of 2 nearest its area (1, 2, 4, 8, 16, 32, …).
**Primary:** which power it is (2⁶ = 64 is the 6th): higher is better. **Secondary:** how far the area is from it:
closer is better. **Third:** the area divided by where the line crosses the x-axis (this is half the y-intercept's
size) should be as close as possible to a multiple of 2.

| line | tuple | why | a shift of 1 | a tilt of 1 |
|---|---|---|---|---|
| y = −x/2 + 8 | (6, 0, 0) | area 64 = 2⁶; 64 ÷ 16 = 4 | (6, 17, ½) | (6, 0, 0) or (4, 5⅓, 0) |
| y = −x/2 + 9 | (6, 17, ½) | area 81: 64 is nearer than 128 | (7, 28, 1) or (6, 0, 0) | (5, 5, ½) |
| y = −x/4 + 8 | (7, 0, 0) | area 128 = 2⁷ | (7, 34, ½) | (5, 10⅔, 0) |

## The repaired families, recast (cards to agree; not built)

Each keeps its versions and reads a size of the line (rule 13), so fractional lines are as good as whole ones.

| family | primary (nearest target) | secondary | third (repertoire: alternatives) | versions |
|---|---|---|---|---|
| Prime Landing | the prime ending in k nearest where the line crosses the x-axis (ignoring sign) | how far the crossing is from it | the y-intercept near a multiple of the prime / the gradient times the prime near 1 / the line near the point (0, prime) | ending × side: 8 |
| Ruler | the prime ending in k nearest the distance² from (0, 0) | how far the distance² is | the foot of the perpendicular near a whole point / the crossing near the prime's square root | 8 |
| Treasure | the triangle number nearest y at x = k (1, 3, 6, 10, …: 1 + 2 + … + n), the bigger the better | how far y is | the gradient near n (the triangle's row count) / y at x = −k near the same triangle | k × side: 8 |
| Same on Both Rulers | the palindrome (reads the same backwards: 7, 44, 343) nearest where the line meets y = x | how far the meeting is | the gradient near the palindrome's digit sum / the y-intercept near a multiple of 11 | digits × which ruler: 4 |
| Whole Crossing | the number nearest the x-crossing that, with its 5s divided out, leaves r on dividing by 5; its count of 5s | how far the crossing is | the gradient near a power of 5 / the y-intercept near the number | r × base (3, 5, 7): 12 |

Leaving: Prime Gradient and Smooth Intercept (each reads one coefficient alone), Prime Staircase (needs whole
coefficients), Pythagorean Area (a fourth "big prime" family).

New: **Smooth Area** (the number made of the dealt primes, e.g. 2, 3 and 7, nearest the area; how many primes multiply
to it; closeness; the crossing near the number's largest prime), **Steep Line** (the power of b nearest the gradient's
size; closeness; the y-intercept near the power: the adversary of every area and crossing rule, which want the
gradient small).

## Open, and what can be done by 12:00 UTC

- The owner's choice between (a) and (b). (b) is a change to the valuation library (a level's rarity plus closeness
  within its basin); about half a day with its tests once chosen.
- Power Area's cheap size (needs (c′) or a seated adversary) and Prime Intercept's sign (|c|).
- Starters: a rule with three parts and two-step lookahead costs the TypeScript starters more steps; Treasure's Bold
  already uses 490,000 of 500,000 (the agents session is fixing it).
- By 12:00: the two examples' cards and these measurements (done); the five recast families built undealt with value
  files and the same table, if the owner picks (a) or (b) by about 06:00. Dealing waits for the owner.
