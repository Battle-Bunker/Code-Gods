# Knocks, φ and locks on the uncapped board (second round, 16 November)

The coordinator's criteria: a rule's value rises with something that costs energy; report the share of cheap knocks
that are sideways in φ (the undo costs the same), the bits they destroy, and which knocks only a lock can stop. φ here is
Σ v^α per cell with g = 1 (α = 1 and ½ give the same picture), a stand-in for the gravity session's constant field.
Scripts: `scripts/edges.py`, `scripts/big4.py`, `scripts/lockI.py`.

## Prime Rows (position in the main part)

Two good boards (131 and 271 in the top row), all cheap moves of size 1 (199–216 per board):

| | top row | best of the four edges |
|---|---|---|
| sideways in φ | 66–75% of all moves | same |
| damaging (under 75% kept) | 40–51 | 33–48 |
| of them sideways | 80–96%: swaps 21–33, rotations 7–10, reversals, turns | 82–96%: no turns |
| median kept by a damaging sideways knock | 29% (131), 72% (271) | 66%, 72% |
| damaging and downhill in φ | 1–4 | 1–3 |

So repair is not dearer than damage for most knocks: the undo of a permutation is the same permutation's price.

**The lock that defends it** (`docs/engine-v2/locks.md`, information content by law draws, 4M here):

| predicate (131 board) | bits | stops |
|---|---|---|
| top row ≥ 117 (the prime's range) | 4.8 | the big number leaving the row; takes below the floor |
| top row ≥ 117 and left column ≥ 117 | 6.7 | the same for the row and the cross column |
| big cell ≥ 119 | 6.9 | takes from the big number (not moves of it) |
| top row = 131 | 11.9 | every change of the row's total |
| top row = 131 and left column = 131 | 17.6 | everything the rule reads (15.3 bits) |

At one energy per bit to make and a full re-payment per 240 s, the 6.7-bit lock costs 6.7 + ~17 over a 600 s game,
about two single-cell moves, and protects the level; closeness and the third (≤ 10 bits) stay open to moves inside the
range. A vandal drains whatever the defender funded, so defence and attack trade one for one.

## Prime Biggest Four (rearrangement-proof)

Card: "Add up the four biggest numbers on the board. Find the prime ending in 1 nearest that total. First: that prime,
bigger is better. Second: how far off, closer is better. Third: the row holding the biggest number should total as
close to that prime as possible."

On the same two boards (not re-tuned for it): 9.8 and 8.6 bits. Sideways knocks keep a median 100%, worst 48–58% (only
the third reads position); damaging moves 44 and 10, all sideways and all in the third; downhill damaging 0. Law
draws: median 3.3 bits, top 10% at 6.9 or more, top 1% at 12.1. Taking from a big number is downhill in φ, and its
repair costs more.

## A mixed pool

Keep both kinds (the coordinator, 16 Nov): rearrangement-proof families whose first two layers read the multiset of
numbers, and position-rich families whose intended defence is a lock. If every family read only the multiset, position
would stop mattering and grids would lose what makes them grids.
