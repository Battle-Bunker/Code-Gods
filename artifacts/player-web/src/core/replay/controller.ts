/**
 * The replay controller (docs/replay-design.md §4–§5): one ended game's replay, its playhead and point of view, the
 * playback loop, and the SDK's answers at the playhead. The dock's replay mode hands it to the SDK transport
 * (sdk/replay-source.ts), so every built-in and stored panel reads the game as it was at the playhead; the transport
 * strip and the Timeline panel drive it.
 *
 * Framework-free: React reads it through useSyncExternalStore (useReplay below).
 */
import { useSyncExternalStore } from "react";
import {
  cursorAtWorld, keyMoments, replayEvents, replayMyUtility, replayObservation, replayTrajectories, scoreSeries, stateAt,
  type KeyMoment, type Replay, type ReplayState,
} from "@workspace/player-client/replay";
import type { QueryName } from "@/sdk/bridge-protocol";
import type { ReplaySource } from "@/sdk/replay-source";
import { DEFAULT_SPEED, SPEEDS } from "./model.ts";

/** A change the board animates: the version reached, the value before, and when (ms, performance clock). */
export type Changed = { version: number; after: number | string; before?: number | string; at: number };
/** How long a change stays in `changed`: longer than a throttled panel's render period, so none is missed. */
const CHANGE_MS = 1200;
/** While playing, SDK answers move at most this often (each answer re-renders every panel). */
const ANSWER_MS = 125;
export type ReplayView = { cursor: number; playing: boolean; speed: number; pov: number; state: ReplayState; version: number };

export class ReplayController {
  readonly end: number;
  readonly moments: KeyMoment[];
  readonly series: ReturnType<typeof scoreSeries>;
  private view: ReplayView;
  private listeners = new Set<() => void>();
  private answerListeners = new Set<() => void>();
  private answerKey = "";
  /** The position the SDK's answers are at (it trails the playhead by at most ANSWER_MS while playing). */
  private published: { cursor: number; pov: number; state: ReplayState };
  private answerTimer: ReturnType<typeof setTimeout> | undefined;
  private answerAt = 0;
  private world = 0;
  private frame = 0;
  private answers = new Map<string, unknown>();
  /** Objects changed by recent forward moves of the playhead (the last CHANGE_MS): version reached, value before (board animation). */
  changed: ReadonlyMap<string, Changed> = new Map();

  readonly replay: Replay;
  readonly room: { roomId: string; roomShortCode?: string };

  constructor(replay: Replay, room: { roomId: string; roomShortCode?: string }, start: { cursor: number; speed?: number; pov?: number }) {
    this.replay = replay;
    this.room = room;
    this.end = replay.log.length;
    this.moments = keyMoments(replay);
    this.series = scoreSeries(replay);
    const cursor = Math.max(0, Math.min(this.end, start.cursor));
    const state = stateAt(replay, cursor);
    this.view = { cursor, playing: false, speed: start.speed ?? DEFAULT_SPEED, pov: start.pov ?? Math.max(0, replay.viewer.index), state, version: 0 };
    this.world = state.world;
    this.published = { cursor, pov: this.view.pov, state };
    this.answerKey = `${cursor}|${this.view.pov}`;
  }

  // ----- store -----
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  get = () => this.view;
  private set(patch: Partial<ReplayView>) {
    this.view = { ...this.view, ...patch, version: this.view.version + 1 };
    for (const l of this.listeners) l();
    // The SDK's answers depend on the playhead and the point of view only; they move at most every ANSWER_MS while playing.
    const key = `${this.view.cursor}|${this.view.pov}`;
    if (key === this.answerKey) return;
    const publish = () => {
      this.answerTimer = undefined;
      this.answerAt = performance.now();
      this.answerKey = `${this.view.cursor}|${this.view.pov}`;
      this.published = { cursor: this.view.cursor, pov: this.view.pov, state: this.view.state };
      this.answers.clear();
      for (const l of this.answerListeners) l();
    };
    if (!this.view.playing) { clearTimeout(this.answerTimer); publish(); }
    else if (!this.answerTimer) this.answerTimer = setTimeout(publish, Math.max(0, this.answerAt + ANSWER_MS - performance.now()));
  }

  // ----- the playhead -----
  seek(cursor: number, { keepPlaying = false } = {}) {
    const c = Math.max(0, Math.min(this.end, Math.floor(cursor)));
    if (!keepPlaying && this.view.playing) this.stop();
    if (c === this.view.cursor) return;
    // Forward moves add their changes to the recent ones (a panel rendering at its own rate still sees each); any other
    // move clears them.
    const now = performance.now();
    const changed = new Map<string, Changed>();
    if (c > this.view.cursor && c - this.view.cursor <= 256) {
      for (const [id, ch] of this.changed) if (now - ch.at < CHANGE_MS) changed.set(id, ch);
      for (let i = this.view.cursor; i < c; i++) {
        const ev = this.replay.log[i].event;
        if (ev.type === "object.transformed") changed.set(ev.objectId, { version: ev.version, after: ev.value, before: ev.before, at: now });
        else if (ev.type === "object.spawned") changed.set(ev.objectId, { version: ev.version, after: ev.value, at: now });
      }
    }
    this.changed = changed;
    const state = stateAt(this.replay, c);
    if (!this.view.playing) this.world = state.world;
    this.set({ cursor: c, state });
  }
  step(dir: 1 | -1) { this.seek(this.view.cursor + dir); }
  jump(dir: 1 | -1) {
    const c = this.view.cursor;
    const target = dir > 0 ? this.moments.find(m => m.cursor > c) : [...this.moments].reverse().find(m => m.cursor < c);
    this.seek(target ? target.cursor : dir > 0 ? this.end : 0);
  }
  seekWorld(world: number) { this.seek(cursorAtWorld(this.replay, world)); }
  setSpeed(speed: number) { if ((SPEEDS as readonly number[]).includes(speed)) this.set({ speed }); }
  setPov(pov: number) { if (pov >= 0 && pov < this.replay.game.roster.length && pov !== this.view.pov) this.set({ pov }); }

  // ----- playback: the playhead advances `speed` world seconds per second; quiet stretches over 2 s of playback are skipped -----
  toggle() { if (this.view.playing) this.stop(); else this.play(); }
  play() {
    if (this.view.playing) return;
    if (this.view.cursor >= this.end) this.seek(0);
    this.world = this.view.state.world;
    this.set({ playing: true });
    let last = performance.now();
    const tick = () => {
      if (!this.view.playing) return;
      // Measured here: a frame's timestamp can precede a performance.now() taken before it was requested.
      const now = performance.now();
      this.world += Math.max(0, now - last) / 1000 * this.view.speed;
      last = now;
      const at = this.view.cursor;
      let next = Math.max(at, cursorAtWorld(this.replay, this.world));
      const upcoming = this.replay.log[next];
      if (next === at && upcoming && upcoming.world - this.world > 2 * this.view.speed) {
        this.world = this.replay.worldMax[next];
        next = Math.max(at, cursorAtWorld(this.replay, this.world));
      }
      if (next !== at) this.seek(next, { keepPlaying: true });
      if (next >= this.end) { this.stop(); return; }
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }
  stop() {
    cancelAnimationFrame(this.frame);
    if (this.view.playing) this.set({ playing: false });
  }
  dispose() { cancelAnimationFrame(this.frame); clearTimeout(this.answerTimer); this.listeners.clear(); this.answerListeners.clear(); }

  // ----- ReplaySource: the SDK's answers at the playhead -----
  subscribeAnswers = (listener: () => void) => { this.answerListeners.add(listener); return () => { this.answerListeners.delete(listener); }; };
  serves(name: QueryName) { return name !== "rooms.get"; }
  answer(name: QueryName, args: Record<string, unknown>): unknown {
    const key = `${name}|${JSON.stringify(args)}`;
    if (this.answers.has(key)) return this.answers.get(key);
    const p = this.published;
    const at = { room: this.room, cursor: p.cursor, pov: p.pov };
    const value = name === "player.observation" ? replayObservation(this.replay, at, p.state)
      : name === "player.events" ? replayEvents(this.replay, at, typeof args.limit === "number" ? args.limit : 20)
      : name === "player.trajectories" ? replayTrajectories(this.replay, at, typeof args.afterSeq === "number" ? args.afterSeq : -1)
      : name === "player.myUtility" ? replayMyUtility(this.replay, p.pov)
      : undefined;
    this.answers.set(key, value);
    return value;
  }
  refusal = "This is a replay of an ended game: nothing can be done in it. Go back to the room to play.";
}

/** The controller as the SDK's replay source: answers move with the playhead and the point of view only. */
export function replaySource(c: ReplayController): ReplaySource {
  return { serves: name => c.serves(name), answer: (name, args) => c.answer(name, args), subscribe: c.subscribeAnswers, refusal: c.refusal };
}

/** The controller's view, re-rendered on every change. */
export function useReplay(controller: ReplayController): ReplayView {
  return useSyncExternalStore(controller.subscribe, controller.get);
}
