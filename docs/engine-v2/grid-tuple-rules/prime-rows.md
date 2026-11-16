# Walk-through 2: Prime Rows, on a changed board (prototype, undealt, scratch only)

## The board change

Cells hold any whole number 0, 1, 2, … (no cap). The law gives a cell holding v the probability 1/((v+1)(v+2)) (about
2·log2 v bits: 0 is ½, 1 is ⅙, 9 is 1/110, 99 is 1/10,100). The menu and prices are the digit board's (a unit costs
about 8.4⚡, a move of k costs k units; swaps, reversals, rotations and turns are choices). No multiplying move, so
"double every cell" is not a move. What changes: a reading's size is unbounded, a big size costs its path (energy now
limits the board: a row total of 300 costs ~2,500⚡, a seat's whole income), and a unit bump moves a total by 1.

## The card (version: top row, primes ending in 1)

> **Prime Rows (top row, ending in 1).** Add up the four numbers in the top row. Find the prime number ending in 1
> nearest that total (a prime can be divided only by 1 and itself; those ending in 1 are 11, 31, 41, 61, 71, 101, 131,
> 151, 181, 191, 211, …; halfway between two, take the bigger).
> **First:** that prime. Bigger is better.
> **Second:** how far the total is from it. Closer is better.
> **Third:** find the biggest number in the top row and add up its whole column. That column total should be as close to
> the same prime as possible.

Points: option (b), level + closeness within the prime's range + the column's closeness.

## Five boards (rows separated by /)

| board | top-row total → prime, off by | column through the biggest, off by | bits (level + close + third) |
|---|---|---|---|
| 4,4,1,0 / 0,0,0,0 / 0,3,1,0 / 0,7,8,5 (law draw) | 9 → 11, 2 | 4, off by 7 | 2.9 (0 + 2.6 + 0.3) |
| 6,1,3,1 / 2,1,8,1 / 2,6,0,8 / 1,0,2,0 (climber, 23⚡) | 11 → 11, 0 | 11, 0 | 9.1 (0 + 4.9 + 4.2) |
| 20,5,4,3 / 3,2,0,1 / 2,0,1,0 / 1,0,0,0 | 32 → 31, 1 | 26, off by 5 | 6.8 (2.3 + 2.5 + 2.0) |
| 119,2,6,4 / 3,2,1,3 / 6,1,0,1 / 3,2,2,0 | 131 → 131, 0 | 131, 0 | 15.3 (4.8 + 4.7 + 5.8) |
| 250,10,8,3 / 9,0,1,0 / 6,3,2,0 / 2,0,0,0 | 271 → 271, 0 | 267, off by 4 | 13.8 (6.0 + 3.8 + 4.0) |

The ladder (row exact on p, column exact; energy to build the row from nothing): 11: 8.5 bits, 95⚡ · 61: 11.1, 529⚡ ·
131: 13.0, 1,136⚡ · 251: 13.2, 2,176⚡ · 491: 15.3 · 991: 16.1, 8,592⚡. It bends hard: under this law a total's
rarity grows only as log2 of its size, so the level is worth little and the climb from 131 to 991 adds 3 bits for
7,500⚡. The steepness is set by the law's tail (the line pool's open "price of growth", c′): a 1/v³ tail doubles the
level's bits; a geometric tail (the digit board's) is a straight hill and fails the gate.

## What a cheap move by another player does (from the 131 and 271 boards, bits kept)

| move | median | worst |
|---|---|---|
| ±1 to a cell | 100% | 78% |
| ±1 to a row or column | 89–90% | 67% |
| tilt | 100% | 74% |
| corner box ±1 | 69–100% | 68% |
| balance | 90–95% | 79% |
| swap two cells | 85% | 5% (the big number leaves the row) |
| reverse / rotate a row or column | 76–79% | 5–24% |
| turn or flip the board | 100% | 2–11% (the top row becomes another) |

Median over all cheap moves: 89–90% kept. Additive bumps fall off gently; moving the big number out is the intended
collateral damage of a representation shortcut, and it is also the shortcut's windfall: a law draw with a big number
elsewhere lets a swap pull it into the top row (one climber reached 20.5 bits for 77⚡ by swapping a 1212 in).

## Alternatives

Secondaries: closeness (above); closeness from below only (the total may not pass the prime). Thirds, each tied to the
prime: (A) the column through the row's biggest number totals near the prime (above, the cross); (B) the row below
totals near half the prime, in doublings; (C) the other twelve numbers total near a multiple of the prime.
Versions: reading (top row, bottom row, left column, right column, a diagonal, a corner box) × ending (1, 3, 7, 9):
24; any two readings share at most one cell.

## Check table

| row | result | evidence |
|---|---|---|
| 1 unbounded | yes | no cap; each rung needs a bigger total |
| 2 ladder climbed | rungs one prime apart (15 below 300 for ending 1, ~170⚡ each); but **flat**: +0.2–1 bit per rung at this law | ladder above; greedy climbers stop on the first exact prime (a step toward the next first loses closeness), as Prime Intercept on lines |
| 3 tied | yes | the column's goal is the prime; a rung up breaks the column's match (13.0 → re-tune) |
| 3a repertoire | 2 secondaries, 3 thirds | above |
| 4 versions | 24 | above |
| 5 perpendicular | not measured (readings share ≤ 1 cell) | |
| 6 adversaries | none yet; candidates: a spread rule (the row's biggest at most k × its smallest) against one-big-number rows | |
| 7 new kind | primes ending in k: shares the line pool's prime families' kind, new on grids | |
| 10 bump | **passes**: median 89–90%, additive worst 67% | table above |
| 12 card | short, school vocabulary plus "prime" (explained) | |
| 8 reach | greedy from law draws: 9–20.5 bits (the 20.5 a swap windfall); planned climb ~13–15 bits on a seat's income | |
| energy gate | (see message) | |
| formula attack | the best board for an energy E is written by a formula (the biggest affordable prime, exact column), but its height is set by energy, as on lines | |

Not built in the repository: it needs a new grid variant (uncapped cells, a new law) in lib/v2-grid, which is the grids
session's, and the owner's say on changing the board.
