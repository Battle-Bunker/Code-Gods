/** The runtime bundle format (bundle.mjs): "CGPYRT1\n" | u32 manifest length | manifest JSON | file bytes. */
export const PYTHON_BUNDLE_SHA256: string;
export function pack(files: Map<string, Uint8Array> | Iterable<[string, Uint8Array]>): Uint8Array;
export function sha256(bytes: Uint8Array): string;
/** Bundle bytes (gzip or raw) → Map(path → bytes), after checking the SHA-256 of the raw bundle against `expected`. */
export function unpack(bytes: Uint8Array, expected?: string): Map<string, Uint8Array>;
