/**
 * The palette's current command list and context, published by the header, so a prompt chip in command form (the
 * assistant off) or the overview can run a command by id without opening the palette. A command that needs a form
 * page, or confirmation, opens the palette at it instead; a hand-off pre-fills the composer.
 */
import type { Command, PaletteContext } from "@workspace/ui-kit";
import { composer } from "@/core/chat/composer";
import { notify, notifyError } from "@/core/notices";
import { paletteStore } from "./store";

let current: { commands: readonly Command[]; context: PaletteContext | null } = { commands: [], context: null };
export function publishCommands(commands: readonly Command[], context: PaletteContext) { current = { commands, context }; }

/** Turn a hand-off into a local action, so any palette implementation pre-fills the composer and never sends. */
export function withHandoffs(commands: readonly Command[]): Command[] {
  return commands.map(command => command.performer.kind === "handoff"
    ? { ...command, performer: { kind: "local", run: () => composer.fill((command.performer as { draft: string }).draft) } }
    : command);
}

export function runPaletteCommand(id: string) {
  const command = current.commands.find(c => c.id === id);
  if (!command || !current.context) { paletteStore.open(null); return; }
  const availability = command.available(current.context);
  if (!availability.ok) { notify(availability.fix ? `${availability.reason} ${availability.fix}` : availability.reason); return; }
  const p = command.performer;
  // A command with a form or a confirmation opens the palette on that command's own page.
  if (p.kind === "form" || (command.confirm && command.confirm !== "none")) { paletteStore.open(current.context.scope?.paneId ?? null, { page: command.id }); return; }
  if (p.kind === "handoff") composer.fill(p.draft);
  else if (p.kind === "local") p.run();
  else if (p.kind === "submit") void p.run().catch(notifyError);
  else location.assign(typeof p.to === "function" ? p.to() : p.to);
}
