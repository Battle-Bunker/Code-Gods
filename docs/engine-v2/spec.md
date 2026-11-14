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
   from a rule's parameters. A rule is a **ladder of two layers**: a main layer in school-textbook terms, then one
   tie-breaker chosen from the family's alternatives, which counts once the main layer is at its top; every layer a graded quantity, never a yes/no test. Rules compute each layer
   from elements through an evaluation context that records every term, and their annotation is built from those same
   recorded terms, so the picture and the score cannot disagree.
4. **Mutators belong to representations and are priced by their code length** (which mutator, where, the argument),
   plus a **confining surcharge**: the bits by which the state's read length grows. Confinement is a principle of every
   price list (owner decision 11): each object type has a gravitational centre, the state that is cheapest to write, and
   moving away from it costs more than coming back. The price list is a probability law over calls, and it drives both
   what agents pay and the walk.
5. **Value is the stationary law of the walk.** For each rule (family, parameters, variant), an offline estimator
   samples states inside each rung of the rule's score ladder, perturbs them with one walk step, builds the
   rung-to-rung matrix and takes its stationary vector. A rung's value is minus log2 of the stationary mass at least that
   good. Runs stop at a 2% error or a compute budget; results are fitted to curves and snapped; the artefact is a
   committed JSON file the server looks values up in. Unconverged or too-coarse rules go on the backlog and are not dealt.
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
| `lib/v2-valuation` | the stationary-law estimator, curve fitting, artefact format and lookup, the `calibrate` command line, committed artefacts under `artefacts/` | v2-core (and object-type packages, by registry) |
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
and mixedInt(a) + mixedInt(b) + mixedInt(c) on Q. Measured (`pnpm --filter @workspace/v2-valuation law`): on `line-z` the
line's largest number is at most 2, 20 and 162 for 50%, 90% and 99% of the stationary mass (on `line-q` 1, 12 and 81),
and 24 is about 200 times commoner than 23. The constant STEP sets how strong gravity is: the earlier Elias-gamma
("digits") code made size cost only logarithmically (#347's doubling code), and a steps-only code would make size cost
linearly whatever its factors; number-codes.md records the comparison.

### 2.6 Collisions and identity

There is no uniqueness constraint between objects: two objects may hold the same state. Each object is an independent
universe, and a mutation never fails because another object holds the result. (Decision 5 asks for collisions of
interest on few degrees of freedom; one line per object gives exactly that.)

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

A rule is a **ladder of layers** (owner decisions 12–14). The main layer is what a 12-year-old following a standard
linear-equations course can read (gradient, intercepts, substitution, a table of values); each later layer is a
tie-breaker that only counts once every earlier layer is at its top, and may be more advanced. Every layer is a graded
quantity with a direction (a distance, a count, a size) and many attainable values, never a yes/no test: "binary
decisions are worthless for extending the ladder".

```ts
export interface Layer<P> {
  readonly id: string;                                   // also the id of the term that measures it
  readonly title: string;                                // "gradient close to a prime"
  sentence(params: P): string;                           // the card's sentence for this layer
  readonly rep: string;                                  // the representation the layer is read in (its compact view)
  readonly sense: "min" | "max";                         // smaller is better (a distance) or bigger is better
  readonly measure: "distance" | "count" | "size";       // which curve calibration fits (§7.4)
  thresholds(params: P, variant: Variant): readonly Q[]; // rung thresholds, easiest first; the last is the layer's top
  rungLabel(threshold: Q, params: P): string;            // "gradient to a prime within 1/4"
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
  layer plus that tie-breaker, never a third layer. Each (family, params, tie-breaker, variant) has its own artefact, and
  `ruleKey` = object type and version + variant and its hash + family + canonical params + `tb=<id>` identifies it (§7.6).
  The deal picks the tie-breaker as it picks parameters (W3-3 decides the distribution; uniform over converged ones).
- **Won by bid** (owner decision 18): a bid names a family only; the dealer draws the winner's parameters and tie-breaker
  from that family's converged rules in the room's pool, records `wonByBid` and the `handicap` on `v2Rules`, and the
  standings carry the handicap and the net total (integration plan §5.9).
- **Continuity is checked, not trusted.** Calibration counts the distinct values each dealt layer takes among the samples
  among all samples (on the joint ladder the tie-breaker grades every main level, so it counts everywhere); a layer with fewer
  than `minLevels` (default 6) makes the rule **too coarse**, and it goes on the backlog (§7.5) whatever its values.
- **Ordering and value: value follows the order.** Scores compare as plain lexicographic tuples (coordinator's call (f):
  no gating), so the tie-breaker orders lines at every main level, and value follows that order (the coordinator,
  14 November): the ladder that values a rule is the **joint ladder** of (main level, tie-breaker level) pairs in
  lexicographic order (§4.4), so improving the tie-breaker at any main level raises bits, and a line never holds fewer
  bits than one it beats.

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
- **Saturation.** The main layer saturates at its top when a tie-breaker is dealt: a "bigger is better" layer past its top threshold
  scores as its top. Beyond its top a layer only opens the next one, so a state past an earlier top neither outranks nor
  skips the rungs of the layers after it.
- Scores compare lexicographically; `compareScores(a, b)` and `meets(score, threshold)` are in v2-core.
- A family evaluates one line when `sites = 1`. For variants with k lines a family is evaluated per line and the object's
  score is `[Σ_lines level(line score)]` followed by the per-line primary components sorted best first (§12.6).
  Calibration is per variant, so the k-line score has its own artefact (`objectLadder`).

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

### 4.4 The ladder

A **ladder** is an ascending list of rungs; rung 0 is `{ score: null }` (everything). For a one-layer rule the rungs are
the main layer's thresholds. For a dealt rule (main layer plus tie-breaker) `ruleLadder` builds the **joint ladder**: for
each main level i from 0 (anything) to the main top, the main rung i (`layer: 0`, `main: i`) followed by tie-breaker rungs
(`layer: 1`, `main: i`, score `[main threshold i, tie threshold]`). Below the main top the tie-breaker is coarsened to
`COARSE_TIE_RUNGS = 3` evenly spaced thresholds (never one: the tie-breaker still grades every main level); at the main
top all of its thresholds stand. A state's joint level is the last rung (main level, tie level) it meets in that
lexicographic order (`jointLevelOf`): its main level, then its tie-breaker among the rungs at that main level. The
coarsening keeps the ladder calibratable: each main level adds at most four rungs whose samples come from that level's
own chain, while the top, where the tie-breaker carries the rule's rare bits, keeps every step. `layerLadders` gives each
layer's own single-component ladder, which the card shows as "main part: step 5 of 8, tie-breaker: step 2 of 3". A state's **level**
is the index of the highest rung whose score it meets or beats (`ruleLadder`, `levelOf`). Ladders are what make
infinite score sets calibratable: a distance layer on rational lines declares thresholds such as `8, 4, 2, 1, 1/2,
1/4, 1/8, 0`. The calibration reports rungs that no sample reached at their level. The ladder is also what the goal
card shows as "steps to the top", and its layers are what the views call "main part" and "tie-breaker".

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
If every mutator's base price is symmetric (a call and its inverse cost the same), detailed balance holds with π ∝ 2^−φ
and prices drop out of value; the mutators of §12.4 are deliberately not all symmetric (pivot pays for its anchor, gen
nudges have no inverse, stretch and its inverse have different codes), so value depends on the price list, as decision 10
asks. Call (a): price lists need not satisfy detailed balance. The calibration reports, per price list, the
**reversibility diagnostic** (§7.5), which is the cycle test of #347 measured on levels.

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

### 7.1 What a value is

For a rule r with ladder rungs t_0 < t_1 < … < t_n on a variant, let π be the stationary law of the variant's walk
(§5.4), L_i the states at level i and U_i = ∪_{j ≥ i} L_j. The **value** of rung i is

```
V_i = −log2 π(U_i)          (V_0 = 0; V_i non-decreasing in i)
```

and a state's bits for the rule are V at its level, or, where a snapped curve exists, the curve at its score (§7.4). π
exists because prices confine (§5.3). Energy E(s) = −log2 π(s) is the "inverse PageRank" of decision 10; V is the free
energy of an upper set.

### 7.2 The estimator (normative)

Inputs: the object type, the variant, the rule, a seed, and `ValuationConfig` (`lib/v2-valuation/src/estimate.ts`):

```ts
interface ValuationConfig {
  computeBudget: number;      // walk steps in total; default 32,000,000 (the owner's "default compute investment"; ~40 s per rule)
  targetRelError: number;     // 0.02
  absFloorBits: number;       // 0.03: a 2% error in a probability (log2 1.02 = 0.029), the target for rungs below 1.5 bits
  replicates: number;         // 8 independent replicates
  burnIn: number;             // moves before sampling in each chain; default 2,000
  thin: number;               // moves between samples; default 10
  perturbations: number;      // one-step free-walk perturbations of each sample; default 4
  proposalSteps: number;      // K: a chain's moves and the perturbations are 1 … K free walk steps, uniformly; default 6
  initialSamples: number;     // samples per chain in the first pass; default 64, doubled per pass
  minLevels: number;          // 6: fewer distinct values in a dealt layer where it counts makes the rule too coarse (§4.1)
}
```

1. **Seeds, per replicate.** When the object type offers `enumerate(variant)` (small states near the centre: on `line-z`
   every y = mx + c with |m| ≤ 40, |c| ≤ 120), every enumerated state is levelled once, and each replicate starts the
   climb to a rung at a random enumerated state already on it: thin rungs (a run of six primes, an exact area) are found
   by enumeration, not by a random climb. Otherwise each replicate walks freely from `origin(variant)` for `burnIn × K` steps, then climbs,
   alternating a single walk step filtered to keep the level and a kernel proposal (1 … K walk steps, uniformly) kept
   only if the level did not drop, until each U_i is reached or 20 × burnIn proposals pass. The ladder is calibrated up to
   the last rung every replicate reached; the rungs above are dropped and the artefact says so (a rule with no reachable
   rung is `unreachable`). Replicates do not share seeds: replicates that shared a start would share its slowly
   forgotten bias, and their spread would understate the error.
2. **Sample each upper set within the stationary law.** For each replicate and each i, a chain on U_i starts at its seed,
   makes `burnIn` moves that are not sampled (so a seed from enumeration, typically far out, is forgotten before
   sampling: step 6's equilibration check tests that it was), and then moves by 1 … K free
   walk steps at a time (uniformly) and keeps the end only if it is still in U_i (U_0's chain keeps every end: it is the free walk).
   P^K has the walk's stationary law, and K-step moves connect thin upper sets that single moves cannot (with shift and
   tilt alone, no single move stays on m = c). Under detailed balance the chain's law is exactly π restricted to U_i;
   otherwise it is the standard approximation, whose error sits at the chain's own boundary, and step 6 measures it.
3. **Perturb.** Every sample, from every chain, is perturbed `perturbations` times by the perturbation kernel (1 … K free
   walk steps, uniformly; it has the walk's stationary law, so step 4's identity holds, #347 §1.4.3, and unlike a single
   step it joins levels that only a pair of moves connects, such as |c| along m = c), and each landing level is counted
   in the row of the sample's own level, kept per chain: `C[k][l][j]`. (A sample of chain U_k at level l
   is a draw from π restricted to L_l, whichever chain produced it.)
4. **The level matrix and its stationary vector.** Row l is pooled from chains U_0 … U_k for the smallest k whose counts
   at level l (over all replicates) reach 64 × perturbations and, below the top, include 16 upward transitions (the
   small rates that stitch rare levels to the rest): the free chain where it can, restricted chains only where
   they must, so each row carries as little restriction error as the samples allow. T[l][j] is the row normalised. The
   level masses w are its stationary vector (wT = w, Σw = 1, by Gaussian elimination on (Tᵀ − I) with the normalisation
   row), computed only when the sampled levels form one communicating class. Then V_i = −log2 Σ_{j ≥ i} w_j. The full
   matrix is used: transitions that skip rungs and transitions down count.
5. **Point estimate, error bars, convergence.** The point estimate uses the counts of all replicates pooled (the
   eigenvector of a noisy matrix, read through a logarithm, is biased, and pooling keeps the noise small); the error is
   the delete-one jackknife over replicates. The run is **converged** when, for every non-empty rung i ≥ 1,
   error_i ≤ max(targetRelError × V_i, absFloorBits). If not, every chain is extended to twice its samples (burn-in and
   earlier samples are kept), until converged or the next doubling would pass `computeBudget`; then it stops as
   **unconverged** with its best estimate.
6. **Diagnostics** (always reported, never used as the value):
   - **splitting estimate:** V_i^split = −Σ_{k < i} log2 (fraction of U_k's samples that lie in U_{k+1}); it agrees with
     step 4 under detailed balance; a gap larger than three combined errors flags the run;
   - **direct check:** for rungs with π(U_i) > 1/64, the free chain's fraction of samples in U_i; it is exact whatever the
     price list, and a gap larger than three combined errors flags the run;
   - **equilibration:** for each chain U_i below the top, its rate into U_{i+1} in the second half of its samples (the
     latest doubling) minus that in the first half, per replicate; the mean over replicates and that mean over its
     standard error across them (`drift` in the artefact). Replicates are independent, so the error bar carries each
     chain's autocorrelation. A drift of more than 4 standard errors and more than 2 points of rate flags the run: the
     chain had not forgotten its seed. It is tested on a negative control (Prime Gradient with no burn-in drifts on its
     upper rungs and is flagged) and on the reversible price list (no drift);
   - **reversibility:** the share of level flow that circulates, Σ_{i<j} |w_i T_ij − w_j T_ji| / Σ_{i<j} (w_i T_ij + w_j T_ji)
     (0 under detailed balance up to noise; #347's cycle test, on levels);
   - **mixing:** the integrated autocorrelation time of the free chain's level, in walk steps (feeds `birthMixSteps`, §2.4);
   - the pooled level matrix itself.

   A test (`lib/v2-valuation/test/estimate.test.ts`) checks the estimator against a price list with an exact answer
   (shift and tilt only: detailed balance holds and π ∝ 2^−φ).

### 7.3 Determinism and seeds

All randomness comes from `v2-core/rng.ts`: a 32-bit counter-based generator (SplitMix32 for derivation, sfc32 for
streams; integer operations only, so every JavaScript engine gives the same sequence). A run's stream for (replicate,
rung, doubling) is derived from `hash(seed, ruleKey, replicate, rung, doubling)`. The default seed of a committed
artefact is `"v2"`. Re-running with the same seed, config and code reproduces the artefact exactly (a test runs a small
budget twice and compares). Floating-point arithmetic happens only in step 4 and in fitting; stored numbers are rounded
to 1/10,000 bit.

### 7.4 Curves and snapping

After a converged run the estimator fits V against the **primary layer's** rung thresholds t (secondary rungs keep their
step values; single-line objects only):

- **Distance layers** (score `−d`): V(d) = α − β·log2(d + δ), δ ∈ {1/16, 1/8, 1/4, 1/2, 1, 2}; **count and size
  layers** (score `n`): V(n) = α + β·n + γ·n². Weighted least squares with weights 1/error².
- A fit is **accepted** when every rung's residual is within twice its error and the curve is non-decreasing over the
  ladder's range. **Snapping** rounds α, β, γ to the nearest 1/256 and keeps the rounded curve if it is still accepted.
- With a snapped curve the server uses the curve at the state's own primary score (clamped between the values of the
  state's rung and the next), which gives continuous values between rungs; without one it uses the rung's step value.
- A curve may instead be marked `analytic` with a reference to a proof (a markdown file under `docs/engine-v2/proofs/`),
  in which case the empirical run is its test: the analytic curve must lie within the run's error bars.

### 7.5 The too-hard backlog

A rule (family, parameters, tie-breaker, variant) is dealt with its ladder **capped** (coordinator's call (g),
provisional): the artefact's `cap` is the last rung through which every non-empty rung met the error target, and a line
above the cap scores as the cap. It is **not dealable** (`dealable: false`) when it is **unreachable** at its first
rung, **too coarse** (a dealt layer takes fewer than `minLevels` distinct values, §4.1), or fewer than six rungs converge
below the cap. A rule that misses only its rarest rungs is therefore dealt, capped; the splitting, direct and
equilibration flags stay in the artefact as diagnostics. `calibrate --write` regenerates the rows of the rules it
calibrated in `docs/engine-v2/too-hard-backlog.md`, with the reasons, and `recap` recomputes every artefact's cap and the
whole file from the committed figures; a person or a later session decides whether to
change the ladder, the parameters or the family, or to raise the budget for it explicitly (an artefact records the
budget it used).

### 7.6 The artefact

One JSON file per rule key, committed under `lib/v2-valuation/artefacts/<variant>/<family>/<params-hash>-<tie-breaker>.json`:

```json
{ "schema": 2, "ruleKey": "...", "objectType": "line", "objectTypeVersion": 1, "variant": "line-z", "variantHash": "...",
  "family": "prime-gradient", "params": {}, "tieBreaker": "prime", "seed": "v2", "config": { ... }, "status": "converged",
  "reasons": [], "rungs": [ { "score": null, "label": "anything", "layer": -1, "bits": 0, "error": 0 },
    { "score": ["-2"], "label": "...", "layer": 0, "bits": 0.41, "error": 0.006 }, ...,
    { "score": ["0", "5"], "label": "the prime at least 5", "layer": 1, "bits": 4.1, "error": 0.08 }, ... ],
  "primarySense": "min",
  "curve": { "model": "log-distance", "alpha": 3.25, "beta": 0.75, "delta": 0.5, "snapped": true },
  "diagnostics": { "reversibility": 0.03, "mixingSteps": 44, "steps": 12110645, "samplesPerChain": 4096, "distinctLevels": [21, 9], "examples": ["...per rung, a line from that rung's chain"], "split": [...], "direct": [...], "levelMatrix": [[...]] },
  "contentHash": "..." }
```

`contentHash` is a hash of everything else; the game header records it for every dealt rule (§9). `calibrate --all`
regenerates every artefact of every dealable rule; a test checks that each committed artefact's `contentHash` matches
its contents and that every rule in each variant's dealable grid has a converged artefact.

### 7.7 Values at run time

When an object's state changes, the server evaluates each player's rule on it (§4.2), finds the level from the ladder,
and looks up bits from the artefact (curve or step), at most the cap's (§7.5). This is a few element computations per player: no sampling at run
time. Values are stored per (object, player) (§10).

### 7.8 Resolution: enough bits on a line

#347 measured rule tops of 2 to 5 bits on one integer line. The owner (decision 12): that means the rules are not
creative enough, not that the object is too small. The answer is the ladder of layers (§4.1): the joint ladder (§4.4)
grades the secondary at every primary level and in full at the primary's top, so its rungs stack above it, and a layer
about size or factor structure climbs into the
rare states the confining code makes rare (§2.5). The other levers remain, all configuration:

1. **Tie-breakers.** Every family has a main layer and alternative tie-breakers; a dealt rule uses the main layer and one
   of them (no third layer, decision 14). The calibration prints bits per rung of the whole ladder, so the reach of each
   tie-breaker is visible.
2. **Ladders on rational scores.** Distance layers on the `Q` domain have values all the way down to d = 0.
3. **Rarer parameters.** A dealable grid may include rarer targets; each artefact tells the dealer its rule's top.
4. **Lines per object.** A k-line variant sums per-line levels (§4.2), so tops grow roughly k-fold.

The default is one line per object (call (c)); the beginner pool is chosen from the calibration report in
`v2-linear/presets.ts` (spec PR 5).

## 8. Points from bits

For object x and player i with rule r_i: n_i(x) = the value of r_i at x (§7.7), in bits, n_i ≥ 0.

```
π_i(x) = n_i(x) · Σ_{j ≠ i} n_j(x)                       the player's points on the object
standing_i = Σ over live objects x of π_i(x)              published each tick; final score = the standing at the end
```

This is today's payoff with no defence goal (`lib/game-core/src/scoring.ts`, `π_i = n_i · max(0, Σ_{j≠i} n_j)`; with
n ≥ 0 the max is redundant). Disclosure is unchanged: a player sees its own n_i, the peer sum Σ_{j≠i} n_j and π_i per
object, and everyone sees standings. Hold rarity and defence goals are not part of v2's first version.

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
| `heightCap` | integer | a safety bound on \|a\|, \|b\|, \|c\| (default 10^6); a call past it is invalid; its effect on values is below the error bars because the surcharge makes such states vanishingly rare (checked: the direct check in §7.2 reports the fraction of samples above cap/1000) |

Variants shipped first: `line-z` (Z, k = 1), `line-q` (Q, k = 1), `line-z4` (Z, k = 4).

### 12.2 Read length

The mixed number code of §2.5 (owner decision 17):

- Domain Z: φ = Σ_lines mixedInt(m) + mixedInt(c).
- Domain Q: φ = Σ_lines mixedInt(a) + mixedInt(b) + mixedInt(c) of the primitive triple. (The Kraft sum is below 1: the code
  is defined on all triples, the domain is a subset.)

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

N = 9 in every first variant: log2 9 = 3.17 bits of "which". Under mixed costing (§5.2) `nz` is an amount added, priced
by steps (an integer on the Z argument domain, a rational on Q), `int` a position or displacement that may be 0, also by
steps, and a factor is priced by digits. k sites add log2 k.

| Id | Representations | Arguments (bits) | Effect on (m, c) or (a, b, c) | Inverse |
|---|---|---|---|---|
| `si.shift` | si, cart, table | k: nz | c += k (move up k) | `si.shift(−k)` |
| `si.tilt` | si, mach | k: nz | m += k (turn about the y-intercept) | `si.tilt(−k)` |
| `seq.step` | seq | k: nz | m += k, c −= k (change the step, keep term 1) | `seq.step(−k)` |
| `cart.pivot` | cart, peg | x0: int; k: nz | m += k, c −= k·x0 (turn about the point at x = x0) | `cart.pivot(x0, −k)` |
| `cart.slide` | cart | u: int; v: int; (u, v) ≠ (0, 0) | c += v − m·u (translate by (u, v)); vertical lines: a·x moves by u | `cart.slide(−u, −v)` |
| `cart.mirror` | cart | axis: choice of 4 (2 bits): `x`, `y`, `origin`, `diagonal` | (−m, −c), (−m, c), (m, −c), the inverse function (x and y swapped) | self |
| `gen.nudge` | gen | which: choice of 3 (log2 3); k: steps (integers) | a, b or c += k, then renormalise | none: dividing by the new gcd loses the scale |
| `int.move` | int | axis: 1 bit; k: nz | p += k or q += k, keeping the other | partial: `int.move(axis, −k)` where the result has both intercepts |
| `mach.stretch` | mach | factor f: digits (`nonzeroRat`), f ≠ ±1 | m ·= f, c ·= f (every output × f) | `mach.stretch(1/f)`, the same price; partial only where 1/f leaves the domain |

Results outside the variant's domain are invalid (a Z-domain line with a fractional coefficient, a vertical line in Z, a
line past `heightCap`). The cheap-in-one-lens, dear-in-another examples of #346 §4.5 hold: y = x + 5 → y = 3x + 3 is one
`seq.step(2)` (steps on 2) against `si.shift(−4)` and `si.tilt(2)` (steps on 4 and on 2).

### 12.5 Rule families

Every family has a main layer in school-textbook terms and alternative tie-breakers (§4.1); a dealt rule uses one of
them. **The beginner pool** is the curator's (`docs/engine-v2/layered-line-rules.md` §8, definitions in
`docs/engine-v2/scripts/line-families.mjs`), built in `lib/v2-linear/src/beginner.ts` and dealt by the presets of
`presets.ts` (`lines-beginner` on `line-z`, `lines-rational` on `line-q`, `lines-four` on `line-z4`). A tie-breaker about a
prime's size has one rung per prime (the curator, #385): primes up to 31, the last prime of a staircase run up to 47.
A family's first tie-breaker is its default:

| Family | Main layer (rep) | Tie-breakers (alternatives) | Params |
|---|---|---|---|
| `prime-staircase` | the run of different primes from y(0): max (seq) | `first-prime`, `last-prime` (sizes), `near-miss`, `step-back` (distances to a prime) | — |
| `square-area` | the triangle's area close to a square: min (tri) | `spf` (the root's smallest prime factor, default), `lpf` (its largest), `omega` (Ω of the root) | — |
| `treasure` | y(k) close to T: min (table) | `prime-terms` (different primes among y(1)…y(8)), `prime-gradient`, `square-start` | (k, T) = (2, 37) |
| `ruler` | distance² from (0, 0) close to a square: min (norm) | `far` (that distance), `prime-gradient`, `square-area` | — |
| `exact-change` | ways to pay N with coins a and b close to 6: min (coins) | `big-piles`, `big-bill`, `prime-coins` | ways = 6 |
| `prime-landing` | the y-intercept close to a prime: min (si) | `big-prime` (that prime), `prime-gradient`, `next-prime` (y(1)) | — |
| `same-on-both-rulers` | the number the machine leaves unchanged close to T: min (mach) | `steep` (\|m − 1\|), `prime-start`, `whole-values`, `whole-lamp` | T = 6 |
| `pythagorean-area` | the triangle's area close to A: min (tri) | `slanted-square`, `prime-height`, `whole-legs` | A = 6 |

The owner's first examples remain as a second tier (`families.ts`): `prime-gradient`, `triangle-area`, `m-meets-c`,
`crossing-check` and `whole-intercept`, each with two tie-breakers.

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
