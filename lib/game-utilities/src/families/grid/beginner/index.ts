/** The beginner pool (4×4 digits, one colour): rules equally simple to understand and to write an algorithm for (small scoring units, one-cell greedy never stuck). */
import { crosswiseThrees } from "./crosswise_threes.ts";
import { magicEighteen } from "./magic_eighteen.ts";
import { oppositeNines } from "./opposite_nines.ts";
import { spreadThree } from "./spread_three.ts";
import { leapfrog } from "./leapfrog.ts";
import { strangers } from "./strangers.ts";
import { twoPair } from "./two_pair.ts";

export const BEGINNER = [oppositeNines, leapfrog, twoPair, spreadThree, strangers, crosswiseThrees, magicEighteen];
