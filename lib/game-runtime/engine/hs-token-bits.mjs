/**
 * hs-token-bits-v1-uniform: the Haskell summon price (complexityFunctionId), on the same principles as
 * ast-bits-v1 / ts-ast-bits-v1-uniform but over the TOKEN stream of the player's source (Haskell's layout
 * makes a full parser in the host a project of its own; MicroHs parses and type-checks the agent anyway).
 * Uniform and approximate, like the TypeScript price:
 *
 *  - every token first codes its kind, uniformly over 7: keyword, special/reserved operator, name,
 *    operator, number, string/char, line break (comments and spaces are free);
 *  - keyword and special tokens: log2 of their class size;
 *  - line breaks: the new line's indentation, Elias gamma(column + 1) (layout is structure in Haskell);
 *  - names and operators, alpha-equivalent: the first use of a name that is neither a standard Haskell
 *    name nor a room name binds a new slot (log2(#slots + 1) after the escape bit); a later use of a slot
 *    costs 1 + log2(#slots + 1); a standard or room name costs 1 - log2(½·u(standard) + ½·u(room));
 *  - literals: the universal codes of ts-ast-bits (Elias gamma, the 98-symbol string code with the room's
 *    string vocabulary at p = ½, the 18-symbol float code);
 *  - every use of a room move helper codes the move flag (p = 1/8).
 *
 * The grammar's signature line `agent :: Obj -> [Call]` is free (it is the same in every agent). Literal moves are
 * not recognised (always []): a Haskell move is coded like any other expression.
 */
import STANDARD from "./hs-standard-names.json" with { type: "json" };

const log2 = Math.log2;
const P_EXT = 0.5, Q_MOVE = 1 / 8, P_STRVOC = 0.5, KINDS = 7;
const KEYWORDS = ["case", "class", "data", "default", "deriving", "do", "else", "foreign", "if", "import", "in",
  "infix", "infixl", "infixr", "instance", "let", "module", "newtype", "of", "then", "type", "where", "qualified",
  "as", "hiding"];
const SPECIALS = ["(", ")", "[", "]", ",", ";", "`", "{", "}", "..", ":", "::", "=", "\\", "|", "<-", "->", "@", "~", "=>", "_"];
const SYMBOL = /[!#$%&*+./<=>?@\\^|~:-]/u;

/** Standard Haskell names an agent can use without defining them (Prelude, Data.List, Data.Char, ...). */
export const HS_STANDARD_NAMES = STANDARD;

function gamma(n) {
  if (!(n >= 1)) throw new Error("gamma code needs n >= 1");
  return 2 * (n.toString(2).length - 1) + 1;
}
function stringBits(s) {
  let b = gamma(s.length + 1);
  for (const ch of s) {
    const c = ch.codePointAt(0);
    b += log2(98);
    if (!((c >= 32 && c < 127) || ch === "\n" || ch === "\t")) b += gamma(c + 1);
  }
  return b;
}
const floatBits = text => gamma(text.length + 1) + text.length * log2(18);

/**
 * Haskell tokens: {kind, text, value?, column?}. Throws a SyntaxError-like Error on an unterminated string
 * or comment (MicroHs reports the real error; this only has to be total on what it accepts).
 */
export function tokenize(source) {
  const out = [];
  let i = 0, column = 0, lineStart = true;
  const n = source.length;
  while (i < n) {
    const c = source[i];
    if (c === "\n") { i++; lineStart = true; column = 0; continue; }
    if (c === " " || c === "\t" || c === "\r") { column += c === "\t" ? 8 - (column % 8) : 1; i++; continue; }
    if (source.startsWith("--", i) && !SYMBOL.test(source[i + 2] ?? "") || source.startsWith("---", i)) {
      while (i < n && source[i] !== "\n") i++;
      continue;
    }
    if (source.startsWith("{-", i)) {
      // Free, but it still moves the layout position: the next token's column, and any line break inside it.
      let depth = 1; i += 2; column += 2;
      while (i < n && depth) {
        if (source.startsWith("{-", i)) { depth++; i += 2; column += 2; }
        else if (source.startsWith("-}", i)) { depth--; i += 2; column += 2; }
        else if (source[i] === "\n") { i++; column = 0; lineStart = true; }
        else { i++; column++; }
      }
      if (depth) throw new Error("unterminated {- comment");
      continue;
    }
    if (lineStart) { out.push({ kind: "break", column }); lineStart = false; }
    const start = i;
    if (/[A-Za-z_]/u.test(c)) {
      // A qualified name A.B.c counts each part.
      while (i < n && /[\w']/u.test(source[i])) i++;
      const text = source.slice(start, i);
      out.push(KEYWORDS.includes(text) ? { kind: "keyword", text } : text === "_" ? { kind: "special", text } : { kind: "name", text });
    } else if (/[0-9]/u.test(c)) {
      const m = /^(0[xX][0-9a-fA-F_]+|0[oO][0-7_]+|0[bB][01_]+|[0-9][0-9_]*(\.[0-9]+)?([eE][+-]?[0-9]+)?)/u.exec(source.slice(i));
      i += m[0].length;
      const text = m[0].replace(/_/g, "");
      const isFloat = !/^0[xXoObB]/u.test(text) && /[.eE]/u.test(text);
      out.push({ kind: "number", text, isFloat, value: isFloat ? Number(text) : Number(BigInt(text)) });
    } else if (c === '"' || (c === "'" && /^'(\\[^']+|[^\\'])'/u.test(source.slice(i)))) {
      const quote = c;
      i++;
      let text = "";
      while (i < n && source[i] !== quote) {
        if (source[i] === "\n") throw new Error("unterminated string literal");
        if (source[i] === "\\") {
          const rest = source.slice(i + 1);
          const esc = /^(\d+|x[0-9a-fA-F]+|o[0-7]+|[abfnrtv\\"'&]|\^[A-Z@\[\\\]^_]|[A-Z]{2,3}|\s+\\)/u.exec(rest);
          if (!esc) throw new Error("bad escape in a string literal");
          const e = esc[0];
          text += e === "&" || /^\s/u.test(e) ? "" : /^\d/u.test(e) ? String.fromCodePoint(Number(e)) : e[0] === "x" ? String.fromCodePoint(parseInt(e.slice(1), 16))
            : e[0] === "o" ? String.fromCodePoint(parseInt(e.slice(1), 8)) : ({ n: "\n", t: "\t", r: "\r", a: "\x07", b: "\b", f: "\f", v: "\v" })[e] ?? e.slice(-1);
          i += 1 + e.length;
        } else { text += source[i]; i++; }
      }
      if (i >= n) throw new Error("unterminated string literal");
      i++;
      out.push({ kind: quote === '"' ? "string" : "char", text });
    } else if ("()[],;`{}".includes(c)) {
      i++;
      out.push({ kind: "special", text: c });
    } else if (SYMBOL.test(c)) {
      while (i < n && SYMBOL.test(source[i])) i++;
      const text = source.slice(start, i);
      out.push(SPECIALS.includes(text) ? { kind: "special", text } : { kind: "operator", text });
    } else {
      i++;
      out.push({ kind: "operator", text: c });
    }
    column += i - start;
  }
  return out;
}

/** Room names a Room module defines, and which of them are move helpers. */
export function roomVocabulary(roomText) {
  const api = new Set(), mutators = new Set();
  for (const m of roomText.matchAll(/^([a-z][\w']*)\s*::/gmu)) if (!m[1].startsWith("cg")) api.add(m[1]);
  for (const m of roomText.matchAll(/^([a-z][\w']*)\b[^=\n]*= Call "/gmu)) mutators.add(m[1]);
  for (const m of roomText.matchAll(/^(?:data|newtype|type) ([A-Z]\w*)/gmu)) api.add(m[1]);
  for (const m of roomText.matchAll(/^\s*[{,] ([a-z]\w*) ::/gmu)) api.add(m[1]);   // record fields
  return { api: [...api].sort(), mutators };
}

/**
 * {parts, astBytes} of a Haskell agent's source. `room` is the Room module text; `strings` the room's
 * meaningful strings (the TypeScript pricing vocabulary's).
 */
/** The grammar's own signature line: required boilerplate, so it carries no description bits. */
const AGENT_SIGNATURE = /^agent[ \t]*::[ \t]*Obj[ \t]*->[ \t]*\[[ \t]*Call[ \t]*\][ \t]*(?:--[^\n]*)?$/mu;

export function hsTokenBits(source, room, strings) {
  const tokens = tokenize(source.replace(AGENT_SIGNATURE, ""));
  const { api, mutators } = roomVocabulary(room);
  const apiSet = new Set(api), standard = new Set(HS_STANDARD_NAMES);
  const pExt = name => 0.5 * (standard.has(name) ? 1 / standard.size : 0) + 0.5 * (apiSet.has(name) ? 1 / Math.max(1, apiSet.size) : 0);
  const vocab = new Set(strings);
  const bits = { structure: 0, names: 0, literals: 0, moveFlags: 0 };
  const slots = [];
  let astBytes = 0;
  for (const t of tokens) {
    bits.structure += log2(KINDS);
    astBytes += 1;
    switch (t.kind) {
      case "break": bits.structure += gamma(t.column + 1); break;
      case "keyword": bits.structure += log2(KEYWORDS.length); break;
      case "special": bits.structure += log2(SPECIALS.length); break;
      case "name": case "operator": {
        const p = pExt(t.text);
        if (p > 0 && !slots.includes(t.text)) bits.names += -log2(P_EXT * p);
        else if (slots.includes(t.text)) bits.names += -log2((1 - P_EXT) / (slots.length + 1));
        else { bits.names += -log2(1 - P_EXT) + log2(slots.length + 1); slots.push(t.text); }
        if (mutators.has(t.text) || mutators.has(t.text.replace(/'$/u, ""))) bits.moveFlags += -log2(Q_MOVE);
        break;
      }
      case "number": {
        const v = t.value;
        const whole = !t.isFloat && Number.isSafeInteger(v) && v >= 0;
        bits.literals += whole ? gamma(v + 1) : floatBits(t.isFloat ? t.text : String(v));
        astBytes += Math.max(1, Math.ceil((whole ? v.toString(2).length + 1 : 64) / 8));
        break;
      }
      case "string": case "char":
        bits.literals += vocab.has(t.text) ? -log2(P_STRVOC / vocab.size) : -log2(1 - P_STRVOC) + stringBits(t.text);
        astBytes += Buffer.byteLength(t.text, "utf8");
        break;
    }
  }
  return { parts: bits, astBytes };
}
