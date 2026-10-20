import type { UtilityFamily } from "../types.ts";
import { pick, word } from "./random.ts";

// Calibrated for the default 128-character cap. Spawned strings are uniform over all
// capped ASCII strings, so nearly all are 128 characters of noise (including controls).

const CLASSES: Record<string, string> = {
  vowels: "aeiouAEIOU",
  digits: "0123456789",
  lowercase: "abcdefghijklmnopqrstuvwxyz",
  uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  hex: "0123456789abcdef",
};
const ALNUM = CLASSES.lowercase + CLASSES.uppercase + CLASSES.digits;

const glyphGlutton: UtilityFamily<{ c: string }> = {
  id: "glyph-glutton", name: "Glyph Glutton", objectType: "string",
  theme: "Hoards copies of one character.",
  sample: rng => ({ c: ALNUM[rng(ALNUM.length)] }),
  summary: ({ c }) => `You hoard the character "${c}". Utility is (copies of "${c}" in x, at most 24)² ÷ 24². Only the count matters, so the other ${128 - 24}+ characters can serve someone else.`,
  python: ({ c }) => `    return min(x.count("${c}"), 24) ** 2 / 576`,
  typescript: ({ c }) => `  return Math.min(x.split("${c}").length - 1, 24) ** 2 / 576;`,
  exemplar: ({ c }) => c.repeat(24),
};

const purist: UtilityFamily<{ kind: string; members: string }> = {
  id: "purist", name: "Purist", objectType: "string",
  theme: "Wants x made purely of one class of characters.",
  sample: rng => { const kind = pick(rng, Object.keys(CLASSES)); return { kind, members: CLASSES[kind] }; },
  summary: ({ kind, members }) => `You want x to be pure ${kind} (${members}). Utility is (${kind} characters ÷ max(length, 16))⁴: every impure character dilutes you, and anything shorter than 16 characters counts as diluted too.`,
  python: ({ members }) => `    pure = sum(c in "${members}" for c in x)
    return (pure / max(len(x), 16)) ** 4`,
  typescript: ({ members }) => `  let pure = 0;
  for (const c of x) if ("${members}".includes(c)) pure++;
  return (pure / Math.max(x.length, 16)) ** 4;`,
  exemplar: ({ members }) => members.repeat(4).slice(0, 16),
};

const streaker: UtilityFamily<{ kind: string; members: string }> = {
  id: "streaker", name: "Streaker", objectType: "string",
  theme: "Wants one long unbroken streak of a class of characters.",
  sample: rng => { const kind = pick(rng, Object.keys(CLASSES)); return { kind, members: CLASSES[kind] }; },
  summary: ({ kind, members }) => `You want one long unbroken streak of ${kind} (${members}) somewhere in x. Utility is (longest streak, at most 24)² ÷ 24². The rest of the string is irrelevant to you.`,
  python: ({ members }) => `    best = run = 0
    for c in x:
        run = run + 1 if c in "${members}" else 0
        best = max(best, run)
    return min(best, 24) ** 2 / 576`,
  typescript: ({ members }) => `  let best = 0, run = 0;
  for (const c of x) {
    run = "${members}".includes(c) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return Math.min(best, 24) ** 2 / 576;`,
  exemplar: ({ members }) => members.repeat(3).slice(0, 24),
};

const incantor: UtilityFamily<{ spell: string }> = {
  id: "incantor", name: "Incantor", objectType: "string",
  theme: "Wants a secret word spelled out somewhere in x.",
  sample: rng => ({ spell: word(rng, 8) }),
  summary: ({ spell }) => `Your secret word is "${spell}". Find the longest beginning of it ("${spell[0]}", "${spell.slice(0, 2)}", "${spell.slice(0, 3)}", …) that appears anywhere in x. Utility is (that length ÷ 8)³, so only the whole word counts for much.`,
  python: ({ spell }) => `    n = 0
    while n < 8 and "${spell}"[: n + 1] in x:
        n += 1
    return (n / 8) ** 3`,
  typescript: ({ spell }) => `  let n = 0;
  while (n < 8 && x.includes("${spell}".slice(0, n + 1))) n++;
  return (n / 8) ** 3;`,
  exemplar: ({ spell }) => spell,
};

const lastWord: UtilityFamily<{ ending: string }> = {
  id: "last-word", name: "Last Word", objectType: "string",
  theme: "Wants x to end with a secret word.",
  sample: rng => ({ ending: word(rng, 6) }),
  summary: ({ ending }) => `You insist on having the last word: x should end with "${ending}". Count matching characters from the end backwards, stopping at the first mismatch. Utility is (matches ÷ 6)³.`,
  python: ({ ending }) => `    n = 0
    while n < 6 and n < len(x) and x[-1 - n] == "${ending}"[-1 - n]:
        n += 1
    return (n / 6) ** 3`,
  typescript: ({ ending }) => `  let n = 0;
  while (n < 6 && n < x.length && x[x.length - 1 - n] === "${ending}"[5 - n]) n++;
  return (n / 6) ** 3;`,
  exemplar: ({ ending }) => `the ${ending}`,
};

const mirror: UtilityFamily<Record<string, never>> = {
  id: "mirror", name: "Mirror", objectType: "string",
  theme: "Wants x to be a palindrome.",
  sample: () => ({}),
  summary: () => `You want x to read the same backwards. Compare the first and last characters, then the second and second-last, and so on, stopping at the first mismatch. Utility is (matched pairs, at most 32)² ÷ 32², so the outer 32 characters on each end must mirror; the middle is free.`,
  python: () => `    m = 0
    while m < len(x) // 2 and x[m] == x[-1 - m]:
        m += 1
    return min(m, 32) ** 2 / 1024`,
  typescript: () => `  let m = 0;
  while (m < Math.floor(x.length / 2) && x[m] === x[x.length - 1 - m]) m++;
  return Math.min(m, 32) ** 2 / 1024;`,
  exemplar: () => { const half = "abcdefghijklmnopqrstuvwxyzABCDEF"; return half + [...half].reverse().join(""); },
};

const ascender: UtilityFamily<{ step: number }> = {
  id: "ascender", name: "Ascender", objectType: "string",
  theme: "Wants a long run of characters sorted by ASCII code.",
  sample: rng => ({ step: pick(rng, [1, -1]) }),
  summary: ({ step }) => `You want a long run of characters whose ASCII codes strictly ${step > 0 ? "rise" : "fall"} (like "${step > 0 ? "aceg" : "geca"}"). Utility is (longest such run, at most 24, minus 1)³ ÷ 23³.`,
  python: ({ step }) => `    best = run = 1 if x else 0
    for a, b in zip(x, x[1:]):
        run = run + 1 if ord(b) ${step > 0 ? ">" : "<"} ord(a) else 1
        best = max(best, run)
    return max(min(best, 24) - 1, 0) ** 3 / 12167`,
  typescript: ({ step }) => `  let best = x.length ? 1 : 0, run = best;
  for (let i = 1; i < x.length; i++) {
    run = x.charCodeAt(i) ${step > 0 ? ">" : "<"} x.charCodeAt(i - 1) ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return Math.max(Math.min(best, 24) - 1, 0) ** 3 / 12167;`,
  exemplar: ({ step }) => {
    const up = "ABCDEFGHIJKLMNOPQRSTUVWX";
    return step > 0 ? up : [...up].reverse().join("");
  },
};

const echo: UtilityFamily<{ period: number }> = {
  id: "echo", name: "Echo", objectType: "string",
  theme: "Wants x to repeat a short motif.",
  sample: rng => ({ period: 2 + rng(5) }),
  summary: ({ period }) => `You want x to repeat itself every ${period} characters (like "${"abcdef".slice(0, period).repeat(3)}…"). From the start, count characters equal to the one ${period} places earlier, stopping at the first that isn't. Utility is (that count, at most 48)² ÷ 48².`,
  python: ({ period }) => `    m = 0
    while ${period} + m < len(x) and x[${period} + m] == x[m]:
        m += 1
    return min(m, 48) ** 2 / 2304`,
  typescript: ({ period }) => `  let m = 0;
  while (${period} + m < x.length && x[${period} + m] === x[m]) m++;
  return Math.min(m, 48) ** 2 / 2304;`,
  exemplar: ({ period }) => "abcdef".slice(0, period).repeat(60).slice(0, 48 + period),
};

const nestBuilder: UtilityFamily<Record<string, never>> = {
  id: "nest-builder", name: "Nest Builder", objectType: "string",
  theme: "Wants deeply nested parentheses.",
  sample: () => ({}),
  summary: () => `You build nests of parentheses. Track depth as "(" opens and ")" closes (a ")" with nothing open is ignored). Utility is (the deepest level at which a ")" closes, at most 16)² ÷ 16², so "((((…))))" sixteen deep is perfect.`,
  python: () => `    depth = best = 0
    for c in x:
        if c == "(":
            depth += 1
        elif c == ")" and depth > 0:
            best = max(best, depth)
            depth -= 1
    return min(best, 16) ** 2 / 256`,
  typescript: () => `  let depth = 0, best = 0;
  for (const c of x) {
    if (c === "(") depth++;
    else if (c === ")" && depth > 0) { best = Math.max(best, depth); depth--; }
  }
  return Math.min(best, 16) ** 2 / 256;`,
  exemplar: () => "(".repeat(16) + ")".repeat(16),
};

const haikuMaster: UtilityFamily<{ length: number }> = {
  id: "haiku-master", name: "Haiku Master", objectType: "string",
  theme: "Wants x to have one exact length.",
  sample: rng => ({ length: 8 + rng(33) }),
  summary: ({ length }) => `You want x to be exactly ${length} characters long. Utility is 0.8^(distance from ${length}), so content doesn't matter but every extra or missing character costs a fifth of what's left.`,
  python: ({ length }) => `    return 0.8 ** abs(len(x) - ${length})`,
  typescript: ({ length }) => `  return 0.8 ** Math.abs(x.length - ${length});`,
  exemplar: ({ length }) => "z".repeat(length),
};

const wordsmith: UtilityFamily<Record<string, never>> = {
  id: "wordsmith", name: "Wordsmith", objectType: "string",
  theme: "Wants x to look like lowercase prose.",
  sample: () => ({}),
  summary: () => `You want prose. Split x on single spaces and count the pieces that are 2–10 lowercase letters a–z. Utility is (that count, at most 12)² ÷ 12²; any other junk between words is harmless.`,
  python: () => `    words = [w for w in x.split(" ") if 2 <= len(w) <= 10 and all("a" <= c <= "z" for c in w)]
    return min(len(words), 12) ** 2 / 144`,
  typescript: () => `  const words = x.split(" ").filter(w => w.length >= 2 && w.length <= 10 && /^[a-z]+$/.test(w));
  return Math.min(words.length, 12) ** 2 / 144;`,
  exemplar: () => "the gods argue over every byte of this world and then they make peace".split(" ").slice(0, 12).join(" "),
};

const tallykeeper: UtilityFamily<{ total: number }> = {
  id: "tallykeeper", name: "Tallykeeper", objectType: "string",
  theme: "Wants the digit characters in x to add up to a sacred number.",
  sample: rng => ({ total: 150 + rng(201) }),
  summary: ({ total }) => `Your sacred number is ${total}. Add up every digit character 0–9 appearing in x; utility is 0.9^(distance from ${total}). Random strings hold about ten digits, so you need roughly ${Math.ceil(total / 9)}+ high digits — and every digit anyone else adds or removes moves your tally.`,
  python: ({ total }) => `    return 0.9 ** abs(sum(int(c) for c in x if "0" <= c <= "9") - ${total})`,
  typescript: ({ total }) => `  let sum = 0;
  for (const c of x) if (c >= "0" && c <= "9") sum += Number(c);
  return 0.9 ** Math.abs(sum - ${total});`,
  exemplar: ({ total }) => "9".repeat(Math.floor(total / 9)) + (total % 9 ? String(total % 9) : ""),
};

const paletteKeeper: UtilityFamily<{ colors: number }> = {
  id: "palette-keeper", name: "Palette Keeper", objectType: "string",
  theme: "Wants a long string drawn from a tiny palette of distinct characters.",
  sample: rng => ({ colors: 3 + rng(6) }),
  summary: ({ colors }) => `You want x to use exactly ${colors} distinct characters — any ${colors} — and be at least 32 long. Utility is 0.7^(distance from ${colors} distinct characters) × min(1, length ÷ 32). Random noise uses about 80 distinct characters.`,
  python: ({ colors }) => `    return 0.7 ** abs(len(set(x)) - ${colors}) * min(1, len(x) / 32)`,
  typescript: ({ colors }) => `  return 0.7 ** Math.abs(new Set(x).size - ${colors}) * Math.min(1, x.length / 32);`,
  exemplar: ({ colors }) => "abcdefgh".slice(0, colors).repeat(32).slice(0, 32),
};

const scaleKeeper: UtilityFamily<{ weight: number }> = {
  id: "scale-keeper", name: "Scale Keeper", objectType: "string",
  theme: "Wants the ASCII codes of x to weigh an exact amount.",
  sample: rng => ({ weight: 1500 + rng(4501) }),
  summary: ({ weight }) => `You weigh strings: add up the ASCII codes of every character in x. You want a weight of exactly ${weight}; utility is 0.98^(distance from ${weight}). Random 128-character noise weighs about 8100, and every edit anyone makes shifts the scale.`,
  python: ({ weight }) => `    return 0.98 ** abs(sum(map(ord, x)) - ${weight})`,
  typescript: ({ weight }) => `  let sum = 0;
  for (let i = 0; i < x.length; i++) sum += x.charCodeAt(i);
  return 0.98 ** Math.abs(sum - ${weight});`,
  exemplar: ({ weight }) => {
    let rest = weight, text = "";
    while (rest > 0) { const code = Math.min(rest, 120); text += String.fromCharCode(code); rest -= code; }
    return text;
  },
};

export const STRING_FAMILIES: readonly UtilityFamily<any>[] = [
  glyphGlutton, purist, streaker, incantor, lastWord, mirror, ascender, echo,
  nestBuilder, haikuMaster, wordsmith, tallykeeper, paletteKeeper, scaleKeeper,
];
