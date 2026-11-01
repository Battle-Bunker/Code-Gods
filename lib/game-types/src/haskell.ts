/**
 * The Haskell room module (haskell-agent-v1): one generated module `Room` per instantiation, imported by
 * every Haskell agent (lib/game-runtime engine/haskell.mjs compiles it with MicroHs).
 *
 * A Haskell agent is `agent :: Obj -> [Call]`. A `Call` is a constructor name and its arguments as JSON
 * (`J`); the host turns each one into the room's wire call by running the SAME trusted JavaScript
 * constructor a TypeScript agent calls (`add(3)` -> `{__m: "add", k: 3}`), so validation, defaults and the
 * wire format are shared with TypeScript by construction. The Haskell constructors are generated from the
 * mutators' TypeScript declarations (`declare function slide(line: LineRef, steps?: number): MutatorCall`):
 *
 *   slide  :: AreaLike l => l -> Call                   -- the required parameters, defaults for the rest
 *   slide' :: AreaLike l => l -> Int -> String -> Call  -- every parameter
 *
 * The program's output (written by the engine's Main) is ASCII JSON: `[["slide",[{"__hs":"row","args":[2]}]]]`,
 * or `{"commit":"if-improves","calls":[...]}` from `onlyIfBetter`. `{"__hs": name, "args": [...]}` is a deferred
 * call of an area helper (`row 2`), evaluated by the host with the room's JavaScript helper of that name.
 */
import type { HelperDoc, Instantiation, MutatorDef } from "./types.ts";

/** Haskell 2010 Prelude names (a room name equal to one hides the Prelude's in Room and in the agent). */
export const HS_PRELUDE_NAMES: readonly string[] = Object.freeze(`
abs acos acosh all and any appendFile asTypeOf asin asinh atan atan2 atanh break ceiling compare concat concatMap
const cos cosh curry cycle decodeFloat div divMod drop dropWhile either elem encodeFloat enumFrom enumFromThen
enumFromThenTo enumFromTo error errorWithoutStackTrace even exp exponent fail filter flip floatDigits floatRadix
floatRange floor fmap foldMap foldl foldl1 foldr foldr1 fromEnum fromInteger fromIntegral fromRational fst gcd
getChar getContents getLine head id init interact ioError isDenormalized isIEEE isInfinite isNaN isNegativeZero
iterate last lcm length lex lines log logBase lookup map mapM mapM_ mappend max maxBound maximum maybe mconcat
mempty min minBound minimum mod negate not notElem null odd or otherwise pi pred print product properFraction
pure putChar putStr putStrLn quot quotRem read readFile readIO readList readLn readParen reads readsPrec realToFrac
recip rem repeat replicate return reverse round scaleFloat scanl scanl1 scanr scanr1 seq sequence sequenceA
sequence_ show showChar showList showParen showString shows showsPrec significand signum sin sinh snd span
splitAt sqrt subtract succ sum tail take takeWhile tan tanh toEnum toInteger toRational traverse truncate uncurry
undefined unlines until unwords unzip unzip3 userError words writeFile zip zip3 zipWith zipWith3`.trim().split(/\s+/));

const HS_KEYWORDS = new Set(["case", "class", "data", "default", "deriving", "do", "else", "foreign", "if", "import",
  "in", "infix", "infixl", "infixr", "instance", "let", "module", "newtype", "of", "then", "type", "where", "forall"]);

/** JSON values, the conversion class, calls and the encoder: the fixed part of every Room module. */
export const HS_SUPPORT = `
-- | A JSON value: a constructor's argument.
data J = JNum Integer | JStr String | JBool Bool | JNull | JArr [J] | JObj [(String, J)] | JCall String [J]

-- | Values that can be a constructor's argument.
class ToJ a where
  toJ :: a -> J
  toJList :: [a] -> J
  toJList xs = JArr (P.map toJ xs)
instance ToJ J where toJ x = x
instance ToJ Int where toJ n = JNum (P.toInteger n)
instance ToJ Integer where toJ = JNum
instance ToJ Bool where toJ = JBool
instance ToJ Char where
  toJ c = JStr [c]
  toJList = JStr
instance ToJ a => ToJ [a] where toJ = toJList
instance ToJ a => ToJ (Maybe a) where toJ = P.maybe JNull toJ
instance (ToJ a, ToJ b) => ToJ (a, b) where toJ (a, b) = JArr [toJ a, toJ b]

-- | One move: what a move helper returns. Return a list of them from agent.
data Call = Call String [J] | IfImproves [Call]

cgJson :: J -> String
cgJson (JNum n) = P.show n
cgJson (JStr s) = cgString s
cgJson (JBool b) = if b then "true" else "false"
cgJson JNull = "null"
cgJson (JArr xs) = "[" P.++ cgCommas (P.map cgJson xs) P.++ "]"
cgJson (JObj kvs) = "{" P.++ cgCommas [cgString k P.++ ":" P.++ cgJson v | (k, v) <- kvs] P.++ "}"
cgJson (JCall f xs) = "{\\"__hs\\":" P.++ cgString f P.++ ",\\"args\\":" P.++ cgJson (JArr xs) P.++ "}"

cgCommas :: [String] -> String
cgCommas [] = ""
cgCommas (x : xs) = x P.++ P.concatMap (',' :) xs

cgString :: String -> String
cgString s = '"' : P.foldr cgChar "\\"" s

cgChar :: Char -> String -> String
cgChar c rest
  | c P.== '"' = '\\\\' : '"' : rest
  | c P.== '\\\\' = '\\\\' : '\\\\' : rest
  | n P.>= 32 P.&& n P.< 127 = c : rest
  | n P.< 65536 = cgU n rest
  | P.otherwise = cgU (55296 P.+ (m \`P.div\` 1024)) (cgU (56320 P.+ (m \`P.mod\` 1024)) rest)
  where
    n = P.fromEnum c
    m = n P.- 65536

cgU :: Int -> String -> String
cgU n rest = '\\\\' : 'u' : [cgHex (n \`P.div\` 4096), cgHex (n \`P.div\` 256 \`P.mod\` 16), cgHex (n \`P.div\` 16 \`P.mod\` 16), cgHex (n \`P.mod\` 16)] P.++ rest

cgHex :: Int -> Char
cgHex d = "0123456789abcdef" P.!! d

cgCall :: Call -> String
cgCall (Call f xs) = "[" P.++ cgString f P.++ "," P.++ cgJson (JArr xs) P.++ "]"
cgCall (IfImproves _) = P.error "onlyIfBetter must wrap all of your moves, not sit inside a list of them"

-- | The program's output: the moves as JSON for the host.
cgEncode :: [Call] -> String
cgEncode [IfImproves cs] = "{\\"commit\\":\\"if-improves\\",\\"calls\\":[" P.++ cgCommas (P.map cgCall cs) P.++ "]}"
cgEncode cs = "[" P.++ cgCommas (P.map cgCall cs) P.++ "]"
`;

export const HS_COMMIT_CLAUSE = `
-- | Make these moves only if they raise your own points on this object; otherwise nothing happens.
onlyIfBetter :: [Call] -> [Call]
onlyIfBetter cs = [IfImproves cs]
`;

export interface DtsParam { readonly name: string; readonly type: string; readonly optional: boolean }
export interface DtsFunction { readonly name: string; readonly params: readonly DtsParam[]; readonly returns: string }

/** Splits on commas outside brackets. */
function splitTop(text: string, sep = ","): string[] {
  const out: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if ("([{<".includes(c)) depth++;
    else if (")]}>".includes(c)) depth--;
    else if (c === sep && depth === 0) { out.push(text.slice(start, i)); start = i + 1; }
  }
  const last = text.slice(start);
  if (last.trim()) out.push(last);
  return out.map(s => s.trim());
}

/** `declare function name(params): Returns;` declarations in TypeScript declaration text. */
export function parseDtsFunctions(dts: string): DtsFunction[] {
  const out: DtsFunction[] = [];
  for (const m of dts.matchAll(/^declare function (\w+)\((.*)\): ([^;]+);$/gm)) {
    const params = splitTop(m[2]).map(p => {
      const pm = /^(\w+)(\?)?\s*:\s*(.+)$/.exec(p.replace(/\s*=.*$/, ""));
      if (!pm) throw new Error(`Unsupported parameter in ${m[1]}: ${p}`);
      return { name: pm[1], optional: !!pm[2], type: pm[3].trim() };
    });
    out.push({ name: m[1], params, returns: m[3].trim() });
  }
  return out;
}

interface HsParam { readonly type: string; readonly conv: string; readonly constraint?: string }
/** The Haskell parameter type of a TypeScript parameter type; `v` names its type variable. */
function hsParam(type: string, v: string): HsParam {
  const parts = splitTop(type, "|").filter(t => t !== "null" && t !== "undefined");
  const kinds = new Set(parts.map(t => {
    if (t === "number" || /^-?\d+$/.test(t)) return "int";
    if (t === "string" || /^"[^"]*"$/.test(t) || ["Colour", "Suit", "Layer", "Turn"].includes(t)) return "string";
    if (t === "boolean") return "bool";
    if (t === "CellRef") return "cell";
    if (t === "Area" || t === "LineRef" || t === "AreaRef") return "area";
    return `?${t}`;
  }));
  const [only] = kinds;
  if (kinds.size === 1 && only === "int") return { type: "Int", conv: "toJ" };
  if (kinds.size === 1 && only === "string") return { type: "String", conv: "toJ" };
  if (kinds.size === 1 && only === "bool") return { type: "Bool", conv: "toJ" };
  if (kinds.size === 1 && only === "cell") return { type: v, conv: "cellJ", constraint: `CellRef ${v}` };
  if (kinds.size === 1 && only === "area") return { type: v, conv: "areaJ", constraint: `AreaLike ${v}` };
  if ([...kinds].every(k => k === "int" || k === "string")) return { type: v, conv: "toJ", constraint: `ToJ ${v}` };
  throw new Error(`No Haskell type for the TypeScript type ${type}`);
}

const hsName = (name: string) => (HS_KEYWORDS.has(name) ? `${name}_` : name);

interface HsFunction { readonly name: string; readonly signatures: readonly string[]; readonly text: string }
/** Haskell definitions of the functions in `dts` that return `returns`: their signatures and their code. */
function hsFunctions(dts: string, returns: "MutatorCall" | "AreaRef", seen = new Set<string>()): HsFunction[] {
  const out: HsFunction[] = [];
  for (const f of parseDtsFunctions(dts)) {
    if (f.returns !== returns || seen.has(f.name)) continue;
    seen.add(f.name);
    const result = returns === "MutatorCall" ? "Call" : "Area";
    const build = (params: readonly DtsParam[], name: string) => {
      const typed = params.map((p, i) => ({ p, h: hsParam(p.type, String.fromCharCode(97 + i)) }));
      const constraints = typed.flatMap(({ h }) => (h.constraint ? [h.constraint] : []));
      const context = constraints.length ? `${constraints.length > 1 ? `(${constraints.join(", ")})` : constraints[0]} => ` : "";
      const args = typed.map(({ p }) => hsName(p.name));
      const body = `[${typed.map(({ p, h }) => `${h.conv} ${hsName(p.name)}`).join(", ")}]`;
      const value = returns === "MutatorCall" ? `Call ${JSON.stringify(f.name)} ${body}` : `Area (JCall ${JSON.stringify(f.name)} ${body})`;
      const signature = `${name} :: ${context}${[...typed.map(({ h }) => h.type), result].join(" -> ")}`;
      return { signature, text: `${signature}\n${[name, ...args].join(" ")} = ${value}\n` };
    };
    const required = f.params.filter(p => !p.optional);
    if (f.params.slice(0, required.length).some(p => p.optional)) throw new Error(`${f.name}: optional parameters must come last`);
    const variants = [build(required, f.name), ...(required.length < f.params.length ? [build(f.params, `${f.name}'`)] : [])];
    out.push({ name: f.name, signatures: variants.map(v => v.signature), text: variants.map(v => v.text).join("\n") });
  }
  return out;
}

/** Haskell definitions of the functions in `dts` that return `returns` ("MutatorCall" or "AreaRef"). */
export function hsConstructors(dts: string, returns: "MutatorCall" | "AreaRef", seen = new Set<string>()): string {
  return hsFunctions(dts, returns, seen).map(f => f.text).join("\n");
}

/** Read helpers by TypeScript name: their Haskell name and signature (the Room module's own). */
const HS_READ_HELPERS: Readonly<Record<string, readonly [string, string]>> = {
  LOWEST: ["lowest", "lowest :: Int"],
  HIGHEST: ["highest", "highest :: Int"],
  digits: ["digits", "digits :: Int -> [Int]"],
  fromDigits: ["fromDigits", "fromDigits :: [Int] -> Int"],
  MAX_LENGTH: ["maxLength", "maxLength :: Int"],
  "grid.size": ["gridSize", "gridSize :: Int"],
  "grid.cells": ["cells", "cells :: Grid -> [Cell]"],
  "grid.rows": ["rows", "rows :: Grid -> [[Cell]]"],
  "grid.columns": ["columns", "columns :: Grid -> [[Cell]]"],
  "grid.diagonals": ["diagonals", "diagonals :: Grid -> [[Cell]]"],
  "grid.edgeCells": ["edgeCells", "edgeCells :: Grid -> [Cell]"],
  "grid.cell": ["cell", "cell :: Grid -> Int -> Int -> Cell"],
  "grid.palette": ["palette", "palette :: [String]"],
  "grid.reachable": ["reachable", "reachable :: Grid -> [Cell] -> (Cell -> Bool) -> [Cell]"],
  "grid.regions": ["regions", "regions :: Grid -> (Cell -> Cell -> Bool) -> [[Cell]]"],
  "grid.quarterTurn": ["quarterTurn", "quarterTurn :: Grid -> Cell -> Cell"],
  "cell.row": ["cellRow", "cellRow, cellCol :: Cell -> Int"],
  "cell.colour": ["colour", "colour :: Cell -> String"],
  "cell.symbol": ["symbol", "symbol :: Cell -> String"],
  "cell.value": ["value", "value :: Cell -> Int"],
  "cell.left": ["left", "left, right, up, down :: Cell -> Maybe Cell"],
  "cell.upLeft": ["upLeft", "upLeft, upRight, downLeft, downRight :: Cell -> Maybe Cell"],
  "cell.neighbours": ["neighbours", "neighbours :: Cell -> [Cell]"],
  "cell.surrounding": ["surrounding", "surrounding :: Cell -> [Cell]"],
  "cell.onEdge": ["onEdge", "onEdge :: Cell -> Bool"],
  "cell.suit": ["suit", "suit :: Cell -> String"],
  "cell.isPicture": ["isPicture", "isPicture :: Cell -> Bool"],
  nextColour: ["nextColour", "nextColour :: String -> String"],
  mix: ["mix", "mix :: String -> String -> Maybe String"],
  onlyIfBetter: ["onlyIfBetter", "onlyIfBetter :: [Call] -> [Call]"],
};

/**
 * Helper docs with their Haskell name and signature: a move or area helper's from its TypeScript declaration in `dts`
 * (`slide :: AreaLike a => a -> Call; slide' :: ...`), a read helper's from the Room module's table. A helper with no
 * Haskell form is returned as it is.
 */
export function withHaskellDocs(docs: readonly HelperDoc[], dts: string): HelperDoc[] {
  const fns = new Map([...hsFunctions(dts, "MutatorCall"), ...hsFunctions(dts, "AreaRef")].map(f => [f.name, f.signatures.join("; ")]));
  return docs.map(doc => {
    const ts = doc.name.typescript;
    const read = HS_READ_HELPERS[ts];
    const [name, signature] = read ?? (fns.has(ts) ? [ts, fns.get(ts)!] : [undefined, undefined]);
    if (!name || !signature) return doc;
    return Object.freeze({ ...doc, name: Object.freeze({ ...doc.name, haskell: name }), signature: Object.freeze({ ...doc.signature, haskell: signature }) });
  });
}

/** Top-level names a Haskell module text defines (`name ::` signatures and `type`/`data` heads excluded). */
export function hsDefinedNames(text: string): string[] {
  return [...new Set([...text.matchAll(/^([a-z_][\w']*)\s*::/gm)].map(m => m[1]))].sort();
}

/**
 * The Room module of one instantiation: `base` (the type's own Haskell: `type Obj`, `cgDecode`, read helpers)
 * plus the support code and every available mutator's generated constructors.
 */
export function assembleHaskell(inst: Instantiation, base: string, avail: readonly MutatorDef<any, any>[]): string {
  const seen = new Set<string>();
  const dts = avail.map(m => m.guest.dts).join("\n");
  const body = `${base}\n${HS_SUPPORT}\n${hsConstructors(dts, "AreaRef", seen)}\n${hsConstructors(dts, "MutatorCall", seen)}`;
  return haskellModule(inst.key, body);
}

/** Wraps a Room body: hides the Prelude names it redefines, and imports the Prelude qualified as P. */
export function haskellModule(key: string, body: string): string {
  const hidden = hsHiddenPrelude(body);
  return `-- Room helpers for ${key}. Generated; do not edit.\nmodule Room where\n`
    + `import Prelude${hidden.length ? ` hiding (${hidden.join(", ")})` : ""}\n`
    + `import qualified Prelude as P\n${body}`;
}

/** The Prelude names a Room module redefines (each agent hides them too, so Room's win). */
export function hsHiddenPrelude(roomText: string): string[] {
  const prelude = new Set(HS_PRELUDE_NAMES);
  return hsDefinedNames(roomText).filter(n => prelude.has(n));
}

type HsLit = number | string | boolean | readonly HsLit[];
/** A Haskell literal: numbers, ASCII-escaped strings, Bool, lists. */
export function hs(x: HsLit): string {
  if (typeof x === "boolean") return x ? "True" : "False";
  if (typeof x === "number") {
    if (!Number.isSafeInteger(x)) throw new Error("Haskell literals here are whole numbers");
    return x < 0 ? `(${x})` : String(x);
  }
  if (typeof x === "string") {
    let out = '"';
    for (const ch of x) {
      const c = ch.codePointAt(0)!;
      if (ch === '"' || ch === "\\") out += `\\${ch}`;
      else if (c >= 32 && c < 127) out += ch;
      else out += `\\${c}\\&`;
    }
    return `${out}"`;
  }
  return `[${x.map(hs).join(", ")}]`;
}
