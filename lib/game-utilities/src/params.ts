/**
 * Named, typed parameters (owner, 2026-11-03: "clear named and typed parameters … instead of abstruse parameters like
 * x: int that get converted into a colour").
 *
 * A family declares each of its params by name with a type (`ParamDecl`), and the type is resolved against the
 * instantiation into an exact domain (`ParamField.options`): a `colour` is one of the room's colours, stored by its
 * name ("red") and shown with its swatch; a `symbol` is one of the room's symbols, stored as the board prints it
 * ("7", "B", "10♥"); an `int` is a whole number in a range; a `choice` is one of a few named options; a `bool` is on
 * or off. The stored value is the thing itself (the same value the card's constant holds), never an index decoded
 * later. Every consumer reads the fields: the rule gallery's pickers, the goal card (`UtilityCard.params`), the agent
 * views, and the tests that check every support value lies in its domain.
 */
import { COLOUR_COMPONENTS, SYMBOL_COMPONENTS, type GridColourSet, type GridSymbolSet, type Instantiation } from "@workspace/game-types";
import type { ParamJson, Params } from "./types.ts";

export type ParamType =
  | { readonly kind: "colour" }
  | { readonly kind: "symbol" }
  | { readonly kind: "int"; readonly min: number; readonly max: number }
  | { readonly kind: "choice"; readonly options: readonly (readonly [value: ParamJson, label: string])[] }
  | { readonly kind: "bool" }
  /** A fixed number of distinct options, stored as a list in the options' order (Bingo Caller's called ranks). */
  | { readonly kind: "set"; readonly size: number; readonly options: readonly (readonly [value: string, label: string])[] };
export type ParamKind = ParamType["kind"];

/** One declared param: its type and a plain label ("Your colour", "Magic number"). */
export type ParamDecl = ParamType & { readonly label: string };
/** A family's declaration: every param by name (the keys of its params, exactly). */
export type ParamDecls<P extends Params> = { readonly [K in keyof P]: ParamDecl };

/** One value a param can take here, with how to show it. */
export interface ParamOption {
  /** A scalar, or a fixed list for a choice among presets (Smooth Operator's primes). */
  readonly value: ParamJson;
  /** "red", "A (10)", "10♥ (ten of hearts)", "12", "rows". */
  readonly label: string;
  /** Colours: the display colour and a contrasting ink (the board's own tables). */
  readonly swatch?: string;
  readonly ink?: string;
}
/** A param resolved against an instantiation: its name, label, type and exact domain. */
export interface ParamField {
  readonly key: string;
  readonly label: string;
  readonly kind: ParamKind;
  /** Sets only: how many distinct elements a value holds. */
  readonly size?: number;
  readonly options: readonly ParamOption[];
}

export const colourParam = (label: string): ParamDecl => ({ kind: "colour", label });
export const symbolParam = (label: string): ParamDecl => ({ kind: "symbol", label });
export const intParam = (label: string, min: number, max: number): ParamDecl => ({ kind: "int", label, min, max });
export const boolParam = (label: string): ParamDecl => ({ kind: "bool", label });
export const choiceParam = (label: string, options: readonly (readonly [ParamJson, string])[]): ParamDecl => ({ kind: "choice", label, options });
/** `size` distinct values out of `options`, stored in the options' order. */
export const setParam = (label: string, size: number, options: readonly (readonly [string, string])[]): ParamDecl => ({ kind: "set", label, size, options });
/** A choice among a fixed list of values, each labelled by itself (or `labelOf`): Power Hoarder's primes 2, 3, 5, 7. */
export const valuesParam = <T extends ParamJson>(label: string, values: readonly T[], labelOf: (v: T) => string = v => String(v)): ParamDecl =>
  choiceParam(label, values.map(v => [v, labelOf(v)] as const));
/** Values compare by content (lists included). */
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const colourSet = (inst: Instantiation) => (COLOUR_COMPONENTS as Readonly<Record<string, (typeof COLOUR_COMPONENTS)[GridColourSet]>>)[String(inst.args.colours)];
const symbolSet = (inst: Instantiation) => (SYMBOL_COMPONENTS as Readonly<Record<string, (typeof SYMBOL_COMPONENTS)[GridSymbolSet]>>)[String(inst.args.symbols)];

/** The exact values a declared param takes on this instantiation. Throws for a colour or symbol on a shape without them. */
export function paramOptions(decl: ParamDecl, inst: Instantiation): ParamOption[] {
  switch (decl.kind) {
    case "colour": {
      const c = colourSet(inst);
      if (!c) throw new Error(`${inst.key} has no colours for a colour param`);
      return c.names.map((name, i) => ({ value: name, label: name, swatch: c.css[i], ink: c.ink[i] }));
    }
    case "symbol": {
      const s = symbolSet(inst);
      if (!s) throw new Error(`${inst.key} has no symbols for a symbol param`);
      return s.glyphs.map((glyph, i) => ({
        value: glyph,
        // Digits from 10 up and cards carry their meaning (docs/rules-design.md P1).
        label: s.suits ? `${glyph} (${s.names[i]})` : s.values[i] >= 10 ? `${glyph} (${s.values[i]})` : glyph,
      }));
    }
    case "int": return Array.from({ length: Math.max(0, decl.max - decl.min + 1) }, (_, i) => ({ value: decl.min + i, label: String(decl.min + i) }));
    case "choice": return decl.options.map(([value, label]) => ({ value, label }));
    case "bool": return [{ value: false, label: "no" }, { value: true, label: "yes" }];
    // A set's options are its elements; a value is a list of `size` of them (`paramsInDomain` checks it).
    case "set": return decl.options.map(([value, label]) => ({ value, label }));
  }
}

/** A family's declaration resolved against an instantiation, in declaration order. */
export function resolveParams(decls: { readonly [key: string]: ParamDecl }, inst: Instantiation): ParamField[] {
  return Object.entries(decls).map(([key, d]) => ({
    key, label: d.label, kind: d.kind, options: paramOptions(d, inst), ...(d.kind === "set" ? { size: d.size } : {}),
  }));
}

/** Whether every declared param of `params` holds a value of its domain (and nothing undeclared is present). */
export function paramsInDomain(fields: readonly ParamField[], params: Params): boolean {
  const keys = Object.keys(params);
  if (keys.length !== fields.length || !fields.every(f => keys.includes(f.key))) return false;
  return fields.every(f => (f.kind === "set" ? setInDomain(f, params[f.key]) : f.options.some(o => same(o.value, params[f.key]))));
}

/** A set value: `size` distinct elements of the field's options, in their order. */
function setInDomain(f: ParamField, value: unknown): boolean {
  if (!Array.isArray(value) || value.length !== f.size) return false;
  const at = value.map(v => f.options.findIndex(o => o.value === v));
  return at.every((i, k) => i >= 0 && (k === 0 || i > at[k - 1]));
}

/** How a param's value reads to a person: its option's label ("A (10)"), or the value itself. */
export function paramLabel(field: ParamField, value: unknown): string {
  if (field.kind === "set" && Array.isArray(value)) return value.map(v => field.options.find(o => o.value === v)?.label ?? String(v)).join(", ");
  return field.options.find(o => same(o.value, value))?.label ?? String(value);
}
