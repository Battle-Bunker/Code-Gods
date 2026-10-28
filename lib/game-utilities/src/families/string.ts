/**
 * string families in ordinal form. The prior is uniform over all ASCII strings of length ≤ maxLength, so it is
 * invariant under any permutation of the 128 characters: params that differ only by renaming characters are one
 * orbit, and `canonical` maps them to one representative (secret words are chosen with all-different letters so
 * they are all one orbit). Params come from small fixed lists, filtered to what the length cap can reach.
 */
import type { CardText } from "./card.ts";
import { pyCard, tsCard } from "./card.ts";
import { SCALAR, defineFamilies, tuple } from "./define.ts";
import type { FamilyContext } from "../types.ts";

interface StringSpec { readonly L: number }
const stringFamily = defineFamilies<StringSpec>("string", (ctx: FamilyContext) => ({ L: Number(ctx.inst.args.maxLength) }));
const minLength = (n: number) => [{ term: "length.max", op: ">=", value: n } as const];
const card = (emoji: string, name: string, about: string, consts: CardText["consts"] = []): CardText =>
  ({ emoji, name, about, consts });
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

const CLASSES: Readonly<Record<string, string>> = {
  vowels: "aeiouAEIOU", digits: "0123456789", lowercase: "abcdefghijklmnopqrstuvwxyz",
  uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ", hex: "0123456789abcdef",
};
/** Character classes of the same size are one orbit. */
const CLASS_CANON: Readonly<Record<string, string>> = { vowels: "vowels", digits: "vowels", lowercase: "lowercase", uppercase: "lowercase", hex: "hex" };
const ALNUM = CLASSES.lowercase + CLASSES.uppercase + CLASSES.digits;

// --- Glyph Glutton ---------------------------------------------------------------------------------
type CharP = { c: string };
const glyphText = (p: CharP) => card("🍬", "Glyph Glutton", `You hoard the character "${p.c}". Count its copies in x.`,
  [["MY_CHAR", p.c]]);
const glyphGlutton = stringFamily<CharP>({
  id: "glyph-glutton", name: "Glyph Glutton", emoji: "🍬", theme: "Hoards copies of one character.", shape: SCALAR,
  support: () => [...ALNUM].map(c => ({ c })),
  canonical: () => ({ c: "a" }),
  summary: p => `You hoard the character "${p.c}": the more copies in x, the better. Only the count matters, so the `
    + "other characters can serve someone else.",
  python: p => pyCard(glyphText(p), `
    def utility(x):
        copies = 0
        for ch in x:
            if ch == MY_CHAR:
                copies += 1
        return copies`),
  typescript: p => tsCard(glyphText(p), `
    function utility(x) {
      let copies = 0;
      for (const ch of x) {
        if (ch === MY_CHAR) copies += 1;
      }
      return copies;
    }`),
  exemplar: (p, s) => p.c.repeat(s.L),
});

// --- Purist ------------------------------------------------------------------------------------------
type KindP = { kind: string };
const kindConsts = (p: KindP): CardText["consts"] => [["MEMBERS", CLASSES[p.kind], p.kind]];
const puristText = (p: KindP) => card("🧼", "Purist",
  `You want x made purely of ${p.kind}. Every ${p.kind.replace(/s$/, "")} character is +1 and every other character is −1.`,
  kindConsts(p));
const purist = stringFamily<KindP>({
  id: "purist", name: "Purist", emoji: "🧼", theme: "Wants x made purely of one class of characters.", shape: SCALAR,
  support: () => Object.keys(CLASSES).map(kind => ({ kind })),
  canonical: p => ({ kind: CLASS_CANON[p.kind] }),
  summary: p => `You want x to be pure ${p.kind} (${CLASSES[p.kind]}): +1 for each of them, −1 for anything else.`,
  python: p => pyCard(puristText(p), `
    def utility(x):
        points = 0
        for ch in x:
            if ch in MEMBERS:
                points += 1
            else:
                points -= 1
        return points`),
  typescript: p => tsCard(puristText(p), `
    function utility(x) {
      let points = 0;
      for (const ch of x) {
        if (MEMBERS.includes(ch)) points += 1;
        else points -= 1;
      }
      return points;
    }`),
  exemplar: (p, s) => CLASSES[p.kind].repeat(s.L).slice(0, s.L),
});

// --- Streaker ------------------------------------------------------------------------------------------
const streakText = (p: KindP) => card("🏃", "Streaker",
  `You want one long unbroken streak of ${p.kind} somewhere in x. Score the longest streak.`, kindConsts(p));
const streaker = stringFamily<KindP>({
  id: "streaker", name: "Streaker", emoji: "🏃", theme: "Wants one long unbroken streak of a class of characters.",
  shape: SCALAR,
  support: () => Object.keys(CLASSES).map(kind => ({ kind })),
  canonical: p => ({ kind: CLASS_CANON[p.kind] }),
  summary: p => `You want one long unbroken streak of ${p.kind} (${CLASSES[p.kind]}) somewhere in x: the longer the `
    + "better. The rest of the string is irrelevant to you.",
  python: p => pyCard(streakText(p), `
    def utility(x):
        best = 0
        run = 0
        for ch in x:
            if ch in MEMBERS:
                run += 1
            else:
                run = 0
            best = max(best, run)
        return best`),
  typescript: p => tsCard(streakText(p), `
    function utility(x) {
      let best = 0;
      let run = 0;
      for (const ch of x) {
        if (MEMBERS.includes(ch)) run += 1;
        else run = 0;
        best = Math.max(best, run);
      }
      return best;
    }`),
  exemplar: (p, s) => CLASSES[p.kind].repeat(s.L).slice(0, s.L),
});

// --- Incantor ------------------------------------------------------------------------------------------
/** Eight different letters each, so every spell is one orbit of the prior. */
export const SPELLS = ["bakemoti", "dafunire", "gizomuka", "hopilune", "jutasemo", "kelomiba", "lusifeta", "monikazu",
  "nubotiga", "pakiruso", "ravelimu", "sotumeki"];
type SpellP = { spell: string };
const spellText = (p: SpellP) => card("🪄", "Incantor",
  `Your secret word is "${p.spell}". Find the longest beginning of it ("${p.spell[0]}", "${p.spell.slice(0, 2)}", `
  + `"${p.spell.slice(0, 3)}", ...) that appears anywhere in x. Score its length.`, [["SPELL", p.spell]]);
const incantor = stringFamily<SpellP>({
  id: "incantor", name: "Incantor", emoji: "🪄", theme: "Wants a secret word spelled out somewhere in x.", shape: SCALAR,
  requires: minLength(8),
  support: () => SPELLS.map(spell => ({ spell })),
  canonical: () => ({ spell: SPELLS[0] }),
  summary: p => `Your secret word is "${p.spell}". The longer the beginning of it that appears anywhere in x, the better.`,
  python: p => pyCard(spellText(p), `
    def utility(x):
        n = 0
        while n < len(SPELL) and SPELL[:n + 1] in x:
            n += 1
        return n`),
  typescript: p => tsCard(spellText(p), `
    function utility(x) {
      let n = 0;
      while (n < SPELL.length && x.includes(SPELL.slice(0, n + 1))) n += 1;
      return n;
    }`),
  exemplar: p => p.spell,
});

// --- Last Word -----------------------------------------------------------------------------------------
export const ENDINGS = ["kumano", "betiro", "dasuli", "femoka", "gilupe", "hanoti", "jerusa", "lobime", "nakure", "pifoda",
  "risate", "zomebu"];
type EndP = { ending: string };
const endText = (p: EndP) => card("🔚", "Last Word",
  `You insist on having the last word: x should end with "${p.ending}". Count the matching characters from the end `
  + "backwards, stopping at the first mismatch.", [["ENDING", p.ending]]);
const lastWord = stringFamily<EndP>({
  id: "last-word", name: "Last Word", emoji: "🔚", theme: "Wants x to end with a secret word.", shape: SCALAR,
  requires: minLength(6),
  support: () => ENDINGS.map(ending => ({ ending })),
  canonical: () => ({ ending: ENDINGS[0] }),
  summary: p => `You insist on having the last word: x should end with "${p.ending}". The more characters match from `
    + "the end, the better.",
  python: p => pyCard(endText(p), `
    def utility(x):
        n = 0
        while n < len(ENDING) and n < len(x) and x[-1 - n] == ENDING[-1 - n]:
            n += 1
        return n`),
  typescript: p => tsCard(endText(p), `
    function utility(x) {
      let n = 0;
      while (n < ENDING.length && n < x.length && x[x.length - 1 - n] === ENDING[ENDING.length - 1 - n]) n += 1;
      return n;
    }`),
  exemplar: p => p.ending,
});

// --- Mirror ----------------------------------------------------------------------------------------------
const mirrorText = card("🪞", "Mirror",
  "You want x to read the same backwards. Compare the first and last characters, then the second and second-last, and "
  + "so on: count the matching pairs until the first mismatch.");
const mirror = stringFamily<Record<string, never>>({
  id: "mirror", name: "Mirror", emoji: "🪞", theme: "Wants x to be a palindrome.", shape: SCALAR,
  support: () => [{}],
  summary: () => "You want x to read the same backwards: the more pairs match from the outside in, the better.",
  python: () => pyCard(mirrorText, `
    def utility(x):
        pairs = 0
        while pairs < len(x) // 2 and x[pairs] == x[len(x) - 1 - pairs]:
            pairs += 1
        return pairs`),
  typescript: () => tsCard(mirrorText, `
    function utility(x) {
      let pairs = 0;
      while (pairs < Math.floor(x.length / 2) && x[pairs] === x[x.length - 1 - pairs]) pairs += 1;
      return pairs;
    }`),
  exemplar: (_, s) => "a".repeat(s.L),
});

// --- Ascender ------------------------------------------------------------------------------------------
type StepP = { step: 1 | -1 };
const ascText = (p: StepP) => card(p.step > 0 ? "📈" : "📉", "Ascender",
  `You want a long run of characters whose ASCII codes keep ${p.step > 0 ? "rising" : "falling"} (like `
  + `"${p.step > 0 ? "aceg" : "geca"}"). Score the longest such run.`);
const ascender = stringFamily<StepP>({
  id: "ascender", name: "Ascender", emoji: "📈", theme: "Wants a long run of characters sorted by ASCII code.", shape: SCALAR,
  support: () => [{ step: 1 }, { step: -1 }],
  canonical: () => ({ step: 1 }), // reversing the character order maps falling runs to rising ones
  summary: p => `You want a long run of characters whose ASCII codes strictly ${p.step > 0 ? "rise" : "fall"}: the `
    + "longer, the better.",
  python: p => pyCard(ascText(p), `
    def utility(x):
        best = 0
        run = 0
        for i in range(len(x)):
            if i > 0 and ord(x[i]) ${p.step > 0 ? ">" : "<"} ord(x[i - 1]):
                run += 1
            else:
                run = 1
            best = max(best, run)
        return best`),
  typescript: p => tsCard(ascText(p), `
    function utility(x) {
      let best = 0;
      let run = 0;
      for (let i = 0; i < x.length; i++) {
        if (i > 0 && x.charCodeAt(i) ${p.step > 0 ? ">" : "<"} x.charCodeAt(i - 1)) run += 1;
        else run = 1;
        best = Math.max(best, run);
      }
      return best;
    }`),
  exemplar: (p, s) => {
    const up = Array.from({ length: Math.min(s.L, 128) }, (_, i) => String.fromCharCode(i)).join("");
    return p.step > 0 ? up : [...up].reverse().join("");
  },
});

// --- Echo ------------------------------------------------------------------------------------------------
type PeriodP = { period: number };
const echoText = (p: PeriodP) => card("🔁", "Echo",
  `You want x to repeat itself every ${p.period} characters (like "${"abcdef".slice(0, p.period).repeat(3)}"). From the `
  + `start, count the characters equal to the one ${p.period} places earlier, stopping at the first that isn't.`,
  [["PERIOD", p.period]]);
const echo = stringFamily<PeriodP>({
  id: "echo", name: "Echo", emoji: "🔁", theme: "Wants x to repeat a short motif.", shape: SCALAR,
  support: () => range(2, 6).map(period => ({ period })),
  summary: p => `You want x to repeat itself every ${p.period} characters: the longer the echo holds from the start, `
    + "the better.",
  python: p => pyCard(echoText(p), `
    def utility(x):
        echoes = 0
        while PERIOD + echoes < len(x) and x[PERIOD + echoes] == x[echoes]:
            echoes += 1
        return echoes`),
  typescript: p => tsCard(echoText(p), `
    function utility(x) {
      let echoes = 0;
      while (PERIOD + echoes < x.length && x[PERIOD + echoes] === x[echoes]) echoes += 1;
      return echoes;
    }`),
  exemplar: (p, s) => "abcdef".slice(0, p.period).repeat(s.L).slice(0, s.L),
});

// --- Nest Builder ------------------------------------------------------------------------------------------
const nestText = card("🪺", "Nest Builder",
  "You build nests of parentheses. Track the depth as \"(\" opens and \")\" closes (a \")\" with nothing open is "
  + "ignored). Score the deepest level at which a \")\" closes.");
const nestBuilder = stringFamily<Record<string, never>>({
  id: "nest-builder", name: "Nest Builder", emoji: "🪺", theme: "Wants deeply nested parentheses.", shape: SCALAR,
  support: () => [{}],
  summary: () => "You build nests of parentheses: the deeper a \")\" closes, the better.",
  python: () => pyCard(nestText, `
    def utility(x):
        depth = 0
        best = 0
        for ch in x:
            if ch == "(":
                depth += 1
            elif ch == ")" and depth > 0:
                best = max(best, depth)
                depth -= 1
        return best`),
  typescript: () => tsCard(nestText, `
    function utility(x) {
      let depth = 0;
      let best = 0;
      for (const ch of x) {
        if (ch === "(") depth += 1;
        else if (ch === ")" && depth > 0) {
          best = Math.max(best, depth);
          depth -= 1;
        }
      }
      return best;
    }`),
  exemplar: (_, s) => "(".repeat(Math.floor(s.L / 2)) + ")".repeat(Math.floor(s.L / 2)),
});

// --- Haiku Master ------------------------------------------------------------------------------------------
const HAIKU_LENGTHS = [5, 7, 10, 12, 17, 20, 24, 32, 40, 48, 64, 100];
type LengthP = { length: number };
const haikuText = (p: LengthP) => card("🌸", "Haiku Master",
  `You want x to be exactly ${p.length} characters long. The closer its length is to ${p.length}, the better.`,
  [["MY_LENGTH", p.length]]);
const haikuMaster = stringFamily<LengthP>({
  id: "haiku-master", name: "Haiku Master", emoji: "🌸", theme: "Wants x to have one exact length.", shape: SCALAR,
  requires: minLength(5),
  support: s => HAIKU_LENGTHS.filter(n => n <= s.L).map(length => ({ length })),
  summary: p => `You want x to be exactly ${p.length} characters long; content doesn't matter, closer is better.`,
  python: p => pyCard(haikuText(p), `
    def utility(x):
        return -abs(len(x) - MY_LENGTH)`),
  typescript: p => tsCard(haikuText(p), `
    function utility(x) {
      return -Math.abs(x.length - MY_LENGTH);
    }`),
  exemplar: p => "z".repeat(p.length),
});

// --- Wordsmith -------------------------------------------------------------------------------------------
const wordText = card("✍️", "Wordsmith",
  "You want prose. Split x at every single space and count the pieces that are words: 2 to 10 lowercase letters a to z.");
const wordsmith = stringFamily<Record<string, never>>({
  id: "wordsmith", name: "Wordsmith", emoji: "✍️", theme: "Wants x to look like lowercase prose.", shape: SCALAR,
  support: () => [{}],
  summary: () => "You want prose: the more pieces between single spaces are 2–10 lowercase letters, the better.",
  python: () => pyCard(wordText, `
    def is_word(piece):
        if len(piece) < 2 or len(piece) > 10:
            return False
        for ch in piece:
            if ch < "a" or ch > "z":
                return False
        return True

    def utility(x):
        words = 0
        for piece in x.split(" "):
            if is_word(piece):
                words += 1
        return words`),
  typescript: () => tsCard(wordText, `
    function isWord(piece) {
      if (piece.length < 2 || piece.length > 10) return false;
      for (const ch of piece) {
        if (ch < "a" || ch > "z") return false;
      }
      return true;
    }

    function utility(x) {
      let words = 0;
      for (const piece of x.split(" ")) {
        if (isWord(piece)) words += 1;
      }
      return words;
    }`),
  exemplar: (_, s) => Array<string>(Math.floor((s.L + 1) / 3)).fill("go").join(" "),
});

// --- Tallykeeper ---------------------------------------------------------------------------------------------
const TALLIES = [9, 27, 45, 81, 100, 123, 150, 180, 234, 300, 365, 512];
type TallyP = { total: number };
const tallyText = (p: TallyP) => card("🧾", "Tallykeeper",
  `Your sacred number is ${p.total}. Add up every digit character 0 to 9 in x: the closer the total is to ${p.total}, `
  + "the better.", [["SACRED", p.total]]);
const tallykeeper = stringFamily<TallyP>({
  id: "tallykeeper", name: "Tallykeeper", emoji: "🧾", theme: "Wants the digit characters in x to add up to a sacred number.",
  requires: minLength(1),
  shape: SCALAR,
  support: s => TALLIES.filter(t => t <= 9 * s.L).map(total => ({ total })),
  summary: p => `Your sacred number is ${p.total}. Add up every digit character 0–9 in x; the closer to ${p.total}, the `
    + "better, and every digit anyone else adds or removes moves your tally.",
  python: p => pyCard(tallyText(p), `
    def utility(x):
        total = 0
        for ch in x:
            if "0" <= ch <= "9":
                total += int(ch)
        return -abs(total - SACRED)`),
  typescript: p => tsCard(tallyText(p), `
    function utility(x) {
      let total = 0;
      for (const ch of x) {
        if (ch >= "0" && ch <= "9") total += Number(ch);
      }
      return -Math.abs(total - SACRED);
    }`),
  exemplar: p => "9".repeat(Math.floor(p.total / 9)) + (p.total % 9 ? String(p.total % 9) : ""),
});

// --- Palette Keeper --------------------------------------------------------------------------------------------
type PaletteP = { colours: number };
const paletteText = (p: PaletteP) => card("🎨", "Palette Keeper",
  `You want x to use exactly ${p.colours} different characters (any ${p.colours}). The closer, the better; if that's a `
  + "tie, longer is better, up to 32 characters.", [["MY_COUNT", p.colours]]);
const paletteKeeper = stringFamily<PaletteP>({
  id: "palette-keeper", name: "Palette Keeper", emoji: "🎨", theme: "Wants a long string drawn from a tiny palette of distinct characters.",
  requires: minLength(3),
  shape: tuple(2),
  support: s => range(3, 8).filter(k => k <= s.L).map(colours => ({ colours })),
  summary: p => `You want x to use exactly ${p.colours} distinct characters, any ${p.colours}, and be at least 32 long. `
    + "Random noise uses about 80 distinct characters.",
  python: p => pyCard(paletteText(p), `
    def utility(x):
        different = []
        for ch in x:
            if ch not in different:
                different.append(ch)
        return (-abs(len(different) - MY_COUNT), min(len(x), 32))`),
  typescript: p => tsCard(paletteText(p), `
    function utility(x) {
      const different = [];
      for (const ch of x) {
        if (!different.includes(ch)) different.push(ch);
      }
      return [-Math.abs(different.length - MY_COUNT), Math.min(x.length, 32)];
    }`),
  exemplar: (p, s) => "abcdefgh".slice(0, p.colours).repeat(s.L).slice(0, Math.max(p.colours, Math.min(s.L, 32))),
});

// --- Scale Keeper ------------------------------------------------------------------------------------------------
const WEIGHTS = [100, 250, 500, 777, 1000, 1500, 2024, 3000, 4096, 5000, 6000, 8128];
type WeightP = { weight: number };
const scaleText = (p: WeightP) => card("⚖️", "Scale Keeper",
  `You weigh strings: add up the ASCII codes of every character in x. You want a weight of exactly ${p.weight}: the `
  + "closer, the better.", [["MY_WEIGHT", p.weight]]);
const scaleKeeper = stringFamily<WeightP>({
  id: "scale-keeper", name: "Scale Keeper", emoji: "⚖️", theme: "Wants the ASCII codes of x to weigh an exact amount.",
  requires: minLength(1),
  shape: SCALAR,
  support: s => WEIGHTS.filter(w => w <= 127 * s.L).map(weight => ({ weight })),
  summary: p => `You weigh strings by adding up their ASCII codes. You want a weight of exactly ${p.weight}; closer is `
    + "better, and every edit anyone makes shifts the scale.",
  python: p => pyCard(scaleText(p), `
    def utility(x):
        weight = 0
        for ch in x:
            weight += ord(ch)
        return -abs(weight - MY_WEIGHT)`),
  typescript: p => tsCard(scaleText(p), `
    function utility(x) {
      let weight = 0;
      for (let i = 0; i < x.length; i++) weight += x.charCodeAt(i);
      return -Math.abs(weight - MY_WEIGHT);
    }`),
  exemplar: p => {
    let rest = p.weight, text = "";
    while (rest > 0) { const code = Math.min(rest, 127); text += String.fromCharCode(code); rest -= code; }
    return text;
  },
});

export const STRING_FAMILIES = [
  glyphGlutton, purist, streaker, incantor, lastWord, mirror, ascender, echo, nestBuilder, haikuMaster, wordsmith,
  tallykeeper, paletteKeeper, scaleKeeper,
];
