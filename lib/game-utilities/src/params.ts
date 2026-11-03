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
import type { ParamScalar, Params } from "./types.ts";

export type ParamType =
  | { readonly kind: "colour" }
  | { readonly kind: "symbol" }
  | { readonly kind: "int"; readonly min: number; readonly max: number }
  | { readonly kind: "choice"; readonly options: readonly (readonly [value: string, label: string])[] }
  | { readonly kind: "bool" };
export type ParamKind = ParamType["kind"];

/** One declared param: its type and a plain label ("Your colour", "Magic number"). */
export type ParamDecl = ParamType & { readonly label: string };
/** A family's declaration: every param by name (the keys of its params, exactly). */
export type ParamDecls<P extends Params> = { readonly [K in keyof P]: ParamDecl };

/** One value a param can take here, with how to show it. */
export interface ParamOption {
  readonly value: ParamScalar;
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
  readonly options: readonly ParamOption[];
}

export const colourParam = (label: string): ParamDecl => ({ kind: "colour", label });
export const symbolParam = (label: string): ParamDecl => ({ kind: "symbol", label });
export const intParam = (label: string, min: number, max: number): ParamDecl => ({ kind: "int", label, min, max });
export const boolParam = (label: string): ParamDecl => ({ kind: "bool", label });
export const choiceParam = (label: string, options: readonly (readonly [string, string])[]): ParamDecl => ({ kind: "choice", label, options });

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
  }
}

/** A family's declaration resolved against an instantiation, in declaration order. */
export function resolveParams(decls: { readonly [key: string]: ParamDecl }, inst: Instantiation): ParamField[] {
  return Object.entries(decls).map(([key, d]) => ({ key, label: d.label, kind: d.kind, options: paramOptions(d, inst) }));
}

/** Whether every declared param of `params` holds a value of its domain (and nothing undeclared is present). */
export function paramsInDomain(fields: readonly ParamField[], params: Params): boolean {
  const keys = Object.keys(params);
  if (keys.length !== fields.length || !fields.every(f => keys.includes(f.key))) return false;
  return fields.every(f => f.options.some(o => o.value === params[f.key]));
}

/** How a param's value reads to a person: its option's label ("A (10)"), or the value itself. */
export function paramLabel(field: ParamField, value: unknown): string {
  return field.options.find(o => o.value === value)?.label ?? String(value);
}
