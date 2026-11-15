# Mirrors, mirror peers and the tug of war (15 November)

The coordinator's questions after #855 widened the line starters' search (mirrors, slides, pivots and moves along an
axis):

1. Did the per-family gain table and the energy gate move?
2. The agents session's question: Prime Landing and Prime Gradient deal each ending on both sides, and the two sides
   are one 5⚡ mirror apart. Does a single seat get rungs it did not climb, and do the mirror peers halve the ladder's
   cost?
3. Is the repeated mirror income without climbing? Three remedies were proposed:
   - (a) measure the reflections' share of flips and gains;
   - (b) read the size of the number regardless of sign;
   - (c) charge reflections trial 29's shortcut floor.

Analysis only: no game logic changed.

Every play number below comes from `lib/v2-agents/scripts/pool-dynamics.ts` on line-q. The settings are its defaults:
20 games, 600 s, 3 objects, a birth every 240 s, drift 120 s and the simple starters. The seeds are the same in every
row, so the deals match.

The new `tug:` line counts these:
- **Flips:** a move that puts an object back to its state before another seat's last move on it, as `table.ts` counts
  them.
- **Repairs:** a reflection that raises its mover's bits right after another seat's move on that object lowered them.

Its `--no-mirror` option takes reflections out of every seat's search. The single-seat measures come from
`lib/v2-agents/scripts/mirror-peers.ts`.

## 1. The gain table and the energy gate after #855

| run (develop at #860 unless named) | balance (best family's mean gain ÷ worst's) | moves | flips | objects changed per minute, by third |
|---|--:|--:|--:|--:|
| starters as before #855 (the rest of develop unchanged) | 1.6 | – | per seat 7 to 30 | 2.35 / 1.33 / 1.55 |
| starters since #855 | 2.0 | 3,260 | 2,125; per seat 16 to 77 | 2.70 / 2.38 / 2.42 |

No family left the band at these settings:
- Pythagorean Area rose most, from 281 to 400.
- Divisibility Ladder (2 games) and Square Area (3 games) stay at the bottom with few seats.
- Same on Both Rulers is at 204, against 217 before #855.

So its runaway (688 points, balance 5.7) belongs to the settings of the coordinator's run, not to the starters alone.
Flips more than doubled with #855.

**The energy gate** (`artifacts/engine/test/unit/v2-no-straight-hill.test.ts`) now searches the whole beginner menu:
mirrors, slides, pivots, moves along an axis, steps and nudges beside the shortcuts, shifts and tilts. It passes on
develop.

Against #855's own base, the wider menu exposed three runaways:
- Ruler's far tie-breaker on lenses: 42.7 bits by doubling zooms;
- Whole Answer south-west: 41.4 bits;
- Right Angle corner-steep: 38.4 bits.

#853 and the pairs changes on develop removed all three before this branch.

## 2. Mirror peers (Prime Landing, Prime Gradient)

**On law draws (births), one mirror raises a seat's bits on 60 to 68% of lines.** The mean gain is about 2 bits for
5.2⚡. The rate is the same on side +1 and side −1 to within a point, because the law is symmetric.

**In play, no end line sat on a rung of the peer** (the other side, one mirror away). That held for every instance, at
8 tables each. Births and the other families never park lines one mirror from a seat's own rung.

**Mirrors make the first rung cheaper but do not halve the ladder's cost.** The test is a greedy climber from 40 law
draws per instance, with a 2,500⚡ income, with and without the mirror move.
- Prime Landing's median energy to its first rung: 33 against 49, 33 against 37, 64 against 79, 54 against 68.
- Prime Gradient's: 47 against 57, 50 against 58, 44 against 58, 48 against 59.
- The second rung is reached no more often with mirrors.

The peers do not make this possible: the mirror move exists whether or not peers are dealt. A seat on side +1 uses it
the same way.

## 3. The tug of war

The score is the standing at the end (spec §8). A seat's bits are a function of the line, so a reflection that undoes
another seat's move only recovers what that move took. A tug of war is income only if it raises the standing at the
end.

| run | balance | reflections in moves | flips (of them reflections) | movers' bits gained (by reflections) | repairs after another seat's reflection / after any other move | objects changed per minute, last third | energy gate |
|---|--:|--:|--:|--:|--:|--:|---|
| starters since #855 | 2.0 | 23% | 2,125 (25%) | 9,515 (27%) | 557 / 36 | 2.42 | passes |
| no seat reflects (`--no-mirror`) | 1.6 | 0% | 2,100 | 6,490 | – | 2.23 | – |
| (c) reflections pay trial 29's floor | 2.2 | 10% | 2,090 (9%) | 8,597 (13%) | 195 / 36 | 2.17 | passes |
| (b) Prime Landing, Prime Gradient, Treasure and Same on Both Rulers read the size, either sign | 1.9 | 5% | 1,811 (4%) | 7,261 (3%) | 77 / 12 | 2.00 | passes |

Row (b) is an approximation. The mirror instances (side −1) kept their value files, which were measured for the signed
reading, so their bits are off by about one bit. That is enough for dynamics, not for shipping.

Main-part levels per object climbed stay at a median of 2 in every row.

Readings:
- **Reflections are the cheapest weapon in the tug, not its cause.** With no seat reflecting, flips are 2,100 against
  2,125. The flips that #855 doubled come from its other one-step moves (slides, pivots and moves along an axis).
- **Repairs answer reflections, not tilts across a pole.** 557 of 593 repairing reflections came right after another
  seat's reflection. 36 came after any other move. The sign repair after a tilt across a pole is real but rare.
- **(c) barely changes the price of an ordinary reflection.** On law draws the floor leaves the median at 5.2⚡ (9.7⚡ at
  the 90th percentile, against 6.2⚡ without it). It bites only on the big lines that play reaches, so reflections
  halve, but flips do not fall.
- **(b) removes most reflections and 15% of flips.** One seat stretched one object 71 times in a row in that run,
  against at most 14 in the others. That needs a look before (b) ships.
- **The counterfactual for one seat** (`mirror-peers.ts --without-mirror`, the same 8 tables per instance): Prime Landing
  ends 1, side +1, ends with 179 points with mirrors and 169 without, and the other seats get 178 either way. 211 of its
  231 raising reflections answered another seat's reflection, 132 of them Same on Both Rulers'. The mirror pays this
  seat about 6% at no cost to the others. The other instances' runs were still going when this was written.
