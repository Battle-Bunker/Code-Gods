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
export const SUMMON_ENERGY_PER_BIT = 1 / 4;

const HELPERS = ["look", "peek", "goal", "progress", "move", "price", "cheapest", "energy", "prime", "square", "near", "whole", "root", "factors", "better", "call", "agent", "offer"];
const OFFER = ["view", "element", "myRule", "my_rule", "myScore", "my_score", "quote", "budget", "params", "tieBreaker", "tie_breaker", "card", "layers", "level", "top", "main", "tiebreak", "score", "terms", "valid", "charge", "total", "reason", "m", "c"];
const JS_WORDS = [
  ...HELPERS, ...OFFER, "Q", "of", "from", "add", "sub", "mul", "div", "neg", "abs", "cmp", "eq", "isZero", "isInteger", "toNumber", "toString", "n", "d",
  "function", "return", "const", "let", "var", "if", "else", "for", "while", "of", "in", "break", "continue", "null", "undefined", "true", "false",
  "new", "typeof", "Math", "min", "max", "floor", "ceil", "round", "length", "push", "slice", "map", "filter", "sort", "Number", "BigInt", "String",
  "JSON", "Array", "Infinity",
  "=", "==", "===", "!=", "!==", "<", "<=", ">", ">=", "+", "-", "*", "/", "%", "**", "&&", "||", "!", "?", "??", "=>", "+=", "-=", "*=", "++", "--",
  ".", ",", "(", ")", "[", "]", ":", "...",
];
const PY_WORDS = [
  ...HELPERS, ...OFFER, "Fraction", "numerator", "denominator", "Undefined",
  "def", "return", "if", "elif", "else", "for", "while", "in", "not", "and", "or", "is", "None", "True", "False", "break", "continue", "lambda", "pass",
  "abs", "min", "max", "len", "range", "int", "str", "float", "list", "sorted", "sum", "round", "append", "key",
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

export function summonBits(language: Language, source: string): SummonPrice {
  const lang = language === "python" ? "py" : "js";
  const vocab = VOCAB[lang], free = FREE[lang];
  const wordBits = Math.log2(vocab.size);
  const named = new Set<string>();
  let bits = 0, tokens = 0, qDot = false;
  for (const [t] of source.matchAll(TOKEN[lang])) {
    if (qDot) { qDot = false; if (t === ".") continue; }
    if (lang === "js" && t === "Q") { qDot = true; continue; }   // Q.add is JavaScript's +
    if (/^\s/.test(t) || t.startsWith("//") && lang === "js" || t.startsWith("/*") || (t.startsWith("#") && lang === "py")) continue;
    if (free.has(t)) continue;
    tokens++;
    if (vocab.has(t)) { bits += wordBits; continue; }
    if (/^\d+n?$/.test(t)) { bits += 1 + intBits(BigInt(t.replace(/n$/, ""))); continue; }
    if (/^[\d.]/.test(t)) { bits += 1 + 4 * t.length; continue; }   // decimals, exponents, separators
    const key = /^["'`]/.test(t) ? `s:${t.slice(1, -1)}` : `n:${t}`;
    if (named.has(key)) bits += 1 + Math.log2(named.size);
    else { bits += 2 + 5 * (key.length - 2); named.add(key); }
  }
  return { bits, energy: bits * SUMMON_ENERGY_PER_BIT, tokens };
}
