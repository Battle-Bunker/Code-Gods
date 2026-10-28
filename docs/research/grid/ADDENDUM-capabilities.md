# Addendum: rules may require capabilities (supersedes "every rule must work for every parameterisation")

Rules no longer need to work for every grid parameterisation. A rule may declare the *capabilities*
(type-class-like constraints) it needs from the grid's symbol set, colour set and size; it is then
only offered in rooms whose parameters provide them. Generic rules are still valuable (they are
always available), but don't water down a great rule just to make it universal.

Provisional capability vocabulary (an architect is refining this; use these names, and propose new
ones if you need them, clearly marked NEW):

Symbol-set classes
- `Eq`        symbols can be compared for equality.                  [all sets]
- `Valued`    symbol -> point value (number).                         [all sets; cards = rank]
- `Enum`      ordered with succ/pred ("next symbol").                 [all sets; cards by rank]
- `Cyclic`    succ wraps around (F+1 = 0, K+1 = A).                   [all sets]
- `Numeral b` symbols are digits of a positional base b, so a row can be read as a number.
              Instances: base10 (b=10), base12, base16. NOT cards.
- `Suited`    symbol has a suit component (♠♥♦♣) separate from rank.  [cards only]
- `Faced`     some symbols are "picture" symbols (J, Q, K).           [cards only]
- (base-specific number facts, e.g. "is prime", "multiple of b/2", are fine under Valued/Numeral)

Colour-set classes
- `Eq`        colours compare for equality.                           [all sets]
- `Spectral`  colours are ordered along the rainbow (R<O<Y<G<B<V); "gradient" makes sense.
              Instances: rainbow6, RGBY (R<Y<G<B), RGB (R<G<B).
- `Wheel`     the order wraps around (violet is next to red).         [rainbow6; maybe others]
- `Mixable`   some colour is the mix of two others (red+yellow=orange, yellow+blue=green, red+blue=violet).
              Instances: rainbow6 only.
- `HasColour k` the set contains a named colour (e.g. green). A rule that names "your colour" should
              normally sample it from the room's colours instead of requiring a specific one.

Size constraints
- `MinSize k` (e.g. a rule about 5-in-a-row needs N >= 5), `HasCentre` (N odd), `Even` (N even).

When you write a rule, add a line **Requires:** `...` listing the constraints (empty = fully generic),
and if the rule degrades gracefully on weaker instances say so (e.g. "with Wheel, distances wrap;
without, they don't" = a default method).
