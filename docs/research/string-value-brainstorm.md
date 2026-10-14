# String value-function brainstorm

Research hypotheses, not shipping generator choices. Numerical claims must be checked before implementation.

Three computable families for ASCII strings of length 0–128 follow. In each, the SAME pair has shared-improvement regions and tradeoff regions, without complementary utilities.

**Important incentive caveat.** With two deities, both receive exactly v₁(x)v₂(x). Thus “conflict” below means opposing changes in individual values—not opposing object-payoff incentives. Unequal deployment costs can create contribution disputes, but cannot change that equality. With more players, write S=Σ_{k≠1,2}vₖ: u₁=v₁v₂+Sv₁ and u₂=v₁v₂+Sv₂. Holding outsiders’ values fixed, increasing both values benefits everyone.

**1. Overlapping substring motifs.** For n=|x|, let Cₘ(x) count all occurrences of motif m, including overlapping occurrences. Define v₁=C_AB/max(1,⌊n/2⌋), v₂=C_BC/max(1,⌊n/2⌋). Both are in [0,1], since these two-letter motifs cannot overlap themselves; empty and one-character strings score zero.
• Cooperative repair: XXXXXX → ABCABC gives (0,0) → (2/3,2/3).
• Tradeoff: ABCABC → ABABAB gives (2/3,2/3) → (1,0).
The shared B lets AB and BC cooperate through ABC, while densely repeated AB crowds out BC: overlap and competition arise from the same construction.
Multiplayer: the tradeoff changes u₁ by S/3−4/9, so deity 1 benefits only when S>4/3; deity 2 loses. Outsiders each lose vₖ/3. Two-player product falls from 4/9 to zero, so neither rationally prefers this transformation on object payoff alone.
Degeneracy/exploit: short-length normalization creates spikes. Constant-output ABC gives (1,1), globally solving this pair. A long or sophisticated program is unnecessary.

**2. Periodicity with shared anti-collapse pressure.** Let a,b be counts of A,B; q=4ab/n² for n>0, otherwise zero. Let cℓ be the fraction of positions t≤n−ℓ with xₜ=xₜ₊ℓ, or zero when n≤ℓ. Set v₁=q c₂ and v₂=q c₃. All scores lie in [0,1]; other ASCII symbols dilute q.
• Cooperative repair: ABCDEF → AABBAB gives (0,0) → (1/4,2/3).
• Tradeoff: AABBAB → ABABAB gives (1/4,2/3) → (1,0). Conversely AABAAB gives (2/9,8/9), favoring lag 3.
Both favor repetition and a usable two-symbol vocabulary; disagreement emerges over the period, not an unrelated conditional. The common q prevents the trivial all-A solution.
Multiplayer: the displayed tradeoff changes u₁ by 3S/4−1/6, positive for S>2/9; deity 2 loses. Each outsider gains vₖ/12. Two-player product nevertheless falls from 1/6 to zero.
Degeneracies/exploits: short strings have missing-lag zeros; both correlations being perfect forces a constant string once n≥4, which q rejects. Nevertheless a cheap fixed periodic compromise is viable. Removing q immediately restores the all-A common maximizer.

**3. Shared grammar repair, conflicting global structure.** Let D be nonempty balanced-parenthesis strings (Dyck language), and P={w reverse(w): nonempty w over parentheses}, the even-length palindrome language. With unit-cost Levenshtein distance d, define v_D=1−d(x,D)/max(n,2), and analogously v_P; explicitly assign both zero to the empty string. Distances never exceed max(n,2), because each language contains a length-two word. Exact computation can enumerate target words of length ≤2n+2, or use grammar/edit-distance dynamic programming.
• Cooperative repair: XXXX → ()() gives (0,0) → (1,1/2).
• Tradeoff: ()() → ())( gives (1,1/2) → (1/2,1).
Both reward replacing garbage with parentheses; nesting/balance and mirror symmetry then disagree. These languages are disjoint but NOT complements: most ASCII strings belong to neither, and graded scores can rise together.
Multiplayer: the tradeoff leaves the pair product at 1/2, changes u_D by −S/2 and u_P by +S/2, and leaves outsiders unchanged. It is an actual payoff conflict precisely when S>0.
Degeneracies/exploits: normalization permits dilution of fixed edit defects in longer strings. Constants such as ()() or ())( cheaply select a compromise or coalition-favored endpoint; empty output is not rewarded.

**Fundamental limitation:** locality of these tradeoffs does not itself induce sophisticated agents. Output-only rewards on a finite domain permit a constant x* maximizing a deity’s payoff against the fixed roster. Random targets merely weight the regions; they do not defeat constant overwrite. Unrestricted AI strengthens this optimization route. Any desired resistance needs an explicit overwrite/length budget, input-preservation cost, target-dependent reward, or changing roster—not a claim that the value families alone solve it.