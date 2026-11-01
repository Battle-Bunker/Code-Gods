export * from "./types.ts";
export {
  FAMILIES, family, familiesFor, context, applicable, available, canonicalSupport, paramsKey, publicCatalog, readDescriptor, card,
  compareOrdinals, assertOrdinal, evaluator, ordinal, entryPoint, type CatalogEntry, type Draw,
} from "./catalog.ts";
export {
  SELECTORS, selector, divineLottery, fairAligned, registerSynergy, synergyFor, availableFamilies,
  type UtilitySelector, type SelectOptions, type SynergyMatrix,
} from "./selectors.ts";
export { cardProgram } from "./families/card.ts";
export { GRID_FAMILIES, GRID_LENSES } from "./families/grid/index.ts";
export { INT_FAMILIES } from "./families/int.ts";
export { STRING_FAMILIES } from "./families/string.ts";
export type {
  Annotation, AnnotationKind, AnnotationTone, AnnotatedCell, AnnotatedSpan, BadgeAnnotation, CellsAnnotation, DigitsAnnotation,
  RegionAnnotation, SpansAnnotation,
} from "./annotations.ts";
export { ANNOTATORS, annotatorFor, type Annotator, type FamilyId } from "./families/annotators.ts";
export {
  ANALYTIC_MAX_ERROR_BITS, assertAnalytic, assertAnalyticHeader, lazySurvival, addMass, binomial, cmpOrdinals, combine, distOf, exactSurvival, iidSum, lineChainCount,
  logFactorial, mapDist, maxOfEqualMultinomial, multinomial, pairOrdinal, pointMass, poissonTail, rowTransferCount, sumOrdinals,
  survivalLevels, totalMass, type AnalyticLevels, type AnalyticSurvival, type Dist,
} from "./analytic.ts";
export {
  compareWithEnumeration, compareWithSpawns, compareWithTable, assertAnalyticAgainstSpawns, comparisonMarkdown, bandSummaryMarkdown,
  nominalSe, DEPTH_BANDS, type TableComparison, type SpawnComparison, type EnumerationComparison,
} from "./analytic-verify.ts";
export {
  tableFor, hasTable, instanceTables, analyticFor, tableKey, tableKeyParts, keyFromParts, manifestEntry, manifestOf, coverage, instantiateKey, surprisal, penaltyMeanBits,
  offeredInstantiations, playableInstantiations, isPlayableInstantiation, firstUseSeconds, FIRST_USE_SECONDS, shippedPriors, UNIFORM_PRIOR, CALIBRATION_FORMAT, priorKey, canonicalJson,
  type CalibrationFile, type CalibrationManifest, type CalibrationTable, type InstanceTables, type PriorRef,
} from "./calibration.ts";
export {
  candidatesFor, candidateColumn, fitMixture, logPriors, nnls, SIGMA_FLOOR_BITS,
  type Candidate, type DrawClass, type FitInput, type FitResult, type Hint, type Hypothesis, type Role,
} from "./inference.ts";
