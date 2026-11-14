/**
 * Loads a stored panel's compiled CommonJS inside its sandboxed frame. `require` hands out the frame's own modules
 * (one React, the v2 SDK) and refuses anything else. A panel that reads a name the v2 SDK does not have was written
 * for the first engine's SDK: it is refused before it runs (the names are read from the compiled code), and a name
 * read some other way fails with the same reason when it is read. A (slug, version) is immutable, so it is evaluated
 * once and the same result is returned afterwards: React keeps the mounted panel when nothing changed.
 */
import { isPanelDefinition, PANEL_SDK, type PanelDefinition } from "../sdk/panel.ts";
import type { BridgePanel } from "./protocol.ts";

export type LoadStatus =
  | { status: "ready"; definition: PanelDefinition }
  | { status: "failed"; message: string };

const describe = (error: unknown) => (error instanceof Error ? `${error.name}: ${error.message}` : String(error));
/** Names every module has, or that CommonJS interop reads. */
const MODULE_NAMES = new Set(["default", "__esModule", "then", "toJSON", "$$typeof"]);

const oldSdk = (names: readonly string[]) =>
  `This panel uses ${names.join(", ")}, which version ${PANEL_SDK} of the panel SDK does not have. A panel written for the first version of the game does not load in v2 games; ask your assistant to rewrite it for version ${PANEL_SDK}.`;

/** The names read from "@sdk" in compiled CommonJS: `const sdk_1 = require("@sdk")` (or a namespace import), then `sdk_1.name`. */
export function sdkNamesUsed(compiled: string): string[] {
  const bindings = [...compiled.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:__importStar\(|__importDefault\()?\s*require\(\s*["']@sdk["']\s*\)/g)].map(m => m[1]!);
  const names = new Set<string>();
  for (const b of new Set(bindings)) {
    for (const m of compiled.matchAll(new RegExp(`(?<![\\w$.])${b.replace(/\$/g, "\\$")}\\.([A-Za-z_$][\\w$]*)`, "g"))) names.add(m[1]!);
  }
  return [...names].filter(n => !MODULE_NAMES.has(n));
}

function definitionOf(slug: string, exports: Record<string, unknown>): LoadStatus {
  const value = exports.default;
  if (isPanelDefinition(value) && value.sdk === PANEL_SDK) return { status: "ready", definition: value };
  return { status: "failed", message: `Panel "${slug}" must \`export default definePanel({ title, Component })\` (from "@sdk").` };
}

export function createLoader(modules: Readonly<Record<string, unknown>>) {
  const allowed = Object.keys(modules);
  const sdk = modules["@sdk"] as Record<string, unknown> | undefined;
  // A name the SDK lacks fails with the reason when read, however the panel spells the read.
  const guarded = sdk && new Proxy(sdk, {
    get(target, name, receiver) {
      if (typeof name === "string" && !MODULE_NAMES.has(name) && !Object.hasOwn(target, name)) throw new Error(oldSdk([name]));
      return Reflect.get(target, name, receiver);
    },
  });
  const require = (name: string): unknown => {
    if (!Object.hasOwn(modules, name)) throw new Error(`"${name}" is not available to panels; they may import only ${allowed.map(m => `"${m}"`).join(", ")}.`);
    return name === "@sdk" ? guarded : modules[name];
  };
  const cache = new Map<string, LoadStatus>();
  return {
    load(panel: BridgePanel): LoadStatus {
      const key = `${panel.slug}@${panel.version}`;
      const cached = cache.get(key);
      if (cached) return cached;
      let status: LoadStatus;
      const missing = sdk ? sdkNamesUsed(panel.compiled).filter(n => !Object.hasOwn(sdk, n)) : [];
      if (missing.length) status = { status: "failed", message: oldSdk(missing) };
      else {
        try {
          const module = { exports: {} as Record<string, unknown> };
          // The frame's CSP allows 'unsafe-eval'; the sandbox (an opaque origin, connect-src 'none') is the boundary.
          new Function("exports", "require", "module", `${panel.compiled}\n//# sourceURL=panel:${panel.slug}@${panel.version}.js`)(module.exports, require, module);
          status = definitionOf(panel.slug, module.exports ?? {});
        } catch (error) {
          status = { status: "failed", message: describe(error) };
        }
      }
      cache.set(key, status);
      return status;
    },
  };
}
