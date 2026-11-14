/** `object.*`: priced reads of an object (free for a human; `bits` is what an agent pays), quotes and scores. W3-4. */
import { defineOp, notYet } from "./define";

export const { op: read, as: readAs } = defineOp("object.read", "query", () => notYet("W3-4"));
export const { op: element, as: elementAs } = defineOp("object.element", "query", () => notYet("W3-4"));
export const { op: quote, as: quoteAs } = defineOp("object.quote", "query", () => notYet("W3-4"));
export const { op: score, as: scoreAs } = defineOp("object.score", "query", () => notYet("W3-4"));
