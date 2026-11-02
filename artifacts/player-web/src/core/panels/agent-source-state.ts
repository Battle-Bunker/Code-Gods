/**
 * The "Source" disclosure under each agent in My agents: collapsed by default; whether an agent is expanded is
 * remembered for the session only (module memory, gone on reload). Pure, so it is unit-tested without a DOM.
 */
const expanded = new Map<string, boolean>();

/** Open state of an agent's disclosure: what the player last chose, else `fallback` (the panel's showSource param). */
export const sourceOpen = (agentId: string, fallback = false): boolean => expanded.get(agentId) ?? fallback;
export const setSourceOpen = (agentId: string, open: boolean): void => { expanded.set(agentId, open); };
/** Forget agents that no longer exist (destroyed, or a past game's). */
export const pruneSourceOpen = (liveIds: string[]): void => { for (const id of [...expanded.keys()]) if (!liveIds.includes(id)) expanded.delete(id); };
