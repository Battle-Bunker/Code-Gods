# Integer value-function brainstorm

Research hypotheses, not shipping generator choices. Numerical claims must be checked before implementation.

Three concrete signed-32-bit families follow. These create structural alignment/disagreement, not complementary values or unrelated conditional rules.

**Crucial limitation:** with two players, U_A=U_B=ab. Opposite value changes are not opposing payoff incentives. Genuine conflict needs ≥3 players, asymmetric program costs, or external political objectives. For numerical multiplayer witnesses below, take a third player with v_C≡1: U_A=a(b+1), U_B=b(a+1), U_C=a+b. This neutral third is an illustrative environment, not a proposed interesting deity.

### 1. Prime abundance versus nonredundant factor diversity
For n=|x|≥2, let Ω(n) count prime factors with multiplicity and ω(n) count distinct prime factors:
 a=1−2^(−Ω), b=(1−2^(−ω))·ω/Ω.
Set a=b=0 for x∈{−1,0,1}. Factor |INT_MIN| using widened arithmetic. Both formulas are in [0,1].
• Cooperation: 2→6 adds a fresh prime; (a,b): (.5,.5)→(.75,.75). Pair payoff .25→.5625; three-player (U_A,U_B): (.75,.75)→(1.3125,1.3125).
• Conflict: 2→4 repeats a prime; (.5,.5)→(.75,.25). Pair payoff .25→.1875, so BOTH lose with two players. With C: (.75,.75)→(.9375,.4375); C’s payoff stays 1.
These regions arise from distinct-factor growth versus multiplicity growth, rather than arbitrary cases. For a constant third value c, the conflict is genuine when c>.25.
Degeneracies: sign and prime identities disappear; all primes look identical. Cheap constant exploit: return 223092870=2·3·5·7·11·13·17·19·23, giving a=b=511/512. This globally maximizes the two-player product (~.996098): ten distinct primes exceed the domain, and repeated factors incur the diversity penalty.

### 2. Binary occupancy versus alternation
For n=|x|>0, use its ordinary binary representation without leading zeros. Let L be length, h its number of ones, and t adjacent-bit transitions:
 a=h/L; b=t/(L−1) for L≥2, otherwise b=0.
Set both values to 0 at x=0. These are normalized densities, computable by bit operations; base 2 is a deliberate shared geometry.
• Cooperation: 4 (100)→9 (1001): (1/3,1/2)→(1/2,2/3). Pair product 1/6→1/3; multiplayer payoffs (.5,2/3)→(5/6,1).
• Conflict: 9 (1001)→19 (10011): (1/2,2/3)→(3/5,1/2). Pair product 1/3→.3; multiplayer payoffs (5/6,1)→(.9,.8). C falls from 7/6 to 1.1. Genuine conflict requires c>1/3.
Appending a one after zero can benefit both; appending after one increases occupancy but dilutes alternation. Thus the same simple transformation changes allegiance according to existing structure.
Degeneracies: sign symmetry; sensitivity to representation length; a single one has maximal occupancy but no alternation. Cheap constant exploit: return 5 (101), with (a,b)=(2/3,1), achieving the global two-player product maximum 2/3. Returning all ones maximizes A’s value but annihilates B’s.

### 3. Nearby cyclic preferences, not opposite residues
Let r=((x mod 12)+12) mod 12 and d(r,q)=min(|r−q|,12−|r−q|):
 a=1−d(r,0)/6; b=1−d(r,4)/6.
These are normalized triangular preferences on the SAME cycle, with centers separated by four rather than antipodal six. Zero is an ordinary residue; negative inputs use Euclidean modulo.
• Cooperation: −1→0 (residues 11→0): (5/6,1/6)→(1,1/3). Pair product 5/36→1/3; multiplayer payoffs (35/36,11/36)→(4/3,2/3).
• Conflict: 0→1: (1,1/3)→(5/6,1/2). Pair product 1/3→5/12, so BOTH benefit with two players despite A’s value declining. Multiplayer payoffs (4/3,2/3)→(5/4,11/12); C remains at 4/3. Genuine conflict requires c>1/2.
Shared slopes occur on parts of the cycle; between the centers, slopes oppose. This is overlapping geography, not CRT-style orthogonal predicates.
Degeneracies: period 12 erases magnitude; a+b is constant on residues 0…4. Cheap constant exploit: return 2, giving a=b=2/3 and the global pair-product maximum 4/9. With C present, A instead prefers residue 0 and B residue 4, illustrating genuine negotiation pressure.

**Design consequence:** all three are inexpensive to evaluate, but unrestricted pure T→T programs include constant functions. Any positive-probability deployment can overwrite random objects with a preferred representative, so rich local landscapes alone do not produce durable regional politics. Charge actual deployment/execution or overwrite costs, constrain allowable transformations, or reward input-dependent preservation if constant collapse is unwanted. Signed-32-bit boundaries also mean the illustrative arithmetic moves must be defined to stay in-domain. Program-cost conclusions depend on whether costs are per program, execution, or affected object; shared object payoff does not make those private costs shared.