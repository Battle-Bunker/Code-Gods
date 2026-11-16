# Walk-through 1: Round Halves (the 4×4 digit board, nearest-target shape) — prototype, undealt

## The card (version: 3s, halves)

> **Round Halves (3s).** Read the top half of the board (rows 1 and 2, left to right) as one 8-digit number; the bottom
> half the same way; the left half (columns 1 and 2, top to bottom) and the right half the same way.
> Round each number to the nearest multiple of 729 (729 = 3×3×3×3×3×3; a number under 365 rounds up to 729, never
> to 0).
> **First:** how many *more* times 3 divides each rounded number, beyond those six, added up. More is better.
> (52,612,659 = 729 × 3 × 3 × 3 × 3 × 3 × 3 × 3 × 3 × 11 has 8 more.)
> **Second:** how far each half is from its rounded number, added up. Smaller is better.
> **Third:** divide each rounded number by all its 3s and look at what is left (11 above). The top half's and the bottom
> half's leftovers should be as close in size as possible, and so should the left's and the right's, counted in doublings
> (11 and 22 are one doubling apart, 11 and 44 two).

Points (the spec lead's option b): the rarity of the first number, plus the rarity of being that close, plus the rarity
of the third.

## Three boards (rows separated by /)

| board | the four halves → rounded | tuple | bits (first + second + third) | why |
|---|---|---|---|---|
| 0402/1145/1104/2150 (a law draw) | 4021145→4021164 (0 more), 11042150→…163 (4 more), 1124111→…118 (1), 4052540→…511 (1) | (6, 68, 6.7 doublings) | 19.6 (4.7 + 14.2 + 0.7) | one lucky half; points mostly from closeness |
| 5311/1312/1415/2100 (greedy climber's best, 74⚡) | 2, 3, 2, 4 more | (11, 107, 8.9) | 23.0 (11.0 + 11.6 + 0.4) | climber stuck after 5 moves |
| 5261/2565/6696/1565 (lattice formula, seconds) | every half → 729 × 3⁸ × 11 or × 14 | (32, 190, 0.7) | 56.6 (42.3 + 8.3 + 5.9) | transpose-symmetric board: the left half equals the top half, so 4 readings become 2 |

## What a cheap move by another player does (from the 56.6-bit board)

| move | tuple after | bits kept |
|---|---|---|
| +1 to a cell in the last two places of both its halves (r2c2, r4c4) | (32, ~14–390, …) | 93–126% |
| ±1 to any other single cell | (16, ~450, …) | 35–39% |
| ±1 to a whole row or column | (8–11, …) | 13–29% |
| tilt a row or column | (8–27, …) | 23–74% |
| ±1 to a corner box | (16, …) | 35–43% |
| balance (move 1 to the opposite cell) | (0–16, …) | 11–43% |
| swap two cells | (8–20, …) | 16–52% |
| reverse or rotate a row/column | | median 25–26% |
| turn or flip the board | | median 16% |

Over four good boards: median kept 35% (single-cell ±1 60%), worst 5%. Fails row 10 (guide: at least half).

## Alternatives

Secondary: closeness is the only natural one (counting it in digits ranks the same). Thirds, each read from the rounded
number: (A) opposite leftovers close in doublings (above); (B) each leftover close to a power of 2, in doublings;
(C) the leftovers' digits added up (Divisibility's): bounded, every search saturates it at 18.6 bits: not recommended.
Versions: 3s with 729 or 7s with 343, on halves or on odd/even rows and columns: 4.

## Check table

| row | result | evidence |
|---|---|---|
| 1 unbounded | **fails**: a board of 16 digits has a top (40 more for 3s) | annealing reaches 20–24; lattice reduction reaches 32 in seconds |
| 2 ladder climbed | doubtful | the gate's greedy climber stalls at 17–23 bits after 3–6 moves (23–74⚡): rugged, not a climb; seated play not run |
| 3 tied | yes | the third reads the rounded number's leftover; a level up changes it |
| 3a repertoire | 2 good thirds + 1 weak | above |
| 4 versions | 4 | above |
| 5 perpendicular | not measured | |
| 6 adversaries | none named | the grid pool has no family opposing powers of 3 |
| 7 new kind | **no**: same kind as Divisibility (powers of a small prime) | it is Divisibility recast, a replacement not an addition |
| 10 bump | **fails**: median 35% kept, worst 5% | table above |
| 12 card | long but exact; the view must show the four rounded numbers | |
| 13 rationals | n/a: the board holds digits | |
| 8 reach | greedy 17–23, annealing 30–36, lattice 56.6 bits | the lattice board is ~460⚡ from a law draw (a grid seat's income: 2,530⚡) |
| energy gate | passes formally (its greedy climber stalls under 35) | but search, not energy, is what limits a grid |
| formula attack | **fails** | lattice reduction (fpylll, seconds) |

## Same attack on the dealt Divisibility (arithmetic preset)

Lattice reduction finds 46 powers of 3 on halves (board 1110/1212/1116/0261, transpose-symmetric, no repeated rows)
where grid-params.md §14 reports search finding 28–40 of a bound of 52–64; 22 powers of 7. Any divisibility goal on
readings that are linear in the digits is a set of linear congruences, which lattice reduction solves, and a symmetric
board halves the number of readings.
