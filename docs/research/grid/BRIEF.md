# Shared brief: utility functions for the new `Grid` object type (Code Gods)

## The game, in one paragraph
Code Gods (repo at /home/user/Code-Gods) is a multiplayer game. The world holds a set of objects of one
type T. Each player ("god") privately holds a *utility function* over objects of T. Gods summon
*transformations* (player-written code, `T -> T`) that the engine repeatedly applies to world objects;
every object in the world must be unique (a transformation onto an existing value fails), and new
objects spawn uniformly at random. Gods negotiate in public chat. Because objects are shared and
everyone's transformations hit everyone's objects, the interesting play comes from utility functions
that sometimes ALIGN (two gods both gain from the same edit) and sometimes CONFLICT (one god's
improvement destroys another's). Read for context, briefly:
- lib/game-utilities/README.md (design principles of utility families)
- lib/game-utilities/src/families/int.ts (how a family is written: sampled params, summary, code)
- docs/research/integer-value-brainstorm.md and docs/research/coalition-brainstorm.md (previous brainstorms)

## The new object type: Grid (aimed at kids / beginners; must be VISUAL)
A grid object is an N×N array of cells. Each cell holds a (symbol, colour) pair.
Runtime parameters set per room:
- size N: 3..7 (square)
- symbol set: base10 (0-9), base12 (0-9,A,B), base16 (0-F), or playing cards (rank A..K × suit ♠♥♦♣;
  52 symbols; suits are symbols, NOT colours — card colour comes only from the colour set)
- colour set: RGB (3), RGBY (4), or rainbow [red, orange, yellow, green, blue, violet] (6)
Each symbol has a point value (digit value; for cards, rank value — you may propose A=1 or A=14, faces
11-13, and suit-dependent effects). Colours have a natural order in the rainbow set (R<O<Y<G<B<V) and
you may use it. Adjacency defaults to orthogonal (4-neighbour); diagonal rules are allowed if stated.
Random spawns: each cell uniform over symbols × colours, independent.

## Seed rules from the designer (do NOT just restate these; go beyond them)
1. Sum of symbol values in contiguous straight lines (rows/cols, maybe diagonals) of the same colour.
2. For contiguous same-symbol regions where no two adjacent cells share a colour: region size × symbol value.
3. Number of green 1s.

## Relaxed constraints for this brainstorm
- Utilities need NOT be in [0,1]; raw counts/points are fine. Don't worry about how scores compose.
- Still prefer: random grids score low-ish; high utility needs visible structure; rules have random
  parameters so each god gets a different draw (e.g. "your colour is blue", "your symbol is 7").
- Rules must be explainable to a ~10-year-old in one or two sentences AND be visually checkable by
  looking at the grid (you can "see" your score). Short code (< ~15 lines).
- Every rule should be well-defined for all sizes 3..7, all symbol sets and all colour sets (say how
  it adapts, e.g. if it names a colour that only exists in the rainbow set, how is it sampled).

## What to produce
Write your output as Markdown to the file path given in your task. For EACH rule (aim for 10-15 strong
rules in your lens, quality over quantity):
- **Name** (evocative, like existing families: "Digit Devotee", "Mirrormancer")
- **Kid summary** (1-2 sentences, second person: "You love...")
- **Precise definition** + sampled parameters
- **Sketch** in TypeScript-ish pseudocode, grid as `g[r][c] = {s, c}` with helpers `value(s)`, N
- **Why it's visual** (what you see on the grid)
- **Interactions**: name specific other rules (seed rules, or rules from your list) it ALIGNS with and
  CONFLICTS with, and why. This is the most important part: we want a rich web of partial overlap.
- **Random-grid behaviour** (rough expected score vs. max achievable) and any degenerate strategy
  (e.g. "fill the whole grid with one colour" maxes it — is that a problem? does another rule punish it?)
Then end with a short section "Best 3 from my lens" and "Cross-lens ideas I noticed but didn't develop".
Do NOT edit any repository files. Only write your own output file.
