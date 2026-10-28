"""Source text -> typed IR (elaborate), and IR -> source text (unparse).

The accepted language is a whitelist of Python's own syntax: assignments, `+=`, `if/elif/else`,
`for x in <list>`, `return`, top-level `def` helpers, comparisons, `and/or/not`, arithmetic, list
literals and comprehensions, lambdas (only as `by=`), calls to the built-ins below and to mutators.
There is no `while`, no recursion (a def can only call defs written above it), no imports, no
attribute other than the documented ones, no strings except mutator options like `layer="colour"`.
"""
from __future__ import annotations

import ast
from dataclasses import dataclass, field
from typing import Optional

from ..core import GridType
from ..mutators import by_id
from .grammar import dom_of
from .lang import (BOOL, CELL, COLOUR, DEFAULTS, GRID, LINE, MAX_LISTLIT, MOVE, NUM, PARAM_TYPES, REGION, Ctx, Def,
                   L, LangError, Node, Var, _Missing, block_sizes, check_params, dom_values, elem_of, field_choices,
                   kid_order, kid_type, mutator_ids, num_attrs, region_value, slot_params, slots_of)

REGION_FUNCS = ("row", "column", "cell", "block", "ring", "diagonal")
BUILTINS = {"grid", "colours", "core", "everything", "best_line", "score", "best", "moves", "every_move", "len",
            "sum", "min", "max", "abs", "any", "all", "range", "True", "False"} | set(REGION_FUNCS)
RESERVED = BUILTINS - set(REGION_FUNCS)      # local names may shadow row, cell, ... (then they can't be called)
TYPE_NAMES = {"Num": NUM, "int": NUM, "Number": NUM, "Colour": COLOUR, "Color": COLOUR, "Cell": CELL, "Line": LINE,
              "Move": MOVE}
OPS = {ast.Add: "+", ast.Sub: "-", ast.Mult: "*", ast.FloorDiv: "//", ast.Mod: "%"}
CMP = {ast.Eq: "==", ast.NotEq: "!=", ast.Lt: "<", ast.LtE: "<=", ast.Gt: ">", ast.GtE: ">="}


def _err(msg, node=None):
    raise LangError(msg, getattr(node, "lineno", 0))


@dataclass
class _DefSrc:
    name: str
    ast: ast.FunctionDef
    index: int
    ir: Optional[Node] = None
    sig: Optional[Def] = None
    busy: bool = False


class Elaborator:
    def __init__(self, gt: GridType):
        self.gt = gt
        self.mids = set(mutator_ids(gt))
        self.defsrc: dict[str, _DefSrc] = {}
        self.order: list[str] = []
        self.current_def_index = 10 ** 9

    # --- program ---------------------------------------------------------------------------------
    def program(self, src: str) -> Node:
        try:
            tree = ast.parse(src)
        except SyntaxError as e:
            raise LangError(f"Python can't read this: {e.msg}", e.lineno or 0)
        body = list(tree.body)
        k = 0
        while k < len(body) and isinstance(body[k], ast.FunctionDef):
            d = body[k]
            if d.name in self.defsrc or d.name in BUILTINS or d.name in self.mids or d.name in self.gt.colour_names:
                _err(f"the name {d.name} is already taken", d)
            self.defsrc[d.name] = _DefSrc(d.name, d, k)
            self.order.append(d.name)
            k += 1
        for s in body[k:]:
            if isinstance(s, ast.FunctionDef):
                _err("put every def at the top of the agent, before the other lines", s)
        ctx = Ctx(self.gt, mode="main")
        main, _ = self.block(body[k:], ctx)
        defs = []
        for name in self.order:
            d = self.defsrc[name]
            if d.ir is None:
                _err(f"the function {name} is never used", d.ast)
            defs.append(d.ir)
        return Node("Program", "", (tuple(defs), main))

    def _defs_ctx_upto(self, index: int) -> tuple:
        return tuple(self.defsrc[n].sig for n in self.order[:index] if self.defsrc[n].sig is not None)

    def resolve_def(self, name: str, ptypes: Optional[tuple], node) -> Def:
        d = self.defsrc[name]
        if d.index >= self.current_def_index:
            _err(f"{name} must be written above the function that uses it (no recursion)", node)
        if d.sig is not None:
            if ptypes is not None and ptypes != d.sig.ptypes:
                _err(f"{name} was used with a {', '.join(map(kid_type, d.sig.ptypes))} before, "
                     f"now with a {', '.join(map(kid_type, ptypes))}", node)
            return d.sig
        a = d.ast.args
        if a.vararg or a.kwarg or a.kwonlyargs or a.defaults or a.posonlyargs or d.ast.decorator_list:
            _err("a def takes one or two plain inputs", d.ast)
        if not 1 <= len(a.args) <= 2:
            _err("a def takes one or two inputs", d.ast)
        ann = []
        for x in a.args:
            if x.annotation is not None:
                if not isinstance(x.annotation, ast.Name) or x.annotation.id not in TYPE_NAMES:
                    _err(f"unknown type {ast.unparse(x.annotation)}", x)
                ann.append(TYPE_NAMES[x.annotation.id])
            else:
                ann.append(None)
        if ptypes is None:
            if None in ann:
                _err(f"can't tell what kind of input {name} takes; use it in best(..., by={name}) or call it first",
                     node)
            ptypes = tuple(ann)
        for t, at in zip(ptypes, ann):
            if at is not None and at != t:
                _err(f"{name} says its input is a {kid_type(at)} but gets a {kid_type(t)}", node)
        if len(ptypes) != len(a.args):
            _err(f"{name} takes {len(a.args)} input(s)", node)
        for t in ptypes:
            if t not in PARAM_TYPES:
                _err(f"a def input can't be a {kid_type(t)}", node)
        if d.busy:
            _err("no recursion", node)
        d.busy = True
        saved = self.current_def_index
        self.current_def_index = d.index
        pnames = tuple(x.arg for x in a.args)
        ctx = Ctx(self.gt, tuple(Var(n, t) for n, t in zip(pnames, ptypes)), self._defs_ctx_upto(d.index), "def", None)
        # return type: first `return` decides (Num or Bool)
        ret = self._guess_ret(d.ast, ctx)
        ctx = Ctx(ctx.gt, ctx.scope, ctx.defs, "def", ret)
        body, _ = self.block(d.ast.body, ctx)
        self.current_def_index = saved
        d.busy = False
        d.sig = Def(name, ptypes, ret)
        d.ir = Node("Def", "", (body,), (name, pnames, ptypes, ret), d.ast.lineno)
        return d.sig

    def _guess_ret(self, fn: ast.FunctionDef, ctx: Ctx) -> str:
        for s in ast.walk(fn):
            if isinstance(s, ast.Return) and s.value is not None:
                v = s.value
                if isinstance(v, (ast.Compare, ast.BoolOp)) or (isinstance(v, ast.UnaryOp) and isinstance(v.op, ast.Not)) \
                        or (isinstance(v, ast.Constant) and isinstance(v.value, bool)):
                    return BOOL
                if isinstance(v, ast.Call) and isinstance(v.func, ast.Name) and v.func.id in ("any", "all"):
                    return BOOL
                return NUM
        _err(f"the function {fn.name} needs a return line", fn)

    # --- statements ------------------------------------------------------------------------------
    def block(self, stmts, ctx: Ctx) -> tuple[tuple, Ctx]:
        out = []
        for s in stmts:
            n, ctx = self.stmt(s, ctx)
            if n is not None:
                out.append(n)
        return tuple(out), ctx

    def stmt(self, s, ctx: Ctx):
        if isinstance(s, ast.Pass):
            return None, ctx
        if isinstance(s, ast.Assign):
            if len(s.targets) != 1 or not isinstance(s.targets[0], ast.Name):
                _err("assign to one plain name, like  x = 3", s)
            return self.assign(s.targets[0].id, s.value, ctx, s)
        if isinstance(s, ast.AugAssign):
            if not isinstance(s.target, ast.Name) or type(s.op) not in OPS:
                _err("only  x += ..., x -= ..., x *= ...  on a name", s)
            v = ctx.lookup(s.target.id)
            if v is None or v.type != NUM:
                _err(f"{s.target.id} must already be a number", s)
            left = Node("Var", NUM, (), v.name, s.lineno)
            right = self.expr(s.value, ctx, NUM, v.dom)
            e = Node("BinOp", NUM, (left, right), OPS[type(s.op)], s.lineno)
            return Node("Assign", NUM, (e,), (v.name, False), s.lineno), ctx
        if isinstance(s, ast.Expr):
            if ctx.mode != "main":
                _err("a def can only work things out; it can't change the grid", s)
            e = self.expr(s.value, ctx)
            if e.type != MOVE:
                _err(f"this line works out a {kid_type(e.type)} but does nothing with it", s)
            return Node("Act", "", (e,), None, s.lineno), ctx
        if isinstance(s, ast.If):
            c = self.expr(s.test, ctx, BOOL)
            then, ct = self.block(s.body, ctx)
            els, ce = (None, ctx)
            if s.orelse:
                els, ce = self.block(s.orelse, ctx)
            from .grammar import _merge
            return Node("If", "", (c, then, els), None, s.lineno), _merge(ctx, ct, ce)
        if isinstance(s, ast.For):
            if s.orelse:
                _err("for ... else is not allowed", s)
            if not isinstance(s.target, ast.Name):
                _err("loop over one name, like  for cell in grid.cells", s)
            name = s.target.id
            self._fresh(name, ctx, s)
            lst = self.expr(s.iter, ctx)
            if elem_of(lst.type) is None or lst.type == L(BOOL):
                _err(f"you can only loop over a list (this is a {kid_type(lst.type)})", s)
            from .grammar import _merge
            body, cb = self.block(s.body, ctx.bind(Var(name, elem_of(lst.type))))
            from dataclasses import replace
            cb = replace(cb, scope=tuple(v for v in cb.scope if v.name != name))
            return Node("For", lst.type, (lst, body), name, s.lineno), _merge(ctx, cb)
        if isinstance(s, ast.Return):
            if ctx.mode == "main":
                if s.value is not None:
                    _err("in the main program, return just stops (it can't give back a value)", s)
                return Node("Return", "", (), None, s.lineno), ctx
            if s.value is None:
                _err("a def must return a value", s)
            return Node("Return", ctx.ret, (self.expr(s.value, ctx, ctx.ret),), None, s.lineno), ctx
        if isinstance(s, (ast.While,)):
            _err("no while loops: use  for ... in ...  (loops must have an end)", s)
        if isinstance(s, (ast.Import, ast.ImportFrom)):
            _err("no imports", s)
        if isinstance(s, ast.FunctionDef):
            _err("defs go at the top, not inside other code", s)
        _err(f"{type(s).__name__} statements are not part of the agent language", s)

    def _fresh(self, name, ctx, node):
        if name in RESERVED or name in self.mids or name in self.defsrc or name in self.gt.colour_names:
            _err(f"{name} is a built-in name; pick another", node)
        if ctx.lookup(name) is not None:
            _err(f"{name} is already used; pick a new name here", node)

    def assign(self, name, value, ctx: Ctx, s):
        if name in RESERVED or name in self.mids or name in self.defsrc or name in self.gt.colour_names:
            _err(f"{name} is a built-in name; pick another", s)
        v = ctx.lookup(name)
        if v is not None:
            e = self.expr(value, ctx, v.type)
            return Node("Assign", v.type, (e,), (name, False), s.lineno), ctx
        e = self.expr(value, ctx)
        if e.type == GRID:
            _err("you can't copy the grid into a name", s)
        return Node("Assign", e.type, (e,), (name, True), s.lineno), ctx.bind(Var(name, e.type, dom_of(e, ctx)))

    # --- expressions -----------------------------------------------------------------------------
    def expr(self, e, ctx: Ctx, want: Optional[str] = None, dom="gen") -> Node:
        n = self._expr(e, ctx, want, dom)
        return self.coerce(n, want, e) if want else n

    def coerce(self, n: Node, want: str, e) -> Node:
        if n.type == want:
            return n
        if want == REGION and n.type == CELL:
            return Node("AsCell", REGION, (n,), None, n.line)
        if want == REGION and n.type == LINE:
            return Node("AsLine", REGION, (n,), None, n.line)
        _err(f"expected a {kid_type(want)} here, got a {kid_type(n.type)}", e)

    def _expr(self, e, ctx: Ctx, want, dom) -> Node:
        ln = getattr(e, "lineno", 0)
        N = lambda tag, T, kids=(), val=None: Node(tag, T, tuple(kids), val, ln)
        gt = self.gt
        if isinstance(e, ast.Constant):
            v = e.value
            if isinstance(v, bool):
                return N("Lit", BOOL, (), v)
            if isinstance(v, int):
                vals = dom_values(dom, gt)
                if v not in vals:
                    _err(f"the number {v} is out of range here (allowed: {vals[0]} to {vals[-1]})", e)
                return N("Lit", NUM, (), (v, dom))
            _err("only whole numbers, True/False and names are allowed here", e)
        if isinstance(e, ast.Name):
            return self.name(e, ctx, want)
        if isinstance(e, ast.UnaryOp):
            if isinstance(e.op, ast.Not):
                return N("Not", BOOL, (self.expr(e.operand, ctx, BOOL),))
            if isinstance(e.op, ast.USub):
                return N("Neg", NUM, (self.expr(e.operand, ctx, NUM),))
            _err("only  -x  and  not x", e)
        if isinstance(e, ast.BinOp):
            if type(e.op) not in OPS:
                _err("only + - * // % on numbers (use // to divide)", e)
            a = self.expr(e.left, ctx, NUM)
            b = self.expr(e.right, ctx, NUM, dom_of(a, ctx))
            return N("BinOp", NUM, (a, b), OPS[type(e.op)])
        if isinstance(e, ast.BoolOp):
            tag = "And" if isinstance(e.op, ast.And) else "Or"
            acc = self.expr(e.values[0], ctx, BOOL)
            for v in e.values[1:]:
                acc = Node(tag, BOOL, (acc, self.expr(v, ctx, BOOL)), None, ln)
            return acc
        if isinstance(e, ast.Compare):
            if len(e.ops) != 1:
                _err("compare two things at a time (use  and  to join comparisons)", e)
            op = type(e.ops[0])
            if op not in CMP:
                _err("compare with == != < <= > >=", e)
            a = self.expr(e.left, ctx)
            if a.type == COLOUR:
                if CMP[op] not in ("==", "!="):
                    _err("colours can only be compared with == or !=", e)
                b = self.expr(e.comparators[0], ctx, COLOUR)
            elif a.type == NUM:
                b = self.expr(e.comparators[0], ctx, NUM, dom_of(a, ctx))
            else:
                _err(f"you can compare numbers or colours, not a {kid_type(a.type)}", e)
            return N("Compare", BOOL, (a, b), CMP[op])
        if isinstance(e, ast.Attribute):
            return self.attr(e, ctx)
        if isinstance(e, ast.Call):
            return self.call(e, ctx, want, dom)
        if isinstance(e, ast.List):
            X = elem_of(want) if want else None
            if not e.elts:
                _err("an empty list [] can't be used", e)
            if len(e.elts) > MAX_LISTLIT:
                _err(f"a written list holds at most {MAX_LISTLIT} things", e)
            first = self.expr(e.elts[0], ctx, X)
            X = X or first.type
            items = [first] + [self.expr(x, ctx, X) for x in e.elts[1:]]
            if X in (GRID,) or elem_of(X):
                _err("lists of lists are not allowed", e)
            return N("ListLit", L(X), items)
        if isinstance(e, ast.ListComp):
            return self.comp(e, ctx, want)
        if isinstance(e, ast.Lambda):
            _err("lambda is only allowed as  by=lambda x: ...  inside best(...)", e)
        if isinstance(e, ast.IfExp):
            _err("write an if statement instead of  a if c else b", e)
        _err(f"{type(e).__name__} is not part of the agent language", e)

    def name(self, e: ast.Name, ctx: Ctx, want) -> Node:
        ln, nm, gt = e.lineno, e.id, self.gt
        v = ctx.lookup(nm)
        if v is not None:
            return Node("Var", v.type, (), nm, ln)
        if nm in gt.colour_names:
            return Node("Lit", COLOUR, (), gt.colour_names.index(nm), ln)
        leaf = {"grid": ("Grid", GRID), "colours": ("Colours", L(COLOUR)), "core": ("Core", REGION),
                "everything": ("Everything", REGION), "every_move": ("EveryMove", L(MOVE))}
        if nm in leaf:
            if nm == "core" and gt.N < 4:
                _err("core needs a grid of size 4 or more", e)
            return Node(leaf[nm][0], leaf[nm][1], (), None, ln)
        if nm == "best_line":
            _err("best_line only works as the area of a mutator, e.g.  paint(best_line, red)", e)
        if nm in self.mids:
            _err(f"{nm} is a mutator: call it, like  {nm}(...)", e)
        if nm in self.defsrc:
            _err(f"{nm} is a function: call it or use it as by={nm}", e)
        from ..core import COLOUR_NAMES
        if any(nm in v for v in COLOUR_NAMES.values()):
            _err(f"{nm} is not a colour in this grid type (colours: {', '.join(gt.colour_names)})", e)
        _err(f"I don't know the name {nm}", e)

    def attr(self, e: ast.Attribute, ctx: Ctx) -> Node:
        ln, a = e.lineno, e.attr
        obj = self.expr(e.value, ctx)
        N = lambda tag, T, kids=(), val=None: Node(tag, T, tuple(kids), val, ln)
        if obj.type == GRID:
            m = {"cells": ("GridCells", L(CELL)), "rows": ("GridRows", L(LINE)), "columns": ("GridColumns", L(LINE)),
                 "lines": ("GridLines", L(LINE)), "size": ("Size", NUM)}
            if a in m:
                return N(m[a][0], m[a][1])
            _err(f"grid has no .{a} (try cells, rows, columns, lines, size)", e)
        if obj.type == CELL:
            if a == "colour" or a == "color":
                return N("Attr", COLOUR, (obj,), "colour")
            if a in num_attrs(self.gt):
                return N("Attr", NUM, (obj,), a)
            if a == "is_face":
                if self.gt.symbols != "cards":
                    _err("is_face only exists on card grids", e)
                return N("Attr", BOOL, (obj,), "is_face")
            if a == "neighbours" or a == "neighbors":
                return N("Neighbours", L(CELL), (obj,))
        if obj.type in (CELL, LINE, REGION):
            r = self.coerce(obj, REGION, e)
            if a == "cells":
                return N("RegionCells", L(CELL), (r,))
            if a in ("top_colour", "top_color"):
                return N("TopColour", COLOUR, (r,))
        _err(f"a {kid_type(obj.type)} has no .{a}", e)

    def comp(self, e: ast.ListComp, ctx: Ctx, want) -> Node:
        if len(e.generators) > 2:
            _err("at most two  for  parts in a list comprehension", e)
        c2, lists, names, conds = ctx, [], [], []
        for g in e.generators:
            if g.is_async or not isinstance(g.target, ast.Name):
                _err("use  for name in list  in a comprehension", e)
            self._fresh(g.target.id, c2, e)
            lst = self.expr(g.iter, c2)
            if elem_of(lst.type) is None or lst.type == L(BOOL):
                _err("you can only loop over a list", e)
            lists.append(lst)
            names.append(g.target.id)
            c2 = c2.bind(Var(g.target.id, elem_of(lst.type)))
            conds.extend(g.ifs)
        cond = None
        for c in conds:
            cn = self.expr(c, c2, BOOL)
            cond = cn if cond is None else Node("And", BOOL, (cond, cn), None, e.lineno)
        X = elem_of(want) if want else None
        el = self.expr(e.elt, c2, X)
        X = X or el.type
        if X == GRID or elem_of(X):
            _err("a comprehension must make a list of simple things", e)
        return Node("Comp", L(X), (el, cond, *lists), tuple(names), e.lineno)

    def func(self, f, X: str, ctx: Ctx) -> Node:
        ln = getattr(f, "lineno", 0)
        if isinstance(f, ast.Name) and f.id == "score":
            if X != MOVE:
                _err("by=score works on a list of moves; for other things use by=lambda x: ...", f)
            return Node("ScoreFn", NUM, (), None, ln)
        if isinstance(f, ast.Name) and f.id in self.defsrc:
            d = self.resolve_def(f.id, (X,), f)
            return Node("DefRef", d.ret, (), d.name, ln)
        if isinstance(f, ast.Lambda):
            a = f.args
            if len(a.args) != 1 or a.vararg or a.kwarg or a.kwonlyargs or a.defaults:
                _err("by=lambda takes exactly one input", f)
            nm = a.args[0].arg
            self._fresh(nm, ctx, f)
            body = self.expr(f.body, ctx.bind(Var(nm, X)))
            if body.type not in (NUM, BOOL):
                _err("by=lambda x: ... must give a number (or yes/no)", f)
            return Node("Lambda", body.type, (body,), nm, ln)
        _err("by= needs score, a def name, or lambda x: ...", f)

    # --- calls -----------------------------------------------------------------------------------
    def call(self, e: ast.Call, ctx: Ctx, want, dom) -> Node:
        ln = e.lineno
        N = lambda tag, T, kids=(), val=None: Node(tag, T, tuple(kids), val, ln)
        f = e.func
        if isinstance(f, ast.Attribute):
            if f.attr != "count":
                _err(f"no method .{f.attr}() (only .count(...))", e)
            obj = self.expr(f.value, ctx)
            if obj.type != GRID:
                obj = self.coerce(obj, REGION, e)
            if len(e.args) != 1 or e.keywords:
                _err(".count takes one thing to count: a colour or a number", e)
            what = self.expr(e.args[0], ctx, None, "val")
            if what.type not in (COLOUR, NUM):
                _err(".count counts a colour or a number", e)
            return N("Count", NUM, (obj, what))
        if not isinstance(f, ast.Name):
            _err("call a function by its name", e)
        nm = f.id
        if ctx.lookup(nm) is not None:
            _err(f"{nm} is a {kid_type(ctx.lookup(nm).type)}, not a function", e)
        args, kws = e.args, {k.arg: k.value for k in e.keywords}
        if any(isinstance(a, ast.Starred) for a in args) or None in kws:
            _err("no * or ** in calls", e)

        def need(k):
            if len(args) != k or kws:
                _err(f"{nm} takes {k} input{'s' if k > 1 else ''}", e)

        if nm in self.mids:
            return self.mutator_call(nm, e, ctx)
        if nm in self.defsrc:
            ag = [self.expr(a, ctx) for a in args]
            if kws:
                _err("call your function with plain inputs", e)
            d = self.resolve_def(nm, tuple(a.type for a in ag), e)
            return N("DefCall", d.ret, ag, nm)
        if nm in ("row", "column"):
            need(1)
            return N(nm.capitalize(), LINE, (self.expr(args[0], ctx, NUM, "idx"),))
        if nm == "cell":
            need(2)
            return N("CellAt", CELL, (self.expr(args[0], ctx, NUM, "idx"), self.expr(args[1], ctx, NUM, "idx")))
        if nm == "block":
            need(3)
            k = args[2]
            if not (isinstance(k, ast.Constant) and k.value in block_sizes(self.gt)):
                _err(f"the size of a block must be written as {' or '.join(map(str, block_sizes(self.gt)))}", e)
            return N("Block", REGION, (self.expr(args[0], ctx, NUM, "idx"), self.expr(args[1], ctx, NUM, "idx")), k.value)
        if nm == "ring":
            need(1)
            return N("Ring", REGION, (self.expr(args[0], ctx, NUM, "ring"),))
        if nm == "diagonal":
            need(1)
            return N("Diag", REGION, (self.expr(args[0], ctx, NUM, "diag"),))
        if nm == "best":
            if len(args) != 1 or set(kws) != {"by"}:
                _err("write  best(things, by=...)", e)
            lst = self.expr(args[0], ctx)
            X = elem_of(lst.type)
            if X not in (NUM, COLOUR, CELL, LINE, MOVE):
                _err(f"best picks from a list of numbers, colours, cells, lines or moves (not a {kid_type(lst.type)})", e)
            return N("Best", X, (lst, self.func(kws["by"], X, ctx)))
        if nm == "score":
            need(1)
            x = self.expr(args[0], ctx)
            if x.type not in (MOVE, GRID):
                _err("score(...) scores a move (what the grid would become) or the grid", e)
            return N("Score", NUM, (x,))
        if nm == "moves":
            need(1)
            if not (isinstance(args[0], ast.Name) and args[0].id in self.mids):
                _err("moves(...) takes a mutator name, like  moves(paint)", e)
            return N("Moves", L(MOVE), (), args[0].id)
        if nm == "len":
            need(1)
            lst = self.expr(args[0], ctx)
            if elem_of(lst.type) is None:
                _err("len(...) counts the things in a list", e)
            return N("Len", NUM, (lst,))
        if nm in ("sum", "min", "max"):
            if kws:
                _err(f"{nm} takes no options here", e)
            if len(args) == 1:
                lst = self.expr(args[0], ctx, L(NUM))
            elif nm != "sum" and 2 <= len(args) <= MAX_LISTLIT:
                lst = Node("ListLit", L(NUM), tuple(self.expr(a, ctx, NUM) for a in args), None, ln)
            else:
                _err(f"{nm}(...) takes a list of numbers", e)
            return N(nm.capitalize(), NUM, (lst,))
        if nm == "abs":
            need(1)
            return N("Abs", NUM, (self.expr(args[0], ctx, NUM),))
        if nm in ("any", "all"):
            need(1)
            return N(nm.capitalize(), BOOL, (self.expr(args[0], ctx, L(BOOL)),))
        if nm == "range":
            if kws or not 1 <= len(args) <= 2:
                _err("range(n) or range(a, b)", e)
            return N("Range", L(NUM), [self.expr(a, ctx, NUM) for a in args])
        if nm in BUILTINS:
            _err(f"{nm} is not a function", e)
        _err(f"I don't know a function called {nm}", e)

    # --- mutator calls ---------------------------------------------------------------------------
    def _literal(self, slot, a_nodes, ctx):
        """The slot's Python value if every argument is written as a literal, else None."""
        gt = self.gt
        base = slot.type[5:] if slot.type.startswith("Pair:") else slot.type
        vals = []
        for a in a_nodes:
            if isinstance(a, _Default):
                vals.append(a.value)
                continue
            v = self._lit_value(base, a, slot)
            if v is _NOLIT:
                return _NOLIT
            vals.append(v)
        if slot.type.startswith("Pair:"):
            return tuple(vals)
        return vals[0]

    def _lit_value(self, base, a, slot):
        gt = self.gt
        intlit = lambda x: (isinstance(x, ast.Constant) and type(x.value) is int) or (
            isinstance(x, ast.UnaryOp) and isinstance(x.op, ast.USub) and isinstance(x.operand, ast.Constant)
            and type(x.operand.value) is int)
        ival = lambda x: x.value if isinstance(x, ast.Constant) else -x.operand.value
        if base in (REGION, LINE, CELL):
            if isinstance(a, ast.Name):
                if a.id == "best_line" and base == REGION:
                    return ("*",)
                if a.id == "everything" and base == REGION:
                    return ("a",)
                if a.id == "core" and base == REGION and gt.N >= 4:
                    return ("o",)
                return _NOLIT
            if isinstance(a, ast.Call) and isinstance(a.func, ast.Name) and not a.keywords \
                    and all(intlit(x) for x in a.args):
                k, xs = a.func.id, [ival(x) for x in a.args]
                if k in ("row", "column") and len(xs) == 1 and base in (REGION, LINE):
                    if not 0 <= xs[0] < gt.N:
                        _err(f"{k} numbers go from 0 to {gt.N - 1}", a)
                    return ("l", 0 if k == "row" else 1, xs[0])
                if k == "cell" and len(xs) == 2 and base in (REGION, CELL):
                    if not all(0 <= x < gt.N for x in xs):
                        _err(f"cell numbers go from 0 to {gt.N - 1}", a)
                    return ("c", xs[0], xs[1])
                if base == REGION and k == "block" and len(xs) == 3:
                    return ("b",) + tuple(xs)
                if base == REGION and k == "ring" and len(xs) == 1:
                    return ("r", xs[0])
                if base == REGION and k == "diagonal" and len(xs) == 1:
                    return ("d", xs[0])
            return _NOLIT
        if base == COLOUR:
            if isinstance(a, ast.Name) and a.id in gt.colour_names and a.id not in ("score",):
                return gt.colour_names.index(a.id)
            return _NOLIT
        if base == NUM:
            return ival(a) if intlit(a) else _NOLIT
        # Choice: any Python literal (string, number, tuple)
        try:
            return ast.literal_eval(a)
        except Exception:
            _err(f"{slot.name} must be written out, like  {slot.name}=...", a)

    def mutator_call(self, mid: str, e: ast.Call, ctx: Ctx) -> Node:
        gt, ln = self.gt, e.lineno
        slots = slots_of(mid)
        order = kid_order(mid)
        by_name = {s.name: s for s in slots}
        fields_to_slot = {f.name: s.name for s in slots for f in s.fields}
        given: dict[str, list] = {}
        pos = list(e.args)
        for sname in order:
            if not pos:
                break
            s = by_name[sname]
            take, pos = pos[:s.arity], pos[s.arity:]
            if len(take) < s.arity:
                _err(f"{mid}: {sname} needs {s.arity} things", e)
            given[sname] = take
        if pos:
            _err(f"{mid} got too many inputs (it takes {', '.join(order)})", e)
        for k in e.keywords:
            sname = k.arg if k.arg in by_name else fields_to_slot.get(k.arg)
            if sname is None:
                _err(f"{mid} has no option called {k.arg} (it takes {', '.join(order)})", e)
            if sname in given:
                _err(f"{mid}: {sname} given twice", e)
            s = by_name[sname]
            if s.arity == 2:
                if not isinstance(k.value, (ast.Tuple, ast.List)) or len(k.value.elts) != 2:
                    _err(f"{mid}: {sname} needs two things, like {sname}=(a, b)", e)
                given[sname] = list(k.value.elts)
            else:
                given[sname] = [k.value]
        defaults = DEFAULTS.get(mid, {})
        # resolve each slot: literal value, computed expression(s), or absent
        p_lit: dict = {}
        svals, kids, all_lit = [], [], True
        for s in slots:
            try:
                ch0 = field_choices(s.fields[0], gt, p_lit)
                dep = False
            except _Missing:
                ch0, dep = None, True
            if not dep and ch0 is None:
                if s.name in given:
                    _err(f"{mid}: {s.name} is not used with these other choices", e)
                svals.append(("absent",))
                continue
            args = given.get(s.name)
            if args is None:
                if s.name in defaults:
                    args = [_Default(defaults[s.name])] * s.arity if s.arity == 1 else None
                if args is None:
                    _err(f"{mid} needs {s.name} (it takes {', '.join(order)})", e)
            lit = self._literal(s, args, ctx)
            if lit is not _NOLIT and not dep:
                try:
                    vals = slot_params(s, lit, gt, p_lit)
                except (ValueError, KeyError, IndexError) as ex:
                    _err(f"{mid}: {s.name} can't be {ast.unparse(args[0]) if not isinstance(args[0], _Default) else args[0].value}"
                         f" ({ex})", e)
                for f in s.fields:
                    try:
                        ch = field_choices(f, gt, p_lit)
                    except _Missing:
                        ch = None
                    if ch is None and f.name not in vals:
                        continue
                    if f.name not in vals or vals[f.name] not in (ch or []):
                        _err(f"{mid}: {s.name} can't be {self._show(args)} here", e)
                    p_lit[f.name] = vals[f.name]
                svals.append(("lit", {f.name: vals[f.name] for f in s.fields if f.name in vals}))
                continue
            if not s.computable:
                _err(f"{mid}: {s.name} must be written out (it can't be worked out while running)", e)
            all_lit = False
            base = s.type[5:] if s.type.startswith("Pair:") else s.type
            for a in args:
                if isinstance(a, _Default):
                    kids.append(Node("Lit", NUM, (), (a.value, s.dom), ln))
                else:
                    kids.append(self.expr(a, ctx, base, s.dom))
            svals.append(("expr", s.arity))
        if all_lit:
            try:
                check_params(mid, p_lit, gt)
            except ValueError as ex:
                _err(f"{mid}: {ex}", e)
            return Node("ConstCall", MOVE, (), (mid, dict(p_lit)), ln)
        return Node("DynCall", MOVE, tuple(kids), (mid, tuple(svals)), ln)

    @staticmethod
    def _show(args):
        return ", ".join(str(a.value) if isinstance(a, _Default) else ast.unparse(a) for a in args)


class _Default:
    def __init__(self, value):
        self.value = value


_NOLIT = object()


def elaborate(src: str, gtype: GridType) -> Node:
    return Elaborator(gtype).program(src)


# ================================================================================================
# unparse: IR -> kid-style Python source
# ================================================================================================
COMPOUND = {"BinOp", "Compare", "And", "Or", "Not", "Neg"}


def unparse(prog: Node, gt: GridType) -> str:
    out: list[str] = []
    for d in prog.kids[0]:
        name, pnames, _, _ = d.val
        out.append(f"def {name}({', '.join(pnames)}):")
        _block(d.kids[0], 1, out, gt)
        out.append("")
    _block(prog.kids[1], 0, out, gt)
    if not prog.kids[1]:
        out.append("pass")
    return "\n".join(out).rstrip() + "\n"


def _block(stmts, depth, out, gt, allow_empty=False):
    pad = "    " * depth
    if not stmts:
        if depth:
            out.append(pad + "pass")
        return
    for s in stmts:
        _stmt(s, depth, out, gt)


def _stmt(s: Node, depth, out, gt):
    pad = "    " * depth
    t = s.tag
    if t == "Assign":
        out.append(f"{pad}{s.val[0]} = {ux(s.kids[0], gt)}")
    elif t == "Act":
        out.append(pad + ux(s.kids[0], gt))
    elif t == "Return":
        out.append(pad + ("return" if not s.kids else f"return {ux(s.kids[0], gt)}"))
    elif t == "For":
        out.append(f"{pad}for {s.val} in {ux(s.kids[0], gt)}:")
        _block(s.kids[1], depth + 1, out, gt)
    elif t == "If":
        kw = "if"
        while True:
            c, then, els = s.kids
            out.append(f"{pad}{kw} {ux(c, gt)}:")
            _block(then, depth + 1, out, gt)
            if els is not None and len(els) == 1 and els[0].tag == "If":
                s, kw = els[0], "elif"
                continue
            if els is not None:
                out.append(f"{pad}else:")
                _block(els, depth + 1, out, gt)
            break
    else:
        raise ValueError(t)


def _p(n: Node, gt) -> str:
    s = ux(n, gt)
    return f"({s})" if n.tag in COMPOUND else s


def region_text(v, gt) -> str:
    t = v[0]
    if t == "c":
        return f"cell({v[1]}, {v[2]})"
    if t == "l":
        return f"{'row' if v[1] == 0 else 'column'}({v[2]})"
    if t == "b":
        return f"block({v[1]}, {v[2]}, {v[3]})"
    if t == "r":
        return f"ring({v[1]})"
    if t == "d":
        return f"diagonal({v[1]})"
    return {"o": "core", "a": "everything", "*": "best_line"}[t]


def _slot_text(s, vals: dict, gt) -> list[str]:
    """Kid-syntax argument(s) for a literal slot."""
    cn = gt.colour_names
    if s.name == "where":
        kind = vals["kind"]
        rv = vals.get("region", vals.get("line", ()))
        return [region_text(region_value(kind, rv), gt)]
    if s.type == LINE:
        a, i = vals[s.fields[0].name]
        return [region_text(("l", a, i), gt)]
    if s.type == COLOUR:
        return [cn[vals[s.fields[0].name]]]
    if s.type == "Pair:" + CELL:
        (r1, c1), (r2, c2) = vals["pair"]
        return [f"cell({r1}, {c1})", f"cell({r2}, {c2})"]
    if s.type == "Pair:" + LINE:
        w = "row" if vals["axis"] == 0 else "column"
        i, j = vals["pair"]
        return [f"{w}({i})", f"{w}({j})"]
    if s.type == "Pair:" + COLOUR:
        a, b = vals[s.fields[0].name]
        return [cn[a], cn[b]]
    if s.type.startswith("Pair:"):
        a, b = vals[s.fields[0].name]
        return [str(a), str(b)]
    return [repr(vals[s.fields[0].name])]


def _call_text(mid, slot_texts: dict, gt) -> str:
    """slot_texts: slot name -> list of argument strings (absent slots missing)."""
    order = kid_order(mid)
    pos, kw, positional = [], [], True
    slots = {s.name: s for s in slots_of(mid)}
    for sname in order:
        if sname not in slot_texts:
            positional = False
            continue
        s = slots[sname]
        if positional and s.type != "Choice":
            pos += slot_texts[sname]
        else:
            positional = False
            v = slot_texts[sname]
            kw.append(f"{sname}=({v[0]}, {v[1]})" if s.arity == 2 else f"{sname}={v[0]}")
    return f"{mid}({', '.join(pos + kw)})"


def ux(n: Node, gt) -> str:
    t, k = n.tag, n.kids
    cn = gt.colour_names
    simple = {"Grid": "grid", "Size": "grid.size", "Core": "core", "Everything": "everything",
              "EveryMove": "every_move", "GridCells": "grid.cells", "GridRows": "grid.rows",
              "GridColumns": "grid.columns", "GridLines": "grid.lines", "Colours": "colours", "ScoreFn": "score"}
    if t in simple:
        return simple[t]
    if t in ("Var", "DefRef"):
        return n.val
    if t == "Lit":
        if n.type == COLOUR:
            return cn[n.val]
        if n.type == BOOL:
            return str(n.val)
        return str(n.val[0])
    if t == "Attr":
        return f"{ux(k[0], gt)}.{n.val}"
    if t == "Count":
        return f"{ux(k[0], gt)}.count({ux(k[1], gt)})"
    if t in ("Len", "Sum", "Min", "Max", "Abs", "Any", "All"):
        return f"{t.lower()}({ux(k[0], gt)})"
    if t == "Neg":
        return f"-{_p(k[0], gt)}"
    if t == "BinOp":
        return f"{_p(k[0], gt)} {n.val} {_p(k[1], gt)}"
    if t == "Compare":
        return f"{_p(k[0], gt)} {n.val} {_p(k[1], gt)}"
    if t in ("And", "Or"):
        return f"{_p(k[0], gt)} {t.lower()} {_p(k[1], gt)}"
    if t == "Not":
        return f"not {_p(k[0], gt)}"
    if t == "Score":
        return f"score({ux(k[0], gt)})"
    if t == "DefCall":
        return f"{n.val}({', '.join(ux(x, gt) for x in k)})"
    if t == "Best":
        return f"best({ux(k[0], gt)}, by={ux(k[1], gt)})"
    if t == "Lambda":
        return f"lambda {n.val}: {ux(k[0], gt)}"
    if t == "TopColour":
        return f"{ux(k[0], gt)}.top_colour"
    if t == "CellAt":
        return f"cell({ux(k[0], gt)}, {ux(k[1], gt)})"
    if t in ("Row", "Column"):
        return f"{t.lower()}({ux(k[0], gt)})"
    if t in ("AsCell", "AsLine"):
        return ux(k[0], gt)
    if t == "Block":
        return f"block({ux(k[0], gt)}, {ux(k[1], gt)}, {n.val})"
    if t == "Ring":
        return f"ring({ux(k[0], gt)})"
    if t == "Diag":
        return f"diagonal({ux(k[0], gt)})"
    if t == "RegionCells":
        return f"{ux(k[0], gt)}.cells"
    if t == "Neighbours":
        return f"{ux(k[0], gt)}.neighbours"
    if t == "Moves":
        return f"moves({n.val})"
    if t == "Range":
        return f"range({', '.join(ux(x, gt) for x in k)})"
    if t == "ListLit":
        return f"[{', '.join(ux(x, gt) for x in k)}]"
    if t == "Comp":
        el, cond, *lists = k
        gens = " ".join(f"for {nm} in {ux(l, gt)}" for nm, l in zip(n.val, lists))
        return f"[{ux(el, gt)} {gens}{'' if cond is None else ' if ' + ux(cond, gt)}]"
    if t == "ConstCall":
        mid, p = n.val
        texts = {}
        for s in slots_of(mid):
            vals = {f.name: p[f.name] for f in s.fields if f.name in p}
            if vals:
                texts[s.name] = _slot_text(s, vals, gt)
        return _call_text(mid, texts, gt)
    if t == "DynCall":
        mid, svals = n.val
        texts, ki = {}, 0
        for s, sv in zip(slots_of(mid), svals):
            if sv[0] == "lit":
                texts[s.name] = _slot_text(s, sv[1], gt)
            elif sv[0] == "expr":
                texts[s.name] = [ux(x, gt) for x in k[ki:ki + sv[1]]]
                ki += sv[1]
        return _call_text(mid, texts, gt)
    raise ValueError(t)
