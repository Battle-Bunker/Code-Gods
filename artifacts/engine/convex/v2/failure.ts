/**
 * How a domain failure crosses between a transactional half (a query or mutation) and the action op that called it:
 * the half throws it as a ConvexError carrying its words (`outcome`; the writes roll back), and the action turns it
 * back into an OpFailure (`failureOf`), the operation's failed outcome. No imports beyond the two packages, so light
 * modules (stored panels' queries) can use it.
 */
import { OpFailure } from "@workspace/v2-affordances";
import { ConvexError } from "convex/values";

export async function outcome<T>(f: () => Promise<T>): Promise<T> {
  try { return await f(); } catch (e) {
    if (e instanceof OpFailure) throw new ConvexError({ message: e.message, ...(e.fix ? { fix: e.fix } : {}) });
    throw e;
  }
}

/** The OpFailure a transactional half reported, or the error itself. */
export function failureOf(e: unknown): unknown {
  const d = e instanceof ConvexError ? e.data as { message?: unknown; fix?: unknown } : null;
  return d && typeof d.message === "string" ? new OpFailure(d.message, typeof d.fix === "string" ? d.fix : undefined) : e;
}
