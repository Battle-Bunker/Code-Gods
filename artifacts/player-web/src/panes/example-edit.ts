/** v1's ✏️ Edit for the goal card's example: a line from its gradient and intercept, any other object from its written form. Pure. */
import { Qn, type ObjectType, type Variant } from "@workspace/v2-core";
import { fromMC, type LineState } from "@workspace/v2-linear";

const num = (t: string) => t.trim().replace(/[−–]/g, "-");

/** y = m·x + c, or null when either is not a number ("3", "−2", "1/2", "0.5"). */
export function lineFromInputs(m: string, c: string): LineState | null {
  try { return { lines: [fromMC(Qn.parse(num(m)), Qn.parse(num(c)))] }; } catch { return null; }
}

/** The state written as the type writes it ("1234/0000/0000/0000" for a grid), or null when it is not one. */
export function stateFromWire<S>(type: ObjectType<S>, variant: Variant, text: string): S | null {
  try {
    const t = text.trim();
    // A grid keeps the board's shape (rows and their lengths); the decoder alone takes any size.
    if (type.id === "grid" && t.replace(/\d/g, "0") !== type.encode(type.origin(variant)).replace(/\d/g, "0")) return null;
    const s = type.decode(t);
    return type.encode(s) === t ? s : null;
  } catch { return null; }
}
