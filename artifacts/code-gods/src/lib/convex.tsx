/**
 * Convex client and browser session (docs/engine-api.md, "React, same origin as the site").
 *
 * - The Convex client URL is VITE_CONVEX_URL when the build set it (static deploys), else `GET /api/config`.
 * - Sign-in is Google through Better Auth on this same origin (`/api/auth/*`): an HttpOnly session cookie,
 *   exchanged by the Convex client for 10-minute JWTs at `/api/auth/convex/token`. The signed-in human
 *   is the `auth/user:me` query.
 * - Real user input (pointer/keyboard) calls `activity.touch` at most once a minute, which keeps the
 *   engine out of idle parking and resumes parked games. Nothing else pings: no polling, no heartbeats.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { ConvexReactClient, useConvexAuth, useMutation, useQueries } from "convex/react";
import { getFunctionName, type FunctionArgs, type FunctionReference, type FunctionReturnType } from "convex/server";
import { convexToJson, type Value } from "convex/values";
import { ConvexBetterAuthProvider, type AuthClient } from "@convex-dev/better-auth/react";
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
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

/** Better Auth on this origin (the engine site, or the dev server's /api proxy to it). */
export const authClient = createAuthClient({ baseURL: window.location.origin, plugins: [convexClient()] });

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

/** The signed-in human: Better Auth's session (via Convex auth) plus `auth/user:me`. */
function useBrowserSession(): Session {
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const me = useLive(api.auth.user.me, isAuthenticated ? {} : "skip");
  const login = useCallback(() => {
    const returnTo = window.location.pathname + window.location.search || "/";
    void authClient.signIn.social({ provider: "google", callbackURL: returnTo });
  }, []);
  const logout = useCallback(() => {
    void authClient.signOut().finally(() => { window.location.href = base || "/"; });
  }, []);
  const data = me.data;
  const user = useMemo(() => (data && data.scope === "browser" ? { id: data.subject, name: data.name, isAdmin: data.isAdmin } : null), [data]);
  return { user, isLoading: authLoading || me.isLoading, error: me.error, refetch: () => window.location.reload(), login, logout };
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession outside SessionProvider");
  return session;
}

function SessionProvider({ children }: { children: ReactNode }) {
  return <SessionContext.Provider value={useBrowserSession()}>{children}</SessionContext.Provider>;
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
  return (
    // The cast bridges a type-level quirk of @convex-dev/better-auth 0.12 (its AuthClient union infers `never` for
    // useSession().data under this repo's compiler settings); the runtime object is exactly what it expects.
    <ConvexBetterAuthProvider client={client} authClient={authClient as unknown as AuthClient}>
      <SessionProvider>
        <ActivityPing />
        {children}
      </SessionProvider>
    </ConvexBetterAuthProvider>
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
