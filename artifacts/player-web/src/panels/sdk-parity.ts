/** Compile-time: a file panel's `@sdk` (./sdk.ts) and a stored panel's (src/frame/sdk.ts) export the same names. */
import type * as Frame from "../frame/sdk";
import type * as Local from "./sdk";

type Same<A, B> = [Exclude<keyof A, keyof B>, Exclude<keyof B, keyof A>] extends [never, never] ? true : { onlyInFrame: Exclude<keyof A, keyof B>; onlyInPage: Exclude<keyof B, keyof A> };
export const SDKS_MATCH: Same<typeof Frame, typeof Local> = true;
