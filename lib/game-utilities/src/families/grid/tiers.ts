/**
 * Tiered rules for grid families (docs/layered-rules-design.md): a family is a simple base plus a menu of
 * INTERACTIONS, each written once and dealt with its own parameters. A tiered draw's params are the base's params plus
 * `tiers: [{ id, ...params, gate }]`; its ordinal is the gated lexicographic tuple
 *
 *     [...base, base[0] ≥ gate ? tier : 0]
 *
 * so below the gate the rule is exactly its base (same levels, same early climb), and above it the tier breaks ties
 * among boards equal on the base. A gate of 0 is the plain lexicographic composition; `compose: "unlock"` is
 * `[min(base[0], gate), tier, ...base]` (both are Lab variants).
 *
 * A base draw carries no `tiers` key at all, and its card is emitted byte for byte as before, so every existing
 * calibration key is unchanged (test/tiers.test.ts). Tiered draws are never in `support`: a setup asks for them by tier
 * depth (`UtilityFamily.tiered`).
 *
 * The card of a tiered draw is the base's card with the interaction's code appended as a nested function that reads
 * the board and the base's own variables (its vocabulary: kings, subjects, mirror lines), the `return` rewritten to the
 * composition, and the "★ To score even higher" sentences added to the header.
 */
import type { ParamJson, Params, TierCompose, TierParams, CardTier } from "../../types.ts";
import { tierPoints } from "../../tuples.ts";
import { wrap, type Const } from "../card.ts";
import type { GridSpec } from "./_util.ts";
import type { DisjointBase } from "../../tiers/hybrid.ts";

/** A dealt interaction without its gate: which one, and its own params. */
export interface TierValue { readonly id: string; readonly [param: string]: ParamJson }

/** One interaction: an operator over the board and the base's vocabulary, with its parameters. */
export interface Interaction {
  readonly id: string;
  /** The nested function's name on the card: TypeScript, then Python ("magicLines", "magic_lines"). */
  readonly fn: readonly [ts: string, py: string];
  /** Components this tier adds to the ordinal (default 1). */
  readonly arity?: number;
  /** How the value reads in a picker: "lines that add up to 18". */
  readonly label: (v: TierValue, g: GridSpec) => string;
  /** The card's sentences. `points(n)` names this tier's points ("1 tertiary point"). */
  readonly text: (v: TierValue, g: GridSpec, points: (n: number | string) => string) => string;
  /** UPPER_CASE constants the code reads (the dealt params). */
  readonly consts: (v: TierValue, g: GridSpec) => readonly Const[];
  /** The body of the nested function (it returns the tier: a whole number, or a list when `arity` > 1). Plain statements, no indentation. */
  readonly ts: (v: TierValue, g: GridSpec) => string;
  readonly py: (v: TierValue, g: GridSpec) => string;
  /** The representative of the value's symmetry class (x ~ 36 − x on a half-turn base). Default: itself. */
  readonly canonical?: (v: TierValue, g: GridSpec) => TierValue;
}

/** What a grid family declares to carry tiers. */
export interface GridTiers<P extends Params> {
  readonly interactions: readonly Interaction[];
  /** The gate on this shape: the base's first component at which the tier starts to count (the base's ten-move level). */
  readonly gate: (g: GridSpec) => number;
  /** What the gate asks for, after "first get": "6 opposite pairs that add up to 9". */
  readonly gateText: (gate: number, g: GridSpec) => string;
  /** The dealt values on this shape, each of which passed the liveness check there (test/tiers.test.ts re-runs it). Empty: no tiers here. */
  readonly dealt: (g: GridSpec) => readonly TierValue[];
  /** Expert: the dealt pairs of interactions (two tiers). */
  readonly dealtPairs?: (g: GridSpec) => readonly (readonly [TierValue, TierValue])[];
  /** Lab ("uncapped"): alive values outside the balance band (deliberately unequal reach), dealt beside `dealt`. */
  readonly lab?: (g: GridSpec) => readonly TierValue[];
  /** The base as disjoint, equally scored units (exact law and conditional sampler), or null where it has none. */
  readonly base: (p: P, g: GridSpec) => DisjointBase | null;
}

export const tiersOf = (p: Params): readonly TierParams[] => (p.tiers as readonly TierParams[] | undefined) ?? [];
export const isTiered = (p: Params): boolean => tiersOf(p).length > 0;
/** The base's params: everything but `tiers`. */
export function baseParams<P extends Params>(p: P): P {
  if (!("tiers" in p)) return p;
  const { tiers: _tiers, ...rest } = p as Params;
  return rest as P;
}
const valueOf = (t: TierParams): TierValue => {
  const { gate: _gate, compose: _compose, ...v } = t;
  return v as TierValue;
};
export const tierValue = valueOf;

function interactionOf<P extends Params>(spec: GridTiers<P>, id: string): Interaction {
  const it = spec.interactions.find(i => i.id === id);
  if (!it) throw new Error(`unknown interaction ${JSON.stringify(id)}`);
  return it;
}
export const tierArity = <P extends Params>(spec: GridTiers<P>, p: Params): number =>
  tiersOf(p).reduce((a, t) => a + (interactionOf(spec, t.id).arity ?? 1), 0);

/** The tiered params of `base` with these values, composed as asked. */
export function withTiers<P extends Params>(spec: GridTiers<P>, base: P, values: readonly TierValue[], g: GridSpec, compose: TierCompose = "gated"): P {
  const gate = compose === "plain" ? 0 : spec.gate(g);
  if (!values.length) throw new Error("a tiered draw needs at least one interaction");
  return { ...base, tiers: values.map(v => ({ ...v, gate, ...(compose === "unlock" ? { compose: "unlock" } : {}) })) } as unknown as P;
}

/** Every tiered draw of the family on this shape at one depth and composition. */
export function tieredSupport<P extends Params>(spec: GridTiers<P>, bases: readonly P[], g: GridSpec, depth: number, compose: TierCompose = "gated"): P[] {
  // Every composition deals the same values, so a Lab game is the same pool composed differently, and its pool is as
  // large as the ordinary one (a room seats up to 8 gods, each needing a distinct draw). "uncapped" adds the Lab values.
  const one = compose === "uncapped" ? [...spec.dealt(g), ...(spec.lab?.(g) ?? [])] : spec.dealt(g);
  const sets: (readonly TierValue[])[] = depth === 1 ? one.map(v => [v]) : depth === 2 && compose === "gated" ? (spec.dealtPairs?.(g) ?? []).map(pair => [...pair]) : [];
  return bases.flatMap(b => sets.map(vs => withTiers(spec, b, vs, g, compose)));
}

/** The canonical form of a tiered draw's `tiers` (each value folded by its interaction's symmetry). */
export function canonicalTiers<P extends Params>(spec: GridTiers<P>, p: P, g: GridSpec): readonly TierParams[] {
  return tiersOf(p).map(t => {
    const it = interactionOf(spec, t.id), v = it.canonical ? it.canonical(valueOf(t), g) : valueOf(t);
    return { ...v, gate: t.gate, ...(t.compose ? { compose: t.compose } : {}) } as TierParams;
  });
}

// ------------------------------------------------------------------------------------------------
// text
// ------------------------------------------------------------------------------------------------

/** The ★ blocks of a tiered draw, in the order of the ordinal's tier components. */
export function cardTiers<P extends Params>(spec: GridTiers<P>, p: P, g: GridSpec, baseArity: number): CardTier[] {
  const tiers = tiersOf(p), total = baseArity + tierArity(spec, p) + (tiers[0]?.compose === "unlock" ? 1 : 0);
  let index = baseArity;
  return tiers.map(t => {
    const it = interactionOf(spec, t.id), arity = it.arity ?? 1, unlock = t.compose === "unlock";
    // Unlocked tiers sit right after the base's first component, so they are the "secondary" points.
    const at = unlock ? 1 : index;
    const body = it.text(valueOf(t), g, n => tierPoints(n, at, total));
    const text = unlock ? `Once you have ${spec.gateText(t.gate, g)}, these points come before all your other points. ${body}`
      : t.gate > 0 ? `First get ${spec.gateText(t.gate, g)}. ${body}` : body;
    const block: CardTier = { id: t.id, heading: "★ To score even higher", text, gate: t.gate, index: at, arity };
    index += arity;
    return block;
  });
}

/** The whole rule text of a tiered draw: the base's text, then each ★ block. */
export const tieredAbout = (about: string, tiers: readonly CardTier[]): string =>
  [about, ...tiers.map(t => `${t.heading}: ${t.text}`)].join(" ");

// ------------------------------------------------------------------------------------------------
// the card program
// ------------------------------------------------------------------------------------------------

const indentBy = (code: string, pad: string) => code.split("\n").map(l => (l.trim() ? pad + l : l)).join("\n");
function dedentBlock(code: string): string {
  const lines = code.replace(/^\n+/, "").replace(/\s+$/, "").split("\n");
  const ind = Math.min(...lines.filter(l => l.trim()).map(l => l.match(/^ */)![0].length));
  return lines.map(l => l.slice(ind)).join("\n");
}

/** A card's source split into its header (first line, prose, constants) and its program. */
function splitCard(source: string): { title: string; consts: string[]; body: string } {
  const at = source.indexOf("\n\n");
  const head = source.slice(0, at).split("\n"), body = source.slice(at + 2);
  const comment = /^(\/\/|#) /;
  return { title: head[0], consts: head.slice(1).filter(l => !comment.test(l)), body };
}

/**
 * The tiered card: the base card `source` (as the family emits it for the base's params) with the header's prose
 * replaced by `about`, the tiers' constants added, each interaction's code nested before the final `return`, and the
 * `return` rewritten to the composition. `scalar`: the base returns a number, not a list.
 */
export function tieredCard<P extends Params>(lang: "typescript" | "python", source: string, spec: GridTiers<P>, p: P, g: GridSpec,
  about: string, scalar: boolean): string {
  const ts = lang === "typescript", tiers = tiersOf(p), { title, consts, body } = splitCard(source);
  const c = ts ? "//" : "#";
  const gate = tiers[0].gate;
  if (!tiers.every(t => t.gate === gate && t.compose === tiers[0].compose)) throw new Error("the tiers of one rule share one gate and composition");
  const unlock = tiers[0].compose === "unlock";
  const extra: Const[] = [...(gate > 0 ? [["GATE", gate] as Const] : []), ...tiers.flatMap(t => interactionOf(spec, t.id).consts(valueOf(t), g))];
  const lit = (v: unknown): string => (Array.isArray(v) ? `[${v.map(lit).join(", ")}]` : typeof v === "string" ? JSON.stringify(v) : String(v));
  const constLines = extra.map(([k, v, note]) => (ts ? `const ${k} = ${lit(v)};` : `${k} = ${lit(v)}`) + (note ? `  ${c} ${note}` : ""));
  const head = [title, ...wrap(about).map(l => `${c} ${l}`), ...consts, ...constLines].join("\n");

  // The program's last `return` is the base's ordinal.
  const lines = body.replace(/\s+$/, "").split("\n");
  let at = -1;
  for (let i = lines.length - 1; i >= 0; i--) if (/^\s*return\b/.test(lines[i])) { at = i; break; }
  if (at < 0) throw new Error("the base card has no return");
  const pad = lines[at].match(/^\s*/)![0];
  const expr = lines[at].trim().replace(/^return\s*/, "").replace(/;$/, "");
  const out: string[] = [];
  const calls: string[] = [];
  for (const t of tiers) {
    const it = interactionOf(spec, t.id), arity = it.arity ?? 1, name = it.fn[ts ? 0 : 1];
    const code = dedentBlock(ts ? it.ts(valueOf(t), g) : it.py(valueOf(t), g));
    if (ts) out.push(`${pad}function ${name}() {`, indentBy(code, `${pad}  `), `${pad}}`);
    else out.push(`${pad}def ${name}():`, indentBy(code, `${pad}    `));
    const zero = arity === 1 ? "0" : ts ? `[${new Array(arity).fill(0).join(", ")}]` : `(${new Array(arity).fill(0).join(", ")})`;
    const gated = gate > 0 ? (ts ? `base[0] >= GATE ? ${name}() : ${zero}` : `${name}() if base[0] >= GATE else ${zero}`) : `${name}()`;
    calls.push(arity === 1 ? gated : ts ? `...(${gated})` : `*(${gated})`);
  }
  if (ts) {
    out.unshift(`${pad}const base = ${scalar ? `[${expr}]` : expr};`);
    out.push(unlock ? `${pad}return [Math.min(base[0], GATE), ${calls.join(", ")}, ...base];` : `${pad}return [...base, ${calls.join(", ")}];`);
  } else {
    out.unshift(`${pad}base = ${scalar ? `(${expr},)` : expr}`);
    out.push(unlock ? `${pad}return (min(base[0], GATE), ${calls.join(", ")}, *base)` : `${pad}return (*base, ${calls.join(", ")})`);
  }
  lines.splice(at, 1, ...out);
  return `${head}\n\n${lines.join("\n")}\n`;
}

// ------------------------------------------------------------------------------------------------
// the interaction library (written once; a family lists the ones its base can carry)
// ------------------------------------------------------------------------------------------------

const num = (v: TierValue, k: string): number => v[k] as number;

/** Rows, columns and the two long diagonals that add up to x: a unit kind most bases do not score themselves. */
export const linesSum: Interaction = {
  id: "lines", fn: ["magicLines", "magic_lines"],
  label: v => `lines that add up to ${num(v, "x")}`,
  text: (v, _g, points) => `Each row, column or long diagonal that adds up to ${num(v, "x")} scores ${points(1)}.`,
  consts: v => [["LINE_TOTAL", num(v, "x")]],
  ts: () => `
    const lines = [...grid.rows, ...grid.columns, ...grid.diagonals];
    let hits = 0;
    for (const line of lines) {
      let total = 0;
      for (const cell of line) total += cell.value;
      if (total === LINE_TOTAL) hits += 1;
    }
    return hits;`,
  py: () => `
    lines = grid.rows + grid.columns + grid.diagonals
    hits = 0
    for line in lines:
        if sum(cell.value for cell in line) == LINE_TOTAL:
            hits += 1
    return hits`,
};

/** 2×2 squares (every one, overlapping) that add up to x. */
export const windowsSum: Interaction = {
  id: "squares", fn: ["magicSquares", "magic_squares"],
  label: v => `2×2 squares that add up to ${num(v, "x")}`,
  text: (v, _g, points) => `Each 2×2 square, anywhere on the board, that adds up to ${num(v, "x")} scores ${points(1)}.`,
  consts: v => [["SQUARE_TOTAL", num(v, "x")]],
  ts: () => `
    let hits = 0;
    for (const cell of grid.cells) {
      if (!cell.right || !cell.down) continue;
      if (cell.value + cell.right.value + cell.down.value + cell.down.right.value === SQUARE_TOTAL) hits += 1;
    }
    return hits;`,
  py: () => `
    hits = 0
    for cell in grid.cells:
        if cell.right is None or cell.down is None:
            continue
        if cell.value + cell.right.value + cell.down.value + cell.down.right.value == SQUARE_TOTAL:
            hits += 1
    return hits`,
};
