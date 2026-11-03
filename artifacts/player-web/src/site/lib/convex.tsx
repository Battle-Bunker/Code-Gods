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
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ConvexProviderWithAuth, ConvexReactClient, useConvexAuth, useMutation, usePaginatedQuery, useQueries, type PaginatedQueryArgs, type PaginatedQueryReference } from "convex/react";
import { getFunctionName, type FunctionArgs, type FunctionReference, type FunctionReturnType } from "convex/server";
import { convexToJson, type Value } from "convex/values";
import { ConvexBetterAuthProvider, type AuthClient } from "@convex-dev/better-auth/react";
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { AccountSession, PlayerAuth } from "@workspace/player-client/browser";
import { api } from "@/site/lib/convex-api";
import { toast } from "@/hooks/use-toast";
import { MAX_RETRIES, liveResult, retryDelay, transientQueryError, type Retry } from "@/lib/live-retry";
import { setAppAccessToken } from "@/core/connection";

export { api };

export interface AuthUser { id: string; name: string; isAdmin: boolean }

/**
 * How the app signs in (core/connection.ts): the site's Google session; an account grant from the engine's /connect
 * page (the human everywhere, from any origin); or a token it fetches (a dev server's room credential).
 */
export type EngineAuth =
  | { kind: "site" }
  | { kind: "account"; auth: PlayerAuth; session: AccountSession }
  | { kind: "token"; fetchAccessToken: () => Promise<string | null> };

type Session = {
  /** "site" and "account": the human everywhere; "token": the human in one room (credential `roomId`). */
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
/** Set when an account sign-out could not reach the engine (core/app.tsx shows it on the sign-in screen). */
export const SIGN_OUT_UNCONFIRMED = "codegods.signOutUnconfirmed";
const base = import.meta.env.BASE_URL.replace(/\/$/, "");

/** Better Auth on this origin (the engine site, or the dev server's /api proxy to it). */
export const authClient = createAuthClient({ baseURL: window.location.origin, plugins: [convexClient()] });

/** The signed-in human: Convex auth (Better Auth's session, or the app's token) plus `auth/user:me`. */
function useEngineSession(auth: EngineAuth): Session {
  const kind = auth.kind;
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const me = useLive(api.auth.user.me, isAuthenticated ? {} : "skip");
  const login = useCallback(() => {
    // A token app signs in where its credential comes from (`pnpm player connect`), not here.
    if (auth.kind === "token") { toast({ title: "This player app signs in with its credential", description: "Run `pnpm player status`." }); return; }
    const returnTo = window.location.pathname + window.location.search || "/";
    if (auth.kind === "account") {
      auth.auth.signInWithRedirect({ permission: "account", returnTo })
        .catch((e: unknown) => toast({ title: "Sign-in failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" }));
      return;
    }
    // Better Auth resolves with {error} rather than throwing; without a redirect the button would look dead.
    void authClient.signIn.social({ provider: "google", callbackURL: returnTo }).then(
      r => { if (r.error) toast({ title: "Sign-in failed", description: r.error.message ?? `HTTP ${r.error.status}`, variant: "destructive" }); },
      (e: unknown) => toast({ title: "Sign-in failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" }));
  }, [auth]);
  const logout = useCallback(() => {
    // An account grant is revoked on the engine (it no longer appears under Connected apps). The SDK forgets it here
    // either way; when the engine did not confirm, the sign-in screen says where to revoke it.
    const done = auth.kind === "account"
      ? auth.auth.signOut(auth.session).catch(() => { try { sessionStorage.setItem(SIGN_OUT_UNCONFIRMED, "1"); } catch { /* storage off */ } })
      : authClient.signOut().catch(() => undefined);
    void done.finally(() => { window.location.href = base || "/"; });
  }, [auth]);
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

function SessionProvider({ auth, children }: { auth: EngineAuth; children: ReactNode }) {
  return <SessionContext.Provider value={useEngineSession(auth)}>{children}</SessionContext.Provider>;
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

/** A fresh Convex JWT of the signed-in human, or null: the one the Convex client sends. */
type FetchAccessToken = () => Promise<string | null>;
const AccessTokenContext = createContext<FetchAccessToken | null>(null);
/** Better Auth's session cookie exchanged for a Convex JWT, as ConvexBetterAuthProvider does. */
const siteToken: FetchAccessToken = () => authClient.convex.token({ fetchOptions: { throw: false } }).then(r => r.data?.token ?? null, () => null);

/**
 * The signed-in human's Convex JWT for an engine HTTP route that checks it (`Authorization: Bearer`): an ended game's
 * stored replay (GET /api/replay/<roomId>/<gameId>). Never for Convex data, which is read by subscription.
 */
export function useAccessToken(): FetchAccessToken {
  const fetchToken = useContext(AccessTokenContext);
  if (!fetchToken) throw new Error("useAccessToken outside EngineProvider");
  return fetchToken;
}

export function EngineProvider({ client, auth, children }: { client: ConvexReactClient; auth: EngineAuth; children: ReactNode }) {
  // One token source per sign-in: the Convex client's and the HTTP routes' (an account grant refreshes one at a time).
  // An account grant's player JWTs are refreshed (one refresh at a time across tabs) by the SDK.
  const grant = auth.kind === "account" ? auth : null;
  const accountToken = useMemo(() => (grant ? grant.auth.fetchToken(grant.session) : null), [grant?.auth, grant?.session]); // eslint-disable-line react-hooks/exhaustive-deps
  const fetchToken = auth.kind === "token" ? auth.fetchAccessToken : accountToken;
  const tokenSource = fetchToken ?? siteToken;
  // The SDK's transport reads the same source for the engine routes it calls outside React (calibration tables): set
  // while rendering, so it is there before any child's effect asks.
  setAppAccessToken(tokenSource);
  const inner = <SessionProvider auth={auth}><ActivityPing />{children}</SessionProvider>;
  return (
    <AccessTokenContext.Provider value={tokenSource}>
      {fetchToken ? <TokenProvider client={client} fetchAccessToken={fetchToken}>{inner}</TokenProvider> : (
        // The cast bridges a type-level quirk of @convex-dev/better-auth 0.12 (its AuthClient union infers `never` for
        // useSession().data under this repo's compiler settings); the runtime object is exactly what it expects.
        <ConvexBetterAuthProvider client={client} authClient={authClient as unknown as AuthClient}>{inner}</ConvexBetterAuthProvider>
      )}
    </AccessTokenContext.Provider>
  );
}

/** Convex auth over a token fetcher (always "signed in": the fetcher may refuse), with a stable useAuth hook. */
function TokenProvider({ client, fetchAccessToken, children }: { client: ConvexReactClient; fetchAccessToken: (args?: { forceRefreshToken: boolean }) => Promise<string | null>; children: ReactNode }) {
  const useAuth = useMemo(() => {
    const value = { isLoading: false, isAuthenticated: true, fetchAccessToken };
    return () => value;
  }, [fetchAccessToken]);
  return <ConvexProviderWithAuth client={client} useAuth={useAuth}>{children}</ConvexProviderWithAuth>;
}

export type Result<T> = { data: T | undefined; error: Error | null; isLoading: boolean };

/**
 * A reactive query that reports errors instead of throwing them into render. It waits for the Convex
 * client to hold a browser JWT (every engine query needs a signed-in caller). "skip" disables it.
 */
/**
 * A paged subscription (convex's usePaginatedQuery: every loaded page stays live), skipped until Convex holds the
 * viewer's token, as useLive is. A query error throws to the nearest error boundary.
 */
export function useLivePages<Q extends PaginatedQueryReference>(query: Q, args: PaginatedQueryArgs<Q> | "skip", options: { initialNumItems: number }) {
  const { isAuthenticated } = useConvexAuth();
  return usePaginatedQuery(query, isAuthenticated && args !== "skip" ? args : "skip", options);
}

export function useLive<Q extends FunctionReference<"query">>(query: Q, args: FunctionArgs<Q> | "skip"): Result<FunctionReturnType<Q>> {
  type T = FunctionReturnType<Q>;
  const { isAuthenticated } = useConvexAuth();
  // Keyed like convex's own useQuery: a retry and the last answer belong to one query with one set of args.
  const argsKey = args === "skip" ? "" : `${getFunctionName(query)}:${JSON.stringify(convexToJson(args as Value))}`;
  // A transient failure is retried by dropping the subscription for a moment: Convex then runs the query afresh.
  const [retrying, setRetrying] = useState<(Retry<T> & { key: string; dropped: boolean }) | null>(null);
  const retry = retrying?.key === argsKey ? retrying : null;
  const skip = args === "skip" || !isAuthenticated || !!retry?.dropped;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const request = useMemo((): Parameters<typeof useQueries>[0] => (skip ? {} : { q: { query, args: args as FunctionArgs<Q> } }), [skip ? "" : argsKey]);
  const r = useQueries(request).q as T | Error | undefined;
  const last = useRef<{ key: string; data: T } | null>(null);
  if (r !== undefined && !(r instanceof Error)) last.current = { key: argsKey, data: r };
  const kept = last.current?.key === argsKey ? last.current.data : undefined;
  const transient = transientQueryError(r);
  const attempts = retry?.attempts ?? 0;
  // An answer ends the retry.
  useEffect(() => { if (r !== undefined && !(r instanceof Error)) setRetrying(null); }, [r]);
  // One retry per failed subscription (not per error object: Convex may fail it again before the timer fires).
  useEffect(() => {
    if (!transient || attempts >= MAX_RETRIES) return;
    const t = setTimeout(() => setRetrying({ key: argsKey, attempts: attempts + 1, data: kept, error: r as Error, dropped: true }), retryDelay(attempts));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transient, attempts, argsKey]);
  useEffect(() => {
    if (!retry?.dropped) return;
    const t = setTimeout(() => setRetrying(c => (c ? { ...c, dropped: false } : c)), 0);
    return () => clearTimeout(t);
  }, [retry?.dropped]);
  // The first failure counts as a retry about to happen (attempt 0) when it is transient.
  return liveResult<T>(args === "skip", r, retry ?? (transient ? { attempts: 0, data: kept, error: r as Error } : null));
}
