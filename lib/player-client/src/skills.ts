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
import { CHANGE_READ_RATIO, allowedLanguages, fullReadCharge, seedSetupSettings } from "@workspace/game-core";
import { PRIMER_AGENTS, PRIMER_SCORING } from "./primer.ts";
import { firstAgentFor, firstAgentSection, type FirstAgent } from "./first-agent.ts";
import { ANALYTICS_CODE_SKILL } from "./skills/analytics-code.ts";
import { RIVAL_INFERENCE_SKILL } from "./skills/rival-inference.ts";

export type SkillRead = "rules" | "observation" | "layout";
/** `tools`: the registry tools the skill's task calls (as the Agent Skills spec's allowed-tools): loading the skill loads those the grant may use. */
export interface SkillEntry { name: string; description: string; reads: readonly SkillRead[]; tools: readonly string[] }

export const SKILLS = [
  { name: "game-rules", description: "The room's full rules: scoring, agents, energy, timing, phases. Load when the briefing isn't enough.", reads: ["rules"], tools: [] },
  { name: "writing-agents", description: "Writing, validating, summoning agents: workflow, mutators, helpers, your utility's source.", reads: ["observation"],
    tools: ["evaluate_value", "validate_agent", "summon_agent", "destroy_agent", "allocate_power"] },
  { name: "screen", description: "The player's screen: panes, every built-in panel and its parameters; when to open, move or close one.", reads: ["layout"], tools: ["get_layout", "move_pane", "close_pane"] },
  { name: "game-setups", description: "Game setups and room settings: list, copy, save, switch (owners); what each choice does.", reads: [],
    tools: ["list_setups", "get_setup", "save_setup", "duplicate_setup", "get_room_state", "update_settings"] },
  { name: "analytics-code", description: "Tables, rankings, statistics with run_code: datasets, libraries, examples. Load for any table.", reads: [],
    tools: ["run_code", "get_code_run", "list_code_runs", "list_code_objects"] },
  { name: "rival-inference", description: "Infer other gods' rules from the public log.", reads: [],
    tools: ["get_utility_series", "get_board_at", "list_utility_candidates", "fit_utility_mixture"] },
] as const satisfies readonly SkillEntry[];
export type SkillName = (typeof SKILLS)[number]["name"];
export const SKILL_NAMES = SKILLS.map(s => s.name) as unknown as readonly [SkillName, ...SkillName[]];
export const findSkill = (name: string): SkillEntry | undefined => (SKILLS as readonly SkillEntry[]).find(s => s.name === name);

/** The skills index, one `- name: description` line each (the in-client assistant's prompt and the MCP instructions). */
export const skillIndexLines = () => SKILLS.map(k => `- ${k.name}: ${k.description}`);

/** Body limits (characters): a loaded skill rides on every later step of the thread. */
export const SKILL_LIMITS = { body: 20_000, rules: 8_000, source: 3_000, helpers: 9_000, helper: 200, panels: 4_000 } as const;

type Json = Record<string, unknown>;
const rec = (v: unknown): Json => v && typeof v === "object" && !Array.isArray(v) ? v as Json : {};
const str = (v: unknown): string | undefined => typeof v === "string" ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : undefined;
const cut = (text: string, max: number) => text.length > max ? `${text.slice(0, max)}… [cut]` : text;

/**
 * A language's mutators and read helpers, one signature a line, bounded: each group gets half of the helpers budget,
 * so a game's many long mutator descriptions never crowd out the read helpers (how an agent reads a cell).
 */
export function helperLines(instance: unknown, language: string, limits: { helpers: number; helper: number } = SKILL_LIMITS): string[] {
  const helpers = Array.isArray(rec(instance).helpers) ? (rec(instance).helpers as unknown[]).map(rec) : [];
  const lines: string[] = [];
  for (const group of ["mutator", "read"]) {
    const of = helpers.filter(h => h.group === group);
    if (!of.length) continue;
    let used = 0;
    lines.push(group === "mutator" ? "Mutators (an agent returns a list of these calls):" : "Read helpers:");
    for (const h of of) {
      const signature = str(rec(h.signature)[language]) ?? str(rec(h.name)[language]);
      if (!signature) continue;
      const line = cut(`  ${signature}${h.kid ? ` — ${str(h.kid)}` : ""}`, limits.helper);
      if (used + line.length > limits.helpers / 2) { lines.push("  … more in get_observation (instance.helpers)"); break; }
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
3. Write ordinary code in one of the allowed languages (pass it as language to validate_agent and summon_agent) that defines agent(obj) and returns a LIST of at most 16 mutator calls (only the helper names below; never a new object). Every object value is unique: a change onto an existing value fails. So the result must depend on the object: an act that writes the same value everywhere (write(everything(), 0)) succeeds on one object and collides on every other, forever. And it should keep changing an object: an act whose second application changes nothing (mirror a half, round, sort) acts once per object, then only fails. The engine stops offering a deterministic agent an object it can only fail on, but each of those first failures still costs.
4. Keep it cheap: simple code costs fewer summon bits. An act pays only what it does: its READS, at 1/${CHANGE_READ_RATIO} bit of energy per bit read (looking is ${CHANGE_READ_RATIO}× cheaper than changing; each cell colour, symbol or number is counted the first time it is looked at; where cells are is free; a whole 4×4 board costs about ${fullReadCharge(seedSetupSettings("grid-first-steps")).toFixed(1)} bits) plus, only when it changes the object, the change: W + 0.05·W², where W adds up the elementary steps the act amounts to (one cell's colour or symbol, about 8 and 12 bits on a 4×4 board; one digit added to a number, or a multiplication by a prime), whatever mutator made them. The square makes radical acts very expensive (a 4-cell row costs 7.5× one cell; ×7⁴ in one act more than four separate ×7 acts), so prefer SMALL INCREMENTAL acts: one or two cells or digits per act. There is no fixed charge per act. So look before you change: read what decides whether a change helps the player (and whether it breaks the interests of gods they share objects with; computing is free), and RETURN NO CALLS when nothing is worth doing: that skip pays only its reads, is not a failure, and leaves the agent richer, and richer agents get more turns (a turn goes to an agent with probability proportional to its positive energy). Python agents may not use names or attributes starting with an underscore, getattr/setattr/delattr, attrgetter/methodcaller, format/format_map, or frame/closure introspection.
5. Show the draft in the forge panel: open_panel {panelId: "forge", params: {source}}.
6. validate_agent (free, takes seconds): its assessment says whether the agent works on the reference objects (verdict works, warns, fails, no_change, rejected or not_ready; a compiled agent that raises on every object fails; warns: it runs, but in a sample world most acts would fail (one result for every object, or nothing more on a second application) or the player already runs this exact code: tell the player the warning and the expected success rate, and offer a fix, before any summon), its summon price against the player's energy and its cost per act, and the next step. Fix a failing draft from the error and the signatures below; after three failures, show the player the draft and the error. A result with notReady is not a failure: the language's agent sandbox is still warming up (or failed to start, with the reason) and nothing ran; wait notReady.retryAfterMs and send it again (get_observation sandboxes shows each language's state).
7. Once it works, stop validating and report: the code, what it does, price against energy, estimated cost per act (reading plus changing). Summon (summon_agent with the identical source and language, ALWAYS with a meaningful short name such as "Corner hoarder" and a one- or two-sentence description of what it does and why) only when the player asks (or on Autopilot, when it pays); always validate first. The new agent's id is in get_observation (agents[].id), never the command id. Never summon copies of one agent: a copy gives each object the same result, so it adds failures, not progress.
Running agents: soon after a summon, read get_observation agents[].diagnosis ("38 of 38 acts failed: another object already has this value", with a fix hint; agents[].outcomes has the counts by kind) and tell the player; fix or destroy an agent whose acts mostly fail. Watch bits-over-time and the feed; destroy_agent an agent that loses bits; energy already spent is not refunded. Power is a fixed budget: agents divide it (economy.powerPerSecond, agents[].powerShare); allocate_power moves a share, and a duplicate agent only splits the same power.`;

const SCREEN = `THE PLAYER'S SCREEN. The client is a dock of panes: built-in panels (with parameters), the player's own stored panels, and the in-client assistant's conversation (one pane, never closable; when you are that assistant, "the chat", "this chat" or "you" about the screen means it; move_pane moves it). The public chat is the public-chat panel.
- The player picks a pane's panel from a menu but cannot set its parameters: you do. open_panel {panelId, params} shows a built-in panel with parameters you choose; open_panel {slug} shows a stored panel; set_panel_params {paneId, params} replaces one pane's parameters.
- Without place, open_panel adds no pane: it reuses an open pane of that panel, else switches a built-in panel the player did not choose; a new pane opens only when every built-in panel on screen is the player's. Give place only when the player asks for another pane; at most four built-in panels are open (a fifth is refused: change one instead).
- Open or re-parameterise a panel when it shows the answer better than words: an object's breakdown or a ranking → objects (highlight); a trend → bits-over-time or race; a draft agent → forge {source}; a move to test → what-if.
- At most one layout change per answer unless the player asks for an arrangement; at most two per step. Prefer explaining when a visible pane already shows it.
- Never move or close a pane the player arranged (setBy: human) unless asked. To rearrange use move_pane; close_pane closes a pane the player asked to close. Report exactly what changed (never say you moved a pane when you opened one), then one line on what to look at.
- An ended game is frozen at its final tick: every panel and read still shows that final state.`;

const SETUPS = `GAME SETUPS. A room always runs one game setup: a named, complete set of settings in one shared collection (list_setups), each owned by its creator or by the system; there is no "custom" state.
- get_setup shows one setup's settings. Only a setup's owner may change it (save_setup, complete settings); anyone may copy one (duplicate_setup) and edit the copy.
- For the room owner (owner grant), update_settings with a setupId puts the room on any setup; with settings it edits the room's setup if the player owns it, else makes their own copy and switches the room to it: tell the player which (the result's setup.note). It needs the room's current revision (get_room_state).
- languages is the set agents may be written in (at least one): each agent's grammar and summon price follow its own language. An object type change moves its default instantiation. A running game keeps the settings it started with: settings change the next game.`;

/**
 * A skill's body: its guidance, then the live parts it reads (missing reads say so instead of failing). Player-written
 * strings (chat, others' labels) never appear here; the utility source is the player's own. `firstAgent`: the example
 * agent for the player's rule (the engine passes game-utilities' example-agents.ts); without it, first-agent.ts's generic move.
 */
export function skillBody(name: SkillName, data: { rules?: unknown; observation?: unknown; layout?: unknown; firstAgent?: FirstAgent | null }): string {
  const parts: string[] = [];
  if (name === "game-rules") {
    const rules = str(rec(data.rules).rules);
    parts.push(PRIMER_SCORING);
    parts.push(rules ? `THE RULES OF THIS ROOM (as the engine states them; settings are the next game's, a running game keeps its own):\n${cut(rules, SKILL_LIMITS.rules)}`
      : "The room's rules could not be read: call get_rules.");
  } else if (name === "writing-agents") {
    const o = rec(data.observation);
    const allowed = allowedLanguages(o).length ? allowedLanguages(o) : ["python"];
    const utility = rec(rec(o.self).utility);
    parts.push(WRITING_AGENTS, PRIMER_AGENTS, `Allowed languages: ${allowed.join(", ")} (pass the agent's language to validate_agent and summon_agent; default ${allowed[0]}). agent(obj) receives the object's value itself (a number for Int, a string for string, a grid for Grid), never a wrapper with fields.`);
    // A first agent to start from (first-agent.ts), before the long helper lists so the body's limit never cuts it.
    const helpers = Array.isArray(rec(o.instance).helpers) ? (rec(o.instance).helpers as unknown[]).map(rec) : [];
    const mutators = helpers.filter(h => h.group === "mutator").flatMap(h => str(rec(h.name)[allowed[0]!]) ?? []);
    const first = data.firstAgent ?? firstAgentFor({ familyId: str(utility.familyId), objectType: str(rec(o.instance).objectType), language: allowed[0]!, mutators });
    if (first) parts.push(firstAgentSection(first, allowed[0]!));
    // Each allowed language's helper names, sharing the helpers budget.
    const share = { ...SKILL_LIMITS, helpers: Math.floor(SKILL_LIMITS.helpers / allowed.length) };
    for (const language of allowed) parts.push(`Helpers in ${language}:`, ...helperLines(o.instance, language, share));
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
  } else if (name === "analytics-code") {
    parts.push(ANALYTICS_CODE_SKILL);
  } else if (name === "rival-inference") {
    parts.push(RIVAL_INFERENCE_SKILL);
  } else {
    parts.push(SETUPS);
  }
  const tools = findSkill(name)?.tools ?? [];
  if (tools.length) parts.push(`This skill's tools (those the grant allows): ${tools.join(", ")}. In the in-client assistant, call load_tools for any not in your tool list yet.`);
  return cut(parts.join("\n"), SKILL_LIMITS.body);
}
