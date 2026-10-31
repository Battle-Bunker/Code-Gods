/**
 * `pnpm player panel list | push <slug> | pull <slug>`: move panels between files and the engine's panel store
 * (docs/panels.md "Stored panels"), as the human the device credential belongs to. A thin client of the public
 * panel functions; the registry tools (docs/surface-architecture.md §4) will cover the same ground for agents.
 *
 * Files default to artifacts/player-web/src/panels/<slug>.tsx in this repository; --file PATH picks another
 * (relative to where pnpm was run). pull never overwrites a file without --force.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { api, type Engine } from "./engine.ts";

export class PanelCliError extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

const PANELS_DIR = fileURLToPath(new URL("../../../artifacts/player-web/src/panels/", import.meta.url));
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;

export function panelFile(slug: string, file: string | undefined, cwd = process.env.INIT_CWD ?? process.cwd()): string {
  return file ? resolve(cwd, file) : resolve(PANELS_DIR, `${slug}.tsx`);
}

function slugOf(value: unknown): string {
  if (typeof value !== "string" || !SLUG.test(value)) throw new PanelCliError("INVALID", "Give the panel's slug: kebab-case, like its file name (e.g. `my-view`).");
  return value;
}

/** Runs one panel subcommand; returns the JSON to print and whether it succeeded. */
export async function runPanel(engine: Engine, sub: string, flags: Record<string, string | boolean>): Promise<{ result: unknown; ok: boolean }> {
  const file = typeof flags.file === "string" ? flags.file : undefined;
  switch (sub) {
    case "list": {
      const panels = await engine.query(api.panels.list, {});
      return { ok: true, result: { panels } };
    }
    case "push": {
      const slug = slugOf(flags._);
      const path = panelFile(slug, file);
      if (!existsSync(path)) throw new PanelCliError("INVALID", `No file ${path}`);
      const result = await engine.action(api.panels.save, { slug, source: readFileSync(path, "utf8") });
      return { ok: result.ok, result: { ...result, file: path } };
    }
    case "pull": {
      const slug = slugOf(flags._);
      const version = flags.version === undefined ? undefined : Number(flags.version);
      if (version !== undefined && !(Number.isInteger(version) && version > 0)) throw new PanelCliError("INVALID", "--version must be a positive integer");
      const path = panelFile(slug, file);
      if (existsSync(path) && flags.force !== true) throw new PanelCliError("INVALID", `${path} exists; pass --force to overwrite it`);
      const code = await engine.query(api.panels.code, { slug, ...(version ? { version } : {}) });
      writeFileSync(path, code.source);
      return { ok: true, result: { slug, version: code.version, author: code.author, file: path } };
    }
    default:
      throw new PanelCliError("INVALID", "Usage: pnpm player panel list | push <slug> [--file PATH] | pull <slug> [--version N] [--file PATH] [--force]");
  }
}
