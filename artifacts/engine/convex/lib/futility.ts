/**
 * Futile acts (docs/rules-design.md "Futile acts"). An act that did not read `random` is a pure function of the agent's
 * source and the object's value (the runtime freezes the clock and reports whether the act drew from `random`), so when
 * such an act fails, the same agent on the same object version fails again, and identically. The tick remembers those
 * pairs and does not offer the agent that object again until a retry could differ:
 *
 * - any failure from the rules (no change, an invalid call, the commit clause): until the object's version changes;
 * - a collision (another object, or the object itself, already holds the value): until the object's version changes
 *   or the object holding the value changes version (it may have freed it).
 *
 * A runtime error is never remembered (a timeout is not reproducible), nor is any act that read `random`. A skipped
 * pair is never an opportunity: the agent is not charged and the opportunity goes to another pair (pickPair). Pure.
 */

/** One remembered futile pair of an agent: object `o` at version `v`; for a collision, the holder `by` at version `bv`. */
export type Futile = { o: string; v: number; by?: string; bv?: number };
export type ObjectRef = { id: string; version: number };
/**
 * How an act ended, as the failure breakdown (agents.failures) counts it; "transform" changed the object and "skip"
 * returned no calls (docs/energy-model.md §2: a choice, not a failure; never counted or remembered as futile).
 */
export type ActKind = "transform" | "skip" | FailureKind;
export type FailureKind = "collision" | "noChange" | "commit" | "invalid" | "error" | "unaffordable";
export const FAILURE_KINDS: readonly FailureKind[] = ["collision", "noChange", "commit", "invalid", "error", "unaffordable"];
/**
 * The engine's reason for a change the agent could not pay for (docs/energy-model.md §7.2): it would have left the
 * agent owing more than it can hold, so the change does not commit. The tick completes it with the numbers.
 */
export const UNAFFORDABLE = "could not afford this change";
export const unaffordableReason = (needed: number, had: number, credit: number): string =>
  `${UNAFFORDABLE}: it costs ${needed.toFixed(1)} bits, the agent had ${had.toFixed(1)} and may owe at most ${credit.toFixed(1)}`;
/** An agent's failure breakdown before its first counted act (agents.failures). */
export const NO_FAILURES: Readonly<Record<FailureKind, number>> = Object.freeze({ collision: 0, noChange: 0, commit: 0, invalid: 0, error: 0, unaffordable: 0 });

/** The engine's reason for a failed act (engine/tick.ts, applyCalls) as a breakdown kind; a runtime error is "error". */
export function failureKind(reason: string): Exclude<FailureKind, "error"> {
  if (reason === "another object already has this value") return "collision";
  if (reason === "no change") return "noChange";
  if (reason.startsWith("the commit clause kept")) return "commit";
  if (reason.startsWith(UNAFFORDABLE)) return "unaffordable";
  return "invalid";
}

/** The memo entry a finished act leaves, or null when a retry could turn out differently. */
export function futileAfter(act: { object: ObjectRef; deterministic: boolean; kind: ActKind; holder?: ObjectRef }): Futile | null {
  // "unaffordable" is never remembered: the same act commits once the agent holds more energy.
  if (!act.deterministic || act.kind === "transform" || act.kind === "skip" || act.kind === "error" || act.kind === "unaffordable") return null;
  if (act.kind === "collision") return act.holder ? { o: act.object.id, v: act.object.version, by: act.holder.id, bv: act.holder.version } : null;
  return { o: act.object.id, v: act.object.version };
}

/** Still futile: the object is at the remembered version and (a collision) the holder still at its own. */
const live = (e: Futile, version: number, versionOf: (id: string) => number | undefined) =>
  e.v === version && (e.by === undefined || versionOf(e.by) === e.bv);

/** The tick's memo of futile pairs, per agent and object; it reports the agents whose memo changed. */
export class FutileMemo {
  private byAgent = new Map<string, Map<string, Futile>>();
  private changed = new Set<string>();
  constructor(rows: readonly { agentId: string; entries: readonly Futile[] }[]) {
    for (const row of rows) this.byAgent.set(row.agentId, new Map(row.entries.map(e => [e.o, e])));
  }
  isFutile(agentId: string, object: ObjectRef, versionOf: (id: string) => number | undefined): boolean {
    const e = this.byAgent.get(agentId)?.get(object.id);
    return !!e && live(e, object.version, versionOf);
  }
  /** Remember (or, with null, forget) the agent's pair with object `objectId`. */
  record(agentId: string, objectId: string, entry: Futile | null) {
    let entries = this.byAgent.get(agentId);
    if (!entry) {
      if (entries?.delete(objectId)) this.changed.add(agentId);
      return;
    }
    if (!entries) this.byAgent.set(agentId, entries = new Map());
    // Most recent last: past the cap the oldest entry goes (it is only retried, never wrong).
    entries.delete(objectId);
    entries.set(objectId, entry);
    if (entries.size > MAX_FUTILE_PER_AGENT) entries.delete(entries.keys().next().value!);
    this.changed.add(agentId);
  }
  /** The memos to write: agents whose memo changed, without the entries that no longer hold. */
  changedRows(versionOf: (id: string) => number | undefined): { agentId: string; entries: Futile[] }[] {
    return [...this.changed].map(agentId => ({
      agentId,
      entries: [...(this.byAgent.get(agentId)?.values() ?? [])].filter(e => { const v = versionOf(e.o); return v !== undefined && live(e, v, versionOf); }),
    }));
  }
}

/**
 * One opportunity's pair: the object as the room picks it (`pick`), then an eligible agent drawn by `choose` (energy-weighted)
 * among those whose act on it is not futile. When every agent is futile on the picked object, the object is picked
 * again among the objects some agent is not futile on; null when there is none (the opportunity passes and nobody is
 * charged).
 */
export function pickPair<O extends { id: string }, A extends { id: string }>(
  objects: O[], agents: readonly A[], pick: (objects: O[]) => O, choose: (able: A[]) => A | undefined,
  futile: (agent: A, object: O) => boolean,
): { object: O; agent: A } | null {
  if (!objects.length || !agents.length) return null;
  const take = (object: O) => {
    const able = agents.filter(a => !futile(a, object));
    const agent = able.length ? choose(able) : undefined;
    return agent ? { object, agent } : null;
  };
  const first = take(pick(objects));
  if (first) return first;
  const workable = objects.filter(o => agents.some(a => !futile(a, o)));
  return workable.length ? take(pick(workable)) : null;
}

/** Remembered pairs per agent at most (about 50 KB stored); past it the oldest are forgotten, so only retried. */
export const MAX_FUTILE_PER_AGENT = 500;

/** Each failure kind as the owner reads it, and what to do about it. */
const FAILURE_TEXT: Record<FailureKind, { label: string; hint: (last?: string) => string }> = {
  collision: {
    label: "another object already has this value",
    hint: () => "Different objects end up with the same result, and only one object can hold a value: make the result depend on the object (change its own cells, shift or recolour what is there) instead of writing a fixed value.",
  },
  noChange: {
    label: "the act changed nothing",
    hint: () => "Applying it again changes nothing more: it acts once per object, then wastes acts. Make each act change something new about the object it is given.",
  },
  commit: {
    label: "the commit clause kept the object",
    hint: () => "The commit clause kept the objects because the change would not raise your points: drop commit() or change what the act does.",
  },
  invalid: {
    label: "an invalid call",
    hint: last => `Its calls are invalid${last ? ` (last: ${last})` : ""}: check the mutator signatures in the writing-agents skill.`,
  },
  unaffordable: {
    label: "it could not afford the change",
    hint: () => "Its changes cost more than it has and may owe (an agent may owe at most what its energy store holds): give it a bigger power share, or make each act change less.",
  },
  error: {
    label: "its code raised or ran out of time",
    hint: last => `Its code raises or runs out of time${last ? ` (last: ${last})` : ""}: fix the error or make it cheaper.`,
  },
};

const lastOf = (kind: FailureKind, last?: { invalid?: string; error?: string }) =>
  kind === "invalid" ? last?.invalid : kind === "error" ? last?.error : undefined;

/** At least this share of failed acts: the diagnosis suggests a fix. */
export const FAILING_SHARE = 0.5;

/**
 * The owner's diagnosis of an agent from its counted outcomes (agents.transforms, failures, lastFailures): "38 of 38
 * acts failed: another object already has this value" and, when most acts fail, why and how to fix it. Undefined
 * before any failure.
 */
export function diagnoseAgent(a: { transforms: number; failures: Partial<Record<FailureKind, number>>; lastFailures?: { invalid?: string; error?: string } }): { summary: string; hint?: string } | undefined {
  // A kind absent from the counts (agents counted before it existed) is 0.
  const n = (k: FailureKind) => a.failures[k] ?? 0;
  const kinds = FAILURE_KINDS.filter(k => n(k) > 0).sort((x, y) => n(y) - n(x));
  if (!kinds.length) return undefined;
  const failed = kinds.reduce((sum, k) => sum + n(k), 0), counted = failed + a.transforms;
  const why = kinds.length === 1 ? FAILURE_TEXT[kinds[0]].label : kinds.map(k => `${FAILURE_TEXT[k].label} ×${n(k)}`).join(", ");
  const summary = `${failed} of ${counted} acts failed: ${why}`;
  return failed / counted >= FAILING_SHARE ? { summary, hint: FAILURE_TEXT[kinds[0]].hint(lastOf(kinds[0], a.lastFailures)) } : { summary };
}
