/**
 * The Python runtime bundle: one file holding everything the CPython guest needs, pinned by SHA-256.
 *
 *   "CGPYRT1\n" | u32 LE manifest length | manifest JSON {files: [[path, size], ...]} | file bytes...
 *
 * Paths: `python-reactor.wasm` (the transformed, memory-capped CPython 3.15 WASI module),
 * `guest/*.py` and `guest/ast_bits_v1.json` (trusted guest code and pricing tables), and
 * `lib/python3.15/...` (the standard-library files trusted bootstrap reads, mounted at /lib).
 * It is stored gzip-compressed (`.bin.gz`); the pin is over the uncompressed bytes.
 */
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

const MAGIC = new TextEncoder().encode("CGPYRT1\n");
/** SHA-256 of the uncompressed bundle built by `pnpm --filter @workspace/game-runtime build:python`. */
export const PYTHON_BUNDLE_SHA256 = "e830f7dff5ed150d7a4ca9ed233182d19b7f79706e630dfd58127da3c88f97a6";

export function pack(files) {
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

export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

/**
 * Bundle bytes (gzip or raw) -> Map(path -> Uint8Array view), after checking the pinned SHA-256.
 * @param {Uint8Array} bytes
 * @param {string} [expected] the pin (tests and the build pass their own)
 */
export function unpack(bytes, expected = PYTHON_BUNDLE_SHA256) {
  let data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (data[0] === 0x1f && data[1] === 0x8b) data = new Uint8Array(gunzipSync(data, { maxOutputLength: 256 * 1024 * 1024 }));
  const digest = sha256(data);
  if (digest !== expected) throw new Error(`Python runtime bundle checksum mismatch (got ${digest}, pinned ${expected})`);
  if (MAGIC.some((b, i) => data[i] !== b)) throw new Error("Not a Python runtime bundle");
  const length = new DataView(data.buffer, data.byteOffset).getUint32(MAGIC.length, true);
  const manifest = JSON.parse(new TextDecoder().decode(data.subarray(MAGIC.length + 4, MAGIC.length + 4 + length)));
  const files = new Map();
  let at = MAGIC.length + 4 + length;
  for (const [path, size] of manifest.files) { files.set(path, data.subarray(at, at + size)); at += size; }
  if (at !== data.length) throw new Error("Malformed Python runtime bundle");
  return files;
}
