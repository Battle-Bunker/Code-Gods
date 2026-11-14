/**
 * The pinned CPython runtime bundle (built by lib/game-runtime's `setup:python` and `build:python`, unchanged):
 *
 *   "CGPYRT1\n" | u32 LE manifest length | manifest JSON {files: [[path, size], ...]} | file bytes...
 *
 * `python-reactor.wasm` (the memory-capped CPython 3.15 WASI reactor), `guest/*.py` (the trusted sandbox guest)
 * and `lib/python3.15/...` (the standard library, mounted at /lib during bootstrap). Stored gzip-compressed; the
 * pin is over the uncompressed bytes, and nothing else is ever run.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const MAGIC = new TextEncoder().encode("CGPYRT1\n");
/** SHA-256 of the uncompressed bundle (the same pin as lib/game-runtime/engine/bundle.mjs). */
export const PYTHON_BUNDLE_SHA256 = "5aacc3bef36d8c7039ef3a1cd04eb0c4948d73efaf67e3e3e492d647a4421cfa";
/** Where the build puts it in this workspace. */
export const DEFAULT_BUNDLE_PATH = fileURLToPath(new URL("../../game-runtime/dist/python-runtime.bin.gz", import.meta.url));

export const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Bundle bytes (gzip or raw) or a path → its files, after checking the pin. */
export function loadBundle(source: string | Uint8Array = DEFAULT_BUNDLE_PATH): Map<string, Uint8Array> {
  let data = typeof source === "string" ? new Uint8Array(readFileSync(source)) : source;
  if (data[0] === 0x1f && data[1] === 0x8b) data = new Uint8Array(gunzipSync(data, { maxOutputLength: 256 * 1024 * 1024 }));
  const digest = sha256(data);
  if (digest !== PYTHON_BUNDLE_SHA256) throw new Error(`Python runtime bundle checksum mismatch (got ${digest}, pinned ${PYTHON_BUNDLE_SHA256})`);
  if (MAGIC.some((b, i) => data[i] !== b)) throw new Error("Not a Python runtime bundle");
  const length = new DataView(data.buffer, data.byteOffset).getUint32(MAGIC.length, true);
  const manifest = JSON.parse(new TextDecoder().decode(data.subarray(MAGIC.length + 4, MAGIC.length + 4 + length))) as { files: [string, number][] };
  const files = new Map<string, Uint8Array>();
  let at = MAGIC.length + 4 + length;
  for (const [path, size] of manifest.files) { files.set(path, data.subarray(at, at + size)); at += size; }
  if (at !== data.length) throw new Error("Malformed Python runtime bundle");
  return files;
}
