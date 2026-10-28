/**
 * Shared prelude machinery: literal emitters (tables are data, so Python and JS agree by
 * construction), the guest-side call encoder, and assembly with the available mutators.
 *
 * A mutator call, as a guest constructor returns it, is a plain dict / object
 * `{"__m": "<mutator id>", ...params}`. `__encode_calls(calls)` turns a list of them (or one call, or
 * None/null for "do nothing") into the ASCII JSON text of `[[id, params], ...]` (MutatorCallWire):
 * keys sorted, no spaces, non-ASCII escaped as \uXXXX, numbers must be whole and safe. Python and JS
 * emit byte-identical text for the same calls.
 */
import { satisfied } from "./constraints.ts";
import { MAX_CALLS, type HelperDoc, type Instantiation, type MutatorDef, type PreludeParts, type PricingVocab } from "./types.ts";
import { sha256 } from "./util.ts";

type Lit = number | string | boolean | null | readonly Lit[];

export function py(x: Lit): string {
  if (x === null) return "None";
  if (typeof x === "boolean") return x ? "True" : "False";
  if (typeof x === "number" || typeof x === "string") return JSON.stringify(x);
  return x.length === 1 ? `(${py(x[0])},)` : `(${x.map(py).join(", ")})`;
}

export function js(x: Lit): string {
  if (Array.isArray(x)) return `[${x.map(js).join(", ")}]`;
  return JSON.stringify(x);
}

/** Python dict / JS Map literal from string keys. */
export function pyDict(entries: readonly (readonly [Lit, Lit])[]): string {
  return `{${entries.map(([k, v]) => `${py(k)}: ${py(v)}`).join(", ")}}`;
}
export function jsMap(entries: readonly (readonly [Lit, Lit])[]): string {
  return `new Map([${entries.map(([k, v]) => `[${js(k)}, ${js(v)}]`).join(", ")}])`;
}

export const ENCODE_CALLS_PY = `
def _JSON(x, depth=0):
    if depth > 8:
        raise ValueError("move settings are nested too deeply")
    if x is None:
        return "null"
    if x is True:
        return "true"
    if x is False:
        return "false"
    if isinstance(x, float):
        if x != x or x in (float("inf"), float("-inf")) or not x.is_integer():
            raise ValueError("move settings must be whole numbers")
        x = int(x)
    if isinstance(x, int):
        if abs(x) > 9007199254740991:
            raise ValueError("move settings must be smaller numbers")
        return str(x)
    if isinstance(x, str):
        out = ['"']
        for ch in x:
            c = ord(ch)
            if c == 34 or c == 92:
                out.append("\\\\" + ch)
            elif 32 <= c < 127:
                out.append(ch)
            elif c < 65536:
                out.append("\\\\u%04x" % c)
            else:
                c -= 65536
                out.append("\\\\u%04x\\\\u%04x" % (55296 + (c >> 10), 56320 + (c & 1023)))
        out.append('"')
        return "".join(out)
    if isinstance(x, (list, tuple)):
        return "[" + ",".join(_JSON(v, depth + 1) for v in x) + "]"
    if isinstance(x, dict):
        if not all(isinstance(k, str) for k in x):
            raise ValueError("move setting names must be words")
        return "{" + ",".join(_JSON(k) + ":" + _JSON(x[k], depth + 1) for k in sorted(x)) + "}"
    raise ValueError("can't send a %s as a move setting" % type(x).__name__)


def __encode_calls(calls):
    """Mutator calls -> the ASCII JSON text the engine reads: [[id, params], ...]."""
    if calls is None:
        calls = []
    if isinstance(calls, dict):
        calls = [calls]
    if not isinstance(calls, (list, tuple)):
        raise ValueError("agent(...) must return a list of moves")
    if len(calls) > ${MAX_CALLS}:
        raise ValueError("an agent can make at most ${MAX_CALLS} moves at a time")
    out = []
    for call in calls:
        if not isinstance(call, dict) or not isinstance(call.get("__m"), str):
            raise ValueError("every move must come from a move helper")
        params = {k: v for k, v in call.items() if k != "__m"}
        out.append("[" + _JSON(call["__m"]) + "," + _JSON(params) + "]")
    return "[" + ",".join(out) + "]"
`;

export const ENCODE_CALLS_JS = `
function __JSON(x, depth) {
  if (depth > 8) throw new Error("move settings are nested too deeply");
  if (x === null || x === undefined) return "null";
  if (x === true) return "true";
  if (x === false) return "false";
  if (typeof x === "number") {
    if (!Number.isInteger(x)) throw new Error("move settings must be whole numbers");
    if (!Number.isSafeInteger(x)) throw new Error("move settings must be smaller numbers");
    return String(x);
  }
  if (typeof x === "string") {
    let out = '"';
    for (let i = 0; i < x.length; i++) {
      const c = x.charCodeAt(i);
      if (c === 34 || c === 92) out += "\\\\" + x[i];
      else if (c >= 32 && c < 127) out += x[i];
      else out += "\\\\u" + c.toString(16).padStart(4, "0");
    }
    return out + '"';
  }
  if (Array.isArray(x)) return "[" + x.map((v) => __JSON(v, depth + 1)).join(",") + "]";
  if (typeof x === "object") {
    return "{" + Object.keys(x).sort().map((k) => __JSON(k, 0) + ":" + __JSON(x[k], depth + 1)).join(",") + "}";
  }
  throw new Error("can't send a " + typeof x + " as a move setting");
}

function __encode_calls(calls) {
  if (calls === null || calls === undefined) calls = [];
  if (!Array.isArray(calls) && typeof calls === "object" && typeof calls.__m === "string") calls = [calls];
  if (!Array.isArray(calls)) throw new Error("agent(...) must return a list of moves");
  if (calls.length > ${MAX_CALLS}) throw new Error("an agent can make at most ${MAX_CALLS} moves at a time");
  return "[" + calls.map((call) => {
    if (call === null || typeof call !== "object" || typeof call.__m !== "string") throw new Error("every move must come from a move helper");
    const params = {};
    for (const k of Object.keys(call)) if (k !== "__m") params[k] = call[k];
    return "[" + __JSON(call.__m, 0) + "," + __JSON(params, 0) + "]";
  }).join(",") + "]";
}
`;

export const ENCODE_CALLS_DTS = `
/** What a move helper returns. Return a list of these from agent(...). */
interface MutatorCall { readonly __m: string }
declare function __encode_calls(calls: MutatorCall | readonly MutatorCall[] | null | undefined): string;
`;

export interface BasePrelude {
  readonly python: string;
  readonly js: string;
  readonly dts: string;
  readonly helpers: readonly HelperDoc[];
}

/** Read helper doc; `ts` defaults to the Python name camelCased. */
export function helper(python: string, pySig: string, tsSig: string, kid: string, cls?: string, ts?: string): HelperDoc {
  const typescript = ts ?? python.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  return Object.freeze({
    name: Object.freeze({ python, typescript }),
    signature: Object.freeze({ python: pySig, typescript: tsSig }),
    kid, group: "read" as const, ...(cls ? { class: cls } : {}),
  });
}

export function availableOf<V>(mutators: readonly MutatorDef<V, any>[], inst: Instantiation): MutatorDef<V, any>[] {
  return mutators.filter(m => m.requires.every(c => satisfied(c, inst)));   // = resolve(m.requires, inst).ok
}

/** base prelude + call encoder + every available mutator's guest constructors. */
export function assemblePrelude(inst: Instantiation, base: BasePrelude, mutators: readonly MutatorDef<any, any>[]): PreludeParts {
  const avail = availableOf(mutators, inst);
  const header = (c: string) => `${c} Room helpers for ${inst.key}. Generated; do not edit.\n`;
  const python = header("#") + base.python + ENCODE_CALLS_PY + avail.map(m => m.guest.python).join("\n");
  const jsText = header("//") + base.js + ENCODE_CALLS_JS + avail.map(m => m.guest.js).join("\n");
  const dts = header("//") + base.dts + ENCODE_CALLS_DTS + avail.map(m => m.guest.dts).join("\n");
  return Object.freeze({
    python, js: jsText, dts,
    helpers: Object.freeze([...base.helpers, ...avail.flatMap(m => m.guest.docs)]),
    pricing: Object.freeze({ python: pythonVocab(python, avail), typescript: jsVocab(jsText, avail) }),
    hash: sha256(`${python}\0${jsText}\0${dts}`),
  });
}

// ------------------------------------------------------------------------------------------------
// pricing vocabulary (the game half of ast-bits-v1), read off the generated prelude texts
// ------------------------------------------------------------------------------------------------

const VOCAB_MAX = 4096;
const sortedUnique = (xs: Iterable<string>): string[] =>
  [...new Set([...xs].filter(x => x.length > 0 && x.length <= 128))].sort().slice(0, VOCAB_MAX);
/** Strings the API gives meaning to: short literal words and glyphs in the prelude (not messages or private keys). */
function meaningfulStrings(text: string, avail: readonly MutatorDef<any, any>[]): string[] {
  const out = new Set(avail.map(m => m.id));
  for (const m of text.matchAll(/"((?:[^"\\\n]|\\.){1,24})"|'((?:[^'\\\n]|\\.){1,24})'/g)) {
    const raw = m[1] ?? m[2];
    let value: string;
    try { value = JSON.parse(`"${raw.replace(/"/g, '\\"')}"`); } catch { continue; }
    if (/^[^\s%{}\\]{1,24}$/.test(value) && !value.startsWith("_")) out.add(value);
  }
  return sortedUnique(out);
}
type Block = { name: string; params: string[]; body: string };
/** Top-level public functions: name, parameter names and body text. */
function blocks(text: string, header: RegExp, isTopLevel: (line: string) => boolean, publicName: (n: string) => boolean): Block[] {
  const lines = text.split("\n"), out: Block[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(header);
    if (!m || !publicName(m[1])) continue;
    let j = i + 1;
    while (j < lines.length && !isTopLevel(lines[j])) j++;
    const params = m[2].split(",").map(p => p.trim().replace(/^\*+/, "").split(/[=:]/)[0].trim()).filter(p => /^[A-Za-z]\w*$/.test(p));
    out.push({ name: m[1], params, body: [lines[i], ...lines.slice(i + 1, j)].join("\n") });
  }
  return out;
}
/** Mutator constructors build a call; areas build a region (or return another area). */
function roles(fns: Block[], isMutator: (b: Block) => boolean, isArea: (b: Block) => boolean) {
  const mutators = fns.filter(isMutator).map(b => b.name);
  const areas = new Set(fns.filter(b => !mutators.includes(b.name) && isArea(b)).map(b => b.name));
  for (const b of fns) if (!mutators.includes(b.name) && [...areas].some(a => new RegExp(`return ${a}\\(`).test(b.body))) areas.add(b.name);
  return { mutators: sortedUnique(mutators), areas: sortedUnique(areas) };
}
function pythonVocab(text: string, avail: readonly MutatorDef<any, any>[]): PricingVocab {
  const isPublic = (n: string) => !n.startsWith("_");
  const fns = blocks(text, /^def (\w+)\(([^)]*)\)/, l => /^\S/.test(l) && !/^\s*#/.test(l), isPublic);
  const constants = [...text.matchAll(/^([A-Za-z]\w*)\s*=/gm)].map(m => m[1]);
  const attrs: string[] = [];
  for (const cls of text.matchAll(/^class \w+[^\n]*\n((?:[ \t]+[^\n]*\n|\n)*)/gm)) {
    const body = cls[1];
    for (const m of body.matchAll(/__slots__\s*=\s*\(([^)]*)\)/g)) attrs.push(...[...m[1].matchAll(/"(\w+)"/g)].map(x => x[1]));
    attrs.push(...[...body.matchAll(/^    def (\w+)\(/gm)].map(m => m[1]));
    attrs.push(...[...body.matchAll(/self\.(\w+)\s*=/g)].map(m => m[1]));
  }
  return Object.freeze({
    api: sortedUnique([...fns.map(b => b.name), ...constants]),
    attrs: sortedUnique(attrs.filter(isPublic)),
    params: sortedUnique(fns.flatMap(b => b.params)),
    strings: meaningfulStrings(text, avail),
    ...roles(fns, b => /_M_CALL\(|"__m"/.test(b.body), b => /"kind"/.test(b.body)),
  });
}
function jsVocab(text: string, avail: readonly MutatorDef<any, any>[]): PricingVocab {
  const isPublic = (n: string) => !n.startsWith("__");
  const fns = blocks(text, /^function (\w+)\(([^)]*)\)/, l => /^\S/.test(l) && !/^\s*\/\//.test(l) && !/^[}\])]/.test(l), isPublic);
  const constants = [...text.matchAll(/^(?:const|let|var) ([A-Za-z]\w*)\s*=/gm)].map(m => m[1]).filter(isPublic);
  const attrs: string[] = [];
  for (const cls of text.matchAll(/^class \w+[^\n]*\{\n((?:(?!\}\n)[^\n]*\n|\n)*?)\}$/gm)) {
    const body = cls[1];
    attrs.push(...[...body.matchAll(/^  (?:static |get |set )?(\w+)\s*\(/gm)].map(m => m[1]).filter(n => n !== "constructor"));
    attrs.push(...[...body.matchAll(/this\.(\w+)/g)].map(m => m[1]));
  }
  // Fields set on the objects the prelude builds (`x.colour = ...` in __decode).
  attrs.push(...[...text.matchAll(/(?<![\w.#])[a-z]\w*\.([A-Za-z]\w*)\s*=(?!=)/g)].map(m => m[1]));
  return Object.freeze({
    api: sortedUnique([...fns.map(b => b.name), ...constants]),
    attrs: sortedUnique(attrs.filter(n => !n.startsWith("_"))),
    params: sortedUnique(fns.flatMap(b => b.params)),
    strings: meaningfulStrings(text, avail),
    ...roles(fns, b => /__m:/.test(b.body), b => /kind:/.test(b.body)),
  });
}

/** Per-key memo for instantiation-derived artefacts (codecs, preludes, display tables). */
export function memo<T>(f: (inst: Instantiation) => T): (inst: Instantiation) => T {
  const cache = new Map<string, T>();
  return inst => {
    let v = cache.get(inst.key);
    if (v === undefined) cache.set(inst.key, v = f(inst));
    return v;
  };
}
