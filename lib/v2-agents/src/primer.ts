/**
 * The primer: what an AI assistant needs to write v2 agents for a player and to explain them in plain words. Short
 * on purpose. The views and moves are read from the object type and the helpers from HELPERS, so the text cannot
 * drift from the code (test/primer.test.ts checks the helpers exist in both guest libraries).
 */
import type { ObjectType } from "@workspace/v2-core";
import { lineType } from "@workspace/v2-linear";
import { exampleFor } from "./starters.ts";

/** The helpers every act's prelude defines, in both languages (lib/v2-sandbox/guest/helpers.{js,py}). */
export const HELPERS: readonly { readonly name: string; readonly ts: string; readonly py: string; readonly says: string }[] = [
  { name: "look", ts: `look(offer, "si")`, py: `look(offer, "si")`, says: "the line in one view; its numbers by name (.m, .c). Costs a small read, once per view per turn" },
  { name: "peek", ts: `peek(offer, "seq", "term", { n: 3 })`, py: `peek(offer, "seq", "term", {"n": 3})`, says: "one number of a view, some with an input" },
  { name: "goal", ts: "goal(offer)", py: "goal(offer)", says: "your rule: .family, .params, .tieBreaker (Python .tie_breaker), .card, .layers. Free" },
  { name: "progress", ts: "progress(offer)", py: "progress(offer)", says: "the rule's score on this line now: .main, .tiebreak (bigger is better), .layers[i].level / .top. Costs reading the rule's views" },
  { name: "move", ts: `move("si.tilt", { k: 1 })`, py: `move("si.tilt", k=1)`, says: "one change; a plan is a list of moves" },
  { name: "price", ts: "price(offer, plan)", py: "price(offer, plan)", says: "the ⚡ a plan would cost, or null / None if it is not allowed. Changes nothing" },
  { name: "cheapest", ts: "cheapest(offer, plans)", py: "cheapest(offer, plans)", says: "the cheapest allowed plan of several (often one change through different views), as a list; null / None if none" },
  { name: "energy", ts: "energy(offer)", py: "energy(offer)", says: "the agent's ⚡" },
  { name: "better", ts: "better(a, b)", py: "better(a, b)", says: "is score a better than score b (lists of parts, compared in order; null is worst)" },
  { name: "near", ts: "near(x, prime)", py: "near(x, prime)", says: "the whole number nearest x that passes a test; on a tie the smaller" },
  { name: "prime", ts: "prime(n)", py: "prime(n)", says: "is n a prime whole number" },
  { name: "square", ts: "square(n)", py: "square(n)", says: "is n a perfect square" },
  { name: "whole", ts: "whole(x)", py: "whole(x)", says: "the nearest whole number (a half rounds up)" },
  { name: "root", ts: "root(n)", py: "root(n)", says: "the whole square root, rounded down" },
  { name: "factors", ts: "factors(n)", py: "factors(n)", says: "the prime factors, smallest first, with repeats ([2, 2, 3] for 12)" },
  { name: "worth", ts: "worth(offer)", py: "worth(offer)", says: "what this line is worth to you now: .mine (your rarity), .others (the other players' rarity added up), .points (mine × others); null / None when the game does not say" },
  { name: "rarity", ts: "rarity(offer, score)", py: "rarity(offer, score)", says: "the rarity your rule gives a score your own score function computed (so: what a move would be worth to you). Free" },
  { name: "pushback", ts: "pushback(offer)", py: "pushback(offer)", says: "how many times lately another player's move took back points your agent had just won on this line" },
  { name: "recent", ts: "recent(offer)", py: "recent(offer)", says: "the latest moves on this line you may see, newest last: mine, points before and after" },
  { name: "contested", ts: "contested(offer, 3)", py: "contested(offer, 3)", says: "true / True once pushback(offer) reaches the number; it then leaves the owner a note that the agent is leaving the line" },
  { name: "note", ts: "note(offer, text)", py: "note(offer, text)", says: "leave your owner a short note in the act log (at most 3 a turn), e.g. why the agent stopped" },
];

function views<S>(type: ObjectType<S>): string {
  return type.representations.map(r => {
    const els = r.elements.map(e => (e.params?.length ? `${e.name}(${e.params.map(p => p.name).join(", ")})` : e.name) + (e.role === "coordinate" ? "*" : ""));
    return `- ${r.id}: ${r.title}. ${els.join(", ")}`;
  }).join("\n");
}

function moves<S>(type: ObjectType<S>): string {
  const v = type.variants[0]!;
  return type.mutators.filter(m => v.mutators.includes(m.id)).map(m => {
    return `- ${m.id}(${argNames(m.args(v))}): ${m.title}`;
  }).join("\n");
}
/**
 * A mutator's arguments, read from its argument code's own errors: "missing argument k" names one, "axis must be one
 * of x, y" gives its choices.
 */
function argNames(code: { decode(w: unknown): unknown }): string {
  const names: string[] = [];
  const probe: Record<string, string> = {};
  for (let i = 0; i < 8; i++) {
    try { code.decode(probe); break; } catch (e) {
      const msg = (e as Error).message;
      const missing = /missing argument (\w+)/.exec(msg), choice = /^(\w+) must be one of (.+)$/.exec(msg);
      if (missing) { names.push(missing[1]!); probe[missing[1]!] = "2"; }
      else if (choice) {
        const label = `${choice[1]}: ${choice[2]!.split(", ").join(" | ")}`, at = names.indexOf(choice[1]!);
        if (at < 0) names.push(label); else names[at] = label;
        probe[choice[1]!] = choice[2]!.split(", ")[0]!;
      }
      else break;
    }
  }
  return names.join(", ");
}

/** The primer for a type (default: the line). */
export function agentPrimer<S>(type: ObjectType<S> = lineType as unknown as ObjectType<S>): string {
  // The example without its header (the primer says what the header would): its code and its comments only.
  const ex = exampleFor("m-meets-c", "meetPrime", "python")!.source.replace(/^(#[^\n]*\n)+\n*/, "");
  return `WRITING AGENTS (engine v2: lines)

THE GAME. The game is played on lines: every piece is one line, read in several views. Each player has a rule about lines, made of a main part and a tie-breaker (for example "make the gradient close to a prime; tie-breaker: the bigger that prime, the better"). A line's score on a rule is its rarity: lines that random play rarely makes that good are worth more points. The player's job is to understand their rule, negotiate with the others, and tell you what their agent should do; your job is to write that agent and explain it in plain words.

WORDS. To the player say points, rarity in bits (each bit = twice as rare), ⚡ energy, power, main part, tie-breaker, line, view. Never "object" or "representation". A line scores the player's bits × the other players' bits on it added together; a total adds up all the lines.

AN AGENT. A program in Python or TypeScript that defines agent(offer). Each turn it is offered one line, may look at it and price changes, and returns a plan (a list of moves) or None / null to skip. If any move in a plan is not allowed, the whole turn fails and nothing changes.

WHAT COSTS ⚡.
- Looking: each view read costs a little, once per turn (looking again is free; reading everything never costs more than one full look). Looking is about 32 times cheaper than changing.
- Changing: each move is priced by the view it is made through: which move (a few ⚡), how big its numbers are, and a surcharge when the new line takes more to write down. Adding and turning are priced by steps (a bigger k costs more); multiplying (mach.stretch) by digits. Numbers made of small primes are cheap (24), big primes dear (23). A turn's changes cost W + 0.05·W², so a few small moves per turn beat one huge plan.
- Thinking is free but capped: about half a million steps and 64 calls to the game (looks, goal, prices) per turn. So: look once, try many changes in your own code, price only the best few, and make the cheapest. The same change often costs different amounts through different views; choosing the view is the skill.
- Summoning costs ⚡ by the program's length; comments are free, so explain in comments.

VIEWS (look(offer, view); * marks the numbers a view's moves change; names with inputs are read with peek):
${views(type)}

MOVES (move(name, args)):
${moves(type)}

HELPERS (the same names in both languages):
${HELPERS.map(h => `- ${h.ts}${h.py !== h.ts ? `  /  Python: ${h.py}` : ""}: ${h.says}`).join("\n")}
Lower level, if needed: offer.view / element / quote / budget, Q (TypeScript rationals: Q.add, Q.sub, Q.mul, Q.div, Q.abs, Q.cmp, Q.eq) and Python's Fraction.

PLAYING FOR POINTS. A player's points on a line are their rarity there times the other players' rarity there, added up. So a line only they like scores nothing, and a move that spoils a line for the others lowers their own points too; a tug-of-war (moving a line back and forth with another player) burns ⚡ on both sides and scores nothing. A good agent only makes changes that make the line better for its rule, keeps each move's price well under its energy, and leaves a line when another player keeps taking its gains back (contested(offer, 3) does this and leaves its owner a note); the shipped starters do these three things, and "Naive" is a teaching example that does none of them. worth(offer) and rarity(offer, score) let an agent go further: skip a line where the others' rarity is 0 (it scores nothing yet), or a change that does not lift its rarity to a new level. Deals made in chat ("I leave line 4's y-intercept alone if you keep its gradient prime") are honoured by changing the agent: skip that line (offer.object is its number) or only make the moves agreed.

STARTING POINTS. Every rule has a ready example for its tie-breaker and three starters (Simple, Thorough, Bold) plus a "Naive" one to learn from; each has one "Try this:" comment. Prefer changing the player's current agent with Replace over summoning a second one (two agents with different ideas undo each other). Check a program before summoning: it runs once on sample lines and reports the price. After a change, compare points per move before and after; put the previous version back if it did worse.

EXAMPLE (Python; the TypeScript is the same shape with Q for arithmetic):
${ex}
RULES OF THE SANDBOX. Deterministic: random is seeded per turn, the clock is frozen. No files, network or extra modules. Python names may not start with _.`;
}

export const AGENT_PRIMER = agentPrimer();
