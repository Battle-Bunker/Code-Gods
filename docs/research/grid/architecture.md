# Architecture: parameterised object types, capability classes and constrained utility families

Status: design proposal, no repository files changed. Scope covers Grid, then Int and string, then any object type an AI adds later.
Score composition is out of scope. §10 covers the change to ordered utility outputs and information calibration. Where it conflicts with the `max`/[0,1] wording in §§3–5, §10 wins.

---

## 0. The picture

```
              ┌──────────────── authored (TS only) ─────────────────┐
              │ ObjectTypeDef   Components      ClassDecl  Family   │
              │ Grid(n,s,c)     base10 base12   Ranked     flush-   │
              │ Int(min,max)    cards  emoji    Suited     royale   │
              │ string(len)     rgb rgby rainbow Spectral   bullseye │
              │                 (+ instances)   (+ laws)   (+variants)
              └───────────────┬─────────────────────────────┬───────┘
                              │ registry load: coherence,   │
                              │ superclass, orphan checks   │
                              ▼                             ▼
  room settings ──► Instantiation ──resolve──► InstanceEnv (dictionaries: tabulated for finite carriers)
  {objectType,       "Grid(5,cards,rgb)"            │
   typeArgs}                                       ├─► availability(family) = entail(requires) ∧ refinements → variant | LockedReason
                                                   ├─► prelude {python, js, dts}  ─► host evaluator, utility card, player sandbox
                                                   ├─► helper docs + badges       ─► OpenAPI ─► room UI, player-web, AI players
                                                   └─► codec (canonical ASCII)     ─► wire, uniqueness, assertObjectValue
```

There are five decisions. The rest of this document follows from them.

1. **An object type is a type constructor over value-level kinds.** For example, `Grid :: Size -> SymbolSet -> ColourSet -> Type`. Arguments are runtime values, so resolution happens at runtime through a registry, never at the TypeScript type level.
2. **Classes are single-parameter and attach to one component** (the symbol set, the colour set or the size). Constraints that span components are *refinement predicates* over numeric "terms", not multi-parameter classes.
3. **Constraints are data.** They are a small JSON AST that the server, the room UI, player clients and the AI prompt builder all evaluate identically. Instance guards for numeric parameters use the same AST. No predicate is an opaque function.
4. **For finite carriers, dictionaries are tabulated.** Each method of arity 1 or 2 over symbols and colours is computed once from the author's TS function and emitted as a literal table into the Python and JS preludes. This makes Python/TS parity of instances true *by construction*.
5. **Graceful degradation uses most-specific variant selection.** A family carries variants whose `when` constraints are ordered by entailment. The registry rejects any family where some instantiation has no unique most-specific satisfied variant. That is the overlapping-instances problem, made safe because the parameter space can be checked exhaustively. Prefer to push variation into a class method instead (e.g. `rings()` behaves correctly for odd and even N), and use variants only when the *rule itself* changes.

---

## 1. Object types as type constructors

### 1.1 Kinds and parameter schemas

```ts
// lib/game-types/src/kinds.ts
export type ParamValue = number | string;
export type TypeArgs = Readonly<Record<string, ParamValue>>;

export type ParamSchema =
  | { kind: "component"; id: string; label: string; slot: ComponentSlot }   // finite: choose a registered component
  | { kind: "int"; id: string; label: string; min: number; max: number }    // finite if (max-min) small, else infinite
  ;

/** A slot is a "kind" whose inhabitants are registered components (symbol sets, colour sets, ...). */
export type ComponentSlot = "symbols" | "colours" | (string & {});

export interface ObjectTypeDef<V = unknown, I extends Instantiation = Instantiation> {
  readonly id: string;                         // "Grid" | "Int" | "string" | future
  readonly label: string; readonly emoji: string; readonly kid: string;
  readonly params: readonly ParamSchema[];
  readonly defaults: TypeArgs;
  /** Terms the constraint language can mention, e.g. size, colours.count, bounds.max. */
  terms(i: I): Readonly<Record<string, number>>;
  /** The size of the space. Finite spaces are enumerated exhaustively in tests and tables. */
  enumerate?(): Iterable<TypeArgs>;
  /** For infinite spaces: a boundary-heavy lattice of representative args used by tests. */
  representatives(): readonly TypeArgs[];
  instantiate(args: TypeArgs): I;              // validates args against params (replaces ad-hoc checks)
  codec(i: I): Codec<V>;
  /** Generic helpers that every instantiation has (grid geometry, Int digits...). */
  basePrelude(i: I): PreludeParts;
}

export interface Instantiation {
  readonly objectType: string;
  readonly args: TypeArgs;
  readonly key: string;                        // canonical "Grid(5,cards,rgb)", which also keys caches
  readonly components: Readonly<Partial<Record<ComponentSlot, Component>>>;
}
```

| Type | Parameters | Space | Strategy |
|---|---|---|---|
| `Grid` | `size: int 3..7`, `symbols: component`, `colours: component` | 5×4×3 = **60** (grows to 5·\|S\|·\|C\|) | Enumerate exhaustively: precomputed availability table, exhaustive laws and reachability, covering-array parity |
| `Int` | `min, max: int` in signed 32-bit | ~2^63 | Representatives lattice; availability computed per request (the AST is cheap) |
| `string` | `maxLength: int 0..8192` | 8193 | Small enough to enumerate, but use representatives {0,1,5,20,64,128,1024,8192} |

**Exploit finiteness, but never depend on it.** Every mechanism (resolve, lockedReason, unlock search) works on the AST plus `terms()`, so it works for infinite spaces too. Finiteness only adds two things, both cheap: (a) exhaustive *tests*, and (b) the "+5 rules / −3 rules" deltas in the settings UI, computed by enumerating neighbours. For Grid, the whole family×instantiation availability matrix (~50 families × 60 instantiations) is computed at registry load in well under 1 ms. A golden file `lib/game-utilities/test/availability.lock.json` is committed, so any change in availability shows up as a reviewable diff.

### 1.2 Components (carriers)

```ts
export interface Component {
  readonly slot: ComponentSlot;
  readonly id: string;                         // "cards", "rainbow6"; immutable once shipped
  readonly label: string; readonly emoji: string;
  readonly count: number;                      // carrier is 0..count-1 (ints in the guest)
  readonly ascii: readonly string[];           // wire codes; fixed width per component, unique
  readonly glyph: readonly string[];           // "K♠", "🐄"; display only
  readonly names: readonly string[];           // "king of spades", "violet"; summaries and docs
  readonly constants: readonly string[];       // guest identifiers per index where sensible (RED, BLUE; "" for cards, which use card(rank, suit))
  readonly css?: readonly string[];            // colours only
  readonly instances: readonly InstanceDecl[]; // ORPHAN RULE: instances live with their component
}
```

**Orphan rule.** An instance is declared in the component's file, never in the class's file. Adding a symbol set is therefore a one-file change. The registry throws if two instances exist for the same (class, component) pair, which enforces coherence (§5).

---

## 2. Capabilities as type classes

### 2.1 Critique of the provisional vocabulary (ADDENDUM-capabilities.md)

| Provisional | Verdict | Reason |
|---|---|---|
| `Eq` (both) | **Fold into the kind contract (`Finite`)** | Every finite carrier has decidable equality, so it gates nothing. Showing it as a badge would only be noise. `Finite` also carries Show (glyph/name/ascii), which every component *must* supply to be visual. |
| `Numeral ⇒ Enum ⇒ Valued ⇒ Eq` (a chain) | **Make it a diamond: `Numeral ⇒ Valued`, `Numeral ⇒ Ranked`** | Value and order are independent. Emoji animals can be `Valued` (by leg count) without being `Ranked`. Cards are `Ranked` but `value` is not injective (A♠ and A♥ score the same), so `Enum` cannot be defined "via" value. |
| `Enum` | **Rename to `Ranked`** (Ord + Bounded + Enum, acting on the *rank* projection) | For cards, `step` must preserve the suit (K♥ → A♥). That only makes sense on a rank projection. |
| `Cyclic` | **Not a class. It becomes a derived method of `Ranked`.** | The provisional list instantiates it for every set, and wrapping always follows from a finite ordered carrier. `Ranked` therefore offers both `step(s,k)` (wraps) and `succ(s)` (None at the top), and each family picks one. |
| `Numeral b` (multi-parameter) | **Single-parameter, with an associated constant `base`** | This is a functional dependency (symbols → b). Families write a refinement `base >= 12`, not `Numeral 12`. |
| `Suited` | **Keep, but generalise: associated type `Suit` (a finite sub-carrier with its own glyphs and names), and instance-overridable badge text** | Emoji animals' habitats are suits ("🐾 Animal families"). The class means "the symbols split into named families". |
| `Faced` | **Keep, with `Faced ⇒ Ranked`** | Faces are the top ranks. A law checks this. |
| `Spectral` | **Keep. Instances: all three. RGBY order is R<Y<G<B** (see arithmetic.md) | Today it gates nothing, but it documents and badges "uses colour order", and it will gate future sets (team colours, pastels). |
| `Wheel` | **Keep, with `Wheel ⇒ Spectral`. Instance: rainbow6 only** | This is a product call. On rainbow6, "violet next to red" is visible to kids. On RGB and RGBY the wrap is invisible. |
| `Mixable` | **Keep, with associated term `mixes.count`. Instances: rainbow6 (3 mixes) and RGBY (Y+B=G, 1 mix)** | Mix is a *partial* commutative operation. Families needing a rich mix table write `mixes.count >= 3`. |
| `HasColour k` | **Drop** | Use instance-driven sampling (§2.5) instead. The one seed rule naming "green" samples `mine` from the room's colours (green exists in all three sets, but the family does not need that fact). |
| `MinSize k`, `HasCentre`, `Even` | **Refinements over the term `size`, not classes**, with sugar `minSize(5)`, `odd()`, `even()` | They have no methods. GHC would call them `KnownNat n, 5 <= n`. |
| NEW `MinColours k` (geometry worker) | **Adopt as a refinement over the term `colours.count`**, with sugar `minColours(4)` | This is the case that showed constraints must reach numeric *instance data* as well as instance existence. It is handled uniformly by terms. |

### 2.2 Final vocabulary (v1)

Symbol slot (`s`), colour slot (`c`) and size (`n`). Badges list emoji, friendly name and kid sentence. `Finite` has no badge.

| Class | Super | Methods (guest names) | Associated terms | base10 | base12 | base16 | cards | emoji* | Badge |
|---|---|---|---|---|---|---|---|---|---|
| `Finite s` | — | `glyph(s)`, `name(s)`, `SYMBOLS` | `symbols.count` | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `Valued s` | Finite | `value(s)` | `symbols.maxValue` | ✓ | ✓ | ✓ | A=1…K=13 | legs | ➕ Points: "Symbols are worth points" |
| `Ranked s` | Finite | `rank(s)`, `step(s,k)` (wraps), `succ(s)`/`pred(s)` (None at the ends) | `ranks.count` | ✓ | ✓ | ✓ | by rank, suit kept | ✗ | 🪜 Counting order: "Symbols come in order, like counting" |
| `Numeral s` | Valued, Ranked | `digits(n)` (int → syms), `number(syms)` (syms → int) | `symbols.base` | 10 | 12 | 16 | ✗ | ✗ | 🔟 Place value: "Read a row as one big number" (label: "Base 12 place value") |
| `Suited s` | Finite | `suit(s)`, `card(rank, suit)` (if also Ranked), `SUITS` | `suits.count` | ✗ | ✗ | ✗ | ♠♥♦♣ | habitats | ♠ Suits / 🐾 Animal families: "Symbols belong to teams" |
| `Faced s` | Ranked | `face(s)` (bool) | `faces.count` | ✗ | ✗ | ✗ | J Q K | ✗ | 👑 Picture cards |
| `Finite c` | — | `colour_name(c)`, `COLOURS`, constants `RED`… (only those present) | `colours.count` | ✓ | | | | | — |
| `Spectral c` | Finite | `hue(c)` (0..k-1 in rainbow order), `hue_step(c,k)` → None off the ends | — | RGB, RGBY, rainbow6 | | | | | 🌈 Colour order |
| `Wheel c` | Spectral | `hue_turn(c,k)` (wraps), `hue_dist(a,b)` | — | rainbow6 | | | | | 🎡 Colour wheel |
| `Mixable c` | Finite | `mix(a,b)` → colour or None | `mixes.count` | rainbow6 (3), RGBY (1) | | | | | 🎨 Paint mixing |
| `Board n` | — | `N`, `rows(g)`, `cols(g)`, `lines(g, diag)`, `cells()`, `neighbours(r,c)`, `rings()`, `centre()` (1 cell if odd, 2×2 if even) | `size` | always | | | | | — |
| refinements | | — | — | — | | | | | 📏 Big board (`size>=k`), 🎯 Middle square (`odd`), 🌈+ More colours (`colours.count>=k`) |

\* "emoji animals" is the worked example of adding an instance (§8b).

### 2.3 Class declarations

```ts
// lib/game-types/src/classes.ts
export type ClassId = keyof ClassDicts;
/** Dictionary shapes as the HOST sees them (TS functions). The registry tabulates them for the guest. */
export interface ClassDicts {
  Valued:   { value(s: number): number };
  Ranked:   { rank(s: number): number; withRank(s: number, r: number): number; ranks: number };
  Numeral:  { base: number };
  Suited:   { suit(s: number): number; suits: Component /* associated type Suit */ };
  Faced:    { face(s: number): boolean };
  Spectral: { hue(c: number): number };
  Wheel:    {};                                      // all methods are defaults derived from Spectral
  Mixable:  { mix(a: number, b: number): number | null };
}
/** Transitive superclass closure. A test asserts this equals the runtime closure of `superclasses`. */
export interface Supers { Numeral: "Valued" | "Ranked"; Faced: "Ranked"; Wheel: "Spectral";
  Valued: never; Ranked: never; Suited: never; Spectral: never; Mixable: never; }
export type Closure<C extends ClassId> = C | Supers[C];

export interface ClassDecl<C extends ClassId> {
  readonly id: C; readonly slot: ComponentSlot;
  readonly superclasses: readonly ClassId[];
  readonly badge: { emoji: string; label: string; kid: string };
  readonly terms?: (d: ClassDicts[C], comp: Component) => Record<string, number>; // e.g. { "mixes.count": 3 }
  /** Guest-visible methods. Each is generated from the dictionary. Finite carriers are tabulated. */
  readonly methods: readonly MethodDecl<C>[];
  readonly laws: readonly Law<C>[];
}
export interface MethodDecl<C extends ClassId> {
  readonly name: string;                    // snake_case. camelCase is derived for TS ("hue_step" → "hueStep")
  readonly sig: { python: string; ts: string };   // "(s: int) -> int" / "(s: Sym) => number"
  readonly kid: string;                     // "value(s): how many points symbol s is worth"
  /** How to emit it. Most methods are 'table': arg domain is the carrier, so emit a literal array. */
  readonly emit:
    | { kind: "table1"; arg: "s" | "c"; f: (d: ClassDicts[C], x: number) => number | boolean | null }
    | { kind: "table2"; args: ["s" | "c", "s" | "c"]; f: (d: ClassDicts[C], x: number, y: number) => number | null }
    | { kind: "const"; f: (d: ClassDicts[C]) => number }
    | { kind: "code"; python: string; js: string };   // only for non-finite args (Numeral.digits, Board.*)
  /** Default method. Used when the instance omits it, like Haskell's class defaults. */
  readonly default?: (supers: Partial<ClassDicts>) => unknown;
}
export interface Law<C extends ClassId> { readonly name: string; check(env: InstanceEnv, d: ClassDicts[C]): string | null }
```

Defaults are taken from superclasses. `Ranked.pred` defaults to the inverse of `succ`. `Wheel.hue_turn` and `hue_dist` default to arithmetic modulo `colours.count` on `Spectral.hue`. An instance of `Wheel` is therefore just `{}`: like a `DeriveAnyClass` opt-in, it is *declared*, never inferred.

### 2.4 Instances

```ts
export type InstanceDecl = { [C in ClassId]: { class: C; dict: ClassDicts[C]; badgeLabel?: string } }[ClassId];

// lib/game-types/src/grid/symbols/cards.ts
const RANKS = "A23456789TJQK", SUITS = "SHDC";
export const cards: Component = component({
  slot: "symbols", id: "cards", label: "Playing cards", emoji: "🃏", count: 52,
  ascii: [...SUITS].flatMap(u => [...RANKS].map(r => r + u)),          // index = suit*13 + rank
  glyph: [...SUITS].flatMap((u, i) => [...RANKS].map(r => r.replace("T", "10") + "♠♥♦♣"[i])),
  names: /* "ace of spades" … */,
  instances: [
    { class: "Ranked",  dict: { rank: s => s % 13, withRank: (s, r) => s - (s % 13) + r, ranks: 13 } },
    { class: "Valued",  dict: { value: s => (s % 13) + 1 } },
    { class: "Suited",  dict: { suit: s => Math.floor(s / 13), suits: SUIT_COMPONENT } },
    { class: "Faced",   dict: { face: s => s % 13 >= 10 } },
  ],
});
```

Size is not a component. `Board` is an *instance function* over the numeric parameter (`instance KnownNat n => Board n`). For Int, the guards on bounds are refinements (§3.1) in the same AST, so instance selection on infinite parameters stays declarative and decidable.

### 2.5 Instance-driven (constraint-polymorphic) sampling

A family samples through the resolved environment, never from literal lists. Parameters are carrier *indices*. Names are rendered through the instance.

```ts
export interface SampleCtx<C extends ClassId> {
  readonly inst: Instantiation; readonly terms: Readonly<Record<string, number>>;
  readonly symbols: Component; readonly colours: Component;   // Finite: always present
  readonly dicts: Readonly<Pick<ClassDicts, Closure<C>>>;     // statically limited to what was required
  pickSymbol(rng: Rng): number; pickColour(rng: Rng): number; // uniform over the room's carrier
  pickSuit(this: SampleCtx<"Suited">, rng: Rng): number;      // only callable with Suited in scope
}
```

"Your colour" means `pickColour(rng)`, which is uniform over the *room's* colour set, so it always exists. This replaces `HasColour k`. It is the value-level analogue of a sampler of type `(Finite c) => Gen c`.

---

## 3. Utility families as constrained polymorphic functions

### 3.1 The constraint language (shared by the server, all clients and AI prompts)

```ts
// lib/game-types/src/constraints.ts
export type Term = string;   // "size" | "colours.count" | "symbols.base" | "mixes.count" | "bounds.min" | "length.max" | ...
export type Constraint =
  | { has: ClassId }                                   // an instance exists on the class's slot (closure applied)
  | { term: Term; op: ">=" | "<=" | "=="; value: number }
  | { term: Term; parity: "odd" | "even" }
  | { not: Constraint };                               // rare: "only without suits". Tests flag overuse
export const has = <C extends ClassId>(c: C) => ({ has: c }) as const;
export const minSize = (k: number) => ({ term: "size", op: ">=", value: k }) as const;
export const odd = () => ({ term: "size", parity: "odd" }) as const;
export const minColours = (k: number) => ({ term: "colours.count", op: ">=", value: k }) as const;

/** Entailment: a set entails c if c is in its superclass closure, or if a numeric bound implies c (e.g. size>=6 ⇒ size>=5). */
export function entails(cs: readonly Constraint[], c: Constraint): boolean;
export function satisfied(c: Constraint, env: InstanceEnv): boolean;
```

**Why superclass entailment gives compatibility for free.** `{has:"Numeral"}` is satisfied iff the symbol component has a `Numeral` instance. Registration refuses an instance whose superclass instances are missing (`instance Numeral base12` requires `Valued base12` and `Ranked base12`). So satisfying `Numeral` *implies* the family may call `value`, `rank` and `step` without declaring them. The availability check stays a single lookup per declared constraint. The UI shows only the maximal badge ("🔟 Place value", not three badges). The same closure drives the TS `Pick<ClassDicts, Closure<C>>`, so the compiler gives an author the methods they are entitled to.

### 3.2 Family and variant types

```ts
// lib/game-utilities/src/types.ts (generalised)
export interface UtilityFamily<P extends Params = Params, C extends ClassId = never> {
  readonly id: string; readonly name: string; readonly objectType: string; readonly theme: string;
  readonly requires: readonly Constraint[];                 // the family's context (=> part)
  /** Ordered by nothing: the resolver picks the most specific satisfied variant. */
  readonly variants: readonly Variant<P, C>[];              // at least one. The base variant has when: []
  sample(rng: Rng, ctx: SampleCtx<C>): P;
  summary(p: P, ctx: SampleCtx<C>): string;
  exemplar(p: P, ctx: SampleCtx<C>): ObjectValue;           // canonical wire value
  /** Best possible score for p in this instantiation (unbounded scores: used by calibration only). */
  max?(p: P, ctx: SampleCtx<C>): number;
}
export interface Variant<P, C extends ClassId, W extends ClassId = never> {
  readonly id: string;                                      // "base", "spectral"
  readonly when: readonly Constraint[];                     // extra context on top of family.requires
  readonly note?: (p: P, ctx: SampleCtx<C | W>) => string;  // appended to summary: "In this room, rings must climb the rainbow."
  python(p: P, ctx: SampleCtx<C | W>): string;              // body of def utility(g)
  typescript(p: P, ctx: SampleCtx<C | W>): string;          // body of function utility(g): plain JS
}
/** Builder that infers C from `requires` literals, so ctx.dicts is typed by the closure. */
export function family<const R extends readonly Constraint[], P extends Params>(
  def: Omit<UtilityFamily<P, ClassesIn<R>>, "requires"> & { requires: R }): UtilityFamily<P, ClassesIn<R>>;
type ClassesIn<R> = R extends readonly (infer X)[] ? (X extends { has: infer C extends ClassId } ? Closure<C> : never) : never;
```

### 3.3 Resolution = compatibility check

```ts
export type Resolution =
  | { ok: true; variant: string; uses: readonly ClassId[]; badges: readonly Badge[] }
  | { ok: false; unmet: readonly Constraint[]; reason: string; unlock?: TypeArgs /* nearest fix */ };

export function resolve(f: UtilityFamily<any, any>, env: InstanceEnv): Resolution {
  const unmet = f.requires.filter(c => !satisfied(c, env));
  if (unmet.length) return { ok: false, unmet, reason: explain(unmet[0], env), unlock: nearestUnlock(f, env) };
  const sat = f.variants.filter(v => v.when.every(c => satisfied(c, env)));
  const best = sat.filter(v => sat.every(w => w === v || !strictlyEntails(w.when, v.when)));
  if (best.length !== 1) throw new Error(`incoherent variants for ${f.id} at ${env.inst.key}`); // made unreachable by tests
  return { ok: true, variant: best[0].id, uses: usedClasses(f, best[0], env), badges: badgesFor(f.requires, best[0].when) };
}
```

Two kinds of degradation, in order of preference:

| Mechanism | Haskell analogue | Use when | Example |
|---|---|---|---|
| **Class method absorbs the difference** | an instance method that already varies by instance | the *rule* is the same and only the geometry or data differs | Bullseye: `rings()` ends in one cell for odd N and a 2×2 for even N. `Board` supplies both, and the family has no variant. |
| **Default method** | class default / DefaultSignatures | a weaker instance can compute the method from superclasses | `Wheel.hue_dist` from `Spectral.hue` |
| **Most-specific variant** | overlapping instances, checked | the rule itself gets stricter or richer when a capability exists | Bullseye "sunset target" when `Spectral`; Row Ranger "round number" mode when `Numeral` |

The `uses` field is computed, not declared. The resolver scans the chosen variant's emitted source for identifiers exported by the prelude and maps them back to classes. A test asserts that every used identifier belongs to the closure of `requires ∪ when`. This catches "called `suit()` without requiring Suited" even before the TS strict check (which also catches it: §4.4).

`reason` is generated from the first unmet constraint and the component choices that would satisfy it (§7.2). `nearestUnlock` enumerates the parameter neighbours (finite spaces), or adjusts the numeric term to its bound (infinite spaces). It returns the args patch with the fewest changes, ties broken by parameter order.

### 3.4 Selector change

```ts
// selectors.ts: draw() takes an InstanceEnv instead of Domain
const candidates = familiesFor(env.inst.objectType).filter(f => resolve(f, env).ok);
// keep the exemplar-legal check as a safety net (late refinement); tests make it unreachable for Grid
```

`UtilityDescriptor` stays `{ familyId, params }`. The instantiation comes from the game's frozen settings, and the variant is re-resolved, not stored. That is sound only because of coherence (§5).

---

## 4. Dictionary passing: generated preludes

### 4.1 Compilation strategy

Haskell compiles `f :: Suited s => …` into `f dSuited …`. Here the dictionary is resolved once per room, then *materialised as source text*: a prelude of top-level names, injected ahead of both the utility body and the player's transformation. The names are fixed for the room, so code reads like it uses globals (`suit(x.symbol)`), and only the methods of classes that the room instantiates exist.

```ts
export interface PreludeParts { python: string; js: string; dts: string; exports: readonly HelperDoc[] }
export interface HelperDoc { name: { python: string; ts: string }; sig: { python: string; ts: string };
  kid: string; class?: ClassId; examples: { call: string; result: string }[] }   // examples evaluated on this room's tables
export function prelude(env: InstanceEnv): PreludeParts;  // = objectType.basePrelude ⊕ each resolved class's methods
```

Generated Python for `Grid(5,cards,rgb)` (abridged):

```python
# Room helpers: Grid 5×5 · Playing cards · RGB. Generated; do not edit.
from collections import namedtuple
Cell = namedtuple("Cell", "symbol colour")
N, SYMBOLS, COLOURS = 5, 52, 3
RED, GREEN, BLUE = 0, 1, 2
SPADES, HEARTS, DIAMONDS, CLUBS = 0, 1, 2, 3
ACE, JACK, QUEEN, KING = 0, 10, 11, 12
_VALUE = (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 1, 2, ...)   # tabulated from the TS dict
_RANK = (...); _SUIT = (...); _FACE = (...); _HUE = (0, 1, 2)
def value(s): return _VALUE[s]
def rank(s): return _RANK[s]
def suit(s): return _SUIT[s]
def face(s): return _FACE[s]
def step(s, k=1): return _STEP[s][k % 13]
def card(r, u): return u * 13 + r
def hue(c): return _HUE[c]
def rows(g): return [list(row) for row in g]
def cols(g): return [[g[r][c] for r in range(N)] for c in range(N)]
def rings(): return _RINGS                     # list of lists of (r, c)
def cell(symbol, colour): return Cell(symbol, colour)
def build(f): return tuple(tuple(f(r, c) for c in range(N)) for r in range(N))
def put(g, r, c, x): ...                       # returns a new grid
```

The JS output is the same text emitted from the same tables. The `dts` output is:

```ts
type Sym = number; type Colour = number;
interface Cell { readonly symbol: Sym; readonly colour: Colour }
type Grid = readonly (readonly Cell[])[];
declare const N: 5; declare const RED: 0, GREEN: 1, BLUE: 2;  declare const SPADES: 0 /* … */;
declare function value(s: Sym): number;  declare function suit(s: Sym): number;  /* … only resolved classes … */
declare function rings(): readonly (readonly [number, number])[];
```

Branded types (`Sym & {__brand}`) were considered and rejected: `x.symbol === 7` must typecheck for kids writing base-10 code.

### 4.2 Where the prelude goes

| Consumer | Mechanism | Counted in cost? |
|---|---|---|
| Host evaluator (`catalog.ts`) | `new Function("g", preludeJs + body)`, cached by `(inst.key, familyId, params)`. The input is decoded once per object value (LRU by canonical string). | n/a |
| Utility card | *Not* inlined. The card header lists the helpers used, and the full prelude appears once in "Room helpers". See §8 for the card text. | n/a |
| Parity test (Python) | `preludePy + "def utility(g):\n" + body` | n/a |
| Player transformation, TS worker | Typecheck text = `dts + "const __agent: (g: Grid) => Grid = (\n" + source + "\n);"`. Runtime = `preludeJs + transpiled agent`, then the trusted wrapper `__encode(__agent(__decode(input)))`. | No. `compile()` already visits only the user expression. |
| Player transformation, Python runner | The trusted prelude is compiled by the trusted compiler and exec'd into `globals_` before the agent code is evaluated. `__decode(input)` runs before the budget starts. `agent(g)` and `__encode` run inside the budget. | No. `_price(source)` prices only user source. |

### 4.3 Sandbox and determinism constraints, checked against the runtime

- **The boundary is unchanged.** Results still cross only as an exact `str`. The guest-side `__encode` is untrusted-equivalent: if a player monkeypatches `Cell`, the worst outcome is an invalid string (DOMAIN error) or a valid grid they could have returned anyway. The host re-validates with `codec.assert` (as it already does for every interaction). No repr/str hook is invoked on the host.
- **Cache keys.** The prelude depends on `inst.key`. Both workers already key compile caches on settings. Add `typeArgs` to `DomainSettings` and to the key (`typescript-worker.mjs` line 37, `runner.py` key).
- **`domain.py` / `check`.** For Grid, check `type is str`, ASCII, and `len <= codec.maxLength` (host-supplied). Full structural validation stays on the host, so the Python runner stays free of game logic.
- **Determinism of utilities.** Tables are pure. Helpers never iterate sets in an order-dependent way, and `rings()`/`lines()` return lists. Python `%`/`//` and JS `%`/`Math.floor` disagree on negatives, so `step`/`hue_turn` are tables and user code rarely needs `%`. A lint test forbids `random`, `time`, `Date` and `Math.random` in family bodies.
- **Name hygiene.** Prelude names must not shadow builtins (no `next`, `sum`, `max`, `min`, `map`, `id`). A test intersects exports with Python builtins and the JS globals list. Private tables are `_UPPER` in Python and `__UPPER` in JS.
- **Size.** The largest prelude (cards, rainbow6, N=7) is about 3 KB. The source limit is 16 KiB of *user* source, so the prelude stays outside it.

### 4.4 Parity is structural

Instance methods are emitted from one TS function as tables, so Python and JS cannot disagree on `value(K♠)`. The only hand-written dual-language code is (a) `Board` geometry and the `code`-kind methods in the base prelude, written once and tested once per size, and (b) family bodies (as today). Parity tests therefore target (a) once and (b) per family.

---

## 5. Coherence and laws

### 5.1 Why coherence is load-bearing here

A descriptor `{familyId, params}` together with frozen settings must determine *one* function forever (restarts, replays, the score the server computes vs the source the player reads). If two instances of `Suited cards` existed, or two variants of a family were equally specific, the function would depend on registration order, and two servers (or one server after a refactor) could score the same object differently. The registry therefore enforces:

| Check | Where | Failure |
|---|---|---|
| ≤ 1 instance per (class, component) | registry load | throw |
| superclass instances present | registry load | throw |
| `Supers` type map = runtime transitive closure | unit test | fail |
| instances only in the component's file (orphan rule) | registry records the declaring module through `component()` | throw |
| every instantiation yields a unique most-specific variant per family | test over `enumerate()` or `representatives()` | fail with the instantiation key |
| component tables are frozen: hash of `(ascii, names, every tabulated method)` matches `components.lock.json` | test | fail: "make a new component id (`base16@2`); persisted descriptors index these tables" |

### 5.2 Laws (run exhaustively: carriers are at most 52, so pairs are at most 2704)

| Class | Laws |
|---|---|
| Finite | ascii unique, fixed width, `[0-9A-Z]` only, no overlap with colour letters needed (fixed-width parse); glyphs and names unique |
| Ranked | `pred(succ(s)) == s` where defined; `step(s, ranks) == s`; `rank(step(s,1)) == (rank(s)+1) % ranks`; with Suited: `suit(step(s,k)) == suit(s)` |
| Valued + Ranked | `value` non-decreasing in `rank` (a superclass-combination law) |
| Numeral | `value(s) == rank(s) == s`; `base == symbols.count`; `number(digits(n)) == n` |
| Suited (+Ranked) | `suit(s) < suits.count`; `(rank, suit)` is a bijection onto S; `card(rank(s), suit(s)) == s` |
| Faced | `face(s) ⇒ rank(s) ≥ ranks − faces.count` |
| Spectral | `hue` is a bijection onto `0..k-1` |
| Wheel | `hue_dist` symmetric, `≤ k/2`, satisfies the triangle inequality; `hue_turn(c, k) == c` |
| Mixable | commutative; `mix(a,a) == null`; `mix(a,b) ∉ {a,b}` |
| Board(n) | `rings()` partitions the cells; `centre()` is the last ring; `neighbours` is symmetric and irreflexive |
| Codec | `decode(encode(g)) == g`; `encode` is injective and canonical; `spawn` is uniform (χ² over cells) |

### 5.3 Test enumeration

```ts
// lib/game-utilities/test/grid.test.ts (sketch)
for (const type of OBJECT_TYPES)
  for (const args of type.enumerate?.() ?? type.representatives()) {
    const env = environment(type.instantiate(args));
    test(`laws ${env.inst.key}`, () => runLaws(env));                  // per instance, exhaustive
    for (const f of familiesFor(type.id)) {
      const r = resolve(f, env); record(f.id, env.inst.key, r);         // → availability.lock.json
      if (!r.ok) continue;
      // 12 draws: exemplar legal, scores >= 0.99 * max; summary sane; "uses" ⊆ closure; no builtin shadowing
      // calibration: random-spawn mean <= 0.1 * max, P(u >= 0.5 * max) < 1%   (thresholds owned by the tests worker)
    }
  }
// Parity and strict typecheck (the expensive tests) use a covering array: every family × every (symbols, colours)
// pair × {min, max} compatible size, which is ≤ 24 instantiations per family, in one python3 -I batch (as parity.py does today).
```

---

## 6. Value representation and wire format

| Layer | Grid shape | Notes |
|---|---|---|
| Wire / DB / `PublicObject.value` / player protocol | **canonical ASCII string** `"7R,3G,0B/1R,2R,9B/4G,4G,8R"` (rows `/`, cells `,`, symbol code then colour letter) | Uniqueness = string equality. Max length (cards, N=7) = 49·3 + 48 = 195 < 1024 (the protocol cap). The `oneOf int|string` schema is unchanged, so old clients still render something. |
| Guest (Python/TS) | `tuple[tuple[Cell]]` / `readonly (readonly Cell[])[]`; `Cell = {symbol: int, colour: int}` (indices) | Fields are named `symbol`/`colour`, not `s`/`c`, because `c` is the column index in every loop. |
| Host | `{ n, cells: Uint8Array(2·n²) }` plus a decode LRU | |
| UI | decoded with the manifest's component tables (glyph, css) | |

Symbol codes: base10 `0-9`, base12 `0-9AB`, base16 `0-9A-F`, cards `A23456789TJQK × SHDC` (`TS` = 10♠). Colours: `R O Y G B V`. The codes are **ASCII, so the strings survive the existing ASCII-only runtime boundary**, and they are stable under table reordering. Guest-side indices are what descriptors persist, so tables are frozen (§5.1).

```ts
export interface Codec<V> {
  readonly maxLength: number;
  encode(v: V): string; decode(s: string): V;           // decode throws on any non-canonical input
  assert(x: unknown): asserts x is string;              // typeof string && decode(x) && encode(decode(x)) === x
  spawn(rng: Rng): string;                              // uniform over symbols × colours per cell, independent
}
// game-core/settings.ts
export function assertObjectValue(value: unknown, settings: GameSettings): asserts value is ObjectValue {
  objectType(settings.objectType).codec(instantiationOf(settings)).assert(value);
}
```

Int and string get trivial codecs: the identity on `number`, or on `string` with today's checks.

---

## 7. UX and API

### 7.1 Room owner settings (artifacts/code-gods `OwnerSettings`)

```
┌ World ─────────────────────────────────────────────────────────────┐
│ Object type  [ 🔢 Int ] [ 🔤 string ] [ 🟥 Grid ✓ ]                 │
│ Board size   3 ●───●───[5]───●───● 7      (mini 5×5 preview)        │
│ Symbols      [0-9 Digits] [0-B Base 12] [0-F Hex] [🃏 Cards ✓]      │
│               ➕🪜🔟        ➕🪜🔟         ➕🪜🔟    ➕🪜♠👑          │
│               +6 −9         +6 −9         +7 −9                     │  ← deltas vs current choice
│ Colours      [🟥🟩🟦 RGB ✓] [🟥🟨🟩🟦 RGBY] [🌈 Rainbow]             │
│               🌈            🌈🎨           🌈🎡🎨                   │
├ Rule shelf: 34 of 47 rules can appear in this room ███████░░ ───────┤
│ [All] [Works everywhere 18] [♠ Suits 5] [🌈 Colour order 7] …       │
│ ✓ Flush Royale        ♠ Suits                                        │
│ ✓ Bullseye            (this room: sunset target 🌈)                  │
│ 🔒 Paint Mixer        needs 🎨 more paint mixes. Pick Rainbow [Pick] │
│ 🔒 Column Addition    needs 🔟 place value. Pick Digits, Base 12 or Hex │
│ 🔒 Royal Court        needs 🎯 a middle square. Pick size 3, 5 or 7  │
└─────────────────────────────────────────────────────────────────────┘
```

- Each component card shows its *maximal* badges. Hovering a badge shows its kid sentence and the classes it includes ("🔟 Place value includes ➕ Points and 🪜 Counting order").
- Deltas and the shelf are computed client-side from the manifest using `@workspace/game-types` (pure TS, no Node deps, imported by code-gods and player-web). For infinite types (Int bounds), the same function runs on the drafted numbers. Nothing calls the network per keystroke.
- **Unlock** applies the `unlock` patch to the draft and highlights the changed control. No dialog appears; settings are saved as today.
- Wording comes from templates on constraint kinds: `{has}` → "needs {badge}. Pick {choices}"; `size>=k` → "needs a bigger board: size {k} or more"; `odd` → "needs a middle square: pick size 3, 5 or 7"; `colours.count>=k` → "needs at least {k} colours: pick {choices}". `{choices}` lists the component labels that satisfy the constraint, joined with "or".
- For Grid, `numFields` replaces Int min/max with nothing. Type parameters are rendered generically from `ParamSchema`: a `component` param becomes a card picker, a small `int` param a slider, a large one a number field. The existing `relevantToType` hack becomes `params.map(...)`.

### 7.2 Catalog, card and player client

| Surface | Change |
|---|---|
| `Repertoire` ("Possible gods") | Grouped by the family's most specific badge, with "Works everywhere" first and filter chips. It lists *available* families only, plus a "show locked (n)" toggle with reasons, so players can see what the room excludes (that is public knowledge, like the catalog itself). |
| Objects table | A 7×7 mini board (CSS grid, glyph on a colour swatch, about 12 px per cell) replaces the string. A tooltip shows the canonical string. |
| Player "Your utility function" | The name, summary (with variant note), a "This rule uses: ♠ Suits · 📏 rows" chip row, then the source. |
| Player Forge | A **Room helpers** drawer generated from `HelperDoc[]`: grouped by badge, each with signature, kid line and a live example ("`suit(K♠)` → `SPADES`"). Click inserts the name. TS diagnostics for a missing name are rewritten: "`mix` is not in this room. It needs 🎨 Paint mixing (Rainbow or RGBY colours)." The rewrite maps unknown identifiers to the global helper index. |
| Transformations list | Before/after mini boards with changed cells outlined. |
| AI player (`lib/ai-player`) | The prompt includes `instance.helpers` (Python or TS signatures + kid lines) and the canonical-format line. |

The utility card source is self-describing without inlining the prelude:

```python
# Flush Royale: your utility function. Scores are points (higher is better).
#
# You love lines of one suit. Every row or column whose cards all share a suit scores 5;
# a line that is all ♥ hearts (your suit) scores 10.
#
# Uses room helpers: rows, cols, suit, HEARTS  (see "Room helpers")
def utility(g: Grid) -> float:
```

### 7.3 OpenAPI additions (lib/api-spec/openapi.yaml)

```yaml
Settings:
  properties:
    objectType: { type: string }                     # enum removed: validated against Manifest.objectTypes
    typeArgs:                                        # NEW. Int → {min,max}; string → {maxLength}; Grid → {size,symbols,colours}
      type: object
      additionalProperties: { oneOf: [ { type: integer }, { type: string } ] }
    # intMin/intMax/stringMaxLength kept (deprecated), mirrored server-side for 2 releases
Manifest:
  properties:
    objectTypes: { type: array, items: { $ref: ObjectTypeInfo } }   # NEW
    classes:     { type: array, items: { $ref: ClassInfo } }        # NEW
    utilityFamilies: { type: array, items: { $ref: FamilyInfo } }   # NEW: whole catalog, with constraint ASTs
ObjectTypeInfo: { id, label, emoji, kid, params: [ParamSchema], defaults: object,
                  components: { <slot>: [ComponentInfo] } }
ComponentInfo:  { id, label, emoji, count, ascii: [string], glyph: [string], names: [string], css?: [string],
                  classes: [{ class, badgeLabel? }], terms: { <term>: number } }
ClassInfo:      { id, slot, superclasses: [string], closure: [string], badge: { emoji, label, kid },
                  methods: [HelperDoc] }
FamilyInfo:     { id, name, theme, objectType, requires: [Constraint],
                  variants: [{ id, when: [Constraint] }] }
Constraint:     { oneOf: [ {has}, {term, op, value}, {term, parity}, {not} ] }   # §3.1, documented normatively
UtilityFamily:  # RoomState.utilityCatalog items, all new fields optional (back-compatible)
  { id, name, theme, available: boolean, variant?: string, badges?: [Badge],
    lockedReason?: string, unlock?: object }
RoomState:
  properties:
    objectInstance: { $ref: ResolvedInstance }       # NEW: what this room resolved to
ResolvedInstance: { objectType, typeArgs, key, codec: { format: string, maxLength },
                    components: { <slot>: ComponentInfo }, helpers: { python: [HelperDoc], typescript: [HelperDoc] },
                    prelude: { python: string, typescript: string } }   # full text, so third-party clients can run utilities locally
```

`RoomState` carries server-resolved results, so a minimal client needs no evaluator. `Manifest` carries the ASTs, so a rich client can preview. The player protocol (`lib/player-client/src/protocol.ts`) gets optional `observation.instance: {key, helpers, components}` and `self.utility.uses`. These are optional fields only, and the zod schemas strip unknown keys, so the version stays `v2`.

---

## 8. Authoring ergonomics for AIs

### (a) A new object type

Write one file, `lib/game-types/src/<type>/index.ts`, exporting an `ObjectTypeDef` (params, `terms`, `enumerate` or `representatives`, codec, base prelude in Python+JS+dts), then add it to `OBJECT_TYPES`. Then:

| Caught automatically by | What |
|---|---|
| registry load | duplicate ids, a param referencing an unknown slot, instances without superclasses |
| codec laws | round trip, canonicality, ASCII, maxLength ≤ 1024, spawn uniformity |
| base-prelude parity | the same outputs from Python and JS for every helper on representative inputs |
| runtime smoke (`api-server/src/game/runtime-setup.ts`) | the identity transformation round-trips in both sandboxes |
| settings tests | every grammar or option that lists the type validates; `assertObjectValue` delegates |

### (b) A new instance: symbol set "emoji animals"

```ts
// lib/game-types/src/grid/symbols/animals.ts (the only file touched, plus one line in the symbols index)
const A = [ ["CW","🐄","cow",4,0], ["PG","🐖","pig",4,0], ["HN","🐔","hen",2,0], ["DK","🦆","duck",2,1],
            ["FS","🐟","fish",0,1], ["OC","🐙","octopus",8,1], ["SP","🕷","spider",8,2], ["BT","🦋","butterfly",6,2] ] as const;
export const animals = component({
  slot: "symbols", id: "animals", label: "Emoji animals", emoji: "🐾", count: A.length,
  ascii: A.map(a => a[0]), glyph: A.map(a => a[1]), names: A.map(a => a[2]),
  instances: [
    { class: "Valued", dict: { value: s => A[s][3] } },                        // points = legs
    { class: "Suited", badgeLabel: "🐾 Animal families",
      dict: { suit: s => A[s][4], suits: suitComponent(["farm", "water", "garden"], ["🚜", "💧", "🌼"]) } },
  ],                                                                           // no Ranked: no counting order
});
```

Effect: every `Suited`-only family (Flush Royale) unlocks with "farm animals" wording, and every `Ranked` family locks with "needs 🪜 counting order". Laws check the tables. `components.lock.json` gains an entry. `availability.lock.json` shows the diff for review. Calibration runs for every newly compatible family, which matters here: 3 suits over 8 symbols make flushes far likelier than with cards. If a family fails calibration on the new set, the fix is a refinement on that family (`suits.count >= 4`), never a change to the instance.

### (c) A new family: Flush Royale (requires Suited)

```ts
// lib/game-utilities/src/families/grid/cards.ts
export const flushRoyale = family({
  id: "flush-royale", name: "Flush Royale", objectType: "Grid",
  theme: "Loves rows and columns where every symbol is on the same team.",
  requires: [has("Suited")],
  sample: (rng, ctx) => ({ suit: ctx.pickSuit(rng) }),
  summary: ({ suit }, ctx) => {
    const n = ctx.terms.size, s = ctx.dicts.Suited.suits;
    return `You love lines of one suit. Every row or column whose symbols all share a suit scores ${n}; a line that is all ${s.glyph[suit]} ${s.names[suit]} (your suit) scores ${2 * n}.`;
  },
  variants: [{
    id: "base", when: [],
    python: ({ suit }, ctx) => `    total = 0
    for line in rows(g) + cols(g):
        suits = {suit(x.symbol) for x in line}
        if len(suits) == 1:
            total += 2 * N if ${ctx.dicts.Suited.suits.constants[suit]} in suits else N
    return total`,
    typescript: ({ suit }, ctx) => `  let total = 0;
  for (const line of [...rows(g), ...cols(g)]) {
    const suits = new Set(line.map(x => suit(x.symbol)));
    if (suits.size === 1) total += suits.has(${ctx.dicts.Suited.suits.constants[suit]}) ? 2 * N : N;
  }
  return total;`,
  }],
  exemplar: ({ suit }, ctx) => ctx.codec.encode(ctx.build((r, c) => ({
    symbol: ctx.symbolWhere(s => ctx.dicts.Suited.suit(s) === suit), colour: 0 }))),
  max: (_, ctx) => 4 * ctx.terms.size ** 2,
});
```

TypeScript catches `ctx.pickSuit` or `ctx.dicts.Suited` without `has("Suited")`. Tests catch a body that calls `rank()` (that is outside the closure of Suited, so it would break on emoji animals), an unreachable `max`, calibration failures, parity and strict typing against each compatible instantiation's `dts`, and summaries containing `undefined`.

### (d) A generic family that degrades gracefully: Bullseye

```ts
export const bullseye = family({
  id: "bullseye", name: "Bullseye", objectType: "Grid",
  theme: "Wants a target of solid colour rings, starting from one colour on the outside.",
  requires: [],                                            // fully generic: works in all 60 rooms
  sample: (rng, ctx) => ({ outer: ctx.pickColour(rng) }),
  summary: ({ outer }, ctx) => `You want a target. The outside ring must be all ${ctx.colours.names[outer]}; each ring inside it must be one solid colour different from the ring around it. Score is (rings in a row from the outside)².`,
  variants: [
    { id: "base", when: [],
      python: ({ outer }, ctx) => `    score, prev = 0, None
    for ring in rings():
        cs = {g[r][c].colour for r, c in ring}
        if len(cs) != 1:
            break
        col = cs.pop()
        if col == prev or (prev is None and col != ${ctx.colours.constants[outer]}):
            break
        score, prev = score + 1, col
    return score * score`,
      typescript: /* line-for-line equivalent */ },
    { id: "sunset", when: [has("Spectral")],               // strictly more specific than "base"
      note: () => "In this room each ring must be the next colour along the rainbow (a sunset target).",
      python: ({ outer }, ctx) => /* same, with: if prev is not None and hue(col) != hue(prev) + 1: break */ ,
      typescript: /* … */ },
  ],
  exemplar: …, max: (_, ctx) => Math.ceil(ctx.terms.size / 2) ** 2,
});
```

Two kinds of degradation are visible here. **Odd versus even N needs no variant**, because `Board.rings()` ends in one cell or a 2×2 block, so the class method absorbs the geometry. **Colour order** is a variant, because the rule genuinely changes. With all current colour sets Spectral, every room uses "sunset". That is correct, and the base variant still guards future unordered colour sets. It also guards one more problem: in "sunset" on RGB, `outer` must leave room for ⌈N/2⌉ further hues. `max` and the exemplar test will expose that at N=7 with RGB (4 rings but only 3 hues). The fix is either a refinement `{term:"colours.count", op:">=", ...}` on that variant, or `hue_turn` with a `Wheel` variant. The test suite forces this decision rather than letting it slip through.

### Where we stop short of type-level machinery

| Could encode in TS types | Decision |
|---|---|
| `Pick<ClassDicts, Closure<C>>` for `ctx` | **Yes.** It is cheap and gives autocomplete and errors for authors. |
| Numeric refinements (`size >= 5` ⇒ `N` literal ≥ 5) | **No.** TS has no usable type-level arithmetic. The runtime check plus exhaustive tests replaces it. |
| Instance existence per instantiation at compile time | **No.** Arguments are runtime values, so the registry is the solver. |
| Checking that a Python body type-matches the TS body | **No.** Parity tests cover it. |
| Associated types (`Suit`) as TS types | **Partly.** `suits: Component` is a value, and in the guest a suit is a plain number. |
| Multi-parameter classes | **No, not in v1.** If a relational capability appears (e.g. `instance (Suited s, HasRed c) => SuitPaint s c`), add `DerivedInstance { needs: ClassId[], build(dicts) }` on the instantiation. The resolver already has every component dictionary. |

Constraint solving stays trivial (closure lookup plus numeric comparisons, no backtracking), so availability is decidable, instant and explainable. That is why the UI can say *why* a rule is locked.

---

## 9. Migration and phased plan

### 9.1 How Int and string slot in without breaking anything

| Today | After | Compatibility |
|---|---|---|
| `ObjectType = "Int" \| "string"` | `string` validated against `OBJECT_TYPES` | Existing literals still type-check |
| `Domain {objectType,intMin,intMax,stringMaxLength}` | `InstanceEnv` built from `Instantiation`; `Domain` kept as a deprecated alias, adapted by `envFromDomain()` | Int/string families unchanged |
| `UtilityFamily.python/typescript(p)` | `variants: [{id:"base", when:[], python, typescript}]` | Adapter `legacy(f)` wraps the old shape; no family file edits are needed in phase 1 |
| `sample(rng)` | `sample(rng, ctx)` | Extra arguments are ignored by old families |
| Lottery filters by exemplar legality | `resolve` first, exemplar check kept as a safety net | Int families can later declare `{term:"bounds.max", op:">=", value: 1e9}` and get "needs bigger numbers" UX for free |
| `utility()` asserts [0,1] | the assertion is applied only where `family.max` is undefined (legacy) | Grid scores are raw points |
| Int/string transformations | `basePrelude` is empty, the wrapper is the identity codec | The runtime path is unchanged byte for byte (verify that the cache key changes only for Grid) |
| `Settings.intMin/intMax/stringMaxLength` | mirrored into `typeArgs` by the server | Old clients keep working; remove after 2 releases |

### 9.2 Phases and file ownership (parallel workers, disjoint files)

| Phase | Worker | Owns (exclusive) | Deliverable |
|---|---|---|---|
| **0** (blocking, 1 worker) | Core types | NEW `lib/game-types/` (`kinds.ts`, `classes.ts`, `constraints.ts`, `resolve.ts`, `explain.ts`, `prelude.ts` skeleton, tests) | Types from §§1–3; `entails`/`satisfied`/`resolve`/`explain`/`nearestUnlock`; registry with coherence checks; Int and string `ObjectTypeDef`s with empty preludes |
| **1** (parallel) | A: Grid type | `lib/game-types/src/grid/**` (size/Board, 4 symbol sets, 3 colour sets, instances, codec, base prelude py/js/dts) | Laws (§5.2) green on all 60 instantiations; `components.lock.json` |
| | B: Settings | `lib/game-core/src/settings.ts`, its tests | `typeArgs`, generic `validateSettings`, `assertObjectValue` via codec, Grid in `SETTINGS_OPTIONS.objectTypes` |
| | C: Runtime | `lib/game-runtime/**` | `DomainSettings.typeArgs` plus a trusted `prelude`/`codec` payload; prelude injection plus decode/encode wrap in both workers; cache keys; hostile tests (monkeypatched `Cell`, oversized output) |
| | D: Utilities core | `lib/game-utilities/src/{types,catalog,selectors}.ts`, `test/utilities.test.ts`, `test/support.ts`, `test/parity.py` | Generalised family type plus `legacy()`, card source with "Uses room helpers", host evaluator with prelude, enumeration harness (§5.3), `availability.lock.json` |
| | E: API spec | `lib/api-spec/openapi.yaml`, regenerate `lib/api-zod`, `lib/api-client-react` | §7.3 schemas |
| **2** (parallel, after 1) | F1–F3: Families | `lib/game-utilities/src/families/grid/{arithmetic,geometry,cards}.ts` (one file per worker) | Port the best rules from arithmetic.md and geometry.md (and a cards lens); the 3 seed rules; Flush Royale; Bullseye |
| | G: Server | `artifacts/api-server/src/game/{projection,engine,runtime-setup}.ts`, manifest route | resolved catalog in `RoomState`, `objectInstance`, spawn through codec, Grid smoke in runtime-setup |
| | H: Room UI | `artifacts/code-gods/src/pages/room.tsx` (split into `components/settings/*`, `components/grid-board.tsx`) | §7.1 pickers, shelf, badges, unlock, mini boards |
| | I: Player | `artifacts/player-web/src/**`, `lib/player-client/src/protocol.ts`, `lib/ai-player` prompt | helper drawer, diagnostic rewrite, boards, protocol optional fields |
| **3** | J: Calibration and docs | `lib/game-utilities/scripts/calibrate.ts`, `docs/catalog.md`, READMEs | per-instantiation calibration tables; "Adding an object type / instance / family" guides (§8) |

The critical path is 0 → A+D → F → G/H/I. B, C and E only need the phase-0 types. H and I can start against fixture manifests as soon as E lands.

---

## 10. Ordered utility outputs and information calibration

The proposed change: `utility :: (constraints) => T args -> o` with `Ord o`. On the wire `o` is `number | number[]`, where `number[]` compares lexicographically and higher is better. The engine converts it to information, `I(x) = −log2 P_{Y~spawn(inst)}[u(Y) ≥ u(x)]`. This section covers where `Ord` lives, how calibration tables are keyed, cached and deterministic, and how exact tails plug in. How scores compose across gods is still out of scope.

### 10.1 Where `Ord` sits: on the codomain, as an associated type of the family

`Ord` is **not** in the object-type hierarchy of §2. Those classes describe the *domain* (symbols, colours, size). `Ranked` orders symbols, and `Ord` orders *scores*. They share nothing, and merging them would let a family's score order depend on the room, which breaks coherence. Instead, every family has an associated output type, `type Out f`, fixed per family (and identical across its variants, so I(x) means the same thing whatever variant a room resolves).

```ts
// lib/game-types/src/score.ts
export type ScoreShape =
  | { kind: "scalar"; integer: boolean }               // number
  | { kind: "lex"; arity: number; integer: boolean };  // number[] of fixed arity, lexicographic
export type Score = number | readonly number[];

/** The ONLY Ord instances: one per shape, built in. Families cannot supply their own comparator. */
export function compare(shape: ScoreShape, a: Score, b: Score): -1 | 0 | 1;
export function assertScore(shape: ScoreShape, x: unknown): asserts x is Score; // finite, right arity, integer if declared
```

| Decision | Reason |
|---|---|
| Built-in `Ord` instances only, one per `ScoreShape` (coherent by construction) | The order is visible on the wire, so every client, the host and the Python parity test compare identically. A custom comparator would be a second source of truth. |
| A family wanting a different order encodes it into the shape (negate, reorder components) | This is like `newtype Down`: change the representation, never the instance. |
| `integer: true` is the default and strongly recommended | Ties matter, because `P[u(Y) ≥ u(x)]` includes equality. Integer scores make ties exact across Python, JS and the host. Float scores are allowed only if the parity test shows bit-identical outputs (`Object.is`), not 1e-9 closeness. |
| Arity is fixed per family | Lexicographic comparison of unequal-length vectors would silently depend on the padding convention. |
| `max` (§3.2) becomes `top(p, ctx): Score` | The exemplar must achieve `compare(top, u(exemplar)) == 0`. |

`UtilityFamily` gains `readonly out: ScoreShape`. The legacy Int/string families get `{kind:"scalar", integer:false}`, and their exact parity tolerance is kept for them only.

### 10.2 Calibration as a class with a default method

Treat calibration as a class over a *resolved draw* `d = (family, variant, params, inst)`:

```haskell
class Ord (Out f) => Calibrated f where
  tail :: Draw f -> Out f -> Log2Prob        -- log2 P[u(Y) >= o]
  tail = sampledTail                          -- default method: estimator
```

```ts
export interface TailFn { (o: Score): { log2p: number; exact: boolean } }
export interface Variant<…> {
  …;
  /** Optional exact tail ("proof"). Attached to the VARIANT, because the rule (and its distribution) differs per variant. */
  tail?(p: P, ctx: SampleCtx<…>): TailFn;
}
export function tailFor(d: ResolvedDraw): TailFn {
  return d.variant.tail?.(d.params, d.ctx) ?? sampledTail(calibrationTable(d));   // default method
}
```

Exact tails come from the author (closed form, a DP over independent rows, a combinatorial count). Coherence holds because there is at most one exact tail per variant and the default is used otherwise. An exact tail must *agree* with the default where both are defined (the test in §10.5).

### 10.3 Calibration table: shape and estimator

```ts
export interface CalibrationTable {
  readonly key: string;                        // §10.4
  readonly shape: ScoreShape;
  /** Strictly increasing score levels, with log2 P[u(Y) >= level] (non-increasing) and a 95% CI. */
  readonly levels: readonly { o: Score; log2p: number; lo: number; hi: number }[];
  readonly floorLog2p: number;                 // deepest resolved level, e.g. -60
  readonly estimator: { id: "mc" | "splitting" | "nested"; version: number; seed: string; samples: number };
}
// lookup(o): the largest level <= o under compare(). If o is above every level: floorLog2p (capped, flagged).
```

The estimator is chosen by depth. Plain Monte Carlo covers the shallow head (most random grids). **Multilevel splitting** covers the deep tail, with the MCMC kernel "resample one uniformly chosen cell from spawn". That kernel is reversible with respect to the product-uniform spawn measure, so conditioning on `u ≥ level` stays exact under Metropolis rejection. Nested sampling can be dropped in as `estimator.id` without changing consumers. Lexicographic scores work unchanged, because splitting needs only a total order.

### 10.4 Deterministic keying and caching (content-addressed)

Key the table on **what the utility function actually depends on**, not on names:

```
key = sha256( canonical JSON of {
  spawn:     spawnFunctionId + codec id/version                       // measure on Y
  inst:      only the terms and tables the variant uses               // from `uses` (§3.3): e.g. size=5, colours.count=3,
                                                                      //   _SUIT table bytes; NOT the unused symbol tables
  body:      sha256(generated JS body of the variant)                 // the params are already substituted
  params:    canonical(params) under the symmetry group (§10.4.1)
  estimator: id + version
})
seed = key   →   the estimator's RNG is seeded from the key, so the same key gives a byte-identical table on any machine
```

Two consequences follow. (1) Base10 and base12 rooms *share* tables for a family that uses only `Finite` symbols with the same count. They won't here (10 ≠ 12), but colour-only families share a table across every symbol set: 4× fewer tables. (2) Editing a family body, a table, or the estimator changes the key automatically, so stale tables cannot be served. There is nothing to invalidate by hand.

Storage: a `calibration_tables(key primary key, table jsonb, created_at)` table, plus an in-process LRU. The game record stores the keys it used, so replays never recompute.

Timing: tables are computed for the *dealt* descriptors at game start, during the planning phase, which bounds the work at gods × 1 table. Common draws are optionally pre-warmed. If a table is not ready when the running phase starts, the engine waits (planning is ≥ 60 s by default). It never silently uses a coarser table, because I(x) must be a function of the key.

#### 10.4.1 Symmetry: collapse draws onto one table

The spawn measure is invariant under G = S_colours × S_symbols × D4. A draw's table may be shared along an orbit only where the *utility* is equivariant: `u_p(σ·g) = u_{σ·p}(g)`. Then `P[u_p(Y) ≥ o] = P[u_{σ·p}(Y) ≥ o]`. The usable subgroup is the intersection of the automorphism groups of the structure the variant uses:

| Structure used (from `uses`) | Automorphisms (relabellings preserving it) |
|---|---|
| `Finite c` only | S_k: any colour permutation |
| `Spectral` (`hue`, `hue_step`) | trivial. The reversal also breaks "+1", so it is excluded. |
| `Wheel` (`hue_turn`, `hue_dist`) | C_k rotations (D_k if only `hue_dist` is used) |
| `Mixable` | permutations preserving the mix table (rainbow6: swaps fixing the R/Y/B ↔ O/G/V pairing, S_3) |
| `Finite s` only | S_\|S\| |
| `Suited` (+`Ranked`, `Valued` via rank) | S_suits: suit relabelling |
| `Valued`/`Ranked`/`Numeral` | trivial on symbols |
| `Board` lines, rings, neighbours | D4 acts on the grid only. Params carry no positions, so D4 does not change keys. It is used inside the estimator as free variance reduction (average u over the 8 images). Families with positional params declare an action. |

Params declare **roles** so the default canonicaliser can act on them:

```ts
export type ParamRole = "colour" | "symbol" | "suit" | "int" | "opaque";
readonly roles?: Readonly<Record<keyof P, ParamRole>>;   // on UtilityFamily
// canonical(p): for each role whose slot group (above) is full Sₖ, rename indices by first appearance → 0,1,2…
// e.g. Bullseye{outer: BLUE} with base variant → {outer: 0}: all k colour draws share one table.
//      Flush Royale{suit: HEARTS} → {suit: 0}: 4 draws share one table.
//      Bullseye "sunset" (uses hue) → no collapse.
```

The derived group is conservative: anything not recognised gives the trivial group, which is never wrong, only slower. An author can widen it explicitly (`symmetry: { colours: "rotations" }`). Any claim, derived or explicit, is checked by the equivariance test.

### 10.5 Tests (added to the §5.3 harness)

| Test | What |
|---|---|
| Shape | `assertScore(out, u(x))` over all edge, exemplar and random inputs; `u(exemplar) == top` |
| Parity | Python, JS and host scores are *identical* (`compare == 0`), not approximately equal |
| Equivariance | for random g and σ in the claimed group: `u_p(σ·g) == u_{σ·p}(g)` (500 samples per draw class) |
| Determinism | same key → byte-identical table across two runs; a change in body, table or estimator version → a different key |
| Exact tail vs sampling | at every level reachable by MC (P ≥ 1e-4), `exact` lies within the binomial 99.9% CI. Deeper, it lies within the splitting CI. The exact tail is also monotone non-increasing with `tail(min) == 0`. A mismatch fails as "your tail proof disagrees with sampling at o=…". |
| Calibration (replaces mean<0.02) | random spawns have median I ≤ 1 bit, and `I(exemplar)` ≥ 12 bits or hits the floor (thresholds owned by the tests worker) |
| Cost guard | splitting reaches `floorLog2p` within the budget for every (family × covering-array instantiation); an exact tail is suggested where it does not |

### 10.6 Knock-on changes to earlier sections

- §3.2: add `out: ScoreShape`, `roles`, and an optional per-variant `tail`; `max` → `top`.
- §3.4/§5.3: the selector and tests use `top` and the information calibration, not [0,1] bounds.
- §7: the utility card and player UI may show "this object is worth ~N bits to you" from `I(x)`. Display is decided with composition.
- §7.3: `FamilyInfo.out: ScoreShape`, `PublicObject` keeps `totalUtility` for now (composition pending), and player protocol `ownUtility: number | number[]`.
- §9.2: NEW worker K owns `lib/game-calibration/` (estimators, keying, symmetry canonicaliser, storage adapter) after phase 0. G (server) wires table computation into game start.
