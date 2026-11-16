/**
 * The rule gallery's pure part (integration plan §1.1; unit-tested): pages generated from the v2 rule families of each
 * object type the app draws (lines: lib/v2-linear; grids: lib/v2-grid) and the deployed presets, with no server. The gallery lists the families a board deals,
 * the beginner pool first; a family's page offers its dealable parameters and tie-breakers, and its card, worked
 * example and value follow the choice. The choice lives in the URL (`?board=&params=&tb=`), so a link opens the same
 * rule again; anything unknown in it falls back to the first choice.
 */
import { representation, tieBreakersOn, type ObjectType, type RuleFamily, type Variant } from "@workspace/v2-core";
import { beginnerFamilies } from "@workspace/v2-linear";
import { beginnerGridFamilies, grid4 } from "@workspace/v2-grid";
import { objectTypeOf, variantOf as variantById } from "../../sdk/object-types.ts";
import { PRESETS } from "@workspace/engine/convex/v2/presets.ts";
import type { GameRule } from "../../sdk/rule.ts";

export const BOARDS: readonly { id: string; title: string; blurb: string }[] = [
  { id: "line-q", title: "Fraction lines", blurb: "One line per object; numbers may be fractions." },
  { id: "line-z", title: "Whole-number lines", blurb: "One line per object, y = mx + c with whole numbers (easier)." },
  { id: "line-z4", title: "Four lines", blurb: "Four whole-number lines per object, each scored." },
  { id: grid4.id, title: "Grids", blurb: "A 4 × 4 grid of digits per object." },
];
const DEFAULT_BOARD = BOARDS[0]!.id;

type Family = RuleFamily<any, unknown>;
const variantOf = (id: string): Variant => variantById(id);
const typeOf = (v: Variant): ObjectType<any> => objectTypeOf(v.id);
/** The curators' beginner pools, of every type. */
const BEGINNER = new Set<string>([...beginnerFamilies, ...beginnerGridFamilies(4)].map(f => f.id));

export interface GalleryEntry {
  id: string;
  title: string;
  /** The main part's sentence, for the family's first dealable parameters. */
  sentence: string;
  /** How many parameter sets the board deals. */
  choices: number;
  tieBreakers: number;
  /** The presets that deal this family on this board, by title. */
  presets: string[];
}

function entry(f: Family, v: Variant): GalleryEntry {
  const ps = f.dealable(v);
  return {
    id: f.id, title: f.title, sentence: f.main.sentence(ps[0]), choices: ps.length, tieBreakers: tieBreakersOn(f, v).length,
    presets: PRESETS.filter(p => p.variant === v.id && p.families.includes(f.id)).map(p => p.title),
  };
}

/** The families the board deals: the curator's beginner pool, then the rest. */
export function galleryFamilies(boardId: string): { beginner: GalleryEntry[]; more: GalleryEntry[] } {
  const v = variantOf(BOARDS.some(b => b.id === boardId) ? boardId : DEFAULT_BOARD);
  const dealt = (typeOf(v).families as readonly Family[]).filter(f => f.dealable(v).length > 0);
  return {
    beginner: dealt.filter(f => BEGINNER.has(f.id)).map(f => entry(f, v)),
    more: dealt.filter(f => !BEGINNER.has(f.id)).map(f => entry(f, v)),
  };
}

export interface GallerySetup {
  board: string;
  /** Index into the family's dealable parameter sets on the board. */
  params: number;
  /** The tie-breaker's id; null for the family's first. */
  tb: string | null;
}

export function setupFromSearch(search: string): GallerySetup {
  const q = new URLSearchParams(search);
  const board = q.get("board") ?? DEFAULT_BOARD;
  const n = Number(q.get("params") ?? 0);
  return { board: BOARDS.some(b => b.id === board) ? board : DEFAULT_BOARD, params: Number.isSafeInteger(n) && n >= 0 ? n : 0, tb: q.get("tb") || null };
}

/** The query string of a choice ("" for the defaults). */
export function gallerySearch(s: GallerySetup): string {
  const q = new URLSearchParams();
  if (s.board !== DEFAULT_BOARD) q.set("board", s.board);
  if (s.params) q.set("params", String(s.params));
  if (s.tb) q.set("tb", s.tb);
  return q.size ? `?${q}` : "";
}

const paramLabel = (p: unknown): string => {
  const entries = Object.entries((p ?? {}) as Record<string, unknown>);
  return entries.length ? entries.map(([k, x]) => `${k} = ${String(x)}`).join(", ") : "Nothing to choose: this rule has no numbers of its own.";
};

export interface FamilyPage {
  family: Family;
  /** The setup as used (unknown values replaced by the first choice). */
  setup: GallerySetup;
  params: { index: number; label: string }[];
  tieBreakers: { id: string; title: string; sentence: string }[];
  main: { title: string; sentence: string };
  rule: GameRule;
  card: string;
  /** The representations the rule reads, by their short titles. */
  reads: string[];
  presets: string[];
}

/** One family's page on the setup's board, or null when the board deals no such family. */
export function familyPage(familyId: string, setup: GallerySetup): FamilyPage | null {
  const v = variantOf(setup.board), type = typeOf(v);
  const f = (type.families as readonly Family[]).find(x => x.id === familyId);
  const dealable = f?.dealable(v) ?? [];
  if (!f || !dealable.length) return null;
  const index = setup.params < dealable.length ? setup.params : 0;
  const params = dealable[index];
  const tbs = tieBreakersOn(f, v);
  const tb = tbs.find(t => t.id === setup.tb)?.id ?? tbs[0]?.id ?? null;
  return {
    family: f,
    setup: { board: v.id, params: index, tb: setup.tb && tb === setup.tb ? tb : null },
    params: dealable.map((p, i) => ({ index: i, label: paramLabel(p) })),
    tieBreakers: tbs.map(t => ({ id: t.id, title: t.title, sentence: t.sentence(params).replace(/^(Tie-breaker|Secondary|Third|Then):\s*/, "") })),
    main: { title: f.main.title, sentence: f.main.sentence(params) },
    rule: { type, family: f, params, variant: v, tieBreaker: tb },
    card: f.card(params, tb),
    reads: f.depends.map(r => representation(type, r).title.split(":")[0]!.trim()),
    presets: entry(f, v).presets,
  };
}
