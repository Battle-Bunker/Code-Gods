/**
 * My agents gallery (dev only: `pnpm --filter @workspace/player-web dev`, then /agents-gallery.html): the panel's view
 * (core/panels/agents.tsx AgentsView) drawn from fixtures: an agent that can act, one waiting for income (negative
 * energy), one at its turn limit, one unnamed; for screenshots and a visual check of the wording.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AgentsView, type Sample } from "@/core/panels/agents";
import type { MyAgent } from "@/sdk";
import "../index.css";

const ok = { ok: true } as const;
const can = { editCode: ok, validate: ok, summon: ok, destroy: ok, allocatePower: ok, look: ok, chat: ok, roomStep: ok };
const base = { source: "def agent(obj):\n    return []", language: "python", randomized: false, outcomes: undefined };
const agents = [
  { ...base, id: "a1", name: "Corner hoarder", description: "Moves big values to the corner.", summonCost: 84, expectedActCost: 10.1, breakdown: { read: 6, change: 4.1 }, energy: 42, eligible: true, powerShare: 0.25, income: 16, capacity: 480, acts: 25, spent: 310, spentRead: 120, skips: 3 },
  { ...base, id: "a2", name: "Digit swapper", summonCost: 61.5, expectedActCost: 8, breakdown: { read: 5, change: 3 }, energy: -12, eligible: false, powerShare: 0.5, income: 32, capacity: 960, acts: 40, spent: 520, spentRead: 200, skips: 0,
    diagnosis: { summary: "30 of 40 acts failed: another object already has this value", hint: "Change the value you write so it differs from the other objects." } },
  { ...base, id: "a3", name: "", summonCost: 30, expectedActCost: 2, energy: 9, eligible: false, powerShare: 0, income: 0, capacity: 0, acts: 0, spent: 0, skips: 0 },
] as unknown as MyAgent[];
const samples = new Map<string, Sample[]>(agents.map((a, k) => [a.id, Array.from({ length: 61 }, (_, t) => {
  const energy = k === 1 ? (t < 20 ? 20 - t * 1.6 : t < 40 ? -12 + (t - 20) * 0.6 : -12 + (t - 20) * 0.1) : k === 0 ? 5 + 37 * Math.abs(Math.sin(t / 9)) : 9;
  return { at: 540 + t, energy, eligible: k === 2 ? false : energy > 0 };
})]));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div className="mx-auto max-w-[460px] bg-card p-4 text-card-foreground">
      <AgentsView agents={agents} self={{ allocated: 0.75, income: 16, energy: 230, capacity: 480 }} powerPerSecond={64} fullChargeSeconds={30} changeReadRatio={32} world={600} samples={samples} window={60} ended={false}
        showCosts showSource={false} can={can} wait={a => (a.energy <= 0 ? -a.energy / (a.income ?? 1) : 0)} onEdit={() => {}} onSetShare={() => {}} onDestroy={() => {}} />
    </div>
  </StrictMode>,
);
