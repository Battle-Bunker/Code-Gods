# Linear equations, representations and perturbation scoring: what the code allows and what each path costs (14 November 2026)

This is the code-aware half of the brainstorm in `linear-equations-brief.md`. It maps what exists, lists every assumption
the brief breaks, costs three paths, sketches the representation-elements layer as it would sit in this repository, and
recommends one path. It is design only: no engine or app code changed.

Line counts are `wc -l` on `develop` at the time of writing, sources without tests unless stated.

| Package | Source lines | Test lines | What it is |
|---|--:|--:|---|
| `lib/game-types` | 6,613 | 3,102 | object-type contract, the three types, mutators, prices, cost models, noise, preludes |
| `lib/game-utilities` | 23,399 | 6,224 | 148 rule families, calibration, analytic laws, tiers, hold rarity, annotations ("explain") |
| `lib/game-core` | 2,535 | 1,590 | settings, energy, change cost, scoring arithmetic |
| `lib/game-runtime` | 1,383 (+ guest Python) | — (tests are `.mjs`) | WASI CPython and QuickJS sandboxes; type-agnostic |
| `lib/object-views` | 3,190 | 1,134 | object renderers, the annotation board (`explain/`) |
| `lib/player-client` | 6,192 | 2,781 | SDK, protocol, replay playback, first agents, primer |
| `lib/ai-player` | 1,291 | 1,229 | AI seats and the assistant prompt |
| `lib/ui-kit` | 1,024 | 192 | generic components |
| `artifacts/engine` (Convex) | 20,729 | 14,846 | tick, storage, auth, rooms, calibration storage, MCP |
| `artifacts/player-web` | 31,711 | 5,892 | the web app |
| `lib/grid-lab` | 34,622 | 2,533 | Python research lab; the parity oracle for grid families |
| data | 28 MB | | `lib/game-utilities/data/calibration/v1`: 69 files, 6,888 tables |

---

## 1. How an object type and a rule family are defined today

### 1.1 The contracts

There are **three** object types, not four: `Int`, `string` and `Grid` (`lib/game-types/src/registry.ts`,
`OBJECT_TYPES = [INT, STRING, GRID]`). Playing cards are a Grid symbol set (`Grid(6,cards,rainbow6)`).

- **`ObjectTypeDef<V>`** (`lib/game-types/src/types.ts:260`) is the whole type: params, capability classes,
  `instantiate`, `codec` (one canonical wire form, `ObjectValue = number | string`, at most 1,024 characters),
  `spawn` (documented as "the uniform spawn prior μ"), `propose` (a symmetric MCMC kernel that must leave μ invariant),
  `callWork` (W of a call: its net effect decomposed into elementary moves), `costTable`, `layerBits` ("log2 alphabet ×
  cells", the read bound), `mutators`, and `prelude` (the generated Python, JavaScript and `.d.ts` guest source that
  agents and rule cards run against).
- **`MutatorDef<V,P>`** (same file): `parse`, `describeBits`, `apply`, `erasureBits`, `sample`, `scope`, `kind`,
  `costModels?`, and `guest` (the constructor's source in both languages). Its parameters are indices into the one
  decoded value: cell index, symbol index, digit place.
- **`UtilityFamily<P>`** (`lib/game-utilities/src/types.ts`): id, `objectType`, `requires`, `shape` (scalar or tuple),
  `params` (typed: colour, symbol, int, choice, bool, set; no rational or real kind), a **finite** `support`, `sample`,
  `canonical` (one calibration table per symmetry orbit), `summary`, and `card: {python, typescript}`. The card is the
  rule: a complete kid-readable program run against the prelude. The TypeScript card is the host evaluator
  (`evaluator()` compiles it with the JS prelude); the Python card must induce identical ordinals. Optional: `exemplar`,
  `top`, `example`, `tiered`, `cardTiers`, `analytic`.
- **`Ordinal`** = a safe integer or a tuple of them, enforced by `assertOrdinal` (`catalog.ts:166–169`).
- **Scoring**: `artifacts/engine/convex/engine/node.ts score`: ordinal → `surprisal(table, ordinal)` (a precomputed
  `[ordinal, bits][]` table keyed by family, canonical params, instantiation, card hash, prelude hash, `spawn:
  "uniform"` and estimator) `+ holdBits(table, ordinal)`; the defence goal through `softHinge`. Payoff is own bits times
  the floored sum of peers' bits.
- **Annotations** (`lib/game-utilities/src/explain/`): a `Lens` per family (21 lens files, 23–60 lines each, plus
  `tier-lenses.ts` 346 and `tier-lenses-more.ts` 110) produces an `Explanation` of `Part`s, each a set of grid cells
  `{r, c}` with a `PartShape` (`cell | pair | line | block | window | region | ring`), points per ordinal component,
  facts, spots, links and `heat`. `verified` is set only if the parts add up to the card's ordinal. Drawn by
  `lib/object-views/src/explain/GoalBoard.tsx`. **`explainer()` returns null for anything that is not a Grid**
  (`explain/index.ts:119`, `explain/board.ts:44`). There is **no Python mirror of annotations** (the brief says there
  is; the code has none): agents' Python helpers have the prelude only.

Nothing switches on a discriminated union of values; types are looked up by id. But **literal type checks survive in
about 23 source files** outside game-types and game-utilities, and in about 10 inside them.

### 1.2 Every place a new object type must be touched

| Area | Files | Lines involved (file size → expected change) |
|---|---|---|
| Type module: codec, spawn, propose, callWork, costTable, layerBits, prelude, describe | new `lib/game-types/src/<type>/index.ts`, `mutators.ts` | new; Int is 694, Grid is 2,885 |
| Registry, exports, capability classes | `game-types/src/registry.ts`, `index.ts`, `constraints.ts` | 270 → ~15 |
| Cost model layers and generators (distance pricing) | `game-types/src/structure/index.ts` | 279 → ~60, or the type stays on `set-v1` |
| Hold noise | `game-types/src/noise.ts:126` (a per-type branch) | 138 → ~40 |
| Read pricing | `game-types/src/pricing/measure.ts` via `layerBits` | 0 if `layerBits` is honest |
| Families | new `game-utilities/src/families/<type>.ts`; `catalog.ts` registration | new; Int's file is 608 |
| Param kinds | `game-utilities/src/params.ts` (a rational kind) | 127 → ~40 |
| Calibration dispatch | `calibration.ts` (`instantiateKey` falls through to **Grid** for an unknown key, `FIRST_USE_SECONDS`), `scripts/estimator.ts` (`kernelSize`, `enumerate`), `scripts/calibrate.ts` (preset lists), `analytic/index.ts` | 1,558 → ~80 |
| Analytic laws (optional) | new `game-utilities/src/analytic/<type>.ts` | new; Int's is 305 |
| Calibration data | one new `data/calibration/v1/<key>.json` + manifest; upload step | data |
| Annotations | `explain/index.ts`, `board.ts`, `model.ts`, `units.ts` (all Grid-shaped) + lenses | 711 → a new non-grid path, 500+ |
| Views | `object-views/src/views.tsx` (component, `register`, `objectContext`), `rarity.ts` (`objectNoun`), `registry.ts` | ~600 → 60–200 |
| Settings | `game-core/src/settings.ts` (`ALL_TYPES`, `TYPE_DEFAULTS`, seed setups) | 1,133 → 10–40 |
| Agent onboarding | `player-client/src/first-agent.ts`, `skills.ts`, `primer.ts` | 269 → 10–30 |
| Assistant prompts | `ai-player/src/assistant-prompt.ts` (`boardKeyLine`), `policy.ts` | 269 → 10–30 |
| Engine | `convex/agent/registry.ts` (`firstAgentOf` is Grid-only), `lib/builtinPlayer.ts`, `runtime/probe.ts`, `engine/runtime.ts` | 0 required; ~20 for example agents |
| Web app | `object-editor-model.ts`, `object-editors.tsx`, `forge.tsx` (examples are Grid-only), `rules.tsx`, `results.tsx`, `replay/parts.tsx`, `rule-gallery.ts` | 50–200 |
| Tests and parity | `game-utilities/test/support.ts`, `fixtures.ts`; `game-runtime/test/parity/make-cases.mjs` + regenerated `golden.json`; `engine/test/game-full.test.ts` SPECS; `object-views` `renderers.test.ts`; `object-editor-model.test.ts` | 30–150 |
| Stored data | none while the value fits `v.union(v.number(), v.string())` in 1,024 characters | 0 |

**Total for a new type the way Int was done:** about 45 files, 7 to 9 of them new; roughly 2,500–3,500 lines new or
changed, plus 500+ for annotations, before any rule family is designed. The type-level work is cheap because the
contract is generic; the annotation, calibration and onboarding work is where the Grid assumption lives.

### 1.3 Trace of one rule family: Opposite Nines (beginner Grid, tuple of 2, tiered)

| Part | File | Lines |
|---|---|--:|
| Family: text, both card sources, tiers, exemplar, top, example | `game-utilities/src/families/grid/beginner/opposite_nines.ts` | 130 |
| Shared geometry (`halfTurnPairs` over `{r, c}`) | `.../beginner/_pairs.ts` | 24 |
| Registration | `.../beginner/index.ts` | 10 |
| Tier interactions (lines x, squares x) | `families/grid/tiers.ts` + `layered/*-tiers.ts` share | ~40 |
| Lens (annotation) | `explain/lenses/opposite-nines.ts` + `pair-unit.ts` | 56 |
| Example agents, Python and TS | `example-agents.ts` | ~45 |
| Python reference scorer (parity oracle) | `lib/grid-lab/gridlab/rules/beginner/opposite_nines.py` | 33 |
| Calibration | 188 tables in 24 instance files (base `mc-ams`, tiered draws `hybrid`) | ~4.5 MB |
| Tests | `tiers-explain`, `tiered-deal`, `rule-text-truth`, `explain`, `layered-rules`, `tiers`, `tiered-profile`, `mono`, `bidding` | shared suites |
| Scripts and docs | `nines-pairs-exact.ts` (39), tier sweeps; `docs/layered-rules-measurements/opposite-nines.md` (189) | |

About 290 lines of TypeScript and 33 of Python are specific to this one family, plus 4.5 MB of tables. The Python card
is generated from the same family file (`card.python`), so "TS/Python parity" for rules is a parity of two hand-written
templates in one file, checked by `game-utilities/test/parity.py` against fixtures and by `gridlab_parity.py`
against grid-lab.

---

## 2. Every assumption the brief breaks

| # | Assumption | Where it lives | Depth |
|---|---|---|---|
| A1 | **A uniform prior μ exists.** | `ObjectTypeDef.spawn` ("the uniform spawn prior μ"), `propose` (must leave μ invariant), `TableKeyParts.spawn: "uniform"`, `PriorRef`, `MutatorDef.describeBits` defined as "uniform sampling has probability 2^-D", `analytic/kit.ts` finite `Dist`s, `tiers/hybrid.ts` `DisjointBase` | **Deep.** It is the definition of reward bits. But it is confined to `game-utilities` calibration and `noise`/`spawn`; the engine only calls `surprisal(table, ordinal)`. |
| A2 | **Rarity is precomputed per (family, params, instantiation) into tables.** | `calibration.ts` (575), `scripts/estimator.ts` (677), `scripts/calibrate.ts`, `analytic/*` (~1,000), `tiers/hybrid.ts` (421), 28 MB data, `calibrationFiles` table, `convex/engine/calibration.ts` (291), `convex/calibration/*` (~800), the pinned per-game file (`engine/pinned.ts`), the client's `calibration/mine.ts` download, `UtilityFamily.support` finite and enumerated for coverage | **Deep but well bounded.** One call site scores (`engine/node.ts score`); the rest is supply chain. A valuation that is computed per state needs none of it. |
| A3 | **Hold rarity is an add-on to static rarity.** | `energy-model.md §8`, `game-utilities/src/hold.ts`, `scripts/hold.ts`, `holdTables`, `engine/hold.ts` | **Shallow, and an asset.** `noise.ts` already draws one cost-weighted move with probability ∝ 2^−C, and hold is −log2 P(U(x′) ≥ u). That is the brief's perturbation lens, conditioned on a level instead of a state (§4.5). |
| A4 | **One concrete shape per type; one decoded value.** | `Codec<V>`, `prelude()` (one guest object per type), `GridValue`, `layerBits`, `structure/index.ts` layers ("symbol", "colour", "value") | **Medium.** Every type has one decode. Adding derived views is additive; nothing forbids them, nothing provides them. |
| A5 | **Annotations are per family, against grid cells.** | `explain/model.ts` (`Cell {r,c}`, `PartShape`, `Explanation.size`), `lens.ts` (`Lens<p, Board>`), `board.ts`, `units.ts` (hit-testing `x ∈ [c, c+1)`), `GoalBoard.tsx`, `modes.tsx`, `layout.ts`; `explainer()` returns null for non-Grid | **Deep within ~2,500 lines; nothing else depends on it.** No stored data, no engine code, no Python. It is the cheapest big thing to replace. |
| A6 | **A single view per object.** | `object-views` registry: alternative renderers per type, one drawn at a time (choice kept in localStorage); compact = inline, expanded = popover with `GoalBoard` | **Shallow.** No notion of parallel views, but nothing prevents them. |
| A7 | **Mutators are not tied to a representation.** | `MutatorDef` params index the one decoded value; `structure/` layers; `noise.ts` enumerates elementary moves per type | **Shallow in the contract, deep in pricing.** A mutator is just a function on the value, so "rotate the line about its y-intercept" is expressible today. What is missing is a declared link between a mutator and a representation (for docs, views and the noise), and `callWork`'s "cheapest decomposition of the net effect" rule, which **actively erases lens choice**: it prices a call by the cheapest elementary route to its net effect, whatever the agent named. Under that rule rotating between lenses cannot be cheaper. |
| A8 | **Integer-only values.** | `ObjectValue = number \| string`; `assertOrdinal` (safe integers); `Rng.int/big` only; `ParamSchema.int`, `ParamType.int`; 15 `isSafeInteger` and 18 `isInteger` checks in 20 files; Int codec | **Medium.** Rational state fits a string wire (`"3/2,-4"`). Rational *ordinals* do not: a rule like "distance of the gradient to the nearest prime" must emit an integer (scaled) ordinal or the Ordinal type must widen. |
| A9 | **Finite parameter support.** | `UtilityFamily.support`, `coverage`, `playableInstantiations`, dealable params | **Medium.** Needed only because every dealt draw needs a table. Under per-state valuation, support may be infinite (a sampled `q`, `k`). |
| A10 | **Storage.** | `objects.value` is `wire`; `by_game_value` index enforces uniqueness on the canonical wire; `objectViews`, `knowledgeLog`, `objectEvents`, `tickBatches` copy the value; `scoreV {ordinal, rewardBits, netBits, penalty…}`; `deities.utility: v.any()` | **Shallow if the value stays a short canonical string.** Uniqueness makes "what is the same object" a storage question (the line vs the written equation, §3). Representations must be derived, never stored, or the 1,024-character wire and the 1 MiB `tickBatches` document (400 events × before+value+calls) break. |
| A11 | **Replay and the event log.** | `EVENT_LOG_SCHEMA = 15` (`convex/lib/world.ts:81`); `player-client/src/replay.ts` plays outcomes back and "never re-runs an agent, a sampler or a scorer"; stored replay file per game | **No conflict.** Replay plays recorded values and recorded scores. A new valuation needs no replay change; old games replay as charged and scored. |
| A12 | **Query-cost rules (R1–R9).** | `artifacts/engine/test/query-budgets.ts` (≤100 docs, ≤64 KiB, ≤50 ms) | **No conflict** if representations and annotations are computed client-side from the subscribed value (as annotations are today). Storing per-representation payloads per object per god would break R3/R8. |
| A13 | **Sandbox.** | `lib/game-runtime`: wire ≤ 1,024 chars, prelude part ≤ 64 KiB, IPC ≤ 512 KiB; "the runtime knows no object type" | **No conflict.** Elements reach agents through the prelude. A prelude carrying several representations' helpers must stay under 64 KiB per language: fine for linear equations, a budget to watch for a general algebra type. |
| A14 | **Determinism across TS and Python.** | Rule cards: two templates per family; prelude helpers: two templates per type; Python parity only for cards and preludes | **The real risk for a general element API.** Hand-mirroring per element in two languages is exactly what the owner asks to generalise. Floating `log2` is not guaranteed identical between V8 and CPython's libm (§4.5). |

---

## 3. Three paths, costed

Common to all three: the linear-equation type itself. Its value is a short canonical string, so storage, the sandbox,
replay and the query rules are untouched. Two decisions belong to the owner before any code:

- **What is "the same object"?** (a) the **line**: canonical `(a, b, c)` with gcd 1 and a sign convention, every
  written form derived; uniqueness is per line. (b) the **written equation**: `2y + 4x − 6 = 0` and `y = −2x + 3` are
  different objects; a scale factor and a "form" are state. (a) is simpler, makes every representation a pure view, and
  makes "rotate between lenses" a choice of *mutator*, not of state. I recommend (a).
- **Number domain.** Rationals with bounded height (|numerator|, |denominator| ≤ H, for instance H = 99) plus
  vertical lines. The space is then finite but huge (about 10^7 lines for H = 99) and has no natural uniform measure,
  which is the brief's real point; "infinite" is not required to need the new scoring.

### Path (i): one more object type inside today's structure

**What the owner gets.** Linear equations playable in a room, scored by static rarity under a declared prior (uniform
over the bounded domain), with mutators per lens (set slope, shift intercept, rotate about a point, scale `a`) priced
by the existing `callWork`. A plane renderer and an equation renderer as two alternative renderers (one at a time). No
annotations (the explainer returns null for non-Grid, as for Int and string today). No element API.

**Size.** 3 packages of substance (game-types, game-utilities, object-views) plus small edits in 6 more; about 45
files; 3,000–4,000 lines including 8–12 families; 5–7 pull requests.

**Order.** Type + mutators + prelude → families + Python cards + parity → calibration (mc-ams with a `propose` kernel
over the bounded domain) → renderer → setup and onboarding text.

**Risks.**
- Rarity under a uniform prior on bounded rationals measures the wrong thing: "slope near a prime" is rare or common
  depending on H, not on skill. The owner's stated motive for the new scoring is lost.
- `callWork`'s cheapest-decomposition rule makes lens choice worthless (A7).
- Everything learned has to be redone for the element API later. Families written against a bespoke prelude become
  migration debt.

**Stored data.** None changes. **Correctness.** Existing card parity, calibration freshness tests, `game-full` SPECS.

### Path (ii): staged refactor (recommended)

Introduce a representation/element layer and a pluggable valuation interface; ship linear equations first **on** the
new layer; then move Int, string and Grid onto it one at a time, keeping `develop` shippable throughout.

**What the owner gets.** The brief, in full, for linear equations within about the first 8 PRs: parallel
representations, a single element API used by rule cards, annotations and mutators, primary representation in compact
contexts, perturbation valuation as a room setting. Afterwards, one model for every type, and today's Grid
annotations re-expressed as element annotations without loss.

**Size.** Two new packages (`lib/object-model`, `lib/valuation`), changes in 8 existing ones. Roughly 8,000–12,000 new
lines and 3,000–5,000 changed, over 18–26 PRs:

| Stage | PRs | What | Lines |
|---|--:|---|--:|
| A. Foundations | 3 | `lib/object-model` (exact rationals, element expression AST, TS and Python interpreters, golden vectors); declarations; `Valuer` interface with `rarity-v1` extracted bit-for-bit | 2,500 |
| B. Linear equations | 4–5 | the type on the layer; mutators per representation with an honest price (§4.4); 10–15 families; `perturb-v1` valuation; behind a setup | 3,500 |
| C. Views | 3–4 | element-driven annotation renderer; plane, equation, table and number-line views; parallel expanded view; compact primary view; goal card | 3,000 |
| D. Int and string onto the layer | 2–3 | declarations for existing types; their families gain element annotations (they have none today) | 1,500 |
| E. Grid onto the layer | 5–8 | cells/rows/lines/blocks as elements; the 21 lenses re-expressed as element annotations; `GoalBoard` becomes the grid view of the generic renderer; the Grid-literal branches removed | 2,500 changed |
| F. Narrowing | 1–2 | drop the old explain model, the `"Grid"` literals, old settings fallbacks | −2,000 |

**Order and parallelism.** A strictly first (A1 → A2/A3 in parallel). B and C in parallel once A2 lands (one stream on
the type and families, one on views). D and E are independent of each other and of B's families. F last.

**Risks.**
- The element AST grows into a programming language. Mitigation: rule cards stay programs (§4.2); the AST covers only
  element definitions and annotation values, which are arithmetic.
- Perturbation valuation is new and its balance is unmeasured. Mitigation: it is a room setting next to `rarity-v1`, as
  cost models are today; hold rarity's tooling measures it.
- Grid's 21 lenses carry a lot of craft (tiers, `heat`, `nearest`). Stage E must reproduce them; the verified
  "parts add up to the ordinal" invariant is the test.
- Throughput: `perturb-v1` costs per-state work at score time (§4.5).

**Stored games and replays.** Nothing is wiped. Widen: `games.settings.valuation` optional (absent = `rarity-v1`);
`scoreV` gains an optional `valuation` id; `EVENT_LOG_SCHEMA` 16 marks batches scored under a non-rarity valuation.
Replays play recorded scores, so old games replay exactly. No migration is needed for the valuation (absent means
rarity); a migration is needed only if a later PR makes the field required. Grid's stored values do not change: the
element layer reads the same wire.

**Correctness.** (1) `rarity-v1` behind the `Valuer` interface is checked bit-for-bit against today's `score()` on
the existing engine suites. (2) Element values: golden vectors run by both interpreters (TS in vitest, Python in the
`parity.py` style). (3) Cards: today's parity. (4) Annotations: the existing invariant (parts add up to the ordinal),
now generic. (5) Grid migration: every lens's output on its seeds compared before and after (snapshot), and
`calibration.test.ts` freshness stays green because tables are untouched. (6) Live suites unchanged.

### Path (iii): restart the rule, object, annotation and valuation libraries

**Rewritten:** `lib/game-types` (object contract, mutators, preludes, cost models, noise), `lib/game-utilities`
(families, calibration, tiers, hold, explain), `lib/object-views` (renderers and explain board), the type-specific
parts of `player-client` (`first-agent`, `primer`), `ai-player`'s prompt text, `player-web`'s editors, forge examples
and goal card.

**Kept:** `lib/game-runtime` (sandbox), `lib/game-core` energy and scoring arithmetic, the Convex engine (tick, commit,
lease, event log, storage, auth, rooms, bid phase, MCP, query rules), replay playback, `ui-kit`, the web shell.

**Size.** About 30,000 source and 9,000 test lines rewritten; 148 families re-authored or retired; 28 MB of tables
regenerated or retired; parity rebuilt; grid-lab's role as oracle lost. 40–60 PRs.

**The obligation that undercuts it.** Stored games hold Grid, Int and string wire values and their rule descriptors.
Replays, past-games pages and knowledge logs must keep rendering them. So the old codecs, renderers and card evaluators
stay alive anyway (or are rewritten bit-compatibly), and every surviving family must produce identical ordinals or
old games' recorded scores stop agreeing with their explanation. A restart therefore keeps a compatibility shell the size
of a large part of what it replaces.

**What it buys over (ii).** No intermediate states; one clean model from day one; no adapter code during stages D–E.

**Stored data.** Same widen-migrate-narrow obligations as (ii), plus the compatibility shell above.

---

## 4. The representation-elements layer, as it would sit in this codebase

### 4.1 Package boundaries

```
lib/object-model      NEW. Pure TS, no deps. Exact rationals, the element expression AST and its TS interpreter,
                      Representation / Element / Annotation declarations, and the Python interpreter as a source
                      string (emitted into preludes, as preludes are today).
lib/game-types        Object types declare representations (from object-model). Codec, spawn, mutators, prices stay
                      here. The prelude generator emits element accessors from the declarations, once per language.
lib/valuation         NEW. `Valuer` interface; `rarity-v1` (moves calibration lookup + hold behind it);
                      `perturb-v1`. Depends on game-types; game-utilities' tables become one valuer's data.
lib/game-utilities    Families: cards as today, plus `reps`, `primary` and declarative annotations over element refs.
lib/object-views      One renderer per *representation kind* (plane, equation, table, number line, grid), each
                      drawing element kinds; one generic annotation overlay; compact = primary rep, expanded = the
                      rule's reps in parallel.
artifacts/engine      `engine/node.ts score` calls `valuerFor(settings).value(...)`. Nothing else changes.
```

### 4.2 Key types

```ts
// lib/object-model
export type Q = { readonly n: bigint; readonly d: bigint };         // exact rational, wire "n/d"
export type Expr =                                                  // a JSON AST, like Constraint in game-types
  | { el: string } | { param: string } | { q: string }
  | { op: "add" | "sub" | "mul" | "div" | "neg" | "abs" | "min" | "max" | "floor" | "ceil", args: Expr[] }
  | { op: "nearest", set: "primes" | "integers" | "squares", of: Expr, bound: number }
  | { op: "if", test: Expr, then: Expr, else: Expr } | { op: "cmp", rel: "<" | "<=" | "==", args: [Expr, Expr] };

export type ElementKind = "number" | "point" | "segment" | "angle" | "region" | "symbol" | "cell" | "term";
export interface ElementDecl {
  readonly id: string;                 // "m", "c", "x_intercept", "area_with_origin", "cell:2,3"
  readonly kind: ElementKind;
  readonly label: string;              // "gradient", "y-intercept"
  readonly value: Expr;                // in terms of the canonical state's fields
  readonly where?: Expr[];             // geometry for drawing (a point's x, y)
  readonly defined?: Expr;             // false for a vertical line's slope; the view greys it out
}
export interface Representation {
  readonly id: string;                 // "slope-intercept", "general", "plane", "table", "grid-cells"
  readonly kind: "equation" | "plane" | "table" | "number-line" | "grid" | "text";
  readonly elements: readonly ElementDecl[];
  readonly dynamic?: readonly DynamicDecl[];   // elements built from a rule's params: "the point at x = q"
}
export interface DynamicDecl { readonly id: string; readonly params: readonly string[]; readonly make: ElementDecl }

export interface AnnotationDecl {
  readonly on: string;                 // an element ref "plane:y_intercept" or a dynamic "plane:at_x(q)"
  readonly role: "counts" | "target" | "distance" | "nearest" | "context";
  readonly value?: Expr;               // what it contributes (for "counts": points per ordinal component)
  readonly text: string;               // template over element values: "{y_intercept} is {d} from {p}"
  readonly marks?: { readonly set: "primes"; readonly near: string; readonly k: number };  // primes on the y axis
}

// lib/game-utilities: what a family adds
interface UtilityFamily<P> { /* as today */ reps?: readonly string[]; primary?: string; annotate?(p: P): AnnotationDecl[] }

// lib/valuation
export interface Valuer {
  readonly id: "rarity-v1" | "perturb-v1";
  value(state: ObjectValue, rule: UtilityDescriptor, ctx: ValuationContext): { bits: number; workings?: unknown };
  readonly key: string;                // in the event log and caches, as NOISE_VERSION is
}
```

### 4.3 How TypeScript and Python stay identical

- **Element values** are AST, evaluated by two small interpreters over exact rationals (Python's `fractions` and a
  bigint `Q` in TS). There is nothing per element to mirror by hand. Parity is a golden-vector file
  (`lib/object-model/test/vectors.json`: state, element, expected `n/d`) run by vitest and by a `parity.py`-style
  script, generated as `game-runtime/test/parity/make-cases.mjs` generates its cases.
- **Preludes** expose elements as plain attributes (`eq.m`, `eq.x_intercept`, `plane.area_with_origin`), generated from
  the declarations by one generator with two emitters, so an agent's helper library is the element API.
- **Rule cards stay programs.** They read elements through the prelude. The owner's taste ("a card is a kid-readable
  program") and today's evaluator and parity tests survive. The AST is not a language for rules, only for elements and
  annotation values, which are arithmetic.
- **Annotations** are declarations, so the client computes them with the TS interpreter, and Python agents can be
  given the same through the prelude if wanted (today they get none).

### 4.4 Mutators and representations

A mutator declares the representation it acts in (`rep: "slope-intercept"`) and its generators over that
representation's elements: `add(m, k)`, `add(c, k)` in slope-intercept; `add(a, k)`, `scale(k)` in general form;
`rotate_about(point, angle-step)`, `translate(dx, dy)` in the plane. Its price is `ℓ_where + ℓ_which + λ·d` from
`structure/index.ts` (the Kraft recipe is reused unchanged), **of the call as named**, not of the cheapest
decomposition of its net effect. That is a deliberate departure from `callWork` for this type, and it is what makes
lens choice a skill: the same net change can cost 6 bits as `add(c, 2)` and 20 bits as two general-form adds. The
invariant to keep is the other one: one call never costs more than an equivalent sequence of calls of the *same*
mutator.

### 4.5 Valuation in code terms

- Hold rarity already computes −log2 P(U(x′) ≥ u) where x′ is x after m cost-weighted moves drawn ∝ 2^−C
  (`noise.ts`). A per-state version, **−log2 P_move(U(x′) ≥ U(x))** — how surprising it is that a random cost-weighted
  move does not lose to you — needs no prior over states, works on infinite spaces, and is the brief's lens.
- For determinism, **enumerate** instead of sampling: the moves of one call, each with weight 2^−C, truncated at a cost
  cap (the Kraft code makes the tail bound explicit). A fixed enumeration order plus exact rational accumulation, with
  `log2` applied once and the result quantised (for instance to 1/1024 bit), makes TS and Python agree bit for bit.
  Floating `log2` is not guaranteed identical between V8 and CPython's libm; quantising after a single call removes the
  risk.
- Cost: one valuation per changed object per god per act. With a few hundred enumerated moves and a compiled TS card,
  that is about 10^5 card calls per second at 100 Hz with 4 gods: measure in stage B against the tick budget
  (`convex-migration-plan.md §3.2`); cache by `(state, rule, valuer key)` inside the tick action.
- Comparability across rules is the open design question the clean-room sessions own; the code imposes only that the
  result is bits, so `payoff = own × floored Σ peers` is unchanged.

### 4.6 How the views consume it

`ObjectView` takes `(value, inst, reps[], annotations[])`. Compact contexts (object list, goal card summary) draw the
rule's `primary` representation. The expanded popover draws every representation the rule depends on side by side,
each with the annotations whose element refs fall in it; hovering an element highlights it in every representation
that has the same element id (a shared id across reps is how "the y-intercept" is one thing in the equation and the
plane). The Grid board becomes the `grid` representation kind; its `Part`s become annotations on cell, row, line and
block elements.

### 4.7 The first three pull requests (path ii)

1. **`lib/object-model`: rationals, element AST, two interpreters, golden vectors.** No consumers. Declaration types
   for representations, elements, dynamic elements and annotations. Tests: interpreter unit tests, TS/Python golden
   parity in CI. About 1,200 lines.
2. **`Valuer` interface, `rarity-v1` extracted bit-for-bit.** `engine/node.ts score` calls the valuer; widen
   `games.settings.valuation` (optional) and `scoreV.valuation` (optional); no behaviour change, proven by the existing
   engine suites and a direct before/after comparison on recorded games. About 600 lines.
3. **`LinearEquation` object type on the layer, not offered in settings.** Canonical line codec, bounded rationals,
   slope-intercept, general and plane representations with their elements, representation-tied mutators priced by the
   Kraft recipe as named, prelude generated from declarations, parity cases, `game-full` spec entry. About 1,500 lines.

Then: `perturb-v1` with enumerated moves; the first 6 families (gradient near a prime, area with origin, |m − c|,
y(k) vs x(q), intercepts, angle with an axis) with annotations; the plane and equation views; a Lab setup.

---

## 5. What I would refuse to keep, and what I would keep anyway

**Refused even under path (ii):**
- `Cell {r, c}` and `PartShape` as the annotation API. They become the grid representation's element kinds.
- `inst.objectType === "Grid"` branches (about 33 files). Each becomes a lookup on the type or its representations.
- `spawn: "uniform"` and "μ-invariant `propose`" as part of the *object-type* contract. They belong to `rarity-v1`.
- `callWork`'s cheapest-decomposition pricing as a universal rule. It stays for set-v1 games (stored games were
  charged by it) and is not imposed on new types.
- Hand-mirrored per-type Python helpers for derived quantities. Elements are declared once.
- `calibration.ts` silently parsing an unknown key as a Grid (`instantiateKey`).

**Kept even under path (iii):**
- The sandbox runtime, its determinism rules and its size limits.
- The canonical short wire value and `by_game_value` uniqueness.
- Cards as complete kid-readable programs, with the TS card as host evaluator and Python parity.
- The Kraft-tight cost recipe (`structure/index.ts`), `W + βW²`, and noise ∝ 2^−C.
- The tick/commit loop, the event log, outcome replay, the query-cost rules and the migration discipline.
- The "parts add up to the ordinal, or it is never drawn" invariant of annotations.
- `rarity-v1` and its tables, as one valuer: every stored game was scored by it.

---

## 6. Recommendation

**Path (ii), staged refactor, with linear equations as the first type built on the new layer.** The engine, storage,
sandbox, replay and query layers do not assume what the brief breaks; the assumptions sit in three places: the
uniform prior and its table supply chain (behind one scoring call), the Grid-only annotation model (about 2,500
lines, no stored data, no Python), and the per-type prelude templates. Each can be replaced behind an interface while
the game keeps running. A restart would rewrite about 40,000 lines and still have to keep the old codecs, renderers and
evaluators alive for stored games, so it buys cleanliness the stored data does not allow. Path (i) ships sooner but
under the wrong scoring and the wrong pricing rule, and its families become debt.

**Strongest counter-argument.** Stage E, moving Grid onto the layer, is where the value is lowest and the craft is
highest: 112 grid families, 21 lenses with tiers, `heat` and `nearest`, and grid-lab as oracle. A staged refactor can
stall there, leaving two annotation models for good, which is the "patch that adds complexity" the owner dislikes. The
honest answer is to decide now that stage E is optional: if Grid's lenses do not move within a bounded number of PRs,
Grid keeps its own explain path as the grid representation's renderer, and the generic layer serves every other type.
That is still cleaner than either alternative.

## 7. Decisions for the owner

1. "The same object": the line (recommended) or the written equation.
2. Number domain: bounded-height rationals (recommended, H about 99) or unbounded.
3. Mutator pricing for new types: by the call as named (recommended; makes lens choice a skill) or by the cheapest
   decomposition of the net effect (today's rule).
4. Valuation: ship `perturb-v1` as a room setting beside `rarity-v1` (recommended), or replace rarity everywhere.
5. Whether moving Grid onto the element layer (stage E) is a goal or optional.
6. Whether Python agents should get annotations and valuation in their helper library (today they get neither).
