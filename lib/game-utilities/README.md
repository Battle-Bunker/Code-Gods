# @workspace/game-utilities

Utility families for Code Gods: each god's private **utility function** returns an **ordinal utility**, a whole
number or a fixed-length tuple of whole numbers compared like a league table (first number first). Bigger is
better and only the order matters: scoring turns an ordinal into **surprisal** (bits) through the calibration
table of its draw, so `7` and `7000` mean nothing until compared with random spawns. Naming follows
`lib/grid-lab/SPEC.md`; the plan is `docs/clean-implementation-plan.md` §3–4.

## Concepts

| Concept | Where | Meaning |
|---|---|---|
| `UtilityFamily` | `src/families/{int,string}.ts`, `src/families/grid/<lens>.ts` | One idea with a finite param `support`, a `sample`r, `canonical` (draws in one symmetry orbit share a table), a `summary`, an optional `exemplar`, and a kid **card** in Python and TypeScript. `role` is `"reward"` or `"penalty"` (a defence goal: bigger is worse). |
| Card | `family.card.python/typescript` | A complete kid-readable program: header comment, dealt params as UPPER_CASE constants, `def utility(grid):` / `function utility(grid)` (`x` for Int and string; penalties define `penalty`). Written against the instantiation's generated prelude (`lib/game-types`, kid API of `lib/grid-lab/docs/kid-api.md`). |
| `UtilityDescriptor` | persisted, server-private | `{ familyId, params, penalty? }`, plain JSON. |
| `UtilityCard` | `card(descriptor, ctx)`, sent to its owner only | Name, emoji, summary, shape and both sources (plus the defence goal's). |
| Host evaluator | `evaluator(draw, inst)` | The TypeScript card compiled once with the instantiation's JS prelude: `wire → ordinal`, shape-checked. The calibration pipeline uses the same evaluator. |
| Selector | `src/selectors.ts` | **Divine Lottery**: a uniform family among those available in the instantiation (`resolve` of its constraints), then its sampler; with `defenceGoals` on, every god also gets exactly one defence goal from the penalty families minus `excludeDefence` (none when off); only draws with tables (`hasTable`). |

## Single source of truth and parity

The TypeScript card is the source of truth. Tests keep everything else in step:

- `node --experimental-strip-types --test test/utilities.test.ts`: support, `sample ∈ support`, `canonical`
  idempotent and at most 24 canonical params per instantiation, card lint, shapes, determinism, exemplars at the top.
- `python3 test/parity.py`: every Python card (with the generated Python prelude) returns exactly the host's ordinals.
- `python3 test/gridlab_parity.py`: every grid family induces exactly the order of `lib/grid-lab`'s `Family.ordinal`
  (ties included), with the same availability, canonical forms and support.

Both Python tests build their cases with `test/fixtures.ts` into `test/fixtures/` (gitignored).

## Adding a family

1. Add it to the right file (`src/families/grid/<lens>.ts` for grids) with both cards written in plain JavaScript
   for the TS card (no type annotations: the host compiles it as is) and the same program in Python.
2. Keep `support` small after `canonical`, because calibration enumerates canonical params.
3. Run the three test commands above; then calibrate (the Calibration pipeline in `scripts/`).
