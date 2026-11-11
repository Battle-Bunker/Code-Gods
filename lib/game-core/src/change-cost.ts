/**
 * What a change costs, in words (docs/energy-model.md §4), for every text that explains it to a person or an AI: the
 * rules, the primer, the skills, the forge and the agents panel. One rule is true of every cost model: a move costs
 * the changes it makes, cell by cell, and the act pays W + β·W² on their sum W. The model (a room's
 * `settings.costModel`, the observation's `economy.costModel`; absent means "set-v1") only decides what one changed
 * cell costs (on an Int, one digit place or one multiplication; on a string, one character). The numbers come from the
 * type's own cost table (game-types `costTable`), never from a formula here.
 *
 * Int and string under "set-v1" keep the words they had before they had a second model (no price list, no hint).
 */
import { CHANGE_BETA, DEFAULT_COST_MODEL, changeCost, objectType, type CostModel } from "@workspace/game-types";
import { instantiationOf } from "./settings.ts";

export type { CostModel };

/** The object type a text is about: a room's settings, or the observation's instance (`{objectType, typeArgs: args}`). */
type Shape = Parameters<typeof instantiationOf>[0];

// `costModelOf` (a room's cost model from its settings, its economy or the value itself) is settings.ts's: one definition.

/** One kind of one-cell move with its work W (bits) and what an act that makes only that change pays (energy bits). */
export interface ChangePrice { readonly move: string; readonly work: number; readonly energy: number }

/** The shape's price list under a model; empty when the type has none or the shape is not valid. */
export function changePrices(shape: Shape, model: CostModel = DEFAULT_COST_MODEL): ChangePrice[] {
  try {
    const rows = objectType(shape.objectType).costTable?.(instantiationOf(shape), model) ?? [];
    return rows.map(r => ({ move: r.move, work: r.work, energy: changeCost(r.work) }));
  } catch { return []; }
}

const f1 = (x: number) => x.toFixed(1);

/**
 * The price list on one line, runs of "… by 1", "… by 2" folded together:
 * "move a cell's number by 1, 2, … 9: 7.1, 9.7, … 34.9 bits; change a cell's colour: 7.8 bits".
 */
export function changePriceList(shape: Shape, model: CostModel = DEFAULT_COST_MODEL): string {
  const groups: { head: string; steps: string[]; prices: string[] }[] = [];
  for (const p of changePrices(shape, model)) {
    const m = /^(.* by )(\d+)$/.exec(p.move), last = groups[groups.length - 1];
    if (m && last && last.head === m[1]) { last.steps.push(m[2]); last.prices.push(f1(p.energy)); }
    else groups.push(m ? { head: m[1], steps: [m[2]], prices: [f1(p.energy)] } : { head: p.move, steps: [], prices: [f1(p.energy)] });
  }
  return groups.map(g => `${g.head}${g.steps.join(", ")}: ${g.prices.join(", ")} bits`).join("; ");
}

/** The rule that is true of every model, for an AI. */
export const CHANGE_COST_RULE = `A change costs W + ${CHANGE_BETA}·W², where W adds up what the act's calls really changed, cell by cell (digit by digit on an Int, character by character on a string), whatever mutator made the change.`;

const NET_EFFECT = "Every mutator is priced by its net effect on each cell: write(cell, 7) on a 5 costs what add(cell, 2) costs, and rows, slides and swaps pay for each cell by how far its number moved.";
const FLAT = "A colour (or a card's suit) pays one flat price for changing.";

/** What one changed cell costs under each model, for an AI (no numbers: changePriceList has the room's). */
const MODEL_RULE: Readonly<Partial<Record<CostModel, string>>> = Object.freeze({
  "set-v1": "Every changed cell costs the same, however far its value moved: one price for a cell's symbol (its number or card) and one for its colour.",
  "distance-v1": `A number pays for how far it moved: adding 1 is the cheapest change and each further step costs 1.585 bits of W more. ${NET_EFFECT} A count_on that wraps 9 round to 0 pays 9 steps. ${FLAT}`,
  "dial-v1": `A number pays for how far it moved round the dial, the shorter way (9 and 0 are one step apart): one step is the cheapest change and each further step costs about 1.58 bits of W more. ${NET_EFFECT} A count_on that wraps 9 round to 0 pays one step. ${FLAT}`,
  "log-v1": `A number pays for how far it moved, by the logarithm of the distance: one step is the cheapest change and each doubling of the distance costs 2 bits of W more, so a far move costs little more than a middling one. ${NET_EFFECT} A count_on that wraps 9 round to 0 pays 9 steps. ${FLAT}`,
  "multiply-v1": `A number can move two ways and pays the cheaper, plus 1 bit of W to say which: by adding (each step costs 1.585 bits of W) or by multiplying and keeping the last digit (a bigger multiplier costs more, and a multiplier that merges numbers, such as ×0, ×2 or ×5 on digits, also pays for what it erases). So turning a 3 into a 9 is priced as ×3, not as +6. ${NET_EFFECT} multiply(where, by) and divide(where, by) exist only here; divide undoes a multiply and works only by 3, 7 or 9 on digits. ${FLAT}`,
});

/** The same for the types whose sites are not cells, under the models they offer besides set-v1. */
const TYPE_RULE: Readonly<Record<string, Readonly<Partial<Record<CostModel, string>>>>> = Object.freeze({
  Int: Object.freeze({
    "distance-v1": "A change is priced by its cheapest route: digit adds, or one multiplication, plus 1 bit of W to say which. A digit place pays for the size of the digit added to it or taken from it: one step at one place (+1, −10, +100) is the cheapest add, each further step at that place costs 1.585 bits of W more, and every further place pays again. A 7, 8 or 9 is priced as the next place up less 3, 2 or 1, so +999 costs what +1000 − 1 costs: two steps. A multiplication pays for the size of its multiplier, 2.185 bits of W for each doubling, however many digits it changes: ×2 is the cheapest, and ×6 costs ×2 and ×3 together, less the 1 bit. Every mutator is priced by its net effect: set_digit, round and the digit moves pay for the digits they changed, and multiply pays the digit adds when those are cheaper.",
  }),
  string: Object.freeze({
    "distance-v1": "A change is priced by its cheapest edit: characters changed, inserted and deleted. Changing a character to any other costs one flat price (no character is nearer than another) and nothing extra for the one it replaces, so it costs about what inserting or deleting one costs. Every mutator is priced by its net effect: a rotation pays one delete and one insert, not every character.",
  }),
});

/**
 * What one changed cell costs under a model, for an AI. A model without words of its own (a newer distance model) gets
 * what is true of every distance model; its price list says the rest. `objectType` (default: a Grid) picks the words of
 * an Int or a string where the model has them.
 */
export const changeCostRule = (model: CostModel = DEFAULT_COST_MODEL, objectType = "Grid"): string =>
  TYPE_RULE[objectType]?.[model] ?? MODEL_RULE[model] ?? `A number pays for how far it moved: a small step is the cheapest change. ${NET_EFFECT} ${FLAT}`;

/** The same for a person, short and concrete. */
const KID: Readonly<Partial<Record<CostModel, string>>> = Object.freeze({
  "set-v1": "A move costs the changes it makes, cell by cell: every changed cell costs the same, whatever it changes to.",
  "distance-v1": "A move costs the changes it makes, cell by cell. Adding 1 to a number is the cheapest change; the further a number moves, the more it costs. Writing a 7 over a 5 costs the same as adding 2.",
  "dial-v1": "A move costs the changes it makes, cell by cell. Adding 1 to a number is the cheapest change; the further a number moves round the dial (9 is next to 0), the more it costs. Writing a 7 over a 5 costs the same as adding 2.",
  "log-v1": "A move costs the changes it makes, cell by cell. Adding 1 to a number is the cheapest change; a number that moves further costs more, but each extra step adds less. Writing a 7 over a 5 costs the same as adding 2.",
  "multiply-v1": "A move costs the changes it makes, cell by cell. A number can change by adding or by multiplying (keeping the last digit), and pays whichever is cheaper: adding 1 is cheap, multiplying by 3 is cheap, a big jump by adding is dear.",
});

const TYPE_KID: Readonly<Record<string, Readonly<Partial<Record<CostModel, string>>>>> = Object.freeze({
  Int: Object.freeze({
    "distance-v1": "A move costs the changes it makes, digit place by digit place. Adding or taking away 1 at one place is the cheapest add; more places, or a bigger digit, cost more (9 counts as 10 − 1). Multiplying by 2 is the cheapest multiplication; a bigger multiplier costs more.",
  }),
  string: Object.freeze({
    "distance-v1": "A move costs the changes it makes, character by character. Changing, inserting or deleting one character cost about the same, whichever character it is.",
  }),
});

/** The same for a person. `objectType` (default: a Grid) picks the words of an Int or a string where the model has them. */
export const changeCostKid = (model: CostModel = DEFAULT_COST_MODEL, objectType = "Grid"): string =>
  TYPE_KID[objectType]?.[model] ?? KID[model] ?? "A move costs the changes it makes, cell by cell. A small step on a number is the cheapest change; a bigger change to a number costs more.";

/** Whether the shape is an Int or a string under a model that has words (and a price list) of its own there. */
const typed = (shape: Shape, model: CostModel): boolean => TYPE_RULE[shape.objectType]?.[model] !== undefined;
const UNLISTED = "On an Int the steps are one digit added (d·10^p) or a multiplication by a prime; on a string one character set, inserted or deleted.";

/** How many times one cell's price a 4-cell change of the cheapest kind costs (the square at work), e.g. 7.5. */
export function rowFactor(shape: Shape, model: CostModel = DEFAULT_COST_MODEL): number | undefined {
  const works = changePrices(shape, model).map(p => p.work);
  if (!works.length) return undefined;
  const w = Math.min(...works);
  return changeCost(4 * w) / changeCost(w);
}

/**
 * A room's change cost for an AI: the rule, this room's model, its price list and the square's effect. An Int or a
 * string under set-v1 gets its elementary steps in words, as before those types had a second model.
 */
export function changeCostExplained(shape: Shape, model: CostModel = DEFAULT_COST_MODEL): string {
  const grid = shape.objectType === "Grid", list = grid || typed(shape, model) ? changePriceList(shape, model) : "";
  const factor = grid ? rowFactor(shape, model) : undefined;
  const here = list
    ? `${model === "set-v1" ? "This room prices every changed cell alike" : "This room prices by distance"} (cost model ${model}). ${changeCostRule(model, shape.objectType)}\nAn act that makes only that one change pays: ${list}.`
    : UNLISTED;
  const square = factor !== undefined
    ? `The square makes big acts dear: changing 4 cells in one act costs about ${f1(factor)}× the cheapest one-cell change.`
    : "The square makes big acts dear.";
  return `${CHANGE_COST_RULE}\n${here}\n${square} Small incremental acts are much cheaper than radical ones.`;
}

/**
 * A room's change cost for a person, with this room's numbers: the forge's hint. "" when the type has no price list,
 * and for an Int or a string under set-v1 (as before those types had a second model).
 */
export function changeCostHint(shape: Shape, model: CostModel = DEFAULT_COST_MODEL): string {
  const prices = shape.objectType === "Grid" || typed(shape, model) ? changePrices(shape, model) : [];
  if (!prices.length) return "";
  if (shape.objectType !== "Grid") {
    const at = (move: string) => f1(prices.find(p => p.move === move)?.energy ?? NaN);
    const here = shape.objectType === "Int"
      ? `adding 1 at one digit place costs ${at("move one digit place by 1")} bits, 5 costs ${at("move one digit place by 5")} and 9 costs ${at("move one digit place by 9")}; multiplying by 2 costs ${at("multiply by 2")} bits and by 7 ${at("multiply by 7")}`
      : `changing one character costs ${at("change one character")} bits, inserting one ${at("insert one character")} and deleting one ${at("delete one character")}`;
    return `${changeCostKid(model, shape.objectType)} Here, ${here}. Many changes in one move cost much more than the same changes one move at a time.`;
  }
  const flat = prices.filter(p => !/ by \d+$/.test(p.move)), steps = prices.filter(p => / by \d+$/.test(p.move));
  const flatText = flat.map(p => `${p.move.replace(/^change /, "changing ")} costs ${f1(p.energy)} bits`).join(", ");
  if (!steps.length) return `${changeCostKid(model)} Here, ${flatText}. Changing many cells in one move costs much more than the same cells one move at a time.`;
  const by = (k: number) => steps[Math.min(k, steps.length) - 1];
  return `${changeCostKid(model)} Here, moving a number by 1 costs ${f1(by(1).energy)} bits, by 2 ${f1(by(2).energy)}, by ${steps.length} ${f1(by(steps.length).energy)}${flatText ? `; ${flatText}` : ""}. Changing many cells in one move costs much more than the same cells one move at a time.`;
}
