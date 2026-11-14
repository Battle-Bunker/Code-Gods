# Design explorations: what to try, and where

Every setup and variant the owner can try, with where to find it. Every line was checked against the code on `develop`
(`lib/game-core/src/settings.ts`) or against the merged pull request named. The decisions taken without waiting for the
owner, with their reasons and alternatives, are logged in [`docs/judgment-calls.md`](judgment-calls.md) (#337).

**What to try first.** Open a new room on the dev deployment. It starts on **Annotated basics**. Press "Play a
practice game" to fill the empty seats with Practice partners, then "Summon my first agent".

**How to reach each kind.**
- **Ordinary setups:** the room's **Setup** picker.
- **Lab setups** (administrators only): the same picker, in the **Lab** group at the end (or type `lab`).
- **Open drafts:** add the label `preview` to the pull request. This gives it its own Convex preview
  (`docs/preview-deployments.md`); sign in with the passphrase and pick a test player ("Ada Admin" sees the Lab).

## What is now default on Annotated basics

A 4×4 board of numbers, no colour, the eight beginner rules (`docs/beginner-pool.md`), 60 s of planning.

| What | Since | One line |
|---|---|---|
| Distance pricing | #277 | A change costs by how far each number moves (`costModel: "distance-v1"`); other setups keep the flat price. |
| Free looking | #310 | `observation: "free"`: every object is shown as it changes. Paid looks are their own setup (below). |
| 600 starting energy | #307 | Every Grid setup starts each player with 600, so a first agent is payable during planning. |
| Energy and debt move with power | #305, #320 | Debt is capped at a full store. What an account holds or owes beyond its power goes where the power goes: a re-allocation loses nothing. |
| Atomic replace | #318, #321 | Replacing an agent's program is one command, for the new program's summon price; the agent's account is kept. |
| First-agent share about 70% | #321, #340 | "Summon my first agent" gives it about 70% of the power (aiming for 75%, capped so the dearest starter stays payable). Practice partners summon on the same terms. |
| Score noise off | `peerNoiseBits: 0` | Live totals no longer read high and then drop at the end. |
| Rule rotation across replays | #326, #335 | When the same players play again with the same settings, each rule passes one seat along. Each player holds each rule once, with a running total. Off when there is a bid phase. |
| Practice partners for everyone | #335, #338 | A built-in seat with no language model and no cost. It summons its rule's example agent once. Any signed-in player can seat one; model-backed AI seats stay admin-only. |

## Ordinary setups (everyone's Setup picker)

| Setup | One line |
|---|---|
| **Annotated basics** | The default, above. |
| **Basics with bidding** (#287) | As Annotated basics. First each player has 45 s to bid part of their score for the rule they want, or pass. |
| **Basics with paid looks** (#284, #312) | As Annotated basics, but you see each board as you last saw it; a fresh look costs energy. |
| **Tiered rules** (#286, #314) | Annotated basics' board and economy. Each rule has an easy base and a ★ bonus that opens at a gate. Dealt families: Opposite Nines, Mirrormancer, Kings and Subjects, Two Pair, Crosswise Threes (`docs/tiered-rules.md`). |
| **Annotated colours** | Every rule, with explanations, on a small coloured board. |
| **First steps**, **Classic**, **Low income**, **Big board**, **Master** | The older boards: 4×4 coloured, 5×5 standard, 5×5 at half power, 6×6 hex, 7×7 cards. |

## Lab setups (administrators only)

| Lab setup | One line |
|---|---|
| Lab · flat price | Annotated basics with the old flat price: every changed number costs the same. |
| Lab · dial numbers | 9 and 0 are one step apart, and a step either way costs the same. |
| Lab · gentle distance | A far move costs only a little more than a middling one. |
| Lab · multiply and divide | Adds, plus multiply and divide by the last digit; a move costs the cheaper route. |
| Lab · everything always visible | Equals today's default (kept so that no stored setup disappears). |
| Lab · boards always visible | Every board is live; only the others' interest in it is as you last saw it. |
| Lab · only agents can look | You cannot pay to look: only your agents' changes and complete reads show the world. |
| Lab · bidding, second price | Basics with bidding, but a winner pays the highest bid they beat. |
| Lab · bidding, open bids | Every player sees every bid as it is placed. |
| Lab · bidding, handicaps shown | Everyone sees each player's handicap during the game. |
| Lab · bidding, auction shown | Everyone sees every bid and who won which rule. |
| Lab · tiers without a gate | The ★ bonus counts from the first move. |
| Lab · unlocking tiers | Once unlocked, the ★ bonus outranks the rest of the base. |
| Lab · two ★ tiers | Each rule has two ★ bonuses; the second breaks ties on the first. |
| Lab · tiers with unequal reach | ★ bonuses outside the balance band added: some rules reach much further. |

## Open variant drafts

| PR, branch | What it is | Status |
|---|---|---|
| #290 `variant/capacity-keep-rate-cap` | Keep the limit of 4 turns per second per agent. | Draft, "not for merge"; based on develop of 11 Nov. |
| #291 `variant/exposure-free` | A turn costs nothing unless the agent reads or changes. | Draft, "not for merge"; based on develop of 11 Nov. |
| #292 `variant/debt-within-capacity`, #293 `variant/no-credit` | Debt capped at what an agent can hold; or no credit at all. | Superseded by #305, which merged the debt cap. Still open as drafts, kept for reference. |
| #295 `claude/coordination-break-cost` | "Breaking costs extra": a change pays for the bits of the object's value it destroys (room setting `breakCost`). | Draft, "do not merge". In simulation, at 3 bits of work per bit destroyed, spoiling is never a best response (`docs/coordination-incentives.md` §4). |
| #299 `variant/cost-proportional` | A change's cost strictly proportional to distance, no charge for choosing the cell. | Draft variant; slowest and least even of the pricings measured. |
| #300 `variant/cost-int-string-unverified` | Distance pricing for Int and string rooms. | Draft, "unverified, unfinished". |
| #324 `claude/tier-check-mid` | Checks tiered tables between the gate and the top. 6 of 75 checks exceed the 1-bit bound (worst 2.16 bits, Opposite Nines). | Draft, "not reviewed, not to be merged as it stands"; handover in `docs/handover-tiered-rules.md` on its branch. |
| "Drop the excess" at commit `916c715a` | Energy above a lowered capacity is lost at once: the rule before #320. | No branch or setting. Put that commit (the merge of #318) on a preview to try it. |

## Decisions waiting for the owner

1. **Single-game fairness.** Among equally skilled players the dealt rule decides a single game. Shipped: rotation
   across replays, which is fair over as many games as there are players. The alternative is a scoring change, for
   example score relative to the same deal's reference outcome, or conflict-matched deals (untried).
   `docs/rule-difficulty.md` §9; judgment call 37.
2. **Spoiling beats careful play.** One spoiler among two cooperators wins 88–100% of simulated games. The one rule
   found that helps is #295 at ×3 ("breaking costs extra"); it is not merged. `docs/coordination-incentives.md`.
3. **Two Pair's ★ tier is hard to reach.** A one-cell climber reaches 0.00–0.06 of it, because it needs two cells
   moved together. It is still dealt on Tiered rules. Judgment call 36.
4. **#324.** The tiered tables' 1-bit bound fails at some levels below the top. Accept, fix the law, or widen the
   bound.
5. **A real browser sign-in on dev after #328.** JWKS is now inlined. Cloud sign-in has not been verified by anyone.
   Judgment call 38.

Last refreshed: 2026-11-14 (PRs up to #340).
