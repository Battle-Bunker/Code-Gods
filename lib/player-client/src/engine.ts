/**
 * Node-side connection from a player app (or its Replit Agent) to the Code Gods engine.
 *
 * Configuration lives in two Replit Secrets:
 *   CODE_GODS_ENGINE_URL   the engine's website (site) URL; `GET /api/config` gives the Convex client URL
 *   CODE_GODS_CREDENTIAL   a scoped, revocable room credential (`cgc_…`, 7 days) from `pnpm player connect`
 * For local tests a gitignored `.env.local` (or the file named by CODE_GODS_ENV_FILE) is read as a fallback.
 *
 * Every call exchanges the credential for a 10-minute player JWT (`POST /api/device/token`), cached and
 * refreshed about a minute before expiry, and uses the Convex client with the engine's generated `api`.
 * The credential never leaves this process except to that exchange; `tokenHandler()` gives a same-origin
 * browser only the short JWT.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { ConvexClient, ConvexHttpClient } from "convex/browser";
import type { FunctionReference, FunctionReturnType, OptionalRestArgs } from "convex/server";
import { ConvexError } from "convex/values";
import { api } from "@workspace/engine/convex/_generated/api.js";
import type { Permission } from "./protocol.ts";

export { api };
export type { Permission };

export const ENGINE_URL_VAR = "CODE_GODS_ENGINE_URL";
export const CREDENTIAL_VAR = "CODE_GODS_CREDENTIAL";
export const ENV_FILE_VAR = "CODE_GODS_ENV_FILE";
/** Path of the browser token endpoint served by `tokenHandler()`. */
export const TOKEN_PATH = "/__codegods/token";
/** Path of the private launch link (`?key=<launch key>`) that opens a browser session for `TOKEN_PATH`. */
export const LAUNCH_PATH = "/__codegods/launch";
/** Refresh a cached JWT this long before it expires. */
export const REFRESH_MARGIN_MS = 60_000;
const TIMEOUT_MS = 15_000;
const CREDENTIAL_PATTERN = /^cgc_[A-Za-z0-9_-]{16,124}$/;

export type EngineErrorCode =
  | "NOT_CONFIGURED" // no engine URL or credential
  | "INVALID_CONFIG" // a malformed engine URL or credential
  | "UNREACHABLE"    // network failure, timeout or an unexpected engine response
  | "RECONNECT";     // the credential was revoked or has expired: run `pnpm player connect` again

/** A setup or connection problem. Messages never contain the credential or a token. */
export class EngineError extends Error {
  readonly code: EngineErrorCode;
  constructor(code: EngineErrorCode, message: string) { super(message); this.name = "EngineError"; this.code = code; }
}
export const RECONNECT_MESSAGE =
  "reconnect: the room credential was revoked or has expired. Run `pnpm player connect --room CODE` and replace the CODE_GODS_CREDENTIAL Secret.";

/** A redacted copy of any text: room credentials, device secrets and JWTs never reach output or logs. */
export function redact(text: string): string {
  return text
    .replace(/\bcg[cd]_[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted]");
}

// ---------------------------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------------------------

/** Parses KEY=VALUE lines (optional `export`, quotes and `#` comments). */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    let value = match[2];
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, "");
    out[match[1]] = value;
  }
  return out;
}

/** The local fallback file: $CODE_GODS_ENV_FILE, else `.env.local` where pnpm was invoked (INIT_CWD) or the cwd. */
export function envFilePath(env: NodeJS.ProcessEnv = process.env): string {
  return resolve(env.INIT_CWD ?? process.cwd(), env[ENV_FILE_VAR] || ".env.local");
}

/** The engine's site origin. HTTPS, or HTTP on loopback; no credentials, query or fragment. A `.convex.cloud` URL maps to its `.convex.site`. */
export function normalizeEngineUrl(input: string): string {
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new EngineError("INVALID_CONFIG", `${ENGINE_URL_VAR} is not a URL`); }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!(url.protocol === "https:" || (url.protocol === "http:" && loopback))) throw new EngineError("INVALID_CONFIG", `${ENGINE_URL_VAR} must be an https:// URL (http:// only for localhost)`);
  if (url.username || url.password || url.search || url.hash) throw new EngineError("INVALID_CONFIG", `${ENGINE_URL_VAR} must be a plain site URL without credentials, query or fragment`);
  if (url.hostname.endsWith(".convex.cloud")) url.hostname = url.hostname.replace(/\.convex\.cloud$/, ".convex.site");
  return url.origin;
}

export interface EngineConfig {
  engineUrl: string;
  credential: string;
  /** Where each value came from; `file` is the env file below. */
  source: { engineUrl: "option" | "env" | "file"; credential: "option" | "env" | "file" };
  envFile?: string;
}
export interface LoadConfigOptions {
  env?: NodeJS.ProcessEnv;
  /** An explicit fallback file, or false for none. Default: envFilePath(env). */
  envFile?: string | false;
  engineUrl?: string;
  credential?: string;
}

/** Reads the engine URL and credential: explicit options, then the environment (Replit Secrets), then the env file. */
export function loadConfig(options: LoadConfigOptions = {}): EngineConfig {
  const env = options.env ?? process.env;
  const file = options.envFile === false ? undefined : (options.envFile ?? envFilePath(env));
  let fileVars: Record<string, string> = {};
  if (file && existsSync(file)) {
    try { fileVars = parseEnvFile(readFileSync(file, "utf8")); } catch { throw new EngineError("INVALID_CONFIG", `Cannot read ${file}`); }
  }
  const pick = (explicit: string | undefined, name: string) =>
    explicit ? { value: explicit, from: "option" as const }
      : env[name] ? { value: env[name]!, from: "env" as const }
      : fileVars[name] ? { value: fileVars[name], from: "file" as const } : undefined;
  const engineUrl = pick(options.engineUrl, ENGINE_URL_VAR), credential = pick(options.credential, CREDENTIAL_VAR);
  if (!engineUrl || !credential) {
    const missing = [!engineUrl && ENGINE_URL_VAR, !credential && CREDENTIAL_VAR].filter(Boolean).join(" and ");
    throw new EngineError("NOT_CONFIGURED", `Not connected: set the Replit Secret${missing.includes(" and ") ? "s" : ""} ${missing}. Run \`pnpm player connect --engine URL --room CODE\` to get a credential.`);
  }
  if (!CREDENTIAL_PATTERN.test(credential.value.trim())) throw new EngineError("INVALID_CONFIG", `${CREDENTIAL_VAR} is not a Code Gods room credential (cgc_…)`);
  const usedFile = engineUrl.from === "file" || credential.from === "file";
  return {
    engineUrl: normalizeEngineUrl(engineUrl.value), credential: credential.value.trim(),
    source: { engineUrl: engineUrl.from, credential: credential.from }, ...(usedFile && file ? { envFile: file } : {}),
  };
}

// ---------------------------------------------------------------------------------------------
// Discovery and token exchange
// ---------------------------------------------------------------------------------------------

export interface Discovery { convexUrl: string; siteUrl: string; version: string }
export interface PlayerToken {
  token: string; expiresAt: number; roomId: string; permission: Permission;
  credentialId: string; credentialExpiresAt: number;
}

async function request(fetcher: typeof fetch, url: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetcher(url, { redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS), ...init });
  } catch {
    throw new EngineError("UNREACHABLE", `Engine unreachable at ${new URL(url).origin}`);
  }
}
async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (text.length > 1_000_000) throw new EngineError("UNREACHABLE", "Engine response too large");
  try { const value = JSON.parse(text); if (value && typeof value === "object") return value; } catch { /* below */ }
  throw new EngineError("UNREACHABLE", `Unexpected engine response (HTTP ${response.status})`);
}

/** `GET /api/config` → the Convex client URL for this engine site. */
export async function discover(engineUrl: string, fetcher: typeof fetch = fetch): Promise<Discovery> {
  const site = normalizeEngineUrl(engineUrl);
  const response = await request(fetcher, `${site}/api/config`);
  if (!response.ok) throw new EngineError("UNREACHABLE", `${site} is not a Code Gods engine (GET /api/config: HTTP ${response.status})`);
  const body = await readJson(response);
  const convexUrl = typeof body.convexUrl === "string" ? body.convexUrl : "";
  if (!/^https?:\/\/[^\s/]+\/?$/.test(convexUrl)) throw new EngineError("UNREACHABLE", `${site} returned no Convex client URL`);
  return { convexUrl: convexUrl.replace(/\/$/, ""), siteUrl: typeof body.siteUrl === "string" ? body.siteUrl : site, version: String(body.version ?? "") };
}

function isPermission(value: unknown): value is Permission { return value === "read" || value === "act" || value === "owner"; }

/** A ConvexError's `{code, message}`, or undefined for any other error. */
export function convexErrorData(error: unknown): { code: string; message: string } | undefined {
  if (!(error instanceof ConvexError)) return undefined;
  const data = error.data as { code?: unknown; message?: unknown } | string;
  if (typeof data === "string") return { code: "ERROR", message: data };
  return { code: String(data?.code ?? "ERROR"), message: String(data?.message ?? "Engine error") };
}

export interface EngineOptions {
  fetch?: typeof fetch;
  /** Refresh this long before expiry (default 60 s). */
  refreshMarginMs?: number;
  now?: () => number;
}

/**
 * One configured engine connection. Holds the credential in a private field (never serialised or logged)
 * and a cached player JWT. Calls go through ConvexHttpClient; `realtimeClient()` gives a subscribing ConvexClient.
 */
export class Engine {
  readonly engineUrl: string;
  readonly config: Omit<EngineConfig, "credential">;
  #credential: string;
  #fetch: typeof fetch;
  #margin: number;
  #now: () => number;
  #discovery: Promise<Discovery> | undefined;
  #token: PlayerToken | undefined;
  #pending: Promise<PlayerToken> | undefined;
  #http: ConvexHttpClient | undefined;
  #httpToken: string | undefined;

  constructor(config: EngineConfig | { engineUrl: string; credential: string }, options: EngineOptions = {}) {
    if (!CREDENTIAL_PATTERN.test(config.credential)) throw new EngineError("INVALID_CONFIG", `${CREDENTIAL_VAR} is not a Code Gods room credential (cgc_…)`);
    this.engineUrl = normalizeEngineUrl(config.engineUrl);
    const full = config as Partial<EngineConfig>;
    this.config = { engineUrl: this.engineUrl, source: full.source ?? { engineUrl: "option", credential: "option" }, ...(full.envFile ? { envFile: full.envFile } : {}) };
    this.#credential = config.credential;
    this.#fetch = options.fetch ?? fetch;
    this.#margin = options.refreshMarginMs ?? REFRESH_MARGIN_MS;
    this.#now = options.now ?? Date.now;
  }

  /** Never print the credential, even by accident. */
  toJSON() { return { engineUrl: this.engineUrl }; }
  [Symbol.for("nodejs.util.inspect.custom")]() { return `Engine(${this.engineUrl})`; }

  /** The engine's discovery document (cached; retried after a failure). */
  discover(): Promise<Discovery> {
    this.#discovery ??= discover(this.engineUrl, this.#fetch).catch(error => { this.#discovery = undefined; throw error; });
    return this.#discovery;
  }

  /** A player JWT for this credential: cached, refreshed `refreshMarginMs` before expiry, one exchange at a time. */
  async token(options: { force?: boolean } = {}): Promise<PlayerToken> {
    const cached = this.#token;
    if (!options.force && cached && cached.expiresAt - this.#margin > this.#now()) return cached;
    this.#pending ??= this.#exchange().finally(() => { this.#pending = undefined; });
    return this.#pending;
  }

  async #exchange(): Promise<PlayerToken> {
    const response = await request(this.#fetch, `${this.engineUrl}/api/device/token`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.#credential}` }, body: "{}",
    });
    if (response.status === 401) { this.#token = undefined; throw new EngineError("RECONNECT", RECONNECT_MESSAGE); }
    if (response.status === 400) throw new EngineError("INVALID_CONFIG", `${CREDENTIAL_VAR} was refused as malformed`);
    if (!response.ok) throw new EngineError("UNREACHABLE", `Token exchange failed (HTTP ${response.status})`);
    const body = await readJson(response);
    const { token, expiresAt, roomId, permission, credentialId, credentialExpiresAt } = body;
    if (typeof token !== "string" || typeof expiresAt !== "number" || typeof roomId !== "string" || !isPermission(permission) ||
      typeof credentialId !== "string" || typeof credentialExpiresAt !== "number") {
      throw new EngineError("UNREACHABLE", "Unexpected token exchange response");
    }
    this.#token = { token, expiresAt, roomId, permission, credentialId, credentialExpiresAt };
    return this.#token;
  }

  /** Forget the cached JWT (e.g. after a revocation). */
  clearToken() { this.#token = undefined; }

  /** A ConvexHttpClient authenticated with a fresh player JWT. */
  async httpClient(): Promise<ConvexHttpClient> {
    const [{ convexUrl }, { token }] = await Promise.all([this.discover(), this.token()]);
    this.#http ??= new ConvexHttpClient(convexUrl);
    if (this.#httpToken !== token) { this.#http.setAuth(token); this.#httpToken = token; }
    return this.#http;
  }

  /** Runs one Convex call; on UNAUTHENTICATED (revoked mid-token) re-exchanges once, which reports RECONNECT if revoked. */
  async #call<T>(run: (client: ConvexHttpClient) => Promise<T>): Promise<T> {
    try {
      return await run(await this.httpClient());
    } catch (error) {
      if (convexErrorData(error)?.code !== "UNAUTHENTICATED") throw error;
      await this.token({ force: true });
      return await run(await this.httpClient());
    }
  }
  query<Q extends FunctionReference<"query">>(ref: Q, ...args: OptionalRestArgs<Q>): Promise<FunctionReturnType<Q>> {
    return this.#call(c => c.query(ref, ...args));
  }
  mutation<M extends FunctionReference<"mutation">>(ref: M, ...args: OptionalRestArgs<M>): Promise<FunctionReturnType<M>> {
    return this.#call(c => c.mutation(ref, ...args));
  }
  action<A extends FunctionReference<"action">>(ref: A, ...args: OptionalRestArgs<A>): Promise<FunctionReturnType<A>> {
    return this.#call(c => c.action(ref, ...args));
  }

  /**
   * A subscribing ConvexClient (WebSocket) whose auth refreshes through this engine. `onAuthLost` runs when
   * the credential stops working (revoked or expired). Close it when done.
   */
  async realtimeClient(options: { onAuthLost?: (error: EngineError) => void } = {}): Promise<ConvexClient> {
    const { convexUrl } = await this.discover();
    await this.token(); // fail fast with RECONNECT before opening a socket
    const client = new ConvexClient(convexUrl, { unsavedChangesWarning: false });
    let lost: EngineError | undefined;
    client.setAuth(async ({ forceRefreshToken }) => {
      try { return (await this.token({ force: forceRefreshToken })).token; }
      catch (error) { lost = error instanceof EngineError ? error : new EngineError("UNREACHABLE", "Token refresh failed"); return null; }
    }, authenticated => { if (!authenticated) options.onAuthLost?.(lost ?? new EngineError("RECONNECT", RECONNECT_MESSAGE)); });
    return client;
  }

  /** `POST /api/device/revoke`: "revoked", or "already_invalid" when the engine no longer accepts it. */
  async revoke(): Promise<"revoked" | "already_invalid"> {
    const response = await request(this.#fetch, `${this.engineUrl}/api/device/revoke`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.#credential}` }, body: "{}",
    });
    this.#token = undefined; this.#httpToken = undefined;
    if (response.ok) return "revoked";
    if (response.status === 401) return "already_invalid";
    throw new EngineError("UNREACHABLE", `Revocation failed (HTTP ${response.status})`);
  }
}

/** An Engine from explicit options, the Replit Secrets or the local env file. */
export function createEngine(options: LoadConfigOptions & EngineOptions = {}): Engine {
  return new Engine(loadConfig(options), options);
}

// ---------------------------------------------------------------------------------------------
// Browser token endpoint (Connect / Node middleware)
// ---------------------------------------------------------------------------------------------

/** What `GET /__codegods/token` returns to the same-origin browser. */
export interface BrowserToken { token: string; expiresAt: number; convexUrl: string; roomId: string; permission: Permission }

export interface TokenHandlerOptions {
  /** The engine to use (or a factory). Default: createEngine() on first request, so the app starts without Secrets. */
  engine?: Engine | (() => Engine);
  /** If set, the request's Host (without port) must be one of these; a leading "." matches subdomains. Guards against DNS rebinding. */
  allowedHosts?: string[];
  /**
   * The secret of the launch link. Default: CODE_GODS_LAUNCH_KEY, else random per process. A dev URL is
   * public and same-origin headers are forgeable, so a token needs a session that only the launch link
   * (printed to the dev server's console, never served) can open.
   */
  launchKey?: string;
}

const cookie = (req: IncomingMessage, name: string) =>
  header(req, "cookie")?.split(";").map(part => part.trim().split("=")).find(([key]) => key === name)?.[1];
const sameSecret = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
/** The default launch key: random once per process, so Vite's in-process restarts keep open sessions. */
const processLaunchKey = () => (globalThis as { __cgLaunchKey?: string }).__cgLaunchKey ??= randomBytes(24).toString("base64url");

const header = (req: IncomingMessage, name: string) => { const v = req.headers[name]; return Array.isArray(v) ? v[0] : v; };

/**
 * True only for a same-origin browser request: `Sec-Fetch-Site: same-origin` and/or an `Origin` whose host
 * equals `Host`. At least one of the two must be present, and neither may say otherwise.
 */
export function isSameOriginRequest(req: IncomingMessage, allowedHosts?: string[]): boolean {
  const host = header(req, "host")?.toLowerCase();
  if (!host) return false;
  if (allowedHosts) {
    const name = host.replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
    if (!allowedHosts.some(h => h.startsWith(".") ? name === h.slice(1) || name.endsWith(h) : name === h.toLowerCase())) return false;
  }
  const site = header(req, "sec-fetch-site"), origin = header(req, "origin");
  if (!site && !origin) return false;
  if (site && site !== "same-origin") return false;
  if (origin) {
    try { if (new URL(origin).host.toLowerCase() !== host) return false; } catch { return false; }
  }
  return true;
}

/**
 * Connect/Node middleware for `GET /__codegods/token` → `{token, expiresAt, convexUrl, roomId, permission}`.
 * The player-web Vite dev server mounts it (`server.middlewares.use(tokenHandler())`), so the browser gets
 * only short JWTs and never the long-lived credential. Same-origin requests from a browser that opened the
 * private launch link (`LAUNCH_PATH`, see `launchUrl`) only; `Cache-Control: no-store`.
 * Other paths fall through to `next()` (or 404 when used as a plain Node handler).
 */
export function tokenHandler(options: TokenHandlerOptions = {}) {
  let engine: Engine | undefined = typeof options.engine === "object" ? options.engine : undefined;
  const getEngine = () => engine ??= typeof options.engine === "function" ? options.engine() : createEngine();
  const launchKey = options.launchKey || process.env.CODE_GODS_LAUNCH_KEY || processLaunchKey();
  // The session is derived from the key (stateless): it survives dev-server restarts and dies with the key.
  // The cookie name is too, so two player apps on one host (ports share cookies) keep separate sessions.
  const session = createHmac("sha256", launchKey).update("code-gods launch session").digest("base64url");
  const sessionCookie = `cg_launch_${createHmac("sha256", launchKey).update("code-gods launch cookie").digest("hex").slice(0, 12)}`;
  const handler = function codeGodsToken(req: IncomingMessage & { originalUrl?: string }, res: ServerResponse, next?: (error?: unknown) => void): void {
    const url = new URL(req.originalUrl ?? req.url ?? "/", "http://x");
    const pathname = url.pathname;
    if (pathname === LAUNCH_PATH) {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Referrer-Policy", "no-referrer");
      if (!sameSecret(url.searchParams.get("key") ?? "", launchKey)) { res.statusCode = 403; res.end("Wrong or old launch link: copy the current one from the dev server's console."); return; }
      // Over https (the Replit preview is an iframe) the cookie must be SameSite=None; Secure; Partitioned.
      const https = header(req, "x-forwarded-proto") === "https" || (req.socket as { encrypted?: boolean }).encrypted;
      res.setHeader("Set-Cookie", `${sessionCookie}=${session}; Path=/; HttpOnly; ${https ? "SameSite=None; Secure; Partitioned" : "SameSite=Lax"}`);
      res.statusCode = 302; res.setHeader("Location", "/"); res.end(); return;
    }
    if (pathname !== TOKEN_PATH) {
      if (next) return next();
      res.statusCode = 404; res.end(); return;
    }
    const send = (status: number, body: unknown) => {
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
      res.setHeader("Vary", "Origin, Sec-Fetch-Site");
      res.end(JSON.stringify(body));
    };
    if (req.method !== "GET") { res.setHeader("Allow", "GET"); return send(405, { error: "GET only" }); }
    if (!isSameOriginRequest(req, options.allowedHosts)) return send(403, { error: "Same-origin requests only" });
    if (!sameSecret(cookie(req, sessionCookie) ?? "", session)) return send(401, { error: "Open this app through its launch link (printed in the dev server's console)", code: "LAUNCH_REQUIRED" });
    void (async () => {
      try {
        const current = getEngine();
        const [{ convexUrl }, token] = await Promise.all([current.discover(), current.token()]);
        const body: BrowserToken = { token: token.token, expiresAt: token.expiresAt, convexUrl, roomId: token.roomId, permission: token.permission };
        send(200, body);
      } catch (error) {
        if (error instanceof EngineError) {
          const status = error.code === "RECONNECT" ? 401 : error.code === "UNREACHABLE" ? 502 : 503;
          return send(status, { error: redact(error.message), code: error.code });
        }
        send(500, { error: "Token exchange failed" });
      }
    })();
  };
  /** The launch link for a site origin, e.g. `https://my-repl.replit.dev` → `…/__codegods/launch?key=…`. */
  const launchUrl = (origin: string) => `${origin.replace(/\/$/, "")}${LAUNCH_PATH}?key=${encodeURIComponent(launchKey)}`;
  return Object.assign(handler, { launchUrl });
}
