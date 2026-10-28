"""Interpreter for agent programs on Grid/GridType, with a step budget and decision bookkeeping.

Running a program on a grid gives the final grid and the *action*: the sequence of moves it emitted
(each = mutator id + parameters, with relative `best_line` targets resolved). Mutators are the only way
the grid changes; moves are applied in order to a working copy.

CPU is not priced in bits. It is a hard budget per interaction (default 500,000 steps ≈ 5 ms at
10 ns/step): every IR node evaluated costs 1 step, every move applied or scored costs N² steps.
A program that runs out of steps, or hits a run-time error (best of an empty list, cell(9, 9) on a
5×5 grid, ...) does nothing on that grid.

Decision bookkeeping ("path bits"). Every value carries a *taint* flag: True if it is not yet
determined by the program text plus the choices recorded so far. Choice points in the main program
turn tainted information into recorded bits, and their results become untainted:
  * `if` on a tainted condition                          1 bit
  * `best(L, by=f)` over an untainted list, tainted keys   log2 len(L)
  * a computed mutator argument that is tainted             log2 #choices of that field
  * `for` over a tainted list                              log2 (max length + 1)
  * acting on a tainted move                               log2 #all moves
  * a `best_line` target                                   log2 2N (the line it picks)
Inside defs, lambdas and comprehensions nothing is recorded; results are tainted if they depend on
the grid (including through `if`). By induction, the recorded choices determine the action, so the
path bits of a run are the length of a prefix code for its action and E[path bits] ≥ H(action).
"""
from __future__ import annotations

import math
from functools import lru_cache
from typing import Optional

import numpy as np

from ..core import Grid, GridType
from ..mutators import COST_KNOBS, available, by_id, region_choices, region_mask
from .lang import (BOOL, CELL, COLOUR, LINE, MOVE, NUM, REGION, Node, check_params, field_choices, slot_params,
                   slots_of, _Missing)

log2 = math.log2
STEP_LIMIT = 500_000
RANGE_MAX = 64


class Abort(Exception):
    pass


class _Stop(Exception):
    pass


class _Ret(Exception):
    def __init__(self, v, t):
        self.v, self.t = v, t


class TList(list):
    """A list value with an upper bound on its length over all grids (for loop/choice bookkeeping)."""
    __slots__ = ("cap",)

    def __init__(self, it=(), cap=None):
        super().__init__(it)
        self.cap = len(self) if cap is None else cap


class Move:
    __slots__ = ("mid", "params", "key")

    def __init__(self, mid: str, params: dict):
        self.mid, self.params = mid, params
        self.key = (mid, tuple(sorted(params.items())))

    def __eq__(self, o):
        return isinstance(o, Move) and o.key == self.key

    def __hash__(self):
        return hash(self.key)

    def __repr__(self):
        return f"Move{self.key}"


# ------------------------------------------------------------------------------------------------
# static tables per GridType
# ------------------------------------------------------------------------------------------------
@lru_cache(maxsize=None)
def cells_of(N: int) -> tuple:
    return tuple(("c", r, c) for r in range(N) for c in range(N))


@lru_cache(maxsize=None)
def lines_of(N: int) -> tuple:
    return tuple(("l", 0, i) for i in range(N)) + tuple(("l", 1, i) for i in range(N))


@lru_cache(maxsize=None)
def neighbours_of(N: int, r: int, c: int) -> tuple:
    out = []
    for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        rr, cc = r + dr, c + dc
        if 0 <= rr < N and 0 <= cc < N:
            out.append(("c", rr, cc))
    return tuple(out)


_MOVES: dict = {}


def all_moves(gt: GridType, mid: str) -> tuple:
    from ..mutators import _disabled
    k = (gt, mid)
    if k not in _MOVES:
        _MOVES[k] = tuple(Move(mid, dict(p)) for p in by_id(mid).space(gt))
    return _MOVES[k]


def every_move(gt: GridType) -> tuple:
    from .lang import mutator_ids
    k = (gt, "*", mutator_ids(gt))
    if k not in _MOVES:
        _MOVES[k] = tuple(m for mid in mutator_ids(gt) for m in all_moves(gt, mid))
    return _MOVES[k]


def n_all_moves(gt: GridType) -> int:
    return len(every_move(gt))


def region_kind_val(v) -> tuple:
    t = v[0]
    if t == "c":
        return "cell", (v[1], v[2])
    if t == "l":
        return "line", (v[1], v[2])
    if t == "b":
        return "block", (v[1], v[2], v[3])
    if t == "r":
        return "ring", v[1]
    if t == "d":
        return "diag", v[1]
    if t == "o":
        return "core", ()
    return "all", ()


@lru_cache(maxsize=None)
def mask_of(v, N: int) -> np.ndarray:
    kind, val = region_kind_val(v)
    return region_mask(kind, val, N)


@lru_cache(maxsize=None)
def region_cells(v, N: int) -> tuple:
    if v[0] == "c":
        return (v,)
    m = mask_of(v, N)
    return tuple(("c", int(r), int(c)) for r, c in zip(*np.nonzero(m)))


# ------------------------------------------------------------------------------------------------
# owner's utility (score)
# ------------------------------------------------------------------------------------------------
class Owner:
    """The summoning god's utility function as the agent may see it: score(grid) = surprisal in bits."""

    def __init__(self, draw, table):
        self.draw, self.table = draw, table

    def score(self, g: Grid, gt: GridType) -> float:
        return float(self.table.surprisal(self.draw.ordinal(g, gt)))

    def score_batch(self, sym: np.ndarray, col: np.ndarray, gt: GridType) -> np.ndarray:
        o = self.draw.family.evaluate_batch(sym, col, self.draw.params, gt)
        return np.asarray(self.table.surprisal(o), float)


# ------------------------------------------------------------------------------------------------
# run
# ------------------------------------------------------------------------------------------------
class Frame:
    __slots__ = ("vars", "fn", "pc")

    def __init__(self, vars=None, fn=False, pc=False):
        self.vars = {} if vars is None else vars
        self.fn, self.pc = fn, pc


class Result:
    __slots__ = ("grid", "actions", "path_bits", "erase", "dcol", "dsym", "aborted", "steps", "reason", "choices")

    def __repr__(self):
        return (f"Result(actions={len(self.actions)}, path={self.path_bits:.2f}, erase={self.erase:.2f}, "
                f"aborted={self.aborted}, steps={self.steps})")


class Run:
    def __init__(self, prog: Node, gt: GridType, g: Grid, owner: Optional[Owner] = None, limit: int = STEP_LIMIT,
                 record: bool = True):
        self.prog, self.gt, self.g, self.g0, self.owner = prog, gt, g, g, owner
        self.limit, self.record = limit, record
        self.steps = 0
        self.path = 0.0
        self.actions: list = []
        self.erase = self.dcol = self.dsym = 0.0
        self.N2 = gt.N ** 2
        self.defs = {d.val[0]: d for d in prog.kids[0]}
        self._res: dict = {}
        self.choices: list = []     # (site, outcome, #branches) for each recorded choice (record mode)
        self.loops: list = []       # iteration counters of the enclosing main-program loops

    def choice(self, node, sub, outcome, branches: int):
        """Record one choice point of the main program (see module docstring)."""
        if branches > 1:
            self.path += log2(branches)
        if self.record:
            self.choices.append(((id(node), sub, tuple(self.loops)), outcome, branches))

    # --- helpers ---------------------------------------------------------------------------------
    def tick(self, k: int = 1):
        self.steps += k
        if self.steps > self.limit:
            raise Abort("ran out of steps")

    def result_of(self, m: Move) -> Grid:
        """The working grid after m (memoised per working grid)."""
        k = (self.g.key, m.key)
        y = self._res.get(k)
        if y is None:
            self.tick(self.N2)
            y = by_id(m.mid).apply(self.g, m.params, self.gt)
            y = self.g if y is None else y
            if len(self._res) > 50000:
                self._res.clear()
            self._res[k] = y
        return y

    def score_grid(self, g: Grid) -> float:
        if self.owner is None:
            raise Abort("this agent has no owner to ask for a score")
        self.tick(self.N2)
        return self.owner.score(g, self.gt)

    # --- entry -----------------------------------------------------------------------------------
    def run(self) -> Result:
        r = Result()
        r.aborted, r.reason = False, ""
        try:
            self.block(self.prog.kids[1], Frame())
        except _Stop:
            pass
        except Abort as e:
            r.aborted, r.reason = True, str(e)
        except (ZeroDivisionError, OverflowError) as e:
            r.aborted, r.reason = True, f"maths error: {e}"
        if r.aborted:
            r.grid, r.actions, r.erase, r.dcol, r.dsym = self.g0, (), 0.0, 0.0, 0.0
        else:
            r.grid, r.actions, r.erase, r.dcol, r.dsym = self.g, tuple(self.actions), self.erase, self.dcol, self.dsym
        r.path_bits, r.steps, r.choices = self.path, self.steps, self.choices
        return r

    # --- statements ------------------------------------------------------------------------------
    def block(self, stmts, fr: Frame):
        for s in stmts:
            self.tick()
            getattr(self, "s_" + s.tag)(s, fr)

    def s_Assign(self, s, fr):
        v, t = self.ev(s.kids[0], fr)
        fr.vars[s.val[0]] = (v, t or fr.pc)

    def s_Act(self, s, fr):
        m, t = self.ev(s.kids[0], fr)
        if t:
            self.choice(s, "move", m.key, n_all_moves(self.gt))
        self.act(m, s)

    def act(self, m: Move, site=None):
        gt = self.gt
        mu = by_id(m.mid)
        star = m.params.get("kind") == "line*"
        y = self.result_of(m)
        key = m.key
        if star:
            res = self._resolve_star(m, y) if self.record else None
            self.choice(site, "star", res, 2 * gt.N)
            if self.record:
                key = key + (res,)
        self.actions.append(key)
        K = COST_KNOBS
        tm = mu.terms_fn(m.params, gt)
        mult = K["scope"][tm.scope] * K["kind"]["bijective" if mu.bijective else "overwrite"]
        self.erase += K["erase"] * float(tm.erase) * mult
        self.dcol += tm.dcol
        self.dsym += tm.dsym
        self.g = y

    def _resolve_star(self, m: Move, y: Grid):
        if y == self.g:
            return "noop"
        N = self.gt.N
        for idx in range(2 * N):
            p = dict(m.params, kind="line", region=(0, idx) if idx < N else (1, idx - N))
            yy = by_id(m.mid).apply(self.g, p, self.gt)
            if yy is not None and yy == y:
                return idx
        return "?"

    def s_If(self, s, fr):
        c, t = self.ev(s.kids[0], fr)
        branch = s.kids[1] if c else s.kids[2]
        if t and not fr.fn:
            self.choice(s, 0, bool(c), 2)
            t = False
        if branch is None:
            return
        if t and not fr.pc:
            fr.pc = True
            try:
                self.block(branch, fr)
            finally:
                fr.pc = False
        else:
            self.block(branch, fr)

    def s_For(self, s, fr):
        lst, t = self.ev(s.kids[0], fr)
        name = s.val
        old_pc = fr.pc
        if t and not fr.fn:
            self.choice(s, 0, len(lst), lst.cap + 1)   # records how many times the loop runs (not which items)
        elif t:
            fr.pc = True
        main = not fr.fn
        if main:
            self.loops.append(0)
        try:
            for i, x in enumerate(lst):
                self.tick()
                if main:
                    self.loops[-1] = i
                fr.vars[name] = (x, t)            # the items themselves stay tainted
                self.block(s.kids[1], fr)
        finally:
            fr.pc = old_pc
            fr.vars.pop(name, None)
            if main:
                self.loops.pop()

    def s_Return(self, s, fr):
        if not s.kids:
            raise _Stop()
        v, t = self.ev(s.kids[0], fr)
        raise _Ret(v, t or fr.pc)

    # --- expressions -----------------------------------------------------------------------------
    def ev(self, n: Node, fr: Frame):
        self.tick()
        return getattr(self, "e_" + n.tag)(n, fr)

    def e_Var(self, n, fr):
        try:
            return fr.vars[n.val]
        except KeyError:
            raise Abort(f"{n.val} has no value yet")

    def e_Lit(self, n, fr):
        return (n.val[0] if n.type == NUM else n.val), False

    def e_Grid(self, n, fr):
        return None, False

    def e_Size(self, n, fr):
        return self.gt.N, False

    def e_Core(self, n, fr):
        return ("o",), False

    def e_Everything(self, n, fr):
        return ("a",), False

    def e_GridCells(self, n, fr):
        return TList(cells_of(self.gt.N)), False

    def e_GridRows(self, n, fr):
        return TList(lines_of(self.gt.N)[:self.gt.N]), False

    def e_GridColumns(self, n, fr):
        return TList(lines_of(self.gt.N)[self.gt.N:]), False

    def e_GridLines(self, n, fr):
        return TList(lines_of(self.gt.N)), False

    def e_Colours(self, n, fr):
        return TList(range(self.gt.C)), False

    def e_Moves(self, n, fr):
        return TList(all_moves(self.gt, n.val)), False

    def e_EveryMove(self, n, fr):
        return TList(every_move(self.gt)), False

    def e_Attr(self, n, fr):
        (c, ct) = self.ev(n.kids[0], fr)
        a = n.val
        _, r, k = c
        if a == "row":
            return r, ct
        if a == "column":
            return k, ct
        g, gt = self.g, self.gt
        if a == "colour":
            return int(g.col[r, k]), True
        s = int(g.sym[r, k])
        if a == "symbol":
            return s, True
        if a == "value":
            return int(gt.value[s]), True
        if a == "rank":
            return int(gt.rank[s]), True
        if a == "suit":
            return int(gt.suit[s]), True
        if a == "is_face":
            return bool(gt.face[s]), True
        raise Abort(f"no attribute {a}")

    def e_Count(self, n, fr):
        obj, _ = self.ev(n.kids[0], fr)
        what, _ = self.ev(n.kids[1], fr)
        g, gt = self.g, self.gt
        self.tick(self.gt.N)
        if obj is None:
            sel_col, sel_sym = g.col, g.sym
        elif obj[0] == "c":
            sel_col, sel_sym = g.col[obj[1]:obj[1] + 1, obj[2]:obj[2] + 1], g.sym[obj[1]:obj[1] + 1, obj[2]:obj[2] + 1]
        else:
            m = mask_of(obj, gt.N)
            sel_col, sel_sym = g.col[m], g.sym[m]
        if n.kids[1].type == COLOUR:
            return int((sel_col == what).sum()), True
        return int((gt.value[sel_sym.astype(np.int64)] == what).sum()), True

    def e_TopColour(self, n, fr):
        obj, _ = self.ev(n.kids[0], fr)
        m = mask_of(obj, self.gt.N) if obj[0] != "c" else None
        col = self.g.col[m] if m is not None else self.g.col[obj[1], obj[2]:obj[2] + 1]
        return int(np.bincount(col, minlength=self.gt.C).argmax()), True

    def e_Len(self, n, fr):
        lst, t = self.ev(n.kids[0], fr)
        return len(lst), t

    def _nums(self, n, fr):
        lst, t = self.ev(n.kids[0], fr)
        return lst, t

    def e_Sum(self, n, fr):
        lst, t = self._nums(n, fr)
        return sum(lst), t

    def e_Min(self, n, fr):
        lst, t = self._nums(n, fr)
        if not lst:
            raise Abort("min of an empty list")
        return min(lst), t

    def e_Max(self, n, fr):
        lst, t = self._nums(n, fr)
        if not lst:
            raise Abort("max of an empty list")
        return max(lst), t

    def e_Abs(self, n, fr):
        v, t = self.ev(n.kids[0], fr)
        return abs(v), t

    def e_Neg(self, n, fr):
        v, t = self.ev(n.kids[0], fr)
        return -v, t

    def e_BinOp(self, n, fr):
        a, ta = self.ev(n.kids[0], fr)
        b, tb = self.ev(n.kids[1], fr)
        op = n.val
        if op == "+":
            v = a + b
        elif op == "-":
            v = a - b
        elif op == "*":
            v = a * b
        elif op == "//":
            v = a // b
        else:
            v = a % b
        if isinstance(v, float) and not math.isfinite(v):
            raise Abort("maths overflow")
        return v, ta or tb

    def e_Compare(self, n, fr):
        a, ta = self.ev(n.kids[0], fr)
        b, tb = self.ev(n.kids[1], fr)
        op = n.val
        v = {"==": a == b, "!=": a != b, "<": a < b, "<=": a <= b, ">": a > b, ">=": a >= b}[op]
        return bool(v), ta or tb

    def e_And(self, n, fr):
        a, ta = self.ev(n.kids[0], fr)
        if not a:
            return False, ta
        b, tb = self.ev(n.kids[1], fr)
        return bool(b), ta or tb

    def e_Or(self, n, fr):
        a, ta = self.ev(n.kids[0], fr)
        if a:
            return True, ta
        b, tb = self.ev(n.kids[1], fr)
        return bool(b), ta or tb

    def e_Not(self, n, fr):
        a, t = self.ev(n.kids[0], fr)
        return not a, t

    def e_Any(self, n, fr):
        lst, t = self.ev(n.kids[0], fr)
        return any(lst), t

    def e_All(self, n, fr):
        lst, t = self.ev(n.kids[0], fr)
        return all(lst), t

    def e_Score(self, n, fr):
        x, _ = self.ev(n.kids[0], fr)
        if n.kids[0].type == MOVE:
            return self.score_grid(self.result_of(x)), True
        return self.score_grid(self.g), True

    def e_CellAt(self, n, fr):
        r, tr = self.ev(n.kids[0], fr)
        c, tc = self.ev(n.kids[1], fr)
        N = self.gt.N
        if not (0 <= r < N and 0 <= c < N):
            raise Abort(f"cell({r}, {c}) is off the grid")
        return ("c", int(r), int(c)), tr or tc

    def e_Row(self, n, fr):
        i, t = self.ev(n.kids[0], fr)
        if not 0 <= i < self.gt.N:
            raise Abort(f"row({i}) is off the grid")
        return ("l", 0, int(i)), t

    def e_Column(self, n, fr):
        i, t = self.ev(n.kids[0], fr)
        if not 0 <= i < self.gt.N:
            raise Abort(f"column({i}) is off the grid")
        return ("l", 1, int(i)), t

    def e_AsCell(self, n, fr):
        return self.ev(n.kids[0], fr)

    e_AsLine = e_AsCell

    def e_Block(self, n, fr):
        r, tr = self.ev(n.kids[0], fr)
        c, tc = self.ev(n.kids[1], fr)
        v = (int(r), int(c), n.val)
        if v not in region_choices("block", self.gt.N):
            raise Abort(f"block{v} is off the grid")
        return ("b",) + v, tr or tc

    def e_Ring(self, n, fr):
        d, t = self.ev(n.kids[0], fr)
        if not 0 <= d < (self.gt.N + 1) // 2:
            raise Abort(f"ring({d}) does not exist")
        return ("r", int(d)), t

    def e_Diag(self, n, fr):
        d, t = self.ev(n.kids[0], fr)
        if d not in (0, 1):
            raise Abort("diagonal(0) or diagonal(1)")
        return ("d", int(d)), t

    def e_RegionCells(self, n, fr):
        v, t = self.ev(n.kids[0], fr)
        cs = region_cells(v, self.gt.N)
        return TList(cs, self.N2 if t else len(cs)), t

    def e_Neighbours(self, n, fr):
        v, t = self.ev(n.kids[0], fr)
        cs = neighbours_of(self.gt.N, v[1], v[2])
        return TList(cs, 4 if t else len(cs)), t

    def e_Range(self, n, fr):
        vals = [self.ev(k, fr) for k in n.kids]
        t = any(x[1] for x in vals)
        a, b = (0, vals[0][0]) if len(vals) == 1 else (vals[0][0], vals[1][0])
        if not (isinstance(a, int) and isinstance(b, int)):
            raise Abort("range needs whole numbers")
        if b - a > RANGE_MAX:
            raise Abort(f"range is limited to {RANGE_MAX} numbers")
        lst = TList(range(a, b), RANGE_MAX if t else None)
        return lst, t

    def e_ListLit(self, n, fr):
        vals = [self.ev(k, fr) for k in n.kids]
        return TList([v for v, _ in vals]), any(t for _, t in vals)

    def e_Comp(self, n, fr):
        el, cond, *lists = n.kids
        names = n.val
        inner = Frame(dict(fr.vars), True, fr.pc)
        out, taint = [], False

        def rec(i, t_src):
            nonlocal taint
            if i == len(lists):
                if cond is not None:
                    c, tc = self.ev(cond, inner)
                    if tc:
                        taint = True
                    if not c:
                        return
                v, tv = self.ev(el, inner)
                taint = taint or tv or t_src
                out.append(v)
                return
            lst, tl = self.ev(lists[i], inner)
            for x in lst:
                self.tick()
                inner.vars[names[i]] = (x, tl or t_src)
                rec(i + 1, t_src or tl)

        rec(0, fr.pc)
        # capacity: product of the source lists' capacities (computed from the first evaluation)
        cap = len(out) if not taint else max(len(out), self._comp_cap(n, fr))
        return TList(out, cap), taint or fr.pc

    def _comp_cap(self, n, fr) -> int:
        cap = 1
        for l in n.kids[2:]:
            cap *= _static_cap(l, self.gt)
        return cap

    def e_Best(self, n, fr):
        lst, tl = self.ev(n.kids[0], fr)
        if not lst:
            raise Abort("best(...) of an empty list")
        f = n.kids[1]
        if f.tag == "ScoreFn":
            keys = self.score_moves(lst)
            tk = True
        else:
            keys, tk = self.keys(f, lst, fr)
        # first maximum wins ties
        bi, bk = 0, keys[0]
        for i in range(1, len(keys)):
            if keys[i] > bk:
                bi, bk = i, keys[i]
        if fr.fn:
            return lst[bi], tl or tk or fr.pc
        if not tl and tk:
            self.choice(n, 0, bi, len(lst))
            return lst[bi], False
        return lst[bi], tl

    def keys(self, f: Node, lst, fr):
        if f.tag == "Lambda":
            inner = Frame(dict(fr.vars), True, fr.pc)
            out, taint = [], False
            for x in lst:
                inner.vars[f.val] = (x, False)
                v, t = self.ev(f.kids[0], inner)
                out.append(v)
                taint = taint or t
            return out, taint
        d = self.defs[f.val]
        out, taint = [], False
        for x in lst:
            v, t = self.call_def(d, [(x, False)])
            out.append(v)
            taint = taint or t
        return out, taint

    def score_moves(self, lst) -> list:
        if self.owner is None:
            raise Abort("this agent has no owner to ask for a score")
        gt = self.gt
        res = [self.result_of(m) for m in lst]
        self.tick(self.N2 * len(lst))
        sym = np.stack([g.sym for g in res])
        col = np.stack([g.col for g in res])
        return list(self.owner.score_batch(sym, col, gt))

    def call_def(self, d: Node, args):
        name, pnames, ptypes, ret = d.val
        fr = Frame({p: a for p, a in zip(pnames, args)}, True, False)
        try:
            self.block(d.kids[0], fr)
        except _Ret as r:
            return r.v, r.t
        return (0 if ret == NUM else False), fr.pc

    def e_DefCall(self, n, fr):
        args = [self.ev(k, fr) for k in n.kids]
        v, t = self.call_def(self.defs[n.val], args)
        return v, t or fr.pc

    def e_ConstCall(self, n, fr):
        m = getattr(n, "_move", None)
        if m is None:
            m = Move(n.val[0], dict(n.val[1]))
            n._move = m
        return m, False

    def e_DynCall(self, n, fr):
        mid, svals = n.val
        gt = self.gt
        p: dict = {}
        ki, taint = 0, False
        for s, sv in zip(slots_of(mid), svals):
            if sv[0] == "absent":
                continue
            if sv[0] == "lit":
                p.update(sv[1])
                continue
            vals = [self.ev(k, fr) for k in n.kids[ki:ki + sv[1]]]
            ki += sv[1]
            v = tuple(x for x, _ in vals) if sv[1] == 2 else vals[0][0]
            t = any(x[1] for x in vals)
            try:
                fv = slot_params(s, v, gt, p)
            except (ValueError, KeyError, IndexError, TypeError, _Missing) as e:
                raise Abort(f"{mid}: bad {s.name} ({e})")
            if t:
                if fr.fn:
                    taint = True
                else:
                    q = dict(p)
                    for f in s.fields:
                        try:
                            ch = f.choices(gt, q)
                        except Exception:
                            ch = None
                        if ch is None or f.name not in fv:
                            continue
                        self.choice(n, f.name, fv[f.name], len(ch))
                        q[f.name] = fv[f.name]
            p.update(fv)
        try:
            check_params(mid, p, gt)
        except (ValueError, KeyError, TypeError) as e:
            raise Abort(f"{mid}: {e}")
        return Move(mid, p), taint or fr.pc


def _static_cap(l: Node, gt: GridType) -> int:
    """Upper bound on a list expression's length over all grids."""
    N, t = gt.N, l.tag
    if t == "GridCells":
        return N * N
    if t in ("GridRows", "GridColumns"):
        return N
    if t == "GridLines":
        return 2 * N
    if t == "Colours":
        return gt.C
    if t == "Moves":
        return len(all_moves(gt, l.val))
    if t == "EveryMove":
        return n_all_moves(gt)
    if t == "RegionCells":
        return N * N
    if t == "Neighbours":
        return 4
    if t == "Range":
        return RANGE_MAX
    if t == "ListLit":
        return len(l.kids)
    if t == "Comp":
        c = 1
        for x in l.kids[2:]:
            c *= _static_cap(x, gt)
        return c
    return max(N * N, n_all_moves(gt))     # a variable: no tighter static bound tracked


def run(prog: Node, gt: GridType, g: Grid, owner: Optional[Owner] = None, limit: int = STEP_LIMIT,
        record: bool = True) -> Result:
    return Run(prog, gt, g, owner, limit, record).run()
