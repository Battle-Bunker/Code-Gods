### The rules on develop

`develop`: 3 gods, 24 games per table, 300 s, 1 agent(s) per god.

Win share of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *33%* | 4% | 0% | 46% | deny |
| payoff | 67% | *33%* | 25% | 79% | deny |
| cooperator | 67% | 54% | *33%* | 88% | deny |
| deny | 54% | 0% | 0% | *33%* | greedy |

Mean rank of the one god (1 = first; fair 2.0):
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *2.00* | 2.67 | 2.96 | 1.63 | deny |
| payoff | 1.50 | *2.00* | 2.42 | 1.21 | deny |
| cooperator | 1.33 | 1.54 | *2.00* | 1.13 | deny |
| deny | 1.67 | 3.00 | 3.00 | *2.00* | greedy |

Points of the one god:
| the others play ↓, one god plays → | greedy | payoff | cooperator | deny | best response |
|---|---|---|---|---|---|
| greedy | *20483* | 26843 | 14749 | 9314 | payoff |
| payoff | 34775 | *33554* | 23898 | 27925 | greedy |
| cooperator | 29132 | 28509 | *23642* | 24377 | greedy |
| deny | 4474 | 6360 | 3788 | *3864* | payoff |

Welfare of each one-policy table: greedy 61450, payoff 100663, cooperator 70925, deny 11592

Equilibria by win share (no god gains more than 3% by switching), of 20 tables:

- **greedy, greedy, deny**: welfare 26177; greedy 27%, deny 46%; best switch greedy → deny −4%

Tables of one policy that are not equilibria, and the switch that breaks them:
- all greedy (welfare 61450): one god switches to deny, +13%
- all payoff (welfare 100663): one god switches to deny, +46%
- all cooperator (welfare 70925): one god switches to deny, +54%
- all deny (welfare 11592): one god switches to greedy, +21%

Equilibria by points (no god gains more than 671 by switching), of 20 tables:

- **greedy, payoff, payoff**: welfare 98033; greedy 34775, payoff 31629; best switch payoff → greedy −1161

Tables of one policy that are not equilibria, and the switch that breaks them:
- all greedy (welfare 61450): one god switches to payoff, +6360
- all payoff (welfare 100663): one god switches to greedy, +1221
- all cooperator (welfare 70925): one god switches to greedy, +5490
- all deny (welfare 11592): one god switches to payoff, +2496
