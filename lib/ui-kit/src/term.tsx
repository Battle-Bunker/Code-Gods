import { useRef, useState, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { GLOSSARY, type GlossaryId } from "./glossary.ts";

/**
 * A glossary term (palette-and-pages.md §5): a dotted underline; hover (desktop) or tap (touch) shows the gloss. With
 * `onAsk`, the popover also offers "Ask the assistant", which hands off "Explain ‹term› using my current game".
 */
export function Term({ id, children, onAsk }: { id: GlossaryId; children?: ReactNode; onAsk?: (draft: string) => void }) {
  const { term, gloss } = GLOSSARY[id];
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hover = (next: boolean) => (e: { pointerType: string }) => {
    if (e.pointerType !== "mouse") return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(next), next ? 120 : 200);
  };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" className="ui-term inline p-0 m-0 bg-transparent border-0 [font:inherit] text-inherit underline decoration-dotted underline-offset-2 cursor-help"
          data-term={id} onPointerEnter={hover(true)} onPointerLeave={hover(false)} aria-label={`${term}: what it means`}>
          {children ?? term}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="top" align="start" sideOffset={6} onPointerEnter={hover(true)} onPointerLeave={hover(false)}
          onOpenAutoFocus={e => e.preventDefault()} data-testid={`popover-term-${id}`}
          className="z-[95] max-w-xs border border-border bg-popover text-popover-foreground px-3 py-2 text-xs shadow-md">
          <p><span className="font-medium">{term}.</span> {gloss}</p>
          {onAsk && (
            <button type="button" className="mt-1.5 underline text-primary" onClick={() => { setOpen(false); onAsk(`Explain "${term}" using my current game.`); }}>
              Ask the assistant
            </button>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
