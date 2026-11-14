/**
 * The forge's leave-alone control (./leave-alone.ts): "Simple leaves these lines alone: [3, 19] Save". Only the code's
 * leave-alone list changes, through the directory's `agent.leaveAlone` (so the palette and assistants do the same).
 */
import { useEffect, useRef, useState } from "react";
import { useAffordance } from "@workspace/v2-affordances/react";
import { readLeave, setLeave } from "@workspace/v2-agents/pure";
import { failureText } from "@/site/components/action";
import { editPrice, type Language } from "./forge-model";
import { leaveLine, listWords, parseNumbers } from "./leave-alone";
import { missingKnobs } from "./hold";
import { onForgeRequest, takeForgeRequest } from "./forge-request";

export function LeaveAlone({ agentId, name, language, source, one, many }: {
  agentId: string; name: string; language: Language; source: string; one: string; many: string;
}) {
  const op = useAffordance("agent.leaveAlone");
  const now = readLeave(source);
  const [text, setText] = useState(now?.join(", ") ?? "");
  const [said, setSaid] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // A new version of the agent (this control or another surface) shows its own list.
  useEffect(() => { setText(readLeave(source)?.join(", ") ?? ""); }, [source]);
  // Advice elsewhere ("leave line 3 alone") fills the list in (added to what is there) and brings it into view.
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    const take = () => {
      const r = takeForgeRequest("leave");
      if (!r) return;
      setText([...new Set([...(readLeave(source) ?? []), ...r.numbers])].sort((a, b) => a - b).join(", "));
      setSaid(null);
      requestAnimationFrame(() => { box.current?.scrollIntoView({ block: "nearest" }); box.current?.querySelector("input")?.focus({ preventScroll: true }); });
    };
    take();
    return onForgeRequest(take);
  }, [source]);
  if (op.hidden) return null;
  if (now === null) return <p ref={box as React.RefObject<HTMLParagraphElement>} className="border-t pt-2 text-xs text-muted-foreground" data-testid="leave-alone-missing">{missingKnobs(name, "leave")}</p>;
  const parsed = parseNumbers(text, one);
  const next = "numbers" in parsed ? parsed.numbers : null;
  const changed = next !== null && next.join(",") !== now.join(",");
  const price = next && changed ? editPrice(language, source, setLeave(source, next)!) : 0;
  const save = async () => {
    if (!next || !changed || busy) return;
    setBusy(true); setSaid(null);
    try {
      const r = await op.run({ agentId, numbers: next });
      setSaid({ tone: "ok", text: `${name} now leaves ${listWords(next, one, many)} alone (it cost ${r.price.toFixed(2)} ⚡).` });
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
