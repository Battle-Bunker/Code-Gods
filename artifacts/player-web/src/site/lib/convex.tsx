/**
 * The app's session (docs/unify-apps-plan.md §3): who the human is, however this app proves it (core/connection.ts).
 *
 * - "site": Google through Better Auth on this same origin (`/api/auth/*`): an HttpOnly session cookie, exchanged by
 *   the Convex client for 10-minute JWTs at `/api/auth/convex/token`.
 * - "token": a player JWT the app fetches itself (a dev server's room credential): the human in that one room.
 *
 * Either way the signed-in human is the `auth/user:me` query, and pages read it through useSession.
 * - Real user input (pointer/keyboard) calls `activity.touch` at most once a minute, which keeps the
 *   engine out of idle parking and resumes parked games. Nothing else pings: no polling, no heartbeats.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { ConvexProviderWithAuth, ConvexReactClient, useConvexAuth, useMutation, useQueries } from "convex/react";
import { getFunctionName, type FunctionArgs, type FunctionReference, type FunctionReturnType } from "convex/server";
import { convexToJson, type Value } from "convex/values";
import { ConvexBetterAuthProvider, type AuthClient } from "@convex-dev/better-auth/react";
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { api } from "@/site/lib/convex-api";
import { toast } from "@/hooks/use-toast";

export { api };

export interface AuthUser { id: string; name: string; isAdmin: boolean }

/** How the app signs in: the site's Google session, or a token it fetches (a dev server's room credential). */
export type EngineAuth = { kind: "site" } | { kind: "token"; fetchAccessToken: () => Promise<string | null> };

type Session = {
  /** "site": the human everywhere; "token": the human in one room (credential `roomId`). */
  kind: EngineAuth["kind"];
  roomId?: string;
  /** "token": the credential's permission in its room. */
  permission?: "read" | "act" | "owner";
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

/** The signed-in human: Convex auth (Better Auth's session, or the app's token) plus `auth/user:me`. */
function useEngineSession(kind: EngineAuth["kind"]): Session {
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const me = useLive(api.auth.user.me, isAuthenticated ? {} : "skip");
  const login = useCallback(() => {
    // A token app signs in where its credential comes from (`pnpm player connect`), not here.
    if (kind === "token") { toast({ title: "This player app signs in with its credential", description: "Run `pnpm player status`." }); return; }
    const returnTo = window.location.pathname + window.location.search || "/";
    // Better Auth resolves with {error} rather than throwing; without a redirect the button would look dead.
    void authClient.signIn.social({ provider: "google", callbackURL: returnTo }).then(
      r => { if (r.error) toast({ title: "Sign-in failed", description: r.error.message ?? `HTTP ${r.error.status}`, variant: "destructive" }); },
      (e: unknown) => toast({ title: "Sign-in failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" }));
  }, [kind]);
  const logout = useCallback(() => {
    void authClient.signOut().finally(() => { window.location.href = base || "/"; });
  }, []);
  const data = me.data;
  const user = useMemo(() => (data ? { id: data.subject, name: data.name, isAdmin: data.isAdmin } : null), [data]);
  // Convex still holds a JWT but the engine knows no such human (the session just ended, or no users row):
  // say so instead of offering a "Sign in" that would come back to the same state.
  const missing = isAuthenticated && data === null ? new Error("Your session ended or the engine has no profile for you. Reload to sign in again; if it persists, ask the operator.") : null;
  const roomId = data && "roomId" in data ? data.roomId : undefined;
  const permission = data && "permission" in data ? data.permission : undefined;
  return { kind, roomId, permission, user, isLoading: authLoading || me.isLoading, error: me.error ?? missing, refetch: () => window.location.reload(), login, logout };
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession outside SessionProvider");
  return session;
}

function SessionProvider({ kind, children }: { kind: EngineAuth["kind"]; children: ReactNode }) {
  return <SessionContext.Provider value={useEngineSession(kind)}>{children}</SessionContext.Provider>;
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

export function EngineProvider({ client, auth, children }: { client: ConvexReactClient; auth: EngineAuth; children: ReactNode }) {
  const inner = <SessionProvider kind={auth.kind}><ActivityPing />{children}</SessionProvider>;
  if (auth.kind === "token") return <ConvexProviderWithAuth client={client} useAuth={useTokenAuth(auth.fetchAccessToken)}>{inner}</ConvexProviderWithAuth>;
  return (
    // The cast bridges a type-level quirk of @convex-dev/better-auth 0.12 (its AuthClient union infers `never` for
    // useSession().data under this repo's compiler settings); the runtime object is exactly what it expects.
    <ConvexBetterAuthProvider client={client} authClient={authClient as unknown as AuthClient}>{inner}</ConvexBetterAuthProvider>
  );
}

/** A stable useAuth hook for ConvexProviderWithAuth over a token fetcher (always "signed in": the fetcher may refuse). */
function useTokenAuth(fetchAccessToken: () => Promise<string | null>) {
  return useMemo(() => {
    const value = { isLoading: false, isAuthenticated: true, fetchAccessToken };
    return () => value;
  }, [fetchAccessToken]);
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
