import { useSession, type AuthUser } from "@/lib/convex";

export type { AuthUser };

/** The signed-in human (from the site's session cookie), with login and logout. */
export function useAuth() {
  const s = useSession();
  return { ...s, isAuthenticated: !!s.user };
}

/** Full verified name, as the engine stores it. */
export function displayName(u: AuthUser | null) {
  return u?.name || "Unnamed deity";
}
