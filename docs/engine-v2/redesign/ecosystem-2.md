# The game from inside a seat (thinker: ecosystem-2, 16 November 2026)

I read code and documents; I played nothing and simulated nothing. Labels: **[C]** true by construction (checkable in
the code or by arithmetic); **[O]** observed, with where and how narrowly; **[J]** my conjecture. The stories are things
that *can* happen in the beginner lines game as built, not forecasts. Every feeling is [J].

The setting [C]: 60 seconds of planning, then 600 seconds. Three lines at the start, five by the end. Each seat starts
with 130 energy, earns 4 a second, and can hold 960. The room gets 3 offers a second, shared between all agents in
proportion to energy held. The game ends at a known second, and the score is the board at that second.

## 1. Maya, 12, with an assistant

**Planning.** Her card, Prime Staircase: "The values y(0), y(1), y(2), … should begin with as many different primes
ending in 7 as possible." She presses "Summon my first agent"; the example for her rule appears, already written, for
about 45 energy [C].

**Minute 1.** Lines jump. The log shows each move's before and after, with no name on it [C]. On y = 2x + 11 she holds
1.86 bits and 13.6 points.

**Minute 2.** Somebody stretches that line to y = 6x + 33. Her points become 23.2 and she did nothing [O: one
hand-picked move priced on the real engine, in `map.md`]. Someone else's want made her richer. She cannot tell whose, or why.

**Minute 3.** Her agent leaves a note: another player has taken back its gains on line 2 three times [C: the starters
do this]. **Her first real decision.** Keep pulling, add line 2 to the agent's leave-alone list, or say something in
the room's chat. There is no right answer; it depends on who is on the other end, which she cannot see. She asks the
assistant. It has a tool that drafts a cooperation pitch [C]. She presses send. The interesting part was done for her.

**Minute 4.** The assistant mentions that y = 30x + 7 gives six primes ending in 7 (7, 37, 67, 97, 127, 157) [C:
arithmetic]. Getting there is about 32 unit steps, at least 140 energy, and the run breaks on the way; her starter
only takes moves that help at once, so it will never go [C]. The assistant rewrites it. She feels clever; the answer came from a formula.

**Minutes 5 to 8.** Her agent plays; she watches. About three moves a minute are hers [O: one power study]. Her store
fills. Nobody answers the chat. Boards of scripted starters stopped moving after about two minutes [O: a dozen
simulated games, no people]. Bored, perhaps.

**Last seconds.** Line 2 drops. Her standing falls. No name, no time to reply.

**To a friend:** "My robot played. A line tripled and I got points. Someone wrecked my best one at the end and I don't
know who."

## 2. Ali and Bea, against Cy

They sit side by side and talk aloud. The game's chat is public to the room, with no private messages [C], so the
alliance lives outside the game.

**Planning.** They read each other their cards: Ali has Prime Landing, Bea has Ruler.

**Minute 1.** The beginner game shows each player the *exact* sum of the others' bits [C]. On y = 6x + 33 Ali sees
10.46. Bea says "I have 8.60". So Cy has 1.86. They now know Cy's exact bits on every line, after every move [C].
Cy knows only that two people add up to something.

**Minutes 2 to 4.** Both assistants rewrite agents: leave each other's best lines alone, both lift line 1. Each
rewrite costs about 45 energy [C]. Then they are stuck: a line has one state, and their rules want it in slightly
different places.

**Minute 5. The decision with no right answer: what does "against Cy" mean?** On that line Ali earns 40.5, Bea 49.3,
Cy 23.2. If they push Cy to zero there, Ali and Bea each earn 33.3 [C: arithmetic]. They lose 7 and 16 points to take
23 from him. For rank it works; for points it costs. Or they farm him: keep Cy just interested enough to multiply
them. It turns on what they want from the afternoon, and on whether Cy will play with them again.

**Minute 6.** Cy's agent reports gains taken back. Cy types "who keeps moving line 2?" They can say anything; nothing
can be checked [C].

**Minutes 7 to 9.** What they earn from each other is one product, paid equally to both [C]. So which friend finishes
ahead is decided where Cy also scores, or where only one of them does. Each can see this.

**Last seconds.** Either friend can lower the other on a line where they themselves hold nothing, for the price of a
fee [C]. Whether they do is the story they tell.

**Cy, to a friend:** "It felt rigged. I still don't know what happened." Only the replay tells him, when it no longer
matters [C: ended games are fully open].

## 3. A frontier AI, playing to win

**Before the game.** It has the list of every rule that could be dealt (a built-in tool), the starters' source, and
the price list [C].

**Minutes 0 to 2.** Every log row gives a state and the exact sum of the two rules it does not know. It fits which two
rules from the list produce those sums. The built-in fitting tool is switched off when readings are exact [C], but
nothing stops it doing the sum itself. In the old game, exact sums made rule sets easy to identify [O: v1's own
experiment, per its notes]. Ladder rules such as Prime Staircase never change in a game; other families may have
their numbers redrawn every 120 seconds [C], which would mean fitting again. I expect it to have both rules by minute
2 [J].

**Minutes 2 to 8.** With all three rules known, each line is a search for states where its bits times the others' sum
is large, walked in small steps. With rules told, a formula once beat the state AI seats settled on by 139 times [O:
one case, `adversary.md`]. It hoards, because offers follow energy held [C]. In chat it proposes deals it will not
keep; a deal is kept only by editing one's own agent, which nobody else can see until the end [C].

**Last ten seconds.** With a full store of 960 it knocks every line where it holds little and a leader holds much, for
a fee of 9 to 18 each [C: fees as priced in `map.md`]. Nothing can be answered after the final second [C].

**What it cannot compute.** Which offers it gets (a lottery) [C]. Whether two humans are whispering. What another AI
like it does in the last ten seconds.

**Afterwards:** "I had the rules in ninety seconds. After that it was scheduling and a raffle."

## 4. The ledger

| Ecosystem: others' choices change what is good for me | Puzzle in an ecosystem's clothes |
|---|---|
| My points move when someone else moves, by the multiplication [C] | My own rule's good states come from a formula (y = 30x + 7) [C] |
| A line has one state, and others want it elsewhere [C] | The others' rules are drawn from a public list, mostly fixed, and readable from exact sums: a decoding problem, at which an AI beats a child [J] |
| Births bring new ground [C] | Once decoded, the game is one known objective to search [J] |
| A pair can form, and has a reason to crack at the end [C for the incentive] | The other inhabitants are mostly the same four starter scripts, which only take moves that help now, so the terrain they make is predictable [J] |
| Whom to believe, whether to farm or starve the third: no right answer [J] | The end is a known second: a timing problem [C] |

**The human advantage, in practice [J].** It is not finding states. It is judging people: who is paired, who is
bluffing, what is fair, when to forgive, what to reveal, which convention to start. Every one needs a *who*.

**What gives it room today [C].** The exact others' sum. The tug-of-war note. The leave-alone list. A chat. Friends in
a room. Open replays.

**What takes it away [C].** Moves carry no name while it matters. Nothing said can be checked. Promises live in code
nobody sees. Alliances can only be made outside the game. Planning comes before anyone knows anything about anyone.
A seat acts about thirty times in a game. The assistant writes the agent, reads the log and drafts the pitch. I found
no record that follows a player from game to game.

## 5. Five changes to what players see, say and build

None touches prices or scoring. Each is a guess [J].

1. **See: a move may be signed.** The mover chooses to put their name on a move, live. Thanks and grudges become
   possible, and silence becomes a signal. *Could be wrong:* the owner chose unsigned moves in v1 so that no move
   could be tied to one player's score jump; signing may become compulsory by pressure, and rules decode faster.
2. **Say: show, don't tell.** A player may reveal one true fact, stamped by the server: "my bits on line 3", or the
   card itself. Trust becomes a choice about what to show, to whom. *Could be wrong:* revealing may unravel (whoever
   stays hidden is presumed hostile), and with all rules shown the formula attack applies in full.
3. **Say: talk when there is something to talk about.** Move the minute of planning to after the first two minutes of
   play, or pause for thirty seconds at each birth. *Could be wrong:* AIs settle instantly, so the pause is dead time
   for them and a bell for everyone; children may hate the stop.
4. **Build: agents are public things with public promises.** Each agent has a name, an owner, and a visible
   leave-alone list. A deal is then something Cy can watch being kept. *Could be wrong:* the letter is kept and the
   spirit broken through a second agent; a public promise is a map for an attacker; it is one more mechanism.
5. **See, across games: last game's replay at this game's door.** Before play, each player's last game with these
   people: deals made, kept, broken. *Could be wrong:* fixed friendships become fixed alliances, which is a collapse of
   another kind; AI seats have no lasting self; a 12-year-old gets a record.

A dissonance: changes 1, 2 and 4 make people easier to read, which also makes the rules easier to decode. If secrecy
is the last defence against search, they hurt. My bet is the opposite: the secret is already weak (story 3), and
depth has to come from other minds.

## 6. What I could not see from here

- Any real game. Every feeling above is invented.
- Whether fitting two rules from exact sums really takes two minutes; I did not try it.
- The screen. I read schemas and tool lists, not the page; the cards may teach far more than I assume.
- How a 12-year-old divides attention between board, chat and assistant; what AI seats say in chat today.
- Locks: in the simulator, not the live game. A lock paid into by two players is itself a visible, joint, named
  thing, and may make changes 1 and 4 unnecessary.
- Whether the owner still wants what v1's notes say: "political negotiations about executable transformations", with
  the politics on a video call outside the game. If so, alliances living outside the game are intended, and my list
  should shrink to helping that call go well.
