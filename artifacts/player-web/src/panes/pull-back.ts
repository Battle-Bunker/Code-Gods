/**
 * "Pull power back to pay for this" (owner, 14 November): when a summon or an edit costs more than the own store
 * holds, lower every agent to a sliver of power for a moment (`power.allocate`, absolute shares: the rest feeds the own
 * store), let the store fill, pay, then propose a split that includes the new agent for the player to confirm. Pure:
 * the plan and the proposal; the pane runs them through the directory's operations.
 */

/** The share each agent keeps while the store fills (a share must stay above 0; stopping an agent is agent.destroy). */
export const PULL_SHARE = 0.01;

export interface PullBackInput {
  /** The player's power (energy a second) and own store. */
  power: number; energy: number;
  /** How many seconds of its income the own store holds (capacity ÷ own income). */
  chargeSeconds: number;
  agents: readonly { agentId: string; share: number }[];
  price: number;
}

/** The pull-back, or null when there is no agent to pull from or the store already pays. */
export function pullBackPlan(o: PullBackInput): { shares: Record<string, number>; perSecond: number; seconds: number; fits: boolean } | null {
  if (o.agents.length === 0 || o.price <= o.energy) return null;
  const shares = Object.fromEntries(o.agents.map(a => [a.agentId, PULL_SHARE]));
  const perSecond = o.power * (1 - PULL_SHARE * o.agents.length);
  return {
    shares, perSecond,
    seconds: perSecond > 0 ? Math.ceil((o.price - o.energy) / perSecond) : Infinity,
    // The store holds chargeSeconds of its income: with more income it holds more.
    fits: o.price <= perSecond * o.chargeSeconds,
  };
}

const r4 = (x: number) => Math.round(x * 10000) / 10000;

/**
 * The split to propose after paying: the agents together hold what they held before; a new agent gets an equal part of
 * it and the others shrink in proportion. After an edit (no new agent) the split is as it was.
 */
export function proposedSplit(before: Readonly<Record<string, number>>, newAgent: string | null): Record<string, number> {
  if (!newAgent) return { ...before };
  const ids = Object.keys(before);
  const total = ids.reduce((t, id) => t + before[id]!, 0);
  if (!(total > 0)) return { [newAgent]: 0.5 };
  const fresh = total / (ids.length + 1);
  const scale = (total - fresh) / total;
  return { ...Object.fromEntries(ids.map(id => [id, r4(before[id]! * scale)])), [newAgent]: r4(fresh) };
}

/** A summon or an edit the server refused for want of energy: its numbers (agent.summon / agent.replace `error.data`). */
export interface Shortfall { price: number; store: number; secondsToPay: number | null; payNow: Record<string, number> | null }

/** The shortfall a refusal carries, or null when it is another refusal. */
export function shortfallOf(e: unknown): Shortfall | null {
  const d = (e as { data?: Record<string, unknown> } | null)?.data;
  if (!d || typeof d.price !== "number" || typeof d.store !== "number") return null;
  const payNow = (d.payNow as { shares?: Record<string, number> } | null)?.shares ?? null;
  return { price: d.price, store: d.store, secondsToPay: typeof d.secondsToPay === "number" ? d.secondsToPay : null, payNow };
}

const fmt = (x: number) => x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** The words beside a refused purchase: both ways to pay, or why waiting never pays. */
export function shortText(s: Shortfall, verb: "summon" | "edit", planning = false): string {
  const head = `This ${verb} costs ${fmt(s.price)} energy and your store holds ${fmt(s.store)} energy`;
  if (planning) return `${head}. Energy only comes in once the world runs: pull power back from your agents to pay now, or start the world.`;
  if (s.secondsToPay === null) return `${head}: waiting never pays it at this split. Pull power back from your agents, or shorten the code.`;
  const n = Math.max(1, Math.ceil(s.secondsToPay));
  return `${head}: it pays by itself in about ${n} second${n === 1 ? "" : "s"}, or pull power back from your agents to pay now.`;
}
