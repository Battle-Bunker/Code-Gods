# Code execution for the assistant (`run_code`)

The in-client assistant can run its own analytics code server-side, in the same sandboxed WebAssembly runtime that
executes player agents (lib/game-runtime). A script defines `main(data)`; the engine fetches the datasets it names
as the player, runs it in a warm pool, stores the run for the player, and gives the model a bounded result and a
`runId` the `code-output` panel shows as a table.

1. Cold start: measurements and the engine decision
2. Script mode in lib/game-runtime
3. Datasets
4. The engine side: `run_code`, storage, budget, the panel
5. The skill
6. Proof and what remains

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

Measured on the dev deployment after the develop deploy of this change; see §1.4.

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
  deployment, file-storage egress for the 5.2 MB bundle is the other part (§1.2).
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

### 1.4 Dev deployment numbers

(Filled in after the deploy; see the follow-up commit.)

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
- **Storage** (convex/code/tables.ts `codeRuns`): per human, per room. The row holds the source, the datasets
  requested, params, status, error, CPU, wall time, input size, and the result and printed text when small (200 KB /
  64 KB). A larger outcome keeps a prefix in the row and the whole `{result, output}` in file storage. The newest 50
  runs per human are kept. Workers hold no state.
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

## 5. The skill

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

## 6. Proof and what remains

See the pull request for the test results per suite. Remaining:

- shipping the CPython snapshot as a precomputed asset, if cold instances turn out to matter;
- a dedicated Pyodide host if numpy-class libraries become necessary;
- saving a run as a named, re-runnable script from the panel (the row already holds everything a re-run needs).
