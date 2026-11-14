/** The built-in renderers. An object type with another scene kind calls registerRenderer for it. */
import { registerRenderer } from "../scene.ts";
import { equationRenderer } from "./equation.tsx";
import { gridRenderer } from "./grid.tsx";
import { machineRenderer } from "./machine.tsx";
import { planeRenderer } from "./plane.tsx";
import { sequenceRenderer } from "./sequence.tsx";
import { tableRenderer } from "./table.tsx";

registerRenderer(equationRenderer);
registerRenderer(planeRenderer);
registerRenderer(sequenceRenderer);
registerRenderer(machineRenderer);
registerRenderer(tableRenderer);
registerRenderer(gridRenderer);

export { equationRenderer, gridRenderer, machineRenderer, planeRenderer, sequenceRenderer, tableRenderer };
