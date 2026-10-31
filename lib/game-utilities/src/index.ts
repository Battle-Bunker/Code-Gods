export * from "./types.ts";
export {
  FAMILIES, family, familiesFor, context, available, canonicalSupport, paramsKey, publicCatalog, readDescriptor, card,
  compareOrdinals, assertOrdinal, evaluator, ordinal, entryPoint, type CatalogEntry, type Draw,
} from "./catalog.ts";
export {
  SELECTORS, selector, divineLottery, fairAligned, registerSynergy, synergyFor, availableFamilies,
  type UtilitySelector, type SelectOptions, type SynergyMatrix,
} from "./selectors.ts";
export { GRID_FAMILIES, GRID_LENSES } from "./families/grid/index.ts";
export { INT_FAMILIES } from "./families/int.ts";
export { STRING_FAMILIES } from "./families/string.ts";
export type {
  Annotation, AnnotationKind, AnnotationTone, AnnotatedCell, AnnotatedSpan, BadgeAnnotation, CellsAnnotation, DigitsAnnotation,
  RegionAnnotation, SpansAnnotation,
} from "./annotations.ts";
export { ANNOTATORS, annotatorFor, type Annotator, type FamilyId } from "./families/annotators.ts";
export {
  tableFor, hasTable, instanceTables, manifestEntry, manifestOf, coverage, instantiateKey, surprisal, penaltyMeanBits,
  offeredInstantiations, shippedPriors, UNIFORM_PRIOR, CALIBRATION_FORMAT, priorKey, canonicalJson,
  type CalibrationFile, type CalibrationManifest, type CalibrationTable, type InstanceTables, type PriorRef,
} from "./calibration.ts";
