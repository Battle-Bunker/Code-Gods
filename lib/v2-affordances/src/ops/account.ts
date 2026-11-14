/**
 * The account: who am I, connected assistants, and the two consent screens. Consent (signing in, approving a remote
 * assistant's connection) is the directory's only exemption: it must be the human's own click, so no assistant, MCP
 * client or CLI can perform it.
 */
import { z } from "zod/v4";
import { affordance, id, none, obj, ok, requestId } from "../define.ts";
import { SIGNED_IN } from "../types.ts";

const CONSENT = { except: ["assistant", "mcp", "cli"], because: "consent" } as const;

export const accountOps = [
  affordance({
    id: "account.whoami", title: "Show who I am", group: "account", scope: "none",
    description: "The signed-in human's display name and user id, and, for a delegated credential, the room it is bound to and its permission.",
    tooltip: "Your account.", keywords: ["account", "profile", "me", "whoami"],
    params: none, result: z.object({ userId: id, name: z.string(), roomId: id.nullable(), grant: z.enum(["read", "act", "owner"]).nullable() }),
    contexts: SIGNED_IN, caller: "signedIn", effect: "read", confirm: "none", runs: "server",
  }),
  affordance({
    id: "account.connections", title: "List connected assistants", group: "account", scope: "none",
    description: "The remote assistants and devices the human has connected (MCP OAuth grants and room credentials), with room, permission and last use.",
    tooltip: "Assistants you have connected.", keywords: ["connections", "devices", "mcp", "credentials", "assistants"],
    params: none, result: z.object({ connections: z.array(z.object({ connectionId: id, client: z.string(), roomId: id.nullable(), grant: z.enum(["read", "act", "owner"]), lastUsedAt: z.number().nullable() })) }),
    contexts: SIGNED_IN, caller: "signedIn", effect: "read", confirm: "none", runs: "server",
  }),
  affordance({
    id: "account.revokeConnection", title: "Disconnect an assistant", group: "account", scope: "none",
    description: "Revokes a connected assistant's or device's access at once.", tooltip: "Cut off a connected assistant.", keywords: ["revoke", "disconnect", "remove device"],
    params: obj({ connectionId: id, requestId: requestId.optional() }), result: ok,
    contexts: SIGNED_IN, caller: "signedIn", effect: "destructive", confirm: "modal", runs: "server",
  }),
  affordance({
    id: "account.signIn", title: "Sign in", group: "account", scope: "none",
    description: "Starts signing in with Google (or the test-only provider). A human's own click only.",
    tooltip: "Sign in to play.", keywords: ["sign in", "log in", "login"],
    params: none, result: ok,
    contexts: ["signedOut"], caller: "anyone", effect: "write", confirm: "none", runs: "client", surfaces: CONSENT,
  }),
  affordance({
    id: "account.approveConnection", title: "Approve a connection", group: "account", scope: "none",
    description: "Approves a pending connection request so a remote assistant can act for the human: a device code (its room comes with it) or an OAuth request (the human chooses the room; an owner or account grant needs its explicit consent; `completion` is the browser's one-time secret that finishes the OAuth redirect). The grant may be lowered, never raised. A human's own click only.",
    tooltip: "Let this assistant act for you.", keywords: ["approve", "allow", "consent", "connect assistant"],
    params: obj({
      request: id.describe("A device code, or an OAuth request id."),
      grant: z.enum(["read", "act", "owner", "account"]).describe("account: an app acting as the human in every room (OAuth only)."),
      room: id.optional().describe("OAuth: the room the connection acts in (not for an account grant)."),
      completion: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/).optional().describe("OAuth: the browser's one-time completion secret (43–128 base64url characters)."),
      ownerConsent: z.boolean().optional().describe("OAuth: explicit consent to an owner grant."),
      accountConsent: z.boolean().optional().describe("OAuth: explicit consent to an account grant."),
      requestId: requestId.optional(),
    }), result: ok,
    contexts: SIGNED_IN, caller: "signedIn", effect: "write", confirm: "modal", runs: "server", surfaces: CONSENT,
  }),
] as const;
