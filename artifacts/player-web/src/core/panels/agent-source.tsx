/** An agent's source under a collapsed "Source" disclosure, highlighted with the assistant's code colouring. */
import { highlight } from "@/core/chat/tool-detail";
import { TOKEN } from "@/core/chat/tool-detail-view";
import { setSourceOpen, sourceOpen } from "./agent-source-state";
import { TextButton } from "./kit";

export function AgentSource({ id, source, language, defaultOpen }: { id: string; source: string; language: string; defaultOpen?: boolean }) {
  return (
    <details data-testid={`details-agent-source-${id}`} open={sourceOpen(id, defaultOpen)} onToggle={e => setSourceOpen(id, e.currentTarget.open)} className="text-xs">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Source · {language}</summary>
      <div className="mt-1 space-y-1">
        <pre className="max-h-64 overflow-auto bg-secondary p-2 font-mono text-[11px] leading-snug text-secondary-foreground"><code data-testid={`text-agent-source-${id}`}>
          {highlight(source, language).map((t, i) => <span key={i} className={TOKEN[t.kind]}>{t.text}</span>)}
        </code></pre>
        <TextButton testId={`button-copy-source-${id}`} onClick={() => { void navigator.clipboard?.writeText(source); }}>Copy</TextButton>
      </div>
    </details>
  );
}
