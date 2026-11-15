/** v1's chat filters: everyone, people only, AI players only (practice partners and AI seats), mentions of you. Pure. */

export type ChatFilter = "all" | "people" | "ai" | "mentions";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whether the text names you as a word (any case; "Alexander" is not "Alex"). */
export function mentions(text: string, name: string): boolean {
  const n = name.trim();
  if (!n) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escape(n)}(?![\\p{L}\\p{N}])`, "iu").test(text);
}

export function chatFilter<M extends { memberId: string | null; text: string }>(
  messages: readonly M[], f: ChatFilter, who: { kinds: ReadonlyMap<string, string>; myName: string | null; me: string | null },
): M[] {
  if (f === "all") return [...messages];
  return messages.filter(m => {
    if (!m.memberId) return false;
    const kind = who.kinds.get(m.memberId);
    if (f === "people") return kind === "human";
    if (f === "ai") return kind === "ai" || kind === "practice";
    return m.memberId !== who.me && !!who.myName && mentions(m.text, who.myName);
  });
}
