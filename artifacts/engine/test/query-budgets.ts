/**
 * The query-cost gate's budget table for the shared infrastructure's queries (docs/convex-read-architecture.md R8);
 * engine v2's own queries are in test/v2-query-budgets.ts. test/unit/query-budgets.test.ts checks that the two tables
 * list every query a page subscribes to. Each row reads one document or one small index page (the caller's own rows).
 */
export type Budget = {
  /** As the backend logs it: "<module path>:<export>", e.g. "auth/credentials:list". */
  query: string;
  /** Where a page subscribes to it. */
  subscribedBy: string;
  /** Its answer does not depend on what a game writes. */
  cold: boolean;
  /** Decided open to signed-out callers (owner, 2026-11-02): why. */
  open?: string;
};

export const BUDGETS: Budget[] = [
  { query: "auth/user:me", subscribedBy: "site/lib/convex.tsx (session)", cold: true,
    open: "answers null when signed out: the app asks it to learn whether to show the sign-in screen" },
  { query: "version:current", subscribedBy: "lib/v2-client update.ts (deploy auto-update)", cold: true,
    open: "the deploy auto-update: names the live builds only" },
  { query: "aiTemplates:catalog", subscribedBy: "site/hooks/use-agents.ts", cold: true },
  { query: "aiTemplates:adminList", subscribedBy: "site/hooks/use-agents.ts (admin)", cold: true },
  { query: "auth/credentials:list", subscribedBy: "site/components/sheets.tsx", cold: true },
  { query: "auth/device:pending", subscribedBy: "site/pages/device.tsx", cold: true },
  { query: "agent/connect:pending", subscribedBy: "site/pages/connect.tsx", cold: true },
];

/** "api.auth.credentials.list" (a client reference) → "auth/credentials:list" (the log's identifier). */
export function identifierOf(ref: string): string {
  const parts = ref.replace(/^api\./, "").split(".");
  return `${parts.slice(0, -1).join("/")}:${parts[parts.length - 1]}`;
}
