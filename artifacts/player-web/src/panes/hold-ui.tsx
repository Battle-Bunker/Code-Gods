/**
 * The forge's hold control (./hold.ts): "Hold lines [2, 5] at y = [−1]x + [59]  Save · Stop holding", or a board's 16
 * digits in a grid game. Only TARGET and SETTLE change, through the directory's `agent.hold`.
 */
import { useEffect, useRef, useState } from "react";
import { useAffordance } from "@workspace/v2-affordances/react";
import { readHold, setHold, type HoldTarget } from "@workspace/v2-agents/pure";
import { failureText } from "@/site/components/action";
import { editPrice, type Language } from "./forge-model";
import { onForgeRequest, takeForgeRequest } from "./forge-request";
import { holdLine, holdChanged, missingKnobs } from "./hold";
import { parseNumbers } from "./leave-alone";

export function HoldControl({ agentId, name, language, source, one, many, grid }: {
  agentId: string; name: string; language: Language; source: string; one: string; many: string; grid: boolean;
}) {
  const op = useAffordance("agent.hold");
  const now = readHold(source);
  const box = useRef<HTMLElement>(null);
  const fromNow = () => ({
    numbers: now?.numbers.join(", ") ?? "",
    m: now && now.target && typeof now.target === "object" ? String(now.target.m) : "",
    c: now && now.target && typeof now.target === "object" ? String(now.target.c) : "",
    board: now && typeof now.target === "string" ? now.target : "",
  });
  const [f, setF] = useState(fromNow);
  const [said, setSaid] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setF(fromNow()); }, [source]); // eslint-disable-line react-hooks/exhaustive-deps
  // Advice elsewhere ("hold grid 12 here") fills the control in and brings it into view.
  useEffect(() => {
    const take = () => {
      const r = takeForgeRequest("hold");
      if (r?.kind !== "hold") return;
      if (r.target !== undefined) setF({ numbers: r.numbers.join(", "), m: typeof r.target === "object" ? String(r.target.m) : "", c: typeof r.target === "object" ? String(r.target.c) : "", board: typeof r.target === "string" ? r.target : "" });
      setSaid(null);
      requestAnimationFrame(() => { box.current?.scrollIntoView({ block: "nearest" }); box.current?.querySelector("input")?.focus({ preventScroll: true }); });
    };
    take();
    return onForgeRequest(take);
  }, []);
  if (op.hidden) return null;
  if (now === null) return <p ref={box as React.RefObject<HTMLParagraphElement>} className="border-t pt-2 text-xs text-muted-foreground" data-testid="hold-missing">{missingKnobs(name, "hold")}</p>;
  const nums = parseNumbers(f.numbers, one);
  const target: HoldTarget | undefined = grid
    ? (/^\d{16}$/.test(f.board) ? f.board : f.board === "" ? null : undefined)
    : (f.m === "" && f.c === "" ? null : /^-?\d+$/.test(f.m.replace("−", "-")) && /^-?\d+$/.test(f.c.replace("−", "-")) ? { m: Number(f.m.replace("−", "-")), c: Number(f.c.replace("−", "-")) } : undefined);
  const error = "error" in nums ? nums.error : target === undefined ? (grid ? "A board is its 16 digits, row by row, e.g. 9779855879979779." : "Type whole numbers for m and c, e.g. −1 and 59.") : null;
  const next = !error && "numbers" in nums ? { numbers: nums.numbers, target: target! } : null;
  const changed = !!next && holdChanged(next, now);
  const price = next && changed ? editPrice(language, source, setHold(source, next)!) : null;
  const save = async (hold: { numbers: number[]; target: HoldTarget }) => {
    if (busy) return;
    setBusy(true); setSaid(null);
    try {
      const r = await op.run({ agentId, numbers: hold.numbers, target: hold.target });
      setSaid({ tone: "ok", text: hold.target === null ? `${name} no longer holds anything in place (it cost ${r.price.toFixed(2)} ⚡).` : `${holdLine({ agent: name, ...hold, one, many, price: null })} (It cost ${r.price.toFixed(2)} ⚡.)` });
    } catch (e) { setSaid({ tone: "error", text: failureText(e) }); }
    finally { setBusy(false); }
  };
  const field = "h-8 border bg-background px-2";
  return (
    <form ref={box as React.RefObject<HTMLFormElement>} className="space-y-1 border-t pt-2 text-sm" data-testid="hold" onSubmit={e => { e.preventDefault(); if (next && changed) void save(next); }}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2">
          <span>Hold {many}</span>
          <input value={f.numbers} onChange={e => setF({ ...f, numbers: e.target.value })} placeholder={`all ${many}`} className={`${field} w-24`} aria-label={`${one} numbers to hold`} data-testid="input-hold-numbers" />
        </label>
        {grid ? (
          <label className="flex items-center gap-2"><span>at the board</span>
            <input value={f.board} onChange={e => setF({ ...f, board: e.target.value.replace(/\D/g, "").slice(0, 16) })} placeholder="16 digits, row by row" inputMode="numeric"
              className={`${field} w-48 font-mono`} aria-label="The board's 16 digits" data-testid="input-hold-board" />
          </label>
        ) : (
          <span className="flex items-center gap-1">at y =
            <input value={f.m} onChange={e => setF({ ...f, m: e.target.value })} className={`${field} w-14`} aria-label="m, the gradient" inputMode="numeric" data-testid="input-hold-m" />x +
            <input value={f.c} onChange={e => setF({ ...f, c: e.target.value })} className={`${field} w-14`} aria-label="c, the intercept" inputMode="numeric" data-testid="input-hold-c" />
          </span>
        )}
        <button type="submit" disabled={!changed || busy || !op.available} title={op.reason} className="border px-3 py-1 disabled:opacity-50" data-testid="button-hold">{busy ? "Saving…" : "Save"}</button>
        {now.target !== null && <button type="button" disabled={busy || !op.available} onClick={() => void save({ numbers: [], target: null })} className="text-xs underline underline-offset-4" data-testid="button-hold-stop">Stop holding</button>}
      </div>
      <p className={`text-xs ${error ? "text-destructive" : "text-muted-foreground"}`} data-testid="text-hold">
        {error ?? (next ? holdLine({ agent: name, ...next, one, many, price: changed ? price : null }) : "")} Settling where every player agreed is the deal that pays.
      </p>
      {said && <p className={said.tone === "ok" ? "text-sm font-medium" : "text-sm text-destructive"} role="status" data-testid="text-hold-done">{said.tone === "ok" ? "✓ " : ""}{said.text}</p>}
    </form>
  );
}
