/**
 * Capability classes and the constraint language (docs/research/grid/architecture.md §§2–3).
 *
 * Classes are single-parameter and attach to one slot (symbols, colours, bounds...). Constraints are
 * data: `{has}` an instance of a class (superclass closure applied), or a refinement over a numeric
 * term the instantiation exposes ("size", "colours.count", "bounds.min", "length.max"). The server,
 * both UIs and the AI prompt builder all evaluate them with these functions.
 */
import type { Badge, CapabilityClass, Constraint, Instantiation, ObjectTypeDef, ParamSchema, ParamValue, Resolution, TypeArgs } from "./types.ts";
import { orList } from "./util.ts";

const cls = (id: string, slot: string, superclasses: string[], emoji: string, label: string, kid: string): CapabilityClass =>
  Object.freeze({ id, slot, superclasses: Object.freeze(superclasses), badge: Object.freeze({ id, emoji, label, kid }) });

/** Every capability class, in display order. Instances live with their components (orphan rule). */
export const CLASSES: readonly CapabilityClass[] = Object.freeze([
  // Grid symbols
  cls("Valued", "symbols", [], "➕", "Points", "Symbols are worth points"),
  cls("Ranked", "symbols", [], "🪜", "Counting order", "Symbols come in order, like counting"),
  cls("Numeral", "symbols", ["Valued", "Ranked"], "🔟", "Place value", "Read a row as one big number"),
  cls("Suited", "symbols", [], "♠", "Suits", "Symbols belong to teams"),
  cls("Faced", "symbols", ["Ranked"], "👑", "Picture cards", "Jacks, queens and kings"),
  // Grid colours
  cls("Spectral", "colours", [], "🌈", "Colour order", "Colours come in rainbow order"),
  cls("Wheel", "colours", ["Spectral"], "🎡", "Colour wheel", "The rainbow goes round: violet is next to red"),
  cls("Mixable", "colours", [], "🎨", "Paint mixing", "Two paints mix into a third"),
  // Int bounds
  cls("Natural", "bounds", [], "🔢", "Counting numbers", "Never below zero"),
]);

const BY_ID = new Map(CLASSES.map(c => [c.id, c]));

export function capabilityClass(id: string): CapabilityClass {
  const c = BY_ID.get(id);
  if (!c) throw new Error(`Unknown capability class ${id}`);
  return c;
}

/** Transitive superclass closure, in CLASSES order. */
export function closure(ids: Iterable<string>): string[] {
  const out = new Set<string>(), todo = [...ids];
  while (todo.length) {
    const id = todo.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    todo.push(...capabilityClass(id).superclasses);
  }
  return CLASSES.map(c => c.id).filter(id => out.has(id));
}

/** Only the classes not implied by another one in the set ("🔟 Place value", not three badges). */
export function maximalClasses(ids: readonly string[]): string[] {
  return ids.filter(id => !ids.some(o => o !== id && closure([o]).includes(id)));
}

// --- constraint sugar ---------------------------------------------------------------------------
export const has = (c: string): Constraint => ({ has: c });
export const atLeast = (term: string, value: number): Constraint => ({ term, op: ">=", value });
export const atMost = (term: string, value: number): Constraint => ({ term, op: "<=", value });
export const exactly = (term: string, value: number): Constraint => ({ term, op: "==", value });
export const minSize = (k: number) => atLeast("size", k);
export const maxSize = (k: number) => atMost("size", k);
export const odd = (): Constraint => ({ term: "size", parity: "odd" });
export const even = (): Constraint => ({ term: "size", parity: "even" });
export const minColours = (k: number) => atLeast("colours.count", k);
export const minSymbols = (k: number) => atLeast("symbols.count", k);
export const not = (c: Constraint): Constraint => ({ not: c });

/** A term an instantiation does not expose never satisfies a refinement on it. */
export function satisfied(c: Constraint, inst: Instantiation): boolean {
  if ("not" in c) return !satisfied(c.not, inst);
  if ("has" in c) return inst.classes.includes(c.has);
  const v = inst.terms[c.term];
  if (v === undefined) return false;
  if ("parity" in c) return Math.abs(v % 2) === (c.parity === "odd" ? 1 : 0);
  return c.op === ">=" ? v >= c.value : c.op === "<=" ? v <= c.value : v === c.value;
}

// --- object types, for unlock search (registered by registry.ts; avoids an import cycle) ----------
const TYPES = new Map<string, ObjectTypeDef<any>>();
export function registerObjectType(def: ObjectTypeDef<any>): void {
  TYPES.set(def.id, def);
}

function tryInstantiate(def: ObjectTypeDef<any>, args: TypeArgs): Instantiation | null {
  try { return def.instantiate(args); } catch { return null; }
}

/** Values worth trying for one parameter: every option, or presets, bounds and the constraint values ±1. */
function candidates(p: ParamSchema, current: ParamValue, unmet: readonly Constraint[]): ParamValue[] {
  if (p.kind === "component") return p.options.map(o => o.id).filter(id => id !== current);
  const set = new Set<number>([...(p.presets ?? []), p.min, p.max]);
  const walk = (c: Constraint): void => {
    if ("not" in c) return walk(c.not);
    if ("term" in c && "value" in c) for (const d of [-1, 0, 1]) set.add(c.value + d);
  };
  unmet.forEach(walk);
  const cur = Number(current);
  return [...set].filter(v => Number.isSafeInteger(v) && v >= p.min && v <= p.max && v !== cur)
    .sort((a, b) => Math.abs(a - cur) - Math.abs(b - cur) || a - b);
}

function* subsets(n: number, k: number, from = 0): Generator<number[]> {
  if (k === 0) { yield []; return; }
  for (let i = from; i <= n - k; i++) for (const rest of subsets(n, k - 1, i + 1)) yield [i, ...rest];
}

/**
 * The smallest args patch that makes every constraint hold: fewest changed parameters, ties broken by
 * parameter order, then option order (int parameters: nearest value first). Undefined when none exists.
 */
export function unlock(constraints: readonly Constraint[], inst: Instantiation): TypeArgs | undefined {
  const def = TYPES.get(inst.objectType);
  if (!def) return undefined;
  const unmet = constraints.filter(c => !satisfied(c, inst));
  if (!unmet.length) return {};
  const params = def.params, values = params.map(p => candidates(p, inst.args[p.id], unmet));
  for (let k = 1; k <= params.length; k++) {
    for (const idx of subsets(params.length, k)) {
      // Odometer over the chosen parameters' candidate lists.
      const pos = idx.map(() => 0);
      if (idx.some(i => !values[i].length)) continue;
      for (;;) {
        const patch: Record<string, ParamValue> = {};
        idx.forEach((i, j) => { patch[params[i].id] = values[i][pos[j]]; });
        const next = tryInstantiate(def, { ...inst.args, ...patch });
        if (next && constraints.every(c => satisfied(c, next))) return patch;
        let j = idx.length - 1;
        while (j >= 0 && ++pos[j] === values[idx[j]].length) pos[j--] = 0;
        if (j < 0) break;
      }
    }
  }
  return undefined;
}

// --- kid wording ---------------------------------------------------------------------------------
const TERM_WORDS: Readonly<Record<string, string>> = {
  "size": "board size", "colours.count": "colours", "symbols.count": "symbols", "mixes.count": "paint mixes",
  "symbols.base": "number base", "ranks.count": "ranks", "suits.count": "suits", "faces.count": "picture cards",
  "bounds.min": "smallest number", "bounds.max": "biggest number", "length.max": "longest text",
};

/** Labels of single-parameter changes that make `c` hold ("Playing cards", "size 3, 5 or 7"). */
function choices(c: Constraint, inst: Instantiation): string[] {
  const def = TYPES.get(inst.objectType);
  if (!def) return [];
  const out: string[] = [];
  for (const p of def.params) {
    const cur = inst.args[p.id];
    const pool = p.kind === "int" && p.presets ? p.presets.filter(v => v !== cur) : candidates(p, cur, [c]);
    const ok = pool.filter(v => {
      const next = tryInstantiate(def, { ...inst.args, [p.id]: v });
      return next !== null && satisfied(c, next);
    });
    if (!ok.length) continue;
    if (p.kind === "component") out.push(...ok.map(v => p.options.find(o => o.id === v)!.label));
    else if (ok.length <= 6) out.push(`${p.label.toLowerCase()} ${orList((ok as number[]).sort((a, b) => a - b).map(String))}`);
  }
  return out;
}

function needs(c: Constraint): string {
  if ("not" in c) return "has something this rule can't use";
  if ("has" in c) { const b = capabilityClass(c.has).badge; return `needs ${b.emoji} ${b.label}`; }
  const word = TERM_WORDS[c.term] ?? c.term;
  if ("parity" in c) {
    if (c.term === "size") return c.parity === "odd" ? "needs a middle square" : "needs an even board size";
    return `needs an ${c.parity} ${word}`;
  }
  if (c.term === "size") {
    return c.op === ">=" ? `needs a bigger board: size ${c.value} or more`
      : c.op === "<=" ? `needs a smaller board: size ${c.value} or less` : `needs board size ${c.value}`;
  }
  const amount = c.op === ">=" ? "at least" : c.op === "<=" ? "at most" : "exactly";
  return c.term.endsWith(".count") ? `needs ${amount} ${c.value} ${word}` : `needs the ${word} to be ${amount} ${c.value}`;
}

/** Kid wording for one unmet constraint: "needs ♠ Suits: pick Playing cards". */
export function explain(c: Constraint, inst: Instantiation): string {
  const head = "not" in c && "has" in c.not
    ? `doesn't work with ${capabilityClass(c.not.has).badge.emoji} ${capabilityClass(c.not.has).badge.label}`
    : needs(c);
  const pick = choices(c, inst);
  return pick.length && !head.includes(" or more") && !head.includes(" or less") ? `${head}: pick ${orList(pick)}` : head;
}

/** Badges a satisfied constraint list earns: the maximal classes, then refinement badges. */
export function badgesFor(constraints: readonly Constraint[]): Badge[] {
  const classes = maximalClasses(closure(constraints.flatMap(c => "has" in c ? [c.has] : [])));
  const out: Badge[] = classes.map(id => capabilityClass(id).badge);
  for (const c of constraints) {
    if (!("term" in c)) continue;
    if (c.term === "size" && "parity" in c && c.parity === "odd")
      out.push({ id: "size:odd", emoji: "🎯", label: "Middle square", kid: "The board has a middle square" });
    else if (c.term === "size" && "op" in c && c.op === ">=")
      out.push({ id: `size>=${c.value}`, emoji: "📏", label: "Big board", kid: `Needs a board of size ${c.value} or more` });
    else if (c.term === "colours.count" && "op" in c && c.op === ">=")
      out.push({ id: `colours>=${c.value}`, emoji: "🌈", label: "More colours", kid: `Needs at least ${c.value} colours` });
  }
  return out;
}

export function resolve(constraints: readonly Constraint[], inst: Instantiation): Resolution {
  const unmet = constraints.filter(c => !satisfied(c, inst));
  if (!unmet.length) return { ok: true, badges: badgesFor(constraints) };
  const patch = unlock(constraints, inst);
  return { ok: false, unmet, reason: explain(unmet[0], inst), ...(patch ? { unlock: patch } : {}) };
}

/** null when available, else the kid reason. */
export function lockedReason(constraints: readonly Constraint[], inst: Instantiation): string | null {
  const r = resolve(constraints, inst);
  return r.ok ? null : r.reason;
}
