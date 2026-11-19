# Status: the old game's other grid boards on engine v2 (boards worker, 15–16 Nov 2026)

Labels: **built** (merged and tested), **seen narrowly** (measured under stated assumptions), **guess**.

## 1. What I was asked to do
Restore v1's other grid boards (archive/engine-v1: 4×4 digits rgb "First steps"/"Annotated colours", 5×5 rgby "Classic",
6×6 hex rainbow6 "Big board", 7×7 cards rainbow6 "Master") on the v2 engine, one board at a time, each complete:
object type, law, moves, v1's rule families ported as v1 had them, value functions, starters, gates, a non-default
preset, and a real game played end to end. Coordinator's call 37 (owner-decisions.md): ship them as an original-rules
baseline, with each failure of design-principles.md recorded as a dated exemption, never silently.

## 2. Merged and unmerged
- **#919 (built)**: `lib/v2-grid-boards`. Types board4…board7, one per size because representations name cells. There is
  one seeded variant per size. The wire is v1's (`7R,3G/…`; cards `KCV`). Colours share one palette (R O Y G B V P), so
  the wire needs no variant. The law is a product over cells: a number costs ½ bit a unit, colour and suit are flat.
  Moves are v1's invertible ones (add, swap whole/colours/numbers, slide, reverse, swap lines, spin, rainbow step, trade
  colours, card suit), each checked for an exact potential.
- **#929 (built)**: call 37 recorded in owner-decisions.md.
- **#925 (built)**: "Grids · original colours" (preset `grids-original-colours`, variant board-4-base10-rgb). It deals
  v1's 8 colour families: Chessmaster, Parity Painter, Colour Mirror, Picture Frame, Colour Bonds, Honest Minesweeper,
  Kingdom, Set Spotter.
  - Values: 49 value functions (`value-board.ts`, plain draws from π).
  - Agents: starters in TS and Python (`lib/v2-agents/src/board-starters.ts`).
  - Views: `GridScene.cellColours` and `cellGlyphs`, drawn by v2-views grid.tsx.
  - App: setup words, act and public log, Watcher, noun "grid".
  - Tests: `e2e:grid-game` with `GRID_SETUP=grids-original-colours` passed at desktop and phone.
- **Branch `claude/boards-v1-numbers` (no PR, unmerged)**:
  - v1's 12 number families, ported as `original-*` ids (files `v1-numbers-a/b/c.ts`, agents `board-catalogue-a/b/c.ts`).
  - Registered on the boards and added to the preset.
  - Hand tests and both-language agent scores pass.
  - Its first commit also adds the swap/turn knock table to grid-v1-v2-compare.md. That commit is not on develop.
  - Not done: the preset test still expects 8 families; there are no values for the 12 families; the gates have not
    been run on them.

## 3. Unfinished plan (next steps, if anyone resumes)
1. On the branch:
   - Fix the preset test.
   - Generate values: `pnpm --filter @workspace/v2-valuation values -- --variant board-4-base10-rgb --family <id> --all-params --write`.
     Run families in parallel processes; about 50 s per rule.
   - Run `node scripts/gen-v2-values.mjs` in artifacts/engine.
   - Run the energy gate, v2-params-equal (Magic Accountant's 14 targets will differ: deal one, as Picture Frame does)
     and v2-rule-check (add "grid baseline" exemptions plus RULE_FORMS entries).
2. Classic 5×5 rgby: values and preset for the families v1 dealt there. Several v1 families require an even side or ≤ 4×4.
3. 6×6 hex rainbow6, then 7×7 cards: card families (card_windmill, royal_court, court_parade, warm_hearts…) are not ported.
4. Of v1's 116 families, about 60 more colour families (First steps' full pool) are unported.

## 4. Obstacles and lessons not in the docs
- **Family ids are one global namespace** (deal.ts FAMILIES, starters dispatch). Board families are therefore one
  object shared by all sizes, reading n from `ctx.variant`. The uniqueness test now counts distinct family objects.
- **Card parameter substitution (built)**: v2-views `withParams` replaces any one- or two-letter param key wherever it
  appears as a word ("like a chessboard" became "like red chessboard"). Keep keys longer than two letters; a test
  enforces it for boards.
- **Equal opportunity (built)**: colour peers differ only by sampling noise. Value the colour-renamed canonical twin
  instead (`canonicalColours`). Symbol peers genuinely differ in worth, so deal one.
- **Honesty (built)**: bounded v1 tops are rarer than 2M draws reach. A test checks that the tail never pays more at the
  family's top than the exact count wherever the top is countable; it underpays. The energy gate (seen narrowly, greedy
  climber, 3 births) failed only Picture Frame symbols 0–2: tops of 35–41.5 bits for 88–235⚡.
- **Hard-coded `type.id === "grid"` checks**: across the app and agents (feed, watcher, heldReason, check.ts,
  deal.ts isGridVariant…). I patched the ones I found. Guess: an ObjectType noun/kind field would remove the class of bug.
- **Knocks (seen narrowly, 400 good states each)**: a free swap or turn keeps a median of 100% of the bits for 6 of 8
  colour rules. Colour Mirror is the exposed one: 55–66% kept.
- **Tooling**:
  - The Python runtime needs `pnpm --filter @workspace/v2-sandbox setup:python && build:python` before the agent tests.
  - The local engine (`pnpm --filter @workspace/engine dev`) dies at the 30-minute background limit.
  - Agent test probes must stay under 16 KiB.
  - The shorthand-symbol lint rejects ♠♥♦♣ in agent source (use \u escapes).

## 5. Obsolete since the 16–17 Nov rebuild (one-number utilities, energy as bits of surprise)
- Guess, from CLAUDE.md as re-read only: all tie-breaker shapes are obsolete (decision 50: one utility per rule, no
  tuples). That covers the ported "secondary points", the starters' `[main, tie]` scores and rule-check row 3a.
- The value functions (survival-based knots and tails) and the energy gate's 35-bit test probably need redoing under the
  new energy model.
- What should survive: the board types, wire, law, moves and view colours.
