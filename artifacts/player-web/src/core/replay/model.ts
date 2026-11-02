/**
 * The replay view's pure parts (docs/replay-design.md §5–§7): its deep-link parameters and the sentence each logged
 * event reads as. No React.
 */
import type { ReplayEvent } from "@workspace/player-client/replay";

/** Playback speeds, in world seconds per second. */
export const SPEEDS = [0.25, 0.5, 1, 2, 4, 8, 16, 64] as const;
export const DEFAULT_SPEED = 2;

/** `e`: an exact event cursor (wins over `t`); `t`: a world time; `as`: the god whose view the board shows. */
export type ReplayParams = { e?: number; t?: number; speed: number; play: boolean; as?: string };

const finite = (raw: string | null, min = 0) => {
  if (raw === null || raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= min ? n : undefined;
};

export function parseReplayParams(search: string): ReplayParams {
  const q = new URLSearchParams(search);
  const e = finite(q.get("e")), t = finite(q.get("t")), speed = finite(q.get("speed"));
  const as = q.get("as")?.trim();
  return {
    ...(e !== undefined ? { e: Math.floor(e) } : t !== undefined ? { t } : {}),
    speed: speed !== undefined && (SPEEDS as readonly number[]).includes(speed) ? speed : DEFAULT_SPEED,
    play: q.get("play") === "1",
    ...(as ? { as } : {}),
  };
}

/** The query string for a position (always as an exact event), keeping the page's other parameters. */
export function replaySearch(current: string, p: { e: number; speed: number; as?: string }): string {
  const q = new URLSearchParams(current);
  for (const k of ["e", "t", "speed", "play", "as"]) q.delete(k);
  q.set("e", String(p.e));
  if (p.speed !== DEFAULT_SPEED) q.set("speed", String(p.speed));
  if (p.as) q.set("as", p.as);
  return `?${q}`;
}

/** The last four characters of an id: how agents and objects are named on screen. */
export const shortId = (id: string) => id.slice(-4);

const bits = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(1));
const callText = (calls: unknown) => (Array.isArray(calls) ? calls : []).map(c => {
  const [name, args] = c as [string, Record<string, unknown>];
  return `${name}(${Object.entries(args ?? {}).map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`).join(", ")})`;
}).join(" · ");

/** One event as a sentence; `names` maps god ids to names. */
export function describeEvent(ev: ReplayEvent, names: ReadonlyMap<string, string>): string {
  const god = (id: string | undefined) => (id ? names.get(id) ?? "Someone" : "Someone");
  switch (ev.type) {
    case "phase": {
      const word = { planning: "Planning", running: "Running", paused: "Paused", recovery: "Stopped", ended: "Ended" }[ev.phase];
      return ev.reason ? `${word}: ${ev.reason}` : word;
    }
    case "object.spawned": return `Object ${shortId(ev.objectId)} appeared`;
    case "object.transformed": return `${god(ev.ownerId)}'s agent ${ev.agentId ? shortId(ev.agentId) : "?"} changed object ${shortId(ev.objectId)}: ${callText(ev.calls) || "no calls"}`;
    case "agent.failed": return `${god(ev.ownerId)}'s agent ${shortId(ev.agentId)} failed on object ${shortId(ev.objectId)}: ${ev.reason}`;
    case "agent.summoned": return `${god(ev.ownerId)} summoned agent ${shortId(ev.agentId)} (${ev.language}, ${bits(ev.summonCost)} bits)`;
    case "agent.destroyed": return `${god(ev.ownerId)} destroyed agent ${shortId(ev.agentId)}`;
  }
}
