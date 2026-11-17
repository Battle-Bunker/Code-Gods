/**
 * A rule's code, collapsed (as production's goal card kept a rule's source): the family's definition from its source
 * file (rule-code-text.ts), loaded when first opened, and the parameters this rule was dealt.
 */
import { useEffect, useState } from "react";
import { ruleCode } from "./rule-code-text";

const files = import.meta.glob(["../../../../lib/v2-linear/src/*families*.ts", "../../../../lib/v2-grid/src/*families*.ts"], { query: "?raw", import: "default" }) as Record<string, () => Promise<string>>;

async function load(): Promise<Record<string, string>> {
  const entries = await Promise.all(Object.entries(files).map(async ([path, read]) => [path, await read()] as const));
  return Object.fromEntries(entries);
}

export function RuleCode({ familyId, params }: { familyId: string; params: unknown }) {
  const [open, setOpen] = useState(false);
  const [found, setFound] = useState<{ file: string; code: string } | null | undefined>(undefined);
  useEffect(() => {
    if (!open || found !== undefined) return;
    let live = true;
    void load().then(all => { if (live) setFound(ruleCode(all, familyId)); }, () => { if (live) setFound(null); });
    return () => { live = false; };
  }, [open, found, familyId]);
  return (
    <details className="text-xs" data-testid="rule-code" onToggle={e => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer text-muted-foreground">Code</summary>
      {open && (found === undefined ? <p className="mt-1 text-muted-foreground">Loading…</p>
        : found === null ? <p className="mt-1 text-muted-foreground">This rule's code is not in this version of the app.</p>
        : (
          <div className="mt-1 space-y-1">
            <p className="text-muted-foreground">Dealt with <code className="font-mono" data-testid="rule-code-params">{JSON.stringify(params, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}</code>; the family's definition, from <code className="font-mono">{found.file}</code> (its shared helpers are defined earlier in that file):</p>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words bg-muted p-2 font-mono text-[11px] leading-snug" data-testid="rule-code-source">{found.code}</pre>
          </div>
        ))}
    </details>
  );
}
