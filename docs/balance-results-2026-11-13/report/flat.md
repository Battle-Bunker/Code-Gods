### Flat pricing (set-v1: every one-cell write costs the same)

`flat`: 3 gods, 24 games per table, 300 s, 1 agent(s) per god.

Win share of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *33%* | 4% | 0% | 50% | deny |
| payoff | 67% | *33%* | 25% | 92% | deny |
| cooperator | 79% | 50% | *33%* | 92% | deny |
| deny | 38% | 0% | 0% | *33%* | greedy |

Mean rank of the one god (1 = first; fair 2.0):
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *2.00* | 2.75 | 2.96 | 1.63 | deny |
| payoff | 1.50 | *2.00* | 2.33 | 1.08 | deny |
| cooperator | 1.21 | 1.54 | *2.00* | 1.08 | deny |
| deny | 1.92 | 3.00 | 3.00 | *2.00* | greedy |

Points of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *18880* | 26193 | 13970 | 8752 | payoff |
| payoff | 36961 | *35347* | 25333 | 27217 | greedy |
| cooperator | 31491 | 28572 | *22148* | 25335 | greedy |
| deny | 4331 | 5927 | 3897 | *3827* | payoff |

Welfare of each one-policy table: greedy 56640, payoff 106041, cooperator 66445, deny 11480
