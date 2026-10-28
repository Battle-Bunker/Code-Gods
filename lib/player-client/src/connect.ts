/**
 * `pnpm player connect`: the device flow (PKCE S256) that turns a human's browser approval into a scoped,
 * revocable room credential, plus the env-file helpers for `--write-env` and `disconnect`.
 */
import { createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { z } from "zod";
import { EngineError, discover, normalizeEngineUrl, type Discovery } from "./engine.ts";
import { permissionSchema, type Permission } from "./protocol.ts";

export interface PendingApproval {
  verificationUrl: string; userCode: string; roomId: string; roomCode: string;
  permission: Permission; label: string; expiresAt: number; interval: number;
}
export interface ConnectResult {
  engineUrl: string; credential: string; credentialId: string;
  roomId: string; roomCode: string; permission: Permission; expiresAt: number;
}
export interface ConnectOptions {
  engineUrl: string; room: string; permission: Permission; label: string;
  /** Shown to the human: the URL to open and the code to compare. */
  onPending: (pending: PendingApproval) => void;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const requestSchema = z.object({
  deviceId: z.string().min(1).max(64), deviceSecret: z.string().min(1).max(256),
  userCode: z.string().regex(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/), verificationUrl: z.string().max(2048),
  roomId: z.string().min(1).max(64), roomCode: z.string().min(1).max(32), permission: permissionSchema,
  label: z.string().max(120), expiresIn: z.number().positive().max(3600), interval: z.number().min(1).max(30),
});
const approvedSchema = z.object({
  status: z.literal("approved"), credential: z.string().regex(/^cgc_[A-Za-z0-9_-]{16,124}$/), credentialId: z.string().min(1).max(64),
  roomId: z.string().min(1).max(64), permission: permissionSchema, expiresAt: z.number(),
});

/** A PKCE S256 pair: a 43-character verifier and its challenge. */
export function pkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

async function post(fetcher: typeof fetch, url: string, body: unknown) {
  let response: Response;
  try {
    response = await fetcher(url, { method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch { return { status: 0, body: {} as Record<string, unknown> }; }
  const text = await response.text();
  let parsed: Record<string, unknown> = {};
  try { parsed = text.length <= 24000 ? JSON.parse(text) : {}; } catch { /* non-JSON */ }
  return { status: response.status, body: parsed };
}

/** The approval page must be on the engine's own site; anything else is refused rather than shown to the human. */
function checkVerificationUrl(raw: string, discovery: Discovery, engineUrl: string, userCode: string) {
  let url: URL;
  try { url = new URL(raw); } catch { throw new EngineError("UNREACHABLE", "The engine returned an invalid approval URL"); }
  const origins = new Set([engineUrl, (() => { try { return new URL(discovery.siteUrl).origin; } catch { return engineUrl; } })()]);
  if (!origins.has(url.origin) || url.username || url.password || url.hash || url.pathname !== "/device" || url.searchParams.get("code") !== userCode) {
    throw new EngineError("UNREACHABLE", "The engine returned an unexpected approval URL");
  }
  return url.href;
}

/**
 * Requests approval for `room` with `permission`, reports the URL and comparison code, and polls until the
 * human approves (→ the credential, returned once), denies, or the request expires.
 */
export async function connectDevice(options: ConnectOptions): Promise<ConnectResult> {
  const fetcher = options.fetch ?? fetch, now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
  const engineUrl = normalizeEngineUrl(options.engineUrl);
  const discovery = await discover(engineUrl, fetcher);
  const { verifier, challenge } = pkcePair();
  const requested = await post(fetcher, `${engineUrl}/api/device/request`, {
    challenge, room: options.room, permission: options.permission, label: options.label,
  });
  if (requested.status === 0) throw new EngineError("UNREACHABLE", `Engine unreachable at ${engineUrl}`);
  if (requested.status === 404) throw new EngineError("INVALID_CONFIG", `Room ${options.room} not found`);
  if (requested.status !== 200) {
    const message = typeof requested.body.error === "string" ? requested.body.error : `HTTP ${requested.status}`;
    throw new EngineError(requested.status === 400 ? "INVALID_CONFIG" : "UNREACHABLE", `Approval request refused: ${message}`);
  }
  const device = requestSchema.parse(requested.body);
  if (device.permission !== options.permission) throw new EngineError("UNREACHABLE", "The engine changed the requested permission");
  const deadline = now() + device.expiresIn * 1000;
  options.onPending({
    verificationUrl: checkVerificationUrl(device.verificationUrl, discovery, engineUrl, device.userCode), userCode: device.userCode,
    roomId: device.roomId, roomCode: device.roomCode, permission: device.permission, label: device.label, expiresAt: deadline, interval: device.interval,
  });
  let interval = device.interval * 1000;
  while (now() < deadline) {
    await sleep(interval);
    const polled = await post(fetcher, `${engineUrl}/api/device/poll`, { deviceId: device.deviceId, deviceSecret: device.deviceSecret, verifier });
    switch (polled.status) {
      case 200: {
        const approved = approvedSchema.parse(polled.body);
        if (approved.roomId !== device.roomId || approved.permission !== options.permission) throw new EngineError("UNREACHABLE", "The approval's scope does not match the request");
        return { engineUrl, credential: approved.credential, credentialId: approved.credentialId, roomId: approved.roomId,
          roomCode: device.roomCode, permission: approved.permission, expiresAt: approved.expiresAt };
      }
      case 202: continue;
      case 429: interval = Math.min(interval + 1000, 10000); continue;
      case 0: case 500: case 502: case 503: case 504: interval = Math.min(interval * 2, 10000); continue; // transient: keep polling
      case 403: throw new EngineError("RECONNECT", polled.body.status === "forbidden"
        ? "Approval refused: the approver is no longer the room owner" : "Approval denied in the browser");
      case 410: throw new EngineError("RECONNECT", "The approval request expired; run connect again");
      default: throw new EngineError("RECONNECT", "The approval request is no longer valid; run connect again");
    }
  }
  throw new EngineError("RECONNECT", "The approval request expired; run connect again");
}

// ---------------------------------------------------------------------------------------------
// Env files (local tests and simulated apps only; a Replit app uses Secrets)
// ---------------------------------------------------------------------------------------------

const quote = (value: string) => /^[A-Za-z0-9_\-.:/@+=,]*$/.test(value) ? value : JSON.stringify(value);

/** Sets (or, with `undefined`, removes) keys in an env file, keeping other lines; the file is written with mode 0600. */
export function updateEnvFile(file: string, values: Record<string, string | undefined>) {
  const lines = existsSync(file) ? readFileSync(file, "utf8").split(/\r?\n/) : [];
  if (lines.at(-1) === "") lines.pop();
  const pending = new Map(Object.entries(values));
  const out: string[] = [];
  for (const line of lines) {
    const key = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)?.[1];
    if (key && pending.has(key)) {
      const value = pending.get(key);
      pending.delete(key);
      if (value !== undefined) out.push(`${key}=${quote(value)}`);
    } else out.push(line);
  }
  for (const [key, value] of pending) if (value !== undefined) out.push(`${key}=${quote(value)}`);
  const temp = join(dirname(file), `.${basename(file)}.${process.pid}.tmp`);
  writeFileSync(temp, out.length ? out.join("\n") + "\n" : "", { mode: 0o600 });
  chmodSync(temp, 0o600);
  renameSync(temp, file);
}
