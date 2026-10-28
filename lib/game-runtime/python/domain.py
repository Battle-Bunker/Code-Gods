"""Trusted request/domain checks; no submitted code runs here."""
import json
import re

GRID_SIZES = (3, 4, 5, 6, 7)
GRID_SYMBOL_SETS = ("base10", "base12", "base16", "cards")
GRID_COLOUR_SETS = ("rgb", "rgby", "rainbow6")
# A Grid agent's output is a JSON call list; stringMaxLength does not apply to it.
GRID_OUTPUT_MAX = 8192
GRID_MAX_CALLS = 8
_DIGITS = "0123456789ABCDEF"
_CARD_CODES = frozenset("A23456789TJQK"[i % 13] + "SHDC"[i // 13] for i in range(52))
_SYMBOL_CODES = {"base10": frozenset(_DIGITS[:10]), "base12": frozenset(_DIGITS[:12]),
                 "base16": frozenset(_DIGITS), "cards": _CARD_CODES}
_COLOUR_LETTERS = {"rgb": frozenset("RGB"), "rgby": frozenset("RYGB"), "rainbow6": frozenset("ROYGBV")}
_MUTATOR_ID = re.compile(r"[a-z_]{1,32}")


def settings(request):
    domain = request.get("settings", {
        "objectType": "Int" if type(request.get("input")) is int else "string",
        "intMin": -(2**31), "intMax": 2**31 - 1, "stringMaxLength": 128,
    })
    if domain.get("objectType") == "Grid":
        if (type(domain.get("gridSize")) is not int or domain["gridSize"] not in GRID_SIZES
                or domain.get("gridSymbols") not in GRID_SYMBOL_SETS
                or domain.get("gridColours") not in GRID_COLOUR_SETS):
            raise ValueError("DOMAIN: Invalid or unsupported settings")
        return domain
    if (domain.get("objectType") not in ("Int", "string")
        or type(domain.get("intMin")) is not int
        or type(domain.get("intMax")) is not int
        or not -(2**31) <= domain["intMin"] <= domain["intMax"] < 2**31
        or type(domain.get("stringMaxLength")) is not int
        or not 0 <= domain["stringMaxLength"] <= 8192):
        raise ValueError("DOMAIN: Invalid or unsupported settings")
    return domain


def is_grid_value(value, domain):
    """Strict canonical-grid check, mirroring lib/game-core/src/grid.ts decodeGrid."""
    n, symbols = domain["gridSize"], domain["gridSymbols"]
    width = 2 if symbols == "cards" else 1
    if type(value) is not str or len(value) > n * n * (width + 2) - 1:
        return False
    codes, letters = _SYMBOL_CODES[symbols], _COLOUR_LETTERS[domain["gridColours"]]
    rows = value.split("/")
    if len(rows) != n:
        return False
    for row in rows:
        cells = row.split(",")
        if len(cells) != n or any(c[:-1] not in codes or c[-1:] not in letters for c in cells):
            return False
    return True


def is_grid_output(value):
    """Shape of a Grid agent's output: [{"m": id, "p": {...}}], at most 8 calls, printable ASCII."""
    if type(value) is not str or len(value) > GRID_OUTPUT_MAX or any(not " " <= ch <= "~" for ch in value):
        return False
    try:
        calls = json.loads(value)
    except ValueError:
        return False
    return type(calls) is list and len(calls) <= GRID_MAX_CALLS and all(
        type(c) is dict and sorted(c) == ["m", "p"] and type(c["m"]) is str
        and _MUTATOR_ID.fullmatch(c["m"]) and type(c["p"]) is dict for c in calls)


def check(value, domain):
    if domain["objectType"] == "Grid":
        valid = is_grid_value(value, domain)
    elif domain["objectType"] == "Int":
        valid = type(value) is int and domain["intMin"] <= value <= domain["intMax"]
    else:
        valid = type(value) is str and value.isascii() and len(value) <= domain["stringMaxLength"]
    if not valid:
        raise ValueError("DOMAIN: Value outside configured domain")


def check_output(value, domain):
    if domain["objectType"] != "Grid":
        return check(value, domain)
    if not is_grid_output(value):
        raise ValueError("DOMAIN: Agent output is not a valid list of mutator calls")
