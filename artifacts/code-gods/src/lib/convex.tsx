/**
 * Convex client and browser session (docs/engine-api.md, "React, same origin as the site").
 *
 * - The Convex client URL is VITE_CONVEX_URL when the build set it (static deploys), else `GET /api/config`.
 * - The signed-in human comes from `GET /api/auth/user` (cookie `cg_session`); Convex calls carry a
 *   10-minute browser JWT from `POST /api/auth/token`, refreshed by the Convex client.
 * - Real user input (pointer/keyboard) calls `activity.touch` at most once a minute, which keeps the
 *   engine out of idle parking and resumes parked games. Nothing else pings: no polling, no heartbeats.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ConvexProviderWithAuth, ConvexReactClient, useConvexAuth, useMutation, useQueries } from "convex/react";
import { getFunctionName, type FunctionArgs, type FunctionReference, type FunctionReturnType } from "convex/server";
import { convexToJson, type Value } from "convex/values";
import { api } from "@/lib/convex-api";

export { api };

export interface AuthUser { id: string; name: string; isAdmin: boolean }

type Session = {
  user: AuthUser | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  login: () => void;
  logout: () => void;
};

const SessionContext = createContext<Session | null>(null);
const base = import.meta.env.BASE_URL.replace(/\/$/, "");

/** The Convex client URL: build-time VITE_CONVEX_URL, else the site's /api/config. */
export async function loadConvexUrl(): Promise<string> {
  const fromBuild = import.meta.env.VITE_CONVEX_URL as string | undefined;
  if (fromBuild) return fromBuild;
  const response = await fetch("/api/config", { cache: "no-store" });
  if (!response.ok) throw new Error(`Engine configuration unavailable (${response.status})`);
  const body = (await response.json()) as { convexUrl?: string };
  if (!body.convexUrl) throw new Error("Engine configuration has no Convex URL");
  return body.convexUrl;
}

function useBrowserSession(): Session {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    fetch("/api/auth/user", { credentials: "same-origin", cache: "no-store" })
      .then(async r => {
        if (!r.ok) throw new Error(`Sign-in check failed (${r.status})`);
        return ((await r.json()) as { user: AuthUser | null }).user ?? null;
      })
      .then(u => { if (live) { setUser(u); setError(null); } })
      .catch(e => { if (live) setError(e instanceof Error ? e : new Error(String(e))); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [nonce]);
  const login = useCallback(() => {
    const returnTo = window.location.pathname + window.location.search || "/";
    window.location.href = `/api/login?returnTo=${encodeURIComponent(returnTo)}`;
  }, []);
  const logout = useCallback(() => {
    void fetch("/api/logout", { method: "POST", credentials: "same-origin" })
      .finally(() => { window.location.href = base || "/"; });
  }, []);
  return { user, isLoading, error, refetch: () => setNonce(n => n + 1), login, logout };
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession outside SessionProvider");
  return session;
}

/** The Convex `useAuth` adapter: the browser session plus a cached JWT from /api/auth/token. */
function useConvexAuthAdapter() {
  const { user, isLoading } = useSession();
  const cached = useRef<{ token: string; expiresAt: number } | null>(null);
  const fetchAccessToken = useCallback(async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
    const c = cached.current;
    if (!forceRefreshToken && c && c.expiresAt - Date.now() > 60_000) return c.token;
    const r = await fetch("/api/auth/token", { method: "POST", credentials: "same-origin", cache: "no-store" });
    if (!r.ok) { cached.current = null; return null; }
    const body = (await r.json()) as { token: string | null; expiresAt?: number };
    cached.current = body.token ? { token: body.token, expiresAt: body.expiresAt ?? Date.now() + 5 * 60_000 } : null;
    return body.token ?? null;
  }, []);
  return useMemo(() => ({ isLoading, isAuthenticated: !!user, fetchAccessToken }), [isLoading, user, fetchAccessToken]);
}

/** Touch `activity` on trusted pointer/keyboard input, at most once a minute. */
function ActivityPing() {
  const { isAuthenticated } = useConvexAuth();
  const touch = useMutation(api.activity.touch);
  const last = useRef(0);
  useEffect(() => {
    if (!isAuthenticated) return;
    const onInput = (event: Event) => {
      if (!event.isTrusted || Date.now() - last.current < 60_000) return;
      last.current = Date.now();
      touch({}).catch(() => { last.current = 0; });
    };
    window.addEventListener("pointerdown", onInput);
    window.addEventListener("keydown", onInput);
    return () => { window.removeEventListener("pointerdown", onInput); window.removeEventListener("keydown", onInput); };
  }, [isAuthenticated, touch]);
  return null;
}

export function EngineProvider({ client, children }: { client: ConvexReactClient; children: ReactNode }) {
  const session = useBrowserSession();
  return (
    <SessionContext.Provider value={session}>
      <ConvexProviderWithAuth client={client} useAuth={useConvexAuthAdapter}>
        <ActivityPing />
        {children}
      </ConvexProviderWithAuth>
    </SessionContext.Provider>
  );
}

export type Result<T> = { data: T | undefined; error: Error | null; isLoading: boolean };

/**
 * A reactive query that reports errors instead of throwing them into render. It waits for the Convex
 * client to hold a browser JWT (every engine query needs a signed-in caller). "skip" disables it.
 */
export function useLive<Q extends FunctionReference<"query">>(query: Q, args: FunctionArgs<Q> | "skip"): Result<FunctionReturnType<Q>> {
  const { isAuthenticated } = useConvexAuth();
  const skip = args === "skip" || !isAuthenticated;
  // useQueries needs a stable request object; key it like convex's own useQuery does.
  const key = skip ? "" : `${getFunctionName(query)}:${JSON.stringify(convexToJson(args as Value))}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const request = useMemo((): Parameters<typeof useQueries>[0] => (skip ? {} : { q: { query, args: args as FunctionArgs<Q> } }), [key]);
  const r = useQueries(request).q as FunctionReturnType<Q> | Error | undefined;
  if (r instanceof Error) return { data: undefined, error: r, isLoading: false };
  return { data: r, error: null, isLoading: args !== "skip" && r === undefined };
}
