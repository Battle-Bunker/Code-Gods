/**
 * The shared command palette's vocabulary (docs/ui-redesign.md §2.5). A Command is one catalogue entry (or a
 * client-only `ui.*` action of the same human shape) plus a performer: what happens when it runs. Pure types.
 */
import type { Phase } from "@workspace/player-client/lenses";
import type { PaletteGroup } from "@workspace/player-client/catalog";
import type { ToolName } from "@workspace/player-client/tools";

export type { PaletteGroup, Phase };
export type Confirm = "none" | "inline" | "summary" | "modal";

/** A nested palette page: pick one option from a list, or fill one validated field, then submit. */
export type PaletteFormPage =
  | { kind: "pick"; title: string; options: () => Promise<readonly PickOption[]> | readonly PickOption[]; onPick: (id: string) => Promise<unknown> | unknown }
  | { kind: "field"; title: string; label: string; placeholder?: string; validate?: (value: string) => string | null; consequence?: (value: string) => string; onSubmit: (value: string) => Promise<unknown> | unknown };
export type PickOption = { id: string; label: string; detail?: string };

export type Performer =
  | { kind: "navigate"; to: string | (() => string) }
  | { kind: "form"; page: PaletteFormPage }
  | { kind: "submit"; run: () => Promise<unknown> }
  /** Pre-fills the assistant composer with an editable draft; never sends. */
  | { kind: "handoff"; draft: string; tool?: ToolName }
  | { kind: "local"; run: () => void };

export type Availability = { ok: true } | { ok: false; reason: string; fix?: string; hidden?: boolean };

export interface Command {
  id: string;
  human: { title: string; tooltip: string };
  group: PaletteGroup;
  keywords?: readonly string[];
  shortcut?: string;
  confirm?: Confirm;
  performer: Performer;
  available: (ctx: PaletteContext) => Availability;
  /** Ordering within the empty-query view (higher first). */
  defaultScore?: number;
}

export interface PaletteContext {
  /** Engine UI roles, in rank order; the player client maps its credential onto member/seated/owner. */
  role: "visitor" | "signed-in" | "member" | "seated" | "owner";
  admin: boolean;
  /** The player client's credential permission. */
  permission?: "read" | "act" | "owner";
  phase?: Phase;
  assistantOn: boolean;
  /** The pane the palette was opened for ("this pane" commands). */
  scope?: { paneId: string };
}
