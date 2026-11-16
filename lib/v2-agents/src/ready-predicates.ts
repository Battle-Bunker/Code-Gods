/** Ready-made lock predicates (docs/engine-v2/locks.md §11): pure, so the app and the engine's mutations can offer them. */
import type { LockProgram } from "@workspace/v2-core";

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
