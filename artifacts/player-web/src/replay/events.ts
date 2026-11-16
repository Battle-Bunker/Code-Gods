/**
 * The replay's event list (v1's EventList): what happened, in order, each with its world time and the event position a
 * click seeks to. Lines born, every player's moves (each once, though a move concerns several players), and the
 * players' commands (summon, destroy, replace, power). Pure: read from the folded replay (./fold.ts).
 */
import type { ReplayIndex } from "./fold";

export interface ReplayEventRow {
  at: number; world: number; kind: "born" | "move" | "command"; text: string; memberId: string | null;
  /** A summon or a code change: the program it started, when the record keeps it (v1's "code" on the timeline). */
  program?: { agentId: string; version: number };
}

type EventSource = Pick<ReplayIndex, "objects" | "moves" | "commands" | "roster" | "world"> & Partial<Pick<ReplayIndex, "programs">>;

const COMMAND: Record<string, string> = { summon: "summoned", destroy: "destroyed", replace: "changed the code of", edit: "changed the code of", allocate: "moved power between agents" };

export function replayEvents(ix: EventSource, noun = "line"): ReplayEventRow[] {
  const name = (id: string) => ix.roster.find(m => m.memberId === id)?.name ?? "A player";
  const worldAt = (at: number) => (at > 0 ? ix.world[at - 1] ?? 0 : 0);
  const out: ReplayEventRow[] = [];
  for (const t of ix.objects) out.push({ at: t.born, world: t.bornAt, kind: "born", text: `${noun[0]!.toUpperCase()}${noun.slice(1)} ${t.number} is born`, memberId: null });
  const seen = new Set<number>();
  for (const list of ix.moves.values()) {
    for (const { at, move } of list) {
      if (seen.has(move.seq)) continue;
      seen.add(move.seq);
      const who = move.by ? `${move.by.name}'s agent` : "An agent";
      out.push({ at, world: move.worldSeconds, kind: "move", text: `${who} changed ${noun} ${move.number}`, memberId: move.by?.memberId ?? null });
    }
  }
  // An agent's name, from its summon, for the commands after it.
  const agentNames = new Map<string, string>();
  for (const [member, commands] of ix.commands) {
    for (const c of commands) {
      if (c.kind === "summon" && c.name) agentNames.set(c.agentId, c.name);
      const verb = COMMAND[c.kind] ?? c.kind;
      const agent = c.kind === "allocate" ? "" : ` ${agentNames.get(c.agentId) ?? c.name ?? "an agent"}`;
      const coded = (c.kind === "summon" || c.kind === "replace" || c.kind === "edit") && c.version !== undefined && ix.programs?.has(`${c.agentId}@${c.version}`);
      out.push({ at: c.at, world: c.worldSeconds ?? worldAt(c.at), kind: "command", text: `${name(member)} ${verb}${agent}`, memberId: member,
        ...(coded ? { program: { agentId: c.agentId, version: c.version! } } : {}) });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/** The rows shown around the playhead: up to `before` applied ones and `after` still to come. */
export function around(rows: readonly ReplayEventRow[], applied: number, before = 30, after = 20): ReplayEventRow[] {
  const i = rows.findIndex(r => r.at > applied);
  const split = i < 0 ? rows.length : i;
  return rows.slice(Math.max(0, split - before), split + after);
}
