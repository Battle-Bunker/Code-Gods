/** 🎩 Magic Eighteen: Magic Accountant's lens (one unit per line of the dealt axis) against the fixed middle total, 18 on 4×4 digits. */
import { eighteenTarget } from "../../families/grid/beginner/magic_eighteen.ts";
import { magicLines } from "./magic-accountant.ts";

export const magicEighteen = magicLines<{ axis: "rows" | "cols" }>("magic_eighteen", (_p, b) => eighteenTarget(b.spec));
