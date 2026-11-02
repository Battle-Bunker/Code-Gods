// Generates test/parity/cases.json: the requests the Python parity test replays against the golden
// results recorded from the former Wasmtime host (test/parity/golden.json).
// Run: node --experimental-strip-types test/parity/make-cases.mjs
import { writeFileSync, readFileSync } from "node:fs";
import { defaultSettingsFor } from "../../../game-core/src/index.ts";
import { objectType, instantiate, OBJECT_TYPES } from "../../../game-types/src/index.ts";
import { seededRng } from "../../../game-types/src/util.ts";

const here = new URL(".", import.meta.url);
const fixture = JSON.parse(readFileSync(new URL("../fixture-prelude.json", here), "utf8"));
const vectors = JSON.parse(readFileSync(new URL("../ast-bits-v1-vectors.json", here), "utf8"));
const tables = JSON.parse(readFileSync(new URL("../../python/ast_bits_v1.json", here), "utf8"));
const roomy = { ...fixture, interactionComputeMs: 1000 };
const strings = { ...roomy, objectType: "string", wireMaxLength: 256 };
const small = { ...roomy, stepBudget: 1000 };
const agent = body => `def agent(x):\n    return ${body}\n`;
const EPOCH_US = 1767225600n * 1000000n;
const cases = [], settingsTable = [], interned = new Map();
const intern = settings => {
  const key = JSON.stringify(settings);
  if (!interned.has(key)) { interned.set(key, settingsTable.length); settingsTable.push(settings); }
  return interned.get(key);
};
const add = (id, request) => cases.push({ id, ...request, ...(request.settings ? { settings: intern(request.settings) } : {}) });
const act = (id, source, input = 1, settings = roomy, seed = "1") => add(id, { mode: "act", source, input, settings, seed });
const inspect = (id, source, settings = roomy, pricingScheme) => add(id, { mode: "inspect", source, settings, ...(pricingScheme ? { pricingScheme } : {}) });

// --- Fixture prelude: calls, randomness, clock, steps, errors, output boundary, capabilities.
const fixtureAgents = {
  inc: agent("[add(x + 1)]"),
  empty: agent("[]"),
  program: "import math\nSTEP = 3\ndef helper(n):\n    return n * STEP\nclass Box:\n    pass\ndef agent(grid):\n    return [add(helper(grid)), add(math.isqrt(81))]\n",
  random3: agent("[add(__import__('random').getrandbits(30)) for _ in range(3)]"),
  randomFresh: agent("[add(__import__('random').Random().getrandbits(20))]"),
  randomReseed: "import random\nrandom.seed()\ndef agent(x):\n    return [add(random.getrandbits(20))]\n",
  randomModule: "import random\nR = random.random()\ndef agent(x):\n    return []",
  randomChoice: "import random\ndef agent(x):\n    xs = list(range(10))\n    random.shuffle(xs)\n    return [add(random.choice(xs) + random.randint(0, 99) * 10 + int(random.gauss(0, 1) * 1000))]\n",
  urandom: agent("[add(int.from_bytes(len.__self__.__import__('os').urandom(4)))]"),
  urandomHex: agent("[add(len.__self__.__import__('os').urandom(16).hex())]"),
  clock: agent(`[add(int(t.time() * 1e6) - ${EPOCH_US}) for t in [__import__('time')] * 3]`),
  clockNs: agent(`[add(__import__('time').time_ns() - ${EPOCH_US * 1000n}), add(__import__('time').monotonic_ns() - ${EPOCH_US * 1000n})]`),
  clockEscape: agent(`[add(int(len.__self__.__import__('time').time() * 1e6) - ${EPOCH_US})]`),
  sleep: agent("[add(__import__('time').sleep(0.1))]"),
  loop1000: "def agent(x):\n    s = 0\n    for i in range(1000):\n        s += i\n    return [add(s)]\n",
  loop100: "def agent(x):\n    s = 0\n    for i in range(100):\n        s += i\n    return [add(s)]\n",
  swallow: "def agent(x):\n    try:\n        while True:\n            pass\n    except BaseException:\n        return [add(1)]\n",
  moduleLoop: "while True:\n    pass\ndef agent(x):\n    return []\n",
  zero: agent("[add(x // 0)]"),
  moduleRaise: "raise ValueError('top')\ndef agent(x):\n    return []",
  deleted: "def agent(x):\n    return []\ndel agent",
  readOnly: "import math\nmath.memo = 1\ndef agent(x):\n    return []",
  readOnlyDel: "import math\ndel math.pi\ndef agent(x):\n    return []",
  private: agent("[add(__import__('math')._ns)]"),
  decimalPrec: agent("[add(__import__('decimal').getcontext().prec)]"),
  decimalSet: "import decimal\ndecimal.getcontext().prec = 5\ndef agent(x):\n    return []",
  environ: agent("[add(len(__import__('os').environ))]"),
  environEscape: agent("[add(len(len.__self__.__import__('os').environ))]"),
  evalBlocked: agent("[add(eval('1'))]"),
  idBlocked: agent("[add(id(x))]"),
  openBlocked: agent("[add(open)]"),
  systemRandom: agent("[add(__import__('random').SystemRandom().random())]"),
  imports: "from collections import Counter\nfrom math import *\nimport collections.abc\ndef agent(x):\n    return [add(Counter('aab')['a'] + isqrt(9))]\n",
  sameEverything: "import random, time\nfrom collections import Counter\ndef agent(x):\n    r = random.random()\n    return [add(int(r * 1e9)), add(int(time.perf_counter_ns())), add(len(repr(object())))]\n",
  objectRepr: agent("[add(repr(object()))]"),
  notJson: "def __encode_calls(c):\n    return 'not json'\ndef agent(x):\n    return []\n",
  forgedDumps: "_DUMPS = lambda *a, **k: '[[\"forged\",{}]]'\ndef agent(x):\n    return []",
  shadowAdd: "def add(k):\n    return {'__m': 'forged', 'k': k}\ndef agent(x):\n    return [add(x)]\n",
  oversized: agent("[add('a' * 70000)]"),
  malformed: agent("[{}]"),
  printNothing: agent("(print('[[\"add\",{\"k\":0}]]'), [])[1]"),
  printEscape: agent("(len.__self__.print('[[\"add\",{\"k\":0}]]'), [])[1]"),
  recursion: "def f(n):\n    return f(n)\ndef agent(x):\n    return [add(f(x))]\n",
  poisonBuiltins: "builtins = len.__self__\nbuiltins._poison = getattr(builtins, '_poison', 0) + 1\ndef agent(x):\n    return [add(builtins._poison)]\n",
  poisonMath: "math = len.__self__.__import__('math')\nmath._poison = getattr(math, '_poison', 0) + 1\ndef agent(x):\n    return [add(math._poison)]\n",
  poisonJson: "_JSON.dumps = lambda *a, **k: 'poison'\ndef agent(x):\n    return []",
  regex: agent("[add(len(__import__('re').findall('[a-z]+', 'abc def ghi')))]"),
  hashing: agent("[add(__import__('hashlib').sha256(b'x').hexdigest())]"),
  fractions: agent("[add(str(__import__('fractions').Fraction(x, 3)))]"),
  statistics: agent("[add(__import__('statistics').mean([x, x + 2]))]"),
  jsonLoads: agent("[add(__import__('json').loads('{\"a\": [1, 2]}')['a'][1])]"),
  itertools: agent("[add(len(list(__import__('itertools').permutations(range(5)))))]"),
  functools: agent("[add(__import__('functools').reduce(lambda a, b: a * b, range(1, 10)))]"),
  operator: agent("[add(__import__('operator').mul(x, 6))]"),
  astModule: agent("[add(len(__import__('ast').dump(__import__('ast').parse('1+2'))))]"),
  bigint: agent("[add(len(str(3 ** 1000)))]"),
  floats: agent("[add(repr(0.1 + 0.2))]"),
  hashStable: agent("[add(hash('code-gods') % 1000003)]"),
  setOrder: agent("[add(','.join(sorted({'b', 'a', 'c'})) + ':' + ','.join(list({'x', 'y', 'z', 'w'})))]"),
};
const encoders = {
  strSubclass: "type('S', (str,), {})('[]')", hookStr: "type('str', (str,), {'__str__': lambda self: sum(iter(lambda: 1, 0))})('[]')",
  bytes: "b'[]'", none: "None", int: "1", nonAscii: "'[\"é\"]'", surrogate: "'\\udc80'", over: "'[' * 65537", exact: "'[' * 65536",
};
for (const [name, body] of Object.entries(encoders))
  fixtureAgents[`encoder_${name}`] = `def __encode_calls(c):\n    return ${body}\ndef agent(x):\n    return []\n`;
const capabilities = ["open('/etc/passwd').read()", "B.open('/etc/passwd').read()", "B.open('/lib/python3.15/random.py').read()",
  "B.open('/tmp/owned', 'w').write('bad')", "B.__import__('os').write(1, b'forged')", "B.__import__('os').read(0, 1)",
  "B.__import__('os').listdir('/lib')", "B.__import__('socket').socket()", "B.__import__('os').system('true')",
  "B.__import__('sys').exit(0)", "int(B.__import__('os').stat('/lib/python3.15/os.py').st_mtime)",
  "__import__('socket').socket()"];
capabilities.forEach((body, i) => { fixtureAgents[`capability_${i}`] = agent(body.replaceAll("B.", "len.__self__.")); });
// Inventory workloads (python/inventory.py).
const inventory = {
  math: ["__import__('math').isqrt(x)", 81], itertools: ["sum(__import__('itertools').islice(__import__('itertools').count(), x))", 5],
  functools: ["__import__('functools').reduce(lambda a,b:a+b, range(x))", 5], collections: ["__import__('collections').Counter(x)['a']", "banana"],
  re: ["__import__('re').sub('[0-9]', '', x)", "a1b2"], json: ["__import__('json').loads(x)['a']", '{"a":"b"}'],
  decimal: ["int(__import__('decimal').Decimal(x).sqrt())", 81], fractions: ["int(__import__('fractions').Fraction(x, 3))", 9],
  statistics: ["int(__import__('statistics').mean([x, x+2]))", 2], hashlib: ["__import__('hashlib').sha256(x.encode()).hexdigest()", ""],
};
for (const [name, source] of Object.entries(fixtureAgents)) {
  inspect(`fixture/${name}/inspect`, source);
  act(`fixture/${name}/act`, source, 41, roomy, "7");
}
for (const seed of ["1", "42", "0x2a", "43", "18446744073709551615", "0"]) {
  for (const name of ["random3", "randomFresh", "randomReseed", "randomChoice", "urandom", "urandomHex", "sameEverything"])
    act(`fixture/${name}/seed-${seed}`, fixtureAgents[name], 3, roomy, seed);
}
for (const input of [0, -5, 2 ** 53 - 1, -(2 ** 53 - 1)]) act(`fixture/inc/input-${input}`, fixtureAgents.inc, input);
for (const name of ["loop1000", "loop100", "swallow", "moduleLoop"]) act(`fixture/${name}/small`, fixtureAgents[name], 1, small);
for (const [name, [body, input]] of Object.entries(inventory))
  act(`inventory/${name}`, `def agent(x):\n    return [add(${body})]\n`, input, typeof input === "number" ? roomy : strings);
act("strings/len", agent("[add(len(x[::-1]))]"), "abc", strings);
act("strings/nul", agent("[add(len(x))]"), "a\0\n".repeat(80), strings);
for (const bad of [2 ** 53, 1.5, "é", "a".repeat(257)]) act(`domain/${JSON.stringify(bad).slice(0, 12)}`, fixtureAgents.empty, bad, strings);
for (const seed of ["", "-1", "18446744073709551616", "0x1ffffffffffffffff", "1.5", "abc"]) act(`seed/${seed || "empty"}`, fixtureAgents.empty, 1, roomy, seed);
for (const [name, source] of Object.entries({
  lambda: "lambda x: x", agentx: "def agentx(x):\n    return []", nested: "def f():\n    def agent(x):\n        return []",
  async: "async def agent(x):\n    return []", noArgs: "def agent():\n    return []", twoArgs: "def agent(a, b):\n    return []",
  kwOnly: "def agent(x, *, k):\n    return []", twice: "def agent(x):\n    return []\ndef agent(x):\n    return []",
  unclosed: "def agent(x):\n    return [add(x)", default: "def agent(x, y=1):\n    return []", varargs: "def agent(*args):\n    return []",
  sysExit: "import sys\nsys.exit(42)\ndef agent(x):\n    return []", identity: "def agent(x):\n    return x",
  templateString: "def agent(x):\n    return [t'{x}']\n", deep: "(".repeat(16000), unicode: "def agent(x):\n    café = 1\n    return [add(café)]\n",
  literalMove: "def agent(grid):\n    return [add(3)]\n",
})) inspect(`grammar/${name}`, source);
// Prelude / settings failures.
const prelude = (key, python) => ({ ...roomy, prelude: { ...roomy.prelude, key, python } });
act("prelude/broken", fixtureAgents.inc, 1, prelude("broken", "def __decode(:\n"));
act("prelude/raising", fixtureAgents.inc, 1, prelude("raising", "raise SystemExit(3)\n"));
act("prelude/no-encoder", fixtureAgents.inc, 1, prelude("no-encoder", "def __decode(w):\n    return w\n"));
act("prelude/doubled", fixtureAgents.inc, 4, prelude("doubled", roomy.prelude.python + "\ndef __decode(w):\n    return 2 * w\n"));
act("prelude/slow", fixtureAgents.inc, 3, prelude("slow", roomy.prelude.python + "\n_TABLE = sum(range(3_000_000))\ndef __decode(w):\n    sum(range(3_000_000))\n    return w\n"));

// --- ast-bits-v1 vectors (python/test_astbits.py's grid-lab vocabulary and prelude), both schemes.
const COLOURS = ["red", "orange", "yellow", "green", "blue", "violet"];
const NON_MUTATORS = new Set(["cell", "row", "column", "diagonal", "block", "ring", "moves", "core", "everything", "best_line", "score", "D4_MOVES", ...COLOURS]);
const gridlabVocab = {
  api: tables.vocab.api, attrs: tables.vocab.api_attrs, params: tables.vocab.api_params, strings: tables.vocab.strings,
  mutators: tables.vocab.api.filter(n => !NON_MUTATORS.has(n)),
  areas: ["cell", "row", "column", "diagonal", "block", "ring", "core", "everything", "best_line"],
};
let gridlabPrelude = `
import json as _J
_COLOURS = ${JSON.stringify(COLOURS).replaceAll('","', "', '").replace('["', "['").replace('"]', "']")}
def __decode(w):
    return w
def __encode_calls(calls):
    return _J.dumps([[c["__m"], {k: v for k, v in c.items() if k != "__m"}] for c in calls], separators=(",", ":"))
def _c(x):
    if isinstance(x, str):
        return _COLOURS.index(x)
    if isinstance(x, int) and not isinstance(x, bool) and 0 <= x < len(_COLOURS):
        return x
    raise ValueError(x)
def _area(a):
    if not (isinstance(a, tuple) and len(a) == 2 and isinstance(a[0], str)):
        raise ValueError(a)
    return {"kind": a[0], "region": a[1]}
def row(i):
    return ("line", (0, i))
def column(j):
    return ("line", (1, j))
def cell(r, c):
    return ("cell", (r, c))
everything = ("all", ())
core = ("core", ())
best_line = ("line*", ())
def move(mutator, **fields):
    return {"__m": mutator, **fields}
def paint(area, colour):
    return {"__m": "paint", **_area(area), "colour": _c(colour)}
def paint_row(i, colour):
    return paint(row(i), colour)
def write(area, symbol):
    return {"__m": "write", **_area(area), "symbol": symbol}
`;
for (const c of COLOURS) gridlabPrelude += `${c} = '${c}'\n`;
const gridlab = { ...roomy, prelude: { ...roomy.prelude, key: "gridlab-vocab", python: gridlabPrelude, pricing: { python: gridlabVocab } } };
for (const scheme of ["corpus", "uniform"])
  for (const [name, vector] of Object.entries(vectors.programs)) inspect(`astbits/${scheme}/${name}`, vector.source, gridlab, scheme);
for (const [name, source] of Object.entries({
  userPaint: "def paint(a, c):\n    return []\ndef agent(grid):\n    return [paint_row(2, 'red')]\n",
  shadowed: "def paint_row(a, c):\n    return []\ndef agent(grid):\n    return [paint_row(2, 'red')]\n",
  mauve: "def agent(grid):\n    return [paint_row(2, 'mauve')]\n",
  renameA: "def agent(grid):\n    best = max(grid.cells)\n    return [best]\n",
  renameB: "def agent(g):\n    zz = max(g.cells)\n    return [zz]\n",
})) inspect(`astbits/extra/${name}`, source, gridlab, "corpus");
// The universal codes, evaluated by the guest's own astbits module (trusted path, tests only).
add("astbits/codes", { mode: "codes", gamma: Object.keys(vectors.codes.gamma).map(Number), strings: Object.keys(vectors.codes.string) });

// --- Every object type's default Python prelude, with realistic agents.
export const REALISTIC = {
  Grid: `def agent(grid):
    best = None
    for line in grid.rows + grid.columns + grid.diagonals:
        counts = {}
        for c in line:
            counts[c.colour] = counts.get(c.colour, 0) + 1
        colour = max(counts, key=counts.get)
        if best is None or counts[colour] > best[0]:
            best = (counts[colour], line, colour)
    groups = grid.regions(lambda a, b: a.colour == b.colour)
    big = max(groups, key=len)
    target = big[0].colour
    calls = [paint(row(best[1][0].row), best[2])]
    if len(big) < grid.size * grid.size:
        calls.append(recolour(everything(), next_colour(target), target))
    return calls
`,
  Int: "def agent(x):\n    ds = digits(x)\n    best = max(range(len(ds)), key=lambda i: ds[i])\n    return [add(sum(ds) % 7 + 1), set_digit(0, ds[best])]\n",
  string: "def agent(s):\n    counts = {}\n    for ch in s:\n        counts[ch] = counts.get(ch, 0) + 1\n    common = max(counts, key=counts.get) if counts else 'a'\n    return [insert(0, common), reverse()]\n",
};
const gridAll = readFileSync(new URL("../../../game-types/test/mutators-grid.test.ts", here), "utf8").match(/const PY_AGENT = `([^`]*)`/)[1].replaceAll("\\\\", "\\");
export function roomSettings(id, language, typeArgs) {
  const s = defaultSettingsFor(id, language, typeArgs);
  const inst = instantiate(s.objectType, s.typeArgs), T = objectType(inst.objectType), parts = T.prelude(inst);
  const settings = { objectType: inst.objectType, wireMaxLength: T.codec(inst).maxLength, interactionComputeMs: s.interactionComputeMs,
    stepBudget: s.stepBudget, prelude: { key: parts.hash, python: parts.python, js: parts.js, dts: parts.dts, pricing: parts.pricing } };
  const rng = seededRng(`code-gods:parity:${inst.key}`);
  const inputs = Array.from({ length: 3 }, () => T.codec(inst).encode(T.spawn(inst, rng)));
  return { settings, inputs };
}
for (const type of OBJECT_TYPES) {
  const variants = type.id === "Grid" ? [undefined, { size: 5, symbols: "base10", colours: "rgby" }] : [undefined];
  for (const typeArgs of variants) {
    const { settings, inputs } = roomSettings(type.id, "python", typeArgs);
    const tag = `${type.id}${typeArgs ? "-" + Object.values(typeArgs).join("-") : ""}`;
    const sources = { empty: "def agent(x):\n    return []", realistic: REALISTIC[type.id], ...(type.id === "Grid" ? { all: gridAll } : {}) };
    for (const [name, source] of Object.entries(sources)) {
      inspect(`types/${tag}/${name}/inspect`, source, settings);
      inputs.forEach((input, i) => ["5", "0xdeadbeef"].forEach(seed => act(`types/${tag}/${name}/act-${i}-${seed}`, source, input, settings, seed)));
    }
  }
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  writeFileSync(new URL("./cases.json", here), JSON.stringify({ settings: settingsTable, cases }, null, 1) + "\n");
  console.log(cases.length, "cases");
}
