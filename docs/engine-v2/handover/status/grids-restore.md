# Status: grids session (line ladders, then grid game v1 parity), archived 20 Nov

Session `session_0119hWTWBpYrSNsA1XDN3L3z`. Written from the session's own context, without new investigation. Labels:
**built** (merged and tested), **seen narrowly** (measured once or on one branch), **guess**.

## 1. What I was asked to do

- **15 Nov:** redesign three beginner line families (Ruler, Square Area, Pythagorean Area) as window ladders against
  `design-principles.md`. Each needs plain-sentence cards, at least 4 instances, named opponents, an energy gate of
  35 bits or less and balance under 1.5. Then give each a repertoire of 3 or more secondaries (row 3a).
- **16 Nov, the coordinator relaying the owner:** stop the line work. Make the v2 grid game match v1 (the old game is the
  spec): compare the two item by item, then restore what is missing, most visible first. Play Grids · beginner end to
  end.
- **16 Nov, about 02:00 UTC:** the owner paused all scoring and costing work. Finish the v1 family ports; hold the moves
  and the law change.

## 2. Merged, and unmerged

**Merged into develop (built):**

| PR | What |
|---|---|
| #841, #846 | Pythagorean Area as a ladder |
| #853, #860 | Ruler as a ladder, with its card |
| #902 | Grids · beginner: big-on-top, ones and prime-strangers undealt (cheap peaks of 37–45 bits) |
| #914 | glossary stays closed (`view.closeGlossary`); AI turn always reschedules; What-if picks cells by name; `game.get` reports settled energy |
| #917, #976, #979 | `docs/engine-v2/grid-v1-v2-compare.md`, and the known reachable tops (Leapfrog, Two Pair, Mirrormancer) |
| #923 | duplicate exemptions removed |
| #934 | no drift on the beginner grid (v1 had none) |
| #1045 | Grids · arithmetic withdrawn: Divisibility's top boards are found by lattice reduction (call 39) |
| #1083 | Mirrormancer and Magic Eighteen deal v1's rows or columns axis; v1's "different" guard on `mirror-other-way` |
| #1108 | v1's 13 numbers-only grid families ported; 9 dealt in grids-more-rules |

**Unmerged (pushed branches, no open PR):**

| Branch | SHA | What |
|---|---|---|
| `claude/grid-v1-moves` | 9261af5b9 | `tally.swap`, `windows.turn`, `rings.add`; `cells.trade` built but held off the menu (Two Pair/apart reaches 53 bits for about 125⚡) |
| `claude/square-area-above-1` | 0d60ba96c | Square Area ladder, "a square above 1", balance 1.21 over 48 games; PMI not regenerated, so rule-check fails there |
| `claude/ruler-repertoire` | 9f495a63 | 4 Ruler secondaries: near-miss dealt; closeness, reading-at-index and shared-factor undealt |
| `claude/ruler-semiprime` | b37743fe | WIP: Ruler on a product of two equal-length primes |

## 3. The plan I had not finished

1. Land `claude/grid-v1-moves` once the law question is settled, then re-run the energy gate and the grid e2e. The e2e
   failed only on Convex 1 s query timeouts under load (seen narrowly).
2. Redesign Two Pair so that `cells.trade` can be dealt, or keep it held.
3. v1's colour, card and size boards are in `lib/v2-grid-boards`, owned by the boards session; not mine.
4. Repertoires of 3 or more secondaries for every grid family: grids are below row 3a. The design session owns the
   grid rule shape.
5. Square Area: regenerate PMI and merge, if line ladders survive the rebuild.

## 4. Obstacles, and what the docs may not say

- **Bounded grid mains have reachable tops** (seen in play): Leapfrog, Two Pair and Mirrormancer. v2 reaches them far
  more often than v1 did, because stationary-law births are mostly 0s and 1s (P(0) ≈ 0.30), not uniform digits.
- **Value tops are extrapolated.** Where no sampled board reaches main 0, bits at the top come from the main part's
  tail. A secondary guard changes the order between boards but not their bits there: Mirrormancer's constant board
  is 17.75 bits before and after the guard (seen narrowly).
- **Births and moves** (contradiction, unresolved): the moves worker first said the birth walk draws from the move
  list, so adding moves changes newborn boards and the law. Later it said values depend only on the board settings
  (`v2-valuation/src/keys.ts`), and two rebuilt files came out identical. Verify before trusting either.
- **Divisibility** goals on readings that are linear in the digits fall to LLL/BKZ in seconds (CVP on W·d ≡ 0 mod q^e).
  Avoid such goals for grids.
- **Equal opportunity under the law:** Constellation's ten stars, and Bingo's called sets, are not peers under the
  stationary law. Deal one instance, or measure first.
- **Tooling:**
  - The machine ran at load 20–22 on 4 cores. v2-agents failed widely on 2000 ms limits; rerun single files.
  - Background job limits and out-of-memory errors killed tension and PMI runs. Run them one after the other,
    detached.
  - A fresh worktree needs `pnpm install` and `lib/v2-sandbox/dist/python-runtime.bin.gz` (copy it from another
    worktree).
- **EXEMPT maps fail on stale entries by design.** Two sessions exempting the same key produced duplicates; check
  develop's map before adding.
- **dynamics.test "94% two-state cycles"** comes from bases older than #959; it passes on later develop.

## 5. Obsolete since the 16–17 Nov scoring rebuild (guess: I paused before reading it)

- Every gate figure in bits above (35-bit limit, 53.3, 45.0 and so on) and every value file, if utilities are now one
  number and energy is bits of surprise.
- Window ladders with `digitLevel` (Ruler, Square Area, Pythagorean Area), and the tie-breaker restart rule. These
  probably need re-expressing in the new utility.
- **Likely still valid** (guess): the v1-parity inventory, the family ports' logic and cards, the move definitions,
  the lattice finding, the reachable-top findings, and the #914 app fixes.
