/**
 * Dev-server side of a player app: holds the room credential (Replit Secret CODE_GODS_CREDENTIAL)
 * and answers GET <base>__codegods/token with a short-lived engine JWT, so the browser never sees the
 * credential. Same-origin requests only.
 *
 * Not configured (no CODE_GODS_ENGINE_URL): 404, and the client falls back to hosted mode.
 * Configured without a credential: 503 with the command that fixes it.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

type Token = { token: string; expiresAt: number; convexUrl: string; roomId: string; permission: string };
let cached: Token | undefined;
let convexUrl: string | undefined;

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
};

function sameOrigin(req: IncomingMessage): boolean {
  const site = req.headers["sec-fetch-site"];
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = req.headers.origin;
  return !origin || new URL(origin).host === req.headers.host;
}

export async function engineToken(req: IncomingMessage, res: ServerResponse) {
  const engine = process.env.CODE_GODS_ENGINE_URL?.replace(/\/+$/, "");
  if (!engine) return json(res, 404, { error: "Not a player app (CODE_GODS_ENGINE_URL is not set)." });
  if (!sameOrigin(req)) return json(res, 403, { error: "Cross-site token requests are refused." });
  const credential = process.env.CODE_GODS_CREDENTIAL;
  if (!credential) return json(res, 503, { error: "This player app is not connected yet: run `pnpm player connect --room <CODE>`, store CODE_GODS_CREDENTIAL as a Replit Secret and restart the Player workflow." });
  try {
    if (!cached || cached.expiresAt - Date.now() < 60_000) {
      convexUrl ??= ((await (await fetch(`${engine}/api/config`)).json()) as { convexUrl: string }).convexUrl;
      const response = await fetch(`${engine}/api/device/token`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credential }),
      });
      if (response.status === 401) { cached = undefined; return json(res, 401, { error: "The engine refused this player app's credential (revoked or expired). Run `pnpm player connect` again." }); }
      if (!response.ok) return json(res, 502, { error: `The engine answered ${response.status}.` });
      const body = await response.json() as { token: string; expiresAt: number; roomId: string; permission: string };
      cached = { token: body.token, expiresAt: body.expiresAt, roomId: body.roomId, permission: body.permission, convexUrl };
    }
    return json(res, 200, cached);
  } catch {
    return json(res, 502, { error: `Cannot reach the engine at ${engine}.` });
  }
}
