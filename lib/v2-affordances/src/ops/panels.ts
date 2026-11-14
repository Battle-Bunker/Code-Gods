/**
 * `panel.*`: stored panels, a human's own UI panels as TSX kept on the server and rendered by every client of theirs
 * in a sandboxed frame (`@sdk` version 2). They belong to the human across rooms, so the scope is none; another
 * human's panels are never visible or addressable. Saving compiles in Node, so `panel.save` is an action.
 */
import { z } from "zod/v4";
import { affordance, id, none, obj, ok, requestId } from "../define.ts";
import { SIGNED_IN } from "../types.ts";

/** The server's own limits (convex/v2/panelShapes.ts) repeat these; the source cap there is in UTF-8 bytes. */
export const PANEL_SOURCE_MAX = 64 * 1024;

const slug = z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/)
  .describe('The panel\'s id: kebab-case, 1–48 lowercase letters, digits and dashes, e.g. "my-stats".');
const version = z.number().int().min(1);
const placement = z.enum(["left", "right", "bottom"]);
const size = z.enum(["sm", "md", "lg"]);
const author = z.object({ kind: z.enum(["browser", "delegate"]), label: z.string() });
const diagnostic = z.object({ line: z.number().int(), column: z.number().int(), code: z.string(), message: z.string() });

export const panelOps = [
  affordance({
    id: "panel.list", title: "List my panels", group: "view", scope: "none",
    description: "The signed-in human's stored panels (no code): slug, title, add-pane hints (placement, size), current version, whether enabled, the current version's author, and lastForeignVersion (the latest version a delegate wrote).",
    tooltip: "Your custom panels.", keywords: ["panels", "custom panels", "my panels", "widgets"],
    params: none, result: z.object({
      panels: z.array(z.object({
        panelId: id, slug: z.string(), title: z.string(), placement, size, currentVersion: z.number().int(), enabled: z.boolean(),
        updatedAt: z.number(), author, lastForeignVersion: z.number().int(),
      })),
    }),
    contexts: SIGNED_IN, caller: "signedIn", effect: "read", confirm: "none", runs: "server",
  }),
  affordance({
    id: "panel.code", title: "Read a panel's code", group: "view", scope: "none",
    description: "One version of one of the human's panels (default: the current one): its TSX source, the compiled CommonJS, compile diagnostics, compiler version, source hash, author and time. Only the last 20 versions are kept.",
    tooltip: "A panel's source.", keywords: ["panel source", "panel code", "view panel code"],
    params: obj({ slug, version: version.optional().describe("Omit for the current version.") }),
    result: z.object({
      slug: z.string(), version: z.number().int(), source: z.string(), compiled: z.string(), diagnostics: z.array(diagnostic),
      compilerVersion: z.string(), sourceHash: z.string(), author, createdAt: z.number(),
    }),
    contexts: SIGNED_IN, caller: "signedIn", effect: "read", confirm: "none", runs: "server",
  }),
  affordance({
    id: "panel.save", title: "Save a panel", group: "view", scope: "none",
    description: 'Compiles TSX and stores it as the next version of the human\'s panel `slug` (created on first save). The module default-exports definePanel({title, placement, size, Component}) from "@sdk" and may import only react, react/jsx-runtime and @sdk. A compile error returns saved: false with diagnostics {line, column, code, message} and stores nothing. title, placement and size override the literal manifest. At most 32 panels and 30 saves a minute.',
    tooltip: "Store a custom panel.", keywords: ["save panel", "write panel", "custom panel", "make a panel"],
    params: obj({
      slug,
      source: z.string().min(1).max(PANEL_SOURCE_MAX).describe("The panel's TSX module (≤ 64 KiB)."),
      title: z.string().min(1).max(80).optional(), placement: placement.optional(), size: size.optional(),
      requestId: requestId.optional(),
    }),
    result: z.object({ saved: z.boolean(), slug: z.string(), version: z.number().int().nullable(), diagnostics: z.array(diagnostic) }),
    contexts: SIGNED_IN, caller: "signedIn", effect: "write", confirm: "summary", runs: "server", action: true,
  }),
  affordance({
    id: "panel.rollback", title: "Roll a panel back", group: "view", scope: "none",
    description: "Makes an older kept version of a panel current again, as a new version with that code. Returns the new version and the one it came from.",
    tooltip: "Restore an earlier version.", keywords: ["rollback", "undo panel", "restore panel", "revert"],
    params: obj({ slug, version, requestId: requestId.optional() }),
    result: z.object({ slug: z.string(), version: z.number().int(), from: z.number().int() }),
    contexts: SIGNED_IN, caller: "signedIn", effect: "write", confirm: "inline", runs: "server",
  }),
  affordance({
    id: "panel.setEnabled", title: "Show or hide a panel", group: "view", scope: "none",
    description: "Enables or disables one of the human's panels in every client of theirs; it stays stored either way.",
    tooltip: "Turn a panel on or off.", keywords: ["enable panel", "disable panel", "hide panel", "show panel"],
    params: obj({ slug, enabled: z.boolean(), requestId: requestId.optional() }), result: ok,
    contexts: SIGNED_IN, caller: "signedIn", effect: "write", confirm: "none", runs: "server",
  }),
  affordance({
    id: "panel.remove", title: "Delete a panel", group: "view", scope: "none",
    description: "Deletes one of the human's panels and every kept version. A later save of the same slug makes a new panel.",
    tooltip: "Delete a custom panel.", keywords: ["delete panel", "remove panel"],
    params: obj({ slug, requestId: requestId.optional() }), result: ok,
    contexts: SIGNED_IN, caller: "signedIn", effect: "destructive", confirm: "modal", runs: "server",
  }),
] as const;
