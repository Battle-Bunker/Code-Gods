/**
 * The line rules every line preset deals (the coordinator's trial of 17 Nov, owner-decisions.md 42): eight from the
 * rule brainstorms (candidate-families.ts) and four kept (dynamic-families.ts). Archimedes with Hensel and Whole Stair
 * with Corner may be dealt the same D or n in one game: their parameter spaces overlap on purpose (the tension).
 */
import { archimedes, bearing, corner, goldenPath, hensel, longRun, ring, wholeStair } from "./candidate-families.ts";
import { primeBalance, recurrencePair, steppingCoefficients, unitFraction } from "./dynamic-families.ts";

export const dynamicFamilies = [bearing, goldenPath, ring, archimedes, hensel, wholeStair, corner, longRun, primeBalance, recurrencePair, unitFraction, steppingCoefficients] as const;
