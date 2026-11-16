# Fraction-native line families: walk-throughs (rule design, 16 November)

The owner asked for four beginner rules "crafted with rationals in mind from the beginning" that "prefer non-integer rational values". These are two of them, in the owner's shape (design-principles.md principle 3b):

1. The primary is a property of the nearest desired value to a reading of the line.
2. The secondary is closeness to that value.
3. The third is another dimension of the line, tied to the same value.

Points are the sum of each layer's rarity: the tree valuation, lib/v2-valuation tree-value.ts. Neither family is dealt until the coordinator has read this page. Code: lib/v2-linear/src/frac-fraction-gradient.ts and frac-square-intercept.ts.

Measurements come from two scripts:
- lib/v2-agents/scripts/tuples-tree.ts (tree values, about 650,000 law draws per version): examples, the share kept after a cheap move, and the energy-gate climber with 3,115⚡.
- lib/v2-agents/scripts/frac-check.ts: law draws and the fraction share (row 13).

Bits below are tree bits, written level + closeness + third.

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
| 13 rationals | Exact targets are non-whole by definition, so the closeness bits need a fractional gradient. The fraction share from frac-check is to follow. |

**Weakness:** the level is a shallow hill, about 1.3 bits in all. A steeper gradient is cheap under the law, so most points come from closeness and the third, not from climbing levels. The gradient's size is also read by Steep Line, so the two rules are aligned on direction (row 6: to check on the PMI table).

## 2. Square Fraction Intercept

**Card** (thirds, third "root-gradient"):

> The targets are the squares of the thirds that are not whole numbers: a fraction with bottom number 3 in lowest terms,
> times itself ((1/3) × (1/3) = 1/9; (2/3) × (2/3) = 4/9; (4/3) × (4/3) = 16/9; …). Find the target nearest the
> y-intercept, ignoring its sign (halfway between two goes to the bigger). Score: the top number of the fraction that was
> squared (for 16/9, 4); bigger is better.
> Then: how far the y-intercept (ignoring its sign) is from that target; smaller is better.
> Then: how far the gradient (ignoring its sign) is from the fraction that was squared; smaller is better.

**Three lines** (thirds):

| line | tuple | bits | why |
|---|---|---|---|
| y = (4/3)x + 16/9 | (4, 0, 0) | 18.4 = 0.9 + 8.9 + 8.6 | The intercept is exactly (4/3)², and the gradient is 4/3 itself. |
| y = (1/3)x + 25/9 | (5, 0, −4/3) | 12.3 = 1.3 + 9.8 + 1.2 | The intercept is exactly (5/3)², but the gradient is 4/3 away from 5/3. |
| y = 2x + 5 | (7, −4/9, −1/3) | 6.5 = 1.7 + 1.2 + 3.5 | A whole intercept: 5 is 4/9 from 49/9. |

**What a cheap move by another player does** (bits after, starting from 18.4 on y = (4/3)x + 16/9):

| move | bits after |
|---|---|
| shift +1 | 14.9 |
| shift −1 | 2.0 (7/9 is far from any square) |
| tilt +1 | 11.2 |
| tilt −1 | 11.2 |
| nudge c | not allowed there |
| mirror x | 18.4 |

**Versions:** d = 2, 3, 5, 7. As with Fraction Gradient, exact targets are disjoint across versions.

**Alternative thirds:**
- **root-gradient:** |m| against j/d.
- **top-match:** the gradient's top number against j.
- **in-parts:** m × d against the nearest whole number.

**Checks:**

| row | evidence |
|---|---|
| 1 unbounded | The level is j, with no top. |
| 3 / 3a tie to the primary | Every third is measured against the fraction j/d that was squared. There are 3 thirds of different forms: a value distance, a whole-number distance, and a scaled-to-whole distance. |
| 4 versions | 4. |
| 8 energy | The climber reached at most 27.0 bits (d = 5); per version 17.7, 25.9, 27.0, 21.6. |
| 10 bump | Median kept is 76%, 62%, 63% and 59%; at worst 65%, 30%, 11% and 5%. It is weaker than Fraction Gradient, because a unit shift moves the intercept off its square. |
| 12 card | The terms are "bottom number", "lowest terms" and "times itself", with examples. |
| 13 rationals | Targets are non-whole by definition. The fraction share is to follow. |

**Weakness:** the level is shallow here too, at most about 1.8 bits. The worst-case bump on d = 5 and 7 (5–11% kept) is a unit shift from an exact square. Spacing between targets grows with j, so a shift lands in empty space.

## Dropped on measurement (16 November)

- **Twin Fractions:** fails row 10. Nudges keep 15–27%.
- **Nearly Whole:** a nudge onto a whole number keeps 1–3%, because its targets crowd towards a whole number.
- **Repeating Bottom and Polygon Bottom** (bottom-size readings): the greedy climber reached 41–56 bits with the ladder tail, over the gate.
