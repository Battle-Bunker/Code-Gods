"""Grid agent language: a small Python-flavoured language for agents, priced entirely in bits.

    from gridlab.agentlang import cost, explain, LangAgent
    cost("paint(best_line, red)", gtype)      # {"description": ..., "decision": ..., "destruction": ..., ...}
    print(explain(src, gtype, owner))          # the program with a price tag on every line

Reference and theory: docs/agent-language.md. Modules: lang (types, IR, slots), grammar (the
probabilistic grammar / description code), elab (source <-> IR), interp (interpreter, step budget,
choice bookkeeping), pricing (decision and destruction bits, reference grids, cache), agent
(LangAgent for sim.py), examples, astbytes, evaluate.
"""
from __future__ import annotations

from typing import Optional, Union

from ..core import GridType
from .agent import LangAgent
from .elab import elaborate, unparse
from .grammar import describe_bits
from .interp import Owner, run
from .lang import LangError, Node
from .pricing import PRICING, price


def _ir(program: Union[str, Node], gtype: GridType) -> Node:
    return elaborate(program, gtype) if isinstance(program, str) else program


def cost(program: Union[str, Node], gtype: GridType, owner: Optional[Owner] = None,
         pricing: Optional[dict] = None) -> dict:
    """The price of an agent in bits: description + decision + destruction (and diagnostics).
    `owner` (interp.Owner(draw, survival table)) is needed if the program calls score()."""
    return price(_ir(program, gtype), gtype, owner, pricing)


def explain(program: str, gtype: GridType, owner: Optional[Owner] = None, pricing: Optional[dict] = None) -> str:
    """The source with the description bits of each line, then the three terms."""
    ir = elaborate(program, gtype)
    _, per_line, _ = describe_bits(ir, gtype)
    c = price(ir, gtype, owner, pricing)
    lines = program.rstrip("\n").splitlines()
    out = [f"{per_line.get(i, 0.0):6.1f}  {l}" for i, l in enumerate(lines, 1)]
    head = per_line.get(0, 0.0)
    out.append(f"{'':6}  ----")
    out.append(f"{c['description']:6.1f}  bits to write it down (description; {head:.1f} of them for 'start of the agent')")
    out.append(f"{c['decision']:6.1f}  bits it looks at to decide what to do (decision; bound: {c['binding']})")
    out.append(f"{c['destruction']:6.1f}  bits it rubs out and moves on the grid (destruction; ratchet {c['ratchet']:.1f})")
    out.append(f"{c['total']:6.1f}  bits in all = the energy it costs to summon")
    return "\n".join(out)


__all__ = ["LangAgent", "LangError", "Owner", "cost", "describe_bits", "elaborate", "explain", "price", "run",
           "unparse", "PRICING"]
