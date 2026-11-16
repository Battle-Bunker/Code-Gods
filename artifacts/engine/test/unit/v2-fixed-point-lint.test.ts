/**
 * The owner's standing rule (CLAUDE.md, 14 November): never build features, prompts or advice that help players reach or
 * hold a fixed point (agreed destination states, settle-and-hold, copying one state). This lint reads what players and
 * their AIs are told: the affordances' ids, titles and descriptions; the agent primer; the assistant's and AI seats'
 * prompts; every shipped starter's source and comments; and the app's end-of-game and tug-of-war texts. Wording that
 * proposes a destination or a hold fails, unless an allowlisted sentence says the opposite or means something else.
 *
 * What would break: a prompt or starter that tells players to settle lines, hold them, defend them or park them, as the
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

/** Wording that proposes a destination state or holding one. */
const FIXED_POINT = [
  /\bsettl(e|es|ed|ing)\b/i,
  /\bhold(s|ing)? (it|them|the line|the lines|the state|that state|this state|there|at)\b/i,
  /\bagreed[- ](state|destination|target|line|point)s?\b/i,
  /\bcopy (this|that|the|a) state\b/i,
  /\bstay(s)? on\b/i,
  /\block(s|ed)? (it |them )?in\b/i,
  /\bpark(s|ed|ing)? (the|a|your|it|them)\b/i,
  /\bfixed point\b/i,
  /\bleave (it|them) (there|where)\b/i,
  /\bdestination\b/i,
  /\bfreez(e|es) (the|a|it|them) /i,
  /\bkeep (it|them|the line) (there|as it is|where it is|unchanged)\b/i,
  /\b(end|target|final) state\b/i,
  /\ba state to reach\b/i,
  /\btoward (its|their|a|the) (own )?state\b/i,
  /\bdefend(s|ed|ing)? (it|them|the line|lines)?\b/i,
];

/** Sentences that match a pattern but say the opposite, or mean something else; each says why. */
const ALLOWED: readonly { readonly text: string; readonly why: string }[] = [
  { text: "An agent holds at most its share", why: "energy an agent holds, not a line" },
  { text: "a player holding it reads", why: "a player holding a dealt rule" },
  { text: "Standings freeze as they are", why: "the game ending, not a line held" },
  { text: "says which object holds it", why: "uniqueness: another object is in that state" },
  { text: "never a final state to reach and keep", why: "says the opposite" },
  { text: "never a final state to hold", why: "says the opposite" },
  { text: "there is no final state to reach", why: "says the opposite" },
  { text: "not a state to reach", why: "says the opposite" },
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

test("nothing players or their AIs are told proposes a destination state or holding one (the owner's fixed-point rule)", () => {
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
  assert.deepEqual([...new Set(found)], [], "wording that proposes a destination or a hold");
});
