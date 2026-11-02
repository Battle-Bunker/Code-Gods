#!/usr/bin/env node
/**
 * Builds dist/haskell-runtime.bin.gz: MicroHs (pinned commit, scripts/setup-haskell.mjs) compiled to
 * wasm32-wasip1 with the pinned wasi-sdk, as two modules, plus the precompiled `base` package:
 *
 *   haskell-compiler.wasm    the MicroHs compiler (its combinator image linked with the evaluator):
 *                            Haskell source -> a self-contained combinator program (.comb)
 *   haskell-evaluator.wasm   the evaluator alone: runs one .comb program per act
 *   db/packages/base-<v>.pkg, db/Prelude.txt   the package database the compiler loads
 *
 * eval.c is patched (patchEval) with the deterministic step budget (and bfile.c, patchBfile: no LZMA
 * encoder): a reduction limit checked every
 * 10,000 reductions (the scheduler slice), exported setters/getters for the host, and an exit code for
 * "over budget". wasi/config.h and wasi/extra.c replace MicroHs's unix platform files.
 *
 *   pnpm --filter @workspace/game-runtime setup:haskell
 *   pnpm --filter @workspace/game-runtime build:haskell [--pin]
 *
 * The build is reproducible (no debug info, fixed flags and inputs); the bundle's SHA-256 is pinned in
 * engine/haskell-bundle.mjs (HASKELL_BUNDLE_SHA256), and the runtime refuses any other bytes.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { pack, sha256 } from "../engine/bundle.mjs";
import { MICROHS, WASI_SDK, CACHE, checkMicroHs } from "./setup-haskell.mjs";

const PACKAGE = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/u, "");
export const BASE_PACKAGE = "base-0.16.12.0.pkg";
/** Exit code of a run stopped by the reduction budget. */
export const STEP_EXIT = 86;
/** The modules' initial memory (16 MiB: data, the 8 MiB shadow stack, the first heap); engine/haskell-wasi.mjs matches it. */
export const INITIAL_MEMORY = 16 * 1024 * 1024;

/** Exact-text edits to the pinned eval.c; each anchor must occur exactly once. */
export function patchEval(source) {
  const edits = [
    // The scheduler slice is the step budget's granularity (QuickJS polls every 10,000 ticks).
    ["#define SLICE 100000", "#define SLICE 10000"],
    ["counter_t num_reductions = 0;\n", `counter_t num_reductions = 0;
/* Code Gods: the deterministic step budget, in reductions (0: none). Set by the host before _start. */
counter_t cg_step_limit = 0;
/* Set once the main program has returned (start_exec has settled num_reductions). */
int cg_finished = 0;
__attribute__((export_name("cg_set_step_limit"))) void cg_set_step_limit(double n) { cg_step_limit = (counter_t)n; }
`],
    ["  start_exec(prog);\n", "  start_exec(prog);\n  cg_finished = 1;\n"],
    ["  COUNT(num_yield);\n", `  COUNT(num_yield);
  if (cg_step_limit && num_reductions > cg_step_limit) {
    in_raise = true;
    EXIT(${STEP_EXIT});
  }
`],
  ];
  for (const [anchor, replacement] of edits) {
    const at = source.indexOf(anchor);
    if (at < 0 || source.indexOf(anchor, at + 1) >= 0) throw new Error(`eval.c anchor not found exactly once: ${anchor.slice(0, 40)}`);
    source = source.slice(0, at) + replacement + source.slice(at + anchor.length);
  }
  // Reductions so far (glob_slice is the unused rest of the current slice), for the host after a run.
  return source + `
__attribute__((export_name("cg_reductions"))) double cg_reductions(void) {
  return (double)(cg_finished ? num_reductions : num_reductions - (glob_slice > 0 ? glob_slice : 0));
}
`;
}

/**
 * Exact-text edit to the pinned bfile.c (included by eval.c): the LZMA compressor becomes the identity. Its streaming
 * encoder needs about 190 MiB of buffers (a 16 MiB dictionary), more than the compiler's memory cap, and it is only used
 * to write the compilation cache, which the host keeps per room (engine/haskell.mjs). The cache is then the
 * serialization after one 'q' byte, which the host removes so the reader takes it as uncompressed.
 */
export function patchBfile(source) {
  const anchor = "add_lzma_compressor(BFILE *file)\n{\n";
  const at = source.indexOf(anchor);
  if (at < 0 || source.indexOf(anchor, at + 1) >= 0) throw new Error("bfile.c anchor not found exactly once");
  return source.slice(0, at) + anchor + "  return file;   /* Code Gods: no LZMA encoder (see build-haskell-bundle.mjs) */\n"
    + source.slice(at + anchor.length);
}

// -Os: as fast as -O2 here, and V8 needs about 90 MiB less to compile the evaluator's interpreter loop.
const FLAGS = ["--target=wasm32-wasip1", "-Os", "-w", "-mllvm", "-wasm-enable-sjlj",
  "-D_WASI_EMULATED_SIGNAL", "-D_WASI_EMULATED_PROCESS_CLOCKS", "-fno-ident",
  // Reproducible on any checkout: no absolute paths in the output (assert() embeds __FILE__).
  `-ffile-prefix-map=${CACHE}=cache`, `-ffile-prefix-map=${PACKAGE}=game-runtime`];
const LIBS = ["-lsetjmp", "-lwasi-emulated-signal", "-lwasi-emulated-process-clocks", "-lm",
  // An 8 MiB shadow stack (the compiler recurses deeply), no debug names beyond what V8 needs.
  "-Wl,-z,stack-size=8388608", "-Wl,--strip-debug",
  // The host supplies the memory (engine/haskell-wasi.mjs reuses one per module, zeroed before each run), so a worker
  // holds one compiler heap, not one per compilation waiting for the garbage collector.
  "-Wl,--import-memory", `-Wl,--initial-memory=${INITIAL_MEMORY}`];

function compile(out, sources, maxMemory) {
  const clang = join(WASI_SDK.dir, "bin", "clang");
  execFileSync(clang, [...FLAGS, `--sysroot=${join(WASI_SDK.dir, "share", "wasi-sysroot")}`,
    `-I${join(PACKAGE, "haskell", "wasi")}`, `-I${join(MICROHS.dir, "src", "runtime")}`,
    ...sources, ...LIBS, `-Wl,--max-memory=${maxMemory}`, "-o", out], { stdio: ["ignore", "inherit", "inherit"] });
  return new Uint8Array(readFileSync(out));
}

export function buildBundle() {
  checkMicroHs();
  const work = join(CACHE, "haskell-build");
  mkdirSync(work, { recursive: true });
  const evalC = join(work, "eval.c");
  writeFileSync(evalC, patchEval(readFileSync(join(MICROHS.dir, "src", "runtime", "eval.c"), "utf8")));
  // eval.c includes "bfile.c": the patched copy next to it wins over the pinned one on the include path.
  writeFileSync(join(work, "bfile.c"), patchBfile(readFileSync(join(MICROHS.dir, "src", "runtime", "bfile.c"), "utf8")));
  const rts = name => join(MICROHS.dir, "src", "runtime", name);
  const MiB = 1024 * 1024;
  const compiler = compile(join(work, "compiler.wasm"), [rts("main.c"), evalC, join(MICROHS.dir, "generated", "mhs.c")], 256 * MiB);
  const evaluator = compile(join(work, "evaluator.wasm"), [rts("main.c"), rts("comb.c"), evalC], 128 * MiB);
  const files = new Map([
    ["haskell-compiler.wasm", compiler],
    ["haskell-evaluator.wasm", evaluator],
    [`db/packages/${BASE_PACKAGE}`, new Uint8Array(readFileSync(join(MICROHS.dir, "generated", "base.pkg")))],
    ["db/Prelude.txt", new TextEncoder().encode(BASE_PACKAGE)],
  ]);
  const bundle = pack(files);
  return { bundle, sha: sha256(bundle), sizes: Object.fromEntries([...files].map(([k, v]) => [k, v.length])) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { bundle, sha, sizes } = buildBundle();
  const out = join(PACKAGE, "dist", "haskell-runtime.bin.gz");
  mkdirSync(join(PACKAGE, "dist"), { recursive: true });
  writeFileSync(out, gzipSync(bundle, { level: 9 }));
  console.log(JSON.stringify({ out, sizes, bytes: bundle.length, gzipBytes: statSync(out).size, sha256: sha }));
  if (process.argv.includes("--pin")) {
    const path = join(PACKAGE, "engine", "haskell-bundle.mjs");
    writeFileSync(path, readFileSync(path, "utf8").replace(/(export const HASKELL_BUNDLE_SHA256 = )"[^"]*"/, `$1"${sha}"`));
  }
}
