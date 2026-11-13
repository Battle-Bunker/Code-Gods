### Mixed tables on develop

`mixed`: 3 gods, 24 games per table, 300 s, 1 agent(s) per god.

| table | win share / points, per god of each policy | welfare | acts/s by slot | skips | bits destroyed per change |
|---|---|---|---|---|---|
| cooperator, cooperator, deny | cooperator 6% / 16474; deny 88% / 24377 | 57325 | 8.0 / 8.0 / 7.0 | 84% / 84% / 74% | 0.1 / 0.1 / 3.3 |
| deny, payoff, payoff | deny 79% / 27925; payoff 10% / 23564 | 75053 | 6.1 / 6.8 / 6.7 | 41% / 50% / 49% | 3.5 / 1.1 / 1.3 |
| greedy, payoff, payoff | greedy 67% / 34775; payoff 17% / 31629 | 98033 | 8.1 / 7.3 / 7.3 | 71% / 66% / 66% | 1.7 / 1.2 / 1.4 |
| deny, deny, deny | deny 33% / 3864 | 11592 | 3.8 / 3.7 / 3.8 | 9% / 8% / 9% | 2.0 / 2.3 / 2.3 |
| deny, greedy, random | deny 4% / 6225; greedy 96% / 6445; random 0% / 993 | 13663 | 4.3 / 6.0 / 4.7 | 16% / 37% / 10% | 0.7 / 0.3 / 4.4 |
| random, random, random | random 33% / 230 | 689 | 4.6 / 4.6 / 4.6 | 10% / 10% / 10% | 0.6 / 0.6 / 0.6 |
| considerate, considerate, considerate | considerate 33% / 10379 | 31136 | 8.0 / 8.0 / 8.0 | 95% / 95% / 95% | 0.0 / 0.0 / 0.0 |
| defender, defender, deny | defender 27% / 16004; deny 46% / 17164 | 49172 | 5.1 / 4.9 / 4.5 | 23% / 21% / 16% | 1.1 / 1.4 / 3.6 |
