# The tug-of-war: why lines go back and forth, and what changes it

> **Correction (15 Nov, evening).** Every table below seats three families drawn at random from the pool, every seat
> runs TypeScript, and it counts committed moves per minute for the whole table. Practice games at the time dealt
> differently: `practiceDeal` sought partners that *share the human's goal*, and seated the second partner in Python.
> Playtests count *objects changed per minute*. Measured the playtests' way and dealt the practice way, the table
> reproduces the quiet practice boards of rounds 26–27. For example, Whole Crossing with Divisibility Ladder and Prime
> Landing changed 3, 0, 1, 0, 0, 0, 0, 0, 0, 0 objects per minute, with 99% of acts skipped. So the figures below
> describe **random tables only**, not practice games. The coordinator has since made the practice deal the same as a
> real deal. The regression test `artifacts/engine/test/v2-pace.test.ts` plays one engine game and the same deal in the
> table, and requires the two to agree.

Measured on 15 November 2026 for the coordinator, as evidence for the owner's decision on the beginner board (decision 31:
three objects growing to five). All runs use `lib/v2-agents/scripts/pool-dynamics.ts`: the line beginner pool,
three seats each running the shipped Simple starter, 600-second games, power 4, rule redraws off, 24 games per row
unless the row says otherwise.

## The finding

About 60–70% of all committed moves are **flips**: a seat puts an object back to the state another seat had just moved
it from. This holds for every line family, not just the ladder families. Examples per game: Divisibility Ladder 70 of
96 moves, Pythagorean Area 47 of 65, Prime Gradient 41 of 61.

Almost every move raises the mover's points when it is made (99%). The move is then undone by a seat whose bits it cut.
The board becomes a two-state cycle, which is a static state in disguise, and ladders are not climbed whatever the
rules say.

## Three starter-side fixes, tested and not shipped

| starters | flips / moves | moves per seat | seats still stepping up late | objects moving in the last third | mean gain | balance |
|---|---|---|---|---|---|---|
| today | 62% | 43 | 69% | 45% | 323 | 2.5 |
| back off a contested line (pushback ≥ 3 lately) | 20% | 19 | 72% | 28% | 339 | 5.8 |
| fair first (prefer steps that keep the others' total bits) | 57% | 43 | 68% | 50% | 328 | 3.0 |
| never repeat a move someone undid; after two undos, another kind of step | 11% | 16 | 61% | 22% | 294 | 2.9 |

- **Fair first** barely helps. The undone moves usually keep the others' *total* bits, because one rival loses while
  the third seat gains. An agent may not learn which seat lost what: valuations are aggregate-only during a live game.
- **Back off** and **no repeat** stop the undoing, but the board freezes. Seats settle into owning lines, which is the
  other failure.
- In this pool the undoing *is* the movement. Every starter-side fix that cuts it also cuts the movement.

## Levers on the table (same pool after #797/#811, Simple starters, redraws off)

| setup | flips / moves | moves per seat | seats stepping up late | objects moving late | mean gain | balance | best joint (own bits with others ≥ 10), mean / max |
|---|---|---|---|---|---|---|---|
| 3 → 5 objects (today) | 62% | 47 | 65% | 52% | 251 | 4.2 | 5.4 / 13.9 |
| 5 → 8 objects + two-step look | 55% | 55 | 72% | 53% | 349 | 2.0 | 7.3 / 16.6 |
| 8 → 12 objects + two-step look | 41% | 57 | 86% | 53% | 567 | 2.0 | 8.0 / 31.6 |
| power halved | 49% | 31 | 68% | 45% | 208 | 2.5 | 5.9 / 16.6 |
| power doubled | 63% | 72 | 71% | 52% | 295 | 3.3 | 7.8 / 16.6 |
| three rules read in different representations | 61% | 48 | 76% | 50% | 284 | 2.8 | 7.0 / 23.5 |
| two of the three share a representation | 61% | 50 | 68% | 53% | 246 | 2.6 | 5.2 / 18.9 |

An earlier set, on the pool before #797/#811 (its own baseline at 3 → 5: 58% flips, 35% late, gain 283):

| setup | flips / moves | seats stepping up late | objects moving late | mean gain | balance |
|---|---|---|---|---|---|
| 5 → 8 objects | 53% | 64% | 38% | 402 | 2.3 |
| 8 → 12 objects | 42% | 85% | 43% | 610 | 3.7 |
| 2 seats | 0% | 71% | 17% | 200 | 2.8 |
| two-line pairs (lines-pairs, 3 seats) | 45% | 43% | 26% | 147 | 3.1 |
| two-step look | 58% | 72% | 46% | 304 | 4.6 |

The **two-step look** is a starter that, when no single step raises its points, weighs pairs of its own steps and
takes the first step of the best pair.

## Conclusion

- **More objects** is the one lever that turns undoing into climbing without freezing. From 3 → 5 to 8 → 12 (with the
  two-step look):
  - flips fall from 62% to 41%;
  - seats still stepping up late rise from 65% to 86%;
  - gain more than doubles;
  - balance improves from 4.2 to 2.0;
  - the best joint state more than doubles.
- **Two seats** end the tug-of-war but freeze the board (17% of objects moving late).
- **Keeping 3 → 5:** power and seating by representation change the flip share by less than 15 points. The gentlest
  of them is halving power: fewer, more deliberate moves, with less undone and about 17% less gain.
- The **two-step look** helped on every measure without freezing anything. It ships in the Thorough starter. When no
  single step helps, it weighs the 4 best of 24 pairs (its 6 best first steps, each followed by a shift or tilt by 1),
  a few more small reads on that act. Simple is unchanged.
- The object count is the owner's decision (decision 31: few battlefields concentrate attention). This file is the
  evidence for that choice.
