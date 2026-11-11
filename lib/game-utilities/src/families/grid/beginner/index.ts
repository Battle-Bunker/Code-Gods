/** The beginner pool (4×4 digits, one colour): rules equally simple to understand and to write an algorithm for (small scoring units, one-cell greedy never stuck). */
import { oppositeNines } from "./opposite_nines.ts";
import { stepStool } from "./step_stool.ts";
import { strangers } from "./strangers.ts";

export const BEGINNER = [oppositeNines, stepStool, strangers];
