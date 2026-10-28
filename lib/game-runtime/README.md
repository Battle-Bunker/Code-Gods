# Isolated computational runtime adapters

This package owns no server, database, authentication, transport or game rules.
Use the asynchronous adapter, **not** the Python `Runner` directly in a request
handler. The latter is a single-threaded internal worker with no admission queue.

## Setup (pinned)

Install workspace dependencies from the committed pnpm lockfile. This package pins
TypeScript 5.9.3 and quickjs-emscripten 0.31.0. Install
`python/requirements.txt` with the project's Python package manager (Wasmtime
49.0.0); no virtual environment is required. Run:

```
pnpm --filter @workspace/game-runtime setup:python
pnpm --filter @workspace/game-runtime test
pnpm --filter @workspace/game-runtime test:python
python3 lib/game-runtime/python/inventory.py
pnpm --filter @workspace/game-runtime benchmark
```

Setup verifies the SHA-256 of the exact CPython 3.15.0 WASI SDK 33 archive before
extracting into the ignored `.cache/code-gods/python-3.15.0` directory. Provision
that directory before starting the service. Treat it as immutable trusted
dependency content; do not modify it while workers run. Workers do not download
anything. Missing dependencies produce `UNAVAILABLE`, never native execution.
Supply `python` in the constructor if Python is not on the launcher's PATH.

## Integration

```ts
import { createRuntime, RuntimeError } from "@workspace/game-runtime";
const runtime = createRuntime({ language: "python", workers: 2, queueLimit: 32 });
const settings = {
  objectType: "Int" as const, intMin: -100, intMax: 100, stringMaxLength: 256,
  interactionComputeMs: 5,
};
await runtime.inspect("lambda x: x + 1", settings); // {cost: 9}; never evaluates source
await runtime.validate("lambda x: x + 1", [0, 10], settings);
// {cost: 9, outputs: [1, 11]}; each sample has fresh guest state
await runtime.execute("lambda x: x + 1", 41, settings); // {value: 42}; no price
runtime.close(); // shutdown hook: rejects outstanding work, kills workers
```

TypeScript source example: `(x: number) => x + 1`. Factory expressions are
supported in both languages. Samples do not prove totality over the whole domain;
each later interaction must execute again and validate its actual output.

`RuntimeError.code` is one of `CONFIG`, `COMPILE`, `DOMAIN`, `EXECUTION`, `LIMIT`,
`CAPACITY`, `UNAVAILABLE`. Engine failures caught internally (including some
interrupt/memory failures) use `EXECUTION`; outer deadline failures use `LIMIT`.
Never take cost from execution. Associate inspection results with the exact
source/language/grammar version on the authoritative server.

Domains are supplied on every call, not inferred from a global 128-character
limit. Integers must stay within the configured signed-32-bit subrange.
ASCII strings support settings caps from 0 through 8192. Larger settings fail
explicitly; supporting them requires increasing bounded IPC/output budgets.
No coercion, wrapping, clamping, truncation, promises or objects as outputs.

## Grid object type

A GridType is `Grid(gridSize, gridSymbols, gridColours)`: `gridSize` 3–7, `gridSymbols`
`"base10" | "base12" | "base16" | "cards"`, `gridColours` `"rgb" | "rgby" | "rainbow6"`.
`intMin`, `intMax` and `stringMaxLength` are ignored for Grid.

```ts
const grid = { objectType: "Grid" as const, gridSize: 5, gridSymbols: "base10", gridColours: "rgby",
  interactionComputeMs: 20 };
await runtime.execute('lambda grid: [paint(row(0), "red")]', "7R,3G,0B,1Y,2R/...", grid);
// {value: '[{"m":"paint","p":{"kind":"line","region":[0,0],"colour":0}}]'}
```

* **Agent.** The usual single expression (Python: evaluates to a callable; TypeScript: typed
  `(grid: Grid) => MutatorCall[]`), from a read-only grid to a list of at most 8 mutator calls.
  `[]` means "do nothing". Agents keep full language access; they can change a grid only through
  the calls they return.
* **Input** is the canonical ASCII grid (`grid/codec.mjs`, `python/domain.py`, mirroring
  `lib/game-core/src/grid.ts` without depending on it): `N` rows joined by `/`, `N` cells joined
  by `,`, each a fixed-width symbol code then a colour letter of this GridType. Anything else is
  `DOMAIN` before guest code runs.
* **Output** is an ASCII JSON string of at most 8192 bytes (the Grid cap, not
  `stringMaxLength`): `[{"m": "<Grid Lab mutator id>", "p": {<Grid Lab params>}}]`. Params use
  Grid Lab's exact field names, field order and values (`Mutator.space(gtype)` entries, tuples as
  arrays, colours/symbols/suits/ranks as indices, unordered pairs sorted). The runtime checks only
  the shape (≤ 8 objects with exactly `m` and `p`). The guest-side encoder is
  untrusted-equivalent: **the host must still validate `p` against the exact parameter space,
  then price and apply it from its own tables.**
* **Pricing** is unchanged: ast-bytes-v1 over the submitted expression only. The prelude, its
  declarations and the trusted wrapper are never priced.
* **Errors.** `DOMAIN`: bad settings, bad input, or a result that is not a list of at most 8
  moves (with a kid-readable message from the encoder). `EXECUTION`: a constructor or grid helper
  was given impossible arguments; the message is the prelude's own, e.g. `row 7 doesn't exist
  on a 5×5 grid (rows go from 0 to 4)`. Other guest exceptions keep the generic message.
  `LIMIT` as for Int/string. Codes never depend on message text.

### The agent API (grid/prelude.py, grid/prelude.js, grid/prelude.d.ts)

Python names are snake_case; TypeScript uses the camelCase in brackets. The read-only grid is the
utility-function API of `lib/grid-lab/gridlab/kid.py` / `docs/kid-api.md` §5:
`grid.size, cells, rows, columns, diagonals, edge_cells (edgeCells), palette, cell(r, c),
quarter_turn (quarterTurn), reachable(start, through), regions(same)`; a cell has `row, col,
symbol` (glyph), `value, colour` (name), `left/right/up/down`, `up_left` (`upLeft`) and the other
corners, `neighbours, surrounding, on_edge (onEdge)`, and on card grids `suit, is_picture
(isPicture)`. `next_colour (nextColour)` exists on every grid, `mix(a, b)` only where colours mix
(rgby, rainbow6). Grids, cells, places and moves are read-only.

Places: `row(i)`, `column(i)`, `at(r, c)` / `at(cell)`, `diagonal(0|1)`, `square(r, c, size=2)` /
`square(cell, size)`, `ring(depth=0)`, `middle()` (N ≥ 4), `everywhere()`, `busiest_line()`
(`busiestLine()`, Grid Lab's `line*`). Wherever a place is expected a cell or `(r, c)` (`[r, c]`)
also means that one cell. Colours are names or indices; symbols are glyphs (`"7"`, `"Q♥"`),
wire codes (`"QH"`) or indices; "numbers" for `write_ramp`/`swap_symbols` are values as
`cell.value` shows them (cards 1–13 or `"A"`…`"K"`); suits are names, glyphs, letters or 0–3;
step counts wrap (`shift_line(row(0), -1)`) and 0 steps is an error.

| Constructor | Grid Lab params |
|---|---|
| `swap_cells(a, b, layer="both")` | layer, near (derived), pair (sorted) |
| `shift_line(line, k=1, layer="both")` / `reverse_line(line, layer="both")` | layer, line, k |
| `swap_lines(a, b)` | axis, pair (two rows or two columns) |
| `turn_block(square, move)` / `turn_grid(move)` | move ∈ rot90 rot180 rot270 flipH flipV transpose antitranspose |
| `sort_line(line, backwards=False)` | line, dir |
| `mirror_fold(where, fold, layer="both")` | row: `"left->right"`/`"right->left"`, column: `"top->bottom"`/`"bottom->top"` (or 0/1); `everywhere()`: Grid Lab's 8 folds |
| `paint(where, colour)`, `write(where, symbol)` | kind, region, colour/symbol |
| `recolour(where, old, new)`, `swap_colours(where, a, b)` | kind, region, pair |
| `hue_turn(where, k=1)`, `step_rank(where, k=1)` | kind, region, k |
| `pattern_line(line, "ramp", start, backwards=False)` / `(line, "alternate", a, b)` | line, pattern, start+dir or pair |
| `motif("stripes across" \| "stripes down" \| "diagonal" \| "other diagonal", start, backwards=False)` / `motif("checker", a, b)` | style, axis, start, dir or pair |
| `majority_line(line or busiest_line())`, `flatten(where)` | kind, region |
| `write_ramp(line, start, backwards=False)` | line, start (rank), dir |
| `swap_symbols(where, a, b)` | kind, region, pair (ranks) |
| `paint_by_key(where, "parity", even, odd)` / `(where, "mod", shift)` / `(where, "redblack", red_suits, black_suits)` (cards) | kind, region, key, pair or shift |
| `stamp(where, colour, symbol)` | kind, region, colour, symbol |
| `tally(where, colour)` (digit grids), `blend(where, a, b)` (mixing colours; recipe derived) | kind, region, colour / recipe |
| `suit_swap(where, a, b)`, `suit_set(where, suit)` (cards) | kind, region, pair / suit |

Only the mutators Grid Lab makes available in the GridType exist (23–25 of 26), and each accepts
only the region kinds its Grid Lab `kind` field allows; anything else raises a kid-readable
error. No prelude name shadows a Python builtin or a QuickJS global; private names start with
`_` (Python) or `__` (JS). `python/test_grid_lab.py` (host python3 + numpy) proves, for six
GridTypes, that a broad sweep of friendly arguments maps exactly onto every `Mutator.space(gtype)`
and that the JS prelude emits byte-identical JSON on the same arguments.

### How the workers run it

* **Python.** The trusted prelude is executed once during bootstrap into a private `_gridrt`
  module and exercised by `_warm()` so the adaptive interpreter's specialised bytecode is in the
  snapshot; it is never re-executed per call. Per execution, after snapshot restoration and
  outside the budget, the runner builds the GridType environment and decodes the host-validated
  input, takes strong references (`Py_IncRef`) to the guest globals, grid, encoder and error
  record, and uses those globals (the prelude's public names plus `__builtins__`) for the agent.
  Inside the budget: create the agent, `agent(grid)`, then the encoder; the result must be an
  exact `str` of at most 8192 ASCII bytes. Prelude errors are recognised by identity
  (`PyErr_GetRaisedException` against the record), and only exact-`str` messages are read.
  Restoration discards any monkeypatching of prelude classes, modules or builtins.
* **TypeScript.** Typechecking adds the per-GridType `grid/prelude.d.ts` as a separate root file
  (diagnostics still point into the player's source) and uses the trusted wrapper
  `const __agent: (grid: Grid) => MutatorCall[]`. `MutatorCall` is branded, so object literals do
  not typecheck. Each fresh QuickJS context evaluates `grid/prelude.js` after the Date/Math.random
  capability wrappers and before submitted code, outside the budget; it captures the intrinsics
  its encoder and error lookup use, installs only the public names, and keeps cells, places and
  moves in private WeakMaps. The encoder runs inside the budget and its string leaves through the
  existing string path.
* **Cache keys.** Int/string compile keys and forwarded settings are byte-for-byte unchanged.
  Grid keys include the GridType (`typescript-grid-v1`; Python's key includes all settings).
* **Budget.** Grid agents use the same fuel/CPU budget as Int/string. CPython-in-Wasm is much
  slower per call than QuickJS: a 5 ms Python budget covers roughly eight constructor calls plus
  light grid reading, but not a whole-grid `regions()` flood fill. Grid rooms that allow Python
  should configure `interactionComputeMs` of 20–30.

## Grammar and price: ast-bytes-v1

Python accepts one `eval` expression which must evaluate to a callable at
execution. Inspection parses and compiles but **never evaluates** it. Each AST
node costs one byte except Constant: strings UTF-8 length, bytes length,
signed integers minimum two's-complement byte length (at least one), floats 8,
complex 16, None/bool 1. Operators, contexts and the root Expression count.

TypeScript accepts one expression with a statically callable type, checks strict
ES2022 standard-library types, and erases types with TypeScript 5.9.3 before
QuickJS evaluation. Imports and reference directives are unsupported.
The submitted expression's AST counts one per node including identifiers and
type nodes, excluding the trusted wrapper. String/template text literals cost
UTF-8 length, nonnegative numeric integer literals minimum signed byte length,
other numeric literals 8. Unary minus is a separate node; BigInt and other
non-numeric-literal nodes cost one. Whitespace/comments do not count.
These are language-specific structural prices, not instruction counts.

## Computational module inventory

`python/inventory.py` executes representative workloads in the actual pinned
guest, not host Python. Verified: **math, itertools, functools, collections,
re, json, decimal, fractions, statistics, hashlib**. This is an inventory of
tested computational uses, not a promise of every API in those modules.
These modules, plus `ast`, `operator`, `random` and `time`, are preloaded during
trusted bootstrap. Lazy imports requiring a file read are unavailable once
submitted code starts, even if that file belongs to the bundled standard library.
This is a preloaded computational-module contract, **not full standard-library
filesystem access**. Real time and entropy are available; sleeping is not.
Native extensions not compiled into this build, pip packages, process creation,
networking, threads, writable files, host environment and host files are excluded.
No import-name blacklist is claimed as a security boundary.

TypeScript supports QuickJS ECMAScript computational built-ins, including strings,
arrays, maps, sets, JSON, Math, RegExp, real Date and Math.random. Node, DOM,
network, module loading, package imports and timers are unavailable. The only
installed host callbacks supply read-only time and entropy.

## Capability and state-isolation boundary

Submitted Python runs only inside Wasmtime; submitted JavaScript runs only in a
fresh QuickJS Wasm context/runtime. Neither is evaluated by the host interpreter.
Workers receive an empty host environment. Trusted WASI startup uses synthetic
`PYTHONHOME=/` and `PYTHONHASHSEED=0`, no inherited descriptors, and a read-only
bundled-library preopen. PYTHONHOME is removed from guest `os.environ` afterward.
After bootstrap, **every WASI import except clock_time_get, clock_res_get and
random_get is denied**. This includes bundled-file reads, writes, stdin/stdout,
directory and metadata operations, sockets, process exit and blocking poll.
Import-name filtering is not the boundary: recovered builtins face the same
host-side capability checks. Guest stdout is not a result channel. Results cross
the C API only as exact integers or strings, with host-side domain checks; no
attacker-provided repr/str/JSON hook is invoked for extraction. Grid error messages
cross the same way: only exact strings from the prelude's error record are read.
The trusted Grid prelude adds no I/O or capability: it imports only `json` and
`operator`, and the same WASI denial applies to anything reached through it.

The pinned CPython command module is converted to a reactor by parsing standard
Wasm sections and its debug name map to expose existing C APIs. Its exact binary
SHA-256 is required. Before every execution, all linear memory and mutable globals
are restored from one trusted initialized snapshot. An instruction decoder rejects
table mutation instructions and unknown proposals; imported tables/globals are
also rejected. Thus no table state can change during execution. Traps discard the
store; grown memory causes store replacement before reuse. Builtins, modules,
globals and heaps cannot retain mutations across calls or agents.

Compiled expressions are cached as **trusted compiler-produced marshal bytes**,
never user-supplied marshal data. After snapshot restoration, code is deserialized
into fresh globals without evaluating it. The cache is LRU-bounded to128 entries
and4MiB including source/settings keys. There is no40MiB snapshot per source.
Real entropy reseeds Python's random module after every restore, so restoring the
snapshot does not repeat the PRNG sequence. Hash seeding remains fixed.

QuickJS uses a fresh context/runtime per invocation. Date and Math.random receive
real read-only clock/entropy callbacks. Neither language is deterministic when
these facilities are used. Random APIs are not a claim of application-level
cryptographic protocol safety.

## Resource limits and capacity

* Source:16KiB UTF-8; request:128KiB; bounded IPC output:64KiB.
* `interactionComputeMs` defaults to5ms. Compilation, cache lookup, snapshot
  restoration and trusted setup are outside this budget. Evaluating the user's
  expression to create a callable and invoking it are inside it.
* Python:128MiB linear memory,1MiB Wasm stack, one initialized snapshot
  (~40MiB measured,48MiB maximum), and a separate4MiB/128-entry code cache.
  Trusted compilation/preparation has a three-second epoch watchdog and10billion
  fuel ceiling. Guest execution uses150,000 fuel units per configured millisecond,
  process-CPU sampling at0.5ms intervals, and a post-execution CPU check including
  exact primitive extraction/domain validation. Fuel is a conservative
  instruction ceiling, **not an exact CPU-time conversion**.
* Python's independent execution wall watchdog is at least50ms or10times the
  compute budget, whichever is larger. Scheduling, native host callbacks and
  sampling can overshoot; expired results are rejected. Host cyclic-GC and
  watchdog construction are trusted bookkeeping outside the timed guest phase.
* QuickJS:32MiB heap,512KiB stack, CPU-based interrupt checks and an expiry
  post-check. Thread CPU is used when available, otherwise conservative process
  CPU. Long native builtins may return late; the parent kills hard hangs.
* Workers announce execution phases. The parent separates preparation/startup
  (default30seconds) from execution hard-wall timeouts (default4seconds).
  SIGKILL is a backstop, not a5ms real-time scheduling guarantee. Module
  transformation/initial Wasmtime compilation falls under the startup deadline.
* Node worker V8 old-space is capped at 192 MiB. This is not an OS RSS quota;
  native Wasmtime compilation, allocator overhead and the OS require extra memory.
* One worker by default; maximum 16. Queue defaults to 32 waiting requests,
  capped at 1024. Queue waits expire; overload returns `CAPACITY`. Worker crashes
  reject the active call and workers restart for queued work. Missing setup
  rejects queued work rather than spawning indefinitely.

Measured in this workspace through actual Python worker subprocess JSON IPC,
with four workers, eight distinct warmed `lambda x: x + N` agents,800 requests,
and the default5ms compute budget: **518.7 attempted requests/second**,
p50 **6.39ms**, p95 **10.92ms**, maximum **27.77ms** end-to-end.799 succeeded;
one was rejected with LIMIT under the tight CPU budget. This is a small
microbenchmark, not a capacity reservation or a whole-engine throughput claim.
An earlier one-source snapshot version achieved487.7/s over400 requests with
zero errors, but did not test varied-agent cache behavior.

Current copying of the entire initialized linear memory remains a throughput
cost. No Linux MAP_FIXED/memfd copy-on-write remapping is installed: replacing
Wasmtime-owned mappings without a supported allocator integration would require
additional safety proof. Thousands of Python interactions/second have **not**
been demonstrated. Benchmark on the target host, include realistic agent work,
and budget CPU/memory plus rejection rates before admission. Production room
scheduling remains capped at100Hz; benchmark throughput does not raise that cap.
Do not silently queue unbounded work to imitate real-time throughput.

## Security gates

`test/grid.test.mjs`, `python/test_grid.py` and `python/test_grid_lab.py` add Grid
fixtures: cross-language byte parity, every constructor on each shipped GridType,
Grid Lab validity, invalid inputs, oversized/forged output, more than 8 calls,
monkeypatched prelude objects and builtins, prelude-name redefinition, capability
probes through prelude objects and budget enforcement. `test/scalar-golden.test.mjs`
pins Int/string costs and outputs recorded before Grid support.

The hostile regression suite covers host file/network attempts, wrong types and
domains, execution-price forgery, factory state, non-executing inspection,
compilation abuse, infinite loops, malicious regex, real clock/entropy access,
snapshot reset of builtins/modules, malicious result hooks, code-cache bounds,
capacity failure and worker recovery. It is not a sandbox security audit.
Before public hostile multi-tenant use, independently audit both engines and
the host imports, test engine-version upgrades, and add OS-level worker RSS/CPU
limits and target-host concurrent capacity qualification. QuickJS upstream does
not claim a completed security audit. Do not represent this package as formally
verified or as permission to expose full native Python/Node standard libraries.
