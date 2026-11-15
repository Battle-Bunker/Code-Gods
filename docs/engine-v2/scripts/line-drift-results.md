# Drift trial and gradient-lens variants (raw output)

## dt1


## Drift trial (1): fixed parameters under the beginner economy (8 ⚡/s, 600 at start, cap 1,920), 24 objects

table 1 (3 seats), 300 s: F 2380→2803→2803→2819→2819→2842; objects moved in the last third 0.13; moves 705; idle seconds in the last third 0; seat bits max/min 1.4
table 1 (3 seats), 600 s: F 2803→2819→2842→2819→2842→2819; objects moved in the last third 0.13; moves 1368; idle seconds in the last third 0; seat bits max/min 1.4
table 2 (3 seats), 300 s: F 936→936→936→936→936→936; objects moved in the last third 0.13; moves 900; idle seconds in the last third 0; seat bits max/min 1.3
table 2 (3 seats), 600 s: F 936→936→936→936→1411→1394; objects moved in the last third 0.75; moves 1773; idle seconds in the last third 0; seat bits max/min 1.2
table 3 (3 seats), 300 s: F 1161→1161→1161→1161→1161→1161; objects moved in the last third 0.08; moves 900; idle seconds in the last third 0; seat bits max/min 1.2
table 3 (3 seats), 600 s: F 1161→1161→1161→1161→1161→1161; objects moved in the last third 0.08; moves 1800; idle seconds in the last third 0; seat bits max/min 1.2
table 4 (4 seats), 300 s: F 2493→2470→2662→2662→2623→2623; objects moved in the last third 0.17; moves 1200; idle seconds in the last third 0; seat bits max/min 1.8
table 4 (4 seats), 600 s: F 2470→2662→2623→2657→3310→3264; objects moved in the last third 0.75; moves 2381; idle seconds in the last third 0; seat bits max/min 2.1
table 5 (4 seats), 300 s: F 1265→1265→1265→1265→1265→1265; objects moved in the last third 0.08; moves 1200; idle seconds in the last third 0; seat bits max/min 1.8
table 5 (4 seats), 600 s: F 1265→1265→1265→1265→1265→1265; objects moved in the last third 0.08; moves 2400; idle seconds in the last third 0; seat bits max/min 1.8
table 6 (4 seats), 300 s: F 2438→3553→3563→3502→3308→3783; objects moved in the last third 0.54; moves 1195; idle seconds in the last third 0; seat bits max/min 1.7
table 6 (4 seats), 600 s: F 3553→3502→3783→3954→4214→4255; objects moved in the last third 0.33; moves 2347; idle seconds in the last third 0; seat bits max/min 1.9

## Drift trial (2): 600 s game, 8 ⚡/s, few objects; qualifier value redrawn within its family every I seconds

| table | objects | interval | F at 100 s steps | objects moved in the last 200 s | share of bits lost at a redraw (mean) | seat bits max/min |
|---|---|---|---|---|---|---|
| 1 (3 seats) | 3 | off | 286→286→286→286→286→286 | 0.33 | – | 2.4 |
| 1 (3 seats) | 3 | 50 | 233→348→348→322→447→403 | 1.00 | 0.59 | 1.4 |
| 1 (3 seats) | 3 | 120 | 286→236→546→184→337→337 | 1.00 | 0.62 | 3.1 |
| 1 (3 seats) | 3 | 240 | 286→286→233→233→637→637 | 1.00 | 0.71 | 2.8 |
| 1 (3 seats) | 5 | off | 619→619→619→619→619→619 | 0.00 | – | 2.2 |
| 1 (3 seats) | 5 | 50 | 611→459→604→1707→857→841 | 1.00 | 0.40 | 1.2 |
| 1 (3 seats) | 5 | 120 | 619→686→608→515→647→733 | 1.00 | 0.44 | 1.5 |
| 1 (3 seats) | 5 | 240 | 619→619→632→686→782→700 | 1.00 | 0.57 | 1.3 |
| 2 (3 seats) | 3 | off | 197→216→216→216→208→208 | 0.33 | – | 1.9 |
| 2 (3 seats) | 3 | 50 | 218→262→168→202→141→116 | 1.00 | 0.35 | 2.3 |
| 2 (3 seats) | 3 | 120 | 197→193→147→265→167→161 | 1.00 | 0.34 | 1.1 |
| 2 (3 seats) | 3 | 240 | 197→216→170→203→176→176 | 1.00 | 0.31 | 1.7 |
| 2 (3 seats) | 5 | off | 295→303→303→303→303→303 | 0.20 | – | 3.1 |
| 2 (3 seats) | 5 | 50 | 520→371→312→305→412→328 | 1.00 | 0.33 | 3.9 |
| 2 (3 seats) | 5 | 120 | 295→520→439→379→311→351 | 1.00 | 0.40 | 1.7 |
| 2 (3 seats) | 5 | 240 | 295→303→520→518→414→414 | 1.00 | 0.25 | 7.8 |
| 3 (3 seats) | 3 | off | 240→240→240→240→240→240 | 0.33 | – | 2.1 |
| 3 (3 seats) | 3 | 50 | 363→340→254→381→466→362 | 1.00 | 0.41 | 2.9 |
| 3 (3 seats) | 3 | 120 | 240→363→366→340→229→163 | 1.00 | 0.47 | 3.0 |
| 3 (3 seats) | 3 | 240 | 240→240→363→363→366→366 | 0.67 | 0.40 | 2.1 |
| 3 (3 seats) | 5 | off | 360→360→360→360→360→360 | 0.20 | – | 2.2 |
| 3 (3 seats) | 5 | 50 | 506→878→669→452→714→526 | 1.00 | 0.49 | 1.6 |
| 3 (3 seats) | 5 | 120 | 360→506→537→578→610→610 | 1.00 | 0.53 | 2.9 |
| 3 (3 seats) | 5 | 240 | 360→360→506→506→512→520 | 1.00 | 0.52 | 7.1 |
| 4 (4 seats) | 3 | off | 719→678→703→762→763→739 | 1.00 | – | 1.5 |
| 4 (4 seats) | 3 | 50 | 436→400→290→419→395→697 | 1.00 | 0.27 | 1.7 |
| 4 (4 seats) | 3 | 120 | 719→527→454→405→372→372 | 1.00 | 0.33 | 2.5 |
| 4 (4 seats) | 3 | 240 | 719→678→549→527→423→467 | 1.00 | 0.31 | 1.7 |
| 4 (4 seats) | 5 | off | 608→725→1050→1014→1100→1100 | 0.20 | – | 1.4 |
| 4 (4 seats) | 5 | 50 | 550→555→976→766→828→489 | 1.00 | 0.36 | 7.5 |
| 4 (4 seats) | 5 | 120 | 608→550→762→555→983→983 | 1.00 | 0.37 | 1.3 |
| 4 (4 seats) | 5 | 240 | 608→725→661→590→675→836 | 1.00 | 0.50 | 2.0 |
| 5 (4 seats) | 3 | off | 320→302→302→302→302→302 | 1.00 | – | 2.5 |
| 5 (4 seats) | 3 | 50 | 581→493→570→592→662→652 | 0.67 | 0.20 | 1.4 |
| 5 (4 seats) | 3 | 120 | 320→697→256→463→589→589 | 1.00 | 0.18 | 2.6 |
| 5 (4 seats) | 3 | 240 | 320→302→616→616→265→265 | 0.67 | 0.44 | 2.2 |
| 5 (4 seats) | 5 | off | 696→696→696→696→696→696 | 0.40 | – | 2.9 |
| 5 (4 seats) | 5 | 50 | 856→787→696→814→660→818 | 1.00 | 0.26 | 2.1 |
| 5 (4 seats) | 5 | 120 | 696→644→567→757→725→725 | 1.00 | 0.35 | 1.5 |
| 5 (4 seats) | 5 | 240 | 696→696→447→447→542→622 | 1.00 | 0.36 | 1.5 |
| 6 (4 seats) | 3 | off | 508→561→567→567→567→567 | 0.33 | – | 1.9 |
| 6 (4 seats) | 3 | 50 | 1072→837→575→1005→434→575 | 1.00 | 0.41 | 3.1 |
| 6 (4 seats) | 3 | 120 | 508→1044→928→1045→674→686 | 1.00 | 0.29 | 1.5 |
| 6 (4 seats) | 3 | 240 | 508→561→1163→1148→1008→1039 | 1.00 | 0.35 | 10.5 |
| 6 (4 seats) | 5 | off | 704→704→704→704→704→704 | 0.40 | – | 2.8 |
| 6 (4 seats) | 5 | 50 | 934→1180→1204→1629→2707→1898 | 1.00 | 0.46 | 3.5 |
| 6 (4 seats) | 5 | 120 | 704→2025→1252→1853→1597→1619 | 1.00 | 0.47 | 2.7 |
| 6 (4 seats) | 5 | 240 | 704→704→1035→2260→1589→1632 | 1.00 | 0.56 | 6.9 |

## dt2


## Drift trial (1): fixed parameters under the beginner economy (8 ⚡/s, 600 at start, cap 1,920), 24 objects

table 1 (3 seats), 300 s: F 2542→4092→4086→4086→4086→4086; objects moved in the last third 0.08; moves 883; idle seconds in the last third 0; seat bits max/min 1.1
table 1 (3 seats), 600 s: F 4092→4086→4086→4086→4086→4086; objects moved in the last third 0.08; moves 1783; idle seconds in the last third 0; seat bits max/min 1.1
table 2 (3 seats), 300 s: F 1128→1128→1128→1128→1128→1128; objects moved in the last third 0.08; moves 900; idle seconds in the last third 0; seat bits max/min 1.7
table 2 (3 seats), 600 s: F 1128→1128→1128→1128→1128→1284; objects moved in the last third 0.29; moves 1800; idle seconds in the last third 0; seat bits max/min 2.1
table 3 (3 seats), 300 s: F 3215→4124→4220→4290→4297→4297; objects moved in the last third 0.17; moves 806; idle seconds in the last third 0; seat bits max/min 2.9
table 3 (3 seats), 600 s: F 4124→4290→4297→4295→4297→4295; objects moved in the last third 0.13; moves 1543; idle seconds in the last third 0; seat bits max/min 2.9
table 4 (4 seats), 300 s: F 2577→2577→2577→2577→2577→2577; objects moved in the last third 0.13; moves 1200; idle seconds in the last third 0; seat bits max/min 1.3
table 4 (4 seats), 600 s: F 2577→2577→2577→2577→2577→2577; objects moved in the last third 0.13; moves 2400; idle seconds in the last third 0; seat bits max/min 1.3
table 5 (4 seats), 300 s: F 1571→1571→1571→1571→1571→1571; objects moved in the last third 0.08; moves 1200; idle seconds in the last third 0; seat bits max/min 1.4
table 5 (4 seats), 600 s: F 1571→1571→1571→1571→1571→1571; objects moved in the last third 0.08; moves 2400; idle seconds in the last third 0; seat bits max/min 1.4
table 6 (4 seats), 300 s: F 2078→2078→2078→2400→2983→2983; objects moved in the last third 0.50; moves 1200; idle seconds in the last third 0; seat bits max/min 1.5
table 6 (4 seats), 600 s: F 2078→2400→2983→2983→2983→2983; objects moved in the last third 0.13; moves 2400; idle seconds in the last third 0; seat bits max/min 1.5

## Drift trial (2): 600 s game, 8 ⚡/s, few objects; qualifier value redrawn within its family every I seconds

| table | objects | interval | F at 100 s steps | objects moved in the last 200 s | share of bits lost at a redraw (mean) | seat bits max/min |
|---|---|---|---|---|---|---|
| 1 (3 seats) | 3 | off | 428→428→428→428→428→428 | 0.33 | – | 3.0 |
| 1 (3 seats) | 3 | 50 | 370→549→600→341→393→747 | 1.00 | 0.39 | 4.8 |
| 1 (3 seats) | 3 | 120 | 428→317→225→349→406→406 | 1.00 | 0.43 | 2.8 |
| 1 (3 seats) | 3 | 240 | 428→428→317→317→225→225 | 1.00 | 0.54 | 1.5 |
| 1 (3 seats) | 5 | off | 733→723→751→773→773→797 | 0.80 | – | 1.3 |
| 1 (3 seats) | 5 | 50 | 923→830→750→657→943→628 | 1.00 | 0.49 | 1.2 |
| 1 (3 seats) | 5 | 120 | 733→783→842→745→899→895 | 1.00 | 0.46 | 3.2 |
| 1 (3 seats) | 5 | 240 | 733→723→942→953→612→612 | 0.80 | 0.53 | 3.0 |
| 2 (3 seats) | 3 | off | 119→119→149→149→149→149 | 0.00 | – | 2.3 |
| 2 (3 seats) | 3 | 50 | 124→193→145→263→328→289 | 1.00 | 0.46 | 2.2 |
| 2 (3 seats) | 3 | 120 | 119→124→317→193→182→253 | 1.00 | 0.56 | 2.7 |
| 2 (3 seats) | 3 | 240 | 119→119→129→129→135→135 | 1.00 | 0.55 | 4.2 |
| 2 (3 seats) | 5 | off | 202→217→217→217→202→217 | 0.40 | – | 2.9 |
| 2 (3 seats) | 5 | 50 | 447→410→424→548→552→976 | 1.00 | 0.45 | 2.0 |
| 2 (3 seats) | 5 | 120 | 202→447→812→392→618→640 | 1.00 | 0.53 | 1.4 |
| 2 (3 seats) | 5 | 240 | 202→217→447→448→812→812 | 1.00 | 0.62 | 1.4 |
| 3 (3 seats) | 3 | off | 635→635→635→635→635→635 | 0.00 | – | 4.2 |
| 3 (3 seats) | 3 | 50 | 415→313→927→915→389→458 | 1.00 | 0.23 | 2.7 |
| 3 (3 seats) | 3 | 120 | 635→415→941→313→540→540 | 1.00 | 0.28 | 3.2 |
| 3 (3 seats) | 3 | 240 | 635→635→415→415→941→941 | 1.00 | 0.23 | 2.6 |
| 3 (3 seats) | 5 | off | 1251→1251→1251→1251→1251→1251 | 0.20 | – | 2.3 |
| 3 (3 seats) | 5 | 50 | 1138→896→985→825→714→1308 | 1.00 | 0.24 | 2.0 |
| 3 (3 seats) | 5 | 120 | 1251→1046→2273→848→1293→1293 | 1.00 | 0.26 | 2.8 |
| 3 (3 seats) | 5 | 240 | 1251→1251→1111→1145→2429→2451 | 1.00 | 0.21 | 3.2 |
| 4 (4 seats) | 3 | off | 514→514→514→514→514→514 | 0.33 | – | 12.7 |
| 4 (4 seats) | 3 | 50 | 426→457→530→715→774→290 | 1.00 | 0.44 | 2.7 |
| 4 (4 seats) | 3 | 120 | 514→684→741→737→675→675 | 1.00 | 0.53 | 3.5 |
| 4 (4 seats) | 3 | 240 | 514→514→603→603→1020→1020 | 1.00 | 0.56 | 2.6 |
| 4 (4 seats) | 5 | off | 833→948→948→948→1185→1185 | 0.80 | – | 2.6 |
| 4 (4 seats) | 5 | 50 | 987→946→1055→797→1041→732 | 1.00 | 0.42 | 1.6 |
| 4 (4 seats) | 5 | 120 | 833→1020→1023→844→1186→1185 | 1.00 | 0.47 | 2.2 |
| 4 (4 seats) | 5 | 240 | 833→948→1069→1086→617→1128 | 1.00 | 0.47 | 2.4 |
| 5 (4 seats) | 3 | off | 518→633→518→518→518→518 | 1.00 | – | 9.5 |
| 5 (4 seats) | 3 | 50 | 480→659→840→959→1187→710 | 1.00 | 0.17 | 2.5 |
| 5 (4 seats) | 3 | 120 | 518→522→854→749→664→804 | 1.00 | 0.19 | 2.5 |
| 5 (4 seats) | 3 | 240 | 518→633→477→477→686→686 | 1.00 | 0.19 | 8.3 |
| 5 (4 seats) | 5 | off | 527→527→527→527→527→527 | 0.40 | – | 1.4 |
| 5 (4 seats) | 5 | 50 | 713→986→1186→1759→881→1144 | 1.00 | 0.15 | 4.5 |
| 5 (4 seats) | 5 | 120 | 527→722→609→1040→794→874 | 0.80 | 0.18 | 2.3 |
| 5 (4 seats) | 5 | 240 | 527→527→539→539→671→679 | 0.80 | 0.12 | 2.1 |
| 6 (4 seats) | 3 | off | 816→811→811→811→811→811 | 0.33 | – | 2.9 |
| 6 (4 seats) | 3 | 50 | 618→618→701→646→394→696 | 1.00 | 0.34 | 2.3 |
| 6 (4 seats) | 3 | 120 | 816→670→685→797→736→736 | 1.00 | 0.29 | 2.5 |
| 6 (4 seats) | 3 | 240 | 816→811→400→400→440→440 | 0.33 | 0.44 | 2.7 |
| 6 (4 seats) | 5 | off | 938→938→938→938→938→938 | 0.20 | – | 1.6 |
| 6 (4 seats) | 5 | 50 | 1243→1481→1057→1437→1114→1884 | 1.00 | 0.32 | 1.6 |
| 6 (4 seats) | 5 | 120 | 938→1243→1495→1481→1442→1474 | 1.00 | 0.31 | 2.7 |
| 6 (4 seats) | 5 | 240 | 938→938→1243→1243→1495→1495 | 1.00 | 0.23 | 1.7 |

