/**
 * The reference mixture an agent is measured on (open-agents.md §3.2; agentlang/pricing.py
 * reference_grids), generic over object types:
 *
 *   uniform     n_uniform spawns from the prior μ (the type's `spawn`)
 *   structured  n_structured spawns after 1–3 cheap random mutator calls (each call's naming cost
 *               log2 #available + D + M ≤ structMaxBits, up to 50 draws; a call that cannot apply is
 *               skipped): code-reachable states such as painted lines and sorted rows
 *   extra       optional components the server passes in, e.g. "game" (live objects of recent games)
 *               and "self" (states on the agent's own re-application trajectories)
 *
 * Every draw is seeded from the SECRET season salt: deriveSeed(salt, ["reference", inst.key,
 * component]). Measurement and play must be indistinguishable to the agent, so the salt (and with it
 * the grids) stay secret during a season, committed by hash and revealed afterwards for audit.
 *
 * Grid Lab draws its structured grids with random gridlab Programs (≤ 2 steps, guards with
 * probability 0.3); here the cheap calls are plain uniform mutator calls. The published Grid Lab
 * fixture can be loaded with mixtureFromHexFixture to check prices end to end.
 */
import { decisionBits } from "../mutators.ts";
import { availableOf } from "../prelude.ts";
import { objectType } from "../registry.ts";
import type { Codec, Instantiation, ObjectTypeDef, ObjectValue } from "../types.ts";
import { seededRng } from "../util.ts";
import { encodeGrid, type GridTypeArgs } from "../grid/codec.ts";
import { deriveSeed } from "./rng.ts";

export interface ReferenceMixture {
  readonly instKey: string;
  /** Wire values, in measurement order (their index is the seed's grid index). */
  readonly values: readonly ObjectValue[];
  /** Component of each value ("uniform", "structured", "game", "self", ...). */
  readonly components: readonly string[];
}

export interface MixtureOptions {
  readonly nUniform?: number;
  readonly nStructured?: number;
  /** Most naming bits one structuring call may cost (log2 #available + D + M). */
  readonly structMaxBits?: number;
  /** Most calls per structured value (at least 1). */
  readonly maxStructuredCalls?: number;
  /** Extra components, appended in insertion order (e.g. { game: [...], self: [...] }). */
  readonly extra?: Readonly<Record<string, readonly ObjectValue[]>>;
}

export const MIXTURE_DEFAULTS = Object.freeze({ nUniform: 128, nStructured: 64, structMaxBits: 40, maxStructuredCalls: 3 });

/** The reference mixture of one instantiation, from the season salt. Deterministic given the salt. */
export function referenceMixture(inst: Instantiation, salt: string | Uint8Array, opts: MixtureOptions = {}): ReferenceMixture {
  const typeDef = objectType(inst.objectType) as ObjectTypeDef<unknown>;
  const o = { ...MIXTURE_DEFAULTS, ...opts };
  const codec: Codec<unknown> = typeDef.codec(inst);
  const values: ObjectValue[] = [], components: string[] = [];

  const ru = seededRng(deriveSeed(salt, ["reference", inst.key, "uniform"]));
  for (let i = 0; i < o.nUniform; i++) {
    values.push(codec.encode(typeDef.spawn(inst, ru)));
    components.push("uniform");
  }

  const avail = availableOf(typeDef.mutators, inst);
  const rs = seededRng(deriveSeed(salt, ["reference", inst.key, "structured"]));
  for (let i = 0; i < o.nStructured; i++) {
    let x = typeDef.spawn(inst, rs);
    if (avail.length) {
      const calls = 1 + rs.int(Math.max(1, o.maxStructuredCalls));
      for (let c = 0; c < calls; c++) {
        let m = avail[0], p: unknown;
        for (let t = 0; t < 50; t++) {
          m = avail[rs.int(avail.length)];
          p = m.sample(rs, inst);
          if (decisionBits(m, p, inst, avail.length) <= o.structMaxBits) break;
        }
        const y = m.apply(x, p, inst);
        if (y !== null) x = y;
      }
    }
    values.push(codec.encode(x));
    components.push("structured");
  }

  for (const [name, xs] of Object.entries(o.extra ?? {})) {
    for (const x of xs) {
      codec.assert(x);
      values.push(x);
      components.push(name);
    }
  }
  return Object.freeze({ instKey: inst.key, values: Object.freeze(values), components: Object.freeze(components) });
}

/** Append components (e.g. live "game" objects or the agent's own "self" states) to a mixture. */
export function withComponents(mix: ReferenceMixture, extra: Readonly<Record<string, readonly ObjectValue[]>>): ReferenceMixture {
  const values = [...mix.values], components = [...mix.components];
  for (const [name, xs] of Object.entries(extra)) for (const x of xs) { values.push(x); components.push(name); }
  return Object.freeze({ instKey: mix.instKey, values: Object.freeze(values), components: Object.freeze(components) });
}

/** One Grid Lab fixture grid, "sym-hex:col-hex" (row-major uint8), as our wire string. */
export function gridFromHex(text: string, inst: Instantiation): string {
  const [sym, col] = text.split(":");
  const bytes = (h: string) => Uint8Array.from(h.match(/../g) ?? [], b => parseInt(b, 16));
  const t = inst.args as unknown as GridTypeArgs;
  return encodeGrid({ size: t.size, sym: bytes(sym), col: bytes(col) }, t);
}

/**
 * A mixture from Grid Lab's published fixture (reference_grids_<key>.json: { gtype, uniform,
 * structured, game, probes }), components in that order; probes are left out (ratchet only).
 */
export function mixtureFromHexFixture(fixture: Readonly<Record<string, unknown>>, inst: Instantiation,
  components: readonly string[] = ["uniform", "structured", "game"]): ReferenceMixture {
  const values: string[] = [], comps: string[] = [];
  for (const c of components) {
    for (const g of (fixture[c] as readonly string[] | undefined) ?? []) {
      values.push(gridFromHex(g, inst));
      comps.push(c);
    }
  }
  return Object.freeze({ instKey: inst.key, values: Object.freeze(values), components: Object.freeze(comps) });
}
