/**
 * Sign-in for a player client running in a browser, on ANY origin (docs/external-clients.md): the hosted client at
 * the engine's own site, a Replit dev URL, localhost, a static host. Browser-safe: only `fetch`, Web Storage and (when present)
 * the Web Locks API. No Node, no cookies.
 *
 *   const auth = createPlayerAuth({ engineUrl, clientName: "My client" });
 *   const done = await auth.completeSignIn();                 // back from the engine's /connect page?
 *   const session = done?.session ?? auth.session(room);      // or one stored earlier for this room
 *   if (!session) await auth.signInWithRedirect({ room });    // leaves the page
 *   convex.setAuth(auth.fetchToken(session), ok => …);        // ConvexClient / ConvexReactClient
 *
 * Two ways in, both ending in a room-scoped player JWT that the Convex client sends as a bearer token:
 *   - OAuth 2.1 authorization code + PKCE S256 (signInWithRedirect / completeSignIn): the client registers itself
 *     (DCR; the engine answers the same metadata with the same client), the human approves on the engine's /connect page, the code comes back to
 *     `redirectUri` and becomes a 60-minute access token plus a rotating refresh token. Refreshes are serialized
 *     across tabs (Web Locks, re-reading storage inside the lock): the engine revokes a connection whose refresh
 *     token is used twice.
 *   - The device flow (signInWithDevice): for pages inside an iframe (Replit's webview: Google sign-in refuses to
 *     be framed) or with no stable redirect target. The human opens the verification URL anywhere; the app gets a
 *     `cgc_` credential (7 days) and exchanges it for 10-minute JWTs.
 *
 * Or, OAuth only, an account grant (`signInWithRedirect({ permission: "account" })`): the app acts as its human in
 * every room, as the engine's own site does, except approving connections and devices, managing credentials and
 * admin (docs/external-clients.md). The human approves it explicitly on /connect; it lasts 7 days without use.
 *
 * Sessions are stored per engine: one per room, and at most one account session. What this stores is a bearer
 * secret (for one room, or for the human's account): anything that runs script on the app's origin can read it.
 * Revoke it from the engine UI ("Your player apps") or signOut().
 */
export type Permission = "read" | "act" | "owner";
/** What a sign-in asks for: one room with a Permission, or the human's whole account. */
export type Grant = Permission | "account";

type SessionCommon = {
  kind: "oauth" | "device";
  engineUrl: string;
  convexUrl: string;
  credentialId: string;
  /** The current player JWT and when it expires (ms since epoch). */
  accessToken: string;
  expiresAt: number;
  /** OAuth: the rotating refresh token and the registered client. */
  refreshToken?: string;
  clientId?: string;
  /** Device flow: the room credential (`cgc_…`). */
  credential?: string;
};
/** A connection to one room. */
export type PlayerSession = SessionCommon & { roomId: string; roomCode: string; permission: Permission };
/** An account grant (OAuth only): the human in every room. */
export type AccountSession = SessionCommon & { kind: "oauth"; permission: "account" };
export type AnySession = PlayerSession | AccountSession;
export const isAccountSession = (s: AnySession): s is AccountSession => s.permission === "account";
/** The storage and lock key of an account session (room sessions use their room code). */
const ACCOUNT_KEY = "*";
const keyOf = (s: AnySession) => (isAccountSession(s) ? ACCOUNT_KEY : s.roomCode);

export type PlayerAuthErrorCode =
  | "BAD_ENGINE_URL" | "UNREACHABLE" | "REGISTRATION_FAILED" | "STATE_MISMATCH" | "DENIED" | "EXPIRED" | "EXCHANGE_FAILED" | "RECONNECT";
export class PlayerAuthError extends Error {
  readonly code: PlayerAuthErrorCode;
  constructor(code: PlayerAuthErrorCode, message: string) { super(message); this.name = "PlayerAuthError"; this.code = code; }
}

export type PlayerAuthOptions = {
  /** The engine's site URL (`https://<dep>.convex.site`; a `.convex.cloud` URL is mapped to it). https, or http on loopback. */
  engineUrl: string;
  /** Shown to the human on /connect, self-reported. */
  clientName: string;
  /** Where /connect sends the browser back (registered exactly). Default: this page's origin + "/". */
  redirectUri?: string;
  /** Default: localStorage (null: memory only). */
  storage?: Storage | null;
  fetch?: typeof fetch;
  /** Default: location.assign. */
  navigate?: (url: string) => void;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

type Pending = { verifier: string; redirectUri: string; clientId: string; returnTo: string; createdAt: number };
type Stored = {
  convexUrl?: string;
  /** The engine's public site URL from /api/config: the OAuth issuer and resource (a custom domain may differ from engineUrl). */
  siteUrl?: string;
  sessions: Record<string, PlayerSession>;
  account?: AccountSession;
  pending: Record<string, Pending>;
};

const REFRESH_MARGIN_MS = 60_000;
const PENDING_TTL_MS = 15 * 60_000;
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** https://<dep>.convex.cloud → https://<dep>.convex.site; https, or http only on loopback; no path. */
export function normalizeEngineUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new PlayerAuthError("BAD_ENGINE_URL", `Not a URL: ${value}`); }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOOPBACK.has(url.hostname))) {
    throw new PlayerAuthError("BAD_ENGINE_URL", "The engine URL must be https (http only on 127.0.0.1 or localhost)");
  }
  const host = url.hostname.endsWith(".convex.cloud") ? url.host.replace(/\.convex\.cloud$/, ".convex.site") : url.host;
  return `${url.protocol}//${host}`;
}

/** A room reference as the engine accepts it, for matching: upper case, no dashes or spaces. */
const roomKey = (ref: string) => ref.trim().toUpperCase().replace(/[-\s]/g, "");

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const randomString = (bytes = 32) => base64url(crypto.getRandomValues(new Uint8Array(bytes)));
async function pkce() {
  const verifier = randomString(32);
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  return { verifier, challenge };
}

/** In-process mutex per key, for when the Web Locks API is missing (one tab, or Node). */
const localLocks = new Map<string, Promise<unknown>>();
function withLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const locks = (globalThis.navigator as Navigator | undefined)?.locks;
  if (locks?.request) return locks.request(name, fn) as Promise<T>;
  const previous = localLocks.get(name) ?? Promise.resolve();
  const next = previous.then(fn, fn);
  localLocks.set(name, next.catch(() => undefined));
  return next;
}

export function createPlayerAuth(options: PlayerAuthOptions) {
  const engineUrl = normalizeEngineUrl(options.engineUrl);
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
  const storage = options.storage === undefined ? (() => { try { return globalThis.localStorage ?? null; } catch { return null; } })() : options.storage;
  const redirectUri = options.redirectUri ?? `${globalThis.location?.origin ?? ""}/`;
  const navigate = options.navigate ?? ((url: string) => globalThis.location.assign(url));
  const key = `codegods.player:${engineUrl}`;
  let memory: Stored = { sessions: {}, pending: {} };
  const listeners = new Set<(roomCode: string) => void>();

  const read = (): Stored => {
    if (!storage) return memory;
    try { return { sessions: {}, pending: {}, ...JSON.parse(storage.getItem(key) ?? "{}") }; } catch { return { sessions: {}, pending: {} }; }
  };
  const write = (update: (s: Stored) => void) => {
    const s = read();
    update(s);
    if (storage) storage.setItem(key, JSON.stringify(s)); else memory = s;
  };
  const emit = (roomCode: string) => { for (const l of listeners) l(roomCode); };

  async function call(path: string, init: { body?: Record<string, string>; json?: unknown; bearer?: string; method?: string } = {}) {
    const headers: Record<string, string> = {};
    let body: string | undefined;
    if (init.json !== undefined) { headers["content-type"] = "application/json"; body = JSON.stringify(init.json); }
    if (init.body) { headers["content-type"] = "application/x-www-form-urlencoded"; body = new URLSearchParams(init.body).toString(); }
    if (init.bearer) headers.authorization = `Bearer ${init.bearer}`;
    let response: Response;
    try {
      // No cookies: every engine endpoint the SDK calls is authorized by what the request carries.
      response = await fetcher(`${engineUrl}${path}`, { method: init.method ?? (body || init.bearer ? "POST" : "GET"), headers, body, credentials: "omit", redirect: "error" });
    } catch {
      throw new PlayerAuthError("UNREACHABLE", `The engine at ${engineUrl} could not be reached`);
    }
    const data = await response.json().catch(() => ({})) as Record<string, any>;
    return { status: response.status, data };
  }

  async function config(): Promise<{ convexUrl: string; siteUrl: string }> {
    const cached = read();
    if (cached.convexUrl && cached.siteUrl) return { convexUrl: cached.convexUrl, siteUrl: cached.siteUrl };
    const { status, data } = await call("/api/config");
    if (status !== 200 || typeof data.convexUrl !== "string") throw new PlayerAuthError("UNREACHABLE", "The engine's /api/config did not answer");
    const siteUrl = typeof data.siteUrl === "string" ? normalizeEngineUrl(data.siteUrl) : engineUrl;
    write(s => { s.convexUrl = data.convexUrl; s.siteUrl = siteUrl; });
    return { convexUrl: data.convexUrl, siteUrl };
  }
  const convexUrl = async () => (await config()).convexUrl;

  /**
   * The OAuth client for this redirect URI and name. Registered on every sign-in: the engine answers the same
   * metadata with the same client_id (outside its registration limit), so a client the engine swept or forgot (a
   * reset local engine) is simply registered again.
   */
  async function client(): Promise<string> {
    const { status, data } = await call("/api/oauth/register", { json: { client_name: options.clientName, redirect_uris: [redirectUri],
      token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] } });
    if (status !== 201 || typeof data.client_id !== "string") {
      throw new PlayerAuthError("REGISTRATION_FAILED", data.error_description ?? `The engine refused to register this client (${status})`);
    }
    return data.client_id;
  }

  function save<S extends AnySession>(session: S): S {
    write(s => { if (isAccountSession(session)) s.account = session; else s.sessions[roomKey(session.roomCode)] = session; });
    emit(keyOf(session));
    return session;
  }
  /** Forget the session stored under `key`: a room code, or ACCOUNT_KEY for the account session. */
  function forget(key: string) {
    write(s => { if (key === ACCOUNT_KEY) delete s.account; else delete s.sessions[roomKey(key)]; });
    emit(key);
  }
  const stored = (key: string): AnySession | null => (key === ACCOUNT_KEY ? read().account ?? null : session(key));
  /** The stored session for a room (short code in any form, or the room id), or the most recent one. */
  function session(room?: string): PlayerSession | null {
    const all = Object.values(read().sessions);
    if (room === undefined) return all.sort((a, b) => b.expiresAt - a.expiresAt)[0] ?? null;
    return all.find(s => roomKey(s.roomCode) === roomKey(room) || s.roomId === room) ?? null;
  }

  const fromTokens = async (data: Record<string, any>, clientId: string): Promise<AnySession> => {
    const common = { kind: "oauth" as const, engineUrl, convexUrl: await convexUrl(), clientId, credentialId: data.credential_id, accessToken: data.access_token,
      refreshToken: data.refresh_token, expiresAt: now() + Number(data.expires_in) * 1000 };
    return data.scope === "account" ? { ...common, permission: "account" } : { ...common, roomId: data.room_id, roomCode: data.room_code, permission: data.scope };
  };

  async function revokeOnEngine(s: AnySession) {
    if (s.kind === "oauth") await call("/api/oauth/revoke", { body: { token: s.refreshToken!, client_id: s.clientId! } });
    else await call("/api/device/revoke", { bearer: s.credential! });
  }

  /** A fresh token for the session stored under `key` (a room code or ACCOUNT_KEY), or null when the connection is gone (it is then forgotten). */
  async function refresh(key: string): Promise<AnySession | null> {
    const current = stored(key);
    if (!current) return null;
    if (current.kind === "oauth") {
      const { status, data } = await call("/api/oauth/token", { body: { grant_type: "refresh_token", refresh_token: current.refreshToken!, client_id: current.clientId! } });
      if (status === 200 && typeof data.access_token === "string") return save({ ...(await fromTokens(data, current.clientId!)), convexUrl: current.convexUrl });
      if (status >= 500) throw new PlayerAuthError("UNREACHABLE", "The engine could not refresh the token; try again");
    } else if (!isAccountSession(current)) {
      const { status, data } = await call("/api/device/token", { bearer: current.credential! });
      if (status === 200 && typeof data.token === "string") return save({ ...current, accessToken: data.token, expiresAt: data.expiresAt });
      if (status >= 500) throw new PlayerAuthError("UNREACHABLE", "The engine could not exchange the credential; try again");
    }
    forget(key);
    return null;
  }

  return {
    engineUrl,
    session,
    /** Every stored room session of this engine. */
    sessions: () => Object.values(read().sessions),
    /** The stored account session (the human in every room), or null. */
    account: (): AccountSession | null => read().account ?? null,
    /** Called with a room code ("*" for the account session) whenever its session is saved, refreshed or forgotten. Returns an unsubscribe. */
    onChange(listener: (roomCode: string) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    convexUrl,

    /** The /oauth/authorize URL for a new connection (registers the client if needed and remembers the PKCE verifier). */
    async authorizeUrl(request: { room?: string; permission?: Grant; returnTo?: string } = {}): Promise<string> {
      const [clientId, { siteUrl }] = await Promise.all([client(), config()]);
      const { verifier, challenge } = await pkce();
      const state = randomString(24);
      const t = now();
      write(s => {
        for (const [k, p] of Object.entries(s.pending)) if (t - p.createdAt > PENDING_TTL_MS) delete s.pending[k];
        s.pending[state] = { verifier, redirectUri, clientId, returnTo: request.returnTo ?? "", createdAt: t };
      });
      const url = new URL(`${engineUrl}/oauth/authorize`);
      const params: Record<string, string> = { response_type: "code", client_id: clientId, redirect_uri: redirectUri, code_challenge: challenge,
        code_challenge_method: "S256", state, scope: request.permission ?? "act", resource: siteUrl };
      if (request.room && request.permission !== "account") params.room = request.room;
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
      return url.toString();
    },
    /** Send the browser to the engine to approve a connection for `room` (or, with permission "account", for every room). */
    async signInWithRedirect(request: { room?: string; permission?: Grant; returnTo?: string } = {}): Promise<void> {
      navigate(await this.authorizeUrl(request));
    },
    /**
     * On the redirect URI: redeem `?code&state` (default: this page's URL, which is then cleaned with
     * history.replaceState). Null when the URL carries no answer; throws on a forged state or a refusal.
     */
    async completeSignIn(href?: string): Promise<{ session: AnySession; returnTo: string } | null> {
      const url = new URL(href ?? globalThis.location.href);
      const state = url.searchParams.get("state");
      const code = url.searchParams.get("code"), error = url.searchParams.get("error");
      if (!state || (!code && !error)) return null;
      if (href === undefined) globalThis.history?.replaceState(globalThis.history.state, "", this.cleanUrl(url.toString()));
      const pending = read().pending[state];
      if (!pending) {
        if (Object.keys(read().pending).length === 0 && !error) return null; // already redeemed (a reload of the page)
        throw new PlayerAuthError("STATE_MISMATCH", "This sign-in answer does not belong to a request from this browser; sign in again");
      }
      const iss = url.searchParams.get("iss");
      const issuers = [engineUrl, (await config()).siteUrl];
      if (iss !== null && !issuers.includes((() => { try { return normalizeEngineUrl(iss); } catch { return ""; } })())) {
        throw new PlayerAuthError("STATE_MISMATCH", "The answer came from another engine");
      }
      write(s => { delete s.pending[state]; });
      if (error) {
        throw new PlayerAuthError(error === "access_denied" ? "DENIED" : "EXCHANGE_FAILED", url.searchParams.get("error_description") ?? error);
      }
      const { status, data } = await call("/api/oauth/token", { body: { grant_type: "authorization_code", code: code!, code_verifier: pending.verifier,
        client_id: pending.clientId, redirect_uri: pending.redirectUri, resource: (await config()).siteUrl } });
      if (status !== 200 || typeof data.access_token !== "string") {
        throw new PlayerAuthError("EXCHANGE_FAILED", data.error_description ?? `The engine refused the sign-in (${status}); sign in again`);
      }
      const fresh = await fromTokens(data, pending.clientId);
      const replaced = stored(keyOf(fresh));
      save(fresh);
      // A new connection for a room (e.g. an owner upgrade) replaces the stored one: revoke that, so none is orphaned.
      if (replaced && replaced.credentialId !== fresh.credentialId) void revokeOnEngine(replaced).catch(() => undefined);
      return { session: fresh, returnTo: pending.returnTo };
    },
    /** `?code`, `state` and `iss` removed from a URL (other parameters kept). */
    cleanUrl(href: string): string {
      const url = new URL(href);
      for (const k of ["code", "state", "iss", "error", "error_description"]) url.searchParams.delete(k);
      return url.toString();
    },

    /**
     * The device flow: show `userCode` and `verificationUrl` to the human (any browser where they are signed in
     * to the engine); `session` resolves once approved (rejects on denial or expiry; `cancel()` stops polling).
     */
    async signInWithDevice(request: { room: string; permission?: Permission; label?: string }) {
      const { verifier, challenge } = await pkce();
      const { status, data } = await call("/api/device/request", { json: { room: request.room, permission: request.permission ?? "act",
        label: request.label ?? options.clientName, challenge } });
      if (status !== 200) throw new PlayerAuthError(status === 404 ? "DENIED" : "EXCHANGE_FAILED", data.error ?? `The engine refused the request (${status})`);
      let cancelled = false;
      const deadline = now() + data.expiresIn * 1000;
      const sessionPromise = (async (): Promise<PlayerSession> => {
        for (;;) {
          await sleep(data.interval * 1000);
          if (cancelled) throw new PlayerAuthError("EXPIRED", "Cancelled");
          const poll = await call("/api/device/poll", { json: { deviceId: data.deviceId, deviceSecret: data.deviceSecret, verifier } });
          if (poll.status === 200) {
            const replaced = session(data.roomCode);
            const exchange = await call("/api/device/token", { bearer: poll.data.credential });
            if (exchange.status !== 200) throw new PlayerAuthError("EXCHANGE_FAILED", "The new credential could not be exchanged");
            const fresh = save({ kind: "device", engineUrl, convexUrl: await convexUrl(), roomId: poll.data.roomId, roomCode: data.roomCode, permission: poll.data.permission,
              credentialId: poll.data.credentialId, credential: poll.data.credential, accessToken: exchange.data.token, expiresAt: exchange.data.expiresAt });
            if (replaced && replaced.credentialId !== fresh.credentialId) void revokeOnEngine(replaced).catch(() => undefined);
            return fresh;
          }
          if (poll.status === 403) throw new PlayerAuthError("DENIED", "The request was denied");
          if (poll.status === 410 || now() > deadline) throw new PlayerAuthError("EXPIRED", "The request expired; start again");
          if (poll.status === 400) throw new PlayerAuthError("EXCHANGE_FAILED", "The engine refused the poll");
        }
      })();
      sessionPromise.catch(() => undefined);
      return { userCode: data.userCode as string, verificationUrl: data.verificationUrl as string, roomCode: data.roomCode as string, expiresIn: data.expiresIn as number,
        session: sessionPromise, cancel: () => { cancelled = true; } };
    },

    /**
     * A token fetcher for `ConvexClient#setAuth` / `ConvexProviderWithAuth`: the stored token while it has more
     * than a minute left, else a refresh (one at a time across tabs); `forceRefreshToken` (the server refused the
     * token) refreshes unless another tab already did. Null once the connection is revoked or expired: the
     * session is forgotten and onChange fires, so the app can offer to sign in again.
     */
    fetchToken(of: AnySession) {
      const sessionKey = keyOf(of);
      let last: string | undefined;
      return async ({ forceRefreshToken }: { forceRefreshToken: boolean } = { forceRefreshToken: false }): Promise<string | null> => {
        const token = await withLock(`${key}:${roomKey(sessionKey)}`, async () => {
          const current = stored(sessionKey);
          if (!current) return null;
          const fresh = current.expiresAt - now() > REFRESH_MARGIN_MS;
          if (fresh && (!forceRefreshToken || (last !== undefined && current.accessToken !== last))) return current.accessToken;
          return (await refresh(sessionKey))?.accessToken ?? null;
        });
        last = token ?? undefined;
        return token;
      };
    },

    /** Revoke the connection on the engine and forget it here. */
    async signOut(of: AnySession): Promise<void> {
      const current = stored(keyOf(of)) ?? of;
      try {
        await revokeOnEngine(current);
      } finally {
        forget(keyOf(current));
      }
    },
  };
}

export type PlayerAuth = ReturnType<typeof createPlayerAuth>;
