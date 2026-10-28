"""ast-bits-v1: a prefix-free description code over real Python ASTs (docs/open-agents.md §2).

An agent's description length is the length, in bits, of the codeword of its module AST under a fixed,
published probability model. The AST is written out in preorder (Python's own `_fields` order) as a
sequence of choices; each choice is made from a finite alternative set fixed by what came before, and
costs -log2 p(choice | context):

* **structure** — at every node position (parent class, field) the node class is drawn from
  p(class | parent, field). Sequence fields add an `<end>` alternative, optional fields `<none>`.
  Sequences whose length another field fixes (`Compare.comparators`, `Dict.values`, ...) code no end.
  Operators, `arguments`, `keyword`, ... are nodes like any other; `ctx` is implied by position.
* **names** — identifiers are not spelled. Every scope numbers its variables in order of first
  appearance (alpha-equivalence: renaming never changes the price). A load chooses among the user
  variables of the visible scopes (uniformly, counting one "a new one" per scope) with probability
  1 - P_EXT, or an external name (builtins + the agent API, weighted by the published frequency
  table) with probability P_EXT. A
  store chooses among the current scope's variables, "a new one", and names declared global/nonlocal.
  Attributes, keyword-argument names and module paths come from published vocabularies with an
  escape to a spelled-out string.
* **literals** — universal codes: non-negative ints Elias gamma γ(v+1); strings γ(len+1) + log2 98
  per printable ASCII character (an escape codes any other code point as γ(cp+1)); bytes γ(len+1) +
  8/byte; floats γ(len(repr)+1) + log2 18 per character of repr; bools 1 bit.
* **moves** — a call whose callee is an API mutator constructor and whose arguments are all literal
  (constants, colour names, area constructors on literals) is a *literal move*: a flag (p = Q_MOVE),
  then the existing mutator code: log2(#mutators available) + the mutator's field code D
  (`Mutator.describe_bits`). Every spelling of the same move costs the same.

One walker drives a `coder` (charges a given AST), a `sampler` (draws an AST from the same model; the
Kraft check) and a `counter` (gathers corpus statistics for the tables). Tables: `ast_bits_v1.json`
(built by `python3 -m gridlab.openagents.build_tables`). Schemes: "corpus" (default: weights estimated
from the CPython 3.13 standard library, add-one smoothed), "uniform" (every alternative equally
likely), and "ast-bytes" (8 bits per node, 8 per literal byte, names free: exactly 8 × ast-bytes-v1,
which is what this code generalises; NOT a prefix code).
"""
from __future__ import annotations

import ast
import builtins
import json
import math
from functools import lru_cache
from pathlib import Path
from typing import Optional

import numpy as np

from ..core import GridType
from ..mutators import available, by_id

log2 = math.log2
VERSION = "ast-bits-v1"
TABLE_PATH = Path(__file__).resolve().parent / "ast_bits_v1.json"
P_EXT = 0.5          # p(a load names an external: a builtin or an API name) when user variables are visible
Q_MOVE = 1 / 8       # p(a call is a literal move)
END, NONE, NEW, ESC, STAR = "<end>", "<none>", "<new>", "<esc>", "*"
STR_ALPHABET = [chr(c) for c in range(32, 127)] + ["\n", "\t"]      # 97 symbols + escape = 98
FLOAT_ALPHABET = "0123456789.e+-infa"                               # 18 symbols: repr(float)
DEPRECATED = {"Num", "Str", "Bytes", "NameConstant", "Ellipsis", "Index", "ExtSlice", "Suite", "Param",
              "AugLoad", "AugStore", "slice", "_ast_Ellipsis"}
SCOPE_NODES = ("FunctionDef", "AsyncFunctionDef", "Lambda", "ClassDef", "ListComp", "SetComp", "DictComp",
               "GeneratorExp")


# ------------------------------------------------------------------------------------------------
# universal codes
# ------------------------------------------------------------------------------------------------
def gamma_bits(n: int) -> int:
    """Elias gamma length of n ≥ 1: 2⌊log2 n⌋ + 1."""
    assert n >= 1
    return 2 * (n.bit_length() - 1) + 1


def string_bits(s: str) -> float:
    b = gamma_bits(len(s) + 1)
    for ch in s:
        b += log2(98)
        if ch not in _STR_SET:
            b += gamma_bits(ord(ch) + 1)
    return b


_STR_SET = frozenset(STR_ALPHABET)


def float_bits(v: float) -> float:
    r = repr(float(v))
    return gamma_bits(len(r) + 1) + len(r) * log2(len(FLOAT_ALPHABET))


# ------------------------------------------------------------------------------------------------
# the grammar (derived from Python's ASDL via the ast module, then fixed in the table)
# ------------------------------------------------------------------------------------------------
TARGET_FIELDS = {("Assign", "targets"), ("AugAssign", "target"), ("AnnAssign", "target"), ("For", "target"),
                 ("AsyncFor", "target"), ("comprehension", "target"), ("withitem", "optional_vars"),
                 ("NamedExpr", "target"), ("Delete", "targets"), ("TypeAlias", "name")}
IDENT_ROLES = {("FunctionDef", "name"): "bind", ("AsyncFunctionDef", "name"): "bind", ("ClassDef", "name"): "bind",
               ("arg", "arg"): "bind", ("ExceptHandler", "name"): "bind", ("MatchAs", "name"): "bind",
               ("MatchStar", "name"): "bind", ("MatchMapping", "rest"): "bind", ("TypeVar", "name"): "bind",
               ("ParamSpec", "name"): "bind", ("TypeVarTuple", "name"): "bind", ("Name", "id"): "name",
               ("Attribute", "attr"): "attr", ("MatchClass", "kwd_attrs"): "attr", ("keyword", "arg"): "kwarg",
               ("Global", "names"): "global", ("Nonlocal", "names"): "nonlocal", ("ImportFrom", "module"): "modpath"}
INT_ROLES = {("ImportFrom", "level"): "level", ("FormattedValue", "conversion"): "conversion",
             ("comprehension", "is_async"): "is_async", ("AnnAssign", "simple"): "simple"}
IMPLIED = {("arguments", "kw_defaults"): "kwonlyargs", ("Dict", "values"): "keys", ("Compare", "comparators"): "ops",
           ("MatchClass", "kwd_patterns"): "kwd_attrs", ("MatchMapping", "patterns"): "keys"}
ELEM_OPT = {("arguments", "kw_defaults"), ("Dict", "keys")}
OUTER = {"FunctionDef": {"name", "decorator_list", "returns", "type_params"},
         "AsyncFunctionDef": {"name", "decorator_list", "returns", "type_params"},
         "ClassDef": {"name", "bases", "keywords", "decorator_list", "type_params"}}
CONVERSIONS = [-1, 115, 114, 97]
CONST_KINDS = ["int", "float", "complex", "str", "bytes", "bool", "None", "Ellipsis"]


def _field_kind(cls: str, fname: str, tp) -> dict:
    s = str(tp)
    if fname in ("ctx", "type_comment") or (cls, fname) in (("Constant", "kind"), ("Module", "type_ignores")):
        return {"k": "skip"}
    if (cls, fname) in IDENT_ROLES:
        mult = "seq" if s.startswith("list[") else ("opt" if "None" in s else "one")
        return {"k": "ident", "role": IDENT_ROLES[(cls, fname)], "m": mult}
    if (cls, fname) in INT_ROLES:
        return {"k": "int", "role": INT_ROLES[(cls, fname)]}
    if (cls, fname) in (("Constant", "value"), ("MatchSingleton", "value")):
        return {"k": "const"}
    if cls == "alias":
        return {"k": "special"}
    seq = s.startswith("list[")
    opt = "| None" in s or "None |" in s
    inner = s[5:-1] if seq else s.replace(" | None", "")
    cat = inner.replace("<class '", "").replace("'>", "").replace("ast.", "")
    d = {"k": "node", "cat": cat}
    if (cls, fname) in IMPLIED:
        d["m"] = "implied"
        d["len"] = IMPLIED[(cls, fname)]
        d["eopt"] = (cls, fname) in ELEM_OPT
    elif seq:
        d["m"] = "seq_opt" if (cls, fname) in ELEM_OPT else "seq"
    else:
        d["m"] = "opt" if opt else "one"
    if (cls, fname) in TARGET_FIELDS:
        d["target"] = True
    return d


def derive_grammar() -> dict:
    """{"categories": {cat: [classes]}, "classes": {cls: [[field, kind], ...]}} from the running `ast`."""
    import inspect
    cats: dict = {}
    classes: dict = {}
    for n, c in sorted(vars(ast).items()):
        if not (inspect.isclass(c) and issubclass(c, ast.AST)) or c is ast.AST or n in DEPRECATED:
            continue
        base = c.__mro__[1]
        if base is ast.AST:
            if any(s.__name__ not in DEPRECATED for s in c.__subclasses__()):
                continue                        # an abstract sum type
            cat = n                             # a product type is its own one-member category
        else:
            cat = base.__name__
        if cat in ("expr_context", "type_ignore") or n in ("Interactive", "Expression", "FunctionType"):
            continue
        cats.setdefault(cat, []).append(n)
        classes[n] = [[f, _field_kind(n, f, c._field_types.get(f, object))] for f in c._fields]
    return {"categories": cats, "classes": classes}


# ------------------------------------------------------------------------------------------------
# vocabularies
# ------------------------------------------------------------------------------------------------
def allowed_builtins() -> list:
    from .sandbox import BLOCKED_BUILTINS
    return sorted(n for n in vars(builtins) if not n.startswith("_") and n not in BLOCKED_BUILTINS)


def api_attrs() -> list:
    """Attributes and methods of the objects the API hands an agent (grid view, cells, moves, areas)."""
    from .. import kid
    from .api import GridView, Move, Area
    names = set()
    for cls in (kid.Grid, kid.Cell, GridView):
        names |= {n for n in dir(cls) if not n.startswith("_")}
    names |= {"left", "right", "up", "down", "up_left", "up_right", "down_left", "down_right", "row", "col",
              "symbol", "value", "colour", "size", "palette"}
    names |= {"mid", "params", "key", "kind", "region"}
    return sorted(names)


def api_params() -> list:
    """Every parameter name of every API constructor (for keyword arguments)."""
    import inspect
    from .api import constructors
    out = set()
    for f in constructors(GridType()).values():
        if callable(f):
            try:
                out |= set(inspect.signature(f).parameters)
            except (TypeError, ValueError):
                pass
    out |= {"kind", "region", "colour", "pair", "symbol", "k", "layer", "near", "line", "axis", "move", "dir",
            "start", "pattern", "style", "side", "key", "shift", "recipe", "suit"}
    out.discard("fields")
    return sorted(out)


def externals() -> list:
    from .api import API_NAMES
    return sorted(set(allowed_builtins()) | set(API_NAMES))


# ------------------------------------------------------------------------------------------------
# probability tables
# ------------------------------------------------------------------------------------------------
class Tables:
    """The published model: a grammar plus counts, turned into distributions by a scheme."""

    def __init__(self, data: dict, scheme: str = "corpus"):
        assert scheme in ("corpus", "uniform")
        self.data, self.scheme = data, scheme
        self.grammar = data["grammar"]
        self.cats = self.grammar["categories"]
        self.classes = self.grammar["classes"]
        self.cat_of = {c: k for k, v in self.cats.items() for c in v}
        self.counts = data["counts"]
        self.voc = data["vocab"]
        self._node: dict = {}
        self._dist: dict = {}
        self.ext_set = frozenset(self.voc["externals"])
        b = self._closed(self.voc["builtins"], self.counts["builtins"])
        api = {n: 1.0 / len(self.voc["api"]) for n in self.voc["api"]}
        ext = {}
        for n in self.voc["externals"]:
            ext[n] = 0.5 * b.get(n, 0.0) + 0.5 * api.get(n, 0.0)
        self.ext = ext
        self.attr = self._mix(self.voc["api_attrs"], self._open(self.counts["attrs"], self.counts.get("attrs_tail", 1)))
        # (counts["attrs"] holds the corpus top names plus every method of the builtin types and of the
        # preloaded modules' classes, each smoothed by +1; the escape weighs the corpus mass left out)
        self.kwarg = self._mix(self.voc["api_params"], self._open(self.counts["kwargs"],
                                                                   self.counts.get("kwargs_tail", 1)))
        self.modpath = self._open({m: self.counts["imports"].get(m, 0) + 1 for m in self.voc["modules"]},
                                  esc_weight=1.0, laplace=False)
        self.modattr = {m: self._open({a: self.counts["module_attrs"].get(m, {}).get(a, 0) + 1
                                       for a in self.voc["module_attrs"][m]}, esc_weight=1.0, laplace=False)
                        for m in self.voc["modules"]}

    # helpers -------------------------------------------------------------------------------------
    def _closed(self, names, counts) -> dict:
        if self.scheme == "uniform":
            return {n: 1.0 / len(names) for n in names}
        w = {n: counts.get(n, 0) + 1.0 for n in names}
        t = sum(w.values())
        return {n: x / t for n, x in w.items()}

    def _open(self, counts: dict, esc_weight: Optional[float] = None, laplace: bool = False) -> dict:
        """A vocabulary with an escape: p(n) = c_n / (C + e), p(ESC) = e / (C + e), where e is the corpus
        mass of the names left out of the table (or 1)."""
        if self.scheme == "uniform":
            k = len(counts) + 1
            d = {n: 1.0 / k for n in counts}
            d[ESC] = 1.0 / k
            return d
        e = float(esc_weight) if esc_weight is not None else 1.0
        tot = sum(counts.values()) + e
        d = {n: c / tot for n, c in counts.items()}
        d[ESC] = e / tot
        return d

    def _mix(self, api_names, corpus: dict) -> dict:
        d = {k: 0.5 * v for k, v in corpus.items()}
        for n in api_names:
            d[n] = d.get(n, 0.0) + 0.5 / len(api_names)
        return d

    # distributions -------------------------------------------------------------------------------
    def node_dist(self, parent: str, field: str, cat: str, mult: str) -> dict:
        key = (parent, field, mult)
        d = self._node.get(key)
        if d is None:
            alts = list(self.cats[cat])
            if mult in ("seq", "seq_opt"):
                alts.append(END)
            if mult in ("opt", "seq_opt", "implied_opt"):
                alts.append(NONE)
            if self.scheme == "uniform":
                d = {a: 1.0 / len(alts) for a in alts}
            else:
                c = self.counts["nodes"].get(f"{parent}.{field}", {})
                w = {a: c.get(a, 0) + 1.0 for a in alts}
                t = sum(w.values())
                d = {a: x / t for a, x in w.items()}
            self._node[key] = d
        return d

    def small(self, name: str, alts: list) -> dict:
        key = ("small", name)
        d = self._dist.get(key)
        if d is None:
            if self.scheme == "uniform":
                d = {a: 1.0 / len(alts) for a in alts}
            else:
                c = self.counts["small"].get(name, {})
                w = {a: c.get(str(a), 0) + 1.0 for a in alts}
                t = sum(w.values())
                d = {a: x / t for a, x in w.items()}
            self._dist[key] = d
        return d


@lru_cache(maxsize=None)
def load_tables(scheme: str = "corpus") -> Tables:
    with open(TABLE_PATH) as fh:
        return Tables(json.load(fh), scheme)


# ------------------------------------------------------------------------------------------------
# scopes
# ------------------------------------------------------------------------------------------------
class ScopeInfo:
    """Static facts about one scope (from the binder): names bound in it, global / nonlocal declarations."""
    __slots__ = ("bound", "globals", "nonlocals")

    def __init__(self):
        self.bound, self.globals, self.nonlocals = set(), set(), set()


def bind(tree: ast.AST) -> dict:
    """id(scope node) -> ScopeInfo, following Python's scoping rules (module, def, lambda, class,
    comprehension; walrus binds in the nearest non-comprehension scope; a comprehension's first
    iterable belongs to the enclosing scope)."""
    info: dict = {id(tree): ScopeInfo()}

    def visit(n, cur, chain):
        t = type(n).__name__
        if t in SCOPE_NODES:
            me = info.setdefault(id(n), ScopeInfo())
            if t in ("FunctionDef", "AsyncFunctionDef", "ClassDef"):
                cur.bound.add(n.name)
                for d in n.decorator_list:
                    visit(d, cur, chain)
                for x in ([n.returns] if t != "ClassDef" else n.bases + [k.value for k in n.keywords]):
                    if x is not None:
                        visit(x, cur, chain)
                for tp in getattr(n, "type_params", []):
                    cur.bound.add(tp.name)
            if t in ("FunctionDef", "AsyncFunctionDef", "Lambda"):
                a = n.args
                for x in a.posonlyargs + a.args + a.kwonlyargs + [a.vararg, a.kwarg]:
                    if x is not None:
                        me.bound.add(x.arg)
                        if x.annotation is not None:
                            visit(x.annotation, cur, chain)
                for d in a.defaults + [d for d in a.kw_defaults if d is not None]:
                    visit(d, cur, chain)
                body = n.body if isinstance(n.body, list) else [n.body]
                for s in body:
                    visit(s, me, chain + [(t, me)])
            elif t == "ClassDef":
                for s in n.body:
                    visit(s, me, chain + [(t, me)])
            else:                                         # comprehensions
                gens = n.generators
                visit(gens[0].iter, cur, chain)
                for i, g in enumerate(gens):
                    collect_targets(g.target, me)
                    visit(g.target, me, chain + [(t, me)])
                    if i:
                        visit(g.iter, me, chain + [(t, me)])
                    for c in g.ifs:
                        visit(c, me, chain + [(t, me)])
                for f in ("elt", "key", "value"):
                    if hasattr(n, f):
                        visit(getattr(n, f), me, chain + [(t, me)])
            return
        if isinstance(n, ast.Global):
            cur.globals.update(n.names)
            info[id(tree)].bound.update(n.names)
        elif isinstance(n, ast.Nonlocal):
            cur.nonlocals.update(n.names)
        elif isinstance(n, ast.Name) and isinstance(n.ctx, (ast.Store, ast.Del)):
            cur.bound.add(n.id)
        elif isinstance(n, ast.NamedExpr):
            tgt = cur
            for k, s in reversed(chain):
                if k not in ("ListComp", "SetComp", "DictComp", "GeneratorExp"):
                    tgt = s
                    break
            else:
                tgt = info[id(tree)]
            tgt.bound.add(n.target.id)
            visit(n.value, cur, chain)
            return
        elif isinstance(n, ast.alias):
            if n.name != "*":
                cur.bound.add(n.asname or n.name.split(".")[0])
        elif isinstance(n, (ast.ExceptHandler, ast.MatchAs, ast.MatchStar)) and n.name:
            cur.bound.add(n.name)
        elif isinstance(n, ast.MatchMapping) and n.rest:
            cur.bound.add(n.rest)
        elif isinstance(n, (ast.TypeVar, ast.ParamSpec, ast.TypeVarTuple)):
            cur.bound.add(n.name)
        for c in ast.iter_child_nodes(n):
            visit(c, cur, chain)

    def collect_targets(t, me):
        for x in ast.walk(t):
            if isinstance(x, ast.Name):
                me.bound.add(x.id)

    for s in tree.body:
        visit(s, info[id(tree)], [("Module", info[id(tree)])])
    return info


class Scope:
    __slots__ = ("kind", "parent", "info", "slots", "declared", "sid", "module_of")

    def __init__(self, kind: str, parent: Optional["Scope"], info: Optional[ScopeInfo], sid: int):
        self.kind, self.parent, self.info, self.sid = kind, parent, info, sid
        self.slots: list = []           # names in order of first appearance
        self.declared: list = []        # (scope, name) declared global / nonlocal here
        self.module_of: dict = {}       # slot name -> module path while it has only been bound by an import

    def is_comp(self):
        return self.kind in ("ListComp", "SetComp", "DictComp", "GeneratorExp")

    def is_func(self):
        return self.kind in ("FunctionDef", "AsyncFunctionDef", "Lambda") or self.is_comp()

    def render(self, i: int) -> str:
        if self.kind == "Module":
            return "agent" if i == 0 else f"g_{i}"
        return f"s{self.sid}_{i}"


def visible(S: Scope) -> list:
    """The user scopes a load in S can see, innermost first (class scopes only from their own body)."""
    out = [S]
    t = S.parent
    while t is not None:
        if t.kind != "ClassDef" and t not in out:
            out.append(t)
        t = t.parent
    return out


def module_of(S: Scope) -> Scope:
    while S.parent is not None:
        S = S.parent
    return S


def resolve_load(S: Scope, n: str, ext: frozenset):
    info = S.info
    if n in info.globals:
        return module_of(S)
    if n in info.nonlocals:
        return _nonlocal(S, n)
    if n in info.bound:
        return S
    t = S.parent
    while t is not None:
        if t.kind == "ClassDef":
            t = t.parent
            continue
        if t.kind == "Module":
            break
        if n in t.info.globals:
            return module_of(S)
        if n in t.info.bound and n not in t.info.nonlocals:
            return t
        t = t.parent
    M = module_of(S)
    if n in M.info.bound:
        return M
    if n in ext:
        return "ext"
    return M                                          # an implicit (never assigned) global


def _nonlocal(S: Scope, n: str) -> Scope:
    t = S.parent
    while t is not None:
        if t.kind not in ("ClassDef", "Module") and n in t.info.bound and n not in t.info.globals:
            if n in t.info.nonlocals:
                return _nonlocal(t, n)
            return t
        t = t.parent
    raise SyntaxError(f"no binding for nonlocal '{n}'")


def resolve_store(S: Scope, n: str) -> Scope:
    if n in S.info.globals:
        return module_of(S)
    if n in S.info.nonlocals:
        return _nonlocal(S, n)
    return S


# ------------------------------------------------------------------------------------------------
# the walker
# ------------------------------------------------------------------------------------------------
class Unencodable(ValueError):
    pass


class Overflow(Exception):
    pass


class Walker:
    """mode "code": charge the bits of a given tree; "sample": draw a tree; "count": gather statistics.

    Cost accounting (code mode): `bits` by part (structure / names / literals / moves) and `per_line`."""

    def __init__(self, tables: Tables, gt: GridType, mode: str = "code", rng: Optional[np.random.Generator] = None,
                 scheme: Optional[str] = None, max_nodes: int = 400):
        self.T, self.gt, self.mode, self.rng = tables, gt, mode, rng
        self.scheme = scheme or tables.scheme          # "corpus" | "uniform" | "ast-bytes"
        self.bytes = self.scheme == "ast-bytes"
        self.bits = {"structure": 0.0, "names": 0.0, "literals": 0.0, "moves": 0.0}
        self.per_line: dict = {}
        self.line = 0
        self.logp = 0.0                                # sample mode: log2 probability of the path
        self.nodes = 0
        self.max_nodes = max_nodes
        self.counts: dict = {}                         # count mode
        self.sid = 0
        self.info: dict = {}
        self.ext = tables.ext_set
        if gt is not None:
            from .api import constructors
            self.api = constructors(gt)
            self.mids = [m.id for m in available(gt)]

    # --- primitives ----------------------------------------------------------------------------
    def _charge(self, part: str, b: float):
        self.bits[part] += b
        self.per_line[self.line] = self.per_line.get(self.line, 0.0) + b

    def _count(self, key, label):
        d = self.counts.setdefault(key, {})
        d[label] = d.get(label, 0) + 1

    def pick(self, part: str, dist: dict, actual, key=None):
        """Choose from dist (label -> p). Returns the label."""
        if self.mode == "code":
            p = dist.get(actual, 0.0)
            if p <= 0.0:
                raise Unencodable(f"{actual!r} has no codeword here ({key})")
            if not self.bytes:
                self._charge(part, -log2(p))
            return actual
        if self.mode == "count":
            if key is not None:
                self._count(key, actual)
            return actual
        labels = list(dist)
        ps = np.array([dist[k] for k in labels], float)
        i = int(self.rng.choice(len(labels), p=ps / ps.sum()))
        self.logp += log2(dist[labels[i]])
        return labels[i]

    def gamma(self, part: str, n: Optional[int]) -> int:
        """Elias gamma for n ≥ 1."""
        if self.mode == "sample":
            k = 0
            while self.rng.random() < 0.5:
                k += 1
                if k > 24:
                    raise Overflow()
            n = (1 << k) + int(self.rng.integers(0, 1 << k)) if k else 1
            self.logp -= gamma_bits(n)
            return n
        if self.mode == "code" and not self.bytes:
            self._charge(part, gamma_bits(n))
        return n

    def string(self, part: str, s: Optional[str]) -> str:
        if self.mode == "sample":
            L = self.gamma(part, None) - 1
            out = []
            for _ in range(L):
                i = int(self.rng.integers(0, 98))
                self.logp -= log2(98)
                if i < 97:
                    out.append(STR_ALPHABET[i])
                else:
                    cp = self.gamma(part, None) - 1
                    out.append(chr(min(cp, 0x10FFFF)))
            return "".join(out)
        if self.mode == "code" and not self.bytes:
            self._charge(part, string_bits(s))
        return s

    def small_pick(self, part: str, name: str, alts: list, actual):
        return self.pick(part, self.T.small(name, alts), actual, key="small:" + name)

    def node_tick(self):
        self.nodes += 1
        if self.mode == "sample" and self.nodes > self.max_nodes:
            raise Overflow()

    # --- program -----------------------------------------------------------------------------------
    def program(self, tree: Optional[ast.Module]) -> ast.Module:
        if self.mode != "sample":
            self.info = bind(tree)
        else:
            tree = ast.Module(body=[], type_ignores=[])
        if self.bytes:
            self._charge("structure", 8)
        M = self.new_scope("Module", None, tree)
        M.slots.append("agent")
        body = self.seq_nodes(tree.body if self.mode != "sample" else None, "Module", "body", "stmt", M)
        tree.body = body
        return tree

    def new_scope(self, kind, parent, node) -> Scope:
        info = self.info.get(id(node)) if self.mode != "sample" else None
        S = Scope(kind, parent, info, self.sid)
        self.sid += 1
        return S

    # --- nodes ---------------------------------------------------------------------------------------
    def seq_nodes(self, xs, parent, field, cat, S, target=False, elem_opt=False, length=None):
        out = []
        mult = "seq_opt" if elem_opt else "seq"
        i = 0
        while True:
            if length is not None:
                if i >= length:
                    break
                x = xs[i] if xs is not None else None
                out.append(self.one_node(x, parent, field, cat, S, target, "implied_opt" if elem_opt else "one"))
                i += 1
                continue
            x = xs[i] if (xs is not None and i < len(xs)) else (END if xs is not None else None)
            r = self.one_node(x, parent, field, cat, S, target, mult)
            if r is END:
                break
            out.append(r)
            i += 1
        return out

    def one_node(self, x, parent, field, cat, S, target=False, mult="one"):
        """Choose the class of the node at (parent, field), then walk it. x is the actual node (code /
        count mode), END / None for an absent one; returns the node (or END / None)."""
        T = self.T
        dist = T.node_dist(parent, field, cat, mult)
        if self.mode == "sample":
            actual = None
        elif x is END:
            actual = END
        elif x is None:
            actual = NONE
        else:
            actual = type(x).__name__
        lab = self.pick("structure", dist, actual, key=f"{parent}.{field}")
        if lab == END:
            return END
        if lab == NONE:
            return None
        if self.bytes and lab != "Constant":
            self._charge("structure", 8)
        return self.walk(x, lab, S, target)

    def walk(self, x, cls: str, S: Scope, target=False):
        self.node_tick()
        if self.mode == "sample":
            x = getattr(ast, cls)()
        elif getattr(x, "lineno", None):
            self.line = x.lineno
        if cls in SCOPE_NODES:
            return self.walk_scope(x, cls, S)
        if cls == "Call" and self.gt is not None and not self.bytes:
            mv = self.literal_move(x, S) if self.mode != "sample" else None
            lab = self.pick("moves", {True: Q_MOVE, False: 1 - Q_MOVE}, None if self.mode == "sample" else mv is not None,
                            key="Call.literal")
            if lab:
                return self.code_move(x, mv)
        if cls == "alias":
            raise AssertionError("alias is walked by its parent")
        if self.bytes and any(f == "ctx" for f, _ in self.T.classes[cls]):
            self._charge("structure", 8)
        for fname, fk in self.T.classes[cls]:
            self.field(x, cls, fname, fk, S, target)
        if self.mode == "sample":
            self._fill_ctx(x, cls, target)
        return x

    def _fill_ctx(self, x, cls, target):
        if cls in ("Name", "Attribute", "Subscript", "Starred", "List", "Tuple"):
            x.ctx = ast.Store() if target else ast.Load()

    def field(self, x, cls, fname, fk, S, target):
        k = fk["k"]
        cur = getattr(x, fname, None) if self.mode != "sample" else None
        if k == "skip":
            if self.mode == "sample":
                setattr(x, fname, [] if fname == "type_ignores" else None)
            return
        if k == "node":
            if (cls, fname) == ("NamedExpr", "target"):      # walrus binds in the nearest non-comprehension scope
                while S.is_comp():
                    S = S.parent
            if cls == "Import" or cls == "ImportFrom":
                if fname == "names":
                    return self.aliases(x, cls, S)
            tgt = bool(fk.get("target")) or (target and cls in ("Tuple", "List", "Starred") and fname in ("elts", "value"))
            m = fk["m"]
            if m == "implied":
                n = len(getattr(x, fk["len"]))
                v = self.seq_nodes(cur, cls, fname, fk["cat"], S, tgt, fk.get("eopt", False), length=n)
            elif m in ("seq", "seq_opt"):
                v = self.seq_nodes(cur, cls, fname, fk["cat"], S, tgt, m == "seq_opt")
            else:
                v = self.one_node(cur, cls, fname, fk["cat"], S, tgt, m)
            if self.mode == "sample":
                setattr(x, fname, v)
            return
        if k == "ident":
            v = self.ident(x, cls, fname, fk, S, target, cur)
            if self.mode == "sample":
                setattr(x, fname, v)
            return
        if k == "const":
            v = self.constant(cur, counted=cls == "Constant")
            if self.mode == "sample":
                x.value = v
                x.kind = None
            return
        if k == "int":
            v = self.small_int(fk["role"], cur, cls)
            if self.mode == "sample":
                setattr(x, fname, v)
            return
        raise AssertionError(k)

    # --- scopes --------------------------------------------------------------------------------------
    def walk_scope(self, x, cls, S):
        inner = self.new_scope(cls, S, x)
        if cls in ("FunctionDef", "AsyncFunctionDef", "ClassDef", "Lambda"):
            for fname, fk in self.T.classes[cls]:
                if fk["k"] == "skip":
                    if self.mode == "sample":
                        setattr(x, fname, None)
                    continue
                if fname == "args":
                    a = self.arguments(x, cls, S, inner)
                    if self.mode == "sample":
                        x.args = a
                    continue
                where = S if fname in OUTER.get(cls, ()) else inner
                if fname == "name":
                    v = self.bind_ident(S, getattr(x, "name", None) if self.mode != "sample" else None)
                    if self.mode == "sample":
                        x.name = v
                    continue
                self.field(x, cls, fname, fk, where, False)
            return x
        # comprehensions: elt / key / value, then generators (the first iterable in the enclosing scope)
        for fname, fk in self.T.classes[cls]:
            if fname == "generators":
                xs = x.generators if self.mode != "sample" else None
                out, i = [], 0
                while True:
                    g = (xs[i] if i < len(xs) else END) if xs is not None else None
                    lab = self.pick("structure", self.T.node_dist(cls, "generators", "comprehension", "seq"),
                                    None if self.mode == "sample" else (END if g is END else "comprehension"),
                                    key=f"{cls}.generators")
                    if lab == END:
                        break
                    if self.bytes:
                        self._charge("structure", 8)
                    out.append(self.comprehension(g, inner, S if i == 0 else inner))
                    i += 1
                if self.mode == "sample":
                    x.generators = out
            else:
                self.field(x, cls, fname, fk, inner, False)
        return x

    def comprehension(self, g, inner, iter_scope):
        self.node_tick()
        if self.mode == "sample":
            g = ast.comprehension()
        for fname, fk in self.T.classes["comprehension"]:
            self.field(g, "comprehension", fname, fk, iter_scope if fname == "iter" else inner, False)
        return g

    def arguments(self, x, cls, outer: Scope, inner: Scope):
        a = x.args if self.mode != "sample" else ast.arguments()
        self.node_tick()
        if self.bytes:
            self._charge("structure", 8)
        for fname, fk in self.T.classes["arguments"]:
            cur = getattr(a, fname, None) if self.mode != "sample" else None
            if fname in ("posonlyargs", "args", "kwonlyargs"):
                out, i = [], 0
                while True:
                    y = (cur[i] if i < len(cur) else END) if cur is not None else None
                    lab = self.pick("structure", self.T.node_dist("arguments", fname, "arg", "seq"),
                                    None if self.mode == "sample" else (END if y is END else "arg"),
                                    key=f"arguments.{fname}")
                    if lab == END:
                        break
                    out.append(self.arg(y, outer, inner))
                    i += 1
                v = out
            elif fname in ("vararg", "kwarg"):
                lab = self.pick("structure", self.T.node_dist("arguments", fname, "arg", "opt"),
                                None if self.mode == "sample" else (NONE if cur is None else "arg"),
                                key=f"arguments.{fname}")
                v = None if lab == NONE else self.arg(cur, outer, inner)
            elif fname == "kw_defaults":
                n = len(a.kwonlyargs)
                v = self.seq_nodes(cur, "arguments", fname, "expr", outer, False, True, length=n)
            else:   # defaults
                v = self.seq_nodes(cur, "arguments", fname, "expr", outer)
            if self.mode == "sample":
                setattr(a, fname, v)
        return a

    def arg(self, y, outer, inner):
        self.node_tick()
        if self.bytes:
            self._charge("structure", 8)
        if self.mode == "sample":
            y = ast.arg()
        name = self.bind_ident(inner, getattr(y, "arg", None) if self.mode != "sample" else None)
        ann = self.one_node(getattr(y, "annotation", None) if self.mode != "sample" else None, "arg", "annotation",
                            "expr", outer, False, "opt")
        if self.mode == "sample":
            y.arg, y.annotation, y.type_comment = name, ann, None
        return y

    # --- identifiers ---------------------------------------------------------------------------------
    def ident(self, x, cls, fname, fk, S, target, cur):
        role, m = fk["role"], fk["m"]
        if role == "name":
            return self.name(S, cur, target)
        if role == "bind":
            if m == "opt":
                present = self.small_pick("names", f"{cls}.{fname}.present", [True, False],
                                          None if self.mode == "sample" else cur is not None)
                if not present:
                    return None
            return self.bind_ident(S, cur)
        if role == "attr":
            if m == "seq":
                out, i = [], 0
                while True:
                    y = (cur[i] if i < len(cur) else END) if cur is not None else None
                    lab = self.pick("names", {END: 0.5, "more": 0.5},
                                    None if self.mode == "sample" else (END if y is END else "more"))
                    if lab == END:
                        break
                    out.append(self.attr_name(None, y))
                    i += 1
                return out
            return self.attr_name(self._module_of_expr(x.value, S), cur)
        if role == "kwarg":
            present = self.small_pick("names", "keyword.arg.present", [True, False],
                                      None if self.mode == "sample" else cur is not None)
            if not present:
                return None
            return self.vocab_name("names", self.T.kwarg, cur, key="kwarg")
        if role in ("global", "nonlocal"):
            return self.declarations(S, role, cur)
        if role == "modpath":
            present = self.small_pick("names", "ImportFrom.module.present", [True, False],
                                      None if self.mode == "sample" else cur is not None)
            if not present:
                return None
            return self.vocab_name("names", self.T.modpath, cur, key="modpath")
        raise AssertionError(role)

    def vocab_name(self, part, dist, actual, key=None):
        if self.mode == "code":
            if actual in dist:
                p = dist[actual]
                if not self.bytes:
                    self._charge(part, -log2(p))
                return actual
            self.pick(part, dist, ESC, key=key)
            return self.string(part, actual)
        if self.mode == "count":
            self._count(key, actual)
            return actual
        lab = self.pick(part, dist, None)
        return self.string(part, None) if lab == ESC else lab

    def attr_name(self, module: Optional[str], actual):
        if module is not None and module in self.T.modattr:
            return self.vocab_name("names", self.T.modattr[module], actual, key=f"mattr:{module}")
        return self.vocab_name("names", self.T.attr, actual, key="attr")

    def _module_of_expr(self, base, S) -> Optional[str]:
        """The module a name was bound to by `import`, if it still is (decides the attribute vocabulary)."""
        if not isinstance(base, ast.Name):
            return None
        if self.mode == "sample":            # sampled names are unique across scopes
            for V in visible(S):
                if base.id in V.slots:
                    return V.module_of.get(base.id)
            return None
        R = resolve_load(S, base.id, self.ext)
        return None if R == "ext" else R.module_of.get(base.id)

    def _load_alts(self, S: Scope):
        alts = []
        for V in visible(S):
            for i in range(len(V.slots)):
                alts.append((V, i))
            alts.append((V, NEW))
        return alts

    def name(self, S: Scope, actual: Optional[str], target: bool):
        if target:
            return self.bind_ident(S, actual)
        alts = self._load_alts(S)
        n_user = len(alts)
        if self.mode == "sample":
            ps = np.array([(1 - P_EXT) / n_user] * n_user + [P_EXT * p for p in self.T.ext.values()])
            i = int(self.rng.choice(len(ps), p=ps / ps.sum()))
            self.logp += log2(ps[i])
            if i >= n_user:
                return list(self.T.ext)[i - n_user]
            V, j = alts[i]
            if j == NEW:
                j = len(V.slots)
                V.slots.append(V.render(j))
            return V.slots[j]
        R = resolve_load(S, actual, self.ext)
        if R == "ext":
            if self.mode == "count":
                self._count("ext", actual)
                return actual
            if not self.bytes:
                self._charge("names", -log2(P_EXT * self.T.ext[actual]))
            return actual
        if R not in visible(S):
            raise Unencodable(f"name {actual!r} resolves outside the visible scopes")
        if actual not in R.slots:
            R.slots.append(actual)
        if self.mode == "code" and not self.bytes:
            self._charge("names", -log2((1 - P_EXT) / n_user))
        return actual

    def _store_alts(self, S: Scope):
        return [(S, i) for i in range(len(S.slots))] + [(S, NEW)] + list(S.declared)

    def bind_ident(self, S: Scope, actual: Optional[str], module: Optional[str] = None, *, walrus=False) -> str:
        """A binding occurrence in scope S (or the scope a global / nonlocal declaration names)."""
        alts = self._store_alts(S)
        k = len(alts)
        if self.mode == "sample":
            i = int(self.rng.integers(0, k))
            self.logp -= log2(k)
            V, j = alts[i]
            if j == NEW:
                j = len(V.slots)
                V.slots.append(V.render(j))
            nm = V.slots[j] if isinstance(j, int) else j
            V.module_of.pop(nm, None)
            if module is not None:
                V.module_of[nm] = module
            return nm
        R = resolve_store(S, actual)
        if R is not S and not any(D is R and nm == actual for D, nm in S.declared):
            raise Unencodable(f"binding of {actual!r} outside its scope")
        if R is S and actual not in S.slots:
            S.slots.append(actual)
        R.module_of.pop(actual, None)
        if module is not None:
            R.module_of[actual] = module
        if self.mode == "code" and not self.bytes:
            self._charge("names", log2(k))
        return actual

    def declarations(self, S: Scope, role: str, cur):
        if role == "global":
            targets = [module_of(S)]
        else:
            targets = [V for V in visible(S)[1:] if V.kind not in ("Module", "ClassDef")]
        out, i = [], 0
        while True:
            alts = [END] + [(V, j) for V in targets for j in range(len(V.slots))] + [(V, NEW) for V in targets]
            k = len(alts)
            if self.mode == "sample":
                j = int(self.rng.integers(0, k))
                self.logp -= log2(k)
                if alts[j] == END:
                    break
                V, jj = alts[j]
                if jj == NEW:
                    jj = len(V.slots)
                    V.slots.append(V.render(jj))
                nm = V.slots[jj]
                S.declared.append((V, nm))
                out.append(nm)
                continue
            if cur is None or i >= len(cur):
                if self.mode == "code" and not self.bytes:
                    self._charge("names", log2(k))
                break
            nm = cur[i]
            V = module_of(S) if role == "global" else _nonlocal(S, nm)
            if nm not in V.slots:
                V.slots.append(nm)
            S.declared.append((V, nm))
            if self.mode == "code" and not self.bytes:
                self._charge("names", log2(k))
            out.append(nm)
            i += 1
        return out

    # --- imports -------------------------------------------------------------------------------------
    def aliases(self, x, cls, S):
        cur = x.names if self.mode != "sample" else None
        out, i = [], 0
        while True:
            y = (cur[i] if i < len(cur) else END) if cur is not None else None
            lab = self.pick("structure", self.T.node_dist(cls, "names", "alias", "seq"),
                            None if self.mode == "sample" else (END if y is END else "alias"), key=f"{cls}.names")
            if lab == END:
                break
            if self.bytes:
                self._charge("structure", 8)
            self.node_tick()
            if self.mode == "sample":
                y = ast.alias()
            if cls == "Import":
                nm = self.vocab_name("names", self.T.modpath, getattr(y, "name", None), key="modpath")
                dotted = "." in nm
                has_as = False
                if dotted:
                    has_as = self.small_pick("names", "alias.dotted_asname.present", [True, False],
                                             None if self.mode == "sample" else y.asname is not None)
                if self.mode != "sample":
                    actual = y.asname or (nm if not dotted else nm.split(".")[0])
                else:
                    actual = None
                mod = nm if (has_as or not dotted) else nm.split(".")[0]
                b = self.bind_ident(S, actual, module=mod)
                if self.mode == "sample":
                    y.name = nm
                    y.asname = b if (has_as or not dotted) else None
                    if dotted and not has_as:
                        # `import a.b` binds `a`: keep the binding's rendered name equal to the top package
                        y.asname = None
            else:
                module = x.module if self.mode != "sample" else getattr(x, "module", None)
                dist = self.T.modattr.get(module, self.T.attr)
                star = self.small_pick("names", "alias.star", [True, False],
                                       None if self.mode == "sample" else y.name == "*")
                if star:
                    nm = "*"
                    b = None
                else:
                    nm = self.vocab_name("names", dist, getattr(y, "name", None),
                                         key=f"mattr:{module}" if module in self.T.modattr else "attr")
                    actual = (y.asname or y.name) if self.mode != "sample" else None
                    b = self.bind_ident(S, actual)
                if self.mode == "sample":
                    y.name, y.asname = nm, (b if b != nm else None)
            out.append(y)
            i += 1
        if self.mode == "sample":
            x.names = out
        return out

    # --- literals -----------------------------------------------------------------------------------
    def small_int(self, role, cur, cls):
        if role == "level":
            n = self.gamma("literals", None if self.mode == "sample" else (cur or 0) + 1)
            return n - 1
        alts = CONVERSIONS if role == "conversion" else [0, 1]
        return self.small_pick("literals", role, alts, cur)

    def constant(self, v, counted: bool = True):
        kinds = CONST_KINDS
        if self.mode == "sample":
            kind = self.small_pick("literals", "const_kind", kinds, None)
        else:
            kind = ("bool" if isinstance(v, bool) else "None" if v is None else "Ellipsis" if v is ... else
                    type(v).__name__)
            if self.bytes:
                if counted:
                    from ..agentlang.astbytes import constant_bytes
                    self._charge("literals", 8 * constant_bytes(v))
                return v
            self.small_pick("literals", "const_kind", kinds, kind)
        if kind == "int":
            if self.mode == "sample":
                return self.gamma("literals", None) - 1
            if v < 0:
                raise Unencodable("negative int constant")
            self.gamma("literals", v + 1)
            return v
        if kind == "bool":
            return self.pick("literals", {True: 0.5, False: 0.5}, v)
        if kind in ("None", "Ellipsis"):
            return None if kind == "None" else ...
        if kind == "str":
            return self.string("literals", v)
        if kind == "bytes":
            if self.mode == "sample":
                L = self.gamma("literals", None) - 1
                self.logp -= 8 * L
                return bytes(int(b) for b in self.rng.integers(0, 256, L))
            self.gamma("literals", len(v) + 1)
            if self.mode == "code":
                self._charge("literals", 8 * len(v))
            return v
        if kind in ("float", "complex"):
            if self.mode == "sample":
                L = self.gamma("literals", None) - 1
                s = "".join(FLOAT_ALPHABET[int(i)] for i in self.rng.integers(0, len(FLOAT_ALPHABET), L))
                self.logp -= L * log2(len(FLOAT_ALPHABET))
                try:
                    f = float(s)
                except ValueError:
                    f = float("nan")
                return complex(0, f) if kind == "complex" else f
            r = repr(float(v.imag if kind == "complex" else v))
            if kind == "complex" and v.real != 0:
                raise Unencodable("complex constant with a real part")
            self.gamma("literals", len(r) + 1)
            if self.mode == "code":
                self._charge("literals", len(r) * log2(len(FLOAT_ALPHABET)))
            return v
        raise Unencodable(f"constant of kind {kind}")

    # --- literal moves --------------------------------------------------------------------------------
    def literal_move(self, call: ast.Call, S: Scope):
        """The Move a call builds if it is an API mutator constructor applied to literals, else None."""
        from .api import MUTATOR_CONSTRUCTORS, Move, MoveError
        f = call.func
        if not (isinstance(f, ast.Name) and f.id in MUTATOR_CONSTRUCTORS and resolve_load(S, f.id, self.ext) == "ext"):
            return None
        try:
            args = [self._lit(a, S) for a in call.args]
            kw = {k.arg: self._lit(k.value, S) for k in call.keywords}
            if any(k.arg is None for k in call.keywords):
                return None
            mv = self.api[f.id](*args, **kw)
        except (_NotLit, MoveError, TypeError, ValueError, KeyError, IndexError):
            return None
        return mv if isinstance(mv, Move) else None

    def _lit(self, e, S):
        from .api import AREA_NAMES
        if isinstance(e, ast.Constant):
            return e.value
        if isinstance(e, (ast.Tuple, ast.List)):
            return tuple(self._lit(x, S) for x in e.elts)
        if isinstance(e, ast.UnaryOp) and isinstance(e.op, (ast.USub, ast.UAdd)) and isinstance(e.operand, ast.Constant) \
                and isinstance(e.operand.value, (int, float)) and not isinstance(e.operand.value, bool):
            return -e.operand.value if isinstance(e.op, ast.USub) else e.operand.value
        if isinstance(e, ast.Name) and resolve_load(S, e.id, self.ext) == "ext" and e.id in self.api \
                and not callable(self.api[e.id]):
            return self.api[e.id]
        if isinstance(e, ast.Call) and isinstance(e.func, ast.Name) and e.func.id in AREA_NAMES \
                and resolve_load(S, e.func.id, self.ext) == "ext" and not e.keywords:
            return self.api[e.func.id](*[self._lit(a, S) for a in e.args])
        raise _NotLit()

    def code_move(self, x, mv):
        """log2(#mutators) + the mutator's field code; sample mode draws a move and renders it canonically."""
        gt = self.gt
        k = len(self.mids)
        if self.mode == "sample":
            mid = self.mids[int(self.rng.integers(0, k))]
            m = by_id(mid)
            params = m.sample(self.rng, gt)
            self.logp -= log2(k) + m.describe_bits(params, gt)
            return move_ast(mid, params)
        if self.mode == "code":
            self._charge("moves", log2(k) + by_id(mv.mid).describe_bits(mv.params, gt))
        return x


class _NotLit(Exception):
    pass


def lit_ast(v):
    if isinstance(v, tuple):
        return ast.Tuple(elts=[lit_ast(x) for x in v], ctx=ast.Load())
    return ast.Constant(value=v)


def move_ast(mid: str, params: dict) -> ast.Call:
    """The canonical spelling of a literal move: move("paint", kind="line", region=(0, 2), colour=0)."""
    return ast.Call(func=ast.Name(id="move", ctx=ast.Load()), args=[ast.Constant(value=mid)],
                    keywords=[ast.keyword(arg=k, value=lit_ast(v)) for k, v in params.items()])


# ------------------------------------------------------------------------------------------------
# public API
# ------------------------------------------------------------------------------------------------
def ast_bits(source: str, gt: GridType = GridType(), scheme: str = "corpus") -> dict:
    """The description length of an agent's source in bits, by part, with a per-line breakdown."""
    tree = ast.parse(source)
    T = load_tables("uniform" if scheme == "uniform" else "corpus")
    w = Walker(T, gt, "code", scheme=scheme)
    w.program(tree)
    out = dict(w.bits)
    out["total"] = sum(w.bits.values())
    out["per_line"] = dict(w.per_line)
    return out


def describe_bits(source: str, gt: GridType = GridType(), scheme: str = "corpus") -> float:
    return ast_bits(source, gt, scheme)["total"]


def sample_program(rng: np.random.Generator, gt: GridType = GridType(), scheme: str = "corpus",
                   max_nodes: int = 400) -> tuple[Optional[ast.Module], float]:
    """Draw a module from the code's own distribution: (tree, log2 probability), or (None, logp so far)
    if the draw exceeded max_nodes (non-halting mass)."""
    T = load_tables("uniform" if scheme == "uniform" else "corpus")
    w = Walker(T, gt, "sample", rng=rng, max_nodes=max_nodes)
    try:
        tree = w.program(None)
    except Overflow:
        return None, w.logp
    return ast.fix_missing_locations(tree), w.logp
