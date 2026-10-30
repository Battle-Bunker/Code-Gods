"""Trusted bootstrap, run once into the guest __main__ before sandbox_guest.py (part of the initialized snapshot)."""
import ast, json, math, random, time, sys, collections, functools, itertools, operator, statistics
import re, decimal, fractions, hashlib
import os
os.environ.pop('PYTHONHOME', None)
class _BlockedOutput:
    def write(self, *args): raise PermissionError('Guest I/O is disabled')
    def flush(self): pass
sys.stdout = sys.stderr = _BlockedOutput()
_EXAMPLE = '\n    def agent(grid):\n        return []'
def _price(tree):
    def size(v):
        if v is None or isinstance(v, bool): return 1
        if isinstance(v, str): return len(v.encode('utf-8', 'surrogatepass'))
        if isinstance(v, bytes): return len(v)
        if isinstance(v, int):
            bits = v.bit_length()+1 if v >= 0 else (~v).bit_length()+1
            return max(1, (bits+7)//8)
        if isinstance(v, float): return 8
        if isinstance(v, complex): return 16
        if v is Ellipsis: return 1
        raise ValueError('Unsupported constant')
    return sum(size(n.value) if isinstance(n, ast.Constant) else 1 for n in ast.walk(tree))
def _inspect(source, vocab, scheme):
    # Parses and prices; never evaluates the player's source. The trusted prelude's constructors
    # (_PRELUDE_G) are applied to literal arguments only, to detect literal moves.
    # Returns (json result, '') or ('', message).
    try:
        tree = ast.parse(source, mode='exec')
        error = _shape(tree)
        if error:
            return '', error
        bits = _AB['ast_bits'](tree, _AB['Tables'](_AB_BASE[scheme], json.loads(vocab)), _PRELUDE_G)
        bits['astBytes'] = _price(tree)
        return json.dumps(bits), ''
    except _AB['Unencodable'] as e:
        return '', f'SyntaxError: this program uses Python the price table does not cover ({e})'[:500]
    except Exception as e:
        return '', f'SyntaxError: {type(e).__name__}: {e}'[:500]
def _shape(tree):
    found = [n for n in tree.body
             if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == 'agent']
    if not found:
        return ('SyntaxError: an agent must define a function named agent at the top '
                'level, like:' + _EXAMPLE)
    if len(found) > 1:
        return f'SyntaxError: agent is defined more than once (line {found[1].lineno})'
    f = found[0]
    if isinstance(f, ast.AsyncFunctionDef):
        return f'SyntaxError: agent must be a plain def, not async def (line {f.lineno})'
    a = f.args
    positional = a.posonlyargs + a.args
    required = len(positional) - len(a.defaults)
    if (required > 1 or (not positional and a.vararg is None)
            or any(d is None for d in a.kw_defaults)):
        return (f'SyntaxError: agent must take exactly one argument (line {f.lineno}), '
                'like:' + _EXAMPLE)
    return ''
def _explain(source):
    try:
        compile(source, '<agent>', 'exec')
    except SyntaxError as e:
        text = (e.text or '').split('\n')[0]
        column = max(min(e.offset or 1, len(text) + 1), 1)
        start = max(column - 60, 0)
        where = f' (line {e.lineno}, column {e.offset})' if e.lineno else ''
        caret = f'\n    {text[start:column + 20]}\n    {" " * (column - 1 - start)}^' if text else ''
        return f'SyntaxError: {e.msg}{where}{caret}'
    except Exception as e:
        return f'{type(e).__name__}: {e}'
    return 'SyntaxError: invalid Python module'
def _describe(exc):
    # Runs inside the guest budget: user __str__/__name__ hooks may run here.
    try:
        line = None
        tb = exc.__traceback__
        while tb is not None:
            if tb.tb_frame.f_code.co_filename == '<agent>':
                line = tb.tb_lineno
            tb = tb.tb_next
        text = f'{type(exc).__name__}: {exc}'[:500]
        return text + (f' (line {line})' if line else '')
    except BaseException:
        return 'an error'
