# Code execution for the assistant (`run_code`)

The in-client assistant can run its own analytics code server-side, in the same sandboxed WebAssembly runtime that
executes player agents (lib/game-runtime). A script defines `main(data)`; the engine fetches the datasets it names
as the player, runs it in a warm pool, stores the run for the player, and gives the model a bounded result and a
`runId` the `code-output` panel shows as a table.

1. Cold start: measurements and the engine decision
2. Script mode in lib/game-runtime
3. Datasets
4. The engine side: `run_code`, storage, budget, the panel
5. Persistence: the per-user object store, and no file system
6. The skill
7. Proof and what remains

## 1. Cold start

The owner's question: *"Can the interpreter with libraries just be a precompiled WebAssembly module whose only
latency is egress?"* Measured below for (a) the current CPython-WASI bundle, (b) Pyodide 314.0.7 (the latest
stable release, CPython 3.14.2, with numpy 2.4.6 and pandas 3.0.2 and their dependencies pre-packed, so nothing is
downloaded at request time) and (c) QuickJS for TypeScript/JavaScript.

**How.** Container: this repo's cloud container (Node 22.23.4, 4 vCPU), each number a fresh `node` process
unless it says warm; scripts in the session scratchpad, reproduced by `runtime/probeScripts.ts` on Convex. Dev
deployment: `npx convex run runtime/probeScripts:scriptCold` and `:pyodideCold` with the dev deploy key, first call
after a push (a fresh instance), `scripts/probe-pyodide.mjs` uploading the Pyodide probe asset. The analytics
scripts: **rank** = score 80 objects (`mine − mean(theirs)`) and take the top 5; **corr** = a Pearson correlation
over 1,000 rows (Python `statistics.correlation` / numpy `corrcoef`; a loop in TypeScript).

### 1.1 Container

| | (a) CPython-WASI (agents' bundle) | (b) Pyodide + numpy + pandas | (c) QuickJS |
|---|---|---|---|
| bundle, raw | 19.6 MB (reactor 7.8 MB + stdlib + guest) | 21.4 MB (pyodide.asm.wasm 9.6 MB, stdlib 2.5 MB, wheels 7.9 MB, JS 1.3 MB) | 0.52 MB wasm (+ the JS glue, installed with the package) |
| bundle, gzip | 5.2 MB | about 14 MB (the wheels and stdlib zip are already compressed) | 0.24 MB |
| verify + gunzip + unpack | 100–110 ms | (Pyodide reads its files lazily) | n/a |
| `WebAssembly.compile`, default (lazy Liftoff) | 13 ms | 21–28 ms | 2 ms |
| compile, eager baseline (Liftoff, `--no-wasm-lazy-compilation`) | 53 ms | 88–92 ms | 10 ms |
| compile, eager optimising (TurboFan, `--no-liftoff`) | 1,000 ms | 1,682 ms | 140 ms |
| interpreter init, **no snapshot** | 575 ms (bootstrap to the initialized snapshot) | 1,940–2,200 ms `loadPyodide`, + 1,100 ms load numpy/pandas, + 3,300 ms import them = **6.5–7.0 s** | 30–40 ms (`getQuickJS`, module import included) |
| interpreter init, **from a memory snapshot** | 205 ms in all from a 4.7 MB gzip snapshot file (unpack bundle 100 + compile 13 + read snapshot 62 + restore 25); the per-request restore is 2–3 ms | stdlib only: 252–288 ms from a 31.5 MB snapshot. **With numpy/pandas: impossible** (below) | n/a (a fresh runtime per request costs about 1 ms) |
| next worker in a warm process | about 100 ms (shared compiled module and snapshot) | each worker is its own 6.5–7 s init | about 30 ms |
| warm request, engine level (rank / corr p50) | 2.1–2.7 / 3.0–4.1 ms | pure Python 1.1–1.9 / numpy 2.2–3.5 ms; pandas rank 4.8–6.4 ms (first 21–33 ms) | 1.5–2.2 / 2.7–3.4 ms |
| warm request through the pool (`runtime.script`, worker IPC, input decode, result encode; p50 / p95) | 4.7–4.9 / 6.1–7.4 ms | not built | 4.3–6.8 / 7–15 ms |
| first request on a ready worker | 28–34 ms (compiles the script guest and the script) | 21–33 ms (pandas) | 70–74 ms (the first transpile in the compiler worker) |
| linear memory / process RSS | 40 MiB (cap 128) / 205–240 MiB | 75 MiB heap / **340 MiB** | 128 MiB cap / 68–153 MiB |

Pyodide's memory snapshot (`loadPyodide({_makeSnapshot: true})`, `makeMemorySnapshot()`, then
`loadPyodide({_loadSnapshot})`) is experimental and private. It captures linear memory plus its table of JavaScript
references. It refuses any state where `loadPackage` has run ("Unexpected hiwire entry at index 6", the
loaded-packages registry, even for the pure-Python `six`). Forcing past that check gives a 78.5 MB snapshot that
fails to restore ("offset is out of bounds"): the side modules numpy loads (14 dynamic libraries) and the
filesystem live in JavaScript, not in the heap, so they are not in the snapshot. Cloudflare's Python Workers snapshot
numpy with a patched Pyodide; upstream does not support it. A warm Pyodide process *can* isolate requests by copying
its own 75 MiB heap back before each one (11.7 ms; side modules stay loaded; a counter planted in `numpy` stayed at 1
across 20 requests). That still leaves 340 MiB per worker, and every timeout kill costs a 6.5–7 s rebuild.

### 1.2 Dev Convex deployment

The develop deploy of PR #64 (`10a3db7`), `runtime/probeScripts` run with the dev deploy key. scriptCold ran first on a
fresh instance: its module had loaded 1 ms before the call, and the bundle came from file storage, not `/tmp`.
pyodideCold followed, from its own fresh module, after the probe asset was uploaded.

| | (a) CPython-WASI | (b) Pyodide + numpy + pandas | (c) QuickJS / TypeScript |
|---|---|---|---|
| egress from Convex file storage | **245 ms** for 5.2 MB | **286 ms** for 14.1 MB | none (installed with the deployment) |
| verify + gunzip + unpack + `WebAssembly.compile` | 135 ms | unpack to /tmp 178 ms, compile 29 ms | (in worker start) |
| first worker ready | 1,116 ms (bootstrap to the snapshot) | `loadPyodide` 3,430 ms + packages 1,636 ms + import 5,488 ms = **10.6 s** | 390 ms (compiler + executor) |
| first script (rank / corr) | 37 / 13 ms | 21 ms (pure) / 47 ms (pandas) | 71 / 30 ms |
| warm script p50 (rank / corr) | **6.5 / 7.1 ms** (through the pool) | pure 2.2 ms, numpy 4.2 ms, pandas 11.8 ms; heap reset 4.9 ms | **5.0 / 5.5 ms** |
| RSS | 233 → 443 MiB (both script pools started) | 443 → 678 MiB loaded, 771 MiB after the runs | (in the 443) |

Cold on dev, then: egress is a quarter of a second for either bundle. For CPython it is followed by about 0.13 s of
verify and compile and about 1 s of bootstrap. For Pyodide it is followed by about 10.6 s of CPU in interpreter and
package init.

**Measured peak: 771 MiB RSS** on the dev instance, with the two script pools (443 MiB) plus Pyodide loaded and run.
The action was not stopped. This is a measured fact about that run, not headroom: the documented limit for a Convex
Node action is 512 MiB (lib/game-runtime/README.md "Convex measurements"), and nothing here relies on exceeding it.
The probe asset `probe-pyodide.bin.gz` (14 MB, measurement only) was removed from dev's file storage afterwards with
`runtime/assets:remove`.

### 1.3 The answer to the owner's question

**Yes for CPython-WASI, and it is nearly the case already. No for Pyodide with numpy today.**

- **Compile is not the cost.** V8 compiles lazily with its baseline tier (Liftoff) and optimises hot functions in
  the background, so `WebAssembly.compile` is 13 ms for CPython, 21–28 ms for Pyodide and 2 ms for QuickJS. Compiling
  everything eagerly costs 53–92 ms baseline, or 1.0–1.7 s optimised, but nothing waits for that. V8 has no
  cross-process compiled-code cache for WebAssembly, so a fresh Convex instance pays this compile again, and it is
  small.
- **Interpreter init is the cost, and a snapshot removes it.** CPython's bootstrap (initialise, import the stdlib
  modules agents and scripts use, build the sandbox) is 575 ms, done once per instance. The resulting snapshot is
  deterministic (README "Determinism"), so it could be built once and shipped as a data file (4.7 MB gzip). A fresh
  instance would then pay only egress, gunzip, a 13 ms compile and a 25 ms memory copy: about 80 ms of CPU plus the
  download. Today it pays 575 ms once instead, which a warm instance then amortises over every request. On the dev
  deployment, file-storage egress for the 5.2 MB bundle is 245 ms (§1.2); the dev bootstrap was 1.1 s.
- **Pyodide with numpy/pandas cannot be that module today.** Its snapshot cannot hold loaded native extensions, so
  a cold Pyodide worker spends 6.5–7 s in init: 2 s Python, 1.1 s package loading, 3.3 s importing numpy and pandas.
  That time is CPU, not egress. A warm repertoire of Pyodide workers serving stateless requests would work for
  latency (5–7 ms a pandas request, 12 ms heap reset). But it needs about 340 MiB per worker, more than a 512 MiB
  Convex action can hold beside the agent pools (425–486 MiB warm, README "Convex measurements"). It would need its
  own host outside Convex.

**Decision.** Script mode uses **CPython-WASI for Python** (the agents' pinned bundle and snapshot, unchanged)
and **QuickJS for TypeScript**, both already warm in Convex instances, with dedicated script pools so a script never
delays an agent's act. One engine serves both agents and scripts: Pyodide adds nothing for agents, and it misses
the step budget, determinism and the 128 MiB cap the agent sandbox is built on. **A warm pool is required only in
the sense that already holds:** a script on a warm instance starts in about 5 ms. The once-per-instance cost is
about 0.6 s of bootstrap plus egress (Python) or about 0.3 s (TypeScript compiler and executor). If cold instances
become frequent, the next step is shipping the CPython snapshot as a precomputed asset, not Pyodide. numpy-class
libraries would need a dedicated Pyodide host. Until then the skill steers scripts to `statistics`, `collections`
and plain loops, which handle the game's data sizes (tens to thousands of rows) in milliseconds.

## 2. Script mode in lib/game-runtime

`runtime.script(source, inputJson, { cpuMs, seed })` → `{ result, output, outputTruncated, usedRandom, cpuMs }`
(lib/game-runtime/README.md "Script mode"). Grammar ids `python-script-v1` and `typescript-script-v1`.

- **Programme.** A script defines `main(data)`; `data = JSON.parse(input)`. Python: a module (any top level).
  TypeScript: a script whose types are erased by the pinned TypeScript 5.9.3 and never checked. Imports, exports,
  `import()`, modules and reference directives are refused.
- **Budget.** CPU seconds (default 10 s, at most 20 s): QuickJS's interrupt handler stops a TypeScript loop at the
  budget. Python has no interrupt, so a post-check and the pool's hard wall (the budget plus 1–5 s, then the worker
  is terminated and replaced from the snapshot in about 100 ms) stop it.
- **Bounds.** Source 64 KiB, input 4 MiB of JSON, result 1 MiB of JSON (else `LIMIT`), captured text 256 KiB
  (clipped, `outputTruncated`), 128 MiB of memory.
- **Sandbox.** The agents': no network, files, processes, host objects or environment; the agents' preloaded
  modules (plus `bisect`, `numbers`) as read-only proxies; a fresh guest per run.
- **Determinism.** The virtual clock from 2026-01-01T00:00:00Z; `random` / `Math.random` seeded by `seed`
  (run_code derives it from the language, source and input, so a rerun gives the same answer).
- **Errors** (`RuntimeError.code`). `COMPILE`: syntax; TS module syntax. `EXECUTION`: raised (with the line in
  Python), no `main`, a result that is not JSON. `LIMIT`: CPU, memory, result size. `DOMAIN`: the input.
  `CONFIG`: options.
- **The agent path is untouched.** The Python script guest (`engine/python-script.mjs`) is trusted text compiled
  after the snapshot restore, so the bundle (SHA-256 `e830f7df…`), the reactor and the snapshot are byte-identical,
  and every agent test and pin is unchanged.

## 3. Datasets

Named inputs the engine fetches server-side, as the player, through the same internal twins as the read tools
(`player.observationAs`, `eventsAs`, `historyAs`, `trajectoriesAs`, `myUtilityAs`, `rooms.getAs`,
`rooms.chatHistoryAs`, `rooms.historyAs`). Disclosure is the player's own (the engine test dumps every dataset
through the disclosure checker); nothing passes through the model's context. The catalogue, with each shape, is
`lib/player-client/src/datasets.ts`, and its text is the skill's (§5).

| dataset | `data[name]` | options |
|---|---|---|
| `objects` | every live object with the player's scores: `own.netBits`, `peerCare`, `payoff`, `value` | |
| `my_utility` | the player's own utility: name, summary, source, and `utility` {familyId, params, penalty?} and the game's settings | |
| `agents` | the player's own agents (energy, eligibility, costs, source) | |
| `leaderboard` | every god's total payoff | |
| `observation` | the whole observation | |
| `events` | the event log as the player sees it, oldest first (spawns, transformations with the player's scores; calls and costs on the player's own moves only) | `limit` (batches, default 200, max 1,000), `gameId` |
| `trajectories` | per object, the player's bits, the peers' aggregate and payoff over time | `limit` (default 400, max 2,000), `gameId` |
| `chat` | the latest 100 public messages (untrusted text) | |
| `settings`, `rules` | the room's settings; its rules as text | |
| `games` | the room's finished games with their standings | |
| `game_history` | an ended game's event log by id | `gameId` (required), `limit` |

## 4. The engine side

- **Tools** (lib/player-client/src/tools.ts, `CODE_TOOLS`; executors in convex/agent/registry.ts):
  - `run_code {language, source, datasets, params?, title?, cpuSeconds?}`: read permission; read-only, so no
    confirmation card;
  - `get_code_run {runId, part?, offset, length}`: pages through a run's result, output or source;
  - `list_code_runs {limit}`: recent runs and this game's budget left;
  - all three sit in the tool index, deferred (loaded with `load_tools`).
- **The run** (convex/code/execute.ts, a Node action):
  1. `code/runs.start` admits it: a member of the room, within the per-game budget, no other run of theirs in
     flight;
  2. the datasets are resolved;
  3. the script runs in the instance's script pool (`runtime/node.ts` `scriptRuntimeFor`: one engine per
     language, separate from the agents' pools; the Python pool shares their compiled reactor and snapshot);
  4. the outcome is stored.
- **Storage** (convex/code/tables.ts `codeRuns`): per human, per room. The row holds:
  - the source, the datasets and objects requested, params;
  - status, error, CPU, wall time, input size, and a summary of the store writes;
  - a prefix of the result and printed text (200 KB / 64 KB).

  The whole `{result, output}` is the object `runs/<runId>` in the human's object store (§5). The newest 50 runs
  per human are kept, with their result objects. Workers hold no state.
- **What the model gets.**
  - The parsed result when it is at most 3,500 characters, else a preview.
  - Up to 1,500 characters of printed text.
  - A first field `TRUNCATED` saying what was cut and how to page on.
  - The `runId`, and a line naming `open_panel {panelId: "code-output", params: {runId}}`.
- **Budget** (convex/code/limits.ts): 40 runs and 120 CPU seconds per player per game (per room before its first
  game), one run at a time. A finished run is charged its CPU; a failed one, which reports none, is charged the
  sandbox's wall time on it (at most its budget).
- **The panel.** Built-in `code-output` ("Code results"; params `runId?`, `view`, `showSource`) subscribes to
  `code.runs.get`. A list of flat rows, or `{summary, rows}`, renders as a table (12 columns, 200 rows); anything else
  as JSON. The printed text and the source follow. A clipped run fetches its whole result from storage.
- **Public functions** (catalogued, so the completeness tests cover them): `code.runs.list` and `code.runs.get`.
- **In the conversation.** A running call shows "running code…" in the step line, and the chip says
  "Ran in 0.0 s" or the error.

## 5. Persistence: the per-user object store, and no file system

The owner's requirement: scripts keep state through an object store backed by Convex, never through a file system,
with data isolated per user.

**The API** (the same in both languages; the guest half is engine/python-script.mjs and engine/quickjs.mjs):

| | Python | TypeScript |
|---|---|---|
| read a loaded key | `store.get(key, default=None)` | `store.get(key, fallback = null)` |
| write | `store.put(key, value)` | `store.put(key, value)` |
| delete | `store.delete(key)` | `store.delete(key)` |
| list loaded and written keys | `store.list(prefix="")` | `store.list(prefix = "")` |
| refusal | `StoreError` | `StoreError` |

Values are JSON data; bytes are a Python `bytes` or a TypeScript `Uint8Array`, kept as `{"$hex": ...}`.

**The pattern is stateless,** as the owner preferred:
1. The `run_code` call names what to load: `load: ["notes/*", "watchlist"]`, keys or `prefix*` scopes, at most 20,
   4 MiB in all.
2. The host loads them into memory before the run (code/objects.ts `loadAs`; large values from file storage).
3. The sandbox buffers the writes (at most 2 MiB of JSON); the script returns its result as usual.
4. After a successful run the host validates the write set and commits it in one mutation (`commitAs`).

A failed run writes nothing.

**Why no mid-run channel.** Every read the game's analytics need is known before the run: the datasets plus the
player's own keys, which the model names, usually by prefix. A synchronous channel (SharedArrayBuffer + Atomics.wait
to the host) would add a blocking host round trip inside the CPU budget, plus a second validation path, for no use
case we have. One case would want it: a script that decides which key to read from another key's content (a linked
list in the store). A prefix load covers that within the 4 MiB limit. So the channel is not built.

**Run results and saved scripts use the same store.** A run's whole result is `runs/<runId>`: the code-output panel
fetches it, and a later script can load it. A saved script is `scripts/<name>` = {language, source, title}:
`run_code {..., saveAs: "top5"}` writes it, and `run_code {script: "scripts/top5"}` runs it.

**Storage.** `codeObjects` holds one row per (subject, key). A value of up to 64 KiB is inline; a larger one is a
file-storage blob.

### 5.1 Security model

- **One namespace per human.** Every object row is keyed by (subject, key); the subject is never part of the key.
  Every function resolves the human from the caller's credential (`viewerOf(principal)`) and touches only that
  human's rows: `loadAs`, `commitAs`, `listAs`, `eventsAs`, and the panel's `code.runs.get`. A script can name
  any key string, and it still lands in its owner's namespace. Keys are 1–128 characters of `[A-Za-z0-9_./-]`, with
  no `..`, `//`, or leading `.` or `/` (convex/code/keys.ts). Room ids are not part of the namespace: a key such as
  `rooms/<id>/notes` scopes data to a room when a script wants that.
- **Read set = the declared scope.** A run reads only the keys its call loaded (`store.get` of anything else raises
  `StoreError`), plus the datasets, which carry the player's own disclosure (§3). Another player's secrets are
  reachable through neither.
- **Writes are untrusted.** The guest can tamper with its own store object; the host does not care. It re-checks:
  - every key, refusing writes under `runs/`;
  - each value's size (at most 1 MiB);
  - the number of keys (at most 100 per run);
  - the quota after the writes (500 objects, 20 MiB per human; run results are not counted).

  It then applies the whole set or none.
- **Quotas** apply per human: objects, bytes, value size and keys per run for the store; runs and CPU per game for
  runs (§4).
- **Audit.** Every run is a `codeRuns` row. Every write is a `codeObjectEvents` row (put, delete, or refused with
  the reason), carrying its subject, room and run.
- **No shared mutable state between users in a worker.** Each run restores a pristine guest (snapshot restore /
  fresh QuickJS context). The loaded objects exist only in that guest's memory, and the pools cache only trusted
  compiler output keyed by source.

### 5.2 No file system

- **Below the language (capability level).** After trusted bootstrap, the CPython-WASI host (engine/wasi.mjs)
  answers only the clock and entropy imports. Every file, directory, socket and process import returns ENOTCAPABLE,
  and no directory stays preopened. QuickJS is built without its `std` / `os` modules and has no host functions
  beyond the virtual clock, the seeded generator and the captured print.
- **At the language level (done, and viable because there is no numpy).**
  - Python: `open` is not a builtin, and `io`, `os`, `pathlib`, `tempfile` and `shutil` are not importable.
  - TypeScript: there is no `require`, `fs`, `std` or `os`, and imports are refused at compile time.
  - Nothing in the allowed modules needs a file: they were imported at bootstrap, into the snapshot.
  - A test walks every class to find `FileIO` and opens a bundled standard-library path. The capability layer
    answers `PermissionError`.
- **Pyodide** is not used (§1). If it were, its Emscripten MEMFS is required by its packages, so the plan would be
  to keep it volatile and read-only: nothing mounted from the host, wiped with the worker. It would not be storage.
  Disabling `open` there would break numpy/pandas imports and `pandas.read_*`.

**Screenshots** (mock assistant, through the composer): turn 1 ranks the player's objects and saves the ranking with
`store.put('rankings/top5', …)` (and the script, `saveAs`); turn 2 loads `rankings/*`, re-reads it and compares it with
the payoffs now. `docs/screenshots/code-results/phone-390x844.png` and `desktop-1440x900.png` show the Code results
panel after turn 2; `artifacts/player-web/e2e/code-results-shots.ts` regenerates them.

**The only persistence is the object store.** The skill says so in its first lines on state, with an example.

### 5.3 Threat model

| Threat | Mitigation |
|---|---|
| A malicious or confused script reads another player's data | The namespace comes from the credential, never from the key; datasets are the player's own projections; disclosure is tested over every dataset |
| It writes another player's objects or the engine's results | Same namespace rule; `runs/` is read-only (guest and host); tested |
| It reads the host's files or escapes through Python internals | No preopens and ENOTCAPABLE below the language; `open` and file modules are gone above it; tested with a `FileIO` escape |
| Prompt injection via dataset contents (chat, labels) | Dataset values reach only the script, never the model's instructions; results return to the model as untrusted data (the registry's notice); the model is told player strings are data |
| Oversized outputs | Result 1 MiB, writes 2 MiB, print 256 KiB, a value 1 MiB, the store 20 MiB / 500 objects; refusals are clear errors and audited |
| Key enumeration | `store.list` lists only the loaded and written keys; `list_code_objects` lists only the caller's keys |
| Timing (inferring others' data from run time) | Runs read only their owner's objects and the player's own projections, so no other user's data is on the timed path; CPU is charged per run |
| Denial of service | Per-game run and CPU budgets, one run at a time per player, a hard wall per run, small pools separate from the agents' |
| Cross-user leakage through a warm worker | A pristine guest per run (snapshot restore / fresh context); caches hold only trusted compiler output |

Tests: `test/game-code.test.ts` covers, against the live backend:
- two users' namespaces, and an attempt to name another user's key;
- persistence across runs in two languages, and deletion;
- the value, per-run and total quotas (each refused with a clear message, nothing written);
- the audit rows;
- saved scripts;
- run results as objects;
- a disk path.

`lib/game-runtime/test/script.test.mjs` covers the guest API and the file system denial; `test/unit/code-keys.test.ts`
covers the key rules.

## 6. The skill

`analytics-code` in the skills index (lib/player-client/src/skills.ts; its text is in
lib/player-client/src/skills/analytics-code.ts). Loaded with `load_skill`, which also loads its tools. It covers:

- when to run code (and when not to);
- how datasets reach `main`;
- the budget;
- each language's libraries;
- output conventions (rows for a table, rounded, then `open_panel` code-output and one or two sentences);
- error and truncation handling;
- every dataset's shape and paragraph, generated from the catalogue;
- three examples.

## 7. Proof and what remains

See the pull request for the test results per suite. Remaining:

- shipping the CPython snapshot as a precomputed asset, if cold instances turn out to matter;
- a dedicated Pyodide host if numpy-class libraries become necessary;
- saving a run as a named, re-runnable script from the panel (the row already holds everything a re-run needs).
