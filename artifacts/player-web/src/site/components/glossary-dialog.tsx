/**
 * The glossary, shown when the view asks for it ("Explain a term", view.showGlossary): one term with its explanation,
 * or the index of every term. Closing it is the viewer's own: the dialog remembers the view version it was closed at
 * and opens again on the next request (a new term, or the index).
 */
import { useState } from "react";
import { GLOSSARY, GLOSSARY_IDS, type GlossaryId } from "@workspace/ui-kit/core";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useView } from "@/core/affordance-runtime";
import { glossaryEntry } from "@/site/lib/glossary-entry";

export function GlossaryDialog() {
  const view = useView();
  const [closedAt, setClosedAt] = useState<number | null>(null);
  const request = view.glossary;
  const open = request !== null && closedAt !== view.version;
  const [picked, setPicked] = useState<GlossaryId | null>(null);
  const shown = picked ?? (request !== null ? glossaryEntry(request) : null);
  const close = () => { setClosedAt(view.version); setPicked(null); };
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) close(); }}>
      <DialogContent className="max-h-[80dvh] overflow-y-auto" data-testid="glossary">
        <DialogHeader>
          <DialogTitle>{shown ? GLOSSARY[shown].term : "Glossary"}</DialogTitle>
          <DialogDescription>{shown ? GLOSSARY[shown].gloss : "Every word the game uses, each with one name."}</DialogDescription>
        </DialogHeader>
        {shown
          ? <button type="button" className="text-left text-sm underline underline-offset-4" onClick={() => setPicked(null)} data-testid="button-glossary-index">All terms</button>
          : (
            <dl className="space-y-2 text-sm" data-testid="glossary-index">
              {GLOSSARY_IDS.map(id => (
                <div key={id}>
                  <dt><button type="button" className="font-medium underline underline-offset-4" onClick={() => setPicked(id)} data-testid={`button-glossary-${id}`}>{GLOSSARY[id].term}</button></dt>
                  <dd className="text-muted-foreground">{GLOSSARY[id].gloss}</dd>
                </div>
              ))}
            </dl>
          )}
      </DialogContent>
    </Dialog>
  );
}
