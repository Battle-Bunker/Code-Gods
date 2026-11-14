/**
 * The app end of the stored-panel bridge (protocol: src/frame/protocol.ts). A panel's frame asks for a hook by name;
 * the host runs the app's own hook (src/sdk/hooks.ts) in a hidden component inside the pane, so the answer is the same
 * shared live subscription the app's panes use, for the room and game in view (in a replay: at the playhead), and sends
 * every new answer to the frame as it arrives. A hook that fails sends its message instead.
 */
import { Component, memo, useEffect, useMemo, type ReactNode } from "react";
import * as sdk from "@/sdk";
import type { ObjectSort } from "@/sdk";
import type { HookName, HostMessage, PagedAnswer } from "@/frame/protocol";

type Paged = { results: unknown[]; status: string; isLoading: boolean; loadMore: (n: number) => void };
export interface HostAnswer { value: unknown; more?: (n: number) => void }

const value = (v: unknown): HostAnswer => ({ value: v });
function usePagedAnswer(p: Paged): HostAnswer {
  const answer = useMemo((): PagedAnswer => ({ results: p.results, status: p.status, isLoading: p.isLoading }), [p.results, p.status, p.isLoading]);
  return { value: answer, more: p.loadMore };
}
const str = (v: unknown) => v as string | null;

/** Each panel hook, run as the app runs it. Arguments were cleaned by checkCall. */
const HOST_HOOKS: Record<HookName, (args: unknown[]) => HostAnswer> = {
  useRoomInfo: () => value(sdk.useRoomInfo()),
  useGame: () => value(sdk.useGame()),
  useMe: () => value(sdk.useMe()),
  // The drawable rule holds functions; its row and rarities cross, and the frame resolves the rule as the app does.
  useMyRule: function useMyRuleAnswer() {
    const r = sdk.useMyRule();
    return value(useMemo(() => (r ? { row: r.row, rarities: r.rarities } : undefined), [r]));
  },
  useMyAgents: () => value(sdk.useMyAgents()),
  useAgentCount: () => value(sdk.useAgentCount()),
  useLeaderboard: () => value(sdk.useLeaderboard()),
  useStandingsHistory: () => value(sdk.useStandingsHistory()),
  useDigest: () => value(sdk.useDigest()),
  useMyObject: a => value(sdk.useMyObject(str(a[0]))),
  useMyObjects: a => value(sdk.useMyObjects(a[0] as string[])),
  useAgentEnergy: a => value(sdk.useAgentEnergy(str(a[0]))),
  useAgentPrograms: a => value(sdk.useAgentPrograms(str(a[0]))),
  useObjectIds: a => usePagedAnswer(sdk.useObjectIds(a[0] as ObjectSort, a[1] as number) as Paged),
  useSpectatorObjectIds: a => usePagedAnswer(sdk.useSpectatorObjectIds(a[0] as number) as Paged),
  useMoves: a => usePagedAnswer(sdk.useMoves(a[0] as number) as Paged),
  useChat: a => usePagedAnswer(sdk.useChat(a[0] as number) as Paged),
};

export interface HostWatch { id: string; hook: HookName; args: unknown[] }
export interface HostLink {
  post(message: HostMessage): void;
  /** A paged watch's loadMore, for the frame's `more`. */
  more(id: string, loadMore: ((n: number) => void) | undefined): void;
}

/**
 * One watch: runs its hook and sends each new answer. Keyed by id, so its hook never changes while mounted; memoised,
 * so the frame's own messages (a resize) never re-run it.
 */
const Watch = memo(function Watch({ watch, link }: { watch: HostWatch; link: HostLink }) {
  const answer = HOST_HOOKS[watch.hook](watch.args);
  useEffect(() => {
    try { link.post({ type: "value", id: watch.id, value: answer.value }); }
    catch { link.post({ type: "error", id: watch.id, message: `${watch.hook}'s answer could not be sent to the panel.` }); }
  }, [answer.value]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { link.more(watch.id, answer.more); }, [answer.more]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
});

/** A failed read takes down only its own watch, and the panel is told why. */
class WatchBoundary extends Component<{ watch: HostWatch; link: HostLink; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    this.props.link.post({ type: "error", id: this.props.watch.id, message: message.split("\n")[0]!.slice(0, 500) });
  }
  render() { return this.state.failed ? null : this.props.children; }
}

export function HostWatches({ watches, link }: { watches: HostWatch[]; link: HostLink }) {
  return <>{watches.map(w => <WatchBoundary key={w.id} watch={w} link={link}><Watch watch={w} link={link} /></WatchBoundary>)}</>;
}
