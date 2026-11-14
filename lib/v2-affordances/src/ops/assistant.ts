/**
 * The in-client assistant's conversation (integration plan §1 "In-client assistant": pane, queue, modes): the human
 * sends it messages, stops it, chooses its mode, and edits what waits in its queue. Every surface may do these for the
 * human (the palette's "Ask the assistant", the CLI, a remote assistant passing a message on); the in-client assistant
 * itself is refused by the server, since a conversation does not drive itself.
 */
import { z } from "zod/v4";
import { affordance, id, obj, ok, requestId } from "../define.ts";
import { IN_ROOM } from "../types.ts";

export const ASSISTANT_MODES = ["autopilot", "onRequest", "readOnly"] as const;
const grant = z.enum(["read", "act", "owner"]);

export const assistantOps = [
  affordance({
    id: "assistant.send", title: "Ask the assistant", group: "help", scope: "room",
    description: "Sends the human's message to their in-client assistant in this room. It starts a turn, or waits in the queue while a turn runs and starts the next one. `grant` sets what the assistant may do for them (never more than their own rights; owner needs `ownerConsent`). Spends the human's AI allowance for this game.",
    tooltip: "Ask your assistant.", keywords: ["ask", "assistant", "chat with assistant", "help me"],
    params: obj({
      text: z.string().min(1).max(4000),
      threadId: id.optional().describe("Continue this conversation of the current game; omit for the latest one."),
      newThread: z.boolean().optional().describe("Start a new conversation."),
      grant: grant.optional(), ownerConsent: z.boolean().optional(),
      requestId: requestId.optional(),
    }),
    result: z.object({ threadId: id, turnId: id.nullable(), queueId: id.nullable(), queued: z.boolean() }),
    contexts: IN_ROOM, caller: "member", effect: "write", spends: "aiBudget", confirm: "inline", runs: "server",
  }),
  affordance({
    id: "assistant.cancel", title: "Stop the assistant", group: "help", scope: "room",
    description: "Stops the human's assistant's running turn after its current step. Messages waiting in the queue are held until the human sends again.",
    tooltip: "Stop your assistant.", keywords: ["stop", "cancel", "halt assistant"],
    params: obj({ requestId: requestId.optional() }), result: z.object({ status: z.enum(["stopping", "idle"]) }),
    contexts: IN_ROOM, caller: "member", effect: "write", confirm: "none", runs: "server",
  }),
  affordance({
    id: "assistant.setMode", title: "Set the assistant's mode", group: "help", scope: "room",
    description: "Autopilot: it plays for the human on its own while the game runs. On request (the default): it acts only when asked. Read-only: it answers with read-only tools and never changes anything. Kept for this room across its games.",
    tooltip: "How much your assistant does on its own.", keywords: ["autopilot", "read only", "on request", "assistant mode"],
    params: obj({ mode: z.enum(ASSISTANT_MODES), grant: grant.optional(), ownerConsent: z.boolean().optional(), requestId: requestId.optional() }),
    result: z.object({ mode: z.enum(ASSISTANT_MODES), grant }),
    contexts: IN_ROOM, caller: "member", effect: "write", spends: "aiBudget", confirm: "inline", runs: "server",
  }),
  affordance({
    id: "assistant.editQueued", title: "Edit a waiting message", group: "help", scope: "room",
    description: "Changes the text of one of the human's messages still waiting in the assistant's queue.",
    tooltip: "Edit a message before the assistant reads it.", keywords: ["edit queued", "change message"],
    params: obj({ queueId: id, text: z.string().min(1).max(4000), requestId: requestId.optional() }), result: ok,
    contexts: IN_ROOM, caller: "member", effect: "write", confirm: "none", runs: "server",
  }),
  affordance({
    id: "assistant.removeQueued", title: "Remove a waiting message", group: "help", scope: "room",
    description: "Takes one of the human's waiting messages out of the assistant's queue.",
    tooltip: "Withdraw a message before the assistant reads it.", keywords: ["remove queued", "delete message", "withdraw"],
    params: obj({ queueId: id, requestId: requestId.optional() }), result: ok,
    contexts: IN_ROOM, caller: "member", effect: "write", confirm: "none", runs: "server",
  }),
  affordance({
    id: "assistant.sendQueued", title: "Send the held messages", group: "help", scope: "room",
    description: "Sends the messages a Stop (or a failed turn) held in the queue, as the next turn.",
    tooltip: "Send your held messages now.", keywords: ["send held", "resume assistant", "continue"],
    params: obj({ requestId: requestId.optional() }), result: z.object({ turnId: id.nullable() }),
    contexts: IN_ROOM, caller: "member", effect: "write", spends: "aiBudget", confirm: "inline", runs: "server",
  }),
] as const;
