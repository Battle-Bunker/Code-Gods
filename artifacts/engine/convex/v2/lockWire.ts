/** Lock documents as acts see them (pure: shared by the commit and the Node tick; docs/engine-v2/locks.md). */
import { isInvalid, parsePredicate, type ActLock, type ObjectType } from "@workspace/v2-core";
import type { Doc } from "../_generated/dataModel";

/** A lock document as an act sees it. */
export function actLock(type: ObjectType<unknown>, d: Pick<Doc<"v2Locks">, "n" | "predicate" | "info" | "energy" | "settledAt" | "rate">): ActLock {
  const p = parsePredicate(type, d.predicate);
  if (isInvalid(p)) throw new Error(`stored lock #${d.n} does not parse: ${p.invalid}`);
  return { n: d.n, predicate: p, text: d.predicate, info: d.info, energy: d.energy, settledAt: d.settledAt, rate: d.rate };
}

/** The wire a lock travels to the tick in (the tick's `statesOf`). */
export type LockWire = Pick<Doc<"v2Locks">, "n" | "predicate" | "info" | "energy" | "settledAt" | "rate">;
export const lockWire = (d: Doc<"v2Locks">): LockWire => ({ n: d.n, predicate: d.predicate, info: d.info, energy: d.energy, settledAt: d.settledAt, rate: d.rate });

/** An act's lock back on the wire (what a tick records an act saw). */
export const actLockWire = (l: ActLock): LockWire => ({ n: l.n, predicate: l.text, info: l.info, energy: l.energy, settledAt: l.settledAt, rate: l.rate });
