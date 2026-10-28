"""Trusted request checks and error classes; no submitted code runs here.

The runtime knows no object type. It checks the wire value generically (a safe
integer, or an ASCII string of at most wireMaxLength characters) and the shape
of the trusted prelude. The host re-validates objects with the type's codec and
parses/validates the encoded call list the guest returns.
"""
import re

GRAMMAR = "python-agent-v1"
WIRE_MAX_LENGTH = 1024
PRELUDE_PART_MAX = 65536
CALLS_MAX = 65536
SAFE_INTEGER = 2**53 - 1
_OBJECT_TYPE = re.compile(r"[A-Za-z][A-Za-z0-9_]{0,63}")
_PRELUDE_KEY = re.compile(r"[\x21-\x7e]{1,128}")
_SEED = re.compile(r"0[xX][0-9a-fA-F]{1,16}|[0-9]{1,20}")
STEP_BUDGET_DEFAULT = 500_000
STEP_BUDGET_MAX = 10_000_000
VOCAB_FIELDS = ("api", "attrs", "params", "strings", "mutators", "areas")
VOCAB_MAX = 4096


class Compile(ValueError):
    """The submitted source does not satisfy the grammar (reported as COMPILE)."""


class Domain(ValueError):
    """An input or the agent's output has the wrong type (reported as DOMAIN)."""


class Config(ValueError):
    """Malformed settings or a failing trusted prelude (reported as CONFIG)."""


class Execution(ValueError):
    """Submitted code raised or produced no agent (reported as EXECUTION)."""


class Limit(Exception):
    """A resource limit, reported to players in plain language instead of a wasm trap."""


def _text(value, limit):
    return (type(value) is str and "\0" not in value
            and len(value.encode("utf-8", "surrogatepass")) <= limit)


def _vocab(v):
    return (type(v) is dict and set(v) == set(VOCAB_FIELDS)
            and all(type(v[f]) is list and len(v[f]) <= VOCAB_MAX
                    and all(type(x) is str and 0 < len(x) <= 128 for x in v[f]) for f in VOCAB_FIELDS))


def pricing(prelude):
    """The room's pricing vocabulary: {python: V, typescript?: V}, V = {api, attrs, params, strings,
    mutators, areas} (lists of names / strings). Missing typescript means: the same as python."""
    p = prelude.get("pricing")
    if type(p) is not dict or not set(p) <= {"python", "typescript"} or not _vocab(p.get("python")) \
            or ("typescript" in p and not _vocab(p["typescript"])):
        raise Config("The room's prelude needs a pricing vocabulary (api, attrs, params, strings, mutators, areas)")
    return {"python": p["python"], "typescript": p.get("typescript", p["python"])}


def parse_seed(text):
    """An act's seed: a 64-bit unsigned integer in decimal or 0x-hex."""
    if type(text) is not str or not _SEED.fullmatch(text):
        raise Config("The act needs a seed: a 64-bit decimal or 0x-hex string")
    value = int(text, 0) if text[:2].lower() == "0x" else int(text)
    if value >= 2**64:
        raise Config("The act's seed must fit in 64 bits")
    return value


def settings(request):
    domain = request.get("settings")
    prelude = domain.get("prelude") if type(domain) is dict else None
    budget = domain.get("interactionComputeMs", 5) if type(domain) is dict else None
    steps = domain.get("stepBudget", STEP_BUDGET_DEFAULT) if type(domain) is dict else None
    if (type(domain) is not dict
            or type(domain.get("objectType")) is not str
            or not _OBJECT_TYPE.fullmatch(domain["objectType"])
            or type(domain.get("wireMaxLength")) is not int
            or not 0 <= domain["wireMaxLength"] <= WIRE_MAX_LENGTH
            or type(budget) is not int or not 1 <= budget <= 1000
            or type(steps) is not int or not 1 <= steps <= STEP_BUDGET_MAX
            or type(prelude) is not dict
            or type(prelude.get("key")) is not str
            or not _PRELUDE_KEY.fullmatch(prelude["key"])
            or not all(_text(prelude.get(part), PRELUDE_PART_MAX) for part in ("python", "js", "dts"))):
        raise Config("Invalid or unsupported runtime settings")
    try:
        prelude["python"].encode("utf-8")
    except UnicodeEncodeError:
        raise Config("Prelude must be valid UTF-8") from None
    return {"objectType": domain["objectType"], "wireMaxLength": domain["wireMaxLength"],
            "interactionComputeMs": budget, "stepBudget": steps,
            "prelude": {**{part: prelude[part] for part in ("key", "python", "js", "dts")},
                        "pricing": pricing(prelude)}}


def check_input(value, domain):
    if type(value) is int:
        valid = -SAFE_INTEGER <= value <= SAFE_INTEGER
    else:
        valid = (type(value) is str and value.isascii()
                 and len(value) <= domain["wireMaxLength"])
    if not valid:
        raise Domain("Input is not a valid wire value for this room")
