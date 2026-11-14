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

/** Reads that a pane shows live: the row opens that pane. */
const READ_PANES: Partial<Record<AffordanceId, PaneId>> = {
  "game.standings": "race", "game.get": "overview", "rule.explain": "my-card", "rule.ladder": "my-card", "objects.list": "objects",
  "moves.list": "feed", "agents.list": "agents", "agent.programs": "forge", "chat.list": "public-chat", "rep.mutators": "my-card",
};

export interface PaletteHost {
  perform(id: AffordanceId, args: unknown): Promise<OpOutcome>;
  navigate(to: string): void;
  /** The room page's path, when a room is in view. */
  roomPath?: string;
  /** Whether the dock is on screen (pane rows open panes there). */
  dock: boolean;
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
  if (schema.safeParse("x").success) return { name, kind: "string" };
  if (schema.safeParse(1).success) return { name, kind: "number" };
  return null;
}

function performerFor(e: PaletteEntry, host: PaletteHost): Performer {
  const id = e.id as AffordanceId;
  if (id === "room.get" && host.roomPath) return { kind: "navigate", to: host.roomPath };
  if (id === "room.list") return { kind: "navigate", to: "/" };
  const pane = READ_PANES[id];
  if (pane && host.dock) return { kind: "submit", run: () => run(host, "view.openPane", { pane }) };
  if (id === "view.openPane" || id === "view.closePane") {
    const page: PaletteFormPage = {
      kind: "pick", title: e.title,
      options: () => PANE_IDS.map(p => ({ id: p, label: PANES[p].title, detail: PANES[p].blurb, keywords: PANES[p].keywords })),
      onPick: p => run(host, id, { pane: p }),
    };
    return { kind: "form", page };
  }
  if (!e.needsInput) return { kind: "submit", run: () => run(host, id, {}) };
  const sole = soleParam(id);
  if (sole) {
    return {
      kind: "form",
      page: {
        kind: "field", title: e.title, label: sole.name, placeholder: sole.name === "code" ? "ABC123" : "",
        validate: v => (!v.trim() ? "Type something first." : sole.kind === "number" && !Number.isFinite(Number(v)) ? "A number, please." : null),
        onSubmit: v => run(host, id, { [sole.name]: sole.kind === "number" ? Number(v) : v.trim() }),
      },
    };
  }
  return { kind: "form", page: { kind: "info", title: e.title, lines: [e.tooltip, "Use its controls on the screen; your assistant can also do it for you."] } };
}

/** The palette's commands for this context. */
export function paletteCommands(ctx: AffordanceContext, host: PaletteHost): Command[] {
  return paletteFor(ctx).map(e => ({
    id: e.id,
    human: { title: e.title, tooltip: e.tooltip },
    group: e.group,
    keywords: e.keywords,
    confirm: e.confirm,
    performer: performerFor(e, host),
    available: () => e.availability,
  }));
}
