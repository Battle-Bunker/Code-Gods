/**
 * The Haskell runtime bundle (scripts/build-haskell-bundle.mjs): MicroHs's compiler and evaluator as
 * wasm32-wasip1 modules plus the precompiled `base` package, in the same container format as the Python
 * bundle (engine/bundle.mjs), pinned by its own SHA-256.
 */
import { unpack } from "./bundle.mjs";

/** SHA-256 of the uncompressed bundle built by `pnpm --filter @workspace/game-runtime build:haskell`. */
export const HASKELL_BUNDLE_SHA256 = "144472f7f48aabdafeb201d60e2078ccdf3b5230f4e8dbd8da6ae881c0538dd2";
/** File name of the built bundle (dist/ in this package; the object uploaded to Convex storage). */
export const HASKELL_BUNDLE_FILE = "haskell-runtime.bin.gz";

/** Bundle bytes (gzip or raw) -> Map(path -> bytes), after checking the pin. */
export const unpackHaskell = (bytes, expected = HASKELL_BUNDLE_SHA256) => unpack(bytes, expected);
