/**
 * The summon price: what it costs, in energy, to start an agent with a program (spec §6.1; integration plan §1.3).
 * It is the program's description length in bits, a code over its tokens that is the same for both languages:
 *
 *  - Comments, blank space and the tokens that only lay code out are free (brackets of calls, commas, TypeScript
 *    `{ } ;` and `const`/`let`, Python `:` and indentation), so explaining code in plain words costs nothing and
 *    neither language pays for its punctuation. `Q.add(a, b)` costs what `a + b` does in Python: the `Q.` is free.
 *  - A word from the language's vocabulary (its keywords, operators, built-ins and the guest API: look, move, Q, …)
 *    costs log2 of the vocabulary's size.
 *  - A name of the agent's own, or a string, costs its spelling the first time (2 bits plus 5 bits a character) and
 *    1 + log2(the names spelled so far) after: naming things once is the expensive part, reusing them is cheap.
 *  - A number costs its integer code (spec §2.3) plus a bit; a decimal 4 bits a character. Strings, triple-quoted
 *    ones included, cost like names: only comments are free.
 *
 * This replaces game-runtime's AST-bits prices (a 5,600-line grammar table and a guest-side Python parser) with
 * something both languages compute on the host the same way. The economy may scale it (`SUMMON_ENERGY_PER_BIT`).
 */
import { intBits } from "@workspace/v2-core";
import type { Language } from "@workspace/v2-sandbox";

/** Energy per bit of program (an economy constant; v2-economy may own it). */
export const SUMMON_ENERGY_PER_BIT = 1 / 6;

const HELPERS = ["look", "peek", "goal", "progress", "move", "price", "cheapest", "energy", "prime", "square", "near", "whole", "root", "factors", "better", "call", "agent", "offer",
  "worth", "rarity", "recent", "pushback", "note", "contested", "mine", "others", "points"];
const OFFER = ["object", "view", "element", "myRule", "my_rule", "myScore", "my_score", "quote", "budget", "params", "tieBreaker", "tie_breaker", "card", "layers", "level", "top", "main", "tiebreak", "score", "terms", "valid", "charge", "total", "reason", "m", "c"];
const JS_WORDS = [
  ...HELPERS, ...OFFER, "Q", "of", "from", "add", "sub", "mul", "div", "neg", "abs", "cmp", "eq", "isZero", "isInteger", "toNumber", "toString", "n", "d",
  "function", "return", "const", "let", "var", "if", "else", "for", "while", "of", "in", "break", "continue", "null", "undefined", "true", "false",
  "new", "typeof", "Math", "min", "max", "floor", "ceil", "round", "length", "push", "slice", "map", "filter", "sort", "Number", "BigInt", "String",
  "every", "some", "includes", "reduce", "Object", "keys",
  "JSON", "Array", "Infinity",
  "=", "==", "===", "!=", "!==", "<", "<=", ">", ">=", "+", "-", "*", "/", "%", "**", "&&", "||", "!", "?", "??", "=>", "+=", "-=", "*=", "++", "--",
  ".", ",", "(", ")", "[", "]", ":", "...",
];
const PY_WORDS = [
  ...HELPERS, ...OFFER, "Fraction", "numerator", "denominator", "Undefined",
  "def", "return", "if", "elif", "else", "for", "while", "in", "not", "and", "or", "is", "None", "True", "False", "break", "continue", "lambda", "pass",
  "abs", "min", "max", "len", "range", "int", "str", "float", "list", "sorted", "sum", "round", "append", "key", "all", "any", "count", "keys",
  "=", "==", "!=", "<", "<=", ">", ">=", "+", "-", "*", "/", "//", "%", "**", "+=", "-=", "*=",
  ".", ",", "(", ")", "[", "]",
];
const VOCAB = { js: new Set(JS_WORDS), py: new Set(PY_WORDS) };
// Layout and grammar the other language does without: braces, semicolons, declarations, call brackets and commas.
const FREE = { js: new Set(["{", "}", ";", "(", ")", ",", "const", "let", "var"]), py: new Set([":", "(", ")", ","]) };

const TOKEN = {
  js: /\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`|\d[\d_]*(?:\.[\d_]*)?(?:[eE][+-]?\d+)?n?|\.\d+|[A-Za-z_$][\w$]*|===|!==|\*\*|&&|\|\||\?\?|=>|\.\.\.|[=!<>+\-*/%]=|\+\+|--|[^\s]/g,
  py: /\s+|#[^\n]*|"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|\d[\d_]*(?:\.[\d_]*)?(?:[eE][+-]?\d+)?[jJ]?|\.\d+|[A-Za-z_]\w*|\/\/|\*\*|[=!<>+\-*/%]=|[^\s]/g,
};

export interface SummonPrice {
  /** The program's description length. */
  readonly bits: number;
  /** In energy: bits × SUMMON_ENERGY_PER_BIT. */
  readonly energy: number;
  readonly tokens: number;
}

interface Priced { readonly key: string; readonly bits: number }

/**
 * The program's priced tokens in order (free tokens dropped), each with the bits the code above gives it. `known`
 * names count as already spelled (an edit reuses the old program's names).
 */
function priced(language: Language, source: string, known: ReadonlySet<string> = new Set()): { tokens: Priced[]; names: Set<string> } {
  const lang = language === "python" ? "py" : "js";
  const vocab = VOCAB[lang], free = FREE[lang];
  const wordBits = Math.log2(vocab.size);
  const named = new Set<string>(known);
  const tokens: Priced[] = [];
  let qDot = false;
  for (const [t] of source.matchAll(TOKEN[lang])) {
    if (qDot) { qDot = false; if (t === ".") continue; }
    if (lang === "js" && t === "Q") { qDot = true; continue; }   // Q.add is JavaScript's +
    if (/^\s/.test(t) || t.startsWith("//") && lang === "js" || t.startsWith("/*") || (t.startsWith("#") && lang === "py")) continue;
    if (free.has(t)) continue;
    if (vocab.has(t)) { tokens.push({ key: `w:${t}`, bits: wordBits }); continue; }
    if (/^\d+n?$/.test(t)) { tokens.push({ key: `i:${t.replace(/n$/, "")}`, bits: 1 + intBits(BigInt(t.replace(/n$/, ""))) }); continue; }
    if (/^[\d.]/.test(t)) { tokens.push({ key: `d:${t}`, bits: 1 + 4 * t.length }); continue; }   // decimals, exponents, separators
    const key = /^["'`]/.test(t) ? `s:${t.slice(1, -1)}` : `n:${t}`;
    if (named.has(key)) tokens.push({ key, bits: 1 + Math.log2(named.size) });
    else { tokens.push({ key, bits: 2 + 5 * (key.length - 2) }); named.add(key); }
  }
  return { tokens, names: named };
}

export function summonBits(language: Language, source: string): SummonPrice {
  const { tokens } = priced(language, source);
  const bits = tokens.reduce((t, x) => t + x.bits, 0);
  return { bits, energy: bits * SUMMON_ENERGY_PER_BIT, tokens: tokens.length };
}

/**
 * The edit price (owner decision 21): what replacing an agent's program costs is the description length of the change,
 * at the summon rate. The change is the shortest token-level edit script from the old program's priced tokens to the
 * new one's (a longest common subsequence; comments and layout are not tokens, so changing them is free). The script
 * is its number of hunks, then per hunk where it starts in the old program (log2 of the old length + 1), how many old
 * tokens it deletes and how many it inserts (integer codes, spec §2.3), and the inserted tokens at their summon bits,
 * with the old program's names counted as already spelled. Zero for an identical program; never more than the new
 * program's full price (sending it whole is always an option). The common start and end are trimmed first; a middle too
big to diff within EDIT_TABLE_LIMIT cells is priced as a new program.
 */
export function editBits(language: Language, oldSource: string, newSource: string): SummonPrice {
  const was = priced(language, oldSource);
  const old = was.tokens;
  const fresh = priced(language, newSource, was.names).tokens;
  const full = summonBits(language, newSource);
  const price = (bits: number): SummonPrice => ({ bits, energy: bits * SUMMON_ENERGY_PER_BIT, tokens: fresh.length });
  // The common start and end are kept as they are (they cost nothing), so the table below covers only the middle.
  let head = 0, tail = 0;
  while (head < old.length && head < fresh.length && old[head]!.key === fresh[head]!.key) head++;
  while (tail < old.length - head && tail < fresh.length - head && old[old.length - 1 - tail]!.key === fresh[fresh.length - 1 - tail]!.key) tail++;
  const a = old.slice(head, old.length - tail).map(t => t.key), b = fresh.slice(head, fresh.length - tail).map(t => t.key);
  const ins_ = fresh.slice(head, fresh.length - tail), n = a.length, m = b.length;
  if (n === 0 && m === 0) return price(0);
  // A rewrite too large to diff in bounded memory is priced as what it is: a new program.
  if ((n + 1) * (m + 1) > EDIT_TABLE_LIMIT) return price(full.bits);
  // LCS lengths from the ends: L[i][j] for a[i..], b[j..].
  const width = m + 1, L = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    L[i * width + j] = a[i] === b[j] ? L[(i + 1) * width + j + 1]! + 1 : Math.max(L[(i + 1) * width + j]!, L[i * width + j + 1]!);
  }
  const where = Math.log2(old.length + 1);
  let bits = 0, hunks = 0, i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { i++; j++; continue; }
    let del = 0, ins = 0, insBits = 0;
    while ((i < n || j < m) && !(i < n && j < m && a[i] === b[j])) {
      if (j < m && (i === n || L[i * width + j + 1]! >= L[(i + 1) * width + j]!)) { insBits += ins_[j]!.bits; ins++; j++; }
      else { del++; i++; }
    }
    hunks++;
    bits += where + intBits(BigInt(del)) + intBits(BigInt(ins)) + insBits;
  }
  if (hunks) bits += intBits(BigInt(hunks));
  return price(Math.min(bits, full.bits));
}

/** Cells of the edit table at most (about 16 MB): any edit of the shipped agents fits many times over. */
export const EDIT_TABLE_LIMIT = 4_000_000;
