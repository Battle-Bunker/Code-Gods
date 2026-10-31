/**
 * The palette's ranking (docs/research/ui-redesign/palette-and-pages.md §2.3–2.4, §2.7), pure so it is tested
 * without a DOM:
 * - typed queries match fuzzily over the title and the aliases (keywords); a row matched through an alias shows it;
 *   available rows rank above unavailable ones, which are dimmed with their reason; rows whose availability says
 *   `hidden` (they can never apply to this viewer) are never listed;
 * - the empty query shows at most EMPTY_VIEW_LIMIT available rows: the suggested next step and the two most recent
 *   commands, then the commands with a default score above 0 by section. Everything else appears only when typed.
 */
import type { Availability, Command, PaletteContext, PaletteSection } from "./types.ts";

export const SECTION_ORDER: readonly PaletteSection[] = ["suggested", "actions", "views", "goto", "settings", "help"];
export const SECTION_TITLES: Readonly<Record<PaletteSection, string>> = {
  suggested: "Suggested", actions: "Actions", views: "Views", goto: "Go to", settings: "Settings", help: "Help",
};
export const EMPTY_VIEW_LIMIT = 12;
/** Rows per section in the empty-query view (Settings stays hidden until typed). */
const EMPTY_CAPS: Readonly<Record<PaletteSection, number>> = { suggested: 3, actions: 4, views: 4, goto: 3, settings: 0, help: 2 };
const TYPED_LIMIT = 60;

export function sectionOf(command: Command): PaletteSection {
  if (command.section) return command.section;
  if (command.performer.kind === "navigate") return "goto";
  switch (command.group) {
    case "view": return "views";
    case "account": return "settings";
    case "help": return "help";
    default: return "actions";
  }
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const words = (s: string) => s.split(/[^a-z0-9]+/).filter(Boolean);

/** How well `query` (already lower-case) matches `text`: 0 (no match) to 100 (equal). */
export function matchScore(text: string, query: string): number {
  const t = norm(text), q = norm(query);
  if (!q) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 90;
  if (words(t).some(w => w.startsWith(q)) || t.includes(` ${q}`)) return 75;
  if (t.includes(q)) return 60;
  if (q.length < 3) return 0;
  // A scattered subsequence ("rmvply" in "remove an ai player"), weaker with every gap.
  let i = 0, gaps = 0, last = -1;
  for (const ch of q) {
    const at = t.indexOf(ch, i);
    if (at < 0) return 0;
    if (last >= 0 && at > last + 1) gaps++;
    last = at; i = at + 1;
  }
  return Math.max(10, 40 - 4 * gaps);
}

/** A command's match for a query and the alias that matched, when the title did not. */
export function scoreCommand(command: Command, query: string): { score: number; alias?: string } {
  const q = norm(query);
  if (!q) return { score: 0 };
  const title = command.human.title, keywords = command.keywords ?? [];
  const best = (q1: string) => {
    const t = matchScore(title, q1);
    let k = 0, kw: string | undefined;
    for (const word of keywords) { const s = matchScore(word, q1) * 0.9; if (s > k) { k = s; kw = word; } }
    return t >= k ? { score: t } : { score: k, alias: kw };
  };
  const whole = best(q);
  if (whole.score > 0) return whole;
  // Word by word: every word must match the title, an alias or the tooltip.
  const tokens = q.split(" ");
  if (tokens.length < 2) return command.human.tooltip.toLowerCase().includes(q) ? { score: 25 } : { score: 0 };
  let total = 0;
  const aliases: string[] = [];
  for (const token of tokens) {
    const b = best(token);
    if (b.score > 0) { total += b.score; if (b.alias) aliases.push(token); continue; }
    if (command.human.tooltip.toLowerCase().includes(token)) { total += 25; continue; }
    return { score: 0 };
  }
  return { score: (total / tokens.length) * 0.85, ...(aliases.length ? { alias: aliases.join(" ") } : {}) };
}

export interface PaletteRow { command: Command; availability: Availability; alias?: string; score: number }
export interface PaletteSectionRows { section: PaletteSection; rows: PaletteRow[] }

export interface RowsOptions {
  query: string;
  /** Command ids for the Suggested group (the page's next step first). */
  suggested?: readonly string[];
  /** Recently run command ids, newest first. */
  recent?: readonly string[];
  /** ☰: every available command, grouped. */
  browse?: boolean;
  /** One section only (the Help page). */
  only?: PaletteSection;
  /** Rows made from the query itself ("Open room K7QX"). */
  dynamic?: (query: string, ctx: PaletteContext) => readonly Command[];
}

const visible = (a: Availability) => a.ok || !a.hidden;

function group(rows: PaletteRow[], sectionFor: (r: PaletteRow) => PaletteSection, order: readonly PaletteSection[]): PaletteSectionRows[] {
  const by = new Map<PaletteSection, PaletteRow[]>();
  for (const r of rows) { const s = sectionFor(r); by.set(s, [...(by.get(s) ?? []), r]); }
  return order.filter(s => by.has(s)).map(section => ({ section, rows: by.get(section)! }));
}

/** The palette's rows for a query, grouped into sections in display order. */
export function paletteRows(commands: readonly Command[], ctx: PaletteContext, opts: RowsOptions): PaletteSectionRows[] {
  const q = norm(opts.query);
  const suggested = opts.suggested ?? [], recent = opts.recent ?? [];
  const all = commands.map(command => ({ command, availability: command.available(ctx), score: 0 }) as PaletteRow);
  if (!q) {
    const ready = all.filter(r => r.availability.ok);
    if (opts.only) return group(ready.filter(r => sectionOf(r.command) === opts.only), () => opts.only!, [opts.only]);
    if (opts.browse) return group(ready, r => sectionOf(r.command), SECTION_ORDER);
    const byId = new Map(ready.map(r => [r.command.id, r]));
    const top: PaletteRow[] = [];
    for (const id of suggested) { const r = byId.get(id); if (r && top.length < EMPTY_CAPS.suggested && !top.includes(r)) top.push(r); }
    let recents = 0;
    for (const id of recent) {
      const r = byId.get(id);
      if (r && recents < 2 && top.length < EMPTY_CAPS.suggested && !top.includes(r)) { top.push(r); recents++; }
    }
    const taken = new Set(top.map(r => r.command.id));
    const scored = ready.filter(r => (r.command.defaultScore ?? 0) > 0 && !taken.has(r.command.id))
      .sort((a, b) => (b.command.defaultScore ?? 0) - (a.command.defaultScore ?? 0) || a.command.human.title.localeCompare(b.command.human.title));
    const help = scored.filter(r => sectionOf(r.command) === "help").slice(0, EMPTY_CAPS.help);
    let budget = EMPTY_VIEW_LIMIT - top.length - help.length;
    const rest: PaletteRow[] = [];
    const used: Partial<Record<PaletteSection, number>> = {};
    for (const r of scored) {
      const s = sectionOf(r.command);
      if (s === "help" || budget <= 0 || (used[s] ?? 0) >= EMPTY_CAPS[s]) continue;
      rest.push(r); used[s] = (used[s] ?? 0) + 1; budget--;
    }
    const sections = group([...rest, ...help], r => sectionOf(r.command), SECTION_ORDER);
    return top.length ? [{ section: "suggested", rows: top }, ...sections] : sections;
  }
  const dynamic = (opts.dynamic?.(opts.query.trim(), ctx) ?? []).map((command, i) => ({ command, availability: command.available(ctx), score: 200 - i }) as PaletteRow);
  const matched = all.map(r => {
    const m = scoreCommand(r.command, q);
    return { ...r, score: m.score + (m.score && suggested.includes(r.command.id) ? 10 : 0), ...(m.alias ? { alias: m.alias } : {}) };
  }).filter(r => r.score > 0);
  const rank = (r: PaletteRow) => recent.indexOf(r.command.id) < 0 ? Infinity : recent.indexOf(r.command.id);
  const rows = [...dynamic, ...matched].filter(r => visible(r.availability))
    .sort((a, b) => Number(b.availability.ok) - Number(a.availability.ok) || b.score - a.score
      || (b.command.defaultScore ?? 0) - (a.command.defaultScore ?? 0) || rank(a) - rank(b) || a.command.human.title.localeCompare(b.command.human.title))
    .slice(0, TYPED_LIMIT);
  // Sections in the order of their best row, so the top match is also the first row on screen.
  const order: PaletteSection[] = [];
  for (const r of rows) { const s = opts.only ?? sectionOf(r.command); if (!order.includes(s)) order.push(s); }
  return group(opts.only ? rows.filter(r => sectionOf(r.command) === opts.only) : rows, r => opts.only ?? sectionOf(r.command), order);
}
