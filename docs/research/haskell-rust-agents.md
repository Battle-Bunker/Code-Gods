# Haskell and Rust agents: feasibility (phase 1)

Date: 2026-11-01.

**Outcome.** Rust was dropped. Haskell was built as planned with MicroHs on WASI: see `lib/game-runtime/README.md`
("Haskell"). Measured: the bundle is 1.2 MB gzip; compiling an agent took 2.5–4 s on V8 at first, about 1.3–1.8 s with the per-room compilation cache (about 95 MiB of wasm memory);
an act takes milliseconds. Where the build differs from the plan below: the mutator constructors are generated from the
TypeScript declarations, and the room's JavaScript constructors encode the moves; the price is token-level
(`hs-token-bits-v1-uniform`), not AST-level. The phase-1 study follows unchanged. Question from the owner: can Haskell and Rust become agent languages beside Python and
TypeScript, with our tooling, and how hard is each?

## Constraints any language must meet

These come from `.agents/memory/wasi-determinism.md` and `lib/game-runtime/README.md`.

- Everything runs inside the one Convex deployment, in a Node action: 512 MiB memory, 10 min per action,
  a 32 MiB function bundle. Large runtimes go to file storage, like the 5.2 MB gzip CPython bundle, or to
  `node.externalPackages`.
- The guest gets capabilities only at the WASI import boundary: a virtual clock, a seeded random stream,
  nothing else.
- Each run restores one trusted snapshot.
- A deterministic step budget is the only bound we can trust. V8 has no fuel.
- Each language needs a grammar (`<lang>-agent-v1`: `agent(obj)` returns mutator calls), a prelude
  generated per room (helpers, `__decode`, a call encoder that matches the Python and JS encoders byte for
  byte), and a summon-price function over the AST.

## Rust: really difficult in one deployment

**Measured here** (rustc 1.97.0, x86_64, 4 cores). A small `std` agent compiled to `wasm32-unknown-unknown`
at `-C opt-level=1 -C panic=abort -C strip=symbols`:

- Warm compiles took 240 to 370 ms; the first, cold compile took about 5 s.
- The output was 19.8 KB of wasm.
- `--emit=metadata` alone (type and borrow checking) took about 3 s cold.
- The native toolchain is `librustc_driver` (158 MB) plus `libLLVM` (199 MB) plus the wasm32 `std`
  (93 MB): about 450 MB.

**Running the compiled agent is easy, and is the strong part.** wasm32-unknown-unknown has no imports
unless we give it some. A wasm rewrite like `engine/reactor.mjs` can add a fuel counter at function entries
and loop back-edges. That gives a deterministic step budget, which is stricter than what Python has. The
clock and randomness would be two host imports.

**The difficulty is the compiler.**

| Option | Verdict |
|---|---|
| Native rustc inside the Node action | About 450 MB of native shared objects is more than 10× the bundle limit. Downloading them from storage to `/tmp` would need several hundred MB of disk, and an x86_64 build that matches the action host, which Convex doesn't promise. rustc's RSS plus our workers is close to the 512 MiB limit. Not viable. |
| rustc compiled to WASI ([bjorn3/wasm-rustc](https://awesome.ecosyste.ms/projects/github.com%2Fbjorn3%2Fwasm-rustc), [rubrc](https://gh.r-mj.com/oligamiq/rubrc)) | Patched and experimental, and it needs `wasm32-wasip1-threads` (shared memory and worker threads). The module would be on the order of 100 MB. V8 compiling a module that size plus rustc's heap does not fit in 512 MiB beside our pools, and per-summon latency would be many seconds. Upstream does not support it. |
| Miri on WASI ([rubri](https://github.com/LyonSyonII/rubri), [miri#722](https://github.com/rust-lang/miri/issues/722)) | It is deterministic, but it has the same rustc front end and size problem, and interprets roughly 1000× slower than native, so real agents would hit the step budget. Its author calls it extremely experimental. |
| A compile service outside Convex | It works: native rustc, about 0.3 s per compile, output pinned by hash and cached in Convex storage, with execution staying in Convex. But it breaks "everything in one Convex deployment", and the service must sandbox rustc itself: no crates, no build scripts, `#![forbid(unsafe_code)]`, a time and memory limit. |
| A "Rust subset" interpreter or transpiler written in TS | Possible, but it would not be Rust (no borrow checker, no traits, no `std`), and players would notice. |

**Pricing and grammar.** These would be feasible with tree-sitter-rust (a wasm build, about 1 MB) for
`ast-bits`. The grammar would be `pub fn agent(obj: &Obj) -> Vec<Call>` with `enum Call { Add { k: i64 }, … }`
and a generated `encode_calls` that writes the canonical JSON.

**Recommendation:** don't build Rust now. If the owner accepts one external compile service, Rust is about
1.5 to 2 weeks: the service, the fuel instrumentation, a Rust prelude generator, and tree-sitter pricing.
Inside the one deployment it is not reasonable today.

## Haskell: hard but reasonable, with MicroHs

GHC can't run in our sandbox. It is gigabytes in size, and its WASM backend produces code but does not run
GHC itself in wasm. The candidate is [MicroHs](https://github.com/augustss/MicroHs) (Lennart Augustsson,
Apache-2.0). It implements Haskell 2010 plus common extensions. Its compiler is written in Haskell, and its
distributed form is a combinator file that a small C evaluator runs. So the whole compiler is portable C.

**Measured from a checkout** (commit d756fa9, 2026-10-30):

- `generated/mhs.c` (the whole compiler as combinators) is 393 KB.
- `src/runtime/eval.c` is about 9,000 lines.
- The precompiled `base.pkg` is 837 KB.
- The repo already ships an emscripten build of the evaluator, `generated/mhseval.js`, at 640 KB.

So the runtime bundle would be about 2 to 3 MB, which is smaller than CPython. I could not time a compile:
this sandbox blocks building third-party code, so building MicroHs needs the owner's permission.

**Plan.** It reuses the Python architecture almost one-to-one:

1. Compile the evaluator and `mhs.c` with clang for `wasm32-wasi`, using a pinned wasi-sdk. Then apply
   `reactor.mjs` and pin it by SHA-256 like the CPython bundle.
2. Bootstrap with `base` and the room prelude loaded, then snapshot. The existing `wasi.mjs` host already
   answers only the clock and random imports.
3. Compile per summon inside the sandbox: source to combinators, cached per (source, prelude) like the
   TypeScript compilations. Then run `agent` on the decoded object in a restored snapshot.
4. **Step budget.** Graph reduction is single-threaded and deterministic. Count reduction steps in
   `eval.c`'s main loop, which is a small patch, and stop at `stepBudget`. That is a true deterministic
   bound, like Python's LINE and JUMP events. Disable the `IO` primitives for files and processes in the C
   FFI table, and keep only the virtual clock and the seeded random stream.
5. **Grammar `haskell-agent-v1`.** The agent is `agent :: Obj -> [Call]`. The room prelude is a generated
   Haskell module: a record or newtype for the object, read helpers, and `data Call = Add { k :: Int } | …`
   with smart constructors named like the Python ones (`add :: Int -> Call`). `encodeCalls :: [Call] -> String`
   is written in the prelude so its output matches the Python and JS encoders byte for byte. The commit
   clause is `CommitIfImproves [Call]`.
6. **Pricing `hs-ast-bits-v1-uniform`.** Use the same design as `ts-ast-bits` (uniform categories,
   alpha-equivalent names, universal literal codes). Parse with MicroHs's own parser inside the sandbox,
   dumped as JSON, so the parser and the compiler agree exactly. Layout-sensitive Haskell is hard to
   reparse in TS. tree-sitter-haskell (wasm) is the fallback.
7. **Latency (estimate, to measure).** MicroHs compiles a small module against a precompiled `base` in
   tens of ms natively. Under V8 wasm, expect 0.1 to 1 s per summon, then cached.

**Risks.** MicroHs is not GHC: some extensions are missing, the error messages differ, and laziness can
make one step of work large. `seq` and space leaks count against memory, so we would cap linear memory
like CPython's 128 MiB. It is maintained by one person; we pin a commit.

**Effort.** About 2 to 3 weeks: the bundle and engine (1 week), the prelude generator in `lib/game-types`
and pricing (1 week), and tests, parity and wiring (0.5 to 1 week).

## Wiring, after the settings change lands

Both languages would plug in at the same places:

- `GRAMMAR_IDS` and `COMPLEXITY_IDS` (`lib/game-runtime/engine/domain.mjs`);
- the `GameRuntime` language switch;
- a prelude part per language (`lib/game-types/src/prelude.ts`, `PreludeParts`);
- the allowed-languages set in game settings.
