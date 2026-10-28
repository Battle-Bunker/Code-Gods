"""ast-bits-v1 in "code" mode, run INSIDE the guest during trusted inspection.

A faithful port of grid-lab's `gridlab/openagents/astbits.py` `Walker` (mode "code"; docs/open-agents.md
§2.1, branch claude/gridlab-open-agents), without the sample / count / ast-bytes modes and without numpy.
Differences, all at the boundary:

* The game-independent tables (grammar, corpus counts, builtins, modules, module attributes) come from
  the pinned `ast_bits_v1.json`. The game vocabulary (external API names, API attributes, API keyword
  parameters, API strings, which names are mutator constructors and which are area constructors) comes
  with the room's prelude, because our API names are not grid-lab's.
* Literal moves: grid-lab charges flag + log2(#available) + D(fields). D needs the host's mutator
  definitions, so the guest only detects them: it evaluates the trusted prelude constructors on the
  literal arguments and returns the call in wire form, together with the bits the call would cost coded
  generically (flag false + its fields) if the host finds it is not a valid move. The flags of all other
  calls are charged here (`moveFlags`).

This file is trusted runtime code: it is executed once at bootstrap into the guest's `__main__` and so is
part of the initialized snapshot. Nothing here evaluates submitted source.
"""
import ast
import json
import math

log2 = math.log2
P_EXT = 0.5
Q_MOVE = 1 / 8
P_STRVOC = 0.5
END, NONE, NEW, ESC = "<end>", "<none>", "<new>", "<esc>"
STR_ALPHABET = [chr(c) for c in range(32, 127)] + ["\n", "\t"]
_STR_SET = frozenset(STR_ALPHABET)
FLOAT_ALPHABET = "0123456789.e+-infa"
SCOPE_NODES = ("FunctionDef", "AsyncFunctionDef", "Lambda", "ClassDef", "ListComp", "SetComp", "DictComp",
               "GeneratorExp")
COMP_NODES = ("ListComp", "SetComp", "DictComp", "GeneratorExp")
OUTER = {"FunctionDef": {"name", "decorator_list", "returns", "type_params"},
         "AsyncFunctionDef": {"name", "decorator_list", "returns", "type_params"},
         "ClassDef": {"name", "bases", "keywords", "decorator_list", "type_params"}}
CONVERSIONS = [-1, 115, 114, 97]
CONST_KINDS = ["int", "float", "complex", "str", "bytes", "bool", "None", "Ellipsis"]


def gamma_bits(n):
    if n < 1:
        raise ValueError("gamma code needs n >= 1")
    return 2 * (n.bit_length() - 1) + 1


def string_bits(s):
    b = gamma_bits(len(s) + 1)
    for ch in s:
        b += log2(98)
        if ch not in _STR_SET:
            b += gamma_bits(ord(ch) + 1)
    return b


class Unencodable(ValueError):
    pass


# ------------------------------------------------------------------------------------------------
# tables: game-independent base (built at bootstrap) + the room's vocabulary (per inspection)
# ------------------------------------------------------------------------------------------------
class BaseTables:
    def __init__(self, data, scheme):
        if scheme not in ("corpus", "uniform"):
            raise ValueError("scheme")
        self.scheme = scheme
        self.cats = data["grammar"]["categories"]
        self.classes = data["grammar"]["classes"]
        self.counts = data["counts"]
        voc = data["vocab"]
        self.builtins = list(voc["builtins"])
        self.b = self._closed(self.builtins, self.counts["builtins"])
        self.corpus_attr = self._open(self.counts["attrs"], self.counts.get("attrs_tail", 1))
        self.corpus_kwarg = self._open(self.counts["kwargs"], self.counts.get("kwargs_tail", 1))
        self.modpath = self._open({m: self.counts["imports"].get(m, 0) + 1 for m in voc["modules"]}, 1.0)
        self.modattr = {m: self._open({a: self.counts["module_attrs"].get(m, {}).get(a, 0) + 1
                                       for a in voc["module_attrs"][m]}, 1.0)
                        for m in voc["modules"]}
        self._node = {}
        self._small = {}

    def _closed(self, names, counts):
        if self.scheme == "uniform":
            return {n: 1.0 / len(names) for n in names}
        w = {n: counts.get(n, 0) + 1.0 for n in names}
        t = sum(w.values())
        return {n: x / t for n, x in w.items()}

    def _open(self, counts, esc_weight=None):
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

    def node_dist(self, parent, field, cat, mult):
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

    def small(self, name, alts):
        d = self._small.get(name)
        if d is None:
            if self.scheme == "uniform":
                d = {a: 1.0 / len(alts) for a in alts}
            else:
                c = self.counts["small"].get(name, {})
                w = {a: c.get(str(a), 0) + 1.0 for a in alts}
                t = sum(w.values())
                d = {a: x / t for a, x in w.items()}
            self._small[name] = d
        return d


def _mix(api_names, corpus):
    d = {k: 0.5 * v for k, v in corpus.items()}
    for n in api_names:
        d[n] = d.get(n, 0.0) + 0.5 / len(api_names)
    return d


class Tables:
    """BaseTables + a room vocabulary {api, attrs, params, strings, mutators, areas}."""

    def __init__(self, base, vocab):
        self.base = base
        self.cats, self.classes = base.cats, base.classes
        api = sorted(set(vocab["api"]))
        externals = sorted(set(base.builtins) | set(api))
        self.ext_set = frozenset(externals)
        apid = {n: 1.0 / len(api) for n in api} if api else {}
        self.ext = ({n: 0.5 * base.b.get(n, 0.0) + 0.5 * apid.get(n, 0.0) for n in externals} if apid
                    else dict(base.b))
        self.attr = _mix(sorted(set(vocab["attrs"])), base.corpus_attr) if vocab["attrs"] else base.corpus_attr
        self.kwarg = _mix(sorted(set(vocab["params"])), base.corpus_kwarg) if vocab["params"] else base.corpus_kwarg
        self.strings = sorted(set(vocab["strings"]))
        self.string_set = frozenset(self.strings)
        self.modpath, self.modattr = base.modpath, base.modattr
        self.api = frozenset(api)
        self.mutators = frozenset(vocab["mutators"])
        self.areas = frozenset(vocab["areas"])
        self.node_dist, self.small = base.node_dist, base.small


# ------------------------------------------------------------------------------------------------
# scopes (identical to grid-lab)
# ------------------------------------------------------------------------------------------------
class ScopeInfo:
    __slots__ = ("bound", "globals", "nonlocals")

    def __init__(self):
        self.bound, self.globals, self.nonlocals = set(), set(), set()


def bind(tree):
    info = {id(tree): ScopeInfo()}

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
            else:
                gens = n.generators
                visit(gens[0].iter, cur, chain)
                for i, g in enumerate(gens):
                    for x in ast.walk(g.target):
                        if isinstance(x, ast.Name):
                            me.bound.add(x.id)
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
            tgt = None
            for k, s in reversed(chain):
                if k not in COMP_NODES:
                    tgt = s
                    break
            if tgt is None:
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

    for s in tree.body:
        visit(s, info[id(tree)], [("Module", info[id(tree)])])
    return info


class Scope:
    __slots__ = ("kind", "parent", "info", "slots", "declared", "module_of")

    def __init__(self, kind, parent, info):
        self.kind, self.parent, self.info = kind, parent, info
        self.slots = []
        self.declared = []
        self.module_of = {}

    def is_comp(self):
        return self.kind in COMP_NODES


def visible(S):
    out = [S]
    t = S.parent
    while t is not None:
        if t.kind != "ClassDef" and t not in out:
            out.append(t)
        t = t.parent
    return out


def module_of(S):
    while S.parent is not None:
        S = S.parent
    return S


def resolve_load(S, n, ext):
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
    return M


def _nonlocal(S, n):
    t = S.parent
    while t is not None:
        if t.kind not in ("ClassDef", "Module") and n in t.info.bound and n not in t.info.globals:
            if n in t.info.nonlocals:
                return _nonlocal(t, n)
            return t
        t = t.parent
    raise Unencodable(f"no binding for nonlocal '{n}'")


def resolve_store(S, n):
    if n in S.info.globals:
        return module_of(S)
    if n in S.info.nonlocals:
        return _nonlocal(S, n)
    return S


class _NotLit(Exception):
    pass


# ------------------------------------------------------------------------------------------------
# the walker (code mode)
# ------------------------------------------------------------------------------------------------
class Walker:
    def __init__(self, tables, api_globals):
        self.T = tables
        self.G = api_globals            # the trusted prelude's globals (constructors)
        self.bits = {"structure": 0.0, "names": 0.0, "literals": 0.0, "moves": 0.0}
        self.info = {}
        self.ext = tables.ext_set
        self.literal_moves = []         # (wire call, fallback bits)

    def _charge(self, part, b):
        self.bits[part] += b

    def pick(self, part, dist, actual, key=None):
        p = dist.get(actual, 0.0)
        if p <= 0.0:
            raise Unencodable(f"{actual!r} has no codeword here ({key})")
        self._charge(part, -log2(p))
        return actual

    def gamma(self, part, n):
        self._charge(part, gamma_bits(n))
        return n

    def small_pick(self, part, name, alts, actual):
        return self.pick(part, self.T.small(name, alts), actual, key="small:" + name)

    def program(self, tree):
        self.info = bind(tree)
        M = self.new_scope("Module", None, tree)
        M.slots.append("agent")
        self.seq_nodes(tree.body, "Module", "body", "stmt", M)

    def new_scope(self, kind, parent, node):
        return Scope(kind, parent, self.info.get(id(node)))

    def seq_nodes(self, xs, parent, field, cat, S, target=False, elem_opt=False, length=None):
        mult = "seq_opt" if elem_opt else "seq"
        i = 0
        while True:
            if length is not None:
                if i >= length:
                    break
                self.one_node(xs[i], parent, field, cat, S, target, "implied_opt" if elem_opt else "one")
                i += 1
                continue
            x = xs[i] if i < len(xs) else END
            if self.one_node(x, parent, field, cat, S, target, mult) is END:
                break
            i += 1

    def one_node(self, x, parent, field, cat, S, target=False, mult="one"):
        dist = self.T.node_dist(parent, field, cat, mult)
        actual = END if x is END else NONE if x is None else type(x).__name__
        lab = self.pick("structure", dist, actual, key=f"{parent}.{field}")
        if lab == END:
            return END
        if lab == NONE:
            return None
        return self.walk(x, lab, S, target)

    def walk(self, x, cls, S, target=False):
        if cls in SCOPE_NODES:
            return self.walk_scope(x, cls, S)
        if cls == "Call":
            mv = self.literal_move(x, S)
            if mv is not None:
                # The host decides validity: charge the generic coding aside as the fallback.
                saved = dict(self.bits)
                self.pick("moves", {True: Q_MOVE, False: 1 - Q_MOVE}, False, key="Call.literal")
                for fname, fk in self.T.classes[cls]:
                    self.field(x, cls, fname, fk, S, target)
                fallback = sum(self.bits.values()) - sum(saved.values())
                self.bits = saved
                self.literal_moves.append((mv, fallback))
                return x
            self.pick("moves", {True: Q_MOVE, False: 1 - Q_MOVE}, False, key="Call.literal")
        if cls == "alias":
            raise Unencodable("alias is walked by its parent")
        for fname, fk in self.T.classes[cls]:
            self.field(x, cls, fname, fk, S, target)
        return x

    def field(self, x, cls, fname, fk, S, target):
        k = fk["k"]
        cur = getattr(x, fname, None)
        if k == "skip":
            return
        if k == "node":
            if (cls, fname) == ("NamedExpr", "target"):
                while S.is_comp():
                    S = S.parent
            if cls in ("Import", "ImportFrom") and fname == "names":
                return self.aliases(x, cls, S)
            tgt = bool(fk.get("target")) or (target and cls in ("Tuple", "List", "Starred") and fname in ("elts", "value"))
            m = fk["m"]
            if m == "implied":
                n = len(getattr(x, fk["len"]))
                self.seq_nodes(cur, cls, fname, fk["cat"], S, tgt, fk.get("eopt", False), length=n)
            elif m in ("seq", "seq_opt"):
                self.seq_nodes(cur, cls, fname, fk["cat"], S, tgt, m == "seq_opt")
            else:
                self.one_node(cur, cls, fname, fk["cat"], S, tgt, m)
            return
        if k == "ident":
            self.ident(x, cls, fname, fk, S, target, cur)
            return
        if k == "const":
            self.constant(cur)
            return
        if k == "int":
            self.small_int(fk["role"], cur)
            return
        raise Unencodable(k)

    def walk_scope(self, x, cls, S):
        inner = self.new_scope(cls, S, x)
        if cls in ("FunctionDef", "AsyncFunctionDef", "ClassDef", "Lambda"):
            for fname, fk in self.T.classes[cls]:
                if fk["k"] == "skip":
                    continue
                if fname == "args":
                    self.arguments(x, S, inner)
                    continue
                where = S if fname in OUTER.get(cls, ()) else inner
                if fname == "name":
                    self.bind_ident(S, x.name)
                    continue
                self.field(x, cls, fname, fk, where, False)
            return x
        for fname, fk in self.T.classes[cls]:
            if fname == "generators":
                xs = x.generators
                i = 0
                while True:
                    g = xs[i] if i < len(xs) else END
                    lab = self.pick("structure", self.T.node_dist(cls, "generators", "comprehension", "seq"),
                                    END if g is END else "comprehension", key=f"{cls}.generators")
                    if lab == END:
                        break
                    self.comprehension(g, inner, S if i == 0 else inner)
                    i += 1
            else:
                self.field(x, cls, fname, fk, inner, False)
        return x

    def comprehension(self, g, inner, iter_scope):
        for fname, fk in self.T.classes["comprehension"]:
            self.field(g, "comprehension", fname, fk, iter_scope if fname == "iter" else inner, False)

    def arguments(self, x, outer, inner):
        a = x.args
        for fname, fk in self.T.classes["arguments"]:
            cur = getattr(a, fname, None)
            if fname in ("posonlyargs", "args", "kwonlyargs"):
                i = 0
                while True:
                    y = cur[i] if i < len(cur) else END
                    lab = self.pick("structure", self.T.node_dist("arguments", fname, "arg", "seq"),
                                    END if y is END else "arg", key=f"arguments.{fname}")
                    if lab == END:
                        break
                    self.arg(y, outer, inner)
                    i += 1
            elif fname in ("vararg", "kwarg"):
                lab = self.pick("structure", self.T.node_dist("arguments", fname, "arg", "opt"),
                                NONE if cur is None else "arg", key=f"arguments.{fname}")
                if lab != NONE:
                    self.arg(cur, outer, inner)
            elif fname == "kw_defaults":
                self.seq_nodes(cur, "arguments", fname, "expr", outer, False, True, length=len(a.kwonlyargs))
            else:
                self.seq_nodes(cur, "arguments", fname, "expr", outer)

    def arg(self, y, outer, inner):
        self.bind_ident(inner, y.arg)
        self.one_node(y.annotation, "arg", "annotation", "expr", outer, False, "opt")

    # --- identifiers ---
    def ident(self, x, cls, fname, fk, S, target, cur):
        role, m = fk["role"], fk["m"]
        if role == "name":
            return self.name(S, cur, target)
        if role == "bind":
            if m == "opt":
                if not self.small_pick("names", f"{cls}.{fname}.present", [True, False], cur is not None):
                    return None
            return self.bind_ident(S, cur)
        if role == "attr":
            if m == "seq":
                i = 0
                while True:
                    y = cur[i] if i < len(cur) else END
                    lab = self.pick("names", {END: 0.5, "more": 0.5}, END if y is END else "more")
                    if lab == END:
                        break
                    self.attr_name(None, y)
                    i += 1
                return cur
            return self.attr_name(self._module_of_expr(x.value, S), cur)
        if role == "kwarg":
            if not self.small_pick("names", "keyword.arg.present", [True, False], cur is not None):
                return None
            return self.vocab_name("names", self.T.kwarg, cur, key="kwarg")
        if role in ("global", "nonlocal"):
            return self.declarations(S, role, cur)
        if role == "modpath":
            if not self.small_pick("names", "ImportFrom.module.present", [True, False], cur is not None):
                return None
            return self.vocab_name("names", self.T.modpath, cur, key="modpath")
        raise Unencodable(role)

    def vocab_name(self, part, dist, actual, key=None):
        if actual in dist:
            self._charge(part, -log2(dist[actual]))
            return actual
        self.pick(part, dist, ESC, key=key)
        self._charge(part, string_bits(actual))
        return actual

    def attr_name(self, module, actual):
        if module is not None and module in self.T.modattr:
            return self.vocab_name("names", self.T.modattr[module], actual, key=f"mattr:{module}")
        return self.vocab_name("names", self.T.attr, actual, key="attr")

    def _module_of_expr(self, base, S):
        if not isinstance(base, ast.Name):
            return None
        R = resolve_load(S, base.id, self.ext)
        return None if R == "ext" else R.module_of.get(base.id)

    def name(self, S, actual, target):
        if target:
            return self.bind_ident(S, actual)
        n_user = sum(len(V.slots) + 1 for V in visible(S))
        R = resolve_load(S, actual, self.ext)
        if R == "ext":
            self._charge("names", -log2(P_EXT * self.T.ext[actual]))
            return actual
        if R not in visible(S):
            raise Unencodable(f"name {actual!r} resolves outside the visible scopes")
        if actual not in R.slots:
            R.slots.append(actual)
        self._charge("names", -log2((1 - P_EXT) / n_user))
        return actual

    def bind_ident(self, S, actual, module=None):
        k = len(S.slots) + 1 + len(S.declared)
        R = resolve_store(S, actual)
        if R is not S and not any(D is R and nm == actual for D, nm in S.declared):
            raise Unencodable(f"binding of {actual!r} outside its scope")
        if R is S and actual not in S.slots:
            S.slots.append(actual)
        R.module_of.pop(actual, None)
        if module is not None:
            R.module_of[actual] = module
        self._charge("names", log2(k))
        return actual

    def declarations(self, S, role, cur):
        if role == "global":
            targets = [module_of(S)]
        else:
            targets = [V for V in visible(S)[1:] if V.kind not in ("Module", "ClassDef")]
        i = 0
        while True:
            k = 1 + sum(len(V.slots) for V in targets) + len(targets)
            if cur is None or i >= len(cur):
                self._charge("names", log2(k))
                break
            nm = cur[i]
            V = module_of(S) if role == "global" else _nonlocal(S, nm)
            if nm not in V.slots:
                V.slots.append(nm)
            S.declared.append((V, nm))
            self._charge("names", log2(k))
            i += 1
        return cur

    def aliases(self, x, cls, S):
        cur = x.names
        i = 0
        while True:
            y = cur[i] if i < len(cur) else END
            lab = self.pick("structure", self.T.node_dist(cls, "names", "alias", "seq"),
                            END if y is END else "alias", key=f"{cls}.names")
            if lab == END:
                break
            if cls == "Import":
                nm = self.vocab_name("names", self.T.modpath, y.name, key="modpath")
                dotted = "." in nm
                has_as = False
                if dotted:
                    has_as = self.small_pick("names", "alias.dotted_asname.present", [True, False],
                                             y.asname is not None)
                actual = y.asname or (nm if not dotted else nm.split(".")[0])
                mod = nm if (has_as or not dotted) else nm.split(".")[0]
                self.bind_ident(S, actual, module=mod)
            else:
                dist = self.T.modattr.get(x.module, self.T.attr)
                star = self.small_pick("names", "alias.star", [True, False], y.name == "*")
                if not star:
                    self.vocab_name("names", dist, y.name,
                                    key=f"mattr:{x.module}" if x.module in self.T.modattr else "attr")
                    self.bind_ident(S, y.asname or y.name)
            i += 1

    # --- literals ---
    def small_int(self, role, cur):
        if role == "level":
            self.gamma("literals", (cur or 0) + 1)
            return
        alts = CONVERSIONS if role == "conversion" else [0, 1]
        self.small_pick("literals", role, alts, cur)

    def constant(self, v):
        kind = ("bool" if isinstance(v, bool) else "None" if v is None else "Ellipsis" if v is ... else
                type(v).__name__)
        self.small_pick("literals", "const_kind", CONST_KINDS, kind)
        if kind == "int":
            if v < 0:
                raise Unencodable("negative int constant")
            self.gamma("literals", v + 1)
        elif kind == "bool":
            self.pick("literals", {True: 0.5, False: 0.5}, v)
        elif kind in ("None", "Ellipsis"):
            pass
        elif kind == "str":
            voc = self.T.strings
            if v in self.T.string_set:
                self._charge("literals", -log2(P_STRVOC / len(voc)))
            else:
                self._charge("literals", -log2(1 - P_STRVOC))
                self._charge("literals", string_bits(v))
        elif kind == "bytes":
            self.gamma("literals", len(v) + 1)
            self._charge("literals", 8 * len(v))
        elif kind in ("float", "complex"):
            if kind == "complex" and v.real != 0:
                raise Unencodable("complex constant with a real part")
            r = repr(float(v.imag if kind == "complex" else v))
            self.gamma("literals", len(r) + 1)
            self._charge("literals", len(r) * log2(len(FLOAT_ALPHABET)))
        else:
            raise Unencodable(f"constant of kind {kind}")

    # --- literal moves ---
    def literal_move(self, call, S):
        """The wire call a mutator constructor builds from literal arguments, else None."""
        f = call.func
        if not (isinstance(f, ast.Name) and f.id in self.T.mutators and self._is_ext(S, f.id)
                and callable(self.G.get(f.id))):
            return None
        if any(k.arg is None for k in call.keywords):
            return None
        try:
            args = [self._lit(a, S) for a in call.args]
            kw = {k.arg: self._lit(k.value, S) for k in call.keywords}
            mv = self.G[f.id](*args, **kw)
            text = self.G["__encode_calls"]([mv])
            wire = json.loads(text)
        except Exception:
            return None
        if not (isinstance(wire, list) and len(wire) == 1 and isinstance(wire[0], list) and len(wire[0]) == 2
                and isinstance(wire[0][0], str) and isinstance(wire[0][1], dict)):
            return None
        return wire[0]

    def _lit(self, e, S):
        if isinstance(e, ast.Constant):
            return e.value
        if isinstance(e, (ast.Tuple, ast.List)):
            return tuple(self._lit(x, S) for x in e.elts)
        if isinstance(e, ast.UnaryOp) and isinstance(e.op, (ast.USub, ast.UAdd)) and isinstance(e.operand, ast.Constant) \
                and isinstance(e.operand.value, (int, float)) and not isinstance(e.operand.value, bool):
            return -e.operand.value if isinstance(e.op, ast.USub) else e.operand.value
        if isinstance(e, ast.Name) and self._is_ext(S, e.id) and e.id in self.T.api and e.id in self.G \
                and not callable(self.G[e.id]):
            return self.G[e.id]
        if isinstance(e, ast.Call) and isinstance(e.func, ast.Name) and e.func.id in self.T.areas \
                and self._is_ext(S, e.func.id) and not e.keywords and callable(self.G.get(e.func.id)):
            return self.G[e.func.id](*[self._lit(a, S) for a in e.args])
        raise _NotLit()

    def _is_ext(self, S, n):
        return resolve_load(S, n, self.ext) == "ext"


def ast_bits(tree, tables, api_globals):
    """{'parts': {structure, names, literals, moveFlags}, 'literalMoves': [wire], 'fallbacks': [bits]}."""
    w = Walker(tables, api_globals)
    w.program(tree)
    return {"parts": {"structure": w.bits["structure"], "names": w.bits["names"],
                      "literals": w.bits["literals"], "moveFlags": w.bits["moves"]},
            "literalMoves": [m for m, _ in w.literal_moves],
            "fallbacks": [b for _, b in w.literal_moves]}
