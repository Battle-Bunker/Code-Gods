#!/usr/bin/env node
/**
 * Installs the two pinned build inputs of the Haskell runtime bundle into the ignored dependency cache
 * (.cache/code-gods), like setup:python does for CPython:
 *
 *  - MicroHs (Lennart Augustsson, Apache-2.0) at a pinned commit: `git` fetches exactly that commit
 *    (git verifies the object hashes), and the files the build reads are checked again by SHA-256.
 *  - wasi-sdk 25 (clang 19 + wasi-libc for wasm32-wasip1), the release archive checked by SHA-256.
 *
 *   pnpm --filter @workspace/game-runtime setup:haskell
 *   pnpm --filter @workspace/game-runtime build:haskell
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
export const CACHE = join(ROOT, ".cache", "code-gods");
export const MICROHS = {
  url: "https://github.com/augustss/MicroHs",
  commit: "d756fa92137ea685c23779cce62cdb5492be498b",
  dir: join(CACHE, "microhs-d756fa9"),
  /** The files the bundle build reads, by SHA-256. */
  files: {
    "generated/mhs.c": "27599f5452a1dc42ba8af798da75ddf9b056539b6f3c35d246f93e9b56d3fc35",
    "generated/base.pkg": "5dd68c799f07c47abc9b10b862bccbcbc6f678d600c19fc50a0758bc05aa7bcc",
    "src/runtime/eval.c": "76b2003f9608934ff0441891e1df6d7856ebfd12f6dd8b6808d99676778c60ca",
  },
};
export const WASI_SDK = {
  url: "https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-25/wasi-sdk-25.0-x86_64-linux.tar.gz",
  sha256: "52640dde13599bf127a95499e61d6d640256119456d1af8897ab6725bcf3d89c",
  dir: join(CACHE, "wasi-sdk-25.0"),
};

const sha256 = path => createHash("sha256").update(readFileSync(path)).digest("hex");
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: ["ignore", "pipe", "inherit"], ...opts }).toString().trim();

/** Checks the pinned MicroHs files; throws when any is missing or differs. */
export function checkMicroHs(dir = MICROHS.dir) {
  for (const [file, expected] of Object.entries(MICROHS.files)) {
    const path = join(dir, file);
    if (!existsSync(path) || sha256(path) !== expected) throw new Error(`MicroHs file ${file} is missing or not the pinned version: run setup:haskell`);
  }
}

function installMicroHs() {
  const { dir, url, commit } = MICROHS;
  if (existsSync(dir)) {
    try { checkMicroHs(dir); if (run("git", ["-C", dir, "rev-parse", "HEAD"]) === commit) return; } catch { /* reinstall */ }
    rmSync(dir, { recursive: true, force: true });
  }
  mkdirSync(dir, { recursive: true });
  run("git", ["-C", dir, "init", "-q"]);
  run("git", ["-C", dir, "fetch", "-q", "--depth", "1", url, commit]);
  run("git", ["-C", dir, "checkout", "-q", "FETCH_HEAD"]);
  if (run("git", ["-C", dir, "rev-parse", "HEAD"]) !== commit) throw new Error("MicroHs checkout is not the pinned commit");
  checkMicroHs(dir);
}

function installWasiSdk() {
  const { dir, url } = WASI_SDK;
  if (existsSync(join(dir, "bin", "clang"))) return;
  mkdirSync(CACHE, { recursive: true });
  const archive = join(CACHE, "wasi-sdk-25.0.tar.gz");
  if (!existsSync(archive) || sha256(archive) !== WASI_SDK.sha256)
    run("curl", ["-sSfL", "--retry", "3", "-o", archive, url]);
  if (sha256(archive) !== WASI_SDK.sha256) throw new Error("wasi-sdk archive checksum mismatch");
  mkdirSync(dir, { recursive: true });
  run("tar", ["-xzf", archive, "-C", dir, "--strip-components=1", "--no-same-owner"]);
  rmSync(archive);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  installMicroHs();
  installWasiSdk();
  console.log(`Installed MicroHs ${MICROHS.commit.slice(0, 7)} at ${MICROHS.dir} and wasi-sdk 25.0 at ${WASI_SDK.dir}`);
}
