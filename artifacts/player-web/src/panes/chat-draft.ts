/**
 * A proposal one tap from a candidate (playtest round 8): the public chat opens with the message written in its box,
 * for the player to read, change and send (nothing is sent for them). Like the forge's requests (./forge-request.ts).
 */
let pending: string | null = null;
const listeners = new Set<() => void>();

export async function requestChat(text: string, openPane: (pane: string) => Promise<unknown>): Promise<void> {
  pending = text;
  for (const l of listeners) l();
  await openPane("public-chat");
}
/** The draft waiting for the chat box, taken once. */
export function takeChatDraft(): string | null { const t = pending; pending = null; return t; }
export function onChatDraft(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

/**
 * A message split into its text and the boards drawn in it: four rows of four digits ("9 7 7 9") in a row are a board,
 * drawn as one; everything else stays text.
 */
export function boardsIn(text: string): ({ text: string } | { board: number[][] })[] {
  const lines = text.split("\n"), out: ({ text: string } | { board: number[][] })[] = [];
  const row = (l: string) => /^\d( \d){3}$/.test(l.trim());
  let words: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (row(lines[i]!) && lines.slice(i, i + 4).length === 4 && lines.slice(i, i + 4).every(row)) {
      if (words.length) out.push({ text: words.join("\n") }), (words = []);
      out.push({ board: lines.slice(i, i + 4).map(l => l.trim().split(" ").map(Number)) });
      i += 3;
    } else words.push(lines[i]!);
  }
  if (words.length) out.push({ text: words.join("\n") });
  return out;
}
