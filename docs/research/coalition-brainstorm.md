# Coalition and generator brainstorm

Research hypotheses, not shipping generator choices. The resource-share example is future-type inspiration, not an MVP domain.

## Structural constraint
For two deities, **u₁(x)=u₂(x)=v₁(x)v₂(x)**. Opposed values do not produce opposed object payoffs. Conflicting deployment costs or external politics could, but those are additional mechanisms. Use three players, and distinguish **value conflict** from **payoff conflict** explicitly.

Below, each formula maps into [0,1]; payoff vectors always list (A,B,C). These are proximity/resource preferences, not exact complements or unrelated conditional branches.

## 1. Integer proximity wells
T=ℤ, with
v_A(n)=1/[1+((n+2)/2)²],
v_B(n)=1/[1+((n−2)/2)²],
v_C(n)=1/[1+(n/2)²].

The same A–B pair benefits from approaching their overlapping region from sufficiently distant tails, but trades off nearer their distinct ideals.

• **Cooperation:** −6→−4 raises all three values and changes payoffs (0.0318,0.0176,0.0259)→(0.1500,0.0700,0.1200).
• **Conflict:** 0→1 changes values (0.5,0.5,1)→(4/13,0.8,0.8), and payoffs (0.75,0.75,1)→(0.4923,0.8862,0.8862). Correction: the last component is 0.8862 because C and B share value 0.8 at n=1. Thus B and C gain against A, despite C's value falling.
• **Coalition reversal:** −1→0 changes payoffs (0.8862,0.4923,0.8862)→(0.75,0.75,1): B–C again gain against A. Conversely, 0→−1 favors A against B–C.

Important interpretation: the middle preference can fall while its payoff rises through a stronger partner. The center is not automatically its favorite payoff state.

## 2. Strings near overlapping prototypes
T=finite strings over {a,b,z}; let d be Levenshtein distance. Prototypes are p_A=aaaa, p_B=bbbb, p_C=aabb. Set
v_i(s)=1/[1+(d(s,p_i)/2)²].

• **Cooperation:** zzzzzzzz→zzzz reduces every distance from 8 to 4. Every value rises 1/17→1/5; every payoff rises 2/289≈0.0069→0.08.
• **Conflict:** aabb→abbb has exactly the value/payoff vectors of integer 0→1 above: A loses, B and C gain.
• **Opposite coalition:** aabb→aaab instead gives (0.8862,0.4923,0.8862): A and C gain against B.

The shared cleanup region and contested substitution region arise from the same edit-distance geometry. No extra “cooperate here” flag is needed. Caveats: edit-distance plateaus, equal-distance strings, cheap truncation, and long-string distributions that make cleanup dominate.

## 3. Concave resource shares
T={(a,b,c)∈ℚ³: a,b,c≥0; a+b+c=1}. Set v_A=√a, v_B=√b, v_C=√c. Square roots are computable to any specified tolerance; implementations need a declared numeric precision.

• **A–B cooperation against C:** (.25,.25,.50)→(.40,.40,.20) changes payoffs (0.6036,0.6036,0.7071)→(0.6828,0.6828,0.5657).
• **Same pair now conflicts:** (.40,.40,.20)→(.50,.30,.20) changes payoffs to (0.7035,0.6323,0.5612): A gains, B loses, C also loses.
• Permuting coordinates produces the other two-player coalitions naturally.

Avoid the tempting linear version v_i=x_i: since Σv=1, u_i=v_i(1−v_i), erasing dependence on how the other players divide their share. Concavity avoids that particular degeneracy.

## Pantheon of Friction: generator screening
For each generated triple, sample objects **and feasible program-induced transitions**, not merely correlations between value functions. Require:
1. The same named pair has substantial regions with both Δu positive and regions with opposing Δu signs.
2. At least two different winning coalitions, with a genuinely harmed third player somewhere.
3. Robust margins above numerical noise and deployment cost; persistence under nearby states/parameters.
4. Meaningful probability mass under the actual object distribution—not only astronomically distant tails.
5. Separate reporting of Δv and Δu, plus dominated states, plateaus, symmetry ties, constant outputs and short-program baselines.

Random application only scales opportunity; it does not create conflict. Repeated application also demands testing compositions and last-writer effects.

## Cheap agents and technical fluency
All three families permit constant programs. Integer constant 1 and string constant abbb yield (0.4923,0.8862,0.8862); their mirrored constants favor A. Resource constant (.40,.40,.20) favors A–B over equal shares. Identity can win when intervention is costly. Test constant outputs against the *current object distribution*, not just one witness. A selected program can overwrite every region, so regional friction need not survive unrestricted deployment.

These mechanics alone mostly test optimization, cost accounting and bargaining—not coding fluency. Unrestricted AI further weakens code authorship as evidence. To elicit technical fluency, reward demonstrated invariants, held-out distributions, resource-bounded transformations, adversarial counterexamples and explanations of failures. If constants are unacceptable, impose a substantive transformation-preservation contract rather than merely banning constant syntax.