/**
 * The history an assistant turn replays (convex/v2/assistantRun.ts historyOf). What would break: a request the player
 * stopped replayed as if it still stood, so the next turn (an autopilot tick) carries it out (W5's real-assistant walk:
 * three agents summoned after Stop).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { historyOf, STOPPED_NOTE } from "../../convex/v2/assistantHistory.ts";

const row = (turnId: string, role: "user" | "assistant", text: string) =>
  ({ turnId, role, text, ...(role === "assistant" ? { contentJson: JSON.stringify([{ type: "text", text }]) } : {}) }) as never;

test("a stopped request says it was withdrawn; the rest replays as written", () => {
  const rows = [row("t1", "user", "Summon three agents."), row("t1", "assistant", "Summoning the first…"),
    row("t2", "user", "How am I doing?"), row("t2", "assistant", "Second of three.")];
  const h = historyOf(rows, new Set(["t1"]));
  assert.equal(h[0]!.content, `Summon three agents.\n\n${STOPPED_NOTE}`);
  assert.equal(h[2]!.content, "How am I doing?", "a finished request is untouched");
  assert.deepEqual(historyOf(rows).map(m => m.content), historyOf(rows, new Set()).map(m => m.content));
  assert.equal(historyOf(rows)[0]!.content, "Summon three agents.", "nothing stopped: nothing added");
});
