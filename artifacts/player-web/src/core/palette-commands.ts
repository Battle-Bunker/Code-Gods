/**
 * The command palette's rows, generated from the affordance directory (owner decision 16; plan §2.5): every
 * affordance the viewer's context offers (`paletteFor`), with the same availability, reason and confirmation as its
 * button, and nothing written by hand. How a row runs:
 *
 * - no input needed: it runs at once through the runtime's `perform` (a server operation or a view operation);
 * - a read: it opens the pane that subscribes to that data (R7: the app makes no one-off reads), or the page;
 * - one value needed: a field (or, for a pane, a pick of the panes) asks for it, then runs;
 * - several values: an info page says where on the screen to do it (the assistant takes them in M3).
 */
import type { Command, PaletteFormPage, Performer } from "@workspace/ui-kit/core";
import { AFFORDANCES, paletteFor, type AffordanceContext, type AffordanceId, type OpOutcome, type PaletteEntry } from "@workspace/v2-affordances";
import { PANES, PANE_IDS, type PaneId } from "@workspace/v2-client";
import type { z } from "zod/v4";
import { requestForge } from "../panes/forge-request.ts";

/** Reads that a pane shows live: the row opens that pane. */
export const READ_PANES: Partial<Record<AffordanceId, PaneId>> = {
  "game.standings": "race", "game.get": "overview", "rule.explain": "my-card", "rule.values": "my-card", "rule.worth": "my-card", "objects.list": "objects",
  "moves.list": "feed", "agents.list": "agents", "agent.programs": "forge", "chat.list": "public-chat", "rep.mutators": "what-if",
  "panel.list": "my-panels", "panel.code": "my-panels",
  // The auction's result and the handicap show in Where am I; a line's views, quotes and score in One line and What if.
  "game.auction": "overview", "object.read": "object", "object.element": "object",
  "object.quote": "what-if", "object.score": "what-if",
};
/** Reads the room page shows (its members, past games, the rotation, the bid phase). */
export const ROOM_READS: ReadonlySet<string> = new Set(["room.get", "room.history", "game.rotation", "bid.state"]);
/** Reads the avatar menu shows (who you are, your connected apps). */
export const ACCOUNT_READS: ReadonlySet<string> = new Set(["account.whoami", "account.connections"]);

export interface PaletteHost {
  perform(id: AffordanceId, args: unknown): Promise<OpOutcome>;
  navigate(to: string): void;
  /** The room page's path, when a room is in view. */
  roomPath?: string;
  /** The dock's pane operations when it is on screen (pane rows open panes there, keeping the panes shown). */
  panes?: { open(pane: string): Promise<unknown>; close(pane: string): Promise<void> };
  /** A short confirmation once something typed in the palette was done (playtest: a chat sent from it said nothing). */
  notify?(title: string): void;
  /** The game's objects ("grid", "grids"): directory titles say "objects" (round 8b: "Leave objects alone" in a grid game). */
  noun?: { one: string; many: string };
}

const run = async (host: PaletteHost, id: AffordanceId, args: unknown) => {
  const out = await host.perform(id, args);
  if (!out.ok) throw new Error(out.error.message);
  return out.result;
};

/** The one required parameter of an affordance, when it has exactly one (besides requestId). */
function soleParam(id: AffordanceId): { name: string; kind: "string" | "number" } | null {
  const shape = AFFORDANCES[id].params.shape as Record<string, z.ZodType>;
  const required = Object.entries(shape).filter(([k, s]) => k !== "requestId" && !s.safeParse(undefined).success);
  if (required.length !== 1) return null;
  const [name, schema] = required[0]!;
  // A typical value, long enough for a code's minimum length.
  if (schema.safeParse("ABCDEF").success) return { name, kind: "string" };
  if (schema.safeParse(1).success) return { name, kind: "number" };
  return null;
}

function performerFor(e: PaletteEntry, host: PaletteHost): Performer {
  const id = e.id as AffordanceId;
  if (ROOM_READS.has(id) && host.roomPath) return { kind: "navigate", to: host.roomPath };
  if (ACCOUNT_READS.has(id)) return { kind: "form", page: { kind: "info", title: e.title, lines: ["Your account and connected apps are in the menu under your avatar (top right)."] } };
  if (id === "room.list") return { kind: "navigate", to: "/" };
  const pane = READ_PANES[id];
  const panes = host.panes;
  if (pane && panes) return { kind: "submit", run: () => panes.open(pane) };
  if (id === "view.openPane" || id === "view.closePane") {
    const page: PaletteFormPage = {
      kind: "pick", title: e.title,
      options: () => PANE_IDS.map(p => ({ id: p, label: PANES[p].title, detail: PANES[p].blurb, keywords: PANES[p].keywords })),
      onPick: p => (panes ? (id === "view.openPane" ? panes.open(p) : panes.close(p)) : run(host, id, { pane: p })),
    };
    return { kind: "form", page };
  }
  // The forge's own controls (playtest round 7: the palette said only "use its controls on the screen"): open them, focused.
  if ((id === "agent.leaveAlone" || id === "agent.hold") && panes) {
    return { kind: "submit", run: () => requestForge(id === "agent.hold" ? { kind: "hold", numbers: [] } : { kind: "leave", numbers: [] }, p => panes.open(p)) };
  }
  if (!e.needsInput) return { kind: "submit", run: () => run(host, id, {}) };
  const sole = soleParam(id);
  if (sole) {
    return {
      kind: "form",
      page: {
        kind: "field", title: e.title, label: FIELD_LABELS[sole.name] ?? sole.name, placeholder: sole.name === "code" ? "ABC123" : "",
        validate: v => (!v.trim() ? "Type something first." : sole.kind === "number" && !Number.isFinite(Number(v)) ? "A number, please." : null),
        onSubmit: async v => {
          const out = await run(host, id, { [sole.name]: sole.kind === "number" ? Number(v) : v.trim() });
          host.notify?.(DONE[id] ?? `Done: ${e.title}.`);
          return out;
        },
      },
    };
  }
  return { kind: "form", page: { kind: "info", title: e.title, lines: [e.tooltip, "Use its controls on the screen; your assistant can also do it for you."] } };
}

/** What a field's operation says once done. */
const DONE: Partial<Record<AffordanceId, string>> = { "chat.send": "Message sent to the room's chat.", "room.join": "You joined the room." };

/** A field's label in words: the parameter's name only when there is none. */
const FIELD_LABELS: Record<string, string> = { text: "Your message", code: "Room code", name: "Name", question: "Your question" };

/** "Leave objects alone" in a grid game: "Leave grids alone" (any case, singular and plural). */
export function nouned(text: string, noun?: { one: string; many: string }): string {
  if (!noun) return text;
  const cap = (w: string) => w[0]!.toUpperCase() + w.slice(1);
  return text.replace(/\b([Aa])n ([Oo])bject\b/g, (_, a: string, o: string) => `${a} ${o === "O" ? cap(noun.one) : noun.one}`).replace(/\b([Oo])bject(s?)\b/g, (_, o: string, s: string) => (o === "O" ? cap : (w: string) => w)(s ? noun.many : noun.one));
}

/** The palette's commands for this context. */
export function paletteCommands(ctx: AffordanceContext, host: PaletteHost): Command[] {
  const rows: Command[] = paletteFor(ctx).map(e => ({
    id: e.id,
    human: { title: nouned(e.title, host.noun), tooltip: nouned(e.tooltip, host.noun) },
    group: e.group,
    keywords: e.keywords,
    confirm: e.confirm,
    performer: performerFor(e, host),
    available: () => e.availability,
  }));
  // Each pane by its own title, once a query is typed ("Lines" finds "Open Lines"); the dock's own pane plan opens it.
  const panes = host.panes;
  if (panes && ctx.game) {
    for (const p of PANE_IDS) {
      if (p === "assistant" && ctx.room?.aiOff) continue;
      rows.push({
        id: `pane:${p}`, human: { title: `Open ${PANES[p].title}`, tooltip: PANES[p].blurb }, group: "view", keywords: [...PANES[p].keywords],
        typedOnly: true, performer: { kind: "submit", run: () => panes.open(p) }, available: () => ({ ok: true }),
      });
    }
  }
  return rows;
}
