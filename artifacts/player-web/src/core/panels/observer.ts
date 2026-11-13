/**
 * The observer agent (paid observation, docs/energy-model.md §11.3): an ordinary agent that reads the whole object and
 * returns no calls. Each object it is handed is told to its god, paid from the agent's own energy, so it is the
 * standing watch of a game whose looking costs energy. Pure: its source per language and object type, and what it costs.
 */
import { offerReadBits } from "@workspace/game-core";

/** The whole-object read of each object type's metered view (docs/energy-model.md §3). */
const READ_ALL: Record<string, { python: string; typescript: string }> = {
  Grid: { python: "repr(grid)", typescript: "String(grid);" },
  Int: { python: "x.value", typescript: "x.value;" },
  string: { python: "s.text", typescript: "s.text;" },
};
const ARG: Record<string, string> = { Grid: "grid", Int: "x", string: "s" };

/** The observer's source in `language` for this object type; null for a type whose whole read is not known here. */
export function observerSource(language: string, objectType: string | undefined): string | null {
  const read = objectType ? READ_ALL[objectType] : undefined, arg = objectType ? ARG[objectType] : undefined;
  if (!read || !arg) return null;
  return language === "python"
    ? `def agent(${arg}):\n    # Only look: read all of it, change nothing.\n    ${read.python}\n    return []`
    : language === "typescript"
      ? `function agent(${arg}) {\n  // Only look: read all of it, change nothing.\n  ${read.typescript}\n  return [];\n}`
      : null;
}
export const OBSERVER_NAME = "Observer";
export const OBSERVER_DESCRIPTION = "Only looks: reads the whole object and changes nothing, so each object it is handed is shown to me as it is.";

/**
 * What an observer costs and covers: one turn costs the whole read (economy.fullRead) plus the offer (which object it was
 * handed: log2 of the live objects, at the read price), and with `share` of the god's power it can pay for
 * share x power / that many turns a second. The world hands out at most `turnsPerSecond` turns in all, shared with every
 * other agent, so that bounds it too.
 */
export function observerRate(o: { fullRead: number; objects: number; changeReadRatio: number; powerPerSecond: number; share: number; turnsPerSecond?: number }) {
  const perTurn = o.fullRead + offerReadBits(o.objects) / Math.max(1, o.changeReadRatio);
  const affordable = perTurn > 0 ? o.share * o.powerPerSecond / perTurn : 0;
  const perSecond = Math.min(affordable, o.turnsPerSecond ?? Infinity);
  return { perTurn, perSecond };
}

/** "refreshes about 3.4 objects a second" / "about one object every 4 seconds". */
export function rateText(perSecond: number): string {
  if (!(perSecond > 0)) return "refreshes nothing: it has no power";
  if (perSecond >= 1) return `refreshes about ${perSecond >= 10 ? Math.round(perSecond) : Math.round(perSecond * 10) / 10} objects a second`;
  return `refreshes about one object every ${Math.round(1 / perSecond)} seconds`;
}
