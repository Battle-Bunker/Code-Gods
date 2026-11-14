/** One sandbox per language, started on first use (Python's bootstrap takes about a second). */
import { createSandbox, type Language, type Sandbox, type SandboxOptions } from "@workspace/v2-sandbox";

export interface Sandboxes {
  get(language: Language): Promise<Sandbox>;
  close(): Promise<void>;
}

export function sandboxes(execution: SandboxOptions["execution"] = "inline"): Sandboxes {
  const made = new Map<Language, Promise<Sandbox>>();
  return {
    get(language) {
      let s = made.get(language);
      if (!s) {
        s = createSandbox({ language, execution });
        s.catch(() => made.delete(language));   // a failed start is retried by the next get
        made.set(language, s);
      }
      return s;
    },
    async close() {
      const all = [...made.values()];
      made.clear();
      for (const s of await Promise.allSettled(all)) if (s.status === "fulfilled") s.value.close();
    },
  };
}
