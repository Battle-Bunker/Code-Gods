/** The beginner pool's families: fixed small scoring units, a move's gain depends on few cells (one file per family). */
import { spreadThree } from "./spread_three.ts";
import { twoPair } from "./two_pair.ts";

export const BEGINNER = [twoPair, spreadThree];
