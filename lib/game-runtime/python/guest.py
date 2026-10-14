"""Trusted adapter executed INSIDE Wasm, never by the host interpreter."""
import ast
import json
import sys

request = json.loads(sys.argv[1])
source = request["source"]
tree = ast.parse(source, mode="eval")


def constant_size(value):
    if value is None or isinstance(value, bool):
        return 1
    if isinstance(value, str):
        return len(value.encode("utf-8"))
    if isinstance(value, bytes):
        return len(value)
    if isinstance(value, int):
        bits = value.bit_length() + 1 if value >= 0 else (~value).bit_length() + 1
        return max(1, (bits + 7) // 8)
    if isinstance(value, float):
        return 8
    if isinstance(value, complex):
        return 16
    raise ValueError("Unsupported constant")


# Price is inspected in a separate invocation that NEVER evaluates source.
if request["mode"] == "inspect":
    compile(tree, "<agent>", "eval")
    cost = sum(
        constant_size(node.value) if isinstance(node, ast.Constant) else 1
        for node in ast.walk(tree)
    )
    print(json.dumps({"cost": cost}))
else:
    # WASI imports, memory limits and fuel are the boundary, not restricted eval.
    fn = eval(compile(tree, "<agent>", "eval"), {})
    if not callable(fn):
        raise TypeError("Source must evaluate to a callable")
    result = fn(request["input"])
    if type(result) not in (int, str):
        raise TypeError("Result must be an integer or ASCII string")
    domain = request.get("settings", {"intMin": -(2**31), "intMax": 2**31 - 1,
                                      "stringMaxLength": 128})
    if type(result) is int and not domain["intMin"] <= result <= domain["intMax"]:
        raise ValueError("DOMAIN: Integer output outside configured domain")
    if type(result) is str and (len(result) > domain["stringMaxLength"] or not result.isascii()):
        raise ValueError("DOMAIN: String output outside configured domain")
    if type(result) is not type(request["input"]):
        raise TypeError("Transformation must preserve the input type")
    print(json.dumps({"value": result}, ensure_ascii=True))
