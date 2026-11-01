"""Grid types, grids, capabilities, spawning and symmetries: the shared contract for every module.

Encoding (all integer indices, so batches are plain uint8 arrays):
  sym[r, c]  symbol index. Digit sets: index == digit value. Cards: index = suit * 13 + rank,
             rank 0..12 (A, 2..10, J, Q, K), suit 0..3 (♠ ♥ ♦ ♣).
  col[r, c]  colour index in spectral (rainbow) order: ryb R Y B; rgb R G B; rgby R Y G B; rainbow6 R O Y G B V.
A batch is a pair of arrays shaped (B, N, N).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from functools import cached_property
import numpy as np

SYMBOL_SETS = ("base10", "base12", "base16", "cards")
COLOUR_SETS = ("rgb", "rgby", "rainbow6", "ryb")
SIZES = (3, 4, 5, 6, 7)

COLOUR_NAMES = {
    "rgb": ("red", "green", "blue"),
    "rgby": ("red", "yellow", "green", "blue"),
    "rainbow6": ("red", "orange", "yellow", "green", "blue", "violet"),
    "ryb": ("red", "yellow", "blue"),
}
COLOUR_LETTERS = {k: tuple(n[0].upper() if n != "violet" else "V" for n in v) for k, v in COLOUR_NAMES.items()}
# Paint mixing (Mixable): unordered parent pair -> child, by colour name.
MIXES = {
    "rgb": {},
    "ryb": {},
    "rgby": {("yellow", "blue"): "green"},
    "rainbow6": {("red", "yellow"): "orange", ("yellow", "blue"): "green", ("red", "blue"): "violet"},
}
SUITS = "♠♥♦♣"
RANK_GLYPHS = ("A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K")
DIGIT_GLYPHS = "0123456789ABCDEF"

# Capability classes (names follow the architecture doc). Superclass closure is applied in `caps`.
SUPER = {
    "Valued": {"Finite"}, "Ranked": {"Finite"}, "Numeral": {"Valued", "Ranked"},
    "Suited": {"Finite"}, "Faced": {"Ranked"},
    "Spectral": {"Finite"}, "Wheel": {"Spectral"}, "Mixable": {"Finite"},
}


@dataclass(frozen=True)
class GridType:
    """A fully applied object type, e.g. Grid(5,cards,rgb): the type constructor Grid applied to
    its runtime parameters. NOT a game room (rooms are lobbies that configure and host games)."""
    size: int = 5
    symbols: str = "base10"
    colours: str = "rgby"

    def __post_init__(self):
        assert self.size in SIZES and self.symbols in SYMBOL_SETS and self.colours in COLOUR_SETS

    @property
    def key(self) -> str:
        return f"Grid({self.size},{self.symbols},{self.colours})"

    # --- carriers -------------------------------------------------------------------------------
    @cached_property
    def S(self) -> int:  # number of symbols
        return 52 if self.symbols == "cards" else int(self.symbols[4:])

    @cached_property
    def C(self) -> int:  # number of colours
        return len(COLOUR_NAMES[self.colours])

    @property
    def N(self) -> int:
        return self.size

    @cached_property
    def colour_names(self) -> tuple[str, ...]:
        return COLOUR_NAMES[self.colours]

    def colour(self, name: str) -> int | None:
        return self.colour_names.index(name) if name in self.colour_names else None

    # --- instance dictionaries as lookup tables (index -> property) ------------------------------
    @cached_property
    def value(self) -> np.ndarray:
        """Valued: point value. Digits: the digit. Cards: A=1 .. K=13."""
        if self.symbols == "cards":
            return (np.arange(52) % 13 + 1).astype(np.int16)
        return np.arange(self.S, dtype=np.int16)

    @cached_property
    def rank(self) -> np.ndarray:
        """Ranked: position in counting order, 0..ranks-1 (cards: by rank, suit ignored)."""
        return (np.arange(52) % 13).astype(np.int16) if self.symbols == "cards" else np.arange(self.S, dtype=np.int16)

    @cached_property
    def ranks(self) -> int:
        return 13 if self.symbols == "cards" else self.S

    @cached_property
    def suit(self) -> np.ndarray | None:
        """Suited: 0..3, cards only."""
        return (np.arange(52) // 13).astype(np.int16) if self.symbols == "cards" else None

    @cached_property
    def face(self) -> np.ndarray | None:
        """Faced: J, Q, K."""
        return (np.arange(52) % 13 >= 10) if self.symbols == "cards" else None

    @property
    def base(self) -> int | None:
        """Numeral: positional base, digits sets only."""
        return None if self.symbols == "cards" else self.S

    def step(self, s: int | np.ndarray, k: int = 1):
        """Ranked step with wrap; cards keep their suit."""
        if self.symbols == "cards":
            return (np.asarray(s) // 13) * 13 + (np.asarray(s) % 13 + k) % 13
        return (np.asarray(s) + k) % self.S

    @cached_property
    def mix_table(self) -> np.ndarray:
        """Mixable: mix[a, b] = child colour index, or -1."""
        t = -np.ones((self.C, self.C), dtype=np.int16)
        for (a, b), child in MIXES[self.colours].items():
            ia, ib, ic = self.colour(a), self.colour(b), self.colour(child)
            t[ia, ib] = t[ib, ia] = ic
        return t

    # --- capabilities --------------------------------------------------------------------------
    @cached_property
    def caps(self) -> frozenset[str]:
        c = {"Finite", "Valued", "Ranked", "Spectral"}
        if self.symbols != "cards":
            c.add("Numeral")
        else:
            c |= {"Suited", "Faced"}
        if self.colours == "rainbow6":
            c.add("Wheel")
        if MIXES[self.colours]:
            c.add("Mixable")
        return frozenset(c)

    def satisfies(self, requires: "Requires") -> bool:
        return requires.check(self)

    # --- display -------------------------------------------------------------------------------
    def glyph(self, s: int) -> str:
        if self.symbols == "cards":
            return RANK_GLYPHS[s % 13] + SUITS[s // 13]
        return DIGIT_GLYPHS[s]

    def render(self, g: "Grid") -> str:
        letters = COLOUR_LETTERS[self.colours]
        w = 4 if self.symbols == "cards" else 2
        return "\n".join(" ".join(f"{self.glyph(int(g.sym[r, c]))}{letters[int(g.col[r, c])]}".rjust(w + 1)
                                  for c in range(self.N)) for r in range(self.N))


@dataclass(frozen=True)
class Requires:
    """A family's constraint: capability classes plus numeric refinements on the gtype."""
    classes: frozenset[str] = frozenset()
    min_size: int = 3
    max_size: int = 7
    parity: str | None = None  # "odd" (HasCentre) | "even" | None
    min_colours: int = 0
    min_symbols: int = 0

    def check(self, gtype: GridType) -> bool:
        return (self.classes <= gtype.caps and self.min_size <= gtype.N <= self.max_size
                and (self.parity is None or (gtype.N % 2 == 1) == (self.parity == "odd"))
                and gtype.C >= self.min_colours and gtype.S >= self.min_symbols)

    def describe(self) -> str:
        bits = sorted(self.classes)
        if self.min_size > 3: bits.append(f"N>={self.min_size}")
        if self.max_size < 7: bits.append(f"N<={self.max_size}")
        if self.parity: bits.append(f"N {self.parity}")
        if self.min_colours: bits.append(f"colours>={self.min_colours}")
        if self.min_symbols: bits.append(f"symbols>={self.min_symbols}")
        return ", ".join(bits) or "generic"


def req(*classes: str, **kw) -> Requires:
    return Requires(frozenset(classes), **kw)


class Grid:
    """Immutable N×N grid of (symbol, colour) indices. Hashable by canonical bytes (world uniqueness)."""
    __slots__ = ("sym", "col", "_key")

    def __init__(self, sym: np.ndarray, col: np.ndarray):
        self.sym = np.ascontiguousarray(sym, dtype=np.uint8)
        self.col = np.ascontiguousarray(col, dtype=np.uint8)
        self.sym.flags.writeable = False
        self.col.flags.writeable = False
        self._key = self.sym.tobytes() + b"|" + self.col.tobytes()

    @property
    def key(self) -> bytes:
        return self._key

    def __hash__(self):
        return hash(self._key)

    def __eq__(self, other):
        return isinstance(other, Grid) and self._key == other._key

    def replace(self, sym: np.ndarray | None = None, col: np.ndarray | None = None) -> "Grid":
        return Grid(self.sym if sym is None else sym, self.col if col is None else col)


def spawn(gtype: GridType, rng: np.random.Generator) -> Grid:
    """The prior μ: every cell independent and uniform over symbols × colours."""
    return Grid(rng.integers(0, gtype.S, (gtype.N, gtype.N)), rng.integers(0, gtype.C, (gtype.N, gtype.N)))


def spawn_batch(gtype: GridType, rng: np.random.Generator, B: int) -> tuple[np.ndarray, np.ndarray]:
    return (rng.integers(0, gtype.S, (B, gtype.N, gtype.N), dtype=np.uint8),
            rng.integers(0, gtype.C, (B, gtype.N, gtype.N), dtype=np.uint8))


# Dihedral group D4 acting on the last two axes; spawn measure is invariant under all of it.
D4 = {
    "id": lambda a: a,
    "rot90": lambda a: np.rot90(a, 1, axes=(-2, -1)),
    "rot180": lambda a: np.rot90(a, 2, axes=(-2, -1)),
    "rot270": lambda a: np.rot90(a, 3, axes=(-2, -1)),
    "flipH": lambda a: a[..., :, ::-1],
    "flipV": lambda a: a[..., ::-1, :],
    "transpose": lambda a: np.swapaxes(a, -1, -2),
    "antitranspose": lambda a: np.rot90(np.swapaxes(a, -1, -2), 2, axes=(-2, -1)),
}


def neighbours4(N: int, r: int, c: int):
    for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        rr, cc = r + dr, c + dc
        if 0 <= rr < N and 0 <= cc < N:
            yield rr, cc


def lines(N: int, diagonals: bool = False) -> list[list[tuple[int, int]]]:
    """Rows, then columns, then (optionally) the two main diagonals."""
    out = [[(r, c) for c in range(N)] for r in range(N)] + [[(r, c) for r in range(N)] for c in range(N)]
    if diagonals:
        out += [[(i, i) for i in range(N)], [(i, N - 1 - i) for i in range(N)]]
    return out


def all_grid_types() -> list[GridType]:
    return [GridType(n, s, c) for n in SIZES for s in SYMBOL_SETS for c in COLOUR_SETS]
