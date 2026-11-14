import { Qn, q, type Q } from "@workspace/v2-core";
import { fromMC, normalise, type Line, type LineState } from "../src/line.ts";

/** y = mx + c, as a one-line state. */
export const mc = (m: number | Q, c: number | Q): LineState => ({ lines: [fromMC(typeof m === "number" ? q(m) : m, typeof c === "number" ? q(c) : c)] });
/** ax + by + c = 0, as a one-line state. */
export const abc = (a: number, b: number, c: number): LineState => ({ lines: [normalise(BigInt(a), BigInt(b), BigInt(c)) as Line] });
export const W = Qn.toWire;
