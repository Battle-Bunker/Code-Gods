/** Shipped Grid data (generated offline by lib/grid-lab/gridlab/export.py; see src/grid/data/). */
import { gridTypeKey, type GridTypeArgs } from "@workspace/game-core";
import { GRID_DATA_INDEX, GRID_DATA_TEXT } from "./data/index.ts";
import type { SurvivalTable } from "./calibration.ts";

export interface GridFamilyInfo {
  id: string;
  name: string;
  emoji: string;
  /** Public, parameter-free description. */
  theme: string;
  camp: string;
  layers: string[];
  requires: string;
  /** True for families that also carry a defence goal (a penalty). */
  defence: boolean;
}

export interface GridDrawInfo {
  family: string;
  /** Grid Lab params, tuples as arrays. */
  params: Record<string, unknown>;
  table: string;
  penaltyTable: string | null;
  /** Private: plain-language incentive. */
  summary: string;
  /** Private: the kid-readable Python utility function. */
  card: string;
  penalty: { family: string; name: string; summary: string; comparative: string } | null;
}

export interface GridData {
  format: string;
  version: number;
  estimator: number;
  gridType: GridTypeArgs & { key: string };
  families: GridFamilyInfo[];
  draws: GridDrawInfo[];
  tables: Record<string, SurvivalTable>;
}

export const GRID_DATA_VERSION = GRID_DATA_INDEX.version;

/** GridTypes that have calibration tables: the only ones a room may select. */
export const SHIPPED_GRID_TYPES: readonly (GridTypeArgs & { key: string })[] = Object.freeze(
  GRID_DATA_INDEX.gridTypes.map(t => Object.freeze({
    size: t.size, symbols: t.symbols as GridTypeArgs["symbols"], colours: t.colours as GridTypeArgs["colours"], key: t.key,
  })));

export function hasGridData(args: GridTypeArgs): boolean {
  return gridTypeKey(args) in GRID_DATA_TEXT;
}

/** Canonical JSON (sorted keys, no spaces), matching Grid Lab's `canonical_json` for plain data. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export interface LoadedGridData extends GridData {
  family(id: string): GridFamilyInfo | undefined;
  /** The dealable draw with exactly these params, if any. */
  draw(familyId: string, params: unknown): GridDrawInfo | undefined;
  drawsOf(familyId: string): readonly GridDrawInfo[];
}

const loaded = new Map<string, LoadedGridData>();

export function gridData(args: GridTypeArgs): LoadedGridData {
  const key = gridTypeKey(args);
  const hit = loaded.get(key);
  if (hit) return hit;
  const text = GRID_DATA_TEXT[key];
  if (text === undefined) throw new Error(`No calibration tables for ${key}`);
  const data = JSON.parse(text) as GridData;
  if (data.version !== GRID_DATA_VERSION) throw new Error(`Grid data version mismatch for ${key}`);
  const families = new Map(data.families.map(f => [f.id, f]));
  const draws = new Map(data.draws.map(d => [`${d.family}|${canonicalJson(d.params)}`, d]));
  const byFamily = new Map<string, GridDrawInfo[]>();
  for (const d of data.draws) {
    if (!byFamily.has(d.family)) byFamily.set(d.family, []);
    byFamily.get(d.family)!.push(d);
  }
  const out: LoadedGridData = Object.freeze({
    ...data,
    family: (id: string) => families.get(id),
    draw: (familyId: string, params: unknown) => draws.get(`${familyId}|${canonicalJson(params)}`),
    drawsOf: (familyId: string) => byFamily.get(familyId) ?? [],
  });
  loaded.set(key, out);
  return out;
}
