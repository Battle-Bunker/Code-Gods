/**
 * Discovers src/panels/*.tsx (top level only; src/panels/examples/ is a library to copy from).
 *
 * The glob is lazy, so a panel that fails to compile fails only its own import(), inside its own frame.
 * Vite re-executes this module whenever a panel file is added, removed or edited (a panel module is not
 * an HMR boundary itself), and this module accepts its own update, so the update stops here: the core
 * UI never reloads and the Convex connection is untouched. Re-imports of unchanged panels resolve to
 * the same module, so only the edited panel remounts.
 */
import { panelStore, type PanelEntry } from "./panel-store";
import { SAFE_MODE } from "./safe-mode";

const modules = import.meta.glob("../panels/*.tsx");

const entries: PanelEntry[] = Object.entries(modules)
  .map(([path, load]) => {
    const file = path.slice("../panels/".length);
    return { file, id: file.replace(/\.tsx$/, ""), origin: "file" as const, load };
  })
  .sort((a, b) => a.file.localeCompare(b.file));

// Safe mode (?panels=off) loads only the core console.
panelStore.publish(SAFE_MODE ? [] : entries);

// Literal `import.meta.hot.accept()`: Vite detects self-acceptance lexically.
if (import.meta.hot) {
  import.meta.hot.accept();
  const hot = import.meta.hot;
  if (!hot.data.wired) {
    hot.data.wired = true;
    const panelFile = (path: string | undefined) => path?.match(/\/src\/panels\/([^/?]+\.tsx)/)?.[1];
    // A compile error in a panel: show it in that panel's frame instead of Vite's full-page overlay.
    hot.on("vite:error", payload => {
      const err = payload.err as { id?: string; loc?: { file?: string }; message?: string };
      const file = panelFile(err.id) ?? panelFile(err.loc?.file);
      if (file) panelStore.buildError(file, err.message ?? "This panel failed to compile");
    });
    // A panel that is a plain component module accepts its own update (Fast Refresh) and never re-runs
    // this registry; republish so its frame re-checks a cleared compile error.
    hot.on("vite:afterUpdate", () => panelStore.publish(panelStore.get().entries));
  }
}
