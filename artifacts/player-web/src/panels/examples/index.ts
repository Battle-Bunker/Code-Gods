/**
 * The example panels (v1's src/panels/examples, ported to the v2 `@sdk`): each a real module, typechecked against the
 * frame's SDK (tsconfig maps "@sdk" to src/frame/sdk.ts), offered as source in "Your panels" to start from.
 */
import { examplesFrom, type ExamplePanel } from "@/panes/my-panels-model";

const files = import.meta.glob("./*.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
export const EXAMPLE_PANELS: readonly ExamplePanel[] = examplesFrom(files);
