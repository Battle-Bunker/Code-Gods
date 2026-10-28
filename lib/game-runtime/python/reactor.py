"""Pinned CPython command-module to reactor export transformation.

Only section framing and the standard debug name map are rewritten. Code is
validated by Wasmtime, and decoded below to reject all table-mutating opcodes.
Unknown instruction proposals fail closed rather than being byte-searched.
"""
import hashlib

ABI = (
    "__wasm_call_ctors malloc free PyConfig_InitPythonConfig "
    "Py_InitializeFromConfig PyConfig_Clear PyRun_SimpleString "
    "Py_CompileString PyDict_New PyDict_SetItemString PyEval_GetBuiltins "
    "PyEval_EvalCode PyObject_CallOneArg PyLong_FromLong PyLong_AsLong "
    "PyUnicode_FromStringAndSize PyUnicode_AsUTF8AndSize PyObject_Type "
    "PyErr_Clear PyErr_Occurred PyImport_AddModule PyModule_GetDict PyDict_GetItemString "
    "PyMarshal_WriteObjectToString PyMarshal_ReadObjectFromString PyBytes_AsStringAndSize "
    "Py_IncRef PyErr_GetRaisedException"
).split()


def leb(data, pos):
    value = shift = 0
    while True:
        byte = data[pos]
        pos += 1
        value |= (byte & 127) << shift
        if byte < 128:
            return value, pos
        shift += 7
        if shift > 70:
            raise ValueError("Invalid Wasm LEB")


def encode(value):
    out = bytearray()
    while value >= 128:
        out.append((value & 127) | 128)
        value >>= 7
    out.append(value)
    return bytes(out)


def string(value):
    data = value.encode()
    return encode(len(data)) + data


def immutable_table(code):
    count, p = leb(code, 0)
    for _ in range(count):
        size, p = leb(code, p)
        end = p + size
        local_count, p = leb(code, p)
        for _ in range(local_count):
            _, p = leb(code, p)
            p += 1
        while p < end:
            op = code[p]
            p += 1
            if op in (2, 3, 4, 12, 13, 16, 18, 20, 32, 33, 34, 35, 36,
                      63, 64, 65, 66, 210):
                _, p = leb(code, p)
            elif op in (17, 19):
                _, p = leb(code, p)
                _, p = leb(code, p)
            elif op == 14:
                n, p = leb(code, p)
                for _ in range(n + 1):
                    _, p = leb(code, p)
            elif 40 <= op <= 62:
                _, p = leb(code, p)
                _, p = leb(code, p)
            elif op == 67:
                p += 4
            elif op == 68:
                p += 8
            elif op == 252:
                sub, p = leb(code, p)
                if sub in (8, 10):
                    _, p = leb(code, p)
                    _, p = leb(code, p)
                elif sub in (9, 11):
                    _, p = leb(code, p)
                elif sub > 7:
                    raise ValueError("Table/bulk proposal not supported")
            elif op in (0, 1, 5, 11, 15, 26, 27) or 69 <= op <= 196:
                pass
            else:
                raise ValueError(f"Unsupported or table instruction {op:#x}")
        if p != end:
            raise ValueError("Invalid function framing")
    if p != len(code):
        raise ValueError("Invalid code framing")


def transform(data):
    if data[:8] != b"\0asm\1\0\0\0":
        raise ValueError("Not Wasm version 1")
    sections, names = [], {}
    pos = 8
    global_count = 0
    while pos < len(data):
        kind = data[pos]
        size, pos = leb(data, pos + 1)
        payload = data[pos:pos + size]
        if len(payload) != size:
            raise ValueError("Truncated section")
        pos += size
        sections.append((kind, payload))
        if kind == 2:
            count, q = leb(payload, 0)
            for _ in range(count):
                for _ in range(2):
                    n, q = leb(payload, q)
                    q += n
                if payload[q] != 0:
                    raise ValueError("Only function imports supported")
                _, q = leb(payload, q + 1)
        if kind == 6:
            global_count, _ = leb(payload, 0)
        if kind == 10:
            immutable_table(payload)
        if kind != 0:
            continue
        n, q = leb(payload, 0)
        if payload[q:q+n] != b"name":
            continue
        q += n
        while q < len(payload):
            sub = payload[q]
            n, q = leb(payload, q + 1)
            end = q + n
            if sub == 1:
                count, q = leb(payload, q)
                for _ in range(count):
                    index, q = leb(payload, q)
                    length, q = leb(payload, q)
                    name = payload[q:q+length].decode()
                    q += length
                    names[name] = index
            q = end
    extra = [(n, 0, names[n]) for n in ABI]
    extra += [(f"snapshot_global_{i}", 3, i) for i in range(global_count)]
    out = bytearray(data[:8])
    for kind, payload in sections:
        if kind == 0:
            continue
        if kind == 7:
            count, q = leb(payload, 0)
            payload = encode(count + len(extra)) + payload[q:]
            payload += b"".join(string(n) + bytes([k]) + encode(i)
                                for n, k, i in extra)
        out += bytes([kind]) + encode(len(payload)) + payload
    return bytes(out), global_count, hashlib.sha256(data).hexdigest()
