/**
 * The dock's replay mode (docs/replay-design.md §4): a source that answers the SDK's queries from a replay at its
 * playhead instead of from the engine. Provided by the replay page (core/replay); the host transport
 * (sdk/transport.ts) and the stored-panel bridge (shell/stored-frame.tsx) read it, so every built-in and stored panel
 * shows the past game, and commands are refused with `refusal`.
 */
import { createContext, useContext } from "react";
import type { QueryName } from "./bridge-protocol";

export interface ReplaySource {
  /** Whether this query is answered from the replay (else it goes to the engine as usual). */
  serves(name: QueryName): boolean;
  /** The answer at the playhead; the same object until the playhead or the point of view moves. */
  answer(name: QueryName, args: Record<string, unknown>): unknown;
  subscribe(listener: () => void): () => void;
  /** Why a command is refused in a replay. */
  readonly refusal: string;
}

export const ReplaySourceContext = createContext<ReplaySource | null>(null);
export const useReplaySource = () => useContext(ReplaySourceContext);
