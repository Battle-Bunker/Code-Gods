/** Lock documents as acts see them (pure: shared by the commit and the Node tick; docs/engine-v2/locks.md). */
import type { ActLock } from "@workspace/v2-core";
import type { Doc } from "../_generated/dataModel";

type LockFields = Pick<Doc<"v2Locks">, "n" | "language" | "source" | "words" | "programBits" | "readBits" | "bits" | "energy" | "settledAt" | "rate">;

/** A lock document as an act sees it. */
export function actLock(d: LockFields): ActLock {
  return { n: d.n, program: { language: d.language, source: d.source, words: d.words }, programBits: d.programBits, readBits: d.readBits, bits: d.bits,
    energy: d.energy, settledAt: d.settledAt, rate: d.rate };
}

/** The wire a lock travels to the tick in (the tick's `statesOf`). */
export type LockWire = LockFields;
export const lockWire = (d: Doc<"v2Locks">): LockWire => ({ n: d.n, language: d.language, source: d.source, words: d.words, programBits: d.programBits,
  readBits: d.readBits, bits: d.bits, energy: d.energy, settledAt: d.settledAt, rate: d.rate });

/**
 * What an act saw of a lock, recorded with its inputs for replay: everything but the program, which the lock's
 * `create` event holds (a replay joins it by object and number), so an act event stays small.
 */
export type LockSeen = Omit<LockFields, "language" | "source" | "words">;
export const lockSeen = (l: ActLock): LockSeen => ({ n: l.n, programBits: l.programBits, readBits: l.readBits, bits: l.bits, energy: l.energy, settledAt: l.settledAt, rate: l.rate });
