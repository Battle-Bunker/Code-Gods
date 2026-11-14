# Brief: linear equations, representations, and scoring by perturbation (14 November 2026)

This file is the shared brief for several independent brainstorming sessions. Some of them work WITHOUT the code
("clean room") and must not read anything in the repository except this folder. It therefore describes the game
abstractly and completely enough to design against.

## 1. The owner's request, verbatim

> I want you start work on a new object type: linear equations. My goal with this game is that it can teach technical
> skills starting from a junior level and linear equations are about the right grade for the age of kids I want to
> start the program with. I want to launch right into demonstrating how the game can motivate and elicit skill in a
> junior technical domain even when frontier AI is fully available.
> The kinds of utility functions I'm imagining would be like:
>  * Minimise the distance of the gradient to the nearest prime
>  * Maximise the area of the triangle formed with the origin
>  * Minimise the difference between m and c
>  * minimise the difference between y(k) and x(q) where k and q are configurable substitutions for x and y respectively.
>
> I want to lean into conveying the intuition of objects having multiple representations with this object type and
> define different utility functions that are best understood wrt different representations. So we want rules that
> operate wrt a Cartesian plane and y=mx+c and ay+bx+c=0 and other metaphors like growth patterns or such. You'll be
> better at coming up with a wide diversity of representations isomorphic to a linear equation than me. Get some
> serious brainstorming happening on this and on devising a diversity of utility functions anchored to each.
> We probably need to generalise our scoring system to cater to this object type given that it's an infinite set. I
> think we should lean more into scoring the value of a state in terms of expectation that cost-weighed perturbations
> move the object to a higher versus lower utility. I sense that that lens generalises better to infinite state
> spaces where trying to measure absolute rareness of a state doesn't. Is that right? Is our scoring system within
> reach of abandoning the need to measure absolute probabilities of a state being obtained and depending only on
> impact of perturbations? That would be better for ensuring that we robustly integrate the practical relevance of
> our mutator costing decisions as well.
> We'll need to design a principled set of mutators for linear equations that works given the variety of
> representations they could operate over. I think it's fine for mutators to be dependent on one or more
> representations. One of the dimensions of skill in authoring agents will be to take advantage of rotating between
> lenses to find lower cost paths from state a to b. Such lens choices are essential for mathematical reasoning and
> indeed problem solving more generally. It's totally fine for a state shift to cost much more with one mutator than
> another but we need a principled way to cater to that reality in scoring the objective value of states. I think
> empirical simulation of a sequence of random mutations of a given expected cost would be principled. I'd like your
> thoughts about this.
> I also want to generalise annotations further. A utility function may depend on one or more representation. Each
> dependent representation should be shown in parallel in object expanded visualisations and I think we need each
> utility function to specify a single primary representation from the relevant ones to show in compact contexts.
> Each representation needs to enumerate its elements with a single API for defining both utility functions and
> visual annotations in terms of. For example, y=mx+c needs elements for every pronumeral and and coefficient. The
> Cartesian plane representation needs elements for X and Y intercepts, area with origin, angles with each axis,
> lengths of right triangle sides, and the capacity to create dynamic elements in terms of one's utility function's
> parameters, like the point at x=q or y=k. For a rule like Y intercept being close to a prime we would want to show
> primes on the y axis near the current y intercept and the distance to each.
>
> I want multiple brainstorming agents to think about architecture for configuring the representation elements API
> in a very general purpose way that applies for this linear equations use case and potentially for a more general
> set of mathematical expressions, equations or systems of equations or other object types like chemical formulas or
> force diagrams in addition to obviously extending naturally to the other object types we already have.
> do not let yourself be attached to architectural decisions that have already been made. ensure some brainstorming
> occurs with only a detailed but abstract description of the requirements of our API without access to the code
> that has already been written. if significant refactoring or pretty much starting over with the code for this game
> engine is warranted I'll be happy to spend the tokens on that to get to a cleaner and more future proof
> architecture for the longer term vision now.

The owner's standing taste: principled, information-theoretic, one-sentence rules; they dislike patches that add
complexity; a beginner's first game must be simple; careful, coordinating play should be rewarded over spoiling.

## 2. The game, abstractly (no code)

- **Players** ("gods") share a **world** of **objects** of one **object type** per room. Today's types: a small grid
  of digits (optionally coloured), an integer, a string, a hand of playing cards. Objects are born at random during
  the game; a typical game has tens of objects and lasts minutes.
- Each player is privately dealt one **rule**: a **utility function** from an object's state to a **rule score**,
  which is a short tuple compared lexicographically (primary first, then tie-breakers). Rules come from **rule
  families** with **parameters** (for example "opposite cells sum to x"); a dealt rule is a family plus parameter
  values. Some families have an optional harder **tier** that only counts once the base is satisfied.
- Players do not move objects by hand. They write **agents**: small programs (Python or TypeScript, sandboxed) that
  are repeatedly offered an object, may **read** it, compute freely, and may commit **mutations**. Reading and
  mutating cost **energy**, which a player's agents earn over time in proportion to the **power** the player assigns
  them. Mutations are priced in bits by how much they specify (which part, and how far it moved); reading is much
  cheaper than changing. An AI assistant can help a player write agents.
- **Scoring today.** A rule score is converted into **bits of rarity**: minus log2 of the probability that a
  uniformly random state of that object type scores at least as well under that rule (computed by exact enumeration
  or a calibrated law, stored as tables). A player's points for an object are their own bits times a measure of the
  other players' bits for the same object, summed over objects. So a player gains by making objects rare for
  themselves while leaving them valuable to others. This depends on a finite state space with a natural uniform
  measure.
- **Annotations.** Each rule family supplies, besides its utility function, a visual explanation drawn on the
  object: which parts count ("units"), what each contributes, what the nearest improvement is. The same description
  is used on a compact card (goal card, object list) and in an expanded view, in TypeScript for the app and mirrored
  in Python for agents' helper libraries. Today this is written per family against the one concrete shape of the
  object (cells of a grid, cards of a hand).
- **What a player sees:** their goal card (rule in words plus a worked example), the list of objects with their own
  points per object, a log of what their agents did and why points moved, a leaderboard, and a replay.
- **Constraints that any design must respect:** everything about an object's value must be computable
  deterministically and identically on the server, in the browser and in both agent languages; a game is replayable
  from its event log; the per-object data a client subscribes to must stay small; rules are private while a game is
  live; the first minutes must be understandable by a non-programmer.

## 3. What is being asked for

A. **Representations of a linear equation**: as many genuinely different, isomorphic (or usefully near-isomorphic)
   views as possible (slope-intercept, general form, Cartesian picture, intercept form, point-slope, two points,
   table of values, growth pattern / sequence, rate and starting amount, balance scale, function machine, vector
   and normal forms, and others), each with its **elements** (named, addressable parts and derived quantities), and
   for each a diversity of **utility-function families** that are most naturally understood in that view, with
   parameters, tie-breakers, and what a junior learner would have to understand to do well.
B. **Mutators** for linear equations: a principled set, each tied to one or more representations, with a cost
   function in bits; examples of state changes that are cheap in one view and dear in another; what number domain
   the object lives in (integers, rationals, bounds), what "the same object" means (the line, or the written
   equation), and how degenerate cases (vertical, horizontal, through the origin) are handled.
C. **Scoring without absolute rarity**: a precise proposal for valuing a state through cost-weighted random
   perturbation, with its properties, failure modes, how it is computed deterministically, how it stays comparable
   across rules and object types, how it relates to today's rarity on finite types, and how "points = own value
   times others' value" carries over.
D. **A general representation-elements API**: one way to declare, for any object type, its representations, their
   elements (static and parameter-dependent "dynamic" elements), utility functions over elements, annotations over
   the same elements (compact primary representation, parallel expanded representations), mutators per
   representation, and costs; general enough for expressions, equations, systems of equations, chemical formulas,
   force diagrams, and the existing grid, integer, string and card types.
