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
 * May a client register (DCR) or declare (CIMD) this redirect URI? Claude's callbacks, loopback http on any
 * port (native apps, Claude Code, the CLI: RFC 8252), or an exact URI the operator allowlisted
 * (CODE_GODS_OAUTH_REDIRECT_URIS). Never a fragment, credentials or another scheme.
 */
export function redirectAllowedForRegistration(uri: string, extra: readonly string[]): boolean {
  if (typeof uri !== "string" || uri.length > 512) return false;
  const url = parse(uri);
  if (!url || url.hash || url.username || url.password || uri.includes("#")) return false;
  if ((CLAUDE_CALLBACKS as readonly string[]).includes(uri) || extra.includes(uri)) return true;
  return isLoopbackHttp(url);
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
