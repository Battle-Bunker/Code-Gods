/**
 * Paid observation (W3 #643, v1's paid looks): in a game whose room set `observation: "paid"`, a seated player sees each
 * object as they were last told it (at its birth, by their own agents' moves, or by a paid look), and how many times it
 * has changed since (public). These are the words for that; pure, so they are unit tested.
 */
import { clock } from "../core/words.ts";

export interface Seen { readonly knownAt?: number | null; readonly changesSince?: number }

/** Whether this object read comes from a paid game (only then does the server send `knownAt`). */
export const isPaid = (o: Seen | null | undefined): boolean => !!o && o.knownAt !== undefined;

const times = (n: number) => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);

/** "As you saw it at 0:40 · changed 3 times since", or null in a free game. */
export function seenWords(o: Seen): string | null {
  if (!isPaid(o)) return null;
  const n = o.changesSince ?? 0;
  if (o.knownAt === null) return `Not seen yet · ${n ? `changed ${times(n)} since it was born` : "unchanged since it was born"}`;
  return `As you saw it at ${clock(o.knownAt!)} · ${n ? `changed ${times(n)} since` : "unchanged since"}`;
}

/** The row's short form: "seen 0:40 · changed 3×", "seen 0:40", or null in a free game. */
export function seenShort(o: Seen): string | null {
  if (!isPaid(o)) return null;
  const n = o.changesSince ?? 0;
  return `${o.knownAt === null ? "not seen yet" : `seen ${clock(o.knownAt!)}`}${n ? ` · changed ${n}×` : ""}`;
}
