# Status: engine-v2 spec lead and line-pool integrator (session_0119hWTVnaYv8jrjM9WmstDD)

Written 19 Nov from my own context, with no new investigation. Labels: **[built]** = merged and tested; **[seen]** = measured
narrowly (one script, a few seeds); **[guess]** = my reading, not checked.

## 1. What I was asked to do
- Lead the engine-v2 spec. Later, also integrate the beginner line pool as tuple rules: the owner's principle 3b, "nearest
  target, then closeness, then a third dimension", aiming at 12 families (decision 46).
- On the coordinator's calls of 15–16 Nov:
  - bound the tree valuation's inner terms;
  - add floors where a cheap move left a rule undefined;
  - write a walk-through per family before anything was dealt;
  - review the locks spec (#1015);
  - check the dealt pool under the gravity worker's size-only code before that code merged.

## 2. Merged and unmerged
- Merged into develop, 15–16 Nov, all **[built]**:
  - #887: "secondary preference" wording.
  - #893, #912: rule-check exemption maps, the row 10 test, the dynamics test.
  - #904: Divisibility Ladder undealt.
  - #905, #946: pool-plan.md.
  - #930.
  - #959: the dynamics test plays 4 games.
  - #985: tree-value.ts.
  - #1000: the seven tuple families (`lib/v2-linear/src/tuple-rules.ts`).
  - #1007: `valuation: "tree"` contract.
  - #1029: TREE_INNER_BITS = 2, recorded as call 38 in owner-decisions.md; flat-line floor.
  - #1056: tailKnots suffix sums (fixes a ~997-bit cancellation); Rulers parallel floor.
  - #1063: tuple marks drawn without reading `cart` (the #1022 route); flat lines marked on the y-axis.
- Unmerged: the branch `claude/engine-v2-spec`, one WIP commit, not for merge, no PR:
  - env-gated (c′) and two-sided surcharge pricing in walk.ts (`V2_PSI_PAR`, `V2_KAPPA`, `V2_ABS`);
  - tree-cap knobs;
  - copies of two fraction families;
  - raw tables in `docs/engine-v2/wip/`.
- Lost: the level-tail code (fitted empirically past the measured levels) was never committed. The local branch `repertoire`
  (parked whole-number secondaries) was not pushed and conflicts with row 13.

## 3. Unfinished plan, as next steps (all moot if the scoring was rebuilt)
1. Check the dealt pool under the size-only code (energy gate, v2 rule check, `lib/v2-agents/test/dynamics.test.ts`,
   bits ≤ φ, `gen-v2-values.mjs --check`) before that code merges.
2. Level tail for tree values past the best sampled level (decision 26). Fit it from the law's own draws, so it follows
   any code; test bits ≤ φ.
3. Re-run the per-family walk-through (card, three example lines with tuples, what each cheap move does), using W2's
   starters (#1060) as the climbers, not my one-step greedy harness.
4. Re-read the cheap size of Ruler and Power Area under the new code: 25 bits for about 700⚡ under the factorisation
   code **[seen]**. Then decide about an adversary.
5. Whole Crossing (tuple): a cheap move keeps a median 54% of its bits (worst 13%), and only 7 targets have enough
   draws **[seen]**. Redesign it or use a coarser ladder.

## 4. Obstacles and lessons the docs may not hold
- **Importance weights cancel.** Never compute P(V ≥ v) as W − (weight below): at the rare top it cancels to 0 and reads as
  ~1,000 bits. Sum from the top **[built]**.
- **The tree level stops at the best sampled target.** But with 200k draws per tilt the levels reach 10¹⁵–10³⁴, so the
  8–11-bit stalls I first blamed on this came from my climber: one step ahead, arguments up to 12 **[seen]**. Check what
  your climber can reach before blaming the valuation.
- **Lexicographic rarity makes secondaries worthless** (under 0.5 bit). **Chain-rule rarity makes an exact hit dominate**
  (4–14 bits of closeness, climbs stop at the first hit). A flat cap of 2 bits per inner part kept climbs going: Mixed
  Intercept went 28–43 levels up **[seen]**. Grading closeness in units of the gap, or any smooth regrading, changes
  nothing, because the tree pays by rank. Only ties or caps change the bits **[seen]**, as fraction rules B also found.
- **Poles.** Every reading undefined on some line (flat, vertical, parallel to y = ±x) gives a one-move knock to nothing.
  Give it a fallback reading, such as |c| **[built]** for the tuples.
- **Tooling.**
  - A fresh worktree needs `pnpm install` after develop adds a package; v2-grid-boards broke 10 engine tests until then.
  - Root `pnpm run typecheck` rebuilds a stale v2-core dist.
  - The v2-agents parity tests need the Python bundle that CI builds.
  - Never use git inside copied directories; they share the index.
- **The lookup sees a score, not a state.** A φ(state) clamp must sit at the 5 lookup call sites (convex `v2/values.ts`
  ×2, agents `host.ts` ×2, `harness.ts`). A helper is the clean way **[guess]**.

## 5. Obsolete after the 16–17 Nov rebuild (one-number utilities, energy as bits of surprise)
These are **[guess]**: I paused before the rebuild and have not seen its code.
- **Likely obsolete:** everything tuple-shaped:
  - `tuple-rules.ts`;
  - tree-value.ts and TREE_INNER_BITS;
  - the `valuation: "tree"` contract;
  - the walk-throughs;
  - the flat and parallel floors as tuple readings.
- **Likely obsolete:** the patches I listed to the coordinator on 16 Nov, for scores and code lengths under the
  factorisation code:
  - the five tail branches, TAIL_FLOOR and TAIL_CEILING;
  - ladderCaps and TieBreakerLevels;
  - the shortcut floor (SHORTCUT_PHI 20, SHORTCUT_DOUBLING 3.5);
  - the measured which-code weights;
  - many rule-check exemptions (52), ROW10_EXEMPT (8), and the gate thresholds set just under the measured values.
- **Likely still useful:**
  - the exact-potential requirement on prices (a cycle sums to 0);
  - the suffix-sum lesson;
  - pole fallbacks;
  - the form registry idea (at most 3 families per kind);
  - the lesson that the climber, not the value, often limits what a gate sees.
- **The structural point I sent on 16 Nov.** If value is rarity and price is the same code length, profit is only the gap
  between them, and that gap marks predictable peaks. Any rebuild should be checked against this **[guess]**.
