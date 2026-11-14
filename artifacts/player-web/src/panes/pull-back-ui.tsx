/**
 * "Pull power back to pay for this" in the forge (owner, 14 November; the plan and the proposal are ./pull-back.ts).
 * One press: lower every agent to a sliver of power (`power.allocate`), watch the own store fill, pay (the forge's own
 * summon or replace) as soon as it can, then propose a split that includes the new agent: "Use this split" or "Put it
 * back as it was". Built only from directory operations, so the palette and assistants can do the same steps.
 */
import { useEffect, useRef, useState } from "react";
import { useAffordance } from "@workspace/v2-affordances/react";
import { energyText } from "@/core/words";
import { failureText } from "@/site/components/action";
import type { Agent, Me } from "@/sdk";
import { proposedSplit, pullBackPlan } from "./pull-back";

type Phase = { kind: "idle" } | { kind: "filling"; before: Record<string, number> } | { kind: "paying"; before: Record<string, number> }
  | { kind: "propose"; before: Record<string, number>; proposal: Record<string, number> } | { kind: "done"; text: string };

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function PullBack({ me, agents, price, verb, offer, pay, onStart }: {
  me: Me; agents: readonly Agent[]; price: number;
  /** Whether to offer it now (not for the code just paid for); a pull-back under way stays on screen either way. */
  offer: boolean;
  /** "summon" or "edit": what the energy is for. */
  verb: "summon" | "edit";
  /** Pays with the forge's own operation: the new agent's id after a summon, null after an edit, false when it failed. */
  pay: () => Promise<string | null | false>;
  /** Called when the pull-back starts (it pays from then on, so a purchase waiting to pay itself stands down). */
  onStart?: () => void;
}) {
  const allocate = useAffordance("power.allocate");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const paying = useRef(false);
  const chargeSeconds = me.ownPerSecond > 0 ? me.capacity / me.ownPerSecond : 30;
  const plan = pullBackPlan({ power: me.power, energy: me.energy, chargeSeconds, agents: agents.map(a => ({ agentId: a.agentId, share: a.share })), price });

  // Pay as soon as the store holds the price, once.
  useEffect(() => {
    if (phase.kind !== "filling" || me.energy < price || paying.current) return;
    paying.current = true;
    const before = phase.before;
    setPhase({ kind: "paying", before });
    void pay().then(id => {
      paying.current = false;
      if (id === false) { setPhase({ kind: "propose", before, proposal: before }); return; }
      setPhase({ kind: "propose", before, proposal: proposedSplit(before, id) });
    });
  }, [phase, me.energy, price, pay]);

  const run = async (shares: Record<string, number>, next: Phase) => {
    setError(null);
    try { await allocate.run({ shares }); setPhase(next); } catch (e) { setError(failureText(e)); }
  };
  const names = new Map(agents.map(a => [a.agentId as string, a.name]));
  const splitText = (s: Record<string, number>) => {
    const kept = 1 - Object.values(s).reduce((t, x) => t + x, 0);
    return `${Object.entries(s).map(([id, x]) => `${names.get(id) ?? "your new agent"} ${pct(x)}`).join(", ")}; you keep ${pct(kept)}`;
  };

  if (phase.kind === "idle") {
    if (!offer || !plan || !allocate.available) return null;
    if (!plan.fits) return <p className="text-xs text-muted-foreground" data-testid="text-pull-back">Even all your power cannot store {energyText(price)}: shorten the code.</p>;
    const before = Object.fromEntries(agents.map(a => [a.agentId as string, a.share]));
    return (
      <button type="button" className="self-start border border-primary px-3 py-2 text-sm font-medium" data-testid="button-pull-back"
        title="Your agents keep a sliver of power for a moment; the rest fills your own store, the cost is paid, then you choose the new split."
        onClick={() => { onStart?.(); void run(plan.shares, { kind: "filling", before }); }}>
        Pull power back to pay for this (about {plan.seconds} s)
      </button>
    );
  }
  return (
    <div className="space-y-2 border border-primary/40 px-3 py-2 text-sm" data-testid="panel-pull-back">
      {phase.kind === "filling" && (<>
        <p data-testid="text-pull-back">Your agents are on a sliver of power: your own store is filling for this {verb}.</p>
        <div className="h-1.5 w-full bg-muted" aria-hidden><div className="h-full bg-primary" style={{ width: `${Math.min(100, (me.energy / price) * 100)}%` }} /></div>
        <p className="text-xs text-muted-foreground tabular-nums">{energyText(me.energy)} of {energyText(price)}</p>
        <button type="button" className="text-xs underline underline-offset-4" onClick={() => void run(phase.before, { kind: "idle" })} data-testid="button-pull-back-cancel">Stop and put the split back</button>
      </>)}
      {phase.kind === "paying" && <p data-testid="text-pull-back">Paying for the {verb}…</p>}
      {phase.kind === "propose" && (<>
        <p data-testid="text-pull-back-proposal">Paid. Proposed split: {splitText(phase.proposal)}.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="bg-primary px-3 py-1.5 text-primary-foreground" data-testid="button-pull-back-use"
            onClick={() => void run(phase.proposal, { kind: "done", text: `Your agents have their power again: ${splitText(phase.proposal)}.` })}>Use this split</button>
          <button type="button" className="border px-3 py-1.5" data-testid="button-pull-back-restore"
            onClick={() => void run(phase.before, { kind: "done", text: "Your agents have their power back as it was." })}>Put it back as it was</button>
        </div>
      </>)}
      {phase.kind === "done" && <p data-testid="text-pull-back-done">{phase.text}</p>}
      {error && <p className="text-destructive">{error}</p>}
    </div>
  );
}
