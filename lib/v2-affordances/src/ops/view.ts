/**
 * View operations (client affordances, integration plan §2.5): what a human does with the mouse and an assistant can
 * do for them. Their state is the human's layout (pane params in `v2Layouts`), so a remote assistant changes what the
 * human sees and every open client of that human follows. Replay controls are view operations on the replay pane.
 */
import { z } from "zod/v4";
import { affordance, id, obj, rep } from "../define.ts";
import { CONTEXTS, IN_GAME, IN_ROOM } from "../types.ts";

const GAME = [...IN_GAME, "ended", "replay"] as const;
const pane = z.string().min(1).max(40).describe('A pane id, e.g. "objects", "agents", "forge", "log", "chat", "goal".');
const place = z.enum(["main", "left", "right", "bottom"]);
const done = z.object({ ok: z.literal(true), layoutVersion: z.number().int() });

export const viewOps = [
  affordance({
    id: "view.openPane", title: "Open a pane", group: "view", scope: "room",
    description: "Opens a pane on the human's screen (and every client they have open), optionally at a place.",
    tooltip: "Show a pane.", keywords: ["open", "show", "panel", "window"],
    params: obj({ pane, place: place.optional() }), result: done,
    contexts: IN_ROOM, caller: "member", effect: "write", confirm: "none", runs: "client",
  }),
  affordance({
    id: "view.closePane", title: "Close a pane", group: "view", scope: "room",
    description: "Closes a pane on the human's screen.", tooltip: "Hide a pane.", keywords: ["close", "hide", "dismiss"],
    params: obj({ pane }), result: done,
    contexts: IN_ROOM, caller: "member", effect: "write", confirm: "none", runs: "client",
  }),
  affordance({
    id: "view.movePane", title: "Move a pane", group: "view", scope: "room",
    description: "Moves an open pane to another place on the human's screen.", tooltip: "Rearrange the screen.", keywords: ["move", "dock", "arrange", "layout"],
    params: obj({ pane, place }), result: done,
    contexts: IN_ROOM, caller: "member", effect: "write", confirm: "none", runs: "client",
  }),
  affordance({
    id: "view.pinRepresentation", title: "Show objects in a representation", group: "view", scope: "room",
    description: "Pins the representation every compact object face uses (for one rule family, or for all), e.g. the graph instead of y = mx + c. Replaces per-device pins.",
    tooltip: "Choose how objects are drawn.", keywords: ["representation", "switch view", "graph", "equation", "table", "machine"],
    params: obj({ rep, family: z.string().max(40).optional().describe("Pin for one rule family only; omit for every object.") }), result: done,
    contexts: GAME, caller: "member", effect: "write", confirm: "none", runs: "client",
  }),
  affordance({
    id: "view.showRepresentation", title: "Switch an object's representation", group: "view", scope: "room",
    description: "Switches the representation shown in one object's expanded face.",
    tooltip: "See this object another way.", keywords: ["switch", "representation", "lens", "show as"],
    params: obj({ objectId: id, rep }), result: done,
    contexts: GAME, caller: "member", effect: "write", confirm: "none", runs: "client",
  }),
  affordance({
    id: "view.compareRepresentations", title: "Compare representations side by side", group: "view", scope: "room",
    description: "Opens an object's expanded face with 2 to 4 representations side by side, cross-highlighted by meaning (the y-intercept in each).",
    tooltip: "Compare views of one object.", keywords: ["compare", "side by side", "representations"],
    params: obj({ objectId: id, reps: z.array(rep).min(2).max(4) }), result: done,
    contexts: GAME, caller: "member", effect: "write", confirm: "none", runs: "client",
  }),
  affordance({
    id: "view.openObject", title: "Open an object", group: "view", scope: "room",
    description: "Opens one object's expanded face: every representation its rule depends on, with the rule's marks.",
    tooltip: "Look closely at one object.", keywords: ["open", "inspect", "details", "expand"],
    params: obj({ objectId: id }), result: done,
    contexts: GAME, caller: "member", effect: "write", confirm: "none", runs: "client",
  }),
  affordance({
    id: "view.sortObjects", title: "Sort objects", group: "view", scope: "room",
    description: "Sorts the human's objects pane by their points, level or most recent change.",
    tooltip: "Change the objects' order.", keywords: ["sort", "order", "rank"],
    params: obj({ sort: z.enum(["points", "level", "recent"]) }), result: done,
    contexts: GAME, caller: "member", effect: "write", confirm: "none", runs: "client",
  }),
  affordance({
    id: "view.filterObjects", title: "Filter objects", group: "view", scope: "room",
    description: "Filters the human's objects pane: only objects the caller's agents touched, or at least a level. Empty clears the filter.",
    tooltip: "Show only some objects.", keywords: ["filter", "only mine", "search objects"],
    params: obj({ mine: z.boolean().optional(), minLevel: z.number().int().min(0).optional() }), result: done,
    contexts: GAME, caller: "member", effect: "write", confirm: "none", runs: "client",
  }),
  affordance({
    id: "view.showGlossary", title: "Explain a term", group: "help", scope: "none",
    description: "Opens the glossary at a term (points, ✨ rarity, ⚡ energy, power, representation, mutator), or its index.",
    tooltip: "What does this word mean?", keywords: ["glossary", "help", "what is", "define"],
    params: obj({ term: z.string().max(40).optional() }), result: done,
    contexts: CONTEXTS, caller: "anyone", effect: "write", confirm: "none", runs: "client",
  }),

  // Replay controls: the replay pane folds v2Events; these move its cursor.
  affordance({
    id: "replay.open", title: "Watch a replay", group: "replay", scope: "room",
    description: "Opens the replay of a finished game of the room in view (ids from room.history), at its start.",
    tooltip: "Replay a finished game.", keywords: ["replay", "watch again", "rewind"],
    params: obj({ gameId: id }), result: done,
    contexts: ["room", "ended", "replay"], caller: "member", effect: "write", confirm: "none", runs: "client",
  }),
  affordance({
    id: "replay.play", title: "Play the replay", group: "replay", scope: "game",
    description: "Plays the replay from its cursor at the current speed.", tooltip: "Play.", keywords: ["play", "resume replay"],
    params: obj({}), result: done, contexts: ["replay"], caller: "member", effect: "write", confirm: "none", runs: "client",
  }),
  affordance({
    id: "replay.pause", title: "Pause the replay", group: "replay", scope: "game",
    description: "Stops the replay at its cursor.", tooltip: "Pause.", keywords: ["pause replay", "stop"],
    params: obj({}), result: done, contexts: ["replay"], caller: "member", effect: "write", confirm: "none", runs: "client",
  }),
  affordance({
    id: "replay.seek", title: "Jump to a moment in the replay", group: "replay", scope: "game",
    description: "Moves the replay's cursor to an event number (0 = the start) or a world time in seconds.",
    tooltip: "Jump to a point in time.", keywords: ["seek", "jump", "go to time"],
    params: obj({ seq: z.number().int().min(0).optional(), worldSeconds: z.number().min(0).optional() }), result: done,
    contexts: ["replay"], caller: "member", effect: "write", confirm: "none", runs: "client",
  }),
  affordance({
    id: "replay.step", title: "Step the replay", group: "replay", scope: "game",
    description: "Moves the replay's cursor by a number of moves, backwards when negative.", tooltip: "Step forwards or back.", keywords: ["step", "next move", "previous move"],
    params: obj({ by: z.number().int().min(-100).max(100).default(1) }), result: done,
    contexts: ["replay"], caller: "member", effect: "write", confirm: "none", runs: "client",
  }),
  affordance({
    id: "replay.speed", title: "Set the replay speed", group: "replay", scope: "game",
    description: "Sets how many world seconds the replay plays per real second.", tooltip: "Faster or slower.", keywords: ["speed", "fast forward", "slow motion"],
    params: obj({ speed: z.union([z.literal(0.5), z.literal(1), z.literal(2), z.literal(4), z.literal(8)]) }), result: done,
    contexts: ["replay"], caller: "member", effect: "write", confirm: "none", runs: "client",
  }),
] as const;
