/**
 * Loads a stored panel's compiled CommonJS inside its sandboxed frame. `require` hands out the frame's own
 * module instances (one React, one SDK) and refuses anything else with a PanelImportError. A (slug, version) is
 * immutable, so it is evaluated once and the same status object is returned afterwards: React keeps the mounted
 * panel when nothing changed.
 */
import { isPanelDefinition, type PanelDefinition } from "../shell/panel-types.ts";

export class PanelImportError extends Error {
  constructor(name: string, allowed: readonly string[]) {
    super(`"${name}" is not available to panels; they may import only ${allowed.map(m => `"${m}"`).join(", ")}.`);
    this.name = "PanelImportError";
  }
}

export type LoadStatus =
  | { status: "ready"; module: unknown; definition: PanelDefinition }
  | { status: "failed"; message: string };

const describe = (error: unknown) => error instanceof Error ? `${error.name}: ${error.message}` : String(error);

function definitionOf(slug: string, module: Record<string, unknown>): LoadStatus {
  const value = module.default;
  if (isPanelDefinition(value)) return { status: "ready", module, definition: value };
  if (typeof value === "function") return { status: "ready", module, definition: { title: slug, Component: value as PanelDefinition["Component"] } };
  return { status: "failed", message: `Panel "${slug}" must \`export default definePanel({ title, Component })\` (from "@sdk").` };
}

export function createLoader(modules: Readonly<Record<string, unknown>>) {
  const allowed = Object.keys(modules);
  const cache = new Map<string, LoadStatus>();
  const require = (name: string): unknown => {
    if (!Object.hasOwn(modules, name)) throw new PanelImportError(name, allowed);
    return modules[name];
  };
  return {
    require,
    load(slug: string, version: number | string, compiled: string): LoadStatus {
      const key = `${slug}@${version}`;
      const cached = cache.get(key);
      if (cached) return cached;
      let status: LoadStatus;
      try {
        const module = { exports: {} as Record<string, unknown> };
        // The frame's CSP allows 'unsafe-eval' (the utility evaluator needs it too); the sandbox is the boundary.
        new Function("exports", "require", "module", `${compiled}\n//# sourceURL=panel:${slug}@${version}.js`)(module.exports, require, module);
        status = definitionOf(slug, module.exports ?? {});
      } catch (error) {
        status = { status: "failed", message: describe(error) };
      }
      cache.set(key, status);
      return status;
    },
  };
}
