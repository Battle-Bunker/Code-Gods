/**
 * TODO(WP2, docs/ui-redesign.md §2.3): the region dock and its per-human layout sync are replaced by the dock layout
 * tree (`layout.current` / `layout.set`, lib/player-client/src/layout.ts). `panels.layout` and `panels.setLayout` no
 * longer exist, so this hook is a no-op until the new dock lands; this browser's layout stays in localStorage.
 */
export function useLayoutSync(_enabled: boolean, _canWrite: boolean) {}
