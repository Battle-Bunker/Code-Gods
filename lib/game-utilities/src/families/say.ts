/**
 * The phrasebook (docs/rules-design.md §§2–3): how rule text names the parts of a Grid board. Every family's summary and
 * card comment name symbols, colours, suits and counts through it, so the words match the tiles exactly (it is built from
 * the same game-types component tables the board view draws with) and a sentence that cannot be true on this shape fails
 * to render (`RuleTextError`), which the exhaustive rules test (test/rules.test.ts) turns into a failing test.
 *
 *   symbol(s)   "the number A (10 in base 12)", "the number 7", "the card A♥ (Ace of Hearts)"
 *   tile(s)     "A (10)", "7", "A♥": the short form for lists
 *   rank(r)     cards: "any Ace (A♠, A♥, A♦ or A♣)"; digits: symbol(r)
 *   value(v)    the symbols worth v, resolved: digits symbol(v), cards rank(v − 1)
 *   valueKey()  "Here A counts 10 and B counts 11." ("" when every symbol is its own value, as on base 10)
 *   distinct(k) "all 3 colours", "4 different colours" (throws when the shape has fewer)
 */
import { COLOUR_COMPONENTS, SYMBOL_COMPONENTS, type GridColourSet, type GridSymbolSet } from "@workspace/game-types";

/** A rule sentence that cannot be true on this shape (a colour, symbol or count it does not have). */
export class RuleTextError extends Error {
  constructor(message: string) { super(message); this.name = "RuleTextError"; }
}

const SET_NAME: Readonly<Record<string, string>> = { base12: "base 12", base16: "hex" };
const CARD_RANK = ["Ace", "2", "3", "4", "5", "6", "7", "8", "9", "10", "Jack", "Queen", "King"] as const;
const SUIT_TITLE = ["Spades", "Hearts", "Diamonds", "Clubs"] as const;

/** "a, b and c" / "a, b or c". */
export function list(items: readonly string[], joiner: "and" | "or" = "and"): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} ${joiner} ${items[items.length - 1]}`;
}
/** "an orange", "a red", "an 8", "an A", "an 11". */
export function an(word: string): string {
  return (/^([aeiou]|8|11\b|18\b|A\b|A♠|A♥|A♦|A♣|F\b|E\b)/i.test(word) && !/^(one|uni|use)/i.test(word) ? "an " : "a ") + word;
}
export const points = (n: number) => `${n} point${n === 1 ? "" : "s"}`;
const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
/** "four", "12". */
export const count = (n: number) => NUMBER_WORDS[n] ?? String(n);

export interface Phrasebook {
  /** "card" or "number": what a tile shows. */
  readonly noun: string;
  readonly cards: boolean;
  symbol(s: number): string;
  tile(s: number): string;
  rank(r: number): string;
  /** A rank as a word for counting: "Aces", "7s", "As" (digits: the glyph). */
  rankPlural(r: number): string;
  value(v: number): string;
  /** The symbols worth v, short ("A (10)", "J, Q or K"), resolved. */
  valueTiles(v: number, joiner?: "and" | "or"): string;
  /** Short tiles for several values ("0, 1, B (11) and A (10)"; cards "9, 10 and J (any suit)"). */
  values(vs: readonly number[], joiner?: "and" | "or"): string;
  /** A sentence explaining symbol values for sums, or "". */
  valueKey(): string;
  colour(c: number): string;
  colours(cs: readonly number[], joiner?: "and" | "or"): string;
  readonly colourCount: number;
  /** "all 3 colours" (k = every colour) or "4 different colours"; throws if the shape has fewer than k. */
  distinctColours(k: number): string;
  suit(i: number): string;
  distinctSuits(k: number): string;
}

const books = new Map<string, Phrasebook>();

/** The phrasebook of one Grid shape (symbols × colours). */
export function phrasebook(symbols: string, colours: string): Phrasebook {
  const memo = `${symbols}|${colours}`;
  const found = books.get(memo);
  if (found) return found;
  const S = SYMBOL_COMPONENTS[symbols as GridSymbolSet], C = COLOUR_COMPONENTS[colours as GridColourSet];
  if (!S || !C) throw new RuleTextError(`unknown grid components ${symbols}, ${colours}`);
  const cards = !!S.suits;
  const setName = SET_NAME[symbols];
  const checkSym = (s: number) => {
    if (!Number.isInteger(s) || s < 0 || s >= S.count) throw new RuleTextError(`symbol ${s} is not in ${symbols}`);
  };
  const checkColour = (c: number) => {
    if (!Number.isInteger(c) || c < 0 || c >= C.count) throw new RuleTextError(`colour ${c} is not in ${colours}`);
  };
  const tile = (s: number) => {
    checkSym(s);
    const g = S.glyphs[s]!;
    return !cards && S.values[s]! >= 10 ? `${g} (${S.values[s]})` : g;
  };
  const symbol = (s: number) => {
    checkSym(s);
    if (cards) return `the card ${S.glyphs[s]} (${CARD_RANK[s % 13]} of ${SUIT_TITLE[Math.floor(s / 13)]})`;
    const v = S.values[s]!;
    return v >= 10 ? `the number ${S.glyphs[s]} (${v} in ${setName})` : `the number ${S.glyphs[s]}`;
  };
  const rank = (r: number) => {
    if (!cards) return symbol(r);
    if (!Number.isInteger(r) || r < 0 || r >= 13) throw new RuleTextError(`rank ${r} is not a card rank`);
    const word = CARD_RANK[r]!;
    return `any ${word} (${list(S.suitGlyphs!.map(g => S.glyphs[r]!.replace(/[♠♥♦♣]$/, "") + g), "or")})`;
  };
  const rankPlural = (r: number) => {
    if (!cards) { checkSym(r); return `${S.glyphs[r]}s`; }
    if (r < 0 || r >= 13) throw new RuleTextError(`rank ${r} is not a card rank`);
    return `${CARD_RANK[r]}s`;
  };
  const bySymbolValue = (v: number) => S.values.map((x, i) => [x, i] as const).filter(([x]) => x === v).map(([, i]) => i);
  const value = (v: number) => {
    const syms = bySymbolValue(v);
    if (!syms.length) throw new RuleTextError(`no symbol in ${symbols} is worth ${v}`);
    return cards ? rank(S.ranks[syms[0]!]!) : symbol(syms[0]!);
  };
  const shortRank = (v: number) => S.glyphs[bySymbolValue(v)[0]!]!.replace(/[♠♥♦♣]$/, "");
  const valueTiles = (v: number, joiner: "and" | "or" = "or") => {
    const syms = bySymbolValue(v);
    if (!syms.length) throw new RuleTextError(`no symbol in ${symbols} is worth ${v}`);
    return cards ? `${shortRank(v)} (any suit)` : list(syms.map(tile), joiner);
  };
  const values = (vs: readonly number[], joiner: "and" | "or" = "and") => {
    for (const v of vs) if (!bySymbolValue(v).length) throw new RuleTextError(`no symbol in ${symbols} is worth ${v}`);
    return cards ? `${list(vs.map(shortRank), joiner)} (any suit)` : list(vs.map(v => tile(bySymbolValue(v)[0]!)), joiner);
  };
  const valueKey = () => {
    if (cards) return "Here A counts 1, J counts 11, Q counts 12 and K counts 13.";
    const high = S.values.map((v, i) => [v, i] as const).filter(([v]) => v >= 10);
    if (!high.length) return "";
    return `Here ${list(high.map(([v, i]) => `${S.glyphs[i]} counts ${v}`))}.`;
  };
  const colour = (c: number) => { checkColour(c); return C.names[c]!; };
  const distinctColours = (k: number) => {
    if (k > C.count) throw new RuleTextError(`${k} different colours asked of ${colours}, which has ${C.count}`);
    return k === C.count ? `all ${C.count} colours` : `${k} different colours`;
  };
  const suit = (i: number) => {
    if (!cards) throw new RuleTextError(`suits asked of ${symbols}`);
    if (i < 0 || i >= S.suitNames!.length) throw new RuleTextError(`suit ${i} is not a suit`);
    return `${S.suitNames![i]} (${S.suitGlyphs![i]})`;
  };
  const distinctSuits = (k: number) => {
    if (!cards) throw new RuleTextError(`suits asked of ${symbols}`);
    const n = S.suitNames!.length;
    if (k > n) throw new RuleTextError(`${k} different suits asked of ${n}`);
    return k === n ? `all ${n} suits` : `${k} different suits`;
  };
  const book: Phrasebook = Object.freeze({
    noun: cards ? "card" : "number", cards, symbol, tile, rank, rankPlural, value, valueTiles, values, valueKey,
    colour, colours: (cs: readonly number[], joiner: "and" | "or" = "and") => list(cs.map(colour), joiner),
    colourCount: C.count, distinctColours, suit, distinctSuits,
  });
  books.set(memo, book);
  return book;
}

// ------------------------------------------------------------------------------------------------
// the lint (docs/rules-design.md §4.3): what every rendered rule text must pass
// ------------------------------------------------------------------------------------------------

const COLOUR_WORDS = ["red", "orange", "yellow", "green", "blue", "violet", "purple", "indigo", "pink"];
export const MAX_SENTENCE_WORDS = 32;

/** Problems with one rendered rule text on a Grid shape, as kid-readable messages ([] when it is clean). */
export function lintRuleText(text: string, symbols: string, colours: string): string[] {
  const out: string[] = [];
  const names = COLOUR_COMPONENTS[colours as GridColourSet]?.names ?? [];
  for (const w of COLOUR_WORDS) {
    if (new RegExp(`\\b${w}\\b`, "i").test(text) && !names.includes(w)) out.push(`names ${w}, which this room does not have`);
  }
  if (/\b(number|card|cells?|symbols?)\s+worth\s+\d+\b(?!\s*points?\b)/i.test(text)) out.push(`unresolved value reference: "${text.match(/\b(number|card|cells?|symbols?)\s+worth\s+\d+/i)![0]}"`);
  if (/\ba\s+[aeiou]/i.test(text.replace(/\ba\s+(uni|use|one)/gi, ""))) out.push(`article: "${text.match(/\ba\s+[aeiou]\w*/i)![0]}"`);
  if (/\b(spectral|adjacent|orthogonal|lexicographic)/i.test(text)) out.push(`jargon: ${text.match(/\b(spectral|adjacent|orthogonal|lexicographic)\w*/i)![0]}`);
  for (const sentence of text.split(/(?<=[.!?])\s+(?=[A-Z"(])/)) {
    const words = sentence.split(/\s+/).filter(Boolean).length;
    if (words > MAX_SENTENCE_WORDS) out.push(`sentence of ${words} words (at most ${MAX_SENTENCE_WORDS}): "${sentence.slice(0, 60)}…"`);
  }
  // Base 12 and hex: a number 10–15 named as a tile must come with its glyph ("A (10)"); a bare "10" is a sum.
  if (symbols === "base12" || symbols === "base16") {
    const bad = text.match(/\b(?:number|numbers|digit|showing|each|token is (?:a|an) \w+)\s+(1[0-5])\b/i);
    if (bad) out.push(`names ${bad[1]} as a tile without its glyph`);
  }
  return out;
}
