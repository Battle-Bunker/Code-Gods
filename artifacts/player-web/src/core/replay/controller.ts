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
import { pageObjects, type ObjectCursor, type ObjectFilter, type ObjectSort } from "@workspace/player-client/objects-page";
import type { QueryName } from "@/sdk/bridge-protocol";
import type { ReplaySource } from "@/sdk/replay-source";
import { DEFAULT_SPEED, SPEEDS } from "./model.ts";

/** A change the board animates: the version reached, the value before, and when (ms, performance clock). */
export type Changed = { version: number; after: number | string; before?: number | string; at: number };
/** How long a change stays in `changed`: longer than a throttled panel's render period, so none is missed. */
const CHANGE_MS = 1200;
/** While playing, SDK answers move at most this often (each answer re-renders every panel). */
const ANSWER_MS = 125;
/**
 * `world`: the playhead, a continuous world time (the clock and the scrub thumb); `cursor`: the events applied, exactly
 * those at or before it (stepping lands `world` on an event's time). `scrubbing`: a drag of the track is in progress.
 */
export type ReplayView = { cursor: number; world: number; playing: boolean; scrubbing: boolean; speed: number; pov: number; state: ReplayState; version: number };

export class ReplayController {
  readonly end: number;
  readonly moments: KeyMoment[];
  readonly series: ReturnType<typeof scoreSeries>;
  private view: ReplayView;
  /** The view as of its last change other than the clock's per-frame `world` (for parts that need not redraw every frame). */
  private coarse: ReplayView;
  private listeners = new Set<() => void>();
  private answerListeners = new Set<() => void>();
  private answerKey = "";
  /** The position the SDK's answers are at (it trails the playhead by at most ANSWER_MS while playing). */
  private published: { cursor: number; pov: number; state: ReplayState };
  private answerTimer: ReturnType<typeof setTimeout> | undefined;
  private answerAt = 0;
  private frame = 0;
  private last = 0;
  private answers = new Map<string, unknown>();
  /** Objects changed by recent forward moves of the playhead (the last CHANGE_MS): version reached, value before (board animation). */
  changed: ReadonlyMap<string, Changed> = new Map();

  readonly replay: Replay;
  readonly room: { roomId: string; roomShortCode?: string };

  constructor(replay: Replay, room: { roomId: string; roomShortCode?: string }, start: { cursor: number; world?: number; speed?: number; pov?: number }) {
    this.replay = replay;
    this.room = room;
    this.end = replay.log.length;
    this.moments = keyMoments(replay);
    this.series = scoreSeries(replay);
    const world = start.world !== undefined ? this.clampWorld(start.world) : undefined;
    const cursor = world !== undefined ? cursorAtWorld(replay, world) : Math.max(0, Math.min(this.end, start.cursor));
    const state = stateAt(replay, cursor);
    this.view = { cursor, world: world ?? this.worldOf(cursor), playing: false, scrubbing: false, speed: start.speed ?? DEFAULT_SPEED,
      pov: start.pov ?? Math.max(0, replay.viewer.index), state, version: 0 };
    this.coarse = this.view;
    this.published = { cursor, pov: this.view.pov, state };
    this.answerKey = `${cursor}|${this.view.pov}`;
  }

  // ----- store -----
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  get = () => this.view;
  getCoarse = () => this.coarse;
  private set(patch: Partial<ReplayView>) {
    this.view = { ...this.view, ...patch, version: this.view.version + 1 };
    if (Object.keys(patch).some(k => k !== "world")) this.coarse = this.view;
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
    if (!this.view.playing && !this.view.scrubbing) { clearTimeout(this.answerTimer); publish(); }
    else if (!this.answerTimer) this.answerTimer = setTimeout(publish, Math.max(0, this.answerAt + ANSWER_MS - performance.now()));
  }

  // ----- the playhead -----
  /** The game's last moment: its end, or its last event if that is later (buildReplay). */
  get endWorld() { return this.replay.endWorld; }
  private clampWorld(world: number) { return Number.isNaN(world) ? 0 : Math.max(0, Math.min(this.endWorld, world)); }
  /** The time of the last event applied at `cursor` (the start for none). */
  private worldOf(cursor: number) { return cursor > 0 ? this.replay.worldMax[cursor - 1] : 0; }

  /** Move to an exact event (stepping, key moments, the event list): the playhead lands on that event's time. */
  seek(cursor: number, opts: { keepPlaying?: boolean } = {}) {
    const c = Math.max(0, Math.min(this.end, Math.floor(cursor)));
    // Already there (a step forward at the end, a click on the current event): the playhead keeps its time.
    if (c === this.view.cursor) { if (!opts.keepPlaying && this.view.playing) this.stop(); return; }
    this.moveTo(c, this.worldOf(c), opts);
  }
  /** Move to a world time: exactly the events at or before it are applied. */
  seekWorld(world: number, opts: { keepPlaying?: boolean } = {}) {
    const w = this.clampWorld(world);
    this.moveTo(cursorAtWorld(this.replay, w), w, opts);
  }
  private moveTo(c: number, world: number, { keepPlaying = false }: { keepPlaying?: boolean }) {
    if (!keepPlaying && this.view.playing) this.stop();
    if (c === this.view.cursor) { if (world !== this.view.world) this.set({ world }); return; }
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
    this.set({ cursor: c, world, state: stateAt(this.replay, c) });
  }
  step(dir: 1 | -1) { this.seek(this.view.cursor + dir); }
  jump(dir: 1 | -1) {
    const c = this.view.cursor;
    const target = dir > 0 ? this.moments.find(m => m.cursor > c) : [...this.moments].reverse().find(m => m.cursor < c);
    this.seek(target ? target.cursor : dir > 0 ? this.end : 0);
  }
  setSpeed(speed: number) { if ((SPEEDS as readonly number[]).includes(speed)) this.set({ speed }); }
  setPov(pov: number) { if (pov >= 0 && pov < this.replay.game.roster.length && pov !== this.view.pov) this.set({ pov }); }

  /** A drag of the scrub track: the thumb and the clock follow every move; the panels' answers at most every 125 ms. */
  beginScrub() { if (this.view.playing) this.stop(); if (!this.view.scrubbing) this.set({ scrubbing: true }); }
  endScrub() {
    if (!this.view.scrubbing) return;
    // A throttled publish may be pending: drop it; set() then publishes at once if the answers are not at the playhead.
    clearTimeout(this.answerTimer);
    this.answerTimer = undefined;
    this.set({ scrubbing: false });
  }

  // ----- playback: the playhead advances `speed` world seconds per second of real time; each event applies as it is crossed -----
  toggle() { if (this.view.playing) this.stop(); else this.play(); }
  play() {
    if (this.view.playing) return;
    if (this.view.world >= this.endWorld && this.view.cursor >= this.end) this.seekWorld(0);
    this.set({ playing: true, scrubbing: false });
    this.last = performance.now();
    const tick = () => {
      if (!this.view.playing) return;
      // Measured here: a frame's timestamp can precede a performance.now() taken before it was requested.
      const now = performance.now();
      this.advance(Math.max(0, now - this.last));
      this.last = now;
      if (this.view.playing) this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }
  /** Moves a playing clock on by `ms` of real time (one animation frame's worth; tests call it directly). */
  advance(ms: number) {
    if (!this.view.playing) return;
    const world = this.clampWorld(this.view.world + ms / 1000 * this.view.speed);
    this.seekWorld(world, { keepPlaying: true });
    if (world >= this.endWorld) this.stop();
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
      : name === "player.trajectories" ? replayTrajectories(this.replay, at, typeof args.afterSeq === "number" ? args.afterSeq : -1, typeof args.upTo === "number" ? args.upTo : undefined)
      : name === "player.objectsPage" ? replayObjectsPage(this.replay, at, p.state, args)
      : name === "player.myUtility" ? replayMyUtility(this.replay, p.pov)
      : undefined;
    this.answers.set(key, value);
    return value;
  }
  refusal = "This is a replay of an ended game: nothing can be done in it. Go back to the room to play.";
}

/** player.objectsPage at the playhead: the replay's objects (exact, a replay is of an ended game) paged like the engine pages them. */
function replayObjectsPage(replay: Replay, at: Parameters<typeof replayObservation>[1], state: ReplayState, args: Record<string, unknown>) {
  const objects = replayObservation(replay, at, state).objects;
  return pageObjects(objects, {
    sort: args.sort as ObjectSort | undefined, filter: args.filter as ObjectFilter | undefined,
    after: (args.after as ObjectCursor | null | undefined) ?? null, limit: typeof args.limit === "number" ? args.limit : undefined,
  });
}

/** The controller as the SDK's replay source: answers move with the playhead and the point of view only. */
export function replaySource(c: ReplayController): ReplaySource {
  return { serves: name => c.serves(name), answer: (name, args) => c.answer(name, args), subscribe: c.subscribeAnswers, refusal: c.refusal };
}

/** The controller's view, re-rendered on every change (every frame while playing or dragging: the clock, the thumb). */
export function useReplay(controller: ReplayController): ReplayView {
  return useSyncExternalStore(controller.subscribe, controller.get);
}

/** The view, re-rendered when anything but the clock's continuous `world` changes (the event list, the agent's code). */
export function useReplayCoarse(controller: ReplayController): ReplayView {
  return useSyncExternalStore(controller.subscribe, controller.getCoarse);
}
