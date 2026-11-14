/**
 * Deals as commitments (coordinator, 2026-11-14: make deal-keeping structural rather than hoped-for). Each turn the
 * scaffold of an AI player reads the public chat, the moves that concern it and its agents' programs, and tells the
 * player what it promised, whether its agents' code keeps that promise yet, and whether its partners kept theirs. A
 * promise is pending until the player either enacts it (edits its agents to stay off the lines; an edit costs only the
 * change) or retracts it in chat. Nothing here is enforced by the game: it is the player's own ledger, derived from
 * what happened, so a host needs no storage for it (the table and the server's AI turn call the same functions).
 *
 * Reading deals from chat is a heuristic: a proposal names at least one line ("line 4", "lines 2, 7 and 9") with offer
 * words; it is accepted by the first later message from another player with agreement words and no refusal, within
 * `window` seconds ("Deal?" alone asks back). Both sides of an accepted deal commit to keep their agents off the named
 * lines. A later message from one side with retraction words that names one of the lines, or the partner, retracts it.
 */
import { toolName } from "@workspace/v2-affordances";

export interface ChatRow { readonly from: string; readonly text: string; readonly at: number }
/** A committed move: who made it, on which line, when, and which players' points it lowered. */
export interface MoveRow { readonly by: string; readonly line: number; readonly at: number; readonly lowered: readonly string[] }
export interface Deal {
  readonly proposer: string;
  readonly accepter: string;
  readonly lines: readonly number[];
  /** When it was accepted. */
  readonly at: number;
  readonly proposal: string;
  readonly reply: string;
}
export interface Commitment {
  readonly partner: string;
  readonly lines: readonly number[];
  readonly at: number;
  /** pending: the agents' code does not keep it yet; enacted: every agent skips the lines; retracted in chat. */
  readonly status: "pending" | "enacted" | "retracted";
  /** Moves of mine that lowered the partner on a named line after the deal (and before any retraction). */
  readonly myBreaks: readonly { readonly line: number; readonly at: number }[];
  /** Moves of the partner's that lowered me on a named line after the deal. */
  readonly partnerBreaks: readonly { readonly line: number; readonly at: number }[];
}

const PROPOSAL = /\b(deal|if you|i'?ll|i will|let'?s|agree|leave|keep|won'?t|in return|swap|trade)\b/i;
const ACCEPT = /\b(deal|yes|agreed?|ok(ay)?|sure|sounds good|accept(ed)?|happy to|works for me)\b/i;
const REFUSE = /\b(no deal|not a deal|can'?t agree|won'?t agree|decline|no thanks)\b/i;
const RETRACT = /\b(retract|withdraw|cancel|call(ing)? off|no longer|end(ing)? (our|the|my) deal|break(ing)? (our|the|my) deal|deal is off)\b/i;

/** The line numbers a message names: "line 4", "lines 2, 7 and 9". */
export const linesIn = (text: string): number[] =>
  [...text.matchAll(/\blines?\s*#?\s*(\d+(?:\s*(?:,|and|&|or)\s*#?\s*\d+)*)/gi)].flatMap(m => m[1]!.match(/\d+/g)!.map(Number));
/** A reply that only asks back ("…instead. Deal?") is a counter-offer, not an acceptance. */
const accepts = (text: string) => ACCEPT.test(text.replace(/\bdeal\s*\?/gi, "")) && !REFUSE.test(text);

/** Proposals (indexes into the chat) and accepted deals. */
export function findDeals(chat: readonly ChatRow[], window = 40): { deals: Deal[]; proposals: number[] } {
  const deals: Deal[] = [], proposals: number[] = [];
  const taken = new Set<number>();
  chat.forEach((m, k) => {
    const named = linesIn(m.text);
    if (taken.has(k) || !named.length || !PROPOSAL.test(m.text) || REFUSE.test(m.text) || RETRACT.test(m.text)) return;   // an acceptance is not a proposal of its own
    proposals.push(k);
    const j = chat.findIndex((x, d) => d > k && !taken.has(d) && x.from !== m.from && x.at <= m.at + window && accepts(x.text)
      && (linesIn(x.text).length === 0 || linesIn(x.text).some(l => named.includes(l))));
    if (j < 0) return;
    taken.add(j);
    deals.push({ proposer: m.from, accepter: chat[j]!.from, lines: named, at: chat[j]!.at, proposal: m.text, reply: chat[j]!.text });
  });
  return { deals, proposals };
}

/**
 * The lines a program keeps its agent off: the numbers in a list or comparison tested against offer.object on the same
 * line ([2, 9].includes(offer.object), offer.object in (2, 9), offer.object === 19), and in any list a name holds when
 * that name is tested against offer.object (const LEAVE = [19]; … LEAVE.includes(offer.object)). Comments do not count.
 */
export function skippedLines(source: string): Set<number> {
  const code = source.replace(/\/\/[^\n]*|#[^\n]*/g, "");
  const out = new Set<number>();
  const numbers = (text: string) => { for (const m of text.matchAll(/(?<![\w.])\d+(?![\w.])/g)) out.add(Number(m[0])); };
  const names = new Set<string>();
  for (const line of code.split("\n")) {
    if (!/offer\.object/.test(line)) continue;
    for (const m of line.matchAll(/\[([\d\s,]+)\]\s*\.includes\(\s*offer\.object\s*\)|offer\.object\s+in\s+[\[(]([\d\s,]+)[\])]|offer\.object\s*===?\s*(\d+)/g)) numbers(m[1] ?? m[2] ?? m[3] ?? "");
    for (const m of line.matchAll(/(\w+)\.includes\(\s*offer\.object\s*\)|offer\.object\s+in\s+(\w+)/g)) names.add(m[1] ?? m[2]!);
  }
  for (const name of names) for (const m of code.matchAll(new RegExp(`\\b${name}\\s*=\\s*[\\[(]([\\d\\s,]*)[\\])]`, "g"))) numbers(m[1]!);
  return out;
}

/** Whether a program keeps its agent off all these lines. */
export function skipsLines(source: string, lines: readonly number[]): boolean {
  const skipped = skippedLines(source);
  return lines.every(l => skipped.has(l));
}

/**
 * `me`'s commitments: every accepted deal it is a side of, with whether its agents' current programs keep it, whether it
 * was retracted, and who broke it. `programs` are the sources of all of `me`'s live agents.
 */
export function commitmentsOf(me: string, chat: readonly ChatRow[], moves: readonly MoveRow[], programs: readonly string[], window = 40): Commitment[] {
  return findDeals(chat, window).deals.filter(d => d.proposer === me || d.accepter === me).map(d => {
    const partner = d.proposer === me ? d.accepter : d.proposer;
    const retraction = chat.find(m => m.at >= d.at && (m.from === me || m.from === partner) && m.text !== d.reply && RETRACT.test(m.text)
      && (linesIn(m.text).some(l => d.lines.includes(l)) || m.text.includes(partner) || m.text.includes(me)));
    const until = retraction?.at ?? Infinity;
    const breaks = (by: string, of: string) => moves.filter(x => x.by === by && x.at >= d.at && x.at < until && d.lines.includes(x.line) && x.lowered.includes(of))
      .map(x => ({ line: x.line, at: x.at }));
    const enacted = programs.length > 0 && programs.every(p => skipsLines(p, d.lines));
    return { partner, lines: d.lines, at: d.at, status: retraction ? "retracted" : enacted ? "enacted" : "pending", myBreaks: breaks(me, partner), partnerBreaks: breaks(partner, me) };
  });
}

const list = (ls: readonly number[]) => (ls.length === 1 ? `line ${ls[0]}` : `lines ${ls.slice(0, -1).join(", ")} and ${ls.at(-1)}`);

/** The part of a turn's message that lists the player's deals and what each needs from it now. */
export function commitmentBriefing(commitments: readonly Commitment[]): string {
  if (!commitments.length) return "YOUR DEALS: none yet.";
  const rows = commitments.map(c => {
    const head = `- With ${c.partner}, ${list(c.lines)} (agreed at ${Math.round(c.at)} s): `;
    const theirs = c.partnerBreaks.length
      ? ` ${c.partner}'s agents lowered your points on ${list([...new Set(c.partnerBreaks.map(b => b.line))])} since (${c.partnerBreaks.length} moves): say so once, kindly.`
      : ` ${c.partner} has kept it so far.`;
    if (c.status === "retracted") return `${head}retracted.`;
    if (c.status === "enacted") return `${head}your agents skip ${c.lines.length === 1 ? "it" : "them"}: kept.${theirs}`;
    const ids = c.lines.join(", ");
    return `${head}PENDING: your agents' code does not skip ${c.lines.length === 1 ? "it" : "them"} yet${c.myBreaks.length ? `, and they moved ${list([...new Set(c.myBreaks.map(b => b.line))])} against ${c.partner} since` : ""}. `
      + `This turn, enact it (read the code with ${toolName("agent.programs")}; if it has a LEAVE list, add ${ids} to it; otherwise add at the top of agent(offer) if ([${ids}].includes(offer.object)) return null; in TypeScript or if offer.object in (${ids}${c.lines.length === 1 ? "," : ""}): return None in Python; ${toolName("agent.check")}, then ${toolName("agent.replace")}: an edit costs only the change, about 20 ⚡) or retract it in chat.${theirs}`;
  });
  return `YOUR DEALS (read from the chat; you keep them, the game does not):\n${rows.join("\n")}`;
}
