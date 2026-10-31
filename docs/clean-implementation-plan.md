# Clean implementation plan: the current Code Gods spec, as if built from scratch

Branch `claude/clean-implementation`. This document lists every structure on `main` that the current
spec supersedes, what replaces it, who owns each piece, and the few compatibility shims we keep (each
one justified by the protocol or the database, nothing else). The server parts are superseded by
`convex-migration-plan.md`.

Sources of the spec: `lib/grid-lab/SPEC.md` (naming), `docs/research/grid/architecture.md` (types,
capability classes, preludes, wire format, UX, API; §10 wins over §§3–5), `lib/grid-lab/docs/*.md`
(rules, mutators, engine, kid cards, kid API, defence goals) and `lib/grid-lab/gridlab/*.py` as the
executable reference. `lib/grid-lab` stays a research simulator: it is the reference for semantics and
the source of knob defaults, never imported by the product.

## 1. What is superseded, and what replaces it

| On `main` today | Superseded by | Notes |
|---|---|---|
| `ObjectType = "Int" \| "string"` and `intMin/intMax/stringMaxLength` settings fields | `objectType` + `typeArgs`, validated by the object-type registry in the new `lib/game-types` | `Int(min,max)`, `string(maxLength)`, `Grid(size,symbols,colours)` are type constructors. A type is one module. |
| `lib/game-core/src/grid.ts` (codec + component tables), `uniformObject`, `assertObjectValue` | `lib/game-types/src/grid/*` (codec, components, classes, spawn), `codec(inst).assert/spawn` | game-core no longer knows any object type. |
| Utility functions returning [0, 1] (`utility()` asserts the range), `exemplar ≥ 0.99`, calibration tests "random mean < 0.02" | **Ordinal utilities**: a number or a fixed-arity tuple, lexicographic, bigger is better; `top`/exemplar reach the maximum; calibration tables give surprisal | Int/string families are converted to ordinal form and normalisation is dropped. |
| `personalScore` = own × Σ others, `totalUtility`, `leaderboard` over [0,1] utilities | **Information scoring** (`lib/game-core/src/scoring.ts`): surprisal from survival tables, signed net bits n = s⁺ − w(h − E_μh), payoff_i = n_i · max(0, Σ_{j≠i} n_j) | Applies to every object type. |
| `lib/game-utilities/scripts/calibrate.ts` (a [0,1] sanity script) | Deterministic offline pipeline `pnpm --filter @workspace/game-utilities calibrate` writing versioned tables to `lib/game-utilities/data/calibration/` | Settings offer only instantiations whose tables exist. |
| Free-form agents: a callable `T → T` whose return value replaces the object | **Agents are ordinary Python/TypeScript code that return a list of mutator calls**; the engine validates and applies them through the type's closed set of bit-priced mutators | The runtime boundary still carries only an exact ASCII string (the encoded call list). |
| `grammarId` `python-standard-v1` / `typescript-standard-v1` (one expression evaluating to a callable) | `python-agent-v1` / `typescript-agent-v1`: source defines `agent(obj)` (`def agent(grid):` / `function agent(grid) {…}`) against the room's generated prelude | Kid-facing, like `def utility(grid):`. |
| God-only energy (`startingEnergy + t·energyPerSecond − spent`); agents run for free forever | **Two accounts.** The god pays the summon price (description bits) from god energy. Each agent has its own account with constant income, is eligible only while energy ≥ its expected cost per act, and pays each act's actual bit cost (may go negative: a cooldown). Gods may destroy their own agents for free. 200-agent cap kept. | Reference: `claude/gridlab-agent-energy` (`energy.py`). |
| `ast-bytes-v1` as the summon price | **Kept**, behind the same `complexityFunctionId` interface, as the description-bits price | `claude/gridlab-agent-dsl` prices a restricted DSL, not ordinary code, so it does not apply. Documented in §4.3. |
| Object `utilities: Record<godId, number>` | `scores: Record<godId, GodScore>` = `{ ordinal, rewardBits, penaltyBits?, netBits }` (server-private) | Public: `salience` = Σ_i n_i. Personal: own score + `peerNetBits` (Σ_{j≠i} n_j) + `peerCare` + `payoff`. |
| Utility card `{name, summary, source}` | Kid card `{familyId, emoji, name, summary, theme, source, shape, penalty?}` | Source is `def utility(grid):` / `function utility(grid)` with UPPER_CASE dealt constants and the room's helper prelude. |
| Player protocol `code-gods.player.v2` (`ownUtility`, `othersUtilitySum`, `score`; agents with `cost`) | `code-gods.player.v3` (deliberate bump, migration note in `docs/player-client-integration.md`) | v2 clients get a clear version error, not wrong numbers. |
| `lib/object-views` registry with Int/string/Grid views | Kept and extended: renderer registry is the one place a type's UI lives; adds detail view, colour-blind patterns, rarity, kid card, penalty warning, scoring explainer, settings pickers with capability badges | Used by both `artifacts/code-gods` and `artifacts/player-web`. |

## 2. Package layout after the migration

> **Superseded by [`convex-migration-plan.md`](convex-migration-plan.md) §1.1 for the server.** The engine,
> persistence, auth and static hosting now live in one Convex deployment (`artifacts/engine`).
> `artifacts/api-server`, `lib/db` (PostgreSQL), `lib/api-spec`, `lib/api-zod`, `lib/api-client-react` and the
> player daemon have been deleted. The layout below is kept for the pure-TypeScript libraries it introduced.

```
lib/game-types        NEW. Pure TS (no Node deps; UI imports it). Object-type registry:
  src/types.ts          ObjectTypeDef, Instantiation, Codec, Constraint, MutatorDef, PreludeParts (the contract)
  src/registry.ts       OBJECT_TYPES, objectType(), instantiate(), resolve()/lockedReason(), offered()
  src/constraints.ts    capability classes, constraint AST, entailment, kid wording for locked reasons
  src/mutators.ts       call parsing/validation, cost model (MDL + Landauer erasure + motion), applyCalls()
  src/int/  src/string/  src/grid/   one module per type: schema, codec, spawn, classes, mutators, prelude
lib/game-utilities    Families (ordinal, kid cards in Python + TS), host evaluator, calibration tables
  src/families/{int,string,grid/*}.ts, src/calibration.ts (lookup), scripts/calibrate.ts (pipeline),
  data/calibration/v1/*.json (shipped), test/parity*.{ts,py} (vs Python cards and lib/grid-lab)
lib/game-core         settings (objectType + typeArgs), information scoring, god + agent energy, random, ids
lib/game-runtime      sandboxes: inspect (ast-bytes-v1), act(source, input, prelude) -> encoded calls
artifacts/engine      the Convex engine (agent energy, mutator application, scoring, projection, auth)
lib/object-views      renderer registry + shared kid-facing components
artifacts/code-gods, artifacts/player-web, lib/player-client (protocol v3), lib/ai-player (prompts)
```

## 3. Single source of truth for utility families

**The TypeScript family modules in `lib/game-utilities` are the source of truth.** Each family carries
both card bodies (Python and TypeScript), written in the kid style against the generated prelude. The
host evaluates the TypeScript card (trusted, compiled once with the JS prelude); players read the
card in their room's language; the calibration pipeline runs the same host evaluator, so the tables
and the live scores cannot drift apart.

Parity is enforced by tests, not by convention:

1. **Python ↔ TypeScript cards**: `test/parity.py` runs every Python card (with the generated Python
   prelude) on the same sampled objects as the host and requires identical ordinals.
2. **Product ↔ `lib/grid-lab`**: `test/gridlab-parity.py` evaluates the grid-lab reference `ordinal`
   on the same sampled grids (uniform, exemplar, perturbations, low-entropy) and requires the
   product ordinal to induce exactly the same order (pairwise comparisons, ties included). Mutators get
   the same treatment: identical `apply` results and costs within 1e-9 bits for the deterministic terms.
3. **Calibration**: tables are byte-identical across two runs (determinism) and keys change whenever
   a family body, a prelude, the spawn function or the estimator version changes.

## 4. Key design decisions

### 4.1 Types, capabilities, preludes
As architecture.md §§1–6, with the kid API of `lib/grid-lab/docs/kid-api.md` as the guest surface
(`grid.cells`, `cell.colour == "red"`, `cell.value`, `next_colour`, `mix`, `cell.suit`). The prelude is
generated per instantiation (only the helpers the instantiation's classes provide). Wire format: Int is
a JSON integer, string an ASCII string, Grid the canonical ASCII string `"7R,3G,0B/…"`.

### 4.2 Mutators and the act cost
Each type has a closed set of mutators. An agent's act is a list of calls (at most 16). The engine
validates each call (unknown id, bad params, unavailable in this instantiation → the act fails), applies
them in order, and rejects the result if it equals any existing object (uniqueness).

Act cost (bits) = Σ over calls of `scope·kind · (step_base·log2 #available + D(params) + E_pointwise + motion)`,
the grid-lab cost model with the per-act split of `energy.py`: ordinary code chooses its calls at run
time, so naming the tool and its parameters is a *decision* paid on every act (Szilard–Bennett), while
the source's description is paid once at summon (ast-bytes-v1). Erasure is pointwise
(log2 of the preimage size given the call, as in `energy.act`). A failed or duplicate act pays only the
decision bits of the calls it parsed (minimum 1 bit), so a broken agent drains itself into cooldown.
Grid: the 25 mutators of `mutators.py`. Int and string: new sets designed on the same principles —
bijections cheap (description + motion only), overwrites pay erasure, structured partial edits cheaper
than scattered ones (see `lib/game-types/src/int/mutators.ts`, `string/mutators.ts`).

### 4.3 Economy
Settings: `startingEnergy`, `energyPerSecond` (god), `agentEnergyPerSecond` (default 2 bits/s of world
time, grid-lab `agent_income`), `agentBatteryActs` (default 2: income stops at 2 × expected act cost),
`maxAgentsPerGod` stays 200 (resource limit). At summon the god pays `ast-bytes-v1(source)` bits; the new
agent starts at 0 energy. Its expected cost per act is measured at summon on 16 reference spawns of the
instantiation (`expectedActCost`); it is eligible to act while `energy ≥ expectedActCost`. Each act deducts
its actual cost. `agent.destroy` is free and owner-only.

### 4.4 Scoring
For god i with draw (family, params): s⁺_i(x) = surprisal of the reward ordinal from the calibration
table (strictly increasing, uncapped extrapolation); with a defence goal, h_i(x) = softhinge(penalty
surprisal) and n_i = s⁺_i − w(h_i − E_μh_i) (w = `penaltyWeight`, default 1); else n_i = s⁺_i.
payoff_i(x) = n_i(x) · max(0, Σ_{j≠i} n_j(x)). Total payoff = Σ over live objects. Defence goals are
opt-in (`defenceGoals`, default off, as in grid-lab) and, when on, every god is dealt one from the allowed defence
families (`excludedDefenceFamilies` lists the rest); a per-god probability (the former `defenceRate`) was a handicap.

### 4.5 Calibration tables
Format (`CalibrationTable`): `{ key, family, canonicalParams, instance, shape, levels: [[ordinal, bits]…],
slope, penaltyMeanBits?, estimator: {id, version, seed, budget} }`. Lookup is the grid-lab estimator-3
semantics: isotonic, strictly increasing, linear interpolation in ordinal distance, extrapolation above
the top. Offered instantiations: Grid on a curated set of GridTypes (extended as tables are generated),
Int and string on domain presets. Every family declares a finite parameter **support** so the pipeline can
enumerate canonical params.

## 5. Ownership (parallel workers)

| Worker | Owns | Depends on |
|---|---|---|
| Types | `lib/game-types/**` except mutators | contract (`src/types.ts`) |
| Mutators | `lib/game-types/src/{mutators.ts,*/mutators.ts}` and their tests | contract |
| Families | `lib/game-utilities/src/families/**`, parity tests | Types prelude |
| Calibration | `lib/game-utilities/{scripts,data,src/calibration.ts}`, Int/string ordinal families | Families |
| Runtime | `lib/game-runtime/**` | contract |
| Server | `lib/game-core/**`, the engine (now `artifacts/engine`), `lib/player-client`, `lib/ai-player` | all of the above |
| UI | `lib/object-views/**`, `artifacts/code-gods/**`, `artifacts/player-web/**`, Playwright | API |

## 6. No compatibility shims for the old design

Direction from the user: throw the old design away completely; keep nothing that exists only to support it.
The hard constraints are deployment safety, not feature preservation:

1. **Database.** (Historical: this applied to the PostgreSQL store, which the Convex migration removed. The
   Convex deployment started empty; see `convex-migration-plan.md` §2 for its tables.)
2. **Player clients.** `artifacts/player-web` and `lib/player-client` moved to protocol v3 in the same PR;
   there is no v2 path. `docs/player-client-integration.md` has the v2 → v3 note.
3. Removed outright: [0,1] scoring and its tests, the old families' [0,1] form, free-form agents, god-only
   energy, the old payoff code, `RoomState.game` and other deprecated fields, old rendering paths, the PR #12
   thin slice, and docs for removed features.
4. **Summon price.** `ast-bits-v1` (branch `claude/gridlab-open-agents`) prices Python ASTs against a Grid-only
   vocabulary, with no TypeScript counterpart, so the single pricing interface stays `ast-bytes-v1` for both
   languages (no second path). Swapping it later is one module behind `complexityFunctionId`.

## 7. Tests

Ported or replaced suites per package; parity against Python cards and `lib/grid-lab`; mutator laws
(idempotent or bijective, determinism, cost ≥ 0, bijections erase 0) for every mutator × instantiation;
a full-game integration test per object type through the engine's functions (`artifacts/engine/test/game-*.test.ts`);
typecheck and builds; Playwright smoke tests of both UIs, including at phone width (390 px).

## 8. Checklist

Kept up to date in the draft PR description.
