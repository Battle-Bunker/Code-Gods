# Engine v2: specification (14 November 2026)

Status: the design to build from. It follows the owner's decisions of 14 November ([owner-decisions.md](owner-decisions.md)),
which override the brainstorm documents (#343 to #347) and the existing engine. Section numbers are cited by code.

Vocabulary: an **object** has a **state**; an **object type** has **variants**; a **representation** shows a state as
named **elements**; a **rule family** with **parameters** is a **rule**, whose **rule score** is a tuple compared
lexicographically; a **mutator** changes a state through one or more representations and has a **price** in bits; the
**walk** is random play that makes each mutator call with probability 2^−price; **value** is the bits a rule score is
worth under the walk's stationary law.

## 0. The design on one page

1. **One implementation, in TypeScript, on the host.** Object types, representations, mutators, rules, annotations and
   valuation are ordinary TypeScript in new `lib/v2-*` packages. The server runs them; the browser imports the same
   packages to draw. Agents (Python or TypeScript, sandboxed) do not hold a copy: they ask the host, by priced calls, for
   a representation of the object they were offered, and return mutator calls. Nothing is data-defined and nothing is
   mirrored, so nothing can drift.
2. **The object is the line** (or a tuple of lines, a variant parameter). Its canonical state is exact (integers);
   every written form is a representation computed from it, with rational elements.
3. **Representations name elements**: coordinates (written by mutators), derived quantities and dynamic elements made
   from a rule's parameters. A rule has **two layers**: a main layer in school-textbook terms, then one
   tie-breaker chosen from the family's alternatives, which orders lines the main layer ties; every layer a graded quantity, never a yes/no test. Rules compute each layer
   from elements through an evaluation context that records every term, and their annotation is built from those same
   recorded terms, so the picture and the score cannot disagree.
4. **Mutators belong to representations and are priced by their code length** (which mutator, where, the argument),
   plus a **confining surcharge**: the bits by which the state's read length grows. Confinement is a principle of every
   price list (owner decision 11): each object type has a gravitational centre, the state that is cheapest to write, and
   moving away from it costs more than coming back. The price list is a probability law over calls, and it drives both
   what agents pay and the walk.
5. **Value is the stationary law of the walk.** For each rule (family, parameters, tie-breaker, variant), a state's
   value is minus log2 of the stationary mass of the states whose score is at least as good (owner decision 23, §7.0).
   It is computed offline, exactly where a sum allows and by direct draws from the law elsewhere, into a value
   function: certified knots in a committed JSON file the server looks values up in.
6. **Points** are as before: own bits times the sum of the other players' bits, per object, summed over objects.
7. **Everything else is new and small**: new Convex tables, an append-only event log that replays by folding, and
   per-viewer value documents. How the existing app moves onto v2 data is `docs/engine-v2/integration-plan.md`.

### 0.1 Why this architecture, and not the brainstorm alternatives

The brainstorms offered four shapes: TypeScript with hand-mirrored Python helpers (code-aware, #343), definitions as data
run by two interpreters (clean room A, #344), one Rust kernel compiled to WebAssembly and loaded everywhere (clean room B,
#345), and a staged refactor of today's libraries (code-aware's recommendation). The owner's decisions settle it.
Decision 7 ("let's not attempt data defined rules") removes the only reason for an IR and its interpreters. Decision 6
and call (d) make representation queries priced host calls, so agent languages never compute a representation and need
no mirror and no kernel; that also removes the case for a second implementation language. Decisions 3 and 8 rule out the
staged refactor and every compatibility layer it would carry. What remains is the simplest thing that meets every
constraint: one TypeScript implementation, run by the server (authoritative), imported by the browser (for drawing the
viewer's own rule), and reached by agents through a narrow, priced, language-neutral host channel (§6.5). Determinism
across server, browser and agents is then not a parity problem: only the server decides, it records what it decided,
and replay folds the record (§9).

## 1. Package layout

All new packages live beside the old ones. Nothing in a `v2` package may import `@workspace/game-types`,
`game-utilities`, `game-core`, `object-views`, `grid-lab`, `player-client`, `ai-player` or `game-runtime`; good code from
them is copied and cleaned. A test in `lib/v2-core` (`test/import-boundary.test.ts`) scans every `lib/v2-*` package and
fails on such an import. `@workspace/ui-kit` (generic components) may be used by `v2-views` and the web pages.

| Package | Contents | Depends on |
|---|---|---|
| `lib/v2-core` (`@workspace/v2-core`) | exact rationals `Q`; integer and rational codes (§2.3); the seeded generator; the contracts as types: object type, variant, representation, element, evaluation context, rule family, ladder, mutator, call, price; the generic walk step (§5.4) | nothing |
| `lib/v2-linear` | the linear-equation object type (§12): state, domains, representations, mutators, rule families, variants | v2-core |
| `lib/v2-valuation` | value functions (exact sums and direct draws), their record format and lookup, the `values` command line, committed records under `values/` | v2-core (and object-type packages, by registry) |
| `lib/v2-sandbox` | a copy of `lib/game-runtime` (CPython WASI and QuickJS) with the synchronous host channel (§6.5) | — |
| `lib/v2-agents` | the agent host: offers, priced queries, quotes, call parsing, act charge; the guest libraries for Python and TypeScript (thin: transport and a rational helper, no rule logic); the example agents | v2-core, v2-sandbox |
| `lib/v2-economy` | power, capacity, energy, offer selection, act charge (copied and cleaned from `game-core/energy.ts` and `docs/energy-model.md`) | v2-core |
| `lib/v2-views` | React renderers per scene kind (§11), the marks layer, compact and expanded object views, the goal card | v2-core, ui-kit |
| `lib/v2-affordances` | the one directory of operations (owner decision 16): every operation defined once (`defineOp`) and the assistant tools, MCP, CLI, command palette and buttons generated from it; integration plan §2.5 | v2-core |
| `artifacts/engine/convex/v2/` | v2 tables, tick, rooms, deal, queries (§10); each operation a separate Convex function behind its affordance | v2-linear, v2-valuation, v2-agents, v2-economy, v2-affordances |
| `artifacts/player-web/src/v2/` | the `/v2` pages | v2-views, v2-linear |

Packages follow the workspace's conventions: `type: module`, `exports` pointing at `src/index.ts`, tests with
`node --experimental-strip-types --test test/*.test.ts`, a `tsconfig.json` with `composite: true` referenced from the
root `tsconfig.json` so `pnpm run typecheck` covers it. An object-type package registers itself in a registry module of
its own (`registry.ts` exporting `objectTypes`), which the valuation command line and the engine import; there is no
global plug-in mechanism.

## 2. The object-type contract

### 2.1 State and canonical form

```ts
export interface ObjectType<S, V extends Variant = Variant> {
  readonly id: string;                         // "line"
  readonly version: number;                    // bumped when a state's meaning changes; part of every artefact key
  readonly variants: readonly V[];             // the deployable variants; a room picks one by id
  canonical(state: S, variant: V): S | Invalid;// normal form, or why the state is not in the variant's domain
  encode(state: S): string;                    // the wire form of a canonical state (short ASCII)
  decode(wire: string): S;
  readLength(state: S, variant: V): number;    // φ: bits to read the whole state (§2.3); Kraft sum ≤ 1 over the domain
  sites(state: S, variant: V): number;         // independent units (lines); representations and mutators address them
  origin(variant: V): S;                       // where the birth walk starts (§2.4)
  readonly representations: readonly Representation<S>[];
  readonly mutators: readonly Mutator<S, any>[];
  readonly families: readonly RuleFamily<S, any>[];
}
export interface Invalid { readonly invalid: string }   // a sentence: "a vertical line is not in this variant"
```

- A state is exact (integers, `bigint` where unbounded). Two states are the same object state if and only if their
  canonical forms are equal; `encode` of a canonical state is the identity used everywhere (logs, keys, tests).
- Representations are never stored; they are functions of the state.

### 2.2 Variants

```ts
export interface Variant {
  readonly id: string;                 // "line-z", "line-q", "line-z4"
  readonly objectType: string;
  readonly mutators: readonly string[];// the mutators offered, by id; their order is fixed (it is the "which" code)
  readonly birthMixSteps: number;      // walk steps between births (§2.4)
  readonly params: Readonly<Record<string, unknown>>; // type-specific: number domain, lines per object, caps
}
```

A variant is deployed code (decision 7): adding one is a pull request. Its parameters are what a room chooses between
at run time. Every artefact, offer and price is keyed by the variant's id and a hash of its JSON (`variantKey`).

### 2.3 Codes: read length and argument prices

All bit quantities come from a few codes in `v2-core/codes.ts`. Each is a prefix code whose lengths sum (Kraft) to at
most 1 over its domain, so each is also a probability law that can be sampled exactly (`sample(rng)`), which the walk
needs.

| Code | Domain | Length in bits |
|---|---|---|
| `gamma(n)` (Elias gamma) | n ≥ 1 | 2⌊log2 n⌋ + 1 |
| `int(n)` | n ∈ ℤ | gamma(zigzag(n) + 1), zigzag(n) = 2n for n ≥ 0, −2n − 1 for n < 0 (0 → 1 bit, ±1 → 3, ±2, ±3 → 5, ±4 … ±7 → 7) |
| `nonzero(n)` | n ∈ ℤ, n ≠ 0 | 1 + gamma(\|n\|) (±1 → 2 bits, ±2, ±3 → 4, ±4..±7 → 6) |
| `rat(p/q)` | lowest terms, q ≥ 1 | int(p) + gamma(q) |
| `nonzeroRat(p/q)` | p ≠ 0 | nonzero(p) + gamma(q) (sampling draws p and q independently and returns nothing when gcd ≠ 1: that remainder is the walk staying put) |
| `choice(k)` | one of k | log2 k |

The **read length** φ of a state is the code length of its canonical form, written with these codes (§12.2 gives the
line's). It prices a full read (§6.2) and it is the confining term of every price (§5.3). Lengths are IEEE doubles from
one function (`bits.ts`); gamma lengths are integers, `log2 k` the only non-integer term.

### 2.4 Birth

New objects are drawn from the walk's stationary law, so that "b bits" means "one newborn object in 2^b is at least this
good" (§7.1). Each game keeps one **birth walk**: a state that starts at `origin(variant)`, takes `burnIn =
16 × birthMixSteps` steps at game start, and takes `birthMixSteps` steps before each birth; the newborn object is a copy
of the walk's state. The birth walk's generator is derived from the game seed (§9.3). `birthMixSteps` is set per variant
from the mixing time the calibration measured (the artefact records the integrated autocorrelation time of the walk's
level process; the variant uses four times the largest over its rules).

### 2.5 Confinement and the gravitational centre (owner decision 11)

"It lets us have infinite state spaces with sort of gravitational centres that are expensive to depart from which
naturally provides dimensions to define higher utility/energy with respect to as well." So, for every object type and
every variant, bounded ones included:

- **The number code is declared.** `readLength(state, variant)` is the state's description length under the type's
  number code (§2.3: `int` for integers, `rat` for rationals). It is a prefix code, so 2^−φ sums to at most 1 over the
  domain.
- **The gravitational centre is the state (or states) of shortest read length**, and `origin(variant)` returns one of
  them. Birth walks start there (§2.4) and calibration climbs from there (§7.2).
- **Every mutator's price is a base plus the growth in description length** (§5.2): `max(0, φ(s′) − φ(s))`. Moving
  outward costs more than coming back, so the walk has a stationary law and a state's energy is, up to the price list's
  lopsidedness, its description length. There is no flat uniform law for finite boards: a bounded variant is confined
  exactly like an unbounded one, and its bounds only refuse calls past them.
- **Rules may be defined relative to the centre.** Distance from the centre (a coefficient's size, a denominator, a
  number's prime factors) is a natural axis of utility, because it is the axis along which states get rarer; the
  secondary layers of §12.5 use it ("the bigger that prime, the better", "x(q) nearly whole").

**The line over the rationals, and mixed costing (owner decision 17).** The centre is y = 0: the triple (0, 1, 0) on the
Q domain, (m, c) = (0, 0) on Z. The number code is **mixed** ("Use mixed costing now"): a whole number is written by its
prime factorisation, each prime p costing `STEP · p` bits with STEP = 1/2, so

```
mixedPos(n) = STEP · Σ_{p^e ∥ n} e·p + log2 Z,     Z = Π_p 1 / (1 − 2^(−STEP·p))  (log2 Z ≈ 2.10)
mixedInt(0) = 1,   mixedInt(±n) = 2 + mixedPos(n)
```

Its Kraft sum is exactly 1, so it is normalisable on the unbounded domains (and on the triples of the Q domain, a
subset). A large prime is dear and a large smooth number cheap: 23 costs 15.6 bits and 24 costs 8.6; 47 costs 27.6 and 48
costs 9.6. A number's energy is roughly its shortest arithmetic description. `φ(line)` is mixedInt(m) + mixedInt(c) on Z
and mixedInt(a) + mixedInt(b) + mixedInt(c) on Q (since the C3 trial, Q uses the variants of §12.2: p(0) = 1/8 on a and
c, b by steps). Measured before the trial (by the walk-law report, `lib/v2-valuation/src/law.ts`, since deleted): on `line-z` the
line's largest number is at most 2, 20 and 162 for 50%, 90% and 99% of the stationary mass (on `line-q` 1, 12 and 81),
and 24 is about 200 times commoner than 23. The constant STEP sets how strong gravity is: the earlier Elias-gamma
("digits") code made size cost only logarithmically (#347's doubling code), and a steps-only code would make size cost
linearly whatever its factors; number-codes.md records the comparison.

### 2.6 Unique objects (owner decision 24)

Within a game no two objects hold the same state: two lines are the same when their canonical triples are equal (two
grids when their cells are). A strategy cannot thrive by finding one good state and copying it to many objects.

- **A move onto a held state is refused.** A call (or plan) whose result equals another object's current state is
  invalid: refused like any invalid call, with no charge, and the quote says so ("another line is already y = 2x + 1").
  An agent's `price`/`cheapest` then return null for that plan, so a starter never proposes one. The check is on the
  plan's final state against every other object of the game at commit time (two simultaneous moves to the same state:
  the first to commit wins, the second is refused).
- **Births never duplicate.** A birth whose drawn state is already held is redrawn (the next draw of the same seeded
  birth walk), so births stay draws from the law restricted to distinct states.
- **Effect on values.** Refusing a move is a rejection in both directions, so the walk stays reversible and the
  stationary law of a game with N objects is the product law restricted to distinct tuples. One object's marginal is
  then π(x) times the chance that the others avoid x. For a common state the others crowd it out; for a rare state the
  others almost never hold it, so its mass rises by 1/(1 − E[M]), with M the π-mass the other N − 1 objects hold.
  Measured on line-z by a Gibbs sampler of the restricted law (Σπ² = 0.068 there, so collisions are not rare):

  | Objects N | 4 | 10 | 40 | 100 | 400 | 1,000 |
  |---|--:|--:|--:|--:|--:|--:|
  | E[M] | 0.13 | 0.23 | 0.39 | 0.51 | 0.68 | 0.77 |
  | Rare-state bits shift | −0.20 | −0.37 | −0.72 | −1.03 | −1.64 | −2.13 |

  The order of states is unchanged; the offset is nearly constant over rare states and matters in large games.
  **The correction** (`lib/v2-valuation/src/uniqueness.ts`, provisional): value functions stay computed under the
  one-object law (§7.0). A game of N objects looks values up through `withUniqueness(lookup, table, N)`, which lowers
  bits b by shift(N)·ramp(b), with shift(N) = log2(1/(1 − E[M_N])) and the ramp rising from 0 at log2 N over max(2,
  2·shift) bits. The ramp keeps the corrected value monotone in the score and leaves the crowded region alone. The
  per-variant tables of E[M_N] (N = 2 … 1,000; `pnpm --filter @workspace/v2-valuation uniqueness`) are bundled with
  the value functions (`UNIQUENESS` in valuesIndex.gen.ts). Σπ² is 0.068 on line-z, 0.012 on line-q and 1.5·10^−12 on
  grid-4-d10. So line-q shifts by 0.10 bits at 10 objects, 0.23 at 40 and 0.86 at 1,000, and grids need no correction.
- **Identity, not near-duplicates.** "Unique" is exact equality of the canonical state. A stronger notion (lines that
  differ only slightly, the same primary utility) would be arbitrary per rule, would distort the law more, and would
  forbid legitimate neighbours that hill climbing needs. Recommended: identity only.

## 3. The representation contract

```ts
export type SceneKind = "equation" | "plane" | "table" | "sequence" | "machine" | "pegboard" | "grid" | "dial" | "rulers";

export interface Representation<S> {
  readonly id: string;                                  // "si"
  readonly title: string;                               // "slope-intercept: y = mx + c"
  readonly scene: SceneKind;
  readonly perSite: boolean;                            // true: one view per line; false: one view of the whole object
  readonly elements: readonly ElementDecl<S>[];
  // What the renderer draws (§11), every primitive tied to an element. `args` are the rule's parameters, for lenses a
  // rule parameterises (a modulus, a jar size); a representation that takes none ignores them.
  layout(state: S, site: number, args?: ArgValues): SceneData;
}

export interface ElementDecl<S> {
  readonly name: string;                                // "m", "yInt", "out"
  readonly label: string;                               // "gradient", "y-intercept", "machine output"
  readonly kind: "number" | "point" | "segment" | "symbol";
  readonly role: "coordinate" | "derived" | "dynamic";
  readonly params?: readonly ParamDecl[];               // dynamic elements only: [{ name: "q", domain: "Q" }]
  readonly meaning?: string;                            // a shared id across representations: "yIntercept"
  value(state: S, site: number, args: ArgValues): ElementValue;
}

export type ElementValue =
  | { kind: "number"; q: Q }
  | { kind: "point"; x: Q; y: Q }
  | { kind: "segment"; from: { x: Q; y: Q }; to: { x: Q; y: Q } }
  | { kind: "polygon"; points: readonly { x: Q; y: Q }[] }      // a region: cut pieces, a crate, the intercept triangle
  | { kind: "path"; points: readonly { x: Q; y: Q }[] }         // an open polyline: a bounce path, a cobweb
  | { kind: "symbol"; text: string }
  | { kind: "undefined"; reason: string };            // "a horizontal line never meets the x-axis"

// Arguments travel as strings: a rational ("p/q") for domain Z or Q, or a plain word for domain "name".
export interface ElementRef { rep: string; name: string; site?: number; args?: Record<string, string> }
// ParamDecl.domain is "Z" | "Q" | "name"; a Z parameter may declare `max(state)` for a state-dependent count
// (way(k) for k < the number of ways, letter(i)).
```

- **Static elements** are coordinates and derived elements: no parameters. **Coordinates** are the elements a
  representation's mutators write (`si.m`, `si.c`); together they determine the line wherever the representation is
  defined. **Derived** elements are computed (`tri.area`). **Dynamic** elements take parameters supplied by a rule or an
  agent (`mach.out(q)`, `cart.yAxisMark(y)`): this is how a rule makes "the point at x = q" or "the prime 7 on the y axis"
  into something it can score and draw.
- **Undefined is a value, not an error.** A representation that cannot express a state (slope-intercept of a vertical
  line) gives `undefined` with a sentence for every element. A rule whose primary layer reads an undefined element
  scores WORST; an undefined secondary layer ranks last in its own component (§4.2); the annotation shows the sentence.
- **Elements are exact; drawing may not be.** Element values are rational. A layout may carry floating-point positions
  for drawing only (an irrational chord end, a tangent foot), never cited by a score.
- **`meaning`** links elements that are the same quantity in different representations (`si.c`, `cart.yInt`,
  `mach.out(0)`, `table.y(0)` all have meaning `yIntercept`; dynamic elements match on meaning and arguments). The views
  cross-highlight by meaning (§11.3). A unit test checks that elements sharing a meaning have equal values on a corpus.
- **Element refs** print as `si.m`, `mach.out(q=3)`, `L2:cart.yInt` (site 1, i.e. the second line; the prefix is omitted
  when a variant has one line).

### 3.1 What a priced query returns

An agent's query (§6.2) names a representation (and a site), or one element with its arguments. The host returns:

```ts
interface ViewReply { rep: string; site: number; elements: Record<string, ElementValue>; bits: number }   // static elements only
interface ElementReply { ref: ElementRef; value: ElementValue; bits: number }
```

- `bits` is the information read: the sum of the code lengths of the **values returned** (every static element of the
  view: `rat` for a number, both coordinates for a point, every vertex of a segment, polygon or path, 8 bits per
  character of a symbol, 1 bit for an undefined element). A view with no coordinates is not free: `table` reveals the
  line through its values and pays for them.
- A single element costs the code length of its value.
- **Caps.** Within one act a repeated query is free; the bits charged for the static views of one line never exceed
  `readLength` of that line (an agent that reads everything pays one full read, however it asks, even where the view's
  `rat` codes would sum to more, as `si` on the Z domain does by one bit per coordinate); dynamic elements are charged
  on top, each at its value's code length.
- The read receipt travels on the reply envelope, `{ ok: true, result, bits }`, for every query, including `quote`,
  whose `result.bits` are prices, not read bits (§6.3).

## 4. The rule contract

### 4.1 Families, layers, parameters, the card

A rule is **layers** (owner decisions 12–14). The main layer is what a 12-year-old following a standard
linear-equations course can read (gradient, intercepts, substitution, a table of values); the tie-breaker orders lines
the main layer ties, and may be more advanced. Every layer is a graded quantity with a direction (a distance, a count,
a size) and many attainable values, never a yes/no test: "binary decisions are worthless".

```ts
export interface Layer<P> {
  readonly id: string;                                   // also the id of the term that measures it
  readonly title: string;                                // "gradient close to a prime"
  sentence(params: P): string;                           // the card's sentence for this layer
  readonly rep: string;                                  // the representation the layer is read in (its compact view)
  readonly sense: "min" | "max";                         // smaller is better (a distance) or bigger is better
}

export interface RuleFamily<S, P> {
  readonly id: string;                                   // "prime-gradient"
  readonly title: string;                                // "Prime Gradient"
  card(params: P, tieBreaker: string | null): string;    // the main sentence, then the dealt tie-breaker's
  readonly params: readonly ParamDecl[];                 // named, typed parameters
  dealable(variant: Variant): readonly P[];              // the finite grid of parameter values a deal draws from
  readonly depends: readonly string[];                   // representation ids, in the order the expanded view shows them
  readonly main: Layer<P>;                               // the main layer (its rep is the compact view)
  readonly tieBreakers: readonly Layer<P>[];             // alternative secondaries; a dealt rule picks one
  evaluate(ctx: EvalContext<S>, params: P): void;        // reads elements, records every layer's term, adds marks
  examples?(params: P, variant: Variant): readonly S[];  // worked examples for the goal card (integration plan §5.7)
}
type TieBreaker = string | null;                         // a dealt rule's choice; null: the main layer alone
```

- **A family offers several tie-breakers; a dealt rule uses one** (decision 14 and its clarification: "I will want
  several secondary rule candidates within each family"). A dealt rule is `{ family, params, tieBreaker }`: the main
  layer plus that tie-breaker, never a third layer. Each (family, params, tie-breaker, variant) has its own value function, and
  `ruleKey` = object type and version + variant and its hash + family + canonical params + `tb=<id>` identifies it (§7.6, `lib/v2-valuation/src/keys.ts`).
  The deal picks the tie-breaker as it picks parameters (W3-3 decides the distribution; uniform over converged ones).
- **Won by bid** (owner decision 18): a bid names a family only; the dealer draws the winner's parameters and tie-breaker
  from that family's converged rules in the room's pool, records `wonByBid` and the `handicap` on `v2Rules`, and the
  standings carry the handicap and the net total (integration plan §5.9).
- **Every layer is graded** (decision 13): a utility must not be binary, though it may be discrete by nature (a
  smallest prime factor, a run length).
- **Ordering and value: value follows the order.** Scores compare as plain lexicographic tuples (coordinator's call (f):
  no gating), so the tie-breaker orders lines at every main value, and the value function is monotone in that order
  (§7.0): improving the tie-breaker raises bits, and a line never holds fewer bits than one it beats.

### 4.2 Evaluation: score and annotation from the same terms

```ts
export interface EvalContext<S> {
  readonly state: S; readonly site: number; readonly variant: Variant;
  read(ref: ElementRef): ElementValue;                   // records the read; rejects refs outside `depends`
  term(id: string, label: string, value: Q | Undef, from: readonly ElementRef[]): TermId;  // a named quantity
  mark(mark: Mark): void;                                // marks may only cite refs read and terms recorded here
}
export type Undef = { undefined: string };
export type Score = readonly (Q | null)[] | null;        // one component per dealt layer, bigger is better

export interface Evaluation {
  score: Score; terms: readonly Term[]; marks: readonly Mark[]; reads: readonly ElementRef[];
}
```

- The engine's `evaluateSite(type, family, params, state, variant, site, tieBreaker)` builds the context, calls the family
  and makes the score itself: component 0 is the main layer's term, component 1 the dealt tie-breaker's (negated for
  `min`); `Evaluation.components` names them, for the views' "main part" and "tie-breaker". The
  family cannot set a score any other way, so the score is made of recorded terms and of nothing else. A mark that cites
  an element not read, or a term not recorded, throws. So the picture is built from the very numbers the score is made
  of; there is no second computation to disagree with.
- **Undefined, per component.** An undefined primary makes the score WORST (`null`), below everything. An undefined
  secondary is a `null` component that ranks last in its own component only (a line that meets the primary but has no
  intercept triangle still beats one that misses the primary).
- **No saturation** (owner decision 23). Each component is the layer's utility as it is.
- Scores compare lexicographically; `compareScores(a, b)` is in v2-core.
- A family evaluates one line when `sites = 1`. For variants with k lines a family is evaluated per line; the object's
  score is null for now (per-line bits summed is provisional and comes next, §4.4).

### 4.3 Marks

```ts
export type Mark =
  | { kind: "focus"; ref: ElementRef }                                       // this element counts
  | { kind: "measure"; from: ElementRef; to: ElementRef; term: TermId }      // a distance, labelled with a term's value
  | { kind: "candidate"; ref: ElementRef; term?: TermId }                    // a nearby target (a prime on the y axis)
  | { kind: "note"; ref: ElementRef; text: string }                          // short words beside an element
  | { kind: "shade"; ref: ElementRef; term?: TermId }                        // a polygon element shaded (an area that counts)
  | { kind: "trace"; ref: ElementRef }                                       // a path element drawn as a route
  | { kind: "match"; a: ElementRef; b: ElementRef; term?: TermId };          // "these two are the same" (or should be)
```

`shade`, `trace` and `match` come with polygon and path element values (§3) and are what brainstorm E (#352) needs to
draw its lenses; v2-core's `Mark` type gains them with the first family that uses them.

Example: Prime Gradient on `y = 4x − 3` reads `si.m` (4), makes dynamic elements `cart.ghost(g=3)` and
`cart.ghost(g=5)` (the lines of gradient 3 and 5 through the same y-intercept), records `d3 = 1`, `d5 = 1`, the primary
`near = 1` and the secondary `prime = 3`, and marks `focus si.m` and the two ghosts as candidates with their distances.

### 4.4 No ladder

There is no ladder (owner decision 23): no thresholds, rungs, levels, caps or saturation. A dealt rule's score is its
layers' utilities, compared lexicographically (§4.2, `scoreOf`), and a state's value is the rule's value function at
that score (§7.0). The card and the views speak of the main part and the tie-breaker and their values, never of steps.
A multi-line object (line-z4) has no object score yet (`ObjectEvaluation.score` is null): per-line bits summed is the
provisional plan, and it comes next.

## 5. The mutator contract

### 5.1 Declaration

```ts
export interface Mutator<S, A> {
  readonly id: string;                                   // "si.shift"
  readonly reps: readonly string[];                      // the representations it belongs to ("si", "cart")
  readonly title: string; describe(args: A): string;     // "move the line up 2"
  args(variant: Variant): ArgCode<A>;                     // prices and samples the argument (§2.3 codes); integer or rational per variant
  readonly perSite: boolean;                             // true: the call names a line
  apply(state: S, site: number, args: A, variant: Variant): S | Invalid;   // canonical result, or why not
  readonly inverse:
    | { kind: "self" }                                   // mirror: applying it twice is the identity
    | { kind: "mutator"; id: string; args(a: A): A }     // shift(k) is undone by shift(−k)
    | { kind: "partial"; id: string; args(a: A): A; note: string }   // undone where the result is defined
    | { kind: "none"; note: string };                    // gen.nudge: renormalisation loses the scale
}
export interface ArgCode<A> {
  bits(a: A): number; sample(rng: Rng): A | null; encode(a: A): unknown; decode(w: unknown): A;
  enumerate?(maxBits: number): Iterable<A>;             // every argument up to a price, cheapest first (spec PR 5)
}
export interface Call { mutator: string; site: number; args: unknown }      // the wire form an agent returns
```

### 5.2 Price

For a call `a` made on state s with result s′ in a variant with N mutators and k sites:

```
W(a, s) = log2 N + (perSite ? log2 k : 0) + args.bits(a) + max(0, φ(s′) − φ(s))
```

(log2 N is the uniform "which" code. A variant may declare a weighted one, `Variant.which`: bits per mutator with Kraft
sum 1, used in place of log2 N in the price, in the walk's draw and as the o of that mutator's size code.)

The first three terms are the call's code length: which mutator, where, the argument. **Mixed costing** (owner decision
17) decides the argument code: an amount added (a shift, a tilt, a step, a slide, a nudge, an intercept move, a pivot's
anchor) is priced by **steps**, `1 + STEP·(|n| − 1) + G` bits for a nonzero integer n with G = −log2(1 − 2^−STEP), and
`1 + STEP·(|p| − 1) + STEP·(q − 1) + 2G` for a nonzero rational p/q (an amount that may be 0 adds one bit for "zero or
not"); a factor (a stretch) is priced by **digits**, its gamma code `nonzero(p) + gamma(q)`, and its inverse 1/f costs the
same; choices (an axis, a coefficient) cost log2 of their number. Every multiplicative move keeps its inverse, so the walk
is confined in both directions. The last term is the **confining
surcharge** (owner decision 11, §2.5): arriving at a state that takes more bits to read costs those extra bits. Prices are of the call
as made, never of the cheapest call with the same effect (the brainstorms agree: otherwise the engine does the lens
switching for the player). A call whose result equals its input is refused.

### 5.3 Why the surcharge, and what it does

On an unbounded domain a walk whose moves cost the same both ways never comes to rest, and no level has a probability.
With the surcharge, the walk accepts a move away from short states only with probability 2^−(growth), which confines it.
**Every price list is an exact potential** (owner decision 19, which withdraws call (a)). Each mutator may carry a
handling fee and argument prices, but a move and its inverse pay the same; the only asymmetric part is the surcharge,
which comes from one energy function of the line, the read length φ. The walk is then Metropolis on φ, detailed balance
holds, and the stationary law is exactly π ∝ 2^−φ, so a rule's value is an exact sum over lines
([analytic-calibration.md](analytic-calibration.md)). The price list still matters to play (what an agent pays for a
move), but not to value. The cycle test is a hard gate: lib/v2-linear's potential test proposes every move from a set of
lines on every variant, and fails on any one-way move or any pair whose weights differ. gen.nudge refuses a result with a
common factor for that reason (dividing it through had no inverse).

### 5.4 The walk

The walk is the Markov chain on a variant's states that, at each step, draws a call with probability 2^−W and otherwise
stays. It is sampled exactly, without enumerating calls (`v2-core/walk.ts`):

1. draw a mutator uniformly from the variant's N (probability 2^−log2 N);
2. if it is per site, draw a site uniformly from k;
3. draw the argument with `args.sample(rng)` (probability 2^−bits; `null` means the code's leftover mass: stay);
4. apply it; an `Invalid` result or an unchanged state means stay;
5. accept with probability 2^−max(0, φ(s′) − φ(s)), else stay.

A contract test per mutator checks that `sample` and `bits` agree: over 10^5 draws the empirical frequency of each of the
twenty commonest arguments is within four standard errors of 2^−bits.

## 6. The agent API

### 6.1 The act

The economy is today's, copied and cleaned (`docs/energy-model.md` §2, §6, §7 are the reference; `lib/v2-economy`):
players have power, split between their agents; energy accrues up to a capacity; opportunities arrive at a room-wide rate,
each picks an object uniformly and an agent with probability proportional to its positive energy. One opportunity is an
**act**:

1. The host offers the object to the agent: the agent learns which object (log2 of the number of live objects, read
   bits) and receives an `Offer` handle. It has not seen the state.
2. The agent runs, inside the sandbox's deterministic step budget (default 500,000 steps) and a host-call cap (default
   64 calls). It may make priced queries (§6.2), free quotes (§6.3) and read its budget.
3. The agent returns a list of calls (or nothing, a skip). The host applies them in order to the state; each call's price
   is computed on the state it applies to (§5.2); if any call is invalid the whole act fails and nothing changes.
4. The charge is `R / κ + (committed ? W + β·W² : 0)`, where R is the bits read (offer plus queries), W the sum of the
   calls' prices, κ = 32 (reads are 32 times cheaper than changes) and β = 0.05 (radical acts cost superlinearly). κ and β
   are economy constants in `v2-economy`, not room settings.
5. The host records the act (§9) and, if the state changed, re-evaluates every player's rule on it and updates values
   (§7.7, §8).

Computation inside the agent is not priced in energy; it is bounded by the step budget (decision 6: an agent may spend
its own time converting between representations instead of paying for a second query).

### 6.2 Queries (priced, host calls)

| Query | Returns | Read bits |
|---|---|---|
| `view(rep, site?)` | `ViewReply` (§3.1): the representation's static elements | the coordinates' code lengths |
| `element(ref)` | `ElementReply`: one element, dynamic ones with their arguments | the value's code length |
| `myRule()` | the agent's player's rule: family id, parameters, card sentence, ladder | 0 (the player knows it) |
| `myScore()` | the rule's `Evaluation` on the offered state (score, terms, level) | the reads of every representation in `depends` not yet read this act |

`myScore` is a read: it tells the agent exactly what reading its rule's representations would, so it costs that. Agents
may not ask for other players' scores or values.

### 6.3 Quotes and budget (free, but host calls)

- `quote(calls)` → `{ valid, reason?, bits: number[], total, charge }`: what the calls would cost on the offered state, in
  order, without the resulting state. It reveals nothing the agent could not compute from a full read and the price list,
  except the surcharge, which depends on the result: a quote of an unread state therefore charges, once per act, the read
  bits of the first representation in the first quoted mutator's `reps`, as if it had been viewed.
- `budget()` → `{ energy, readPrice: 1/κ, beta, hostCallsLeft }`. (No steps left: the host cannot read the guest's step
  count during a channel call without re-entering the interpreter.)

### 6.4 The API in TypeScript and Python

```ts
// TypeScript guest (lib/v2-agents/guest/agent.d.ts); Q is { n: bigint; d: bigint } with helpers in `Q`
declare function agent(offer: Offer): Call[] | null;
interface Offer {
  view(rep: string, site?: number): Record<string, Value>;      // Value = Q | Point | string | Undefined
  element(rep: string, name: string, args?: Record<string, Q | number>, site?: number): Value;
  myRule(): { family: string; params: Record<string, unknown>; card: string };
  myScore(): { score: (Q | null)[] | null; level: number; top: number; terms: { id: string; value: Q | null }[] };
  quote(calls: Call[]): { valid: boolean; reason?: string; bits: number[]; total: number; charge: number };
  budget(): { energy: number; readPrice: number; beta: number; hostCallsLeft: number };
}
declare function call(mutator: string, args: Record<string, unknown>, site?: number): Call;
```

```python
# Python guest (lib/v2-agents/guest/codegods.py); numbers are fractions.Fraction; an undefined element is an
# `Undefined` value: falsy, equal to None, with `.why` (None itself cannot carry the sentence)
def agent(offer):
    v = offer.view("si")            # v.m, v.c are Fractions
    s = offer.my_score()            # s.score, s.level, s.top, s.terms
    q = offer.quote([call("si.tilt", k=1)])
    return [call("si.tilt", k=1)]   # or None to skip
```

Arguments are plain numbers or `Q`/`Fraction` values; the host decodes them with the mutator's `ArgCode` and rejects
anything else. Errors raised inside the agent are act failures, charged their reads, as today.

### 6.5 The host channel

The sandbox (`lib/v2-sandbox`, a copy of `lib/game-runtime`) gains one capability: a synchronous request and reply
between guest and host, carrying one JSON object each way (at most 16 KiB).

- **QuickJS:** a host function `__host(requestJson: string): string` installed before the agent's program runs.
- **Python (WASI CPython):** a preopened file descriptor 3. Agents may not import `os` (the module allowlist), so the
  trusted prelude installs a `__host(request)` function that writes a length-prefixed request with `os.write(3, …)` and
  reads the reply with `os.read(3, …)`; the host's WASI `fd_write` and `fd_read` implementations for descriptor 3 handle
  the request between the two calls, and the guest library calls `__host` only. No change to the pinned CPython build
  or bundle is needed: v2-sandbox runs the bundle file game-runtime builds, with its own cleaned guest code as prelude.
- **Messages:** `{ op: "view" | "element" | "myRule" | "myScore" | "quote" | "budget", ... }` → `{ ok: true, result,
  bits } | { ok: false, error }`, where `bits` is the read receipt of every op (§3.1). Rationals travel as strings
  `"p/q"`. The host counts calls against the cap and charges reads. The wire types live in `lib/v2-sandbox/src/agent-api.ts`
  until v2-agents takes them over from v2-core.
- **Determinism:** replies are pure functions of the offered state, the rule and the act's earlier requests, so an act
  replays exactly from its seed and inputs. The agent's own randomness stays the seeded generator of the act.

The first PR of the sandbox work is a spike that proves both channels under the existing step budget and hard wall
(§14, PR 6).

### 6.6 Three example agents

Each ships in both languages under `lib/v2-agents/examples/` and is run by the agent host's tests.

**1. Prime Gradient, the direct lens.** Read `si`; if m is not prime, tilt by the signed distance to the nearest prime.

```python
def agent(offer):
    m = offer.view("si").m
    if m.denominator != 1: return None          # this agent only handles whole gradients
    m = m.numerator
    p = min((p for p in range(2, abs(m) + 30) if all(p % d for d in range(2, int(p ** .5) + 1))), key=lambda p: abs(p - m))
    return None if p == m else [call("si.tilt", k=p - m)]
```

**2. m Meets c, switching lens.** The gap g = c − m can be closed three ways: `si.shift(−g)` (c moves), `si.tilt(g)`
(m moves) or, when g is even, `seq.step(g/2)`, which moves m and c towards each other and so closes the gap at half the
argument. The agent quotes the plans and makes the cheapest. (Teaching point: on y = x + 5 the step is 7.17 bits plus
surcharge, the shift 9.17.)

```ts
function agent(offer: Offer): Call[] | null {
  const v = offer.view("si"); const g = Q.sub(v.c as Q, v.m as Q);        // c − m
  if (Q.isZero(g)) return null;
  const plans: Call[][] = [[call("si.shift", { k: Q.neg(g) })], [call("si.tilt", { k: g })]];
  const half = Q.div(g, Q.of(2));
  if (Q.isInteger(half)) plans.push([call("seq.step", { k: half })]);
  let best: Call[] | null = null, bestBits = Infinity;
  for (const p of plans) { const q = offer.quote(p); if (q.valid && q.total < bestBits) { best = p; bestBits = q.total; } }
  return best;
}
```

**3. Triangle Area, search across lenses.** Read `si` once (one read), then search locally (free computation) over a few
hundred candidate calls from four mutators, computing area and price in the agent's own code, and return the best ratio
of improvement to price. It spends its step budget instead of energy: decision 6 in one program.

```python
def agent(offer):
    v = offer.view("si"); m, c = v.m, v.c
    A = offer.my_rule().params["A"]
    def area(m, c): return None if m == 0 or c == 0 else c * c / (2 * abs(m))
    def gap(m, c): a = area(m, c); return float("inf") if a is None else abs(a - A)
    here = gap(m, c)
    cands = [("si.shift", {"k": k}, m, c + k) for k in range(-6, 7) if k] \
          + [("si.tilt", {"k": k}, m + k, c) for k in range(-4, 5) if k] \
          + [("seq.step", {"k": k}, m + k, c - k) for k in range(-4, 5) if k] \
          + [("cart.slide", {"u": u, "v": 0}, m, c - m * u) for u in range(-3, 4) if u]
    better = [(gap(m2, c2), name, a) for name, a, m2, c2 in cands if gap(m2, c2) < here]
    if not better: return None
    best = min(better, key=lambda b: (b[0], offer.quote([call(b[1], **b[2])]).total))
    return [call(best[1], **best[2])]
```

## 7. Valuation

### 7.0 Value functions (normative; owner decision 23)

A rule's layers are **utilities**: each maps a state to a value in a totally ordered set (a number, bigger better; a
distance enters negated). A dealt rule's **utility** is the pair (primary, secondary), compared lexicographically, with
no thresholds and no saturation (`Evaluation.score`; an undefined primary makes it null, the worst; an undefined
secondary ranks last in its place). A state's value is the survival of the stationary law at its actual utility:

```
bits(s) = −log2 π{ x : utility(x) ≥ utility(s) }        (lexicographic ≥; the worst utility is worth 0)
```

It is defined at every utility, so there are no rungs, levels, caps or "too coarse" rules: a utility must not be
binary (it may be discrete by nature: a smallest prime factor, a run length).

**The artefact is the value function** (`lib/v2-valuation/src/value.ts`, schema 7, under `values/`): knots, sorted from
the worst score up, each a score with its bits and a certified interval [lo, hi]. Survival is monotone in the score, so
for k_i ≤ s ≤ k_j the value lies in [lo(k_i), hi(k_j)]: a lookup (`valueLookup`) returns the knot's value at a knot, the
midpoint and that bracket between knots, and, beyond the best knot, the **tail rule** (owner decision 26: no maximum),
marked `beyond`, with the best knot's lo as its certified floor and no ceiling. The best knot is where measurement
stops, not a top: the tail fits the last knots along the secondary utility at the same primary, else along the primary,
as a straight line (distances, and sizes whose knots rise at least STEP/4 bits per unit and fit a line no worse) or a
magnitude ramp, bits on log2(1 + u) (the default for sizes: a line through a magnitude would over-value far scores).
A layer whose value is a prime or a prime factor declares `measure: "prime"`; its tail is a line at STEP = ½ bit per
unit, the code's own cost of a prime (a slower straight-line fit is taken, never below half that).
Its slope is never below the law's floor (TAIL_FLOOR ≈ 0.38 bits per doubling, one coordinate doubling from 1 to 2) and,
on lines, never above the law's ceiling (TAIL_CEILING = STEP = 0.5 bits per unit, what the code charges per unit of a
prime, so a tail never pays more than the cheapest state with that score costs; a ramp is held to it at its start).
So a lookup keeps rising without bound wherever the score can keep improving; a distance's tail ends at its top, 0. See
docs/engine-v2/maxima.md. Knots are kept wherever the value moves by more than `delta` (0.05 bits), so a lookup
between knots is within delta/2 of the truth.

**How knots are certified.** Each knot takes the tightest interval any survival oracle gives:

- *Exact oracles* (whole-number lines, §7.2's plans): the same sums, accumulated by utility instead of by rung. A
  separable plan is one 1D law, or a product S(a, b) = P1(U1 > a) + P1(U1 = a)·P2(U2 ≥ b) of two; a band is valid for
  utilities whose primary is at least the band's start; the generic enumeration of the cheapest lines is valid
  everywhere. Each interval is [inside, inside + outside]. Certified within max(2% · bits, 0.06 bits).
- *Direct draws* (owner decision 22, every line variant): π is a product of independent mixed-integer codes, drawn
  exactly coordinate by coordinate (per-prime geometric exponents; `sampleMixedInt`); a fraction line is a drawn triple
  kept when canonical. The rare tail comes from a mixture of tilted laws q_t(n) = 2^(−t·bits(n))/Z_t (t = 1, 0.75, 0.55,
  0.4, 0.3), each draw weighted p/q_mix and the estimate self-normalised; its ±2σ interval (delta method) is certified
  within max(5% · bits, 0.2 bits) with at least 30 draws at or above the knot, and never past `sampledMaxBits` (18).
  π itself is one component of the mixture, so every weight is at most K = 5 (no draw can dominate). That limit is
  the rarity to which the same sampler stayed calibrated in **independent replicates** against the exact sums
  (`pnpm --filter @workspace/v2-valuation sampler-check -- <family> <tie-breaker> --replicates 16`; 16 seeds, 6 line-z
  pairings, z at fixed scores near 2, 5, …, 23 bits). |z| > 2 in 4.2% of checks at 6–12 bits and 2.8% at 12–18 bits.
  Above 18 bits there were too few checks: 17, one at 3.97σ. Below 6 bits the excess is the exact references' own width:
  plain draws from π, which are unbiased, show more of it. (A single sample read at many scores overstates misses,
  because its estimates move together; the grids session found the same, grids.md §5.2b.) A score rarer than the last
  certified knot is
  extrapolated by the tail rule (marked `beyond`, floor = that knot's lo): 18 bits is a limit on measurement, not on value.

**There is no box (owner decision 26).** A coefficient of any size is a state; a bigger number is only dearer, through
φ. The law needs no box to be normalised: p(n) = 2^−mixedInt(n) is a complete code over all integers (its Kraft sum is
1: 2^−1 for 0, plus 2·2^−2·Π_p 1/(1 − 2^−p/2)/Z = 1/2 for the rest, the Euler product of the factorisation code), so
π on line-z is the product p(m)·p(c) exactly, and on line-q the product p(a)·p(b)·p(c) restricted to canonical triples,
whose mass is at most 1 (lib/v2-core codes.test.ts, lib/v2-linear no-box.test.ts). The exact sums enumerate every
integer within their budget, with no conditioning; what lies past the budget is the certified remainder. (The old
10^6 box held all but 3.4·10^−5 of a coordinate's mass, but about 78% of the lines with c a multiple of lcm(1..16):
removing it lowers the value of such scores honestly, and leaves the exact sums slightly more mass outside, so their
rarest knots are certified a little less far; the tail takes over there.) Evaluation stays bounded in time for any
size: trial division stops at 10^5 (a larger cofactor counts as one prime), coin counting gives up past 10^5 steps
("undefined"), and the gaps between numbers with no factor below 10^5 are bounded.

When value functions replaced the rung tables, the old rung values were checked to be this function at the old
thresholds; the rung machinery (thresholds, ladders, the restricted-walk estimator, caps, the too-hard backlog and the
schema-5 artefacts) is deleted (decision 23, PR 2) and lives on `archive/engine-v1` and in git history.

### 7.1 What a value is

For a rule r on a variant, let π be the stationary law of the variant's walk (§5.4). The **value** of a state s is

```
V(s) = −log2 π{ x : score(x) ≥ score(s) }          (lexicographic; the worst score is worth 0)
```

π exists because prices confine (§5.3). Energy E(s) = −log2 π(s) is the "inverse PageRank" of decision 10; V is the
free energy of the upper set of s's score.

### 7.2 Exact values (normative; owner decision 19)

Every price list is an exact potential (§5.3), so the stationary law is π ∝ 2^−φ and a value is a sum over states. On
`line-z` (one whole-number line), π(m, c) = p(m)·p(c) with p(n) = 2^−mixedInt(n), whose Kraft sum is exactly 1, and
the value function's exact oracles (`lib/v2-valuation/src/value.ts`) sum it:

- **Enumeration with a rigorous bound.** `integersWithin(B)` (`exact.ts`) lists every integer whose code is at most B
  bits. For any sum over the lines inside a budget the mass outside it is known, so each knot gets a certified interval.
- **The rule author's contract** (`lib/v2-linear/src/sums.ts`, `lineSums` by family id). A family declares how its
  upper sets are summed:
  - `separable`: each dealt layer depends on m alone or on c alone. The law of the score is then a product of two 1D
    laws. This is checked on random lines at run time.
  - `bands`: for every m, ranges of c holding every line whose primary utility is at least the band's `atLeast` (a
    linear substitution such as c = T − km ± d, or a parametrised set such as c a multiple of t when 2|m| = t²). The
    contract is checked against brute force for every band in `test/sums.test.ts`. A family may declare several bands;
    each knot takes the tightest interval. A band of **points** is evaluated at any size, so only m beyond the budget is
    outside. With `points: "same"` (the same c for every m, e.g. Prime Staircase's primes) that remainder is bounded by
    T(m) times the points' mass; with `points: "one-per-m"` (c fixed by m where the main layer is exact, e.g.
    c = T(1 − m) or c = T − km) by T(m) times the most one c can weigh.
  - **Nothing declared (the generic fallback):** an enumeration of the cheapest lines, valid everywhere but certain only
    for common scores.
- Grids: a family that declares disjoint units (`lib/v2-grid/src/sums.ts`) has the exact joint law of its terms by
  convolution (`gridJointLaw`, `exact-grid.ts`); the others are sampled from π directly (`value-grid.ts`).
- Rational and multi-line variants have no exact law yet: their knots come from direct draws (§7.0).

### 7.3 Determinism and seeds

All randomness comes from `v2-core/rng.ts`: a 32-bit counter-based generator (SplitMix32 for derivation, sfc32 for
streams; integer operations only, so every JavaScript engine gives the same sequence). A value function's draws are
derived from its seed (default `"v2"`), the family, the tie-breaker and the tilt. Re-running with the same seed, config
and code reproduces the record exactly. Stored bits are rounded to 1/10,000 bit (certified bounds outward).

### 7.4–7.5 (deleted)

Curves, snapping, caps and the too-hard backlog belonged to the rung tables and are gone (decision 23): a value
function is defined at every score, and a lookup past the best knot is extrapolated and marked `beyond` (§7.0).

### 7.6 The value record

One JSON file per rule key, committed under `lib/v2-valuation/values/<variant>/<family>/<params-hash>-<tie-breaker>.json`
(schema 7: `ruleKey`, the variant and its hash, family, params, tie-breaker, seed, config, the knots, the tail and a
`contentHash` of everything else), written by `pnpm --filter @workspace/v2-valuation values`. The engine bundles them
(`artifacts/engine/convex/v2/valuesIndex.gen.ts` and `valuesCurves.gen.ts`, `scripts/gen-v2-values.mjs`, `--check` in CI); the game header records each
dealt rule's `contentHash` (§9).

### 7.7 Values at run time

When an object's state changes, the server evaluates each player's rule on it (§4.2) and looks up bits in the rule's
value function at that score (`valueLookup`). This is a few element computations per player: no sampling at run time.
Values are stored per (object, player) (§10).

### 7.8 Resolution: enough bits on a line

#347 measured rule tops of 2 to 5 bits on one integer line. The owner (decision 12): that means the rules are not
creative enough, not that the object is too small. The answer is layers (§4.1): the tie-breaker orders the lines at
every main value, and a layer about size or factor structure climbs into the rare states the confining code makes rare
(§2.5). The other levers remain, all configuration: alternative tie-breakers (decision 14), rational scores, rarer
parameters, and lines per object.

## 8. Points from bits

For object x and player i with rule r_i: n_i(x) = the value of r_i at x (§7.7), in bits, n_i ≥ 0.

```
π_i(x) = n_i(x) · Σ_{j ≠ i} n_j(x)                       the player's points on the object
standing_i = Σ over live objects x of π_i(x)              published each tick; final score = the standing at the end
```

This is today's payoff with no defence goal (`lib/game-core/src/scoring.ts`, `π_i = n_i · max(0, Σ_{j≠i} n_j)`; with
n ≥ 0 the max is redundant). Disclosure is unchanged: a player sees its own n_i, the peer sum Σ_{j≠i} n_j and π_i per
object, and everyone sees standings. Hold rarity and defence goals are not part of v2's first version.

**Disclosure while live (v1's public log, restored).** While a game is live a player sees the peer sum with the
disclosure noise (`peerNoiseBits`, σ bits, default 8: a keyed function of the object's state, one draw for every
viewer, so own + others shown is one salience), and π_i and the standings built on the noisy sum; stored values are
exact and an ended game shows everything exact. Nothing a player reads about another player's transformation says who
made it (no mover, agent, calls or cost) until the end. **Any conditional act** (v1's `only_if_better`: commit only if
it raises the owner's payoff) must decide on the disclosed values (own exact, others with their noise), never the exact
ones: each conditional act answers one comparison, so deciding on exact values would let an agent binary-search the
exact peer sum in about a dozen acts (public-log-design.md §5.2 on archive/engine-v1). v2 has no conditional act yet.

## 9. The event log and replay

### 9.1 Events

One append-only table `v2Events` per game, ordered by `seq` (dense from 0). Every event is small and self-contained:

| Kind | Payload |
|---|---|
| `gameStarted` | header: code version (git commit of the deploy), object type and version, variant JSON and hash, economy constants, room settings, seeds, players, dealt rules (family, params, tie-breaker, artefact `contentHash`) |
| `objectBorn` | object id, state wire, birth-walk step count |
| `act` | tick, object id, agent id, player id, act seed, queries (op, ref, bits), calls (wire), per-call prices, outcome (`committed`, `skipped`, `failed` with reason), state before and after (wire), read bits, charge |
| `values` | object id, per player: score (wire), level, bits (the server-private record of §7.7) |
| `tick` | tick number, world time, standings |
| `gameEnded` | final standings |

### 9.2 Replay

Replay folds the events: it never recomputes prices, values or births, so a replay stays correct when code or artefacts
change. While a game is live, each player's reads of events are filtered to what that player may know (rules are
private; `values` rows are per player); after the end everything is open.

### 9.3 Re-execution

Given the header's code version, every act is also re-executable: the act seed, the offered state, the agent's source and
the sandbox's determinism give the same queries and calls. A test re-executes a short recorded game and compares every
`act` event. Seeds derive from the game seed: `birth`, `offers`, `act:<n>`.

## 10. What a client subscribes to (Convex)

New tables, all prefixed `v2`, in the existing deployment (auth and users are shared; nothing else is). They follow the
read rules of `docs/convex-read-architecture.md` (R1–R9): per-component subscriptions, one document or one index page per
query, hot fields apart from cold ones, small per-viewer documents written by the tick.

| Table | One document per | Fields | Written by |
|---|---|---|---|
| `v2Rooms` | room | name, owner, members, variant id, settings | room commands |
| `v2Games` | game | room, status, variant, seed, times, header hash | lobby, tick (status only) |
| `v2Rules` | (game, player) | family, params, artefact hash (private to the player) | deal |
| `v2Objects` | object | game, object number, born at (cold) | tick |
| `v2ObjectStates` | object | state wire, version, changed at (hot) | tick |
| `v2ObjectValues` | (object, player) | score wire, level, bits n_i, peer sum, points π_i, version | tick |
| `v2Agents` | agent | player, language, source hash, power share (cold) | commands |
| `v2AgentEnergy` | agent | energy, acts, spend (hot) | tick |
| `v2Standings` | game | rows: player, standing, rank | tick |
| `v2Events` | event | §9.1 | tick, lobby |

Queries a page uses: the object skeleton (an index page of `v2Objects` by game, paginated, virtualised), one
`v2ObjectStates` and one `v2ObjectValues` (for the viewer) per visible object, `v2Standings`, the viewer's `v2Rules`
row, the viewer's agents and their energy, and an index page of `v2Events` by (game, player) for the agent log. Each new
query gets an entry in the query-cost gate (R8). Every query requires sign-in.

**Operations are affordances** (owner decision 16): each command (check, summon, replace, destroy, allocate power,
ready, pause, chat, the owner's room commands) is a separate Convex function defined once in `lib/v2-affordances`, which
generates the assistant tools, MCP, CLI, palette and buttons (integration plan §2.5); there is no single `submit`
envelope.

**The integration plan extends this table** (`docs/engine-v2/integration-plan.md` §2.2, §4.2, which are authoritative
for the schema): `v2Players`, `v2Moves` (per-viewer act-log rows written by the tick, replacing reads of `v2Events` by
the agent log), `v2StandingsHistory`, `v2AgentPrograms`, `v2Digests`, `v2Members`, `v2Chat`, `v2Receipts`, `v2Layouts`,
per-player sort indexes on `v2ObjectValues`, and the card sentence and the ladder with per-rung rarities on `v2Rules`.
With layered ladders (§4.1), `v2Rules` also records the dealt tie-breaker, and `v2ObjectValues` the level.

## 11. The rendering contract

### 11.1 Scenes

A renderer exists per **scene kind**, never per rule family. `layout(state, site, args?)` returns `SceneData`, a list
of primitives, each tied to the element it draws, plus optional **scenery**: fixed furniture of the lens (a chessboard,
a dot field, a circle with rim pegs, two rulers) that no mark may cite and no score reads:

```ts
type SceneData =
  | { kind: "equation"; template: (string | { el: string })[] }           // ["y = ", {el:"m"}, "x + ", {el:"c"}]
  | { kind: "plane"; window: [Q, Q, Q, Q]; items: PlaneItem[] }          // line, points, segments, region, axis ticks
  | { kind: "table"; columns: { header: string; el: ElementRef }[] }
  | { kind: "sequence"; terms: { n: number; el: ElementRef }[]; picture: "tiles" | "dots" }
  | { kind: "machine"; stages: { label: string; el?: string }[]; input: ElementRef; output: ElementRef }
  | { kind: "pegboard"; window: [number, number]; on: ElementRef }
  | { kind: "dial"; size: number; items: PlaneItem[] }                    // a ring of pegs, a gear pointer, a cipher wheel
  | { kind: "rulers"; scales: [Q, Q, Q, Q]; threads: ElementRef[] };      // two parallel scales joined by threads
// every kind may add `scenery?: Scenery[]` (polygons, paths, labels and grids in floats, drawing only)
// a "sequence" term may cite a symbol element (letters, notes), not only a number
type PlaneItem = { draw: "line" | "point" | "segment" | "region" | "path" | "tick"; el: ElementRef };
```

Marks (§4.3) are drawn by the same renderer onto the primitive of the element they cite; dynamic elements cited by marks
(a prime on the y axis, the point at x = q) are added to the scene by the marks layer. Undefined elements are drawn as
their sentence in place.

### 11.2 Compact and expanded

- **Compact** (object list rows, the goal card's example, about 160 × 100 px): the rule's `primary` representation of
  the object's state with the rule's marks, plus the player's bits.
- **Expanded** (the object popover, the replay inspector): every representation in the rule's `depends`, side by side in
  that order, each with the marks citing its elements, and the terms as a short worked computation ("area = ½ · 4 · 3 =
  6; target 8; gap 2").
- A viewer's own rule is evaluated in the browser from the object's state (v2-linear is imported by the page); the
  server sends only values. Other players' rules never reach a client during a live game.

### 11.3 Cross-highlighting

Hovering an element highlights every element with the same `meaning` (and the same arguments) in every representation
shown. A test renders each scene kind for a corpus of states to static markup and checks that every mark's element
produced a node.

## 12. The first object type: the line

### 12.1 State and domains

The state is a tuple of k lines (k = `linesPerObject`, default 1). A line is the primitive integer triple (a, b, c) of
a·x + b·y + c = 0 with gcd(|a|, |b|, |c|) = 1 and the sign fixed by b > 0, or b = 0 and a > 0. Non-vertical lines
(b > 0) are y = mx + c with m = −a/b and c = −c/b (the general form's c and slope-intercept's c are different elements:
`gen.c` and `si.c`).

| Variant param | Values | Meaning |
|---|---|---|
| `domain` | `"Z"` | lines y = mx + c with integer m and c (b = 1); no vertical lines |
| | `"Q"` | every line with rational coefficients, vertical included |
| `linesPerObject` | 1 … 8 | k |
| `argDomain` | `"Z"`, `"Q"` | whether mutator arguments are integers or rationals (default: the domain's) |

Variants shipped first: `line-z` (Z, k = 1), `line-q` (Q, k = 1), `line-z4` (Z, k = 4).

### 12.2 Read length

The mixed number code of §2.5 (owner decision 17):

- Domain Z: φ = Σ_lines mixedInt(m) + mixedInt(c).
- Domain Q: φ = Σ_lines mixed⅛(a) + steps¹⁄₁₆(b) + mixed⅛(c) of the primitive triple (code C3 of fractions.md §4, a
  trial; `LINE_Q_CODES` in `lib/v2-linear/src/line.ts`): mixed⅛ is the mixed code with p(0) = 1/8 (0 → 3 bits,
  ±n → 1 − log2(7/8) + mixedPos(n)), steps¹⁄₁₆ the steps code with p(0) = 1/16 (0 → 4 bits, ±n → 1 − log2(15/16) +
  GEO + STEP·(|n| − 1), GEO = −log2(1 − 2^−STEP)). Each is complete (Kraft sum 1) and unbounded. (The Kraft sum of the
  triple's code is below 1: it is defined on all triples, the domain is a subset.)

### 12.3 Representations

Elements are per line. "—" means undefined for that line, with the sentence in brackets.

| Id | Scene | Coordinates | Derived | Dynamic | Undefined for |
|---|---|---|---|---|---|
| `si` y = mx + c | equation | `m` (gradient), `c` (y-intercept) | `sign` | `y(q)` | vertical lines |
| `gen` ax + by + c = 0 | equation | `a`, `b`, `c` (primitive, sign rule above) | `sum` = a + b + c, `normal` = (a, b) | `value(px, py)` = a·px + b·py + c | — |
| `int` x/p + y/q = 1 | equation | `p` (x-intercept), `q` (y-intercept) | `ratio` = q/p | — | lines through the origin, lines parallel to an axis |
| `cart` the plane | plane | `line` (segment in the window [−12, 12]²) | `xInt`, `yInt` (points), `slope` (rise/run as a number) | `pointAtX(q)`, `pointAtY(q)`, `yAxisMark(y)`, `xAxisMark(x)`, `ghost(g)` (the line of gradient g through the same y-intercept) | `xInt` for horizontal lines, `yInt` for vertical |
| `tri` intercept triangle | plane | — | `legX` = \|x-intercept\|, `legY` = \|y-intercept\|, `area` = legX·legY/2, `hyp2` = legX² + legY² | — | through the origin, parallel to an axis |
| `seq` growth pattern | sequence | `first` = y(1), `step` = m | `zeroth` = c | `term(n)` = y(n) | vertical lines |
| `table` table of values | table | — | `y0` … `y5` = y(0) … y(5) | `y(q)` | vertical lines |
| `mach` function machine (×m, then +c) | machine | `times` = m, `plus` = c | `fixed` = c/(1 − m), `lamp` = m/(m − 1) (the nomogram) | `in(q)`, `out(q)` = y(q), `reverse(q)` = x(q) = (q − c)/m, `twice(q)` = y(y(q)) | vertical lines; `reverse` for horizontal lines; `fixed`, `lamp` for m = 1 |
| `peg` pegboard | pegboard | — | `pegs` (count of lattice points of [−6, 6]² on the line), `firstPeg`, `lastPeg` | `nearestPeg(px, py)` | — (not built yet) |
| `table` table of values | table | — | — | `y(x)` (x whole) | vertical lines |
| `norm` the line seen from the origin | plane | — | `dist2` = c²/(a² + b²), `foot` (the perpendicular's foot) | — | — |
| `coins` exact change: a·x + b·y = N | pegboard | — | `bill` N = −c, `ways` (whole x, y ≥ 0), `smallestPile` | — | unless a > 0 and b > 0 |

Shared meanings: `yIntercept` (si.c, cart.yInt's y, int.q, seq.zeroth, table.y0, mach.out(0), mach.plus), `gradient`
(si.m, seq.step, mach.times, cart.slope), `xIntercept` (cart.xInt's x, int.p, mach.reverse(0)), `valueAt(q)` (si.y(q),
table.y(q), seq.term(q), mach.out(q), cart.pointAtX(q)'s y).

### 12.4 Mutators

N = 9 on line-z and line-z4: log2 9 = 3.17 bits of "which". line-q offers ten (the nine and the turn, below) with a weighted code: the nine at log2 (9/0.95) = 3.24 bits, the turn at log2 20 = 4.32. k sites add log2 k. Far moves are dear (owner design,
2026-11-14: "It's really expensive to move objects a long way in a single turn, by design, so all strategies should be
incremental hill climbing"): a call's arguments are choices (an axis, which coefficient, a pivot's anchor x0, priced as
before: x0 by steps, owner decision 17) and at most one size, priced against the rest of the call. With o the bits of
which + where + the choices, a size σ costs rate(o)·σ − o, so the call's whole fee is rate(o)·σ and a move of size n costs
exactly n unit moves (v2-core `codes.ts`, `amountCode` and `factorCode`). `nz` is an amount added, of size |p| + q − 1
(a whole number's size is |k|; a fraction pays for its denominator); a slide (u, v) has size σ(u) + σ(v); a factor p/q
has size log2(|p|·q), its digits, so a factor costs what its prime factors cost one by one. rate(o) is the least that
keeps each code a complete (sub-)probability: for an amount on Z, 2^o·2r/(1 − r) = 1 with r = 2^−rate (rate = log2 19 =
4.25 for o = log2 9); on Q, 2^o·2r/(1 − r)² = 1 over sign, p ≥ 1 and q ≥ 1 (4.32); for a slide, 2^o·((1 + g)² − 1) = 1
with g the amount sum (5.25 on Z); for a factor, 2^(o+1)·(ζ(rate)² − 1) = 1 (5.39). Draws not in lowest terms are the
codes' leftover mass. A unit shift or tilt on line-z costs 4.25 bits plus its surcharge (it was 5.94); y = x + 1 →
y = 30x + 7 in one act costs W = 157.2, charge 1392.4, against 250.1 for the 35 unit acts (it was W = 36.9, charge 104.9,
against 346.7).

| Id | Representations | Arguments (bits) | Effect on (m, c) or (a, b, c) | Inverse |
|---|---|---|---|---|
| `si.shift` | si, cart, table | k: nz | c += k (move up k) | `si.shift(−k)` |
| `si.tilt` | si, mach | k: nz | m += k (turn about the y-intercept) | `si.tilt(−k)` |
| `seq.step` | seq | k: nz | m += k, c −= k (change the step, keep term 1) | `seq.step(−k)` |
| `cart.pivot` | cart, peg | x0: int; k: nz | m += k, c −= k·x0 (turn about the point at x = x0) | `cart.pivot(x0, −k)` |
| `cart.slide` | cart | u: int; v: int; (u, v) ≠ (0, 0) | c += v − m·u (translate by (u, v)); vertical lines: a·x moves by u | `cart.slide(−u, −v)` |
| `cart.mirror` | cart | axis: choice of 4 (2 bits): `x`, `y`, `origin`, `diagonal` | (−m, −c), (−m, c), (m, −c), the inverse function (x and y swapped) | self |
| `gen.nudge` | gen | which: choice of 3 (log2 3); k: nz (integers) | a, b or c += k; refused when the result has a common factor (it would be divided through, a one-way move) or would turn the equation over | `gen.nudge(which, −k)` |
| `int.move` | int | axis: 1 bit; k: nz | p += k or q += k, keeping the other | partial: `int.move(axis, −k)` where the result has both intercepts |
| `mach.stretch` | mach | factor f: digits (`nonzeroRat`), f ≠ ±1 | m ·= f, c ·= f (every output × f) | `mach.stretch(1/f)`, the same price; partial only where 1/f leaves the domain |

Results outside the variant's domain are invalid (a Z-domain line with a fractional coefficient, a vertical line in Z;
there is no limit on size, owner decision 26). The cheap-in-one-lens, dear-in-another examples of #346 §4.5 hold: y = x + 5 → y = 3x + 3 is one
`seq.step(2)` (steps on 2) against `si.shift(−4)` and `si.tilt(2)` (steps on 4 and on 2).

**The lens mutators.** The first five of [lenses-and-mutators.md](lenses-and-mutators.md) §5 (owner decisions 25, 27
and 28). One is in the beginner line set (coordinator's call 23): `line-q` offers the nine and `rot.turn` (N = 10), with
a weighted "which" code (`Variant.which`, a prefix code with Kraft sum 1; the walk draws a mutator with probability
2^−which and each size code uses its own mutator's which bits as o): the nine at log2 (9/0.95) = 3.24 bits, the turn at
log2 20 = 4.32. `basis.zoom` joined it and was taken out the same day (a straight hill: thirty zooms by 7 climbed Prime
Landing 227 bits); it returns when the "no straight hill" check passes for every dealt family. The other four
(`coef.swap`, `basis.lean`, `basis.zoom`, `fold`) are a trial, offered beside line-q's ten by `line-q-lenses` only
(preset `lines-lenses`, N = 14): line-q's ten keep their proportions in 3/4 of the mass, the four share 1/4 (log2 16
each). `line-q-lenses` has line-q's params, so the same law π ∝ 2^−φ, and reads line-q's value functions
(`Variant.valuesOf`); a value function does not depend on the menu, so its key hashes only the object type and the
variant's params (`valuesHash`, lib/v2-valuation keys.ts): a menu change keeps every stored value and its key. Representation moves (turn, swap, fold) are priced as choices and
digits; the lean adds an amount (priced by size); the zoom is a factor (digits). A mutator may declare a least fee
(`Mutator.floor`, the same for a call and its inverse): `coef.swap` pays at least φ of the dearer of the two numbers it
swaps (each read with line-q's code for a and c),
since a swap keeps every digit (Δφ ≈ 0) and was otherwise nearly free. Each is undone by itself or by the same
mutator at the same fee (exact potential; `lib/v2-linear/test/lens-mutators.test.ts`).

| Id | Representations | Arguments (bits) | Effect | Inverse |
|---|---|---|---|---|
| `rot.turn` | cart, norm | centre: `origin` (1) or the pin at x = x0 (1 + steps(x0)); turn: `left` / `right`, a quarter turn (2), or tan θ = t ≠ 0 (1 + `nonzeroRat`) | about a pin: m′ = (m + t)/(1 − m·t) through (x0, y(x0)), refused for vertical lines and vertical results; about the origin: (a, b, c) ↦ (a·q − b·p, a·p + b·q, c·r) for t = p/q with p² + q² = r² (a Pythagorean angle; others refused), quarter turns (−b, a, c) and (b, −a, c) | the same centre, −t (left ↔ right) |
| `coef.swap` | si, gen | pair: `m-c` or `b-c` (1) | (a, b, c) ↦ (c, b, a): y = mx + c becomes y = cx + m (they cross at x = 1); or (a, c, b) | self |
| `basis.lean` | crossing, cart | k: nz | (a, b, c) ↦ (a, b + a·k, c): the run per unit rise −b/a goes down by k, the x-intercept stays; refused for level lines | `basis.lean(−k)` |
| `basis.zoom` | tri, norm | factor f: digits, f ≠ ±1 | (a, b, c) ↦ (a, b, c·f): both intercepts × f, the gradient stays; refused through the origin | `basis.zoom(1/f)` |
| `fold` | cart | either x0 (steps) and s (`rat`) for the crease of gradient s through the pin at x = x0, or mirror: a line a,b,c paid from scratch, φ(M) = Σ mixedInt; 1 bit for which | the reflection; a crease fold of a vertical line, or one whose result is vertical, is refused (no pin to fold back about) | self |

### 12.5 Rule families

Every family has a main layer in school-textbook terms and alternative tie-breakers (§4.1); a dealt rule uses one of
them. **The beginner pool** is the curator's pool (`docs/engine-v2/layered-line-rules.md` §10.5), the owner's two examples
kept, plus Ruler, Exact Change and Pythagorean Area restored from the old game (owner decision 22: a rule no exact sum
can value is valued by sampling, with honest intervals). It is `beginnerPool` in `lib/v2-linear/src/presets.ts`, dealt
by `lines-beginner` on `line-q` (owner decision 2: lines are played on the rationals), by `lines-whole` on `line-z` (an
explicitly chosen, easier variant) and by `lines-four` on `line-z4`. A family with a summation plan in `sums.ts` (§7.2)
is valued exactly where the sum applies; the rest by sampling. A
family's first tie-breaker is its default:

| Family | Main layer (rep) | Tie-breakers (alternatives) | Sum |
|---|---|---|---|
| `prime-landing` | the y-intercept close to a prime (si) | `big-prime` (that prime), `prime-gradient` (m close to a prime), `next-prime` (y(1) close to a prime), `m-spf`, `m-gpf` (the gradient's smallest and largest prime factor) | separable; the restored ones sampled |
| `square-area` | the triangle's area close to a square (tri) | `spf`, `lpf` (the root's smallest and largest prime factor), `omega` (Ω of the root) | band: 2\|m\| = t², c a multiple of t |
| `whole-crossing` | the x-axis crossing −c/m close to a whole number k (cart) | `k-spf`, `k-gpf` (k's prime factors), `m-spf` | band: c a multiple of m |
| `divisibility-ladder` | the run of n dividing y(n), the line not through (0, 0) (table) | `m-spf`, `m-gpf`, `steep` (\|m\|), `m-prime` (m close to a prime) | separable (n \| mn + c ⇔ n \| c) |
| `treasure` | y(k) close to T (table), (k, T) = (2, 37) | `prime-terms` (different primes among y(1)…y(8)), `prime-gradient`, `square-start` (c close to a square), `m-spf`, `m-gpf` | band: c = T − km ± 4; the restored ones sampled |
| `same-on-both-rulers` | the number the machine leaves unchanged close to T (mach), T = 6 | `steep` (\|m − 1\|), `prime-start` (\|c\| close to a prime), `whole-values` (different whole numbers among y(−5)…y(5)), `whole-lamp` (m/(m − 1) close to whole), `m-spf`, `m-gpf` | band: c between (T ± 2)(1 − m); the restored ones sampled |
| `prime-gradient` | the gradient close to a prime (si) | `prime` (that prime), `cPrime` (c close to a prime), `c-spf`, `c-gpf` (the y-intercept's prime factors) | separable |
| `prime-staircase` | the run of different primes from y(0) (seq) | `first-prime`, `last-prime` (the run's last prime), `near-miss` (the first non-prime term close to a prime), `step-back` (y(−1) close to a prime) | band: c over the primes; the restored ones sampled |
| `ruler` | the distance² from (0, 0) to the line close to a square k², k ≥ 1 (norm) | `far` (k; not on whole lines), `prime-gradient`, `square-area` | sampled |
| `exact-change` | reading a·x + b·y = N as coins a, b paying N: the number of ways close to 6 (coins) | `big-piles` (the smaller pile at its smallest; not on whole lines), `big-bill` (N), `prime-coins` | sampled |
| `pythagorean-area` | the triangle's area close to A = 6 (tri) | `slanted-square` (side² close to a square), `prime-height` (\|c\| close to a prime), `whole-legs` | sampled |

The owner's other first examples remain outside the pool (`families.ts`): `triangle-area`, `m-meets-c`, `crossing-check` and
`whole-intercept`.

### 12.6 Variants and multi-line scoring

For k > 1 each family is evaluated per line and the object's score is `[Σ_lines level(line)]` then the per-line scores in
decreasing order. Its artefact is calibrated on the k-line variant; the ladder of the sum is every integer from 0 to
k·(top rung).

## 13. Sanity check: the digit grid in the same contracts

Only to test that the contracts are general; nothing here is built yet.

- **State:** an n×n array of digits (S symbols); `readLength` = n² · log2 S (constant), `sites` = 1, `origin` = a fixed
  board; variants `grid-4x4-base10` and so on.
- **Representations:** `cells` (scene `grid`; coordinates `cell(r, c)`), `lines` (derived: row, column and diagonal
  sums), `pairs` (derived: opposite-cell pairs and their sums), `blocks`. Dynamic: `cellAt(r, c)` for rules with
  positional parameters.
- **Mutators:** `cells.set(r, c, v)` (log2 n² + log2(S − 1)), `cells.nudge(r, c, k)` (distance code), `lines.paint(line,
  v)`, each plus the confining surcharge. Under owner decision 11 the grid is confined like the line: its number code
  writes a digit by its distance from a centre digit (`int(d − centre)`), the centre board is every cell at the centre
  digit, and the stationary law is no longer today's uniform rarity. The estimator's first cross-check on the grid is an
  exact power iteration on a 2×2 board.
- **Rules:** Opposite Nines reads `pairs`, records one term per pair, scores the count; its marks focus the pairs that
  count. Today's "parts add up to the ordinal" invariant is the §4.2 term rule.

The contracts need no grid-specific branch; the grid scene renderer is the one new piece.

## 14. Build plan

Done: PR 1 (this specification, #349), PRs 2–4 (v2-core, v2-linear, v2-valuation, #356, and their amendment for owner
decisions 11–14), PR 6 (v2-sandbox, #351). The plan from here is maintained in `docs/engine-v2/integration-plan.md`
(§5 and the change list of §5.7), which supersedes the table that stood here. In short: W1 (this workstream) does spec
PR 5 (int, table and peg representations; families 7–12; `line-q` and `line-z4` artefacts; `presets.ts` with the
beginner pool from the calibration report; `ArgCode.enumerate`; `RuleFamily.examples`) and later the grid (M4); W2 the
agent host and starters; W3 the Convex server and v2-economy; W4 the views; W5 the app on v2 data.

Shared interfaces, each frozen in the PR that introduces it and changed only by a PR of its own: the v2-core types
(§2–§5), the line's element names (§12.3), the artefact JSON (§7.6), the host channel messages (§6.5), and the v2 API
contract (integration plan W3-1).
