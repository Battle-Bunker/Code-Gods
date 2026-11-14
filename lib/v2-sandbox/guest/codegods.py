# The guest library for Python agents (CPython WASI), run as the act's trusted prelude. Transport and rationals
# only, no rule logic (spec §0, §6.4). The sandbox puts `__host` in these globals before this runs: one JSON
# request in, one JSON reply out, synchronously, over WASI file descriptor 3 (spec §6.5). The sandbox calls
# `__decode(offer)` to make the Offer handed to `agent`, and `__encode_calls(result)` on what `agent` returns.
#
# Names for agents: call, HostError, Fraction, Point, Segment, Undefined. Numbers are fractions.Fraction; a
# symbol is a str; an undefined element is an Undefined (falsy, with .why).
import json
from fractions import Fraction

_HOST = __host
_DUMPS = json.dumps
_LOADS = json.loads


class HostError(Exception):
    """The host refused a request (an unknown element, the host-call cap, ...). Uncaught, it fails the act."""


class Point:
    __slots__ = ("x", "y")

    def __init__(self, x, y):
        self.x, self.y = x, y

    def __eq__(self, other):
        return isinstance(other, Point) and (self.x, self.y) == (other.x, other.y)

    def __hash__(self):
        return hash((self.x, self.y))

    def __repr__(self):
        return f"Point({self.x}, {self.y})"


class Segment:
    __slots__ = ("start", "end")

    def __init__(self, start, end):
        self.start, self.end = start, end

    def __repr__(self):
        return f"Segment({self.start!r}, {self.end!r})"


class Undefined:
    """An element the representation cannot express for this state: falsy, equal to None, with the reason."""
    __slots__ = ("why",)

    def __init__(self, why):
        self.why = why

    def __bool__(self):
        return False

    def __eq__(self, other):
        return other is None or isinstance(other, Undefined)

    def __hash__(self):
        return hash(None)

    def __repr__(self):
        return f"Undefined({self.why!r})"


class Record:
    """A reply as attributes (snake_case: read_price, host_calls_left) and as a mapping (r["readPrice"])."""

    def __init__(self, fields):
        self._fields = fields

    def __getattr__(self, name):
        fields = self._fields
        if name in fields:
            return fields[name]
        camel = name.split("_")[0] + "".join(p.title() for p in name.split("_")[1:])
        if camel in fields:
            return fields[camel]
        raise AttributeError(name)

    def __getitem__(self, name):
        return self._fields[name]

    def __contains__(self, name):
        return name in self._fields

    def keys(self):
        return self._fields.keys()

    def items(self):
        return self._fields.items()

    def __repr__(self):
        return f"Record({self._fields!r})"


def _q(text):
    return Fraction(text)


def _value(v):
    kind = v["kind"]
    if kind == "number":
        return _q(v["q"])
    if kind == "point":
        return Point(_q(v["x"]), _q(v["y"]))
    if kind == "segment":
        return Segment(Point(_q(v["from"]["x"]), _q(v["from"]["y"])), Point(_q(v["to"]["x"]), _q(v["to"]["y"])))
    if kind == "symbol":
        return v["text"]
    return Undefined(str(v.get("reason", "")))


def _wire(x, name):
    if isinstance(x, str):
        return x
    if isinstance(x, bool):
        raise TypeError(f"argument {name}: a bool is not a number")
    if isinstance(x, float):
        if not x.is_integer():
            raise TypeError(f"argument {name}: use Fraction for fractions, not float ({x})")
        x = int(x)
    if isinstance(x, int):
        return str(x)
    if isinstance(x, Fraction):
        return str(x.numerator) if x.denominator == 1 else f"{x.numerator}/{x.denominator}"
    raise TypeError(f"argument {name}: not a number or Fraction ({type(x).__name__})")


def _args(args):
    if args is None:
        return {}
    if not isinstance(args, dict):
        raise TypeError("a call's arguments are a dict")
    return {str(k): _wire(v, k) for k, v in args.items()}


def _site(site):
    if site is None:
        return 0
    if isinstance(site, bool) or not isinstance(site, int) or site < 0:
        raise TypeError("site must be a line number from 0")
    return site


def call(mutator, site=0, **args):
    """A mutator call: call("si.tilt", k=1); call("cart.pivot", x0=2, k=-1, site=1) on a multi-line object."""
    if not isinstance(mutator, str):
        raise TypeError('call(mutator, **args): mutator is a str such as "si.tilt"')
    return {"mutator": mutator, "site": _site(site), "args": _args(args)}


def _normal(c):
    if not isinstance(c, dict) or "mutator" not in c:
        raise TypeError("a call is made with call(mutator, **args)")
    return {"mutator": str(c["mutator"]), "site": _site(c.get("site", 0)), "args": _args(c.get("args"))}


def _ask(request):
    reply = _LOADS(_HOST(_DUMPS(request, separators=(",", ":"))))
    if not reply["ok"]:
        raise HostError(str(reply["error"]))
    return reply["result"]


def _elements(values):
    return Record({k: _value(v) for k, v in values.items()})


class Offer:
    """The object this act was offered. Every method is a host call (spec §6.2, §6.3)."""

    def __init__(self, obj):
        self.object = obj

    def view(self, rep, site=None):
        request = {"op": "view", "rep": rep} if site is None else {"op": "view", "rep": rep, "site": _site(site)}
        return _elements(_ask(request)["elements"])

    def element(self, rep, name, args=None, site=None):
        ref = {"rep": rep, "name": name}
        if site is not None:
            ref["site"] = _site(site)
        if args is not None:
            ref["args"] = _args(args)
        return _value(_ask({"op": "element", "ref": ref})["value"])

    def my_rule(self):
        r = _ask({"op": "myRule"})
        return Record({"family": r["family"], "params": r["params"], "card": r["card"]})

    def my_score(self):
        s = _ask({"op": "myScore"})
        return Record({
            "score": None if s["score"] is None else [None if x is None else _q(x) for x in s["score"]],
            "level": s["level"], "top": s["top"],
            "terms": [Record({"id": t["id"], "value": None if t["value"] is None else _q(t["value"])}) for t in s["terms"]],
        })

    def quote(self, calls):
        if not isinstance(calls, (list, tuple)):
            raise TypeError("quote takes a list of calls")
        return Record(_ask({"op": "quote", "calls": [_normal(c) for c in calls]}))

    def budget(self):
        return Record(_ask({"op": "budget"}))


def __decode(text):
    return Offer(_LOADS(text)["object"])


def __encode_calls(result):
    if result is None:
        return "null"
    if not isinstance(result, (list, tuple)):
        raise TypeError("agent must return a list of calls, or None to skip")
    return _DUMPS([_normal(c) for c in result], separators=(",", ":"))
