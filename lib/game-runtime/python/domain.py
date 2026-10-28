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


def settings(request):
    domain = request.get("settings")
    prelude = domain.get("prelude") if type(domain) is dict else None
    budget = domain.get("interactionComputeMs", 5) if type(domain) is dict else None
    if (type(domain) is not dict
            or type(domain.get("objectType")) is not str
            or not _OBJECT_TYPE.fullmatch(domain["objectType"])
            or type(domain.get("wireMaxLength")) is not int
            or not 0 <= domain["wireMaxLength"] <= WIRE_MAX_LENGTH
            or type(budget) is not int or not 1 <= budget <= 1000
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
            "interactionComputeMs": budget,
            "prelude": {part: prelude[part] for part in ("key", "python", "js", "dts")}}


def check_input(value, domain):
    if type(value) is int:
        valid = -SAFE_INTEGER <= value <= SAFE_INTEGER
    else:
        valid = (type(value) is str and value.isascii()
                 and len(value) <= domain["wireMaxLength"])
    if not valid:
        raise Domain("Input is not a valid wire value for this room")
