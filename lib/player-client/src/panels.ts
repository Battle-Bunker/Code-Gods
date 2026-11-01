/**
 * The built-in analytics panels of the player client (docs/ui-redesign.md §2.2 and §3): pure metadata shared by the
 * engine (the layout tools validate parameters with these schemas) and the client (which renders each panel in
 * artifacts/player-web/src/core/panels/<id>.tsx). No React, no Convex here. A player's own TSX panels are stored
 * panels (docs/panels.md), not listed here.
 *
 * A pane's panel is chosen by the human from a menu; a panel's PARAMETERS are set only by the assistant, through the
 * layout tools, so every parameter is optional with a default (the panel is useful with the assistant off), except
 * what-if's `objectId` and `calls`, which the panel cannot show anything without.
 */
import { z } from "zod/v4";

export type Phase = "lobby" | "planning" | "running" | "paused" | "ended";
const ALL: readonly Phase[] = ["lobby", "planning", "running", "paused", "ended"];
/** The game's phases with a world (planning has the dealt cards, not yet objects). `ended` is the frozen final state. */
const WORLD: readonly Phase[] = ["running", "paused", "ended"];
const GAME: readonly Phase[] = ["planning", "running", "paused", "ended"];

export const PANEL_IDS = ["overview", "my-card", "objects", "others-care", "bits-over-time", "race", "agents", "feed", "what-if", "public-chat", "forge", "results", "rules", "code-output"] as const;
export type PanelId = (typeof PANEL_IDS)[number];

export interface PanelDefinition<P extends z.ZodObject = z.ZodObject> {
  id: PanelId;
  title: string;
  /** One sentence for a newcomer. */
  blurb: string;
  /**
   * Where the panel has data; elsewhere its empty state names the next step. Every panel with game data includes
   * `ended`: an ended game stays inspectable, frozen at its final tick (docs/ui-redesign.md §3, "frozen end state").
   */
  phases: readonly Phase[];
  /** Strict; every field optional with a default, except what-if's objectId and calls. */
  params: P;
  /** The pane caption and the chat chip, e.g. "Top 12 · only ones others care about". */
  summary: (params: z.output<P>) => string;
}

const objectId = z.string().min(1).max(128);
const objectIds = (max: number) => z.array(objectId).max(max).default([]);
const seconds = (min: number, max: number, dflt: number) => z.number().int().min(min).max(max).default(dflt);
/** One mutator call in the engine's wire form: the mutator id and its named arguments (the observation's `calls`). */
const call = z.tuple([z.string().min(1).max(64), z.record(z.string(), z.unknown())]);
const calls = z.array(call).min(1).max(16);

const def = <P extends z.ZodObject>(d: PanelDefinition<P>) => d;
const bool = (dflt: boolean) => z.boolean().default(dflt);
const when = (flag: boolean, text: string) => (flag ? [text] : []);
const line = (parts: readonly string[]) => parts.filter(Boolean).join(" · ");

export const PANELS = {
  overview: def({
    id: "overview", title: "Where am I", blurb: "What's happening, how you're doing, and the one thing to do next.", phases: ALL,
    params: z.strictObject({ focus: z.enum(["auto", "goal", "agents", "standing"]).default("auto") }),
    summary: p => (p.focus === "auto" ? "Situation, standing, next step" : `Focus: ${p.focus}`),
  }),
  "my-card": def({
    id: "my-card", title: "Your secret goal", blurb: "Your utility card in plain words, with live examples.", phases: GAME,
    params: z.strictObject({ examples: z.number().int().min(0).max(6).default(3), showSource: bool(false), exampleSort: z.enum(["best", "worst"]).default("best") }),
    summary: p => line([p.examples ? `${p.examples} ${p.exampleSort} example${p.examples === 1 ? "" : "s"}` : "No examples", ...when(p.showSource, "with source")]),
  }),
  objects: def({
    id: "objects", title: "Objects by payoff", blurb: "Which things in the world earn you points.", phases: WORLD,
    params: z.strictObject({
      sortBy: z.enum(["payoff", "mine", "othersCare"]).default("payoff"),
      filter: z.enum(["all", "positive", "contested", "chips"]).default("all"),
      limit: z.number().int().min(3).max(60).default(12),
      highlight: objectIds(8),
      layout: z.enum(["list", "grid"]).default("list"),
      /** Mark what makes up each object's score: "mine" (your own utility, the default) or "none". */
      annotate: z.enum(["mine", "none"]).default("mine"),
    }),
    summary: p => line([`Top ${p.limit} by ${{ payoff: "payoff", mine: "your bits", othersCare: "others' care" }[p.sortBy]}`,
      ...when(p.filter !== "all", ({ positive: "positive only", contested: "only ones both care about", chips: "only ones others care about" } as Record<string, string>)[p.filter] ?? p.filter),
      ...when(p.highlight.length > 0, `${p.highlight.length} highlighted`), ...when(p.layout === "grid", "grid"), ...when(p.annotate === "none", "no marks")]),
  }),
  "others-care": def({
    id: "others-care", title: "What others care about", blurb: "Where the others' interests lie, from totals only.", phases: WORLD,
    params: z.strictObject({ mode: z.enum(["snapshot", "movements"]).default("snapshot"), quadrant: z.enum(["none", "chips", "conflict", "shared"]).default("none"), window: z.number().int().min(10).max(50).default(50) }),
    summary: p => line([p.mode === "snapshot" ? "Now" : `Movements over ${p.window} ticks`, ...when(p.quadrant !== "none", `highlighting ${p.quadrant}`)]),
  }),
  "bits-over-time": def({
    id: "bits-over-time", title: "My points over time", blurb: "Is it getting better or worse for you.", phases: WORLD,
    params: z.strictObject({
      metric: z.enum(["payoff", "mine", "others"]).default("payoff"), objects: z.enum(["top", "bottom", "ids"]).default("top"), ids: objectIds(8),
      count: z.number().int().min(1).max(8).default(5), window: seconds(0, 3600, 0),
    }),
    summary: p => line([{ payoff: "Payoff", mine: "Your bits", others: "Others' bits" }[p.metric], p.objects === "ids" ? `${p.ids.length} chosen object${p.ids.length === 1 ? "" : "s"}` : `${p.objects} ${p.count}`,
      ...when(p.window > 0, `last ${p.window} s`)]),
  }),
  race: def({
    id: "race", title: "Leaderboard race", blurb: "Who's winning, and is anyone catching up.", phases: WORLD,
    params: z.strictObject({ show: z.enum(["all", "top3", "me-vs-leader"]).default("all"), metric: z.enum(["total", "gap"]).default("total"), window: seconds(60, 3600, 300) }),
    summary: p => line([{ all: "Everyone", top3: "Top 3", "me-vs-leader": "You vs the leader" }[p.show], p.metric === "gap" ? "gap to the leader" : "total payoff", `last ${p.window} s`]),
  }),
  agents: def({
    id: "agents", title: "My agents", blurb: "Your agents, their energy, and when each acts next.", phases: WORLD,
    params: z.strictObject({ agentIds: z.array(z.string().min(1).max(128)).max(32).default([]), window: seconds(30, 600, 120), showSource: bool(false), showCosts: bool(false) }),
    summary: p => line([p.agentIds.length ? `${p.agentIds.length} agent${p.agentIds.length === 1 ? "" : "s"}` : "All agents", `last ${p.window} s`, ...when(p.showSource, "with source"), ...when(p.showCosts, "with costs")]),
  }),
  feed: def({
    id: "feed", title: "What just changed", blurb: "The latest changes and what they did to you.", phases: WORLD,
    params: z.strictObject({
      who: z.enum(["all", "mine", "others"]).default("all"), objectId: objectId.optional(), minImpact: z.number().min(0).max(64).default(0),
      limit: z.number().int().min(5).max(50).default(20), groupBy: z.enum(["none", "object", "mutator"]).default("none"),
    }),
    summary: p => line([`Last ${p.limit}`, ...when(p.who !== "all", p.who === "mine" ? "mine only" : "others only"), ...when(!!p.objectId, "one object"),
      ...when(p.minImpact > 0, `≥ ${p.minImpact} bits`), ...when(p.groupBy !== "none", `by ${p.groupBy}`)]),
  }),
  "what-if": def({
    id: "what-if", title: "What if…", blurb: "What a move would do to your score before anyone makes it.", phases: GAME,
    params: z.strictObject({ objectId, calls, compare: calls.optional(), value: z.union([z.number(), z.string().max(1024)]).optional() }),
    summary: p => line([`${p.calls.length} move${p.calls.length === 1 ? "" : "s"} on one object`, ...when(!!p.compare, "vs an alternative"), ...when(p.value !== undefined, "and a raw value")]),
  }),
  "public-chat": def({
    id: "public-chat", title: "Public chat", blurb: "Everything said to everyone; the only public input.", phases: ALL,
    params: z.strictObject({ filter: z.enum(["all", "humans", "ai", "mentionsMe"]).default("all"), highlight: z.array(z.string().min(1).max(64)).max(5).default([]) }),
    summary: p => line([{ all: "Everyone", humans: "Humans only", ai: "AI only", mentionsMe: "Mentions of you" }[p.filter], ...when(p.highlight.length > 0, `highlighting ${p.highlight.join(", ")}`)]),
  }),
  forge: def({
    id: "forge", title: "Agent code", blurb: "The agent being written for you and what it costs; Edit opens the editor.", phases: GAME,
    params: z.strictObject({ language: z.enum(["python", "typescript"]).optional(), source: z.string().max(16384).optional(), agentId: z.string().min(1).max(128).optional(), showHelpers: bool(false) }),
    summary: p => line([p.agentId ? "A live agent's code" : p.source ? "A draft" : "Empty", ...when(!!p.language, p.language ?? ""), ...when(p.showHelpers, "with helpers")]),
  }),
  results: def({
    id: "results", title: "How the game went", blurb: "Final standings and why you finished where you did.", phases: ["ended", "lobby"],
    params: z.strictObject({ gameId: z.string().min(1).max(128).optional(), section: z.enum(["all", "standings", "mine"]).default("all") }),
    summary: p => line([p.gameId ? "A past game" : "The latest game", ...when(p.section !== "all", p.section === "mine" ? "your part" : "standings")]),
  }),
  rules: def({
    id: "rules", title: "How to play", blurb: "The 90-second explanation, scoring and this room's settings.", phases: ALL,
    params: z.strictObject({ section: z.enum(["all", "primer", "scoring", "settings"]).default("all") }),
    summary: p => (p.section === "all" ? "Everything" : { primer: "The 90-second explanation", scoring: "How scoring works", settings: "This room's settings" }[p.section]),
  }),
  "code-output": def({
    id: "code-output", title: "Code results", blurb: "Tables and notes from analytics your assistant ran for you.", phases: ALL,
    params: z.strictObject({
      /** A run's id (run_code's runId); default: your latest run in this room. */
      runId: z.string().min(1).max(128).optional(),
      view: z.enum(["auto", "table", "json"]).default("auto"),
      showSource: bool(false),
    }),
    summary: p => line([p.runId ? "One run" : "Your latest run", ...when(p.view !== "auto", p.view), ...when(p.showSource, "with source")]),
  }),
} satisfies { readonly [K in PanelId]: PanelDefinition };

export type PanelParams<K extends PanelId> = z.output<(typeof PANELS)[K]["params"]>;

export const isPanelId = (value: unknown): value is PanelId => typeof value === "string" && (PANEL_IDS as readonly string[]).includes(value);
export const panel = (id: PanelId): PanelDefinition => PANELS[id] as PanelDefinition;

/**
 * The panel a pane shows until a human or the assistant chooses one: the objects ranked by payoff (before the world
 * runs, its empty state says what will appear there), or results once the game has ended.
 */
export const defaultPanelFor = (phase: Phase): PanelId => (phase === "ended" ? "results" : "objects");

/**
 * Parse a panel's parameters: the defaults when none are given; the parsed output (defaults filled) when valid; else
 * `null` and the issues, so a tool can answer BAD_REQUEST and a reader can fall back to the defaults.
 */
export function parsePanelParams(id: PanelId, params: unknown): { ok: true; params: Record<string, unknown> } | { ok: false; issues: string[] } {
  const parsed = panel(id).params.safeParse(params ?? {});
  if (parsed.success) return { ok: true, params: parsed.data as Record<string, unknown> };
  return { ok: false, issues: parsed.error.issues.slice(0, 5).map(i => `${i.path.join(".") || "(root)"}: ${i.message}`) };
}

/** The panel's defaults, or null for a panel that has required parameters (what-if). */
export function defaultPanelParams(id: PanelId): Record<string, unknown> | null {
  const parsed = panel(id).params.safeParse({});
  return parsed.success ? (parsed.data as Record<string, unknown>) : null;
}

/** The pane caption for a panel and (valid) parameters; falls back to the title when the parameters do not parse. */
export function panelSummary(id: PanelId, params: unknown): string {
  const parsed = parsePanelParams(id, params);
  return parsed.ok ? (panel(id).summary as (p: unknown) => string)(parsed.params) : panel(id).title;
}

/** The catalogue as the layout tools and the briefing describe it: metadata plus each panel's JSON Schema. */
export function panelCatalog(): { id: PanelId; title: string; blurb: string; phases: readonly Phase[]; paramsSchema: Record<string, unknown> }[] {
  return PANEL_IDS.map(id => {
    const { $schema: _, ...paramsSchema } = z.toJSONSchema(panel(id).params, { io: "input" }) as Record<string, unknown>;
    return { id, title: panel(id).title, blurb: panel(id).blurb, phases: panel(id).phases, paramsSchema };
  });
}
