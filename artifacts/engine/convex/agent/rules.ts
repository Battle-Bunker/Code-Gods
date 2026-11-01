/**
 * Pure rules of the MCP endpoint and the OAuth authorization server (no Convex imports; unit-tested in
 * test/unit/agent.test.ts): which redirect URIs a client may use, the CIMD URL guard, scopes, the Origin
 * check and how a request presents its credential.
 */
import type { Permission } from "../auth/access";

/** Claude's hosted MCP connector callbacks (claude.ai custom connectors). */
export const CLAUDE_CALLBACKS = ["https://claude.ai/api/mcp/auth_callback", "https://claude.com/api/mcp/auth_callback"] as const;
/** Browser origins allowed to call /mcp besides the site itself (claude.ai artifacts reach MCP through Claude). */
export const DEFAULT_MCP_ORIGINS = ["https://claude.ai", "https://claude.com"] as const;
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

function parse(uri: string): URL | null {
  try { return new URL(uri); } catch { return null; }
}
const isLoopbackHttp = (url: URL) => url.protocol === "http:" && LOOPBACK.has(url.hostname);

/**
 * May a client register (DCR) or declare (CIMD) this redirect URI? Claude's callbacks, loopback http on any port
 * (native apps, Claude Code, the CLI: RFC 8252), any https URI (player apps on any origin: a Replit dev URL, a
 * static host; docs/external-clients.md §2: the /connect page names the exact return origin, the code reaches only
 * the approving browser, and only with the PKCE verifier), or an exact URI the operator allowlisted
 * (OAUTH_REDIRECT_URIS, which may use another scheme). Never a fragment, credentials or plain http elsewhere.
 */
export function redirectAllowedForRegistration(uri: string, extra: readonly string[]): boolean {
  if (typeof uri !== "string" || uri.length > 512) return false;
  if (extra.includes(uri)) return true;
  const url = parse(uri);
  if (!url || url.hash || url.username || url.password || uri.includes("#")) return false;
  return url.protocol === "https:" || isLoopbackHttp(url);
}

/**
 * RFC 8707 `resource`: absent, a site URL of this deployment (Convex functions) or its MCP endpoint; one kind of
 * token serves both. `sites`: the public site (SITE_URL) and the deployment's own .convex.site URL, which a client
 * may use when a custom domain is set.
 */
export function resourceAllowed(resource: string | null | undefined, sites: string | readonly string[]): boolean {
  if (resource === undefined || resource === null) return true;
  return [sites].flat().filter(Boolean).some(site => {
    const base = site.replace(/\/+$/, "");
    return resource === base || resource === `${base}/` || resource === `${base}/mcp`;
  });
}

/** Where the engine serves its own player client (`/player/` today; `/client/` after the URL-scheme move). */
export const HOSTED_CLIENT_PATHS = ["/player/", "/client/"] as const;
/**
 * Is this redirect URI the engine's own hosted player client: the site's origin AND the client's path? Any other
 * page of the site is not, so a code can never be auto-approved to a page that might expose its query string.
 */
export function isFirstParty(redirectUri: string, siteOrigin: string): boolean {
  const url = parse(redirectUri);
  return !!url && url.origin === siteOrigin && HOSTED_CLIENT_PATHS.some(p => url.pathname.startsWith(p));
}

/**
 * The grant /connect may approve without a click, or null when the human decides (docs/external-clients.md
 * decision 5): only for a redirect to the site's own origin (the code can reach only the engine's own page), a
 * human already in the room, and at most `act`. A non-owner's `owner` request is lowered to `act`; an owner grant
 * always needs the owner's explicit consent.
 */
export function firstPartyGrant(input: { redirectUri: string; siteOrigin: string; member: boolean; isOwner: boolean; requested: Permission }): Permission | null {
  if (!isFirstParty(input.redirectUri, input.siteOrigin) || !input.member) return null;
  if (input.requested !== "owner") return input.requested;
  return input.isOwner ? null : "act";
}

/** Does an authorization request's redirect_uri match a registered one? Exact, except a loopback port may vary. */
export function redirectMatches(uri: string, registered: readonly string[]): boolean {
  if (registered.includes(uri)) return true;
  const url = parse(uri);
  if (!url || !isLoopbackHttp(url)) return false;
  return registered.some(r => {
    const other = parse(r);
    return !!other && isLoopbackHttp(other) && other.hostname === url.hostname && other.pathname === url.pathname && other.search === url.search;
  });
}

/** Private, loopback, link-local and metadata addresses: never fetched (SSRF). Hostnames resolve at fetch time; see oauth.ts. */
function privateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (host.includes(":")) return host === "::" || host === "::1" || /^f[cd]/.test(host) || /^fe[89ab]/.test(host) || host.startsWith("::ffff:");
  return !host.includes(".");
}

/** Why a CIMD client_id URL may not be fetched, or null (https, a path, a public host, no credentials or fragment). */
export function cimdUrlProblem(clientId: string): string | null {
  if (typeof clientId !== "string" || clientId.length > 512) return "client_id too long";
  const url = parse(clientId);
  if (!url) return "client_id is not a URL";
  if (url.protocol !== "https:") return "client_id metadata URLs must be https";
  if (url.username || url.password || url.hash || clientId.includes("#")) return "client_id must not carry credentials or a fragment";
  if (url.pathname === "/" || !url.pathname) return "client_id must have a path";
  if (url.port && url.port !== "443") return "client_id must use the default https port";
  if (privateHost(url.hostname)) return "client_id host is not public";
  return null;
}

const PERMISSIONS: readonly Permission[] = ["read", "act", "owner"];
/** The permission a scope string asks for: the strongest of read/act/owner named (default act); null for anything else. */
export function parseScope(scope: string | null | undefined): Permission | null {
  const parts = (scope ?? "").split(/\s+/).filter(Boolean);
  if (!parts.length) return "act";
  if (parts.some(p => !PERMISSIONS.includes(p as Permission))) return null;
  return PERMISSIONS.filter(p => parts.includes(p)).at(-1)!;
}

/** MCP's DNS-rebinding guard: an Origin, when present, must be the site's or an allowed one. */
export function isAllowedOrigin(origin: string | null, siteOrigin: string, extra: readonly string[]): boolean {
  if (origin === null) return true;
  return origin === siteOrigin || (DEFAULT_MCP_ORIGINS as readonly string[]).includes(origin) || extra.includes(origin);
}

export const CREDENTIAL_PATTERN = /^cgc_[A-Za-z0-9_-]{16,124}$/;
const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
/** How the request presents its credential: `Authorization: Bearer <JWT | cgc_…>` or `x-api-key: cgc_…`. */
export function bearerFrom(headers: Headers): { kind: "credential" | "jwt"; value: string } | null {
  const auth = headers.get("authorization");
  const bearer = auth && /^Bearer\s+/i.test(auth) ? auth.replace(/^Bearer\s+/i, "").trim() : null;
  const value = bearer ?? headers.get("x-api-key")?.trim() ?? null;
  if (!value || value.length > 4096) return null;
  if (CREDENTIAL_PATTERN.test(value)) return { kind: "credential", value };
  if (bearer && JWT_PATTERN.test(value)) return { kind: "jwt", value };
  return null;
}

/** Comma/space separated env list. */
export const envList = (value: string | undefined) => (value ?? "").split(/[,\s]+/).map(s => s.trim()).filter(Boolean);

/**
 * How long a summon/validate call waits before checking its receipt again: 250 ms, doubling to at most 2 s, so a
 * quick command answers fast and a slow one costs about one check (two function calls) per 2 s instead of four.
 */
export const pollDelay = (attempt: number): number => Math.min(2000, 250 * 2 ** Math.max(0, attempt));
