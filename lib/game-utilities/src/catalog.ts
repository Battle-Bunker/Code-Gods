import type { Domain, Language, ObjectType, ObjectValue, Params, UtilityCard, UtilityDescriptor, UtilityFamily } from "./types.ts";
import { INT_FAMILIES } from "./families/int.ts";
import { STRING_FAMILIES } from "./families/string.ts";

export const FAMILIES: readonly UtilityFamily<any>[] = [...INT_FAMILIES, ...STRING_FAMILIES];
const byId = new Map(FAMILIES.map(family => [family.id, family]));

export const familiesFor = (objectType: ObjectType) => FAMILIES.filter(f => f.objectType === objectType);

export function family(id: string): UtilityFamily<any> {
  const found = byId.get(id);
  if (!found) throw new Error(`Unknown utility family: ${id}`);
  return found;
}

/** Public knowledge: which kinds of gods might be in the pantheon, without parameters. */
export const publicCatalog = (objectType: ObjectType) =>
  familiesFor(objectType).map(({ id, name, theme }) => ({ id, name, theme }));

export function readDescriptor(value: unknown): UtilityDescriptor {
  const d = value as UtilityDescriptor | null;
  if (!d || typeof d !== "object" || typeof d.familyId !== "string" || !d.params || typeof d.params !== "object") {
    throw new Error("Invalid utility descriptor");
  }
  family(d.familyId);
  return d;
}

function wrap(text: string, prefix: string, width = 88): string {
  const lines: string[] = [];
  let line = "";
  for (const token of text.split(" ")) {
    if (line && prefix.length + line.length + 1 + token.length > width) { lines.push(line); line = token; }
    else line = line ? `${line} ${token}` : token;
  }
  if (line) lines.push(line);
  return lines.map(l => `${prefix}${l}`).join("\n");
}

export function source(descriptor: UtilityDescriptor, language: Language): string {
  const f = family(descriptor.familyId), p = descriptor.params;
  const header = `${f.name}: your utility function. It maps an object to [0, 1].`;
  if (language === "python") {
    const type = f.objectType === "Int" ? "int" : "str";
    return `${wrap(header, "# ")}\n#\n${wrap(f.summary(p), "# ")}\n${f.pythonPrelude?.(p) ?? ""}def utility(x: ${type}) -> float:\n${f.python(p)}\n`;
  }
  const type = f.objectType === "Int" ? "number" : "string";
  return `${wrap(header, "// ")}\n//\n${wrap(f.summary(p), "// ")}\nfunction utility(x: ${type}): number {\n${f.typescript(p)}\n}\n`;
}

export function card(descriptor: UtilityDescriptor): UtilityCard {
  const f = family(descriptor.familyId);
  return {
    familyId: f.id, name: f.name, summary: f.summary(descriptor.params),
    source: { python: source(descriptor, "python"), typescript: source(descriptor, "typescript") },
  };
}

const compiled = new Map<string, (x: ObjectValue) => number>();
/**
 * Trusted host evaluator. The TypeScript body is plain JavaScript authored in this
 * package (parameters are numbers or alphanumeric strings), so it is compiled
 * directly; player code never reaches this function.
 */
export function evaluator(descriptor: UtilityDescriptor): (x: ObjectValue) => number {
  const key = JSON.stringify([descriptor.familyId, descriptor.params]);
  let fn = compiled.get(key);
  if (!fn) {
    const f = family(descriptor.familyId);
    fn = new Function("x", f.typescript(descriptor.params)) as (x: ObjectValue) => number;
    if (compiled.size > 1000) compiled.clear();
    compiled.set(key, fn);
  }
  return fn;
}

export function utility(descriptor: UtilityDescriptor, x: ObjectValue): number {
  const u = evaluator(descriptor)(x);
  if (!(u >= 0 && u <= 1)) throw new Error(`Utility ${descriptor.familyId} returned ${u}`);
  return u;
}

export function legal(x: ObjectValue, domain: Domain): boolean {
  return domain.objectType === "Int"
    ? typeof x === "number" && Number.isSafeInteger(x) && x >= domain.intMin && x <= domain.intMax
    : typeof x === "string" && x.length <= domain.stringMaxLength && !/[^\x00-\x7f]/.test(x);
}

export type { Params };
