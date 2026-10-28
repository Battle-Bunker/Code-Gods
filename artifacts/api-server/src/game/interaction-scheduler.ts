import type { Game } from "./types";

export type InteractionJob = {
  roomId: string; gameId: string; objectId: string; rate: number;
  execute: () => Promise<unknown>;
  commit: (value: unknown, stillCurrent: () => boolean) => Promise<void>;
  /** Called exactly when the job ends, however it ends (discarded, failed or committed). */
  release?: () => void;
};

/** Single-process, bounded, fair admission. There is deliberately no work queue or rate debt. */
export class InteractionScheduler {
  private readonly flights = new Set<Promise<void>>();
  private readonly reserved = new Set<string>();
  private readonly deadlines = new Map<string, { gameId: string; at: number }>();
  private cursor = "";
  private stopped = false;
  private generation = 0;
  private eligibleDeadline = Infinity;

  constructor(
    private readonly now: () => number,
    private readonly candidates: () => string[],
    private readonly capture: (roomId: string, available: (gameId: string, objectId: string) => boolean) => InteractionJob | undefined,
    private readonly onError: (error: unknown) => void,
    private readonly wake: () => void = () => {},
    private readonly currentGameId?: (roomId: string) => string | undefined,
  ) {}

  get inFlight() { return this.flights.size; }
  invalidate() { this.generation++; }

  /** Sub-millisecond deadlines use an immediate; empty/saturated worlds sleep. */
  nextDelay() {
    if (this.stopped || this.flights.size >= 4) return 100;
    return Math.min(100, Math.max(0, this.eligibleDeadline - this.now()));
  }

  pump() {
    this.eligibleDeadline = Infinity;
    if (this.stopped || this.flights.size >= 4) return;
    const rooms = this.candidates();
    const start = (rooms.indexOf(this.cursor) + 1) % (rooms.length || 1);
    const live = new Set(rooms);
    for (const roomId of this.deadlines.keys()) if (!live.has(roomId)) this.deadlines.delete(roomId);
    for (let i = 0; i < rooms.length && this.flights.size < 4; i++) {
      const roomId = rooms[(start + i) % rooms.length];
      const now = this.now();
      const deadline = this.deadlines.get(roomId);
      // Cheap cache lookup before object selection, randomness and settings cloning.
      // Include game identity so a replacement game never inherits the old deadline.
      if (deadline && now < deadline.at && this.currentGameId?.(roomId) === deadline.gameId) {
        this.eligibleDeadline = Math.min(this.eligibleDeadline, deadline.at);
        continue;
      }
      let job: InteractionJob | undefined;
      try {
        job = this.capture(roomId, (gameId, objectId) => !this.reserved.has(`${gameId}:${objectId}`));
      } catch (error) { this.onError(error); continue; }
      if (!job) continue;
      if (!(job.rate > 0) || !Number.isFinite(job.rate)) { job.release?.(); continue; }
      if (deadline?.gameId === job.gameId && now < deadline.at) {
        job.release?.();
        this.eligibleDeadline = Math.min(this.eligibleDeadline, deadline.at);
        continue;
      }
      const key = `${job.gameId}:${job.objectId}`;
      if (this.reserved.has(key)) { job.release?.(); continue; }
      this.reserved.add(key);
      this.cursor = roomId;
      // Set from actual dispatch, never from an old deadline (no catch-up burst).
      this.deadlines.set(roomId, { gameId: job.gameId, at: now + 1000 / job.rate });
      this.eligibleDeadline = Math.min(this.eligibleDeadline, now + 1000 / job.rate);
      const generation = this.generation;
      const current = () => !this.stopped && generation === this.generation;
      const flight = Promise.resolve().then(() => job!.execute())
        .then(value => current() ? job!.commit(value, current) : undefined)
        .catch(error => this.onError(error))
        .finally(() => {
          job!.release?.();
          this.reserved.delete(key);
          this.flights.delete(flight);
          if (!this.stopped) this.wake();
        });
      this.flights.add(flight);
    }
  }

  async stop() {
    this.stopped = true;
    this.invalidate();
    await Promise.allSettled([...this.flights]);
  }
}

export type InteractionSnapshot = {
  gameId: string; objectId: string; version: number; pauseEndsAt: number; epoch: number;
};

/** Recheck inside the mutation lock, including pause/resume and recovery/resume epochs. */
export function completionTarget(game: Game | null, snapshot: InteractionSnapshot, now: number) {
  if (!game || game.id !== snapshot.gameId || game.phase !== "running" ||
      game.pauseEndsAt !== snapshot.pauseEndsAt || (game.executionEpoch ?? 0) !== snapshot.epoch ||
      game.worldSeconds + Math.max(0, now - game.lastTick) / 1000 >= game.endAtWorld) return;
  return game.objects.find(o => o.id === snapshot.objectId && o.version === snapshot.version);
}

/** Advance the wall-time world without simulating missed interaction opportunities. */
export function advanceWorld(game: Game, now: number, spawn: (game: Game) => void, spawnInterval: () => number) {
  if (game.phase === "planning" || game.phase === "paused") {
    const deadline = game.phase === "planning" ? game.planningEndsAt : game.pauseEndsAt;
    if (now < deadline) return;
    game.phase = "running";
    game.lastTick = deadline;
  }
  if (game.phase !== "running") return;
  const target = game.worldSeconds + Math.max(0, now - game.lastTick) / 1000;
  game.lastTick = now;
  const until = Math.min(target, game.endAtWorld);
  // Spawn remains a Poisson process. Catch-up is bounded by the existing object limit.
  while (game.nextSpawn <= until && game.nextSpawn < game.endAtWorld) {
    game.worldSeconds = game.nextSpawn;
    if (game.objects.length >= 2000) {
      game.phase = "recovery";
      game.recoveryReason = "The world reached its 2,000-object safety limit.";
      return;
    }
    spawn(game);
    const next = game.nextSpawn + spawnInterval();
    game.nextSpawn = Number.isFinite(next) ? next : Number.MAX_VALUE;
  }
  game.worldSeconds = until;
  if (target >= game.endAtWorld) game.phase = "ended";
}
