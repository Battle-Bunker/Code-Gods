import type { ReactNode } from "react";
import { GLOSSARY, type GlossaryId } from "./glossary.ts";

/** A glossary term: hover for the gloss; with `onAsk`, a small button hands the term to the assistant. */
export function Term({ id, children, onAsk }: { id: GlossaryId; children?: ReactNode; onAsk?: (draft: string) => void }) {
  const { term, gloss } = GLOSSARY[id];
  return (
    <span className="ui-term" data-term={id}>
      <abbr title={gloss} className="underline decoration-dotted cursor-help">{children ?? term}</abbr>
      {onAsk && <button type="button" className="ml-1 text-[10px] underline opacity-70" onClick={() => onAsk(`Explain "${term}" in this game, with an example from my situation.`)} aria-label={`Ask about ${term}`}>ask</button>}
    </span>
  );
}
