/** The history an assistant turn replays (assistantRun.ts). Pure, so a unit test reaches it. */
import { mergeTurns, type ChatMessage } from "@workspace/v2-ai";
import type { Doc } from "../_generated/dataModel";

/** What a stopped request carries in the history, so a later turn (an autopilot tick included) does not resume it. */
export const STOPPED_NOTE = "[The player pressed Stop on this request before you finished it: it is withdrawn. Do not carry it out or resume it unless they ask again.]";

/**
 * The history a turn replays, oldest first: whole exchanges, from a human message on. A message whose turn was
 * stopped (`stopped`: those turns' ids) says so.
 */
export function historyOf(rows: readonly Pick<Doc<"v2AssistantMessages">, "role" | "text" | "contentJson" | "turnId">[], stopped: ReadonlySet<string> = new Set()): ChatMessage[] {
  const first = rows.findIndex(r => r.role === "user");
  const out: ChatMessage[] = [];
  for (const r of first < 0 ? [] : rows.slice(first)) {
    if (r.role === "user") out.push({ role: "user", content: stopped.has(r.turnId) ? `${r.text}\n\n${STOPPED_NOTE}` : r.text });
    else if (r.contentJson) out.push({ role: r.role === "assistant" ? "assistant" : "user", content: JSON.parse(r.contentJson) } as ChatMessage);
  }
  // A turn that failed left a message unanswered: two of the human's in a row are one.
  return mergeTurns(out);
}
