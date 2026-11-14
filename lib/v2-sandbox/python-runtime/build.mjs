#!/usr/bin/env node
/**
 * Builds dist/python-runtime.bin.gz (src/bundle.ts reads it): the reactor-transformed CPython 3.15 WASI module, the
 * bundled standard library (mounted read-only at /lib during trusted bootstrap) and the old guest files under
 * python-runtime/bundled/ (part of the pinned bytes; the sandbox runs its own python/guest.py, not these).
 *
 *   pnpm --filter @workspace/v2-sandbox setup:python    # pinned download, SHA-256 checked
 *   pnpm --filter @workspace/v2-sandbox build:python    # this script; prints the bundle SHA-256
 *
 * The build is reproducible (sorted paths, no timestamps). Its SHA-256 must equal PYTHON_BUNDLE_SHA256 in
 * src/bundle.ts, which the sandbox checks before using any bundle; `--pin` rewrites that constant after an intended
 * change.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { transform } from "./reactor.mjs";

const PACKAGE = fileURLToPath(new URL("..", import.meta.url));
const HERE = fileURLToPath(new URL(".", import.meta.url));
const PIN_FILE = join(PACKAGE, "src", "bundle.ts");
const PYTHON_BUNDLE_SHA256 = /export const PYTHON_BUNDLE_SHA256 = "([0-9a-f]*)"/.exec(readFileSync(PIN_FILE, "utf8"))?.[1];
const MAGIC = new TextEncoder().encode("CGPYRT1\n");
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

/** "CGPYRT1\n" | u32 LE manifest length | manifest JSON {files: [[path, size], ...]} | file bytes (sorted by path). */
function pack(files) {
  const entries = [...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const manifest = new TextEncoder().encode(JSON.stringify({ files: entries.map(([path, data]) => [path, data.length]) }));
  const out = new Uint8Array(MAGIC.length + 4 + manifest.length + entries.reduce((n, [, d]) => n + d.length, 0));
  out.set(MAGIC);
  new DataView(out.buffer).setUint32(MAGIC.length, manifest.length, true);
  out.set(manifest, MAGIC.length + 4);
  let at = MAGIC.length + 4 + manifest.length;
  for (const [, data] of entries) { out.set(data, at); at += data.length; }
  return out;
}
const CPYTHON = join(PACKAGE, "../../.cache/code-gods/python-3.15.0");
/** The upstream python.wasm in python-3.15.0-wasi_sdk-33.zip (python/setup.py checks the archive). */
const PINNED_WASM_SHA256 = "9f58ad347987d0a23def7eefa5aa5e8ffaef529fba26979350c44376d6b8fae3";
/** The transformed reactor (exports, snapshot globals, 128 MiB memory cap). */
export const REACTOR_SHA256 = "9c6ed82159953b1462027dcf061bdb6494727cb1288ea02ac0219c6506730ff7";
const GUEST = ["boot_guest.py", "sandbox_guest.py", "astbits_guest.py", "ast_bits_v1.json"];

export function buildBundle() {
  const wasmPath = join(CPYTHON, "python.wasm");
  if (!existsSync(wasmPath)) throw new Error(`Missing ${wasmPath}: run pnpm --filter @workspace/v2-sandbox setup:python`);
  const wasm = readFileSync(wasmPath);
  const { binary, inputSha256 } = transform(new Uint8Array(wasm));
  if (inputSha256 !== PINNED_WASM_SHA256) throw new Error("Unrecognized CPython WASI binary");
  const files = new Map([["python-reactor.wasm", binary]]);
  for (const name of GUEST) files.set(`guest/${name}`, new Uint8Array(readFileSync(join(HERE, "bundled", name))));
  const walk = dir => {
    // An empty directory (lib-dynload) is an entry "path/" of size 0: CPython's path setup sees it.
    if (!readdirSync(dir).length) files.set(relative(CPYTHON, dir).split("\\").join("/") + "/", new Uint8Array(0));
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else files.set(relative(CPYTHON, path).split("\\").join("/"), new Uint8Array(readFileSync(path)));
    }
  };
  walk(join(CPYTHON, "lib"));
  const bundle = pack(files);
  return { bundle, sha: sha256(bundle), reactorSha: sha256(binary), files: files.size };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { bundle, sha, reactorSha, files } = buildBundle();
  const out = join(PACKAGE, "dist", "python-runtime.bin.gz");
  mkdirSync(join(PACKAGE, "dist"), { recursive: true });
  writeFileSync(out, gzipSync(bundle, { level: 9 }));
  console.log(JSON.stringify({ out, files, bytes: bundle.length, gzipBytes: statSync(out).size, sha256: sha, reactorSha256: reactorSha }));
  if (process.argv.includes("--pin")) {
    for (const [file, name, value] of [[PIN_FILE, "PYTHON_BUNDLE_SHA256", sha], [fileURLToPath(import.meta.url), "REACTOR_SHA256", reactorSha]]) {
      const path = file;
      writeFileSync(path, readFileSync(path, "utf8").replace(new RegExp(`(export const ${name} = )"[^"]*"`), `$1"${value}"`));
    }
    console.log("Pinned.");
  } else {
    if (REACTOR_SHA256 !== reactorSha) { console.error(`Reactor SHA-256 ${reactorSha} differs from the pinned ${REACTOR_SHA256}`); process.exitCode = 1; }
    if (PYTHON_BUNDLE_SHA256 !== sha) { console.error(`Bundle SHA-256 ${sha} differs from the pinned ${PYTHON_BUNDLE_SHA256} (use --pin after an intended change)`); process.exitCode = 1; }
  }
}
