/**
 * The owner's rule on fixed points (CLAUDE.md; narrowed 16 November): advice must never make one state enough to do well,
 * or a high state reachable in one step (settle-and-hold everything, copying one state). This lint reads what players and
 * their AIs are told: the affordances' ids, titles and descriptions; the agent primer; the assistant's and AI seats'
 * prompts; every shipped starter's source and comments; and the app's end-of-game and tug-of-war texts. Wording that
 * proposes a destination or a hold fails, unless an allowlisted sentence says the opposite or means something else.
 *
 * What would break: a prompt or starter that tells players to settle every line and hold it, or to copy one state, as the
 * settle-everything guidance did on 14 November.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DIRECTORY } from "@workspace/v2-affordances";
import { AGENT_PRIMER, startersFor } from "@workspace/v2-agents";
import { aiSeatSystemPrompt, assistantSystemPrompt, FUND, PITCH_SYSTEM, STRATEGY, VOCABULARY } from "@workspace/v2-ai";
import { lineType } from "@workspace/v2-linear";

const root = fileURLToPath(new URL("../../../../", import.meta.url));

/**
 * Wording that tells players one state is enough, or that a high state is one step away: the two bugs the owner's rule
 * keeps (CLAUDE.md, 16 November: "locks, and players agreeing on states and strategies, are wanted"; "what stays a bug:
 * a high-value state reachable in one step, or one state being enough to do well"). Agreeing on, defending and locking
 * states are not flagged.
 */
const FIXED_POINT = [
  /\bcopy (this|that|the|a|one) state\b/i,
  /\bsame state (on|for|to) (every|all|each)\b/i,
  /\bsettle(-and-hold| every| all)\b/i,
  /\b(one|a single) (state|line|board|object) is (enough|all you need)\b/i,
  /\b(only|just) (need|needs) (one|a single) (state|line|board)\b/i,
  /\b(jump|go|leap) (straight|directly) to\b/i,
  /\b(in|with) (one|a single) (step|move|jump|act)\b/i,
];

/** Sentences that match a pattern but say the opposite, or mean something else; each says why. */
const ALLOWED: readonly { readonly text: string; readonly why: string }[] = [
];

/** Every text the lint reads, with where it came from. */
function texts(): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  for (const a of DIRECTORY as readonly { id: string; title?: string; description?: string }[]) out.push({ where: `affordance ${a.id}`, text: [a.id, a.title ?? "", a.description ?? ""].join(" — ") });
  out.push({ where: "agent primer", text: AGENT_PRIMER });
  for (const [name, text] of Object.entries({ VOCABULARY, FUND, STRATEGY, PITCH_SYSTEM })) out.push({ where: `AI prompt ${name}`, text });
  for (const context of ["room", "planning", "live", "ended", "lobby"] as const) out.push({ where: `assistant prompt (${context})`, text: assistantSystemPrompt({ context: context as never, affordances: [], rule: "a rule" }) });
  out.push({ where: "AI seat prompt", text: aiSeatSystemPrompt({ name: "AI", rule: "a rule", affordances: [] }) });
  for (const f of lineType.families) for (const language of ["typescript", "python"] as const) {
    let shipped: { kind: string; source: string }[] = [];
    try { shipped = startersFor(f.id, language); } catch { continue; }
    for (const s of shipped) out.push({ where: `starter ${f.id}/${s.kind} (${language})`, text: s.source });
  }
  for (const file of ["artifacts/player-web/src/panes/tug-of-war.ts", "artifacts/player-web/src/panes/move-line.ts", "lib/v2-views/src/story.tsx", "lib/v2-views/src/climb.tsx"])
    out.push({ where: file, text: readFileSync(root + file, "utf8") });
  return out;
}

test("nothing players or their AIs are told makes one state enough, or a high state one step away (the owner's fixed-point rule)", () => {
  const found: string[] = [];
  const all = texts();
  assert.ok(all.length > 100, `${all.length} texts read`);
  for (const { where, text } of all) {
    for (const re of FIXED_POINT) {
      const g = new RegExp(re.source, "gi");
      for (let m = g.exec(text); m; m = g.exec(text)) {
        const from = Math.max(0, m.index - 120), around = text.slice(from, m.index + m[0].length + 120).replace(/\s+/g, " ");
        if (ALLOWED.some(a => around.includes(a.text))) continue;
        found.push(`${where}: "${m[0]}" in …${around}…`);
      }
    }
  }
  assert.deepEqual([...new Set(found)], [], "wording that makes one state enough or a high state one step away");
});
