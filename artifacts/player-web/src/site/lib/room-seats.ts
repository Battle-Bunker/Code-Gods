/**
 * Seats on the room page (pure, so it is unit tested).
 *
 * `aiSeats`: adding AI players without one too many. The page knows the room as it was last rendered; a seat the engine
 * has just added is not in it yet. So a practice game clicked right after "+ Add AI player" counted one player too few
 * and added one seat too many, and a double click on "+ Add AI player" added two. Here every seat this page adds is
 * remembered by the id the engine returned until the rendered room shows it, adds run one at a time, and a click on the
 * add button while a seat is being added is dropped. No new subscription and no extra read: only the results of the
 * mutations the page makes anyway.
 *
 * `membersStart`: whether the Members header shows the owner a second Start button (the first is at the top of the page;
 * an owner who had scrolled down to watch friends join could not find it).
 */
type Member = { id: string; spectator?: boolean };

export function aiSeats<R extends { godId?: string } | null | undefined | void>(addOne: (templateId?: string) => Promise<R>) {
  /** Seats added here that the rendered room does not show yet. */
  const unseen = new Set<string>();
  let inFlight: Promise<unknown> | null = null;
  const players = (members: readonly Member[]) => {
    for (const m of members) unseen.delete(m.id);
    return members.filter(m => !m.spectator).length + unseen.size;
  };
  const add = async (templateId?: string) => {
    const r = await addOne(templateId);
    if (r && typeof r === "object" && typeof r.godId === "string") unseen.add(r.godId);
    return r;
  };
  const exclusive = <T,>(work: () => Promise<T>): Promise<T> => {
    const p = work();
    inFlight = p;
    const done = () => { if (inFlight === p) inFlight = null; };
    p.then(done, done);
    return p;
  };
  return {
    /** One click, one seat: a click while a seat is being added (a double click) adds nothing and resolves to undefined. */
    addOnce(templateId?: string): Promise<R | undefined> {
      return inFlight ? Promise.resolve(undefined) : exclusive(() => add(templateId));
    },
    /** Add AI players (`templateId`, else the default), one at a time, until `min` players are in; `members` is read afresh before every seat. */
    fill(min: number, members: () => readonly Member[], templateId?: string): Promise<void> {
      const waitFor = inFlight;
      return exclusive(async () => {
        if (waitFor) await waitFor.catch(() => undefined);
        // Every seat added counts at once (by its id until the room shows it; `blind` for an engine that returned none).
        let blind = 0;
        for (let i = 0; i < min && players(members()) + blind < min; i++) {
          const r = await add(templateId);
          if (!(r && typeof r === "object" && typeof r.godId === "string")) blind++;
        }
      });
    },
  };
}

export function membersStart({ isOwner, hasGame, players, minPlayers, startUnavailable }: {
  isOwner: boolean; hasGame: boolean; players: number; minPlayers: number; startUnavailable: string | null;
}): boolean {
  return isOwner && !hasGame && players >= minPlayers && !startUnavailable;
}
