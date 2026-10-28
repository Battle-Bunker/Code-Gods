"""The probabilistic grammar of the agent language, written once as a *walker*.

`walk_program(ctx, prog, S)` visits the IR (prog) and, at each choice point, asks S to choose among the
alternatives the context allows:

  * S = Coder  : the IR is given; S charges -log2 p(the IR's choice | context)  -> description bits
  * S = Sampler: prog is None; S draws a choice at random and the walker builds the IR -> random agents

Because both directions run through the same code, the code lengths are exactly -log2 of the sampling
probabilities. The code is prefix-free (each program is a path in a tree of choices whose branch sets
depend only on earlier choices) and satisfies Kraft: Σ 2^-bits = P(sampler halts) ≤ 1. Variable names
are never coded: programs equal up to renaming share a codeword (the IR is the canonical form).
"""
from __future__ import annotations

from dataclasses import replace
from typing import Optional

from ..mutators import by_id
from .lang import (ARITH, BEST_TYPES, BOOL, CELL, COL_OPS, COLOUR, GRID, ITER_TYPES, LINE, LIST_TYPES, MAX_LISTLIT, MOVE,
                   NUM, NUM_OPS, PARAM_TYPES, REGION, RET_TYPES, VALUE_TYPES, Ctx, Def, L, LangError, Node, Sampler,
                   Var, _Missing, _TooBig, block_sizes, dom_values, elem_of, field_choices, num_attrs, slots_of)

ATTR_DOM = {"row": "idx", "column": "idx", "value": "val", "rank": "rank", "symbol": "sym", "suit": "suit"}


def dom_of(n: Node, ctx: Ctx):
    """The literal domain a Num expression's partner literals are coded in (decoder-computable)."""
    if n.tag == "Lit" and n.type == NUM:
        return n.val[1]
    if n.tag == "Attr" and n.type == NUM:
        return ATTR_DOM[n.val]
    if n.tag in ("Count", "Len"):
        return "cnt"
    if n.tag == "Var" and n.type == NUM:
        v = ctx.lookup(n.val)
        return v.dom if v else "gen"
    return "gen"


def _kid(n: Optional[Node], i: int):
    return None if n is None else n.kids[i]


def _line(S, n):
    if n is not None and getattr(n, "line", 0):
        S.line = n.line


# ------------------------------------------------------------------------------------------------
# program, defs, blocks, statements
# ------------------------------------------------------------------------------------------------
def walk_program(ctx: Ctx, prog: Optional[Node], S) -> Node:
    defs_in = list(prog.kids[0]) if prog is not None else None
    defs_out, i = [], 0
    while True:
        actual = None if prog is None else ("Def" if i < len(defs_in) else "Main")
        if prog is not None and i < len(defs_in):
            _line(S, defs_in[i])
        if S.choose("top", ("Def", "Main"), actual) == "Main":
            break
        d = walk_def(ctx, defs_in[i] if prog is not None else None, S)
        name, _, ptypes, ret = d.val
        ctx = replace(ctx, defs=ctx.defs + (Def(name, ptypes, ret),))
        defs_out.append(d)
        i += 1
    main, _ = walk_block(replace(ctx, mode="main", scope=(), ret=None), prog.kids[1] if prog is not None else None, S)
    return Node("Program", "", (tuple(defs_out), main))


def walk_def(ctx: Ctx, d: Optional[Node], S) -> Node:
    _line(S, d)
    np_ = S.choose("nparams", (1, 2), None if d is None else len(d.val[2]))
    ptypes = tuple(S.choose("ptype", PARAM_TYPES, None if d is None else d.val[2][k]) for k in range(np_))
    ret = S.choose("rtype", RET_TYPES, None if d is None else d.val[3])
    name = S.name("f", None if d is None else d.val[0])
    pnames = tuple(S.name("p", None if d is None else d.val[1][k]) for k in range(np_))
    dctx = Ctx(ctx.gt, tuple(Var(pn, pt) for pn, pt in zip(pnames, ptypes)), ctx.defs, "def", ret)
    body, _ = walk_block(dctx, _kid(d, 0), S)
    return Node("Def", "", (body,), (name, pnames, ptypes, ret), getattr(d, "line", 0))


STMTS_MAIN = ("End", "Assign", "Act", "If", "For", "Return")
STMTS_DEF = ("End", "Assign", "If", "For", "Return")


def walk_block(ctx: Ctx, stmts, S) -> tuple[tuple, Ctx]:
    out, i = [], 0
    alts = STMTS_MAIN if ctx.mode == "main" else STMTS_DEF
    S.depth += 1
    while True:
        st = None if stmts is None else (stmts[i] if i < len(stmts) else None)
        _line(S, st)
        tag = S.choose("stmt", alts, None if stmts is None else (st.tag if st is not None else "End"))
        if tag == "End":
            break
        st2, ctx = walk_stmt(tag, ctx, st, S)
        out.append(st2)
        i += 1
    S.depth -= 1
    return tuple(out), ctx


def _merge(base: Ctx, *branches: Ctx) -> Ctx:
    """Scope after a compound statement: variables first assigned inside stay visible (as in Python)."""
    out = base
    for b in branches:
        for v in b.scope:
            if out.lookup(v.name) is None:
                out = out.bind(v)
    return out


def walk_stmt(tag: str, ctx: Ctx, st: Optional[Node], S) -> tuple[Node, Ctx]:
    line = getattr(st, "line", 0)
    if tag == "Assign":
        T = S.choose("atype", VALUE_TYPES, None if st is None else st.type)
        e = walk_expr(T, ctx.with_dom("gen"), _kid(st, 0), S)
        existing = [v.name for v in ctx.vars_of(T)]
        actual = None if st is None else ("<new>" if st.val[1] else st.val[0])
        tgt = S.choose("target", ["<new>"] + existing, actual)
        if tgt == "<new>":
            name = S.name("v", None if st is None else st.val[0])
            ctx2 = ctx.bind(Var(name, T, dom_of(e, ctx)))
            return Node("Assign", T, (e,), (name, True), line), ctx2
        return Node("Assign", T, (e,), (tgt, False), line), ctx
    if tag == "Act":
        return Node("Act", "", (walk_expr(MOVE, ctx.with_dom("gen"), _kid(st, 0), S),), None, line), ctx
    if tag == "If":
        c = walk_expr(BOOL, ctx.with_dom("gen"), _kid(st, 0), S)
        then, ct = walk_block(ctx, _kid(st, 1), S)
        has_else = S.choose("else", (False, True), None if st is None else st.kids[2] is not None)
        if has_else:
            els, ce = walk_block(ctx, _kid(st, 2), S)
        else:
            els, ce = None, ctx
        return Node("If", "", (c, then, els), None, line), _merge(ctx, ct, ce)
    if tag == "For":
        LT = S.choose("ltype", ITER_TYPES, None if st is None else st.type)
        lst = walk_expr(LT, ctx.with_dom("gen"), _kid(st, 0), S)
        name = S.name("x", None if st is None else st.val)
        body, cb = walk_block(ctx.bind(Var(name, elem_of(LT))), _kid(st, 1), S)
        cb = replace(cb, scope=tuple(v for v in cb.scope if v.name != name))
        return Node("For", LT, (lst, body), name, line), _merge(ctx, cb)
    if tag == "Return":
        if ctx.mode == "main":
            return Node("Return", "", (), None, line), ctx
        return Node("Return", ctx.ret, (walk_expr(ctx.ret, ctx.with_dom("gen"), _kid(st, 0), S),), None, line), ctx
    raise LangError(f"internal: statement {tag}")


# ------------------------------------------------------------------------------------------------
# expressions
# ------------------------------------------------------------------------------------------------
def expr_alts(T: str, ctx: Ctx) -> list:
    a = ["Var"] if ctx.vars_of(T) else []
    gt = ctx.gt
    defs_ret = [d for d in ctx.defs if d.ret == T]
    if T == NUM:
        a += ["Lit", "Attr", "Count", "Len", "Sum", "Min", "Max", "Abs", "Neg", "BinOp", "Score", "Size", "Best"]
        a += ["DefCall"] if defs_ret else []
    elif T == BOOL:
        a += ["Lit", "Compare", "And", "Or", "Not", "Any", "All"] + (["Attr"] if gt.symbols == "cards" else [])
        a += ["DefCall"] if defs_ret else []
    elif T == COLOUR:
        a += ["Lit", "Attr", "TopColour", "Best"]
    elif T == CELL:
        a += ["CellAt", "Best"]
    elif T == LINE:
        a += ["Row", "Column", "Best"]
    elif T == REGION:
        a += ["AsCell", "AsLine", "Block", "Ring", "Diag"] + (["Core"] if gt.N >= 4 else []) + ["Everything"]
    elif T == GRID:
        a = ["Grid"]
    elif T == MOVE:
        a += ["ConstCall", "DynCall", "Best"]
    elif T == L(CELL):
        a += ["GridCells", "RegionCells", "Neighbours", "Comp", "ListLit"]
    elif T == L(LINE):
        a += ["GridRows", "GridColumns", "GridLines", "Comp", "ListLit"]
    elif T == L(MOVE):
        a += ["Moves", "EveryMove", "Comp", "ListLit"]
    elif T == L(NUM):
        a += ["Range", "Comp", "ListLit"]
    elif T == L(COLOUR):
        a += ["Colours", "Comp", "ListLit"]
    elif T == L(BOOL):
        a += ["Comp", "ListLit"]
    else:
        raise LangError(f"internal: no expressions of type {T}")
    return a


LEAF = {"Size": NUM, "Grid": GRID, "Core": REGION, "Everything": REGION, "EveryMove": L(MOVE), "GridCells": L(CELL),
        "GridRows": L(LINE), "GridColumns": L(LINE), "GridLines": L(LINE), "Colours": L(COLOUR)}


def walk_expr(T: str, ctx: Ctx, n: Optional[Node], S) -> Node:
    tag = S.choose("expr:" + T, expr_alts(T, ctx), None if n is None else n.tag)
    S.depth += 1
    try:
        return _expr(tag, T, ctx, n, S)
    finally:
        S.depth -= 1


def _sub(T, ctx, n, i, S, dom="gen"):
    return walk_expr(T, ctx.with_dom(dom), _kid(n, i), S)


def _expr(tag: str, T: str, ctx: Ctx, n: Optional[Node], S) -> Node:
    gt = ctx.gt
    mk = lambda kids=(), val=None: Node(tag, T, tuple(kids), val, getattr(n, "line", 0))
    if tag in LEAF:
        return mk()
    if tag == "Var":
        names = [v.name for v in ctx.vars_of(T)]
        i = S.index("var", len(names), None if n is None else names.index(n.val))
        return mk((), names[i])
    if tag == "Lit":
        if T == NUM:
            vals = dom_values(ctx.dom, gt)
            if n is not None and n.val[1] != ctx.dom:
                raise LangError(f"internal: literal domain {n.val[1]} != {ctx.dom}")
            if n is not None and n.val[0] not in vals:
                raise LangError(f"the number {n.val[0]} is out of range here (allowed: {vals[0]}..{vals[-1]})", n.line)
            i = S.index("lit", len(vals), None if n is None else vals.index(n.val[0]))
            return mk((), (vals[i], ctx.dom))
        if T == BOOL:
            return mk((), S.choose("bool", (False, True), None if n is None else n.val))
        return mk((), S.index("colour", gt.C, None if n is None else n.val))
    if tag == "Attr":
        if T == NUM:
            attr = S.choose("nattr", num_attrs(gt), None if n is None else n.val)
        else:
            attr = "is_face" if T == BOOL else "colour"
        return mk((_sub(CELL, ctx, n, 0, S),), attr)
    if tag == "Count":
        ot = S.choose("cobj", (REGION, GRID), None if n is None else n.kids[0].type)
        obj = _sub(ot, ctx, n, 0, S)
        wt = S.choose("cwhat", (COLOUR, NUM), None if n is None else n.kids[1].type)
        return mk((obj, _sub(wt, ctx, n, 1, S, "val")))
    if tag == "Len":
        lt = S.choose("lentype", LIST_TYPES, None if n is None else n.kids[0].type)
        return mk((_sub(lt, ctx, n, 0, S),))
    if tag in ("Sum", "Min", "Max"):
        return mk((_sub(L(NUM), ctx, n, 0, S),))
    if tag in ("Abs", "Neg"):
        return mk((_sub(NUM, ctx, n, 0, S),))
    if tag == "BinOp":
        op = S.choose("arith", ARITH, None if n is None else n.val)
        a = _sub(NUM, ctx, n, 0, S)
        return mk((a, _sub(NUM, ctx, n, 1, S, dom_of(a, ctx))), op)
    if tag == "Score":
        at = S.choose("sarg", (MOVE, GRID), None if n is None else n.kids[0].type)
        return mk((_sub(at, ctx, n, 0, S),))
    if tag == "DefCall":
        ds = [d for d in ctx.defs if d.ret == T]
        i = S.index("def", len(ds), None if n is None else [d.name for d in ds].index(n.val))
        d = ds[i]
        return mk([_sub(pt, ctx, n, k, S) for k, pt in enumerate(d.ptypes)], d.name)
    if tag == "Best":
        lst = _sub(L(T), ctx, n, 0, S)
        return mk((lst, walk_func(T, ctx, _kid(n, 1), S)))
    if tag == "Compare":
        kt = S.choose("ckind", (NUM, COLOUR), None if n is None else n.kids[0].type)
        op = S.choose("cop:" + kt, NUM_OPS if kt == NUM else COL_OPS, None if n is None else n.val)
        a = _sub(kt, ctx, n, 0, S)
        return mk((a, _sub(kt, ctx, n, 1, S, dom_of(a, ctx))), op)
    if tag in ("And", "Or"):
        return mk((_sub(BOOL, ctx, n, 0, S), _sub(BOOL, ctx, n, 1, S)))
    if tag == "Not":
        return mk((_sub(BOOL, ctx, n, 0, S),))
    if tag in ("Any", "All"):
        return mk((_sub(L(BOOL), ctx, n, 0, S),))
    if tag == "TopColour":
        return mk((_sub(REGION, ctx, n, 0, S),))
    if tag == "CellAt":
        return mk((_sub(NUM, ctx, n, 0, S, "idx"), _sub(NUM, ctx, n, 1, S, "idx")))
    if tag in ("Row", "Column"):
        return mk((_sub(NUM, ctx, n, 0, S, "idx"),))
    if tag == "AsCell":
        return mk((_sub(CELL, ctx, n, 0, S),))
    if tag == "AsLine":
        return mk((_sub(LINE, ctx, n, 0, S),))
    if tag == "Block":
        r, c = _sub(NUM, ctx, n, 0, S, "idx"), _sub(NUM, ctx, n, 1, S, "idx")
        ks = block_sizes(gt)
        if n is not None and n.val not in ks:
            raise LangError(f"a block is {' or '.join(map(str, ks))} cells wide", n.line)
        k = ks[S.index("bsize", len(ks), None if n is None else ks.index(n.val))]
        return mk((r, c), k)
    if tag == "Ring":
        return mk((_sub(NUM, ctx, n, 0, S, "ring"),))
    if tag == "Diag":
        return mk((_sub(NUM, ctx, n, 0, S, "diag"),))
    if tag == "ConstCall":
        mid = S.choose("mutator", ctx.mids, None if n is None else n.val[0])
        p: dict = {}
        for f in by_id(mid).fields:
            ch = f.choices(gt, p)
            if ch is None:
                continue
            if n is not None and n.val[1].get(f.name) not in ch:
                raise LangError(f"{mid}: {f.name}={n.val[1].get(f.name)!r} is not allowed", n.line)
            p[f.name] = ch[S.index("field", len(ch), None if n is None else ch.index(n.val[1][f.name]))]
        return mk((), (mid, p))
    if tag == "DynCall":
        return _dyncall(T, ctx, n, S, mk)
    if tag == "Moves":
        return mk((), S.choose("mutator", ctx.mids, None if n is None else n.val))
    if tag == "RegionCells":
        return mk((_sub(REGION, ctx, n, 0, S),))
    if tag == "Neighbours":
        return mk((_sub(CELL, ctx, n, 0, S),))
    if tag == "Range":
        k = S.choose("nrange", (1, 2), None if n is None else len(n.kids))
        return mk([_sub(NUM, ctx, n, i, S) for i in range(k)])
    if tag == "Comp":
        return _comp(T, ctx, n, S, mk)
    if tag == "ListLit":
        k = 1 + S.index("llen", MAX_LISTLIT, None if n is None else len(n.kids) - 1)
        X = elem_of(T)
        return mk([_sub(X, ctx, n, i, S) for i in range(k)])
    raise LangError(f"internal: expression {tag}")


def _comp(T, ctx, n, S, mk):
    X = elem_of(T)
    ng = S.choose("ngen", (1, 2), None if n is None else len(n.kids) - 2)
    lists, names, c2 = [], [], ctx
    for g in range(ng):
        lt = S.choose("ltype", ITER_TYPES, None if n is None else n.kids[2 + g].type)
        lists.append(walk_expr(lt, c2.with_dom("gen"), _kid(n, 2 + g), S))
        nm = S.name("y", None if n is None else n.val[g])
        names.append(nm)
        c2 = c2.bind(Var(nm, elem_of(lt)))
    has_f = S.choose("filter", (False, True), None if n is None else n.kids[1] is not None)
    cond = walk_expr(BOOL, c2.with_dom("gen"), _kid(n, 1), S) if has_f else None
    e = walk_expr(X, c2.with_dom("gen"), _kid(n, 0), S)
    return mk([e, cond] + lists, tuple(names))


def _dyncall(T, ctx, n, S, mk):
    gt = ctx.gt
    mid = S.choose("mutator", ctx.mids, None if n is None else n.val[0])
    slots = slots_of(mid)
    svals_in = None if n is None else n.val[1]
    p_lit: dict = {}
    svals, kids, ki = [], [], 0
    for si, slot in enumerate(slots):
        sv = None if svals_in is None else svals_in[si]
        try:
            ch0 = field_choices(slot.fields[0], gt, p_lit)
            dep = False
        except _Missing:
            ch0, dep = None, True
        if not dep and ch0 is None:
            if sv is not None and sv[0] != "absent":
                raise LangError(f"{mid}: {slot.name} is not used here", getattr(n, "line", 0))
            svals.append(("absent",))
            continue
        if not slot.computable:
            if dep:
                if n is None:
                    raise _TooBig()
                raise LangError(f"{mid}: when the area is worked out while running, {slot.name} can't be chosen",
                                getattr(n, "line", 0))
            form = "lit"
        elif dep:
            form = "expr"
            if sv is not None and sv[0] != "expr":
                raise LangError(f"{mid}: {slot.name} depends on something worked out while running, so it must be"
                                f" worked out too", getattr(n, "line", 0))
        else:
            form = S.choose("slotform", ("lit", "expr"), None if sv is None else sv[0])
        if form == "lit":
            vals = {}
            for f in slot.fields:
                ch = field_choices(f, gt, p_lit)
                if ch is None:
                    continue
                if sv is not None and sv[1].get(f.name) not in ch:
                    raise LangError(f"{mid}: {f.name}={sv[1].get(f.name)!r} is not allowed", getattr(n, "line", 0))
                v = ch[S.index("field", len(ch), None if sv is None else ch.index(sv[1][f.name]))]
                vals[f.name] = p_lit[f.name] = v
            svals.append(("lit", vals))
        else:
            base = slot.type[5:] if slot.type.startswith("Pair:") else slot.type
            for _ in range(slot.arity):
                kids.append(walk_expr(base, ctx.with_dom(slot.dom), None if n is None else n.kids[ki], S))
                ki += 1
            svals.append(("expr", slot.arity))
    if not any(s[0] == "expr" for s in svals):
        if n is None:
            raise _TooBig()          # all-literal calls are ConstCalls (this mass is simply unused)
        raise LangError("internal: DynCall without computed arguments")
    return mk(kids, (mid, tuple(svals)))


def walk_func(X: str, ctx: Ctx, f: Optional[Node], S) -> Node:
    ds = [d for d in ctx.defs if d.ptypes == (X,)]
    alts = ["Lambda"] + (["DefRef"] if ds else []) + (["ScoreFn"] if X == MOVE else [])
    tag = S.choose("func", alts, None if f is None else f.tag)
    line = getattr(f, "line", 0)
    if tag == "Lambda":
        rt = S.choose("rtype", RET_TYPES, None if f is None else f.type)
        nm = S.name("z", None if f is None else f.val)
        body = walk_expr(rt, ctx.bind(Var(nm, X)).with_dom("gen"), _kid(f, 0), S)
        return Node("Lambda", rt, (body,), nm, line)
    if tag == "DefRef":
        i = S.index("def", len(ds), None if f is None else [d.name for d in ds].index(f.val))
        return Node("DefRef", ds[i].ret, (), ds[i].name, line)
    return Node("ScoreFn", NUM, (), None, line)


# ------------------------------------------------------------------------------------------------
# entry points
# ------------------------------------------------------------------------------------------------
def describe_bits(prog: Node, gt) -> tuple[float, dict, list]:
    """(total bits, bits per source line, list of (line, choice, bits))."""
    from .lang import Coder
    S = Coder()
    S.depth = 0
    walk_program(Ctx(gt), prog, S)
    return S.bits, dict(S.per_line), S.events


def sample_program(gt, rng, max_nodes: int = 60, max_depth: int = 7, tries: int = 10000) -> tuple[Node, float]:
    """A random program from the grammar's own distribution (rejecting draws above the size cap)."""
    for _ in range(tries):
        S = Sampler(rng, max_nodes, max_depth)
        try:
            return walk_program(Ctx(gt), None, S), S.logp
        except _TooBig:
            continue
    raise RuntimeError("sampler kept exceeding the size cap")
