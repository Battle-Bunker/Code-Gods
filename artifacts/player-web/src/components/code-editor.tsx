/**
 * The one code editor (owner, 16 November: lock predicates are programs written "with the same degrees of freedom as
 * agents", in the same editor): a language choice and a code box. Agent code (the forge) and lock predicates use it.
 */
import type { ShippedLanguage } from "@workspace/v2-agents/pure";

export type CodeLanguage = ShippedLanguage;

export function LanguageSelect({ value, onChange, disabled, testId }: { value: CodeLanguage; onChange: (l: CodeLanguage) => void; disabled?: boolean; testId: string }) {
  return (
    <select value={value} disabled={disabled} onChange={e => onChange(e.target.value as CodeLanguage)} className="h-8 border bg-background px-2" aria-label="Language" data-testid={testId}>
      <option value="typescript">TypeScript</option>
      <option value="python">Python</option>
    </select>
  );
}

export function CodeBox({ value, onChange, label, testId, className = "" }: { value: string; onChange: (s: string) => void; label: string; testId: string; className?: string }) {
  return (
    <textarea value={value} onChange={e => onChange(e.target.value)} spellCheck={false} wrap="off" aria-label={label}
      className={`w-full resize-y border bg-[hsl(var(--muted))]/40 p-2 font-mono text-xs leading-relaxed ${className}`} data-testid={testId} />
  );
}
