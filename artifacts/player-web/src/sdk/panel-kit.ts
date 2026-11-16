/**
 * What both copies of the panel SDK share (`@sdk` version 2): definePanel, the rule and representation helpers, the
 * data types, and the app's pure drawing and working-out helpers. A stored panel gets them in its frame
 * (src/frame/sdk.ts, with its hooks answered over the bridge); a file panel gets them in the page
 * (src/panels/sdk.ts, with the app's own hooks). Nothing here reads or sends anything.
 */
export { definePanel, PANEL_SDK, type PanelDefinition, type PanelManifest } from "./panel";
export { useGameScope, type GameScope } from "./game";
export { decodeState, familyOf, ruleRefOf, valueOf, variantOf, type GameRule } from "./rule";
export { defaultRepOf, objectTypeOf, objectWord } from "./object-types";
export type * from "./types";
export type { MyRule } from "./hooks";
// Drawing and working out, as the app's own panes do (pure: nothing here reads or sends anything).
export { LineChart, CareScatter, slotColour } from "../components/charts";
export { raceSeries, careKind, carePoints, CARE_KINDS, type Series, type CarePoint, type CareKind } from "../panes/chart-model";
export { standing, whatIf, mutatorChoices, wireArgs, formError, type Standing, type WhatIf, type MutatorChoice } from "../panes/what-if-model";
export { fmtBits, fmtNum, pointsText } from "@workspace/v2-views/format";
