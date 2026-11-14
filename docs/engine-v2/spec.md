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
   from a rule's parameters. Rules compute their score from elements through an evaluation context that records every
   term, and their annotation is built from those same recorded terms, so the picture and the score cannot disagree.
4. **Mutators belong to representations and are priced by their code length** (which mutator, where, the argument),
   plus a **confining surcharge**: the bits by which the state's read length grows. The price list is a probability law
   over calls, and it drives both what agents pay and the walk.
5. **Value is the stationary law of the walk.** For each rule (family, parameters, variant), an offline estimator
   samples states inside each rung of the rule's score ladder, perturbs them with one walk step, builds the
   rung-to-rung matrix and takes its stationary vector. A rung's value is minus log2 of the stationary mass at least that
   good. Runs stop at a 2% error or a compute budget; results are fitted to curves and snapped; the artefact is a
   committed JSON file the server looks values up in. Unconverged rules go on the too-hard backlog and are not dealt.
6. **Points** are as before: own bits times the sum of the other players' bits, per object, summed over objects.
7. **Everything else is new and small**: new Convex tables, an append-only event log that replays by folding, per-viewer
   value documents, and a `/v2` route tree in the web app.

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
| `artifacts/engine/convex/v2/` | v2 tables, tick, rooms, deal, queries (§10) | v2-linear, v2-valuation, v2-agents, v2-economy |
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
| `int(n)` | n ∈ ℤ | gamma(zigzag(n) + 1), zigzag(n) = 2n for n ≥ 0, −2n − 1 for n < 0 (0 → 1 bit, ±1 → 3, ±2, ±3 → 5, ±4 → 7 or 5) |
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

### 2.5 Collisions and identity

There is no uniqueness constraint between objects: two objects may hold the same state. Each object is an independent
universe, and a mutation never fails because another object holds the result. (Decision 5 asks for collisions of
interest on few degrees of freedom; one line per object gives exactly that.)

## 3. The representation contract

```ts
export type SceneKind = "equation" | "plane" | "table" | "sequence" | "machine" | "pegboard" | "grid";

export interface Representation<S> {
  readonly id: string;                                  // "si"
  readonly title: string;                               // "slope-intercept: y = mx + c"
  readonly scene: SceneKind;
  readonly perSite: boolean;                            // true: one view per line; false: one view of the whole object
  readonly elements: readonly ElementDecl<S>[];
  layout(state: S, site: number): SceneData;            // what the renderer draws (§11), every primitive tied to an element
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
  | { kind: "symbol"; text: string }
  | { kind: "undefined"; reason: string };            // "a horizontal line never meets the x-axis"

export interface ElementRef { rep: string; name: string; site?: number; args?: Record<string, string> } // args as Q wire "p/q"
```

- **Static elements** are coordinates and derived elements: no parameters. **Coordinates** are the elements a
  representation's mutators write (`si.m`, `si.c`); together they determine the line wherever the representation is
  defined. **Derived** elements are computed (`tri.area`). **Dynamic** elements take parameters supplied by a rule or an
  agent (`mach.out(q)`, `cart.yAxisMark(y)`): this is how a rule makes "the point at x = q" or "the prime 7 on the y axis"
  into something it can score and draw.
- **Undefined is a value, not an error.** A representation that cannot express a state (slope-intercept of a vertical
  line) gives `undefined` with a sentence for every element. A rule that reads an undefined element in a score term
  scores WORST (§4.2); its annotation shows the sentence.
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

- `bits` is the information read: the sum, over the representation's **coordinates**, of the code length of their
  values (`rat` for a number, both coordinates for a point, 1 bit for an undefined element). Derived elements of the same
  representation come with it free: they are functions of the coordinates, which the agent could compute itself.
- A single element costs the code length of its value.
- Within one act, a repeated query is free, and the bits charged for one representation never exceed that
  representation's full read; the bits charged for the whole act never exceed `readLength` of the state plus the bits of
  dynamic elements asked for (an agent that reads everything pays one full read, however it asks).

## 4. The rule contract

### 4.1 Families, parameters, the card

```ts
export interface RuleFamily<S, P> {
  readonly id: string;                                   // "prime-gradient"
  readonly title: string;                                // "Prime Gradient"
  card(params: P): string;                               // one sentence a 12-year-old can read
  readonly params: readonly ParamDecl[];                 // named, typed parameters
  dealable(variant: Variant): readonly P[];              // the finite grid of parameter values a deal draws from
  readonly depends: readonly string[];                   // representation ids, in the order the expanded view shows them
  readonly primary: string;                              // one of depends: the compact view
  evaluate(ctx: EvalContext<S>, params: P): void;        // reads elements, records terms, sets the score, adds marks
  ladder(params: P, variant: Variant): readonly Rung[];  // §4.4
}
```

A rule is `{ family, params }`; a dealt rule also names the variant, and `ruleKey = family.id + canonical JSON of params
+ variantKey + objectType.version` identifies its artefact (§7.6).

### 4.2 Evaluation: score and annotation from the same terms

```ts
export interface EvalContext<S> {
  readonly state: S; readonly sites: number;
  read(ref: ElementRef): ElementValue;                   // records the read; rejects refs outside `depends`
  term(id: string, label: string, value: Q | Undef, from: readonly ElementRef[]): TermId;  // a named quantity
  score(components: readonly { term: TermId; sense: "max" | "min" }[]): void;            // exactly once
  mark(mark: Mark): void;                                // marks may only cite refs read and terms recorded here
}
export type Undef = { undefined: string };

export interface Evaluation {
  score: Score;                                          // readonly Q[] (bigger is better), or null = WORST
  terms: readonly Term[]; marks: readonly Mark[]; reads: readonly ElementRef[];
}
```

- The engine's `evaluate(rule, state)` builds the context, calls the family and returns the `Evaluation`. Every score
  component is the value of a recorded term (negated for `min`); if any is undefined the score is WORST. A mark that cites
  an element not read, or a term not recorded, throws. So the picture is built from the very numbers the score is made
  of; there is no second computation to disagree with.
- Scores compare lexicographically; WORST is below everything. `compareScores(a, b)` is in v2-core.
- A family evaluates one line when `sites = 1`. For variants with k lines a family is evaluated per line and the object's
  score is `[Σ_lines rungIndex(line score)]` followed by the per-line scores sorted best first (§12.6). Calibration is
  per variant, so the k-line score has its own artefact.

### 4.3 Marks

```ts
export type Mark =
  | { kind: "focus"; ref: ElementRef }                                       // this element counts
  | { kind: "measure"; from: ElementRef; to: ElementRef; term: TermId }      // a distance, labelled with a term's value
  | { kind: "candidate"; ref: ElementRef; term?: TermId }                    // a nearby target (a prime on the y axis)
  | { kind: "note"; ref: ElementRef; text: string };                         // short words beside an element
```

Example: Y-intercept Prime on `y = ½x + 5½` reads `cart.yInt` (11/2), makes dynamic elements `cart.yAxisMark(y=5)` and
`cart.yAxisMark(y=7)`, records terms `d5 = 1/2`, `d7 = 3/2`, `dist = 1/2`, scores `min dist`, and marks `focus yInt`,
`candidate yAxisMark(5) (d5)`, `candidate yAxisMark(7) (d7)`, `measure yInt → yAxisMark(5) (dist)`. The plane draws the
two primes as ticks on the y axis with their distances, the nearer one bold.

### 4.4 The ladder

A **ladder** is an ascending list of rungs; rung 0 is `{ score: null }` (everything). A state's **level** is the index of
the highest rung whose score it meets or beats. Ladders are what make infinite score sets calibratable: a distance rule
on rational lines declares thresholds such as `d ≤ 8, 4, 2, 1, 1/2, 1/4, 0` (as scores `−8 … 0`). Rungs must be strictly
nested in practice: the calibration drops a rung whose level is empty on its samples and reports it. The ladder is also
what the goal card shows as "steps to the top".

## 5. The mutator contract

### 5.1 Declaration

```ts
export interface Mutator<S, A> {
  readonly id: string;                                   // "si.shift"
  readonly reps: readonly string[];                      // the representations it belongs to ("si", "cart")
  readonly title: string; describe(args: A): string;     // "move the line up 2"
  readonly args: ArgCode<A>;                             // prices and samples the argument (§2.3 codes, composed)
  readonly perSite: boolean;                             // true: the call names a line
  apply(state: S, site: number, args: A, variant: Variant): S | Invalid;   // canonical result, or why not
  readonly inverse:
    | { kind: "self" }                                   // mirror: applying it twice is the identity
    | { kind: "mutator"; id: string; args(a: A): A }     // shift(k) is undone by shift(−k)
    | { kind: "partial"; id: string; args(a: A): A; note: string }   // undone where the result is defined
    | { kind: "none"; note: string };                    // gen.nudge: renormalisation loses the scale
}
export interface ArgCode<A> { bits(a: A): number; sample(rng: Rng): A | null; encode(a: A): unknown; decode(w: unknown): A }
export interface Call { mutator: string; site: number; args: unknown }      // the wire form an agent returns
```

### 5.2 Price

For a call `a` made on state s with result s′ in a variant with N mutators and k sites:

```
W(a, s) = log2 N + (perSite ? log2 k : 0) + args.bits(a) + max(0, φ(s′) − φ(s))
```

The first three terms are the call's code length: which mutator, where, the argument. The last is the **confining
surcharge** (call (b)): arriving at a state that takes more bits to read costs those extra bits. Prices are of the call
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
  bits of the representation the first quoted mutator belongs to, as if it had been viewed.
- `budget()` → `{ energy, readPrice: 1/κ, beta, hostCallsLeft, stepsLeft }`.

### 6.4 The API in TypeScript and Python

```ts
// TypeScript guest (lib/v2-agents/guest/agent.d.ts); Q is { n: bigint; d: bigint } with helpers in `Q`
declare function agent(offer: Offer): Call[] | null;
interface Offer {
  view(rep: string, site?: number): Record<string, Value>;      // Value = Q | Point | string | Undefined
  element(rep: string, name: string, args?: Record<string, Q | number>, site?: number): Value;
  myRule(): { family: string; params: Record<string, unknown>; card: string };
  myScore(): { score: Q[] | null; level: number; top: number; terms: { id: string; value: Q | null }[] };
  quote(calls: Call[]): { valid: boolean; reason?: string; bits: number[]; total: number; charge: number };
  budget(): { energy: number; readPrice: number; beta: number; hostCallsLeft: number };
}
declare function call(mutator: string, args: Record<string, unknown>, site?: number): Call;
```

```python
# Python guest (lib/v2-agents/guest/codegods.py); numbers are fractions.Fraction, undefined is None plus .why
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
- **Python (WASI CPython):** a preopened file descriptor 3. The guest library writes a length-prefixed request with
  `os.write(3, …)` and reads the reply with `os.read(3, …)`; the host's WASI `fd_write` and `fd_read` implementations for
  descriptor 3 handle the request between the two calls. No change to the pinned CPython build or bundle is needed: the
  guest library ships as the act's prelude, as today's preludes do.
- **Messages:** `{ op: "view" | "element" | "myRule" | "myScore" | "quote" | "budget", ... }` → `{ ok: true, ... } |
  { ok: false, error }`. Rationals travel as strings `"p/q"`. The host counts calls against the cap and charges reads.
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

Inputs: the object type, the variant, the rule, a seed, and `ValuationConfig`:

```ts
interface ValuationConfig {
  computeBudget: number;      // walk steps in total, all replicates and rungs; default 4,000,000 (the owner's "default compute investment")
  targetRelError: number;     // 0.02
  absFloorBits: number;       // 0.02: the error target for rungs whose value is below 1 bit
  replicates: number;         // 8 independent estimates
  burnIn: number;             // steps before sampling in each chain; default 2,000
  thin: number;               // steps between samples; default 10
  perturbations: number;      // free-walk steps drawn from each sample; default 4
}
```

1. **Seeds for each upper set.** From `origin(variant)`, run the free walk for `burnIn` steps. For i = 1 … n find a state
   in U_i by a seeded climb: walk steps that do not lower the level are accepted, others refused, until U_i is reached or
   20 × burnIn steps pass (then the rung is reported unreachable and the run is `unconverged`). Families may supply
   `exemplars(params, variant)` to seed a rung directly; the climb is the default.
2. **Sample each upper set within the stationary law.** For each replicate and each i, run the **restricted walk** on U_i:
   the walk of §5.4, where a step that would leave U_i stays put. When the price list satisfies detailed balance its
   stationary law is exactly π restricted to U_i; otherwise it is the standard approximation, and step 6 measures the bias.
   Every `thin` steps after `burnIn`, record the sample's level.
3. **Perturb.** For each sample whose level is exactly i (a draw from π restricted to L_i), take `perturbations` free
   walk steps from it (each from the sample, not chained) and count the level each lands in: `C[i][j] += 1`.
4. **The level matrix and its stationary vector.** T[i][j] = C[i][j] / Σ_j C[i][j]. The level masses w are the stationary
   vector of T (wT = w, Σw = 1), solved by Gaussian elimination on (Tᵀ − I) with the normalisation row, in doubles. Then
   V_i = −log2 Σ_{j ≥ i} w_j. This uses the full matrix: transitions that skip rungs and transitions down count.
5. **Error bars and convergence.** Each replicate yields its own V; the estimate is their mean and the error its standard
   error. The run is **converged** when, for every rung i ≥ 1, error_i ≤ max(targetRelError × V_i, absFloorBits). If not,
   the number of samples per chain doubles and the run repeats with fresh derived seeds, until converged or the next
   doubling would exceed `computeBudget`; then it stops as **unconverged** with its best estimate.
6. **Diagnostics** (always reported, never used as the value):
   - **splitting estimate:** V_i^split = −Σ_{k < i} log2 (fraction of U_k's samples that lie in U_{k+1}); it agrees with
     step 4 under detailed balance, and a gap larger than three combined errors flags bias from step 2;
   - **reversibility:** the share of level flow that circulates, Σ_{i<j} |w_i T_ij − w_j T_ji| / Σ_{i<j} (w_i T_ij + w_j T_ji)
     (0 under detailed balance; #347's cycle test, on levels);
   - **direct check:** for rungs with π(U_i) > 1/64, the fraction of free-walk samples (the U_0 chain) in U_i; it must
     agree with V_i within three errors;
   - **mixing:** the integrated autocorrelation time of the level in the U_0 chain (feeds `birthMixSteps`, §2.4).

The estimator is generic: it needs only `ObjectType`, `Variant`, `RuleFamily` and the walk.

### 7.3 Determinism and seeds

All randomness comes from `v2-core/rng.ts`: a 32-bit counter-based generator (SplitMix32 for derivation, sfc32 for
streams; integer operations only, so every JavaScript engine gives the same sequence). A run's stream for (replicate,
rung, doubling) is derived from `hash(seed, ruleKey, replicate, rung, doubling)`. The default seed of a committed
artefact is `"v2"`. Re-running with the same seed, config and code reproduces the artefact exactly (a test runs a small
budget twice and compares). Floating-point arithmetic happens only in step 4 and in fitting; stored numbers are rounded
to 1/10,000 bit.

### 7.4 Curves and snapping

After a converged run the estimator fits V against the rung thresholds' primary component t (a rational):

- **Distance rules** (score `−d`): V(d) = α − β·log2(d + δ), δ ∈ {1/16, 1/8, 1/4, 1/2, 1, 2}; **count rules** (score
  `n`): V(n) = α + β·n + γ·n². Weighted least squares with weights 1/error².
- A fit is **accepted** when every rung's residual is within twice its error and the curve is non-decreasing over the
  ladder's range. **Snapping** rounds α, β, γ to the nearest 1/256 and keeps the rounded curve if it is still accepted.
- With a snapped curve the server uses the curve at the state's own primary score (clamped between the values of the
  state's rung and the next), which gives continuous values between rungs; without one it uses the rung's step value.
- A curve may instead be marked `analytic` with a reference to a proof (a markdown file under `docs/engine-v2/proofs/`),
  in which case the empirical run is its test: the analytic curve must lie within the run's error bars.

### 7.5 The too-hard backlog

A rule (family, parameters, variant) whose run is unconverged at the default budget, unreachable at a rung, or flagged
by the splitting or direct check, is not dealable. The `calibrate` command appends it to
`docs/engine-v2/too-hard-backlog.md` with the diagnostics; a person or a later session decides whether to change the
ladder, the parameters or the family, or to raise the budget for it explicitly (an artefact records the budget it used).

### 7.6 The artefact

One JSON file per rule key, committed under `lib/v2-valuation/artefacts/<variant>/<family>/<params-hash>.json`:

```json
{ "schema": 1, "ruleKey": "...", "objectType": "line", "objectTypeVersion": 1, "variant": "line-z", "variantHash": "...",
  "family": "prime-gradient", "params": {}, "seed": "v2", "config": { ... }, "status": "converged",
  "rungs": [ { "score": null, "bits": 0, "error": 0 }, { "score": ["-2"], "bits": 0.41, "error": 0.006 }, ... ],
  "curve": { "model": "log-distance", "alpha": 3.25, "beta": 0.75, "delta": "1/2", "snapped": true },
  "diagnostics": { "splitGapBits": 0.01, "reversibility": 0.04, "directCheck": "ok", "mixingSteps": 37, "steps": 1048576 },
  "contentHash": "..." }
```

`contentHash` is a hash of everything else; the game header records it for every dealt rule (§9). `calibrate --all`
regenerates every artefact of every dealable rule; a test checks that each committed artefact's `contentHash` matches
its contents and that every rule in each variant's dealable grid has a converged artefact.

### 7.7 Values at run time

When an object's state changes, the server evaluates each player's rule on it (§4.2), finds the level from the ladder,
and looks up bits from the artefact (curve or step). This is a few element computations per player: no sampling at run
time. Values are stored per (object, player) (§10).

### 7.8 Resolution: enough bits on a line

#347 measured rule tops of 2 to 5 bits on one integer line. The design gives four levers, all configuration, none a new
mechanism:

1. **Ladders on rational scores.** Distance rules on the `Q` domain have values all the way down to d = 0 with snapped
   curves; agents get graded value for getting closer, not only at the top.
2. **Rarer parameters.** A dealable parameter grid may include rarer targets (a larger triangle area, a far term); the
   artefact tells the dealer each rule's top, and the deal may require tops within a room's band.
3. **Tie-break components.** A family may add a second score component that only matters once the first is met (Prime
   Gradient: a larger prime is better), which lengthens the ladder above the first top.
4. **Lines per object.** A k-line variant sums per-line rung indices (§4.2), so tops grow roughly k-fold (#347: four to
   eight lines reach the grid's 15–27 bits).

The default is one line per object (call (c)). The first calibration report (milestone 2) prints every rule's top so the
default variant for real games can be chosen from measurements.

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
| `gameStarted` | header: code version (git commit of the deploy), object type and version, variant JSON and hash, economy constants, room settings, seeds, players, dealt rules (family, params, artefact `contentHash`) |
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

## 11. The rendering contract

### 11.1 Scenes

A renderer exists per **scene kind**, never per rule family. `layout(state, site)` returns `SceneData`, a list of
primitives, each tied to the element it draws:

```ts
type SceneData =
  | { kind: "equation"; template: (string | { el: string })[] }           // ["y = ", {el:"m"}, "x + ", {el:"c"}]
  | { kind: "plane"; window: [Q, Q, Q, Q]; items: PlaneItem[] }          // line, points, segments, region, axis ticks
  | { kind: "table"; columns: { header: string; el: ElementRef }[] }
  | { kind: "sequence"; terms: { n: number; el: ElementRef }[]; picture: "tiles" | "dots" }
  | { kind: "machine"; stages: { label: string; el?: string }[]; input: ElementRef; output: ElementRef }
  | { kind: "pegboard"; window: [number, number]; on: ElementRef };
type PlaneItem = { draw: "line" | "point" | "segment" | "region" | "tick"; el: ElementRef };
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

- Domain Z: φ = Σ_lines int(m) + int(c).
- Domain Q: φ = Σ_lines int(a) + int(b) + int(c) of the primitive triple. (The Kraft sum is below 1: the code is defined on
  all triples, the domain is a subset.)

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
| `mach` function machine (×m, then +c) | machine | `times` = m, `plus` = c | — | `out(q)` = y(q), `reverse(q)` = x(q) = (q − c)/m, `twice(q)` = y(y(q)) | vertical lines; `reverse` for horizontal lines |
| `peg` pegboard | pegboard | — | `pegs` (count of lattice points of [−6, 6]² on the line), `firstPeg`, `lastPeg` | `nearestPeg(px, py)` | — |

Shared meanings: `yIntercept` (si.c, cart.yInt's y, int.q, seq.zeroth, table.y0, mach.out(0), mach.plus), `gradient`
(si.m, seq.step, mach.times, cart.slope), `xIntercept` (cart.xInt's x, int.p, mach.reverse(0)), `valueAt(q)` (si.y(q),
table.y(q), seq.term(q), mach.out(q), cart.pointAtX(q)'s y).

### 12.4 Mutators

N = 9 in every first variant: log2 9 = 3.17 bits of "which". Arguments are coded with §2.3's codes (`nz` = nonzero in the
variant's argument domain, `nonzero` for Z or `nonzeroRat` for Q; `int` likewise `int` or `rat`). k sites add log2 k.

| Id | Representations | Arguments (bits) | Effect on (m, c) or (a, b, c) | Inverse |
|---|---|---|---|---|
| `si.shift` | si, cart, table | k: nz | c += k (move up k) | `si.shift(−k)` |
| `si.tilt` | si, mach | k: nz | m += k (turn about the y-intercept) | `si.tilt(−k)` |
| `seq.step` | seq | k: nz | m += k, c −= k (change the step, keep term 1) | `seq.step(−k)` |
| `cart.pivot` | cart, peg | x0: int; k: nz | m += k, c −= k·x0 (turn about the point at x = x0) | `cart.pivot(x0, −k)` |
| `cart.slide` | cart | u: int; v: int; (u, v) ≠ (0, 0) | c += v − m·u (translate by (u, v)); vertical lines: a·x moves by u | `cart.slide(−u, −v)` |
| `cart.mirror` | cart | axis: choice of 4 (2 bits): `x`, `y`, `origin`, `diagonal` | (−m, −c), (−m, c), (m, −c), the inverse function (x and y swapped) | self |
| `gen.nudge` | gen | which: choice of 3 (log2 3); k: nonzero (integers) | a, b or c += k, then renormalise | none: dividing by the new gcd loses the scale |
| `int.move` | int | axis: 1 bit; k: nz | p += k or q += k, keeping the other | partial: `int.move(axis, −k)` where the result has both intercepts |
| `mach.stretch` | mach | factor f: nonzeroRat, f ≠ ±1 | m ·= f, c ·= f (every output × f) | partial: `mach.stretch(1/f)`, whose code length differs |

Results outside the variant's domain are invalid (a Z-domain line with a fractional coefficient, a vertical line in Z, a
line past `heightCap`). The cheap-in-one-lens, dear-in-another examples of #346 §4.5 hold: y = x + 5 → y = 3x + 3 is one
`seq.step(2)` (3.17 + 4 = 7.17 bits plus surcharge) against `si.shift(−4)` and `si.tilt(2)`.

### 12.5 Rule families

Twelve, the owner's four first. Every distance rule's ladder on Z is `d ≤ 13, 8, 5, 3, 2, 1, 0`, on Q `d ≤ 8, 4, 2, 1,
1/2, 1/4, 1/8, 0` (scores `−d`); count rules use every count.

| # | Family | Card | Primary; also | Params (dealable grid) | Score | Annotation |
|---|---|---|---|---|---|---|
| 1 | `prime-gradient` (owner) | Make the gradient as close as possible to a prime number. | si; cart | — | min dist(m, nearest prime); primes are positive | focus si.m; candidates: `cart.ghost(p)` for the primes p either side, labelled with their distances; note the nearer |
| 2 | `triangle-area` (owner) | The line and the two axes make a triangle; make its area as close as possible to A. | tri; cart, si | A ∈ {4, 6, 8, 12, 18} | min \|tri.area − A\| | focus legs; note area; measure area → A |
| 3 | `m-meets-c` (owner) | Make the gradient and the y-intercept as close as possible to each other. | si; cart | — | min \|m − c\| | focus si.m, si.c; on the plane, the point at x = −1 and its height (= c − m) |
| 4 | `crossing-check` (owner) | Make y(k) and x(q) as close as possible. | mach; table | k ∈ {1, 2, 3}, q ∈ {2, 4, 6} | min \|mach.out(k) − mach.reverse(q)\| | both machine runs, their gap |
| 5 | `y-intercept-prime` | Make the y-intercept as close as possible to a prime. | cart; si | — | min dist(yInt, nearest prime) | the brief's example: nearby primes as ticks on the y axis with distances |
| 6 | `treasure` | When x is k, y should be T. | table; cart | (k, T) ∈ {(2, 7), (3, 11), (4, 5), (−2, 9)} | min \|y(k) − T\| | table column k; the point (k, T) on the plane |
| 7 | `sequence-contains` | One of the first ten pattern terms should be T. | seq; table | T ∈ {12, 20, 30, 50} | min over n ≤ 10 of \|term(n) − T\| | the nearest term highlighted |
| 8 | `prime-run` | Count the different primes among the first six terms. | seq | — | max count | primes among terms marked |
| 9 | `peg-count` | The line should pass through exactly n pegs of the board. | peg; cart | n ∈ {2, 3, 5, 7} | min \|pegs − n\| | pegs on the line filled |
| 10 | `feed-zero-square` | Feed 0 into the machine; the answer should be as close as possible to a square number. | mach | — | min dist(out(0), nearest square) | the squares either side |
| 11 | `zero-sum` | Written as ax + by + c = 0 in lowest terms, a + b + c should be as close as possible to 0. | gen; cart | — | min \|gen.sum\| | the three coefficients and their sum; the point (1, 1) on the plane |
| 12 | `intercept-sum` | The x-intercept plus the y-intercept should be as close as possible to S. | int; cart | S ∈ {4, 7, 10} | min \|p + q − S\| | the two intercepts on the axes |

Prime Gradient adds a tie-break component on the Q domain (the denominator of m: smaller is better) so exact primes are
preferred to near ones of equal distance.

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
  v)`. Symmetric prices and constant φ give a uniform stationary law: the estimator reproduces today's rarity, which is
  its first cross-check when the grid is ported.
- **Rules:** Opposite Nines reads `pairs`, records one term per pair, scores the count; its marks focus the pairs that
  count. Today's "parts add up to the ordinal" invariant is the §4.2 term rule.

The contracts need no grid-specific branch; the grid scene renderer is the one new piece.

## 14. Build plan

The path from these packages to the working app, and the changes it makes to this table, are in
[integration-plan.md](integration-plan.md) (§5.7 lists the changes).

Ordered pull requests, each into `develop`. "∥" marks work that separate sessions can do at the same time once its
dependencies have merged. Interfaces they share are frozen in the PR that introduces them; a change to one is its own PR.

| PR | Contents | Depends on | Shared interface it fixes |
|---|---|---|---|
| 1 | This specification, the owner's decisions, the CLAUDE.md section | — | — |
| 2 | `lib/v2-core`: Q, codes, rng, contracts as types, evaluation context, ladder levels, walk step, import-boundary test (milestone 2) | 1 | v2-core types (§2–§5) |
| 3 | `lib/v2-linear` first cut: state, Z and Q domains, `si`, `gen`, `cart`, `tri`, `seq`, `mach`, the nine mutators, families 1–4, variant `line-z` (milestone 2) | 2 | the line's element names (§12.3) |
| 4 | `lib/v2-valuation`: estimator, fitting, artefact format, `calibrate` command; first artefacts for families 1–4 on `line-z` (milestone 2) | 2 (∥ 3, against a toy type), then 3 | artefact JSON (§7.6) |
| 5 | v2-linear complete: `int`, `table`, `peg`; families 5–12; `line-q`, `line-z4`; all artefacts; backlog file | 3, 4 | — |
| 6 | `lib/v2-sandbox`: copy of game-runtime plus the host channel; spike tests for both languages | 1 ∥ 2–5 | host channel messages (§6.5) |
| 7 | `lib/v2-agents`: agent host, query pricing, quotes, act charge; guest libraries; the three example agents in both languages | 3, 6 | agent API (§6.4) |
| 8 | `lib/v2-economy`: power, capacity, energy, offer selection, act charge, with the agent-count neutrality tests copied | 2 ∥ 3–7 | — |
| 9 | `lib/v2-views`: scene renderers, marks, compact and expanded views, goal card; a static gallery page for review | 3 ∥ 4–8 | SceneData (§11) |
| 10 | Convex v2: tables, rooms, deal (artefact-gated), tick (births, offers, acts through the sandbox, values, standings, events), query-cost gate entries, game test through the tick | 4, 7, 8 | the v2 schema (§10) |
| 11 | Web `/v2`: lobby, game page (objects, goal card, agents, log, standings), replay | 9, 10 | — |
| 12 | Assistant and MCP tools for v2 (explain my rule, write my agent, negotiate) | 10 ∥ 11 | — |
| 13 | Port the digit grid (§13) | 10 | — |
| 14 | Remove the old engine, once the owner says v2 replaces it | owner | — |

PRs 2–4 are milestone 2 and may merge as one pull request. Two sessions can work in parallel from the start: one on
PR 6 (the sandbox), one on PRs 2–5; after PR 3, a third on PR 9.
