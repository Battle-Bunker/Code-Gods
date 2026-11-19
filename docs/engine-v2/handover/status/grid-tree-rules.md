# Status: grid rules in the owner's tuple (tree) shape — worker session, 16 Nov 2026

Labels: **built** (code or measurement I ran), **seen narrowly** (a few boards or runs), **guess**.

## 1. What I was asked
Design grid rule families in the owner's nearest-target tuple shape (design-principles.md 3b): primary = level of the
nearest target to a reading, secondary = closeness, third = another dimension tied to the target. Prototype undealt,
send walk-throughs, say plainly whether the 4×4 digit board can carry the shape. Later: build a non-default preset
"Grids · big numbers" (uncapped cells), then paused by the owner (16 Nov ~02:00 UTC) and archived.

## 2. Merged / unmerged
- Merged (docs + Python scripts only): #1013 and #1073, `docs/engine-v2/grid-tuple-rules/` (README, round-halves.md,
  prime-rows.md, knocks-and-locks.md, scripts/*.py).
- Unmerged: branch `claude/grids-big-numbers` (no PR). `lib/v2-grid/src/big-numbers.ts` (Prime Biggest Four, Prime Rows,
  tree valuation flag), `big-numbers-type.ts` (own object type `grid-big`, variant `grid-4-big`, field φ = g·v + log2 Z,
  g = ¼), tests `lib/v2-grid/test/big-numbers.test.ts` (7 pass), `lib/v2-valuation/src/value-big-grid.ts` (tilted law
  draws + buildTree), registry entry, scripts `lib/v2-valuation/scripts/big-try.ts`, `big-gate.ts`. Root typecheck
  NOT run on it. **built**

## 3. Unfinished plan (if anyone resumes)
1. Settle the price of height with the gravity session (weight w energy per bit of φ, or α < 1). It decides the gate.
2. Run root typecheck; value files for both families; lookahead starters (agents session pattern).
3. Energy gate, rule check table (design-principles.md), table simulation in the preset; redo lock costs by the
   revised locks.md (predicate as program: description length + information read).
4. Phone display: renderer is `lib/v2-views/src/render/grid.tsx` (grid-annotations session); "12k" above 10,000.
5. Walk-through to the coordinator before dealing; the preset entry is one line in `lib/v2-grid/src/presets.ts`.

## 4. Findings and obstacles (not all in the docs)
- **built** On the capped digit board energy protects nothing: a seat earns 2,530⚡, a unit move ~8.4⚡, any board is
  300–460⚡ from any other. Only search difficulty protects a top.
- **built** Size primaries have a findable top on capped digits (write 9s); precision primaries (powers of q in long
  readings) are fragile in leading digits (Round Halves keeps a median 35% after a cheap bump).
- **built** Lattice reduction (fpylll LLL+BKZ, seconds) solves divisibility on digit-linear readings: dealt Divisibility
  (powers of 3, halves) reached 46 vs the 28–40 search had found; it exploits transpose-symmetric boards (4 readings
  become 2). Any rule that is a linear congruence in the digits is exposed.
- **built** Under the old option (b) tree valuation, cheap layers (closeness on low digits, a bounded digit-sum third)
  are farmable: search took most bits from them, not the primary. The 2-bit inner cap was the fix in tree-value.ts.
- **seen narrowly** Rearrangements (swap, rotate, reverse, turn) are 80–96% of damaging cheap knocks on position-read
  rules; they are level in φ, so repair costs the same as damage. Reading the multiset (four biggest numbers) makes the
  first two layers immune; position-rich rules need locks (floor lock "row ≥ 117 and col ≥ 117" ≈ 6.7 bits, old costing).
- **seen narrowly** With φ = g·v (α = 1) the level's bits are linear in size (~0.2 bit/unit at g = ¼): a straight
  hill. Bits on a whole income ≈ E·g/(8.4 + w·g): ~73 at w = 1, ~19 at w = 100.
- **seen narrowly** Greedy climbers stall at 4–13 bits on prime-target rules: the next prime is a valley away
  (closeness lost first). Same as Prime Intercept on lines.
- Tooling: Python greedy/gate scripts with ~1,500 moves per step are slow (hours); TS gate on the real types is
  faster. Several background runs hit timeouts without output: print per start, flush.
- Code: `makeGridType` rejects cap > 9; `codeConstant` loops to cap; uncapped cells need their own type (grids session
  agreed). `encodeGrid` already writes commas for wide cells. `gridValueFunction` has no tree or tilts; I wrote a
  separate value function.

## 5. Obsolete after the 16–17 Nov scoring rebuild (one-number utilities, energy as bits of surprise)
- **guess** The tuple/tree valuation (option b, tree-value.ts, `valuation: "tree"`) and every bits figure computed with
  it, including the walk-through tables, are obsolete if utilities became one number.
- **guess** Energy prices (8.4⚡ per unit, surcharge = growth of read length) and lock costs may have changed; the
  structural findings (digit board too small, lattice attack, rearrangement knocks level in φ, multiset readings immune)
  should still hold because they do not depend on the valuation.
