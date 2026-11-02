/** An agent's name as its owner sees it: the stored one, or for an agent summoned before names existed, "Agent N" by position. */
export const agentDisplayName = (stored: string | undefined, ordinal: number): string => stored?.trim() || `Agent ${ordinal + 1}`;
