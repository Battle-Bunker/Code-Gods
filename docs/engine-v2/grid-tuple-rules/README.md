# Grid rules in the owner's tuple shape (prototype, nothing dealt)

Worker study, 16 November, for the coordinator: can the grid carry the nearest-target tuple shape
(`design-principles.md` principle 3b)? Nothing here is in `gridType.families`, a preset or the gallery.

**Verdict.** The 4×4 digit board cannot carry it.
- Energy does not limit a digit board: a grid seat's whole-game income is 2,530⚡, a unit move costs about 8.4⚡, and
  turning a random board into any chosen board costs 300–460⚡. Only search difficulty protects a top.
- Size primaries (bigger is better) have a findable top on capped digits: write 9s.
- Precision primaries (powers of a prime dividing long readings) are fragile in their leading digits, and on readings
  linear in the digits they are linear congruences that lattice reduction solves in seconds. The same attack on the
  dealt **Divisibility** (powers of 3, halves) finds 46 powers (1110/1212/1116/0261, transpose-symmetric) where
  `grid-params.md` §14 reports search finding 28–40; powers of 7: 22 (`scripts/lll_div.py`).
- With uncapped cells and a log-type code, the shape works: size is unbounded and costs its path, and a unit bump
  moves a total by 1 (Prime Rows: a median of 89–90% of bits kept after a cheap move). The ladder's steepness is set by
  the cell law's tail, the same open question as the line pool's price of growth.

Walk-throughs: [Round Halves](round-halves.md) (digit board), [Prime Rows](prime-rows.md) (changed board).

Scripts (Python 3, numpy, sympy; fpylll for the lattice attack), run from `scripts/`:
`gridlab.py` (law, readings, the grid menu with prices), `roundhalves.py` / `rh2.py` (Round Halves),
`tally.py` (uncapped board and Prime Rows), `climb.py` (greedy and annealing), `lll_attack.py`, `lll_div.py`,
`knock.py` (cheapest knocks). Bits are an approximation of option (b) (independence between readings); anything that
lands in `lib/` uses `lib/v2-valuation/src/tree-value.ts` instead.
