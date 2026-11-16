/**
 * The replay's key moments (v1's keyMoments, replay/parts.tsx "◆ prev / next ◆"): every change of leader on the
 * scoreboard and every agent summoned, by event position, for the marks on the replay's slider and the jumps between
 * them. Pure: read from the folded replay (./fold.ts).
 */
import type { ReplayIndex } from "./fold";

export interface KeyMoment { at: number; kind: "lead" | "summon"; text: string }

type MomentSource = Pick<ReplayIndex, "ticks" | "commands" | "roster">;

export function keyMoments(ix: MomentSource): KeyMoment[] {
  const name = (id: string) => ix.roster.find(m => m.memberId === id)?.name ?? "A player";
  const out: KeyMoment[] = [];
  let leader: string | null = null;
  for (const t of ix.ticks) {
    const rows = [...t.standings.rows].sort((a, b) => b.net - a.net);
    // A tie at the top leads nobody: the lead changes when one player is ahead alone.
    if (!rows[0] || (rows[1] && rows[1].net === rows[0].net)) continue;
    if (leader !== null && rows[0].memberId !== leader) out.push({ at: t.at, kind: "lead", text: `${name(rows[0].memberId)} takes the lead` });
    leader = rows[0].memberId;
  }
  for (const [member, commands] of ix.commands) {
    for (const c of commands) if (c.kind === "summon") out.push({ at: c.at, kind: "summon", text: `${name(member)} summons ${c.name ?? "an agent"}` });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** The moment to jump to from `applied`: the first after it, or the last before it; null when there is none. */
export function jumpTarget(moments: readonly KeyMoment[], applied: number, direction: 1 | -1): number | null {
  const m = direction > 0 ? moments.find(x => x.at > applied) : [...moments].reverse().find(x => x.at < applied);
  return m ? m.at : null;
}
