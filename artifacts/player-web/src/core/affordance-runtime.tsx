/**
 * The app's one affordance runtime (docs/engine-v2/affordances.md §4; parity check 3): the only file that calls a v2
 * mutation or action. Every button reaches an operation through `useAffordance(id)`, which asks the directory whether
 * it is available here and runs it through `perform` below:
 *
 * - a server write calls its `defineOp` function (`opPath(id).public`, as a query, mutation or action by
 *   `opKind`) with the room and game in view; a refusal or failure comes back as a value (`OpOutcome`);
 * - a view operation (`runs: "client"`) applies the same reducer the server runs (`applyView`) to the human's view
 *   state at once, then sends it to `v2/ops/view:apply`, which stores it in their layout row, so their other clients
 *   (and an assistant acting for them) follow.
 *
 * The view state comes from the human's layout subscription (`v2/layout:current`); a change made here shows at once
 * and gives way to the stored state when the server's answer (or a newer change from elsewhere) arrives.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useConvex } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { AFFORDANCES, EMPTY_VIEW, applyView, isViewOp, opKind, type AffordanceContext, type AffordanceId, type OpOutcome, type ViewState } from "@workspace/v2-affordances";
import { AffordanceProvider, type AffordanceRuntime } from "@workspace/v2-affordances/react";
import { VIEW_OP_PATH, opPath, outcomeOf } from "@workspace/v2-affordances/convex";
import { api } from "@workspace/engine/convex/_generated/api";
import { useLive } from "@/site/lib/convex";

export interface RuntimeScope { roomId?: string; gameId?: string; replay?: boolean }

const failed = (e: unknown): OpOutcome => outcomeOf(e) ?? { ok: false, error: { code: "failed", message: e instanceof Error ? e.message : String(e) } };

const ViewContext = createContext<ViewState>(EMPTY_VIEW);
const RuntimeContext = createContext<AffordanceRuntime | null>(null);
/** The runtime itself, for the palette, which lists every affordance of the context (not one button's). */
export function useRuntime(): AffordanceRuntime {
  const rt = useContext(RuntimeContext);
  if (!rt) throw new Error("useRuntime outside AffordanceRuntimeProvider");
  return rt;
}
/** The human's view state in the room in view (open panes, pins, sort and filter, the focused line, the replay). */
export function useView(): ViewState {
  return useContext(ViewContext);
}

/**
 * The stored view state of the room (or the empty one before a room). A failed read shows the empty view (the phase's
 * defaults) rather than tearing the screen down (ux-lessons 4.2); the next value the subscription delivers replaces it.
 */
function useStoredView(roomId: string | undefined): ViewState {
  const row = useLive(api.v2.layout.current, roomId ? { roomId } : "skip").data;
  return ((row?.layout as { view?: ViewState } | null | undefined)?.view) ?? EMPTY_VIEW;
}

export function AffordanceRuntimeProvider({ context, scope, onSignIn, children }: {
  context: AffordanceContext; scope: RuntimeScope; onSignIn?: () => void; children: ReactNode;
}) {
  const convex = useConvex();
  const stored = useStoredView(scope.roomId);
  // A local change shows until the stored view reaches its version (or a newer one from another client); it belongs to
  // one room, and goes when the server refuses or fails it.
  const [localState, setLocalState] = useState<{ roomId?: string; view: ViewState } | null>(null);
  const local = localState && localState.roomId === scope.roomId ? localState.view : null;
  const view = local && local.version > stored.version ? local : stored;
  const viewNow = useRef(view);
  viewNow.current = view;
  const contextNow = useRef(context);
  contextNow.current = context;
  const scopeKey = `${scope.roomId ?? ""}|${scope.gameId ?? ""}|${scope.replay ? 1 : 0}`;

  const perform = useCallback(async (id: AffordanceId, args: unknown): Promise<OpOutcome> => {
    const a = AFFORDANCES[id];
    const where = { ...(scope.roomId ? { roomId: scope.roomId } : {}), ...(scope.gameId ? { gameId: scope.gameId } : {}), ...(scope.replay ? { replay: true } : {}) };
    if (a.runs === "client") {
      if (id === "account.signIn") { onSignIn?.(); return { ok: true, result: { ok: true } }; }
      if (!isViewOp(id)) return { ok: false, error: { code: "unknown", message: `${id} cannot run in the app.` } };
      const applied = applyView(viewNow.current, id, args, contextNow.current);
      if (!applied.outcome.ok || !applied.changed) return applied.outcome;
      const before = viewNow.current;
      viewNow.current = applied.view;
      setLocalState({ roomId: scope.roomId, view: applied.view });
      const undo = () => { viewNow.current = before; setLocalState(null); };
      try {
        const out = await convex.mutation(makeFunctionReference<"mutation">(VIEW_OP_PATH.public), { id, args: args ?? {}, ...where }) as OpOutcome;
        if (!out.ok) undo();
        return out;
      } catch (e) { undo(); return failed(e); }
    }
    const ref = opPath(id).public;
    try {
      switch (opKind(a)) {
        // A read is for models and the CLI (R7): the app shows the same data live in a pane, never as a one-off read.
        case "query": return { ok: false, error: { code: "refused", message: `${a.title}: the app shows this live in its pane.` } };
        case "mutation": return await convex.mutation(makeFunctionReference<"mutation">(ref), { args: args ?? {}, ...where }) as OpOutcome;
        default: return await convex.action(makeFunctionReference<"action">(ref), { args: args ?? {}, ...where }) as OpOutcome;
      }
    } catch (e) { return failed(e); }
  }, [convex, scopeKey, onSignIn]); // eslint-disable-line react-hooks/exhaustive-deps

  const runtime = useMemo((): AffordanceRuntime => ({ context, perform }), [context, perform]);
  return (
    <AffordanceProvider runtime={runtime}>
      <RuntimeContext.Provider value={runtime}>
        <ViewContext.Provider value={view}>{children}</ViewContext.Provider>
      </RuntimeContext.Provider>
    </AffordanceProvider>
  );
}
