/**
 * Discovers src/panels/*.tsx (top level only; src/panels/examples/ is a library to copy from), v1's file panels.
 *
 * The glob is lazy, so a panel that fails to compile fails only its own import(), inside its own pane. Vite
 * re-executes this module whenever a panel file is added, removed or edited (a panel module is not an HMR boundary
 * itself), and this module accepts its own update, so the update stops here: the rest of the app never reloads and
 * the Convex connection is untouched. Re-imports of unchanged panels resolve to the same module, so only the edited
 * panel remounts. Safe mode (?panels=off) loads none.
 */
import { SAFE_MODE } from "@/core/safe-mode";
import { filePanelStore, type FilePanelEntry } from "./store";

const modules = import.meta.glob("./*.tsx");

const entries: FilePanelEntry[] = Object.entries(modules)
  .map(([path, load]) => {
    const file = path.slice("./".length);
    return { file, id: file.replace(/\.tsx$/, ""), load };
  })
  .sort((a, b) => a.file.localeCompare(b.file));

filePanelStore.publish(SAFE_MODE ? [] : entries);

// Literal `import.meta.hot.accept()`: Vite detects self-acceptance lexically.
if (import.meta.hot) {
  import.meta.hot.accept();
  // Registered on every run: Vite drops a module's listeners when it re-executes it.
  const panelFile = (path: string | undefined) => path?.match(/\/src\/panels\/([^/?]+\.tsx)/)?.[1];
  // A compile error in a panel: shown in that panel's pane instead of Vite's full-page overlay.
  import.meta.hot.on("vite:error", payload => {
    const err = payload.err as { id?: string; loc?: { file?: string }; message?: string };
    const file = panelFile(err.id) ?? panelFile(err.loc?.file);
    if (file) filePanelStore.buildError(file, err.message ?? "This panel failed to compile");
  });
  // An edited panel may take its update itself (Fast Refresh), and then a version that does not compile fails inside
  // Vite's client, unseen: note each panel file's update so its pane imports exactly that version and shows the error.
  import.meta.hot.on("vite:beforeUpdate", payload => {
    for (const u of payload.updates) { const file = panelFile(u.path) ?? panelFile(u.acceptedPath); if (file) filePanelStore.updated(file, u.timestamp); }
  });
}
