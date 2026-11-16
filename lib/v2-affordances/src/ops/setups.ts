/**
 * Saved setups (v1's user setups, restored by coordinator's call 35): a human's named preset and overrides, to apply
 * to a room they own (`room.settings` with `setupId`). As in v1 they are shared: anyone lists, reads, copies and
 * applies any setup; only its owner saves over it or removes it. The presets are the system's catalogue beside them.
 */
import { z } from "zod/v4";
import { affordance, id, obj, ok, page, paging, requestId } from "../define.ts";
import { SIGNED_IN } from "../types.ts";
import { overrides } from "./rooms.ts";

/** A setup name: 1–40 characters (v1's SETUP_NAME_MAX), unique among one human's setups ignoring case. */
export const SETUP_NAME_MAX = 40;
/** The most setups one human keeps (v1's MAX_OWN_SETUPS). */
export const MAX_OWN_SETUPS = 50;

/**
 * The first name of `<stem><tail>`, `<stem><tail> 2`, ` 3`… not in `taken` (lower-cased names), the stem shortened so
 * every candidate fits SETUP_NAME_MAX (v1's freeName): a copy is "<name>'s copy".
 */
export function freeSetupName(stem: string, tail: string, taken: ReadonlySet<string>): string {
  for (let n = 1; ; n++) {
    const suffix = `${tail}${n > 1 ? ` ${n}` : ""}`;
    const candidate = `${stem.slice(0, SETUP_NAME_MAX - suffix.length).trimEnd()}${suffix}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

const name = z.string().trim().min(1).max(SETUP_NAME_MAX);
const setupRow = z.object({
  setupId: id, name: z.string(), preset: z.string(), updatedAt: z.number(),
  ownerName: z.string(), mine: z.boolean().describe("the caller's own: only they save over it or remove it"),
});
const setup = setupRow.extend({ overrides, createdAt: z.number() });

export const setupOps = [
  affordance({
    id: "setups.page", title: "List saved setups", group: "room", scope: "none",
    description: "Pages through everyone's saved setups by name (mine: true, only the caller's): each one's id, name, preset and owner. The presets (the system's setups) are listed apart. Use an id with setups.get, setups.duplicate or room.settings.",
    tooltip: "Saved setups, yours and everyone's.", keywords: ["setups", "saved setups", "my settings", "templates", "shared setups"],
    params: obj({ mine: z.boolean().optional().describe("only the caller's own"), ...paging }), result: page(setupRow),
    contexts: SIGNED_IN, caller: "signedIn", effect: "read", confirm: "none", runs: "server",
  }),
  affordance({
    id: "setups.get", title: "Show a saved setup", group: "room", scope: "none",
    description: "A saved setup (anyone's) with its preset, every override it sets, and its owner.",
    tooltip: "What a saved setup sets.", keywords: ["setup", "show setup", "setup details"],
    params: obj({ setupId: id }), result: setup,
    contexts: SIGNED_IN, caller: "signedIn", effect: "read", confirm: "none", runs: "server",
  }),
  affordance({
    id: "setups.save", title: "Save a setup", group: "room", scope: "none",
    description: `Saves a preset and its overrides (the ones room.settings takes) under a name of 1–${SETUP_NAME_MAX} characters. With setupId it overwrites (and may rename) that setup, which must be the caller's; otherwise the caller's setup of the same name (any case) is overwritten, else a new one is made (at most ${MAX_OWN_SETUPS} each). Returns its id and whether it was created.`,
    tooltip: "Keep these settings under a name.", keywords: ["save setup", "save settings", "new setup", "store preset"],
    params: obj({ name, preset: z.string().max(64), overrides: overrides.optional(), setupId: id.optional(), requestId: requestId.optional() }),
    result: z.object({ setupId: id, name: z.string(), created: z.boolean() }),
    contexts: SIGNED_IN, caller: "signedIn", effect: "write", confirm: "none", runs: "server",
  }),
  affordance({
    id: "setups.duplicate", title: "Duplicate a saved setup", group: "room", scope: "none",
    description: `Copies any saved setup as a new one of the caller's, named "<name>'s copy" (then " 2", " 3"…), or \`name\` (made unique the same way). Counts toward the caller's ${MAX_OWN_SETUPS}.`,
    tooltip: "Copy a setup to change it.", keywords: ["duplicate setup", "copy setup", "clone"],
    params: obj({ setupId: id, name: name.optional(), requestId: requestId.optional() }),
    result: z.object({ setupId: id, name: z.string() }),
    contexts: SIGNED_IN, caller: "signedIn", effect: "write", confirm: "none", runs: "server",
  }),
  affordance({
    id: "setups.remove", title: "Delete a saved setup", group: "room", scope: "none",
    description: "Deletes one of the caller's saved setups. Rooms it was applied to keep their settings.",
    tooltip: "Delete this setup.", keywords: ["delete setup", "remove setup"],
    params: obj({ setupId: id, requestId: requestId.optional() }), result: ok,
    contexts: SIGNED_IN, caller: "signedIn", effect: "destructive", confirm: "inline", runs: "server",
  }),
] as const;
