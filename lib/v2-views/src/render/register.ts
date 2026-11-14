/** The built-in renderers. An object type with another scene kind calls registerRenderer for it. */
import { registerRenderer } from "../scene.ts";
import { equationRenderer } from "./equation.tsx";
import { machineRenderer } from "./machine.tsx";
import { planeRenderer } from "./plane.tsx";
import { sequenceRenderer } from "./sequence.tsx";
import { tableRenderer } from "./table.tsx";

registerRenderer(equationRenderer);
registerRenderer(planeRenderer);
registerRenderer(sequenceRenderer);
registerRenderer(machineRenderer);
registerRenderer(tableRenderer);

export { equationRenderer, machineRenderer, planeRenderer, sequenceRenderer, tableRenderer };
