/**
 * The locks on the line in focus (docs/engine-v2/locks.md §5, §7), in the One line pane when the game has locks: each
 * lock's program and description, energy, upkeep and time left, what went in and how much of it was the viewer's (costly
 * signalling), its history; adding or taking energy; making a lock from a ready-made predicate or one written in the
 * code editor, checked on the line before paying. The locks are one live subscription (`v2/locks:ofObject`); every
 * change is an affordance (`lock.fund`, `lock.drain`, `lock.check`, `lock.create`).
 */
import { useAffordance } from "@workspace/v2-affordances/react";
import { useGame, useMe, useObjectLocks } from "@/sdk";
import { useReplaying } from "@/core/affordance-runtime";
import { LockCreate, LocksSection, type LockView } from "./locks-ui";
import { lockStarters } from "./locks-starters";
import { useWorldNow } from "./fresh-mark";

export function ObjectLocks({ objectId, noun, retired }: { objectId: string; noun: string; retired: boolean }) {
  const header = useGame();
  const replaying = useReplaying();
  const locks = useObjectLocks(objectId);
  const me = useMe();
  const worldNow = useWorldNow();
  const fund = useAffordance("lock.fund"), drain = useAffordance("lock.drain"), check = useAffordance("lock.check"), create = useAffordance("lock.create");
  if (!header?.locks || replaying) return null;
  const live = header.phase !== "ended" && !retired;
  const myEnergy = live && me ? me.energy : null;
  const views: LockView[] | undefined = locks?.map(l => ({
    n: l.n, title: l.words, code: { language: l.language, source: l.source }, bits: l.bits, energy: l.energy, settledAt: l.settledAt, rate: l.rate,
    added: l.added, taken: l.taken, mine: l.mine, history: l.history,
  }));
  const onFund = async (n: number, amount: number) => (amount > 0 ? fund.run({ objectId, lock: n, amount }) : drain.run({ objectId, lock: n, amount: -amount }));
  return (
    <LocksSection locks={views} noun={noun} worldNow={worldNow} myEnergy={myEnergy} onFund={myEnergy !== null ? onFund : undefined}
      create={myEnergy !== null && create.available ? (
        <LockCreate noun={noun} starters={lockStarters("python")} myEnergy={myEnergy}
          check={(language, source, words) => check.run({ objectId, language, source, words })}
          onCreate={(language, source, words, amount) => create.run({ objectId, language, source, words, amount })} />
      ) : undefined} />
  );
}
