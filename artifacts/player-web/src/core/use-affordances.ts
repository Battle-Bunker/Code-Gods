/**
 * useAffordances(): what this viewer can do here (./affordances.ts), from the room credential, the replay source, the
 * observation (phase, seat, sandboxes) and the command runner. Every built-in panel reads it before rendering a control
 * that acts. `seenAs` is the point-of-view god's name in a replay seen as another god (null when it is the viewer, or
 * live), so panels showing "my" things say whose they are.
 */
import { useMemo } from "react";
import type { Language } from "@workspace/game-core";
import { useDockState } from "@/sdk";
import { useRoom } from "@/sdk/context";
import { useReplaySource } from "@/sdk/replay-source";
import { useRunner } from "@/core/game/runner";
import { forgeSandbox } from "@/core/game/language";
import { useReplayController } from "@/core/replay/parts";
import { deriveAffordances, ownerPhrase, type Affordances } from "./affordances";

export function useAffordances({ language }: { language?: Language } = {}): Affordances & { seenAs: string | null; whose: string } {
  const { permission } = useRoom();
  const replay = useReplaySource();
  const controller = useReplayController();
  const obs = useDockState({ hz: 1 });
  const { busy, unknown } = useRunner();
  const sandbox = language ? forgeSandbox(obs, language) : undefined;
  const sandboxKey = sandbox ? `${sandbox.ready}|${sandbox.text ?? ""}` : "";
  // Paid observation: one look's price and the viewer's energy. The energy moves every tick; the affordance changes only
  // when it crosses the price (and, while short, with the balance its reason states).
  const look = obs?.economy?.observation === "paid" && obs.economy.lookPrice !== undefined ? { price: obs.economy.lookPrice, energy: obs.self.energy ?? 0 } : undefined;
  const lookKey = !look ? "" : look.energy >= look.price ? `${look.price}` : `${look.price}|${look.energy.toFixed(2)}`;
  const seenAs = controller && obs && obs.self.godId !== controller.replay.viewer.godId ? obs.self.label : null;
  return useMemo(() => ({
    ...deriveAffordances({
      replay: !!replay, permission, phase: obs?.phase, seated: !!obs && obs.seated !== false && !!obs.gameId, hasObservation: !!obs,
      unknownOutcome: !!unknown, busy: !!busy, ...(sandbox ? { sandbox } : {}), ...(look ? { look } : {}),
    }),
    seenAs, whose: ownerPhrase(seenAs),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [replay, permission, obs?.phase, obs?.seated, obs?.gameId, !!obs, unknown, busy, sandboxKey, lookKey, seenAs]);
}
