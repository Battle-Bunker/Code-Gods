import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { humanActivity, humanVisit } from "./use-server-idle";

export interface AuthUser { id: string; name?: string; isAdmin?: boolean; firstName?: string | null; lastName?: string | null }

const base = import.meta.env.BASE_URL.replace(/\/$/, "");

export function useAuth() {
  const q = useQuery({
    queryKey: ["/api/auth/user"],
    queryFn: async (): Promise<AuthUser | null> => {
      const r = await fetch("/api/auth/user", { credentials: "include" });
      if (!r.ok) throw new Error(`Auth check failed (${r.status})`);
      const j = (await r.json()) as { user: AuthUser | null };
      return j.user ?? null;
    },
    staleTime: 60_000,
    retry: 1,
  });
  const returnTo = () => encodeURIComponent(window.location.pathname + window.location.search || base || "/");
  useEffect(()=>{
    if(!q.data)return;
    humanVisit();
    window.addEventListener("pointerdown",humanActivity);window.addEventListener("keydown",humanActivity);
    return ()=>{window.removeEventListener("pointerdown",humanActivity);window.removeEventListener("keydown",humanActivity);};
  },[q.data?.id]);
  return {
    user: q.data ?? null,
    isLoading: q.isLoading,
    error: q.error as Error | null,
    refetch: q.refetch,
    isAuthenticated: !!q.data,
    login: () => { window.location.href = `/api/login?returnTo=${returnTo()}`; },
    logout: () => { window.location.href = `/api/logout?returnTo=${encodeURIComponent(base || "/")}`; },
  };
}

export function displayName(u: AuthUser | null) {
  if (!u) return "";
  return u.name || [u.firstName, u.lastName].filter(Boolean).join(" ") || "Unnamed deity";
}
