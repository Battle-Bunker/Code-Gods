# Hand-over: tree-shaped families, the fraction-native / between-representations lens (16 November, 20:15 Melbourne)

Branch: `claude/tree-rep` (from `develop` at 2ef3ba28). **No code is written.** This file is the whole output: the eight
candidates, the design decisions and their reasons, what was learnt, and the next steps. The session was stopped by the
coordinator before the first family was built.

The brief (owner, 16 November): tree-shaped families "with multiple variants and interesting mixture of coverage of
integer and fractional values across multiple line parameters in multitude representations"; "large sets as parameters
not a finite number of discrete options"; rules "crafted with rationals in mind from the beginning"; a card a
12-year-old can score from; no cliffs. Deliverables: 8 candidates (done, sent 19:52), the best 5 built undealt in
`lib/v2-linear/src/tree-rep-*.ts` with tests, marks and a walk-through each in `docs/engine-v2/tree-families/<family>.md`,
one small PR per family, shown in the Line Rules Mirror. No dealing, no value files.

## 1. What must not be rediscovered

Each item is labelled: **C** true by construction, **N** seen in a narrow check (assumptions stated), **J** conjecture.

1. **(C) A "size of the nearest target" primary rewards its reading being big, whatever the parameters.** Draws within
   a family differ only in where the targets sit. So perpendicularity between draws lives in closeness and the thirds,
   never in the primary. (The coordinator has sent this to the owner.)
2. **(C) Within one primary value and one parameter set, every closeness that is a monotone function of the distance
   gives the same order.** "Distance in steps", "distance as a share of the gap", "distance in minutes" are not
   alternatives to plain distance unless the unit varies between lines that share a primary. Real second-layer
   alternatives are: (a) plain distance; (b) a bucketed distance ("within 1/8 scores 3, within 1/4 scores 2 …", as Plus
   Its Flip on `claude/frac-families-b`), which makes ties so the third layer decides among near-equals; (c) a unit that
   depends on the line (Borrowed Bottom's ruler steps, where the bottom varies at a fixed top). For most families the
   three required alternatives therefore belong in the THIRD layer.
3. **(C, hand-worked) A primary that grows with a bottom number can be inflated by one fractional nudge.** The
   number-theory session raised it; this lens's own example: Borrowed Bottom as first drafted (primary = the top of the
   nearest fraction to the y-intercept that has the gradient's bottom and ends in 37). y = (3/4)x + 137/4 scores top 137
   exactly. Tilt by 1/3: the gradient is 13/12, the ruler is twelfths, 137/4 = 411/12, the nearest allowed top is 437
   (437/12, 26/12 away). The primary went from 137 to 437 in one act, and a tilt by 1/1000 would multiply it by about
   1000. Whether that act is "cheap" depends on how a fractional amount is priced (`lib/v2-linear/src/mutators.ts`
   `amountCode`, `amountSize`: not read to the end), so the price is **J**; the jump itself is **C**. The coordinator's
   instruction: for families 1, 2 and 6 either show by a hand-worked line that a small nudge cannot raise the primary
   cheaply, or move the bottom into the target or the third layer and let the primary read a size; say which in the
   walk-through. Decisions taken are in section 3.
4. **(C) A ratio of two homogeneous readings of a line pins only the gradient or the x-crossing.** The y-intercept,
   the crossing, the legs, y(k) all scale together when the line is zoomed; area scales as the square. So "reading A
   near a drawn fraction of reading B" as a PRIMARY has a target that can be hit exactly (a bounded main part, fails
   principle 1). It is usable only as a third layer.
5. **(C) Whole numbers of the standard form (a, b, c) are fragile; their ratios are robust.** A nudge of the
   y-intercept from 5 to 5 1/7 turns (−2, 1, −5) into (−14, 7, −36). Rules on a, b, c as integers keep their value
   under unit shifts, unit tilts and reflections, and lose it under any fractional nudge. Read ratios (which are the
   gradient, the y-intercept and the crossing) and bring the whole numbers in as a third layer.
6. **(C) A locally finite target set is needed for "nearest".** Squares of fractions, sums t + 1/t, fractions with
   power-of-2 bottoms are dense: no nearest one. Usable fraction-flavoured sets: multiples of 1/B for one B; whole number
   plus a fixed tail; n + j/(n + d); a fixed fraction of the way between consecutive ladder numbers; whole multiples of a
   drawn fraction.
7. **(C) Egyptian Ladder (candidate 6) cannot be computed on an unbounded reading.** Sums 1/a + 1/(a+s) + … grow like
   (ln n)/s, so a y-intercept of 10 needs about 12,000 terms for a = s = 1 and one of 20 about 270 million, with exact
   bottoms of thousands of digits. It also means a unit shift multiplies the count by about e^s. Do not build it as
   listed. A bounded variant (reading a fraction part only) crowds toward whole numbers; not pursued.
8. **(C) Readings and their gaps.** The gradient and the y-intercept exist for every non-vertical line. The x-crossing
   does not exist for a flat line; the coordinator's earlier call (tuple-rules.ts `crossingOrHeight`) is that a flat
   line reads its height instead, so a tilt to flat is not a knock to nothing. Use that for every family that reads or
   borrows from the crossing. 1/|m| ("run per unit rise") is undefined at the very state a flatness goal climbs toward:
   avoid it as a reading.
9. **(N: read from `docs/engine-v2/fraction-families.md` on `claude/frac-bottoms`, tree values from about 650,000 law
   draws) What the paused fraction drafts found.** A size level is shallow (1 to 2.6 bits in all); exact hits are spikes
   and non-monotone in the level (Mixed Intercept: exact on 2 1/3 worth 7.3 bits, 5 1/3 13.8, 8 1/3 7.3, 10 1/3 22.7); a
   greedy climber stops at the first cheap exact hit; bottom-size readings (Repeating Bottom, Polygon Bottom) reached
   41 to 56 bits, over the gate. These depend on the current tree valuation, which is under reconsideration: they are
   not properties of the families.
10. **Plumbing found, so it need not be re-read.**
    - A tree family is `family(...)` from `layers.ts` spread with `valuation: "tree"` (`tuple-rules.ts` `tree`,
      `tupleFamily`). A dealt rule's layers after the main part are a string of layer ids joined by `>`
      (`TieBreaker`, v2-core `contracts.ts`); any chain evaluates.
    - The mirror (`artifacts/player-web/src/gallery/rules-mirror/pool.ts` `variantIds`) shows a tree family only as
      prefix chains of `tieBreakers` in order (`a>b>c`, `a>b`, `a`). A family with alternatives per slot needs to say
      which chains it offers. Proposed and not built: an optional `chains?: readonly string[]` on `RuleFamily`
      (v2-core), read by `variantIds` when present.
    - The mirror lists `family.dealable(lineQ)` as pills, so a large parameter set cannot be listed. Proposed to the
      mirror session (session_0119hWTUWcb54eAGGHQwmmqR, 19:58; no reply by 20:15): each family exports a
      `ParamSpace<P>` `{ size; draw(rng); parse(text): P | { invalid }; label(p); hint }`, collected in one map in
      `lib/v2-linear/src/tree-rep-index.ts`, or as an optional `paramSpace?` on `RuleFamily` if they prefer;
      `dealable` returns a short sample (about 8 sets) so the page works unchanged. Check their answer before building.
    - `lib/v2-views/test/annotate.test.ts` evaluates every line family with `dealable(lineQ)[0]` on a 200-step walk:
      every family must have at least one parameter set on line-q and must score (or return null) on every line,
      vertical and flat included. Use `onRationals(...)` so nothing is dealable on line-z.
    - Marks: `focus` (a read element), `candidate` (a target), `measure` (from, to), `note` (text), each with the
      layer's `term`. A mark on a representation outside `depends` is drawn and never read or charged (#1022), so mark
      on `cart` (`yAxisMark {y}`, `xAxisMark {x}`, `ghost {g}`, `yInt`, `xInt`) without adding `cart` to `depends`.
    - `families.ts` `families` is the one list (`lineType.families`); `test/rules-mirror-pool.test.ts` needs every line
      family listed once. Tuple starters live in `lib/v2-agents/src/tuple-catalogue.ts`; undealt families do not need
      an entry (the mirror's "dealt" test is starters plus a value file).
    - Hand-worked score tests: follow `lib/v2-linear/test/tuple-rules.test.ts` (`tuple(f, p, state)` via
      `evaluateSite(...).score` and `scoreToWire`; a "min" layer comes back negated).

## 2. The eight candidates

Common shape: **Primary** a property of the target nearest a reading, bigger is better; **Second** closeness to it;
**Third** another number of the line judged against the same target. "Size" of a reading means ignoring a minus sign.
Halfway between two targets goes to the bigger. A vertical line scores nothing.

### 1. Borrowed Bottom

*Idea:* one number of the line is measured on a ruler whose bottom number is taken from another number of the line.

*Card (gives = gradient's bottom, reads = y-intercept, ends = 37):* Write the gradient as a fraction in lowest terms and
call its bottom number B (a whole-number gradient has B = 1). The targets are the fractions with bottom B, in lowest
terms, whose top number ends in 37 (for B = 4: 37/4, 137/4, 237/4, …). Find the target nearest the y-intercept, ignoring
a minus sign. **Primary:** see section 3. **Second:** how far the y-intercept is from the target. **Third:** one of the
repertoire below.

*Parameters:* gives ∈ {gradient, y-intercept, x-crossing} × part ∈ {bottom, top} (a top used as a bottom: the
perpendicular line's gradient is the flip, so its bottom is your top; a top of 0 counts as 1); reads ∈ the other two
numbers; ends = any 1 to 3 digits ending in 1, 3, 7 or 9 (444). About 5,300 sets.

*Why a target always exists (C):* the ending is coprime to 10, so by the Chinese remainder theorem some top with that
ending is coprime to B. Search outward from reading × B.

*Second layer:* `near` (plain distance); `steps` (the distance counted in B-ths: |reading × B − top|, a real alternative
because B varies at a fixed top).

*Thirds:* `top-echo` (the giver's other number, its top when the bottom was borrowed, near the target's top);
`third-near-bottom` (the remaining number of gradient / y-intercept / crossing near B); `flip` (the giver times the
target near 1, counted in doublings, the owner's log-space pattern).

*Hand-worked (first draft, primary = the top):* y = (3/4)x + 137/4 → B = 4, target 137/4, (137, 0, …); top-echo
|3 − 137| = 134; flip: 3/4 × 137/4 = 411/16, 4.68 doublings. y = 2x + 37 → B = 1, (37, 0). y = (3/4)x + 30 → 30 = 120/4,
targets 37/4 and 137/4, nearest 137/4: (137, 17/4 away; 17 steps). Shift by 1 from the first: (137, 1 away; 4 steps).
Tilt by 1: 7/4, same B, unchanged. Tilt by 1/3: see item 3 of section 1.

*Faces:* tops and bottoms of slope-intercept form; standard form when on target (px − By + T = 0: its three whole numbers
are the gradient's top, the shared bottom and the target's top); the perpendicular.

### 2. Stair Fractions

*Card (reads = y-intercept, j = 1, d = 1):* The targets are a whole number n plus 1 over (n + 1): 1 1/2, 2 1/3, 3 1/4,
4 1/5, … (the same thing said with tops and bottoms: the top is the bottom times one less than itself, plus 1). Find the
target nearest the y-intercept, ignoring a minus sign. **Primary:** its whole number n. **Second:** how far the
y-intercept is from it. **Third:** from the repertoire.

*Parameters:* reads ∈ {gradient, y-intercept, x-crossing}; j ∈ 1..9; d ∈ 0..40; targets n + j/(n + d) for every n ≥ 1
with j < n + d. About 1,100 sets. *Existence and order (C):* 0 < j/(n + d) < 1, so no target is whole, and
(n + d)(n + d + 1) > j makes the targets increase with n, one between each pair of consecutive whole numbers.

*Second:* `near`; `zone` (within 1/8 scores 3, within 1/4 scores 2, within 1/2 scores 1, else 0).

*Thirds* (partner = the gradient when the y-intercept is read, else the y-intercept): `partner-bottom` (the partner's
bottom number near n + d); `partner-tail` (the partner's fraction part near j/(n + d)); `flip` (the partner times the
target near 1, in doublings).

*Hand-worked:* y = (1/4)x + 13/4, j = d = 1 → 13/4 = 3 1/4 is the target for n = 3: (3, 0). y = 2x + 5 → targets 4 1/5
and 5 1/6: 5 is 1/6 from 5 1/6 and 4/5 from 4 1/5 → (5, 1/6). Shift by 1 from 3 1/4 to 4 1/4: nearest 4 1/5, (4, 1/20).

### 3. Same Tail

*Card (reads = y-intercept, tail drawn as a repeating decimal 27):* The targets are the numbers whose decimal part is
0.272727… (27 repeating, which is the fraction 3/11): 0.2727…, 1.2727…, 2.2727…, … Find the one nearest the
y-intercept, ignoring a minus sign. **Primary:** its whole part. **Second:** how far. **Third:** from the repertoire.

*Parameters:* reads ∈ {y-intercept, gradient}; the tail in a drawn notation: a fraction r/d in lowest terms (d 2..40,
about 490), a repeating block of 1 to 3 digits (not all 0s or all 9s, about 1,100), minutes past the hour (3:25 is
3 25/60; 59). Every tail is strictly between 0 and 1, so no target is whole and one exists for every draw (C).

*Second:* `near` only (item 2 of section 1).

*Thirds:* `twin` (the partner's fraction part near the same tail); `complement` (near 1 − tail, so the height at x = 1
is whole); `bottom` (the partner's bottom near the tail's bottom in lowest terms); `scale` (the x-crossing near the tail
times the whole part: a reading in one face near a drawn fraction of a reading in another).

*Known weakness (N, from Mixed Intercept, its ancestor):* a unit shift lands exactly on the next target; the level is
shallow.

### 4. Part Way

*Card (reads = y-intercept, ladder = squares, 2/5):* Take two square numbers next to each other (1 and 4, 4 and 9, 9
and 16, …). The targets are the numbers two fifths of the way from one to the next: 2 1/5, 6, 11 4/5, 19 3/5, …, leaving
out any that are whole (6). Find the target nearest the y-intercept, ignoring a minus sign. **Primary:** which gap it is
in (the root of the lower square). **Second:** how far. **Third:** from the repertoire.

*Parameters:* reads ∈ {y-intercept, x-crossing, area}; ladder ∈ {squares, triangle numbers, cubes, powers of 2, powers
of 3}; u/v in lowest terms, v 2..12. About 700 sets. *Filter (must be coded):* a target is whole when v divides
u × (gap width). For squares the width is 2n + 1, triangle numbers n + 1, cubes 3n² + 3n + 1: infinitely many non-whole
targets for every v. For powers of k the width is kⁿ(k − 1): require v to have a prime factor that divides neither k
nor k − 1, else all large targets are whole.

*Second:* `near`; `zone`.

*Thirds:* `gradient-flip` (the gradient times the gap's width near 1, in doublings); `partner-index` (the gradient's
size near n); `cross-lower` (the other intercept near the gap's lower ladder number).

*Why it is robust (C):* the gaps widen with n, so a unit bump stays in the gap from n = 2 or 3 on.

### 5. Whole at a Fraction

Reading: y at x = u/v (u/v drawn, v 2..12, about 200). Targets: whole numbers that are not multiples of v. Primary:
size. Second: closeness. Thirds: the gradient's top near a multiple of v (a top cancelling a bottom) / y at x = −u/v
near minus the target / the gradient near the target times v/u. Weakness: "not multiples of v" is arbitrary; a
whole-number line misses by a fraction only, so it is middling, not poor.

### 6. Egyptian Ladder: not buildable as listed (item 7 of section 1)

### 7. Perpendicular Swap

Borrowed Bottom with a top as the giver; folded into family 1 as `part = top`.

### 8. Drawn Step

*Card (u/v = 3/7):* The targets are the whole multiples of 3/7 that are not whole numbers: 3/7, 6/7, 9/7, … (21/7 = 3
is left out). Find the one nearest the y-intercept, ignoring a minus sign. **Primary:** which multiple, N. **Second:**
how far. **Thirds:** the x-crossing near N (then the triangle with the axes is a scale copy of the 7-by-3 triangle and
the gradient nears −3/7) / the gradient's bottom near v / y at x = v near a whole number. Parameters: u/v in lowest
terms, v 2..30, u < 2v: about 550. This was to replace family 6 as the fifth built family.

## 3. Decisions made, and why

- **Build order:** 1 Borrowed Bottom, 2 Stair Fractions, 3 Same Tail, 4 Part Way, 8 Drawn Step. The coordinator agreed
  to 1, 2, 3, 4 and 6 at 19:52; 6 then proved uncomputable, and the coordinator has not been told (it is in the closing
  message).
- **The bottom-inflation caution, per family:**
  - *Borrowed Bottom:* the draft primary (the target's top) fails it (section 1 item 3). Proposed repair, not built:
    the primary reads a size (the target's VALUE, top ÷ B, so a finer ruler does not raise it), the borrowed bottom
    stays in the target, and the top's ending keeps the targets sparse. Under that primary the 1/3 tilt above moves the
    target from 137/4 = 34.25 to 437/12 ≈ 36.4: a change of one target, not a threefold jump. What is lost: the primary
    no longer prefers fractions; fraction-nativeness then rests on the targets (a whole-number line has B = 1 and sparse
    targets 37, 137, 237, so it is rarely close) and on the thirds. This is a judgement call to state in the
    walk-through.
  - *Stair Fractions:* the primary is n, the whole part of a target near the reading, so it is the reading's size; the
    bottom n + d is inside the target. A fractional nudge moves the reading by its own size and cannot inflate n. Passes
    by construction.
  - *Egyptian Ladder:* dropped.
- **Second-layer alternatives** are `near` and `zone` (and `steps` where the unit varies); the three-alternative
  requirement is met in the third layer (section 1 item 2).
- **One shared kit** `lib/v2-linear/src/tree-rep-kit.ts` (reading a number with its plane marks; the flat-line rule;
  `near` and `zone` layers; the doublings measure; `ParamSpace`), then one file per family, registered once at the end
  in `tree-rep-index.ts` and spread into `families.ts`.
- **No value files, no starters, not dealt** (the brief).

## 4. How this could be wrong or dull

- Families 3, 4 and 8 have size primaries on the y-intercept: by section 1 item 1 they are aligned with each other and
  with Prime Intercept on the primary. If the valuation pays mostly for the level, they are one rule in five costumes.
- Borrowed Bottom's repaired primary may make it read as "Prime Intercept with a stranger target set"; its distinct
  content is then only in closeness (the ruler moves when the giver moves) and the thirds.
- "Fraction-native" is argued from target sets that exclude whole numbers. It is not measured: no law draws were run.
- The cards for Borrowed Bottom with a top as giver, and for Part Way on cubes, may be too long for a 12-year-old.

## 5. Next steps, in order

1. Read the mirror session's answer on `ParamSpace` and on `chains`; settle both shapes in one small PR (v2-core
   optional fields or the map in `tree-rep-index.ts`; `pool.ts` `variantIds` reads `chains`).
2. Tell the coordinator that candidate 6 is dropped for 8, and the Borrowed Bottom primary repair, before building it.
3. `tree-rep-kit.ts` with tests, then Stair Fractions first (it passes the caution by construction and exercises every
   part of the kit), then Part Way, Same Tail, Drawn Step, Borrowed Bottom.
4. Per family: tests first with the hand-worked lines above (re-derive each by hand; they were worked once, without
   code); marks for every layer; the walk-through in `docs/engine-v2/tree-families/<family>.md` (card, three lines with
   tuples, the effect of shift by 1, tilt by 1, mirror, stretch by 2 and a small fractional nudge, which draws are
   near-perpendicular, how it could be wrong); root `pnpm run typecheck`; the selective suites
   (`lib/v2-linear`, `lib/v2-views` annotate, `artifacts/player-web` rules-mirror-pool); own PR into `develop`; tell
   the coordinator after each merge so the mirror is republished.
