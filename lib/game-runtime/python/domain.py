"""Trusted request/domain checks; no submitted code runs here."""
def settings(request):
    domain = request.get("settings", {
        "objectType": "Int" if type(request.get("input")) is int else "string",
        "intMin": -(2**31), "intMax": 2**31 - 1, "stringMaxLength": 128,
    })
    if (domain.get("objectType") not in ("Int", "string")
        or type(domain.get("intMin")) is not int
        or type(domain.get("intMax")) is not int
        or not -(2**31) <= domain["intMin"] <= domain["intMax"] < 2**31
        or type(domain.get("stringMaxLength")) is not int
        or not 0 <= domain["stringMaxLength"] <= 8192):
        raise ValueError("DOMAIN: Invalid or unsupported settings")
    return domain


def check(value, domain):
    if domain["objectType"] == "Int":
        valid = type(value) is int and domain["intMin"] <= value <= domain["intMax"]
    else:
        valid = type(value) is str and value.isascii() and len(value) <= domain["stringMaxLength"]
    if not valid:
        raise ValueError("DOMAIN: Value outside configured domain")
