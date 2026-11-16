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

const num = (x: string | undefined, fallback: string): string => (x !== undefined && /^-?\d+(\/[1-9]\d*)?$/.test(x.trim()) ? x.trim() : fallback);
const frac = (x: string) => (x.includes("/") ? `Fraction(${x.replace("/", ", ")})` : x);
const qOf = (x: string) => `Q.of(${JSON.stringify(x)})`;

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
    id: "intercept-floor", title: "The y-intercept is at least a value", params: [{ name: "floor", label: "At least", example: "10" }], types: ["line"],
    make: (language, a) => {
      const k = num(a.floor, "10");
      return {
        language, words: `the y-intercept is at least ${k}`,
        source: language === "python" ? `def predicate(offer):\n    return look(offer, "si").c >= ${frac(k)}\n`
          : `function predicate(offer) {\n  return Q.cmp(look(offer, "si").c, ${qOf(k)}) >= 0;\n}\n`,
      };
    },
  },
];
