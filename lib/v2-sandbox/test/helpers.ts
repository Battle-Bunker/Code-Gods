import { readFileSync } from "node:fs";
import { createSandbox, type Sandbox, type SandboxOptions, type Language } from "../src/index.ts";

export const agentSource = (name: string) => readFileSync(new URL(`./agents/${name}`, import.meta.url), "utf8");

/** One sandbox per language and execution mode for a test file (Python's bootstrap takes about a second). */
export function sandboxes(execution: SandboxOptions["execution"] = "inline") {
  const made = new Map<Language, Promise<Sandbox>>();
  return {
    get(language: Language) {
      if (!made.has(language)) made.set(language, createSandbox({ language, execution }));
      return made.get(language)!;
    },
    async close() { for (const s of made.values()) (await s).close(); },
  };
}

/** The probe convention: an agent reports what it saw as the string argument `r` of a call to "probe". */
export function probes(calls: string): string[] {
  const parsed = JSON.parse(calls) as { mutator: string; args: { r: string } }[];
  return parsed.filter(c => c.mutator === "probe").map(c => c.args.r);
}
