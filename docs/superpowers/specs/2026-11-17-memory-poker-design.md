# Memory Poker: Design

## Intent

A Discord game for a challenge org, modelled on https://koutar.com/memory-poker/. A board of 16 playing cards is flashed to a player for 20 seconds, then hidden. Three shared cards are revealed. The player picks two board squares by letter. Those two cards plus the three shared cards make a five-card poker hand, and the stronger hand wins.

Two modes:
- **Duel:** two players, same board, best of 3. Used as a head-to-head challenge.
- **Solo:** one player, told whether they found the best hand available on the board.

## Goals

- Playable asynchronously: players do not need to be online at the same time.
- The board is visible to only the player who asked for it, and only for 20 seconds.
- Solo mode says exactly how the player's hand compares with the best possible hand.
- Self-contained in the okbot Worker. State lives in one Durable Object per game.

## Non-goals

- Online rooms, a daily board, a computer opponent, difficulty levels, rankings or an in-game timer countdown.
- Image rendering. The board is text.
- Preventing a player from screenshotting their own board. Discord offers no way to block that. Mitigations below make sharing and replaying pointless.
- An End game button. Games expire after 24 hours idle.

## Approaches

**How the board hides.** (a) Worker sleeps 20 s then edits the message: simple but close to the Worker time limit, and a restart would leave the board visible. (b) Durable Object alarm edits it: survives restarts and is precise, but the alarm must also serve the 24 h expiry. **Chosen: (b)**, with a small queue of due items in state and the alarm always set to the earliest.

**Rendering.** (a) text grid, (b) generated image. **Chosen: (a).**

## Game rules

- **Deck:** standard 52 cards. Each round the board is 16 distinct cards on squares A to P, and the shared cards are 3 further distinct cards. A fresh deal each round, drawn with `crypto.getRandomValues`.
- **Hand:** the two picked board cards plus the three shared cards, ranked as standard poker: straight flush, four of a kind, full house, flush, straight, three of a kind, two pair, pair, high card. Aces are high, and low in A-2-3-4-5. Suits never break ties, so identical rank patterns draw.
- **Picking:** two different squares. Both players may pick the same squares.
- **Duel:** the match ends when a player has 2 round wins. A drawn round counts for neither. If neither has 2 after round 3, extra rounds are played until someone leads after a round. Each round is a new deal.
- **Solo:** one board at a time. After the answer the bot reports the result, then offers a button for a new board.
- **Best hand:** the bot evaluates all 120 two-square picks and takes the strongest. Solo reports found or not found, the best pick with its hand, the player's pick with its hand, and how many of the 120 picks the player's hand beat.

## Flow

1. `/memorypoker [opponent]`. With an opponent it is a duel, without one it is solo. Guild channels only. A duel posts a public message that pings both players, with a **Show me my board** button. Solo posts a message with the same button.
2. **Show me my board** (players only, once per round): an ephemeral message shows the 4×4 grid with labeled squares. The Durable Object stores the interaction token and schedules a hide at +20 s.
3. At +20 s the ephemeral message is edited to "Board hidden", the three shared cards, and an **Enter your two letters** button. Edits use `PATCH /webhooks/{application_id}/{token}/messages/@original`. A token is valid for 15 minutes, which is enough.
4. **Enter your two letters** opens a modal with one text input. Input accepts two letters A to P in any case, separated by space, comma or nothing. Invalid input gets a private refusal and the player can retry.
5. Answering window: 60 seconds after the board hides (my call). A player who has not answered by then forfeits the round: the other player wins it, and if both forfeit the round is drawn. In solo a forfeit just ends that board. Answers after the window are refused.
6. When both players have answered (or forfeited) the bot posts the round result publicly: both hands, who won, the match score, and a **Next round** button for either player. A finished match shows the winner and no button.

Protections: round number in every button and modal id, so stale buttons are refused (the lesson from Mind Meld); a player who is not in the game is refused; pressing **Show me my board** twice in a round is refused.

## Architecture

- `src/pokerRules.js`: pure and node-testable. Card model, `deal(rng)`, `evaluate(five)`, `compareHands`, `bestPick(board, shared)`, `parseAnswer(text)`, match scoring, and `nextDue(queue)`.
- `src/memoryPokerMessages.js`: pure text builders (board grid, hidden prompt, round result, match result, solo result). Messages stay under Discord's 2000-character limit.
- `src/memorypoker.js`: Durable Object `MemoryPokerGame` plus the command, component and modal handlers. It cannot be imported in plain node, so it is not unit-tested.
- Wiring: `MEMORYPOKER_COMMAND` in `src/commands.js` (optional `opponent` user option, `contexts: [0]`) and added to `src/register.js`. `src/server.js` routes `mp:` components and `mp_modal:` modals and re-exports the class. `wrangler.toml` gets the `MEMORY_POKER` binding and a migration tag `v2` with `new_sqlite_classes`. README section.

## Style

Plain formatted text in the same quiet style as the Mind Meld start card: one big title, `##` subheaders, small print for secondary lines, a few light emojis, and the invisible-character spacer after the title and before the buttons.

## Verification

Unit tests cover the evaluator (all nine hand types, wheel straight, ties), `deal` (distinct cards, 16 + 3), `bestPick`, `parseAnswer`, match scoring including draws and sudden death, and every message builder including the length limit. The handlers and the alarm are checked live by the user with two Discord accounts.

## My calls (not yet agreed)

- 60-second answering window with forfeit.
- Extra rounds when level after three.
- Both players may choose the same squares.
- No End game button.
- Solo reports how many of the 120 picks the player beat.
