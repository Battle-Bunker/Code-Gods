/**
 * Skills (docs/assistant/token-efficiency.md §3.2): the assistant's domain knowledge, loaded only when a question needs
 * it, in the Agent Skills shape (agentskills.io): a kebab-case `name` and a one-line `description` (what it covers and
 * when to load it) always in context, then a body loaded by the `load_skill` tool (registry; also on MCP and the CLI).
 *
 * A body is static guidance plus live parts the engine reads as the human (`reads`: the room's rules, the observation,
 * the dock layout), rendered by `skillBody`. Pure: no Convex or provider code.
 *
 * Adding a skill: an entry in SKILLS (name, description ≤ 160 characters, reads, tools) and its text in `skillBody`;
 * test/skills.test.ts checks every skill renders within SKILL_LIMITS from empty and from realistic data.
 */
import { PRIMER_AGENTS, PRIMER_SCORING } from "./primer.ts";

export type SkillRead = "rules" | "observation" | "layout";
/** `tools`: the registry tools the skill's task calls (as the Agent Skills spec's allowed-tools): loading the skill loads those the grant may use. */
export interface SkillEntry { name: string; description: string; reads: readonly SkillRead[]; tools: readonly string[] }

export const SKILLS = [
  { name: "game-rules", description: "The full rules of this room: scoring in bits, agents, energy, timing and phases. Load for rules questions the briefing does not answer.", reads: ["rules"], tools: [] },
  { name: "writing-agents", description: "Writing, validating and summoning an agent: the workflow, the room language's mutators and read helpers, and your utility's source.", reads: ["observation"],
    tools: ["evaluate_value", "validate_agent", "summon_agent", "destroy_agent"] },
  { name: "screen", description: "The player's screen: panes, every built-in panel with its parameters, and when to open, change, move or close one.", reads: ["layout"], tools: ["get_layout", "move_pane", "close_pane"] },
  { name: "game-setups", description: "Game setups and room settings: listing, copying, saving and switching the room's setup (owners), and what each choice changes.", reads: [],
    tools: ["list_setups", "get_setup", "save_setup", "duplicate_setup", "get_room_state", "update_settings"] },
] as const satisfies readonly SkillEntry[];
export type SkillName = (typeof SKILLS)[number]["name"];
export const SKILL_NAMES = SKILLS.map(s => s.name) as unknown as readonly [SkillName, ...SkillName[]];
export const findSkill = (name: string): SkillEntry | undefined => (SKILLS as readonly SkillEntry[]).find(s => s.name === name);

/** Body limits (characters): a loaded skill rides on every later step of the thread. */
export const SKILL_LIMITS = { body: 14_000, rules: 8_000, source: 3_000, helpers: 4_000, helper: 200, panels: 4_000 } as const;

type Json = Record<string, unknown>;
const rec = (v: unknown): Json => v && typeof v === "object" && !Array.isArray(v) ? v as Json : {};
const str = (v: unknown): string | undefined => typeof v === "string" ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : undefined;
const cut = (text: string, max: number) => text.length > max ? `${text.slice(0, max)}… [cut]` : text;

/** The room language's mutators and read helpers, one signature a line, bounded. */
export function helperLines(instance: unknown, language: string, limits: { helpers: number; helper: number } = SKILL_LIMITS): string[] {
  const helpers = Array.isArray(rec(instance).helpers) ? (rec(instance).helpers as unknown[]).map(rec) : [];
  const lines: string[] = [];
  let used = 0;
  for (const group of ["mutator", "read"]) {
    const of = helpers.filter(h => h.group === group);
    if (!of.length) continue;
    lines.push(group === "mutator" ? "Mutators (an agent returns a list of these calls):" : "Read helpers:");
    for (const h of of) {
      const signature = str(rec(h.signature)[language]) ?? str(rec(h.name)[language]);
      if (!signature) continue;
      const line = cut(`  ${signature}${h.kid ? ` — ${str(h.kid)}` : ""}`, limits.helper);
      if (used + line.length > limits.helpers) { lines.push("  … more in get_observation (instance.helpers)"); return lines; }
      used += line.length;
      lines.push(line);
    }
  }
  return lines;
}

/** The built-in panel catalogue (get_layout's `panels`): each parameter with its allowed values when it has a short enum. */
export function panelCatalogLines(layout: unknown, max: number = SKILL_LIMITS.panels): string[] {
  const panels = Array.isArray(rec(layout).panels) ? (rec(layout).panels as unknown[]).map(rec) : [];
  const lines = panels.map(l => {
    const props = Object.entries(rec(rec(l.paramsSchema).properties)).map(([name, schema]) => {
      const values = rec(schema).enum;
      return Array.isArray(values) && values.length <= 8 && values.every(v => typeof v === "string") ? `${name}(${values.join("|")})` : name;
    });
    return `  ${str(l.id)} — ${str(l.title)}${l.blurb ? ` (${str(l.blurb)})` : ""}: params ${props.join(", ") || "none"}; phases ${Array.isArray(l.phases) ? l.phases.join("/") : "?"}`;
  });
  const stored = Array.isArray(rec(layout).storedPanels) ? (rec(layout).storedPanels as unknown[]).map(rec).map(p => str(p.slug)).filter(Boolean) : [];
  if (stored.length) lines.push(`Stored panels of the player (open_panel {slug}): ${stored.join(", ")}`);
  const out: string[] = [];
  let used = 0;
  for (const line of lines) {
    if (used + line.length + 1 > max) { out.push("  … (get_layout has the rest)"); break; }
    used += line.length + 1;
    out.push(line);
  }
  return out;
}

const WRITING_AGENTS = `WRITING AN AGENT.
1. Decide what to aim for from the player's utility (its source is below; evaluate_value scores a candidate value).
2. Read a few objects (get_observation) to see what the agent will meet.
3. Write ordinary code in the room language that defines agent(obj) and returns a LIST of at most 16 mutator calls (only the helper names below; never a new object). Every object value is unique: a change onto an existing value fails.
4. Keep it cheap: simple code costs fewer summon bits and fewer decision bits per act.
5. Show the draft in the forge panel: open_panel {panelId: "forge", params: {source}}.
6. validate_agent (free, takes seconds): report whether it compiles, its summon cost and cost per act against the player's energy.
7. Summon (summon_agent, the player confirms on a card) only when the player asks; always validate first. The new agent's id is in get_observation (agents[].id), never the command id.
Running agents: watch bits-over-time and the feed; destroy_agent (confirmed) an agent that loses bits; energy already spent is not refunded.`;

const SCREEN = `THE PLAYER'S SCREEN. The client is a dock of panes: built-in panels (with parameters), the player's own stored panels, and this conversation (one pane, never closable; "the chat", "this chat" or "you" about the screen means it; move_pane moves it). The public chat is the public-chat panel.
- The player picks a pane's panel from a menu but cannot set its parameters: you do. open_panel {panelId, params} shows a built-in panel with parameters you choose; open_panel {slug} shows a stored panel; set_panel_params {paneId, params} replaces one pane's parameters.
- Without place, open_panel adds no pane: it reuses an open pane of that panel, else switches a built-in panel the player did not choose; a new pane opens only when every built-in panel on screen is the player's. Give place only when the player asks for another pane; at most four built-in panels are open (a fifth is refused: change one instead).
- Open or re-parameterise a panel when it shows the answer better than words: an object's breakdown or a ranking → objects (highlight); a trend → bits-over-time or race; a draft agent → forge {source}; a move to test → what-if.
- At most one layout change per answer unless the player asks for an arrangement; at most two per step. Prefer explaining when a visible pane already shows it.
- Never move or close a pane the player arranged (setBy: human) unless asked. To rearrange use move_pane (loaded with load_tools); close_pane closes a pane the player asked to close. Report exactly what changed (never say you moved a pane when you opened one), then one line on what to look at.
- An ended game is frozen at its final tick: every panel and read still shows that final state.`;

const SETUPS = `GAME SETUPS. A room always runs one game setup: a named, complete set of settings in one shared collection (list_setups), each owned by its creator or by the system; there is no "custom" state.
- get_setup shows one setup's settings. Only a setup's owner may change it (save_setup, complete settings); anyone may copy one (duplicate_setup) and edit the copy.
- For the room owner (owner grant), update_settings with a setupId puts the room on any setup; with settings it edits the room's setup if the player owns it, else makes their own copy and switches the room to it: tell the player which (the result's setup.note). It needs the room's current revision (get_room_state) and the player's confirmation.
- A language change moves the grammar and the summon price; an object type change moves its default instantiation. A running game keeps the settings it started with: settings change the next game.`;

/**
 * A skill's body: its guidance, then the live parts it reads (missing reads say so instead of failing). Player-written
 * strings (chat, others' labels) never appear here; the utility source is the player's own.
 */
export function skillBody(name: SkillName, data: { rules?: unknown; observation?: unknown; layout?: unknown }): string {
  const parts: string[] = [];
  if (name === "game-rules") {
    const rules = str(rec(data.rules).rules);
    parts.push(PRIMER_SCORING);
    parts.push(rules ? `THE RULES OF THIS ROOM (as the engine states them; settings are the next game's, a running game keeps its own):\n${cut(rules, SKILL_LIMITS.rules)}`
      : "The room's rules could not be read: call get_rules.");
  } else if (name === "writing-agents") {
    const o = rec(data.observation);
    const language = str(o.language) ?? "python";
    const utility = rec(rec(o.self).utility);
    parts.push(WRITING_AGENTS, PRIMER_AGENTS, `Room language: ${language}. agent(obj) receives the object's value itself (a number for Int, a string for string, a grid for Grid), never a wrapper with fields.`, ...helperLines(o.instance, language));
    const source = str(utility.source);
    if (source) parts.push(`The player's utility (private): ${[str(utility.emoji), str(utility.name)].filter(Boolean).join(" ")}${utility.summary ? ` — ${str(utility.summary)}` : ""}`, "Source:", cut(source, SKILL_LIMITS.source));
    const penalty = rec(utility.penalty);
    if (str(penalty.source)) parts.push(`Defence goal (penalty): ${str(penalty.name) ?? ""}${penalty.summary ? ` — ${str(penalty.summary)}` : ""}`, "Source:", cut(str(penalty.source)!, SKILL_LIMITS.source));
    if (!data.observation) parts.push("The observation could not be read: call get_observation for the helpers and the utility.");
  } else if (name === "screen") {
    parts.push(SCREEN);
    const catalog = panelCatalogLines(data.layout);
    parts.push(catalog.length ? ["Built-in panels (open_panel {panelId, params}; get_layout has each parameter's JSON Schema):", ...catalog].join("\n")
      : "The panel catalogue could not be read: call get_layout.");
  } else {
    parts.push(SETUPS);
  }
  const tools = findSkill(name)?.tools ?? [];
  if (tools.length) parts.push(`This skill loads its tools (those the grant allows): ${tools.join(", ")}; call them directly.`);
  return cut(parts.join("\n"), SKILL_LIMITS.body);
}
