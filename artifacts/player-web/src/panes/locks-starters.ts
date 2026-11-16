/**
 * The create form's ready-made locks (docs/engine-v2/locks.md §11): each ready predicate at its example numbers, in the
 * player's language. The form shows the program, so a player edits the numbers in the code and the one-line words.
 */
import { READY_PREDICATES } from "@workspace/v2-agents/pure";
import type { LockStarter } from "./locks-ui";

export function lockStarters(language: "python" | "typescript", objectType = "line"): LockStarter[] {
  return READY_PREDICATES.filter(p => p.types.includes(objectType)).map(p => {
    const program = p.make(language, Object.fromEntries(p.params.map(x => [x.name, x.example])));
    return { kind: p.id, title: p.title, language, source: program.source, words: program.words };
  });
}
