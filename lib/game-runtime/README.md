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
attacker-provided repr/str/JSON hook is invoked for extraction.

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
