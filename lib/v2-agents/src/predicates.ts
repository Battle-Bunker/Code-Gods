/**
 * Lock predicates as programs (docs/engine-v2/locks.md §2, owner decision 48): a predicate is a program in the agent
 * runtime (the same guest languages and library, sandbox and determinism as an agent), defining `predicate(offer)` and
 * returning true or false. It is given the object and nothing else: it may read it (`view`, `element`: the helpers'
 * look and peek), each read priced as an agent's is; it has no rule, no energy, no moves, no randomness.
 *
 * Its complexity is measured by what prices an agent: the program's description length (`summonBits`) plus the bits it
 * read on the state the lock was made on.
 *
 * A check is synchronous (it runs inside another act's host call, for a quote), so it needs an inline sandbox of its
 * own for each language: `predicateRunner` takes them ready-made.
 */
import type { LockProgram, ObjectType, PredicateRun, PredicateRunner, Variant } from "@workspace/v2-core";
import { createSandbox, type AgentHost, type HostContext, type HostReply, type HostRequest, type InlineSandbox, type Language } from "@workspace/v2-sandbox";
import { EngineHost } from "./host.ts";
import { summonBits } from "./summon.ts";

/**
 * One check's limits: far below an act's (500,000 steps, 64 host calls), because a lock's program runs on every call
 * that meets it. 20,000 steps is two of QuickJS's step polls; 8 host calls read every view of a line.
 */
export const PREDICATE_LIMITS = Object.freeze({ stepBudget: 20_000, hostCallCap: 8, wallMs: 250 });

/** The entry the sandbox calls: the author's `predicate(offer)`, its answer as the sandbox's two skip shapes. */
const ENTRY = {
  javascript: `\n;function agent(offer) { const r = predicate(offer); if (r !== true && r !== false) throw new TypeError("a predicate returns true or false"); return r ? [] : null; }\n`,
  python: `\n\ndef agent(offer):\n    r = predicate(offer)\n    if r is not True and r is not False:\n        raise TypeError("a predicate returns True or False")\n    return [] if r else None\n`,
};

/** A predicate's description length in bits: an agent's summon bits (lib/v2-agents summon.ts), on the author's source alone. */
export const predicateBits = (program: LockProgram): number => summonBits(program.language, program.source).bits;

/** The object and nothing else: reads priced as an agent's reads are (an EngineHost's accounting); every other request refused. */
class PredicateHost<S> implements AgentHost {
  private readonly host: EngineHost<S>;
  constructor(type: ObjectType<S>, variant: Variant, state: S) {
    // The accounting needs a rule only for requests a predicate cannot make: any family of the type serves.
    this.host = new EngineHost({ type, variant, state, rule: { family: type.families[0]!.id, params: {} }, energy: 0 });
  }
  handle(request: HostRequest, context: HostContext): HostReply {
    if (request.op !== "view" && request.op !== "element") return { ok: false, error: `a lock's program can only read the object (look, peek): ${request.op} is not offered to it` };
    return this.host.handle(request, context);
  }
}

/** Inline sandboxes for predicates, one per language asked for (apart from the agents' own: a check runs inside an act). */
export async function predicateBoxes(languages: readonly ("typescript" | "python")[], make: (language: "typescript" | "python") => Promise<InlineSandbox> = language => createSandbox({ language, execution: "inline" })):
  Promise<(language: Language) => InlineSandbox | undefined> {
  const boxes = new Map<string, InlineSandbox>();
  for (const l of new Set(languages)) boxes.set(l, await make(l));
  return language => boxes.get(language === "javascript" ? "typescript" : language);
}

const CACHE_MAX = 4096;

/**
 * A runner over ready inline sandboxes (one per language a lock may be written in; TypeScript and JavaScript share
 * one). Results are kept by program and state for the life of the runner: a check is a function of those alone.
 */
export function predicateRunner<S>(type: ObjectType<S>, variant: Variant, boxes: (language: Language) => InlineSandbox | undefined): PredicateRunner<S> {
  const cache = new Map<string, PredicateRun>();
  return (program, state) => {
    const key = `${program.language}\0${program.source}\0${type.encode(state)}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const box = boxes(program.language);
    let run: PredicateRun;
    if (!box) run = { ok: false, error: `no ${program.language} sandbox is running to check it` };
    else {
      const r = box.actSync({
        source: program.source + (program.language === "python" ? ENTRY.python : ENTRY.javascript), offer: { object: 0 }, seed: "0",
        host: new PredicateHost(type, variant, state), limits: PREDICATE_LIMITS,
      });
      run = !r.ok ? { ok: false, error: r.error }
        : r.usedRandom ? { ok: false, error: "a predicate may not use randomness" }
        : r.calls === "null" ? { ok: true, holds: false, readBits: r.readBits }
        : r.calls === "[]" ? { ok: true, holds: true, readBits: r.readBits }
        : { ok: false, error: "a predicate returns true or false" };
    }
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(key, run);
    return run;
  };
}

/**
 * Ready-made predicate programs for the owner's examples (docs/engine-v2/locks.md §2): what the create form offers and
 * what the docs show. Each takes its numbers and gives the program in both languages with its one-line description.
 */
export interface ReadyPredicate {
  readonly id: string;
  readonly title: string;
  /** The numbers it takes, with a default each (rationals as text). */
  readonly params: readonly { readonly name: string; readonly label: string; readonly example: string }[];
  /** The object types it reads ("line"). */
  readonly types: readonly string[];
  make(language: "typescript" | "python", args: Readonly<Record<string, string>>): LockProgram;
}

const RATIONAL = /^-?\d+(\/[1-9]\d*)?$/;
const num = (x: string | undefined, fallback: string): string => (x !== undefined && RATIONAL.test(x.trim()) ? x.trim() : fallback);
const frac = (x: string) => (x.includes("/") ? `Fraction(${x.replace("/", ", ")})` : `Fraction(${x})`);
const qOf = (x: string) => `Q.from(${JSON.stringify(x)})`;
/** A reading written `view.name` (a number the view shows: si.c, si.m, tri.area, crossing.x). */
const READING = /^([a-z][A-Za-z0-9]*)\.([a-z][A-Za-z0-9]*)$/;
const reading = (x: string | undefined, fallback: string): [string, string] => {
  const m = READING.exec((x ?? "").trim()) ?? READING.exec(fallback)!;
  return [m[1]!, m[2]!];
};
/** Plain names for the readings players lock most; any other reading is named by its ref. */
const NAMES: Readonly<Record<string, string>> = {
  "si.c": "the y-intercept", "si.m": "the gradient", "tri.area": "the triangle's area", "crossing.x": "the x-crossing",
  "gen.c": "c in ax + by + c = 0", "seq.start": "the start", "seq.step": "the step",
};
const named = ([v, n]: [string, string]) => NAMES[`${v}.${n}`] ?? `${v}.${n}`;
const MAX_CLAUSES = 6;
/** "si.c >= 10, tri.area >= 50" (`>=` optional): at most six clauses; malformed ones are dropped. */
function clauses(x: string | undefined, fallback: string): [string, string, string][] {
  const parse = (t: string) => t.split(/[,;\n]/).map(c => /^\s*([a-z][A-Za-z0-9]*)\.([a-z][A-Za-z0-9]*)\s*(?:>=|≥)?\s*(-?\d+(?:\/[1-9]\d*)?)\s*$/.exec(c))
    .filter((m): m is RegExpExecArray => m !== null).map(m => [m[1]!, m[2]!, m[3]!] as [string, string, string]).slice(0, MAX_CLAUSES);
  const out = parse(x ?? "");
  return out.length ? out : parse(fallback);
}

export const READY_PREDICATES: readonly ReadyPredicate[] = [
  {
    id: "prime-intercept", title: "The y-intercept is prime", params: [], types: ["line"],
    make: language => ({
      language, words: "the y-intercept is prime",
      source: language === "python" ? `def predicate(offer):\n    return prime(look(offer, "si").c)\n`
        : `function predicate(offer) {\n  return prime(look(offer, "si").c);\n}\n`,
    }),
  },
  {
    id: "gradient-equals", title: "The gradient equals a value", params: [{ name: "m", label: "Gradient", example: "-2" }], types: ["line"],
    make: (language, a) => {
      const m = num(a.m, "-2");
      return {
        language, words: `the gradient is ${m}`,
        source: language === "python" ? `def predicate(offer):\n    return look(offer, "si").m == ${frac(m)}\n`
          : `function predicate(offer) {\n  return Q.eq(look(offer, "si").m, ${qOf(m)});\n}\n`,
      };
    },
  },
  {
    // A floor: the owner's "a floor on a reading". It leaves the object free to climb above it.
    id: "floor", title: "A reading is at least a value",
    params: [{ name: "reading", label: "Reading", example: "si.c" }, { name: "floor", label: "At least", example: "10" }], types: ["line"],
    make: (language, a) => {
      const r = reading(a.reading, "si.c"), k = num(a.floor, "10");
      return {
        language, words: `${named(r)} is at least ${k}`,
        source: language === "python" ? `def predicate(offer):\n    return look(offer, "${r[0]}").${r[1]} >= ${frac(k)}\n`
          : `function predicate(offer) {\n  return Q.cmp(look(offer, "${r[0]}").${r[1]}, ${qOf(k)}) >= 0;\n}\n`,
      };
    },
  },
  {
    // Shared defence: one clause per ally's reading, so one lock all of them can fund and none defends only its own part.
    id: "floors", title: "Every ally's reading is at least its floor",
    params: [{ name: "floors", label: "Floors (reading >= value, comma separated)", example: "si.c >= 10, tri.area >= 50" }], types: ["line"],
    make: (language, a) => {
      const cs = clauses(a.floors, "si.c >= 10, tri.area >= 50");
      const words = cs.map(([v, n, k]) => `${named([v, n])} ≥ ${k}`).join(" and ");
      return {
        language, words,
        source: language === "python"
          ? `FLOORS = [${cs.map(([v, n, k]) => `("${v}", "${n}", ${frac(k)})`).join(", ")}]\n\ndef predicate(offer):\n    return all(look(offer, v)[n] >= k for v, n, k in FLOORS)\n`
          : `const FLOORS = [${cs.map(([v, n, k]) => `["${v}", "${n}", "${k}"]`).join(", ")}];\n\nfunction predicate(offer) {\n  return FLOORS.every(([v, n, k]) => Q.cmp(look(offer, v)[n], Q.from(k)) >= 0);\n}\n`,
      };
    },
  },
  {
    // A relation: A ≥ k·B + d. Both readings may climb, as long as A keeps pace with B: the object moves along the ray.
    id: "keeps-pace", title: "One reading keeps pace with another (A ≥ k × B + d)",
    params: [{ name: "a", label: "Reading A", example: "si.c" }, { name: "b", label: "Reading B", example: "si.m" },
      { name: "k", label: "k", example: "3" }, { name: "d", label: "d", example: "0" }], types: ["line"],
    make: (language, x) => {
      const A = reading(x.a, "si.c"), B = reading(x.b, "si.m"), k = num(x.k, "3"), d = num(x.d, "0");
      return {
        language, words: `${named(A)} stays at least ${k} × ${named(B)}${d === "0" ? "" : d.startsWith("-") ? ` − ${d.slice(1)}` : ` + ${d}`}`,
        source: language === "python"
          ? `def predicate(offer):\n    a = look(offer, "${A[0]}").${A[1]}\n    b = look(offer, "${B[0]}").${B[1]}\n    return a >= ${frac(k)} * b + ${frac(d)}\n`
          : `function predicate(offer) {\n  const a = look(offer, "${A[0]}").${A[1]}, b = look(offer, "${B[0]}").${B[1]};\n  return Q.cmp(a, Q.add(Q.mul(${qOf(k)}, b), ${qOf(d)})) >= 0;\n}\n`,
      };
    },
  },
  {
    // A side condition: blocks the cheap mirror or swap (a reflection flips the sign of the gradient, a half turn both).
    id: "sign", title: "A reading keeps its sign",
    params: [{ name: "reading", label: "Reading", example: "si.m" }, { name: "side", label: "positive or negative", example: "negative" }], types: ["line"],
    make: (language, a) => {
      const r = reading(a.reading, "si.m"), neg = (a.side ?? "negative").trim().toLowerCase().startsWith("n");
      const op = neg ? "<" : ">";
      return {
        language, words: `${named(r)} stays ${neg ? "negative" : "positive"}`,
        source: language === "python" ? `def predicate(offer):\n    return look(offer, "${r[0]}").${r[1]} ${op} 0\n`
          : `function predicate(offer) {\n  return Q.cmp(look(offer, "${r[0]}").${r[1]}, Q.of(0)) ${op} 0;\n}\n`,
      };
    },
  },
];
