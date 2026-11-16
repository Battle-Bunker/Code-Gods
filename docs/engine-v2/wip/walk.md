## prime-intercept {"ends":1} (closeness>gradient-log): 327068 draws, 66 measured targets, 18 s
Look at the y-intercept, ignoring a minus sign, and find the prime number ending in 1 nearest to it (for example 11, 31, 41, 61, 71, 101 for 1). The bigger that prime, the better. Secondary: The y-intercept (ignoring a minus sign) should be as close as possible to that prime. Third: The gradient's size times that prime should be as close as possible to 1, counted in doublings: 2 and 1/2 are both one doubling away, 4 and 1/4 two.
| line | tuple | bits (level + closeness + third) | a cheap move: bits after |
|---|---|---|---|
| y = 1/31x + 31 | (31, 0, 0) | 7.1 = 3.1 + 2.0 + 2.0 | shift +1 7.1, shift −1 7.1, tilt +1 6.0, tilt −1 6.0, nudge c 7.1, mirror x 7.1 |
| y = 2/7x + 103/2 | (61, -9.5, -4.123) | 5.9 = 3.9 + 0.0 + 2.0 | shift +1 5.9, shift −1 5.6, tilt +1 5.4, tilt −1 5.9, nudge c –, mirror x 5.9 |
| y = 1/101x + 101 | (101, 0, 0) | 8.4 = 4.4 + 2.0 + 2.0 | shift +1 8.4, shift −1 8.4, tilt +1 7.1, tilt −1 7.1, nudge c 8.4, mirror x 8.4 |
row 10: from each climb's best line, a cheap move keeps 100% of the bits (median; worst 90%)
gate (greedy climber, 3115⚡):
- 22.4 bits for 2156⚡ at 666,1,-83980800 (8.398e+7, -1, -35.7)
- 13.4 bits for 477⚡ at 1,6,-55074 (9181, -2, -10.58)
- 18.7 bits for 1931⚡ at -478,2,-7487995 (3.744e+6, -3.5, -29.74)
- 12.0 bits for 353⚡ at -6,8,-21609 (2711, -9.875, -10.99)
## power-area {"k":2} (closeness>per-crossing): 327702 draws, 60 measured targets, 13 s
The line and the two axes make a triangle. Find the power of 2 nearest its area (2, 4, 8, 16, …). The higher that power, the better. Secondary: The area should be as close as possible to that power. Third: The area divided by where the line crosses the x-axis (ignoring signs) should be as close as possible to a multiple of 2 (0, 2, 4, …).
| line | tuple | bits (level + closeness + third) | a cheap move: bits after |
|---|---|---|---|
| y = -1/2x + 8 | (6, 0, 0) | 4.5 = 2.5 + 2.0 + 0.0 | shift +1 3.4, shift −1 3.5, tilt +1 4.5, tilt −1 4.1, nudge c 5.6, mirror x 4.5 |
| y = -1/2x + 9 | (6, -17, -0.5) | 3.4 = 2.5 + 0.2 + 0.6 | shift +1 3.5, shift −1 4.5, tilt +1 3.4, tilt −1 3.9, nudge c 5.2, mirror x 3.4 |
| y = -1/4x + 8 | (7, 0, 0) | 4.8 = 2.8 + 2.0 + 0.0 | shift +1 3.7, shift −1 3.9, tilt +1 4.3, tilt −1 5.1, nudge c 6.2, mirror x 4.8 |
row 10: from each climb's best line, a cheap move keeps 100% of the bits (median; worst 81%)
gate (greedy climber, 3115⚡):
- 9.9 bits for 2286⚡ at -67200,1,268800 (19, -1.331e+4, 0)
- 25.6 bits for 665⚡ at -14,3,1245708288 (54, -4.593e+14, 0)
- 25.6 bits for 651⚡ at -14,3,1245708288 (54, -4.593e+14, 0)
- 20.1 bits for 1213⚡ at 1,14,-11010048 (42, -6.872e+1, 0)
## landing-tuple {"ends":1} (closeness>intercept-multiple): 327624 draws, 44 measured targets, 14 s
Find where the line crosses the x-axis, ignoring a minus sign (a flat line never crosses it: use its height instead), and the prime ending in 1 nearest to it. Primary: that prime, bigger is better. Secondary: How far the crossing is from that prime: closer is better. Third: The y-intercept (ignoring a minus sign) should be as close as possible to a multiple of that prime.
| line | tuple | bits (level + closeness + third) | a cheap move: bits after |
|---|---|---|---|
| y = -1x + 31 | (31, 0, 0) | 7.4 = 3.4 + 2.0 + 2.0 | shift +1 7.1, shift −1 7.1, tilt +1 7.4, tilt −1 3.5, nudge c 7.1, mirror x 7.4 |
| y = 1/2x + -61 | (131, -9, -61) | 5.6 = 4.9 + 0.4 + 0.2 | shift +1 5.2, shift −1 5.8, tilt +1 6.0, tilt −1 5.6, nudge c 5.8, mirror x 5.6 |
| y = 0x + 31 | (31, 0, 0) | 7.4 = 3.4 + 2.0 + 2.0 | shift +1 7.1, shift −1 7.1, tilt +1 7.4, tilt −1 7.4, nudge c 7.1, mirror x 7.4 |
row 10: from each climb's best line, a cheap move keeps 90% of the bits (median; worst 30%)
gate (greedy climber, 3115⚡):
- 4.0 bits for 7⚡ at -8,19,-18 (11, -8.75, -0.9474)
- 8.0 bits for 66⚡ at -1,10,-68 (71, -3, -6.8)
- 8.0 bits for 221⚡ at 1,23,-68 (71, -3, -2.957)
- 8.0 bits for 65⚡ at 1,10,-68 (71, -3, -6.8)
## ruler-tuple {"ends":1} (closeness>intercept-multiple): 327561 draws, 46 measured targets, 19 s
Square the distance from (0, 0) to the line, and find the prime ending in 1 nearest to it. Primary: that prime, bigger is better. Secondary: How far the distance squared is from that prime: closer is better. Third: The y-intercept (ignoring a minus sign) should be as close as possible to a whole number.
| line | tuple | bits (level + closeness + third) | a cheap move: bits after |
|---|---|---|---|
| y = 1x + 8 | (31, -1, 0) | 5.0 = 2.5 + 2.0 + 0.5 | shift +1 5.0, shift −1 3.4, tilt +1 2.9, tilt −1 4.8, nudge c 3.4, mirror x 5.0 |
| y = -2x + 13 | (31, -2.8, 0) | 4.7 = 2.5 + 1.6 + 0.6 | shift +1 5.0, shift −1 4.7, tilt +1 3.6, tilt −1 2.7, nudge c 4.7, mirror x 4.7 |
| y = 1/3x + 10 | (101, -11, 0) | 4.4 = 3.1 + 0.6 + 0.7 | shift +1 4.8, shift −1 5.0, tilt +1 3.9, tilt −1 5.3, nudge c 3.3, mirror x 4.4 |
row 10: from each climb's best line, a cheap move keeps 83% of the bits (median; worst 72%)
gate (greedy climber, 3115⚡):
- 11.6 bits for 291⚡ at -1,7,5922 (7.014e+5, -0.68, 0)
- 15.2 bits for 1575⚡ at -3,5,116600 (3.999e+8, -0.7647, 0)
- 25.4 bits for 718⚡ at 0,1,74649600 (5.573e+15, -1, 0)
- 15.7 bits for 1949⚡ at -3,11,-329384 (8.346e+8, -0.9692, 0)
## treasure-tuple {"k":3} (closeness>gradient-rows): 327413 draws, 134 measured targets, 13 s
Work out y when x is 3, ignoring a minus sign. Triangle numbers are 1, 3, 6, 10, 15, …: the n-th is 1 + 2 + … + n (rows of 1, 2, 3, … coins). Find the triangle number nearest to y. Primary: that number, bigger is better. Secondary: How far y is from that triangle number: closer is better. Third: The gradient (ignoring a minus sign) should be as close as possible to n, the number of rows in that triangle number.
| line | tuple | bits (level + closeness + third) | a cheap move: bits after |
|---|---|---|---|
| y = 2x + 4 | (10, 0, -2) | 3.4 = 1.0 + 2.0 + 0.4 | shift +1 2.3, shift −1 2.3, tilt +1 2.2, tilt −1 1.6, nudge c 2.3, mirror x 3.4 |
| y = 1/2x + 9 | (10, -0.5, -3.5) | 3.2 = 1.0 + 1.9 + 0.2 | shift +1 1.7, shift −1 3.2, tilt +1 2.5, tilt −1 1.2, nudge c 3.2, mirror x 3.2 |
| y = 3x + -5 | (3, -1, -1) | 1.6 = 0.4 + 0.2 + 1.0 | shift +1 3.2, shift −1 3.3, tilt +1 2.4, tilt −1 2.0, nudge c 3.3, mirror x 1.6 |
row 10: from each climb's best line, a cheap move keeps 100% of the bits (median; worst 93%)
gate (greedy climber, 3115⚡):
- 11.4 bits for 917⚡ at 110679,67,177081 (7626, -27.22, -1529)
- 11.4 bits for 193⚡ at 1500,1,3250 (775, 0, -1376)
- 9.1 bits for 263⚡ at -11899,57,-18207 (946, -0.3158, -165.8)
- 10.7 bits for 181⚡ at -100845,43,-4980 (714, -11.51, -2226)
## rulers-tuple {"digits":"odd","meets":1} (closeness>gradient-digits): 328067 draws, 46 measured targets, 14 s
Find where the line meets y = x, ignoring a minus sign. A palindrome reads the same backwards (7, 44, 343, 1221); find the one with an odd number of digits nearest to it. Primary: that palindrome, bigger is better. Secondary: How far the meeting point is from that palindrome: closer is better. Third: The gradient (ignoring a minus sign) should be as close as possible to that palindrome's digits added up.
| line | tuple | bits (level + closeness + third) | a cheap move: bits after |
|---|---|---|---|
| y = 1/2x + 22 | (9, -35, -8.5) | 3.6 = 2.9 + 0.1 + 0.6 | shift +1 3.6, shift −1 3.6, tilt +1 4.6, tilt −1 4.8, nudge c 3.6, mirror x 4.8 |
| y = -1x + 88 | (9, -35, -8) | 4.2 = 2.9 + 0.1 + 1.1 | shift +1 4.2, shift −1 4.2, tilt +1 6.8, tilt −1 5.1, nudge c 4.2, mirror x 0.0 |
| y = 2x + -7 | (7, 0, -5) | 5.9 = 2.7 + 1.2 + 2.0 | shift +1 5.3, shift −1 5.7, tilt +1 4.2, tilt −1 0.0, nudge c 5.7, mirror x 4.1 |
row 10: from each climb's best line, a cheap move keeps 80% of the bits (median; worst 31%)
gate (greedy climber, 3115⚡):
- 10.5 bits for 213⚡ at -273,240,11000 (333, -0.3333, -7.862)
- 9.6 bits for 139⚡ at -30,29,231 (232, -1, -5.966)
- 9.9 bits for 710⚡ at -19,10,1815 (202, -0.3333, -2.1)
- 10.5 bits for 114⚡ at -9,7,-665 (333, -0.5, -7.714)
## crossing-tuple {"q":3,"r":1} (closeness>gradient-log): 327342 draws, 7 measured targets, 15 s
Find where the line crosses the x-axis, ignoring a minus sign (a flat line never crosses it: use its height instead). Ladder numbers are those that, once every 3 is divided out, leave 1 when divided by 3 (for example 1, 4, 3, 9). Find the ladder number nearest the crossing. Primary: how many 3s it holds, more is better. Secondary: How far the crossing is from that ladder number: closer is better. Third: The gradient's size times that ladder number should be as close to 1 as possible, counted in doublings.
| line | tuple | bits (level + closeness + third) | a cheap move: bits after |
|---|---|---|---|
| y = -1x + 15 | (0, -1, -4) | 0.6 = 0.0 + 0.0 + 0.6 | shift +1 2.4, shift −1 0.7, tilt +1 0.0, tilt −1 1.9, nudge c 0.7, mirror x 0.6 |
| y = 1/3x + -25 | (1, 0, -4.644) | 4.5 = 2.5 + 1.5 + 0.5 | shift +1 0.6, shift −1 0.5, tilt +1 2.4, tilt −1 1.8, nudge c 2.3, mirror x 4.5 |
| y = 2x + 9 | (0, -0.5, -3) | 2.1 = 0.0 + 1.4 + 0.7 | shift +1 0.9, shift −1 2.5, tilt +1 4.7, tilt −1 6.6, nudge c 2.5, mirror x 2.1 |
row 10: from each climb's best line, a cheap move keeps 54% of the bits (median; worst 13%)
gate (greedy climber, 3115⚡):
- 7.4 bits for 18⚡ at -1,7,-9 (2, 0, -0.3626)
- 7.4 bits for 14⚡ at -1,3,9 (2, 0, -1.585)
- 7.4 bits for 34⚡ at 1,8,9 (2, 0, -0.1699)
- 8.8 bits for 31⚡ at -1,6,-27 (3, 0, -2.17)
