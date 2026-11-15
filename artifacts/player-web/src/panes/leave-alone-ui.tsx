/**
 * The forge's leave-alone control (./leave-alone.ts): "Simple leaves these lines alone: [3, 19] Save". Only the code's
 * leave-alone list changes, through the directory's `agent.leaveAlone` (so the palette and assistants do the same).
 */
import { useGame } from "@/sdk";
import { useEffect, useRef, useState } from "react";
import { useAffordance } from "@workspace/v2-affordances/react";
import { readLeave, setLeave } from "@workspace/v2-agents/pure";
import { failureText } from "@/site/components/action";
import { editPrice, type Language } from "./forge-model";
import { leaveLine, listWords, parseNumbers, missingLeave } from "./leave-alone";
import { askedRecently, onForgeRequest, takeForgeRequest } from "./forge-request";

/**
 * Puts focus in the field for up to 2 s while nothing else holds it: the palette hands focus back as it closes, at a
 * moment that varies, so one early focus() was lost (round 10). Never takes focus from something the player chose.
 */
function useClaimFocus(box: React.RefObject<HTMLElement | null>) {
  return () => {
    const until = Date.now() + 2000;
    const t = setInterval(() => {
      const input = box.current?.querySelector("input");
      const active = document.activeElement;
      if (!input || active === input || Date.now() > until) { clearInterval(t); return; }
      if (!active || active === document.body) input.focus({ preventScroll: true });
    }, 100);
    return () => clearInterval(t);
  };
}

export function LeaveAlone({ agentId, name, language, source, one, many }: {
  agentId: string; name: string; language: Language; source: string; one: string; many: string;
}) {
  const op = useAffordance("agent.leaveAlone");
  const header = useGame();
  const now = readLeave(source);
  const [text, setText] = useState(now?.join(", ") ?? "");
  const [said, setSaid] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // A new version of the agent (this control or another surface) shows its own list.
  useEffect(() => { setText(readLeave(source)?.join(", ") ?? ""); }, [source]);
  // Advice elsewhere ("leave line 3 alone") fills the list in (added to what is there) and brings it into view.
  const box = useRef<HTMLElement>(null);
  const claimFocus = useClaimFocus(box);
  useEffect(() => {
    const take = () => {
      const r = takeForgeRequest("leave");
      if (!r) return;
      setText([...new Set([...(readLeave(source) ?? []), ...r.numbers])].sort((a, b) => a - b).join(", "));
      setSaid(null);
      const reveal = () => { box.current?.scrollIntoView({ block: "nearest" }); box.current?.querySelector("input")?.focus({ preventScroll: true }); };
      requestAnimationFrame(reveal);
      // Again once the palette's dialog has closed: it hands focus back to where it was (round 10: the control never got it).
      claimFocus();
    };
    take();
    return onForgeRequest(take);
  }, [source]);
  // Mounted (or remounted by the dock) just after a request: focus the field, once the palette has let go of focus.
  useEffect(() => (askedRecently("leave") ? claimFocus() : undefined), []);   // eslint-disable-line react-hooks/exhaustive-deps
  if (op.hidden) return null;
  if (now === null) return <p ref={box as React.RefObject<HTMLParagraphElement>} className="border-t pt-2 text-xs text-muted-foreground" data-testid="leave-alone-missing">{missingLeave(name)}</p>;
  const parsed = parseNumbers(text, one);
  const next = "numbers" in parsed ? parsed.numbers : null;
  const changed = next !== null && next.join(",") !== now.join(",");
  const price = next && changed ? editPrice(language, source, setLeave(source, next)!, header?.priceScale ?? 1) : 0;
  const save = async () => {
    if (!next || !changed || busy) return;
    setBusy(true); setSaid(null);
    try {
      const r = await op.run({ agentId, numbers: next });
      setSaid({ tone: "ok", text: `${name} now leaves ${listWords(next, one, many)} alone (it cost ${r.price.toFixed(2)} energy).` });
    } catch (e) { setSaid({ tone: "error", text: failureText(e) }); }
    finally { setBusy(false); }
  };
  return (
    <form ref={box as React.RefObject<HTMLFormElement>} className="space-y-1 border-t pt-2 text-sm" data-testid="leave-alone" onSubmit={e => { e.preventDefault(); void save(); }}>
      <label className="flex flex-wrap items-center gap-2">
        <span>{name} leaves these {many} alone:</span>
        <input value={text} onChange={e => { setText(e.target.value); setSaid(null); }} placeholder="e.g. 3, 19" inputMode="numeric"
          aria-label={`${one} numbers ${name} leaves alone`} className="h-8 w-32 border bg-background px-2" data-testid="input-leave-alone" />
        <button type="submit" disabled={!changed || busy || !op.available} title={op.reason}
          className="border px-3 py-1 disabled:opacity-50" data-testid="button-leave-alone">{busy ? "Saving…" : "Save"}</button>
      </label>
      <p className={`text-xs ${"error" in parsed ? "text-destructive" : "text-muted-foreground"}`} data-testid="text-leave-alone">
        {"error" in parsed ? parsed.error : leaveLine({ agent: name, now, next: next!, price, one, many })} Use it to keep a deal made in chat.
      </p>
      {said && <p className={said.tone === "ok" ? "text-sm font-medium" : "text-sm text-destructive"} role="status" data-testid="text-leave-alone-done">{said.tone === "ok" ? "✓ " : ""}{said.text}</p>}
    </form>
  );
}
