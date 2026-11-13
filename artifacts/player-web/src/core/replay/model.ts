/**
 * The replay view's pure parts (docs/replay-design.md §5–§7): its deep-link parameters and the sentence each logged
 * event reads as. No React.
 */
import type { ReplayEvent } from "@workspace/player-client/replay";
import { describeChange } from "../panels/score-line.ts";

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

/** The query string for a position (an exact event `e`, or a world time `t`), keeping the page's other parameters. */
export function replaySearch(current: string, p: ({ e: number; t?: undefined } | { t: number; e?: undefined }) & { speed: number; as?: string }): string {
  const q = new URLSearchParams(current);
  for (const k of ["e", "t", "speed", "play", "as"]) q.delete(k);
  if (p.e !== undefined) q.set("e", String(p.e));
  else q.set("t", String(Math.round(p.t * 100) / 100));
  if (p.speed !== DEFAULT_SPEED) q.set("speed", String(p.speed));
  if (p.as) q.set("as", p.as);
  return `?${q}`;
}

/** The last four characters of an id: how agents and objects are named on screen. */
/** A key with Ctrl, Cmd or Alt is the browser's (Alt+Left is Back), never the replay's (parts.tsx useReplayKeys). */
export const replayKeyIgnored = (e: { ctrlKey: boolean; metaKey: boolean; altKey: boolean }) => e.ctrlKey || e.metaKey || e.altKey;

export const shortId = (id: string) => id.slice(-4);

const bits = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(1));
const callText = (calls: unknown) => (Array.isArray(calls) ? calls : []).map(c => {
  const [name, args] = c as [string, Record<string, unknown>];
  return `${name}(${Object.entries(args ?? {}).map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`).join(", ")})`;
}).join(" · ");

/**
 * A change to an object, as the end screen tells it. The viewer's own agents in the act line's words (the agent's
 * name, "changed 2 to 5 at row 3, column 4"); another player's stays brief ("Bo's agent changed a grid"): no object
 * codes, no raw calls. The replay's events carry no points change for the viewer, so none is said here.
 */
export function transformSentence(ev: Extract<ReplayEvent, { type: "object.transformed" }>, o: { names: ReadonlyMap<string, string>; viewerId?: string; agentName?: string; noun?: string }): string {
  const noun = o.noun ?? "object";
  if (o.viewerId && ev.ownerId === o.viewerId) return `Your agent ${o.agentName?.trim() || "(unnamed)"} ${describeChange(ev.before as never, ev.value as never, noun)}`;
  const who = ev.ownerId ? o.names.get(ev.ownerId) ?? "Someone" : "Someone";
  return `${who}'s agent changed ${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}`;
}

/** One event as a sentence; `names` maps god ids to names. */
export function describeEvent(ev: ReplayEvent, names: ReadonlyMap<string, string>): string {
  const god = (id: string | undefined) => (id ? names.get(id) ?? "Someone" : "Someone");
  switch (ev.type) {
    case "phase": {
      const word = { planning: "Planning", running: "Running", paused: "Paused", recovery: "Stopped", ended: "Ended" }[ev.phase];
      return ev.reason ? `${word}: ${ev.reason}` : word;
    }
    case "object.spawned": return `Object ${shortId(ev.objectId)} appeared`;
    case "object.rescored": return `Object ${shortId(ev.objectId)} re-scored for the number of players (hold rarity)`;
    case "object.transformed": return `${god(ev.ownerId)}'s agent ${ev.agentId ? shortId(ev.agentId) : "?"} changed object ${shortId(ev.objectId)}: ${callText(ev.calls) || "no calls"}`;
    case "agent.failed": return `${god(ev.ownerId)}'s agent ${shortId(ev.agentId)} failed on object ${shortId(ev.objectId)}: ${ev.reason}`;
    case "agent.skipped": return `${god(ev.ownerId)}'s agent ${shortId(ev.agentId)} looked at object ${shortId(ev.objectId)} and did nothing (paid ${bits(ev.cost.read)} bits to look)`;
    case "agent.summoned": return `${god(ev.ownerId)} summoned agent ${shortId(ev.agentId)} (${ev.language}, ${bits(ev.summonCost)} bits${ev.powerShare !== undefined ? `, ${Math.round(ev.powerShare * 1000) / 10}% of its owner's power` : ""})`;
    case "agent.replaced": return `${god(ev.ownerId)} replaced agent ${shortId(ev.agentId)}'s program (${ev.language}, ${bits(ev.summonCost)} bits)`;
    case "agent.destroyed": return `${god(ev.ownerId)} destroyed agent ${shortId(ev.agentId)}`;
    case "god.looked": return `${god(ev.ownerId)} paid ${bits(ev.price)} bits to look at ${ev.objectId ? `object ${shortId(ev.objectId)}` : `all ${ev.count} objects`}`;
    case "agent.power": return `${god(ev.ownerId)} set agent ${shortId(ev.agentId)} to ${Math.round(ev.share * 1000) / 10}% of their power`;
  }
}

/** The world time a point of the scrub track stands for: `fraction` of the way along a game of `endWorld` seconds (clamped). */
export function worldAtFraction(fraction: number, endWorld: number): number {
  if (!Number.isFinite(fraction) || !(endWorld > 0)) return 0;
  return Math.max(0, Math.min(1, fraction)) * endWorld;
}

/**
 * The room page's way into the replay: its game, once that game has ended, for its players and the room's owner (the
 * engine serves a replay to no one else: player.replay).
 */
export function endedGameReplay(obs: { phase?: string; gameShortCode?: string | null } | undefined, viewer: { seated: boolean; isOwner: boolean }): { game: string } | null {
  return obs?.phase === "ended" && obs.gameShortCode && (viewer.seated || viewer.isOwner) ? { game: obs.gameShortCode } : null;
}
