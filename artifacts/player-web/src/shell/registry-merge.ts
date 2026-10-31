/**
 * One registry from two sources: file panels (src/panels/*.tsx, discovered by registry.ts) and stored panels
 * (panels.list). A stored panel becomes the entry "stored:<slug>"; when a file panel has the same id, the file
 * wins (it is the one being edited with HMR) and records the stored version it shadows. Disabled stored panels
 * are left out. Unchanged entries keep their identity, so their frames do not remount.
 */
import type { PanelEntry, StoredPanelMeta } from "./panel-store.ts";

export type { StoredPanelMeta };

const sameMeta = (a: StoredPanelMeta | undefined, b: StoredPanelMeta) => !!a && a.slug === b.slug && a.currentVersion === b.currentVersion &&
  a.title === b.title && a.placement === b.placement && a.size === b.size && a.lastForeignVersion === b.lastForeignVersion;

export function mergePanels(files: readonly PanelEntry[], stored: readonly StoredPanelMeta[], previous: readonly PanelEntry[] = []): PanelEntry[] {
  const before = new Map(previous.map(e => [e.file, e]));
  const live = stored.filter(p => p.enabled);
  const byId = new Map(live.map(p => [p.slug, p]));
  const fileIds = new Set(files.map(f => f.id));
  const fromFiles = files.map(file => {
    const shadows = byId.get(file.id)?.currentVersion;
    if (shadows === undefined) return file;
    const old = before.get(file.file);
    return old && old.load === file.load && old.shadows === shadows ? old : { ...file, shadows };
  });
  const fromStore = live.filter(p => !fileIds.has(p.slug)).sort((a, b) => a.slug.localeCompare(b.slug)).map((meta): PanelEntry => {
    const file = `stored:${meta.slug}`;
    const old = before.get(file);
    return old && sameMeta(old.stored, meta) ? old : { file, id: meta.slug, origin: "stored", version: meta.currentVersion, stored: meta };
  });
  return [...fromFiles, ...fromStore];
}
