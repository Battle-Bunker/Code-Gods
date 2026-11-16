# Fraction-native line families: walk-throughs (rule design, 16 November)

The owner asked for four beginner rules "crafted with rationals in mind from the beginning" that "prefer non-integer rational values". These are two of them (Fraction Gradient and Mixed Intercept), with Fraction Pair as an alternative, in the owner's shape (design-principles.md principle 3b):

1. The primary is a property of the nearest desired value to a reading of the line.
2. The secondary is closeness to that value.
3. The third is another dimension of the line, tied to the same value.

Points are the sum of each layer's rarity: the tree valuation, lib/v2-valuation tree-value.ts. Neither family is dealt until the coordinator has read this page. Code: lib/v2-linear/src/frac-fraction-gradient.ts, frac-mixed-intercept.ts and frac-fraction-pair.ts.

Measurements come from two scripts:
- lib/v2-agents/scripts/tuples-tree.ts (tree values, about 650,000 law draws per version): examples, the share kept after a cheap move, and the energy-gate climber with 3,115⚡.
- lib/v2-agents/scripts/frac-check.ts: law draws and the fraction share (row 13).

Bits below are tree bits, written level + closeness + third.

## The two cards, in the owner's format

### Fraction Gradient (versions: halves, thirds, fifths, sevenths; 4)

*Card:* Look at the gradient. The targets are the sevenths that are not whole numbers: fractions with bottom number 7
in lowest terms (1/7, 2/7, 8/7, 15/7, …, and the same with a minus sign). Find the one nearest the gradient (halfway
between two goes to the bigger top number, or between −1/2 and 1/2 to 1/2).
- **Primary:** its top number, ignoring the sign: bigger is better.
- **Secondary:** how far the gradient is from it: closer is better.
- **Third:** how far the y-intercept is from that same seventh: closer is better.

| line | tuple | why | a shift of 1 | a tilt of 1 |
|---|---|---|---|---|
| y = (17/7)x + 17/7 | (17, 0, 0) | on 17/7, and the y-intercept is 17/7 too | (17, 0, 1) | (24, 0, 1) |
| y = (17/7)x + 5/14 | (17, 0, 2 1/14) | on 17/7; the y-intercept is 2 1/14 from it | (17, 0, 1 1/14) | (24, 0, 3 1/14) |
| y = 3x + 4 | (22, 1/7, 6/7) | 3 is not a seventh: 20/7 and 22/7 are each 1/7 away, so 22 (bigger) | (22, 1/7, 1 6/7) | (29, 1/7, 1/7) |

Repertoire of thirds:
- the y-intercept near the same seventh (above);
- the y-intercept's bottom number near 7;
- the y-intercept's top number near a multiple of the target's top number.

### Mixed Intercept (versions: and a half, a third, two fifths, three sevenths; 4)

*Card:* Look at the y-intercept, ignoring a minus sign. The targets are the numbers "something and a third": 1/3, 1 1/3,
2 1/3, 3 1/3, … Find the one nearest the y-intercept (halfway between two goes to the bigger).
- **Primary:** its whole number (for 3 1/3, 3): bigger is better.
- **Secondary:** how far the y-intercept is from it: closer is better.
- **Third:** take the gradient, ignoring a minus sign, and its fraction part (what is left after the whole number:
  17/6 = 2 + 5/6, so 5/6). How far is that from 1/3? Closer is better.

| line | tuple | why | a shift of 1 | a tilt of 1 |
|---|---|---|---|---|
| y = (4/3)x + 7/3 | (2, 0, 0) | 7/3 = 2 1/3; the gradient 4/3 = 1 1/3 | (3, 0, 0) | (2, 0, 0) |
| y = (5/2)x + 1/2 | (0, 1/6, 1/6) | 1/2 is 1/6 from 1/3; the gradient's part 1/2 is 1/6 from 1/3 | (1, 1/6, 1/6) | (0, 1/6, 1/6) |
| y = 2x + 5 | (5, 1/3, 1/3) | whole numbers are a third away from every target | (6, 1/3, 1/3) | (5, 1/3, 1/3) |

A shift of 1 lands exactly on the next target, and a tilt of 1 keeps the gradient's fraction part.

Repertoire of thirds:
- the gradient's fraction part near 1/3 (above);
- the gradient's whole number near the target's whole number;
- the gradient's size against the target (the bigger divided by the smaller).

**Open, for both (pool-wide, with the integrator):** points under the tree valuation are not monotone in the level. On Mixed Intercept, exact hits are worth:

| target | bits |
|---|---|
| 2 1/3 | 7.3 |
| 5 1/3 | 13.8 |
| 8 1/3 | 7.3 |
| 10 1/3 | 22.7 (31 is prime) |

Closeness at a target is priced by that target's own arithmetic, and the level itself is worth 1–2 bits. So a greedy climb stops at the first cheap exact hit.

## 1. Fraction Gradient

**Card** (sevenths, third "echo"):

> The targets are the sevenths that are not whole numbers: fractions with bottom number 7 in lowest terms (1/7, 2/7,
> 8/7, 15/7, …, and the same with a minus sign). Find the one nearest the gradient (halfway between two goes to the bigger
> top number, or between −1/2 and 1/2 to 1/2). Score: its top number, ignoring the sign; bigger is better.
> Then: how far the gradient is from that target; smaller is better.
> Then: how far the y-intercept is from that same target; smaller is better.

**Three lines** (sevenths):

| line | tuple (level, −closeness, −third) | bits | why |
|---|---|---|---|
| y = (17/7)x + 17/7 | (17, 0, 0) | 11.7 = 1.3 + 6.2 + 4.2 | The gradient is exactly a non-whole seventh, and the intercept is the same seventh. |
| y = (17/7)x + 5/14 | (17, 0, −29/14) | 9.2 = 1.3 + 6.2 + 1.6 | The same gradient; the intercept is 2 1/14 away from 17/7. |
| y = 3x + 4 | (22, −1/7, −6/7) | 5.7 = 1.4 + 0.0 + 4.3 | A whole gradient is never on a target (3 is 1/7 from 20/7 and 22/7), so closeness scores nothing. |

**What a cheap move by another player does** (bits after, starting from 11.7 on y = (17/7)x + 17/7):

| move | bits after |
|---|---|
| shift +1 | 10.5 |
| shift −1 | 10.5 |
| tilt +1 | 7.5 (24/7, still on a target; the intercept is now 1 away) |
| tilt −1 | 5.2 |
| nudge c | 11.7 |
| mirror x | 11.7 (−17/7 has the same top size; the echo is measured to −17/7) |

**Versions:** d = 2, 3, 5, 7 (halves, thirds, fifths, sevenths). The exact targets of different versions never coincide, because a fraction in lowest terms has exactly one bottom number.

**Alternative thirds:**
- **echo:** the y-intercept against the same target.
- **bottom-match:** the y-intercept's bottom number against d.
- **top-multiple:** the y-intercept's top number against the nearest multiple of the target's top number.

**Checks:**

| row | evidence |
|---|---|
| 1 unbounded | The level is the target's top number, with no top. |
| 3 / 3a tie to the primary | Every third is measured against the reached target k/d. There are 3 thirds of different forms: a value distance, a whole-number distance, and a distance to a multiple. |
| 4 versions | 4. Exact targets are disjoint across versions. |
| 8 energy | The greedy climber reached at most 24.1 bits (d = 5); per version 22.2, 22.2, 24.1, 23.8. The gate is 35. |
| 10 bump | After one cheap move, a climb's best line keeps 93%, 93%, 95% and 100% of its bits (median), 26–49% at worst. |
| 12 card | The terms are "bottom number", "top number" and "lowest terms", with examples. |
| 13 rationals | The top decile of law draws is 67–69% non-whole, against a base rate of 62%, because the level is reached by any steep line. Among good lines it rises: for d = 7, 91% at 10 bits or more and 97% at 14 bits or more (scripts/frac-share.ts). |

**Weakness:** the level is a shallow hill, about 1.3 bits in all. A steeper gradient is cheap under the law, so most points come from closeness and the third, not from climbing levels. The gradient's size is also read by Steep Line, so the two rules are aligned on direction (row 6: to check on the PMI table).

## 2. Mixed Intercept (replaces Square Fraction Intercept)

**Card** ("and a third", third "gradient-part"):

> The targets are the numbers "something and a third": 1/3, 1 1/3, 2 1/3, 3 1/3, … (a whole number plus 1/3). Find the
> target nearest the y-intercept, ignoring its sign (halfway between two goes to the bigger). Score: its whole number
> (for 3 1/3, 3); bigger is better.
> Then: how far the y-intercept (ignoring its sign) is from that target; smaller is better.
> Then: take the gradient, ignoring its sign, and its fraction part (what is left after the whole number: 17/6 = 2 + 5/6,
> so 5/6). How far is that from 1/3? Smaller is better.

**Three lines** (a third):

| line | tuple | bits | why |
|---|---|---|---|
| y = (4/3)x + 7/3 | (2, 0, 0) | 7.3 = 1.1 + 4.5 + 1.7 | The intercept is exactly 2 1/3, and the gradient's fraction part is 1/3. |
| y = (5/2)x + 1/2 | (0, −1/6, −1/6) | 2.2 = 0.0 + 1.0 + 1.3 | The intercept is 1/6 from 1/3, and the gradient's part 1/2 is 1/6 from 1/3. |
| y = 2x + 5 | (5, −1/3, −1/3) | 1.9 = 1.8 + 0.0 + 0.0 | Whole numbers are as far from every target as a value can be on one side (1/3 or 2/3). |

**What a cheap move by another player does** (bits after, starting from 7.3 on y = (4/3)x + 7/3):

| move | bits after |
|---|---|
| shift +1 | 7.1 (exactly on 3 1/3: a shift by 1 lands on the next target) |
| shift −1 | 6.4 |
| tilt +1 | 7.3 |
| tilt −1 | 7.3 |
| nudge c | 5.1 |
| mirror x | 7.3 |

**Versions:** the fraction parts 1/2, 1/3, 2/5 and 3/7. Exact targets are disjoint across versions.

**Alternative thirds:**
- **gradient-part:** the gradient's fraction part against r/d.
- **gradient-whole:** the gradient's whole part against w.
- **gradient-ratio:** the gradient's size against the target, the bigger divided by the smaller.

**Checks:**

| row | evidence |
|---|---|
| 1 unbounded | The level is the whole part w, with no top. |
| 3 / 3a tie to the primary | Every third is measured against the reached target w + r/d. There are 3 thirds of different forms: a value distance, a whole-number distance and a ratio. |
| 4 versions | 4. |
| 8 energy | The climber reached at most 24.3 bits; per version 22.0, 22.7, 23.2, 24.3. |
| 10 bump | Median kept is 100%, 100%, 99% and 100%; at worst 27–45%. |
| 12 card | The terms are "whole number" and "fraction part", with examples. |
| 13 rationals | Top decile of law draws: 85–90% non-whole (base rate 62%). For d = 7: 96% at 10 bits or more, 99% at 14 bits or more. |

**Weakness:** the level is shallow, 1–1.8 bits. Climbs end cheaply, at 22–24 bits for 39–75⚡.

## 2a. Fraction Pair (an alternative to Fraction Gradient with a deeper level)

The rule takes the seventh nearest the gradient and the seventh nearest the y-intercept. Its level is the smaller of the two top numbers. Then comes the bigger of the two distances. The thirds are the tops' gap, the bigger top against a multiple of the smaller, and the tops' ratio.

- **Level:** worth 2.1–2.6 bits, against 1.3 for Fraction Gradient. The climber does climb it: 30.5 bits for 2,005⚡ at top number 19,060.
- **Bumps:** median kept is 91–100%; at worst 32–66%.
- **Fraction share:** lower. For d = 7, 59% of the top decile, 63% at 10 bits or more and 89% at 14 bits or more, because steep whole lines also reach a high level.

## Dropped on measurement (16 November)

- **Twin Fractions:** fails row 10. Nudges keep 15–27%.
- **Nearly Whole:** a nudge onto a whole number keeps 1–3%, because its targets crowd towards a whole number.
- **Square Fraction Intercept:** a unit shift from an exact square took 18.4 bits to 2.0, the fragility the owner rejected. The median kept was only 59–76%.
- **Repeating Bottom and Polygon Bottom** (bottom-size readings): the greedy climber reached 41–56 bits with the ladder tail, over the gate.

## Closeness graded in gap units (prototype (a), 16 November): not adopted

The patch is docs/engine-v2/scripts/tree-gap-closeness.patch. Each cell's gap is twice the farthest draw from its target, and a distance below floor × gap counts as floor × gap.

**Exact hit on 10⅓, Mixed Intercept ("a third"):**

| setting | bits |
|---|---|
| raw | 22.7 |
| floor 1/64 | 22.7 |
| floor 1/16 | 14.5 |

**Climbs:**
- Mixed Intercept still stalls at the first exact hit, at 20.8 bits for 62–108⚡.
- Fraction Gradient (sevenths) is unchanged at 23.4–23.8 bits.
- Points stay non-monotone in the level.

**Why:** the law's rational readings near a target are rare at any scale, and the third layer's bits are untouched. The integrator's flat 2-bit cap on closeness and the third works better.
