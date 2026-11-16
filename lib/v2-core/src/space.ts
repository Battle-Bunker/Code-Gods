/** Helpers for a family's parameter space (RuleFamily.space, contracts.ts). */
import type { Invalid, ParamSpace } from "./contracts.ts";
import { canonicalJson } from "./hash.ts";

/** Whether a value (stored, sent or typed) is a parameter set of the space: its label parses back to itself. */
export function spaceHas<P>(space: ParamSpace<P>, x: unknown): x is P {
  let back: unknown;
  try {
    const text = space.label(x as P);
    if (typeof text !== "string") return false;
    back = space.parse(text);
  } catch { return false; }
  return !(typeof back === "object" && back !== null && "invalid" in back) && canonicalJson(back) === canonicalJson(x);
}

/**
 * Named fields typed on one line ("d = 2, u = 3/4" or the values alone, "2 3/4", in the fields' order): each field's
 * text, or why the line is not that. A value is any run of characters without spaces or commas.
 */
export function readFields(text: string, fields: readonly string[]): Record<string, string> | Invalid {
  const named = [...text.matchAll(/([A-Za-z]\w*)\s*=\s*([^\s,;=]+)/g)];
  const out: Record<string, string> = {};
  if (named.length) for (const m of named) out[m[1]!] = m[2]!;
  else text.split(/[\s,;]+/).filter(Boolean).forEach((v, i) => { out[fields[i] ?? `#${i}`] = v; });
  const missing = fields.filter(f => out[f] === undefined), extra = Object.keys(out).filter(k => !fields.includes(k));
  return missing.length || extra.length ? { invalid: `write ${fields.map(f => `${f} = …`).join(", ")}` } : out;
}
/** The line readFields reads back. */
export const writeFields = (values: Readonly<Record<string, string | number | bigint>>, fields: readonly string[]): string =>
  fields.map(f => `${f} = ${String(values[f])}`).join(", ");
