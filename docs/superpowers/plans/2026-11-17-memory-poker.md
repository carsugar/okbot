# Memory Poker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Discord duel and solo game where a 16-card board is flashed privately for 20 seconds, then each player picks two squares to build a five-card poker hand with three shared cards.

**Architecture:** Pure, node-testable modules hold the cards, poker evaluator, game state machine and message text. A SQLite Durable Object per game (`MemoryPokerGame`) holds state and a small queue of timed work (hide the board, answer deadline); one alarm always points at the earliest item or the 24 h expiry. Thin handlers in `src/memorypoker.js` turn Discord interactions into DO calls.

**Tech Stack:** Cloudflare Workers, Durable Objects (SQLite), Discord HTTP interactions, `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-17-memory-poker-design.md`

## Global Constraints

- Board: 16 distinct cards on squares `A`–`P`. Shared cards: 3 further distinct cards. Fresh deal each round. Randomness from `crypto.getRandomValues`, injected as `rng()` returning `[0,1)` so tests are deterministic.
- Hand = the two picked board cards + the three shared cards. Ranks high to low: straight flush, four of a kind, full house, flush, straight, three of a kind, two pair, pair, high card. Ace high, and low in A-2-3-4-5. Suits never break ties.
- Two different squares per answer; both duel players may pick the same squares.
- Duel: first to 3 round wins. Drawn rounds count for neither. After round 5, if win counts differ the leader wins, otherwise play extra rounds until a round leaves someone ahead.
- Flash 20 s. Answer window 60 s after the board hides, then the round is forfeited by that player. Forfeit gives the round to the other player; both forfeit is a draw. The clock only starts when a player views their board.
- Solo is fully private (ephemeral); duel results are public. Games expire after 24 h idle. No End game button.
- Command `memorypoker`, optional user option `opponent`, `contexts: [0]`. DO binding `MEMORY_POKER`, class `MemoryPokerGame`, migration tag `v3`.
- Ids: `mp:show:<gameId>:<round>`, `mp:answer:<gameId>:<round>`, `mp:next:<gameId>:<round>`, modal `mp_modal:<gameId>:<round>`. A press whose round is not the current round is refused (stale).
- Message style: quiet, like the Mind Meld start card. `#` title with an invisible `​` spacer line after it and before the buttons, `##` subheaders, italic intro, light emojis, under 2000 characters.
- Do not modify `tag_template`, its handlers, Mind Meld, or any existing command. Only add routes, the command, the binding and the README section.

## Review Focus

- A board answer sent while the flash is still showing must be refused (answering mid-flash would let a player read the board and answer).
- A stale button from an earlier round must never act on the current round.
- A player pressing Show twice in a round must not get a second look at the board.
- Both players forfeiting, one forfeiting, and answering exactly at the deadline.
- Messages built from 60 worst-case rounds stay under 2000 characters.

---

### Task 1: Cards and the poker evaluator

**Files:**
- Create: `src/pokerRules.js`
- Test: `test/pokerRules.test.js`

**Interfaces:**
- Produces: `SQUARES` (`'ABCDEFGHIJKLMNOP'`), card objects `{ rank: 2..14, suit: 'S'|'H'|'D'|'C' }`, `deal(rng) -> { board: Card[16], shared: Card[3] }`, `evaluate(cards: Card[5]) -> { category: 0..8, ranks: number[] }`, `compareHands(a, b) -> -1|0|1`, `handName(hand) -> string`, `handFor(deal, picks: [i, j]) -> hand`, `allPicks(deal) -> { picks: [i, j], hand }[]` (120 entries), `bestHand(deal) -> { picks, hand }`, `countBeaten(deal, hand) -> number`, `parseAnswer(text) -> { ok: true, picks: [i, j] } | { ok: false }`.

- [ ] **Step 1: Write failing tests** for `evaluate` (one case per category, the A-2-3-4-5 wheel being a straight with high card 5, A-K-Q-J-10 beating K-Q-J-10-9), `compareHands` (category first, then ranks lexicographically, equal hands return 0, suits ignored), `handName`, `deal` (16 + 3 distinct cards from a seeded rng, 19 unique), `allPicks` length 120, `bestHand` and `countBeaten` on a hand-built deal where the answer is known, `parseAnswer` (`"c j"`, `"CJ"`, `"C, J"` ok; same square twice, one letter, three letters, `"Q J"`, empty, other text not ok).
- [ ] **Step 2: Run** `node --test test/pokerRules.test.js` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the signatures above in `src/pokerRules.js`. `evaluate` counts ranks and checks flush and straight; `ranks` is the tie-break list in significance order (e.g. full house `[tripRank, pairRank]`, wheel `[5]`).
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** `src/pokerRules.js test/pokerRules.test.js` ("Add poker evaluator, deal and best-hand search").

### Task 2: Game state machine and timed-work queue

**Files:**
- Create: `src/pokerGame.js`
- Test: `test/pokerGame.test.js`

**Interfaces:**
- Consumes: Task 1 (`evaluate`, `compareHands`, `handFor`, `bestHand`, `countBeaten`, `allPicks`).
- Produces (all pure, state in and `{ state, result }` out, `now` in ms):
  - constants `FLASH_MS = 20000`, `ANSWER_MS = 60000`, `WINS_NEEDED = 3`, `STANDARD_ROUNDS = 5`.
  - `newGame(players: string[], deal, now) -> state` with `mode` `'solo'` (one player) or `'duel'`.
  - `viewBoard(state, userId, now)` → result `{ type: 'ok', board, hideAt }` or `not_player | finished | round_over | already_viewed`.
  - `markHidden(state, userId, now)` → sets the deadline; result `{ type: 'ok', shared, deadline }` or `no_change`.
  - `submitAnswer(state, userId, picks, now)` → `waiting`, `resolved` (with `roundResult`), or `not_player | finished | round_over | not_viewed | still_looking | already_answered | late`. `late` records a forfeit and resolves the round if it was the last open player (then result is `{ type: 'late', roundResult? }`).
  - `forfeitExpired(state, now)` → forfeits every viewed player past their deadline with no answer; returns `{ state, resolved? }`.
  - `nextRound(state, deal, now)` → `ok`, or `round_open | finished`.
  - `isStale(state, round)`.
  - `roundResult` shape: `{ round, outcome: 'win'|'draw', winner, hands: { [id]: hand|null }, picks: { [id]: [i, j]|null }, forfeited: id[], wins: { [id]: n }, finished: bool, matchWinner, analysis? }`, where `analysis = { found, best: { picks, hand }, yours, beaten, total: 120 }` is present in solo.
  - Queue helpers `enqueue(queue, item)`, `takeDue(queue, now) -> { due, rest }`, `nextAlarmAt(queue, expiryAt) -> number`.
- [ ] **Step 1: Write failing tests**: view once then refused; answer before hide refused (`still_looking`); answer before viewing refused (`not_viewed`); a duel resolving only when both answered; win, draw, and win-by-forfeit; both forfeit is a draw; late answer at deadline +1 ms forfeits, at exactly the deadline is accepted; first to 3 finishes; after round 5 leader finishes it; level after round 5 continues and the next decisive round finishes it; draws do not count; `nextRound` refused while a round is open or after finish and bumps `round` and clears per-round data; solo analysis (`found` true when the pick ties the best hand, otherwise false with `beaten`); `isStale`; queue helpers (`takeDue` splits by `at`, `nextAlarmAt` returns the earliest of queue items and expiry).
- [ ] **Step 2: Run** `node --test test/pokerGame.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** in `src/pokerGame.js`. State holds `{ mode, players, round, deal, wins, status: 'active'|'finished', roundOpen, per: { [id]: { viewedAt, hiddenAt, deadline, answer, forfeited } }, lastResult, updatedAt }`.
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** `src/pokerGame.js test/pokerGame.test.js` ("Add Memory Poker game state machine").

### Task 3: Message text

**Files:**
- Create: `src/memoryPokerMessages.js`
- Test: `test/memoryPokerMessages.test.js`

**Interfaces:**
- Consumes: Task 1 (`SQUARES`, `handName`), Task 2 `roundResult` shape.
- Produces: `cardLabel(card) -> 'K♠'`, `startText(players, round) -> string`, `boardText(board, hideAtSec) -> string`, `hiddenText(shared, deadlineSec, round) -> string`, `roundText(players, roundResult, deal, mode) -> string`, `modalLabel` constant `'Two squares, like C J'`, id helpers `showId(gameId, round)`, `answerId`, `nextId`, `modalId`, `parseId(customId) -> { action, gameId, round }`.
- [ ] **Step 1: Write failing tests**: `cardLabel` for 10, face cards, ace and each suit symbol; `boardText` contains all 16 squares A–P each with its card in a 4-row code block and a `<t:…:R>` countdown; `hiddenText` lists the three shared cards and the answer deadline; `startText` for duel mentions both players and for solo one, begins with `# ` title then a `​` line, and ends with `​`; `roundText` for a win, a draw, a forfeit and a finished match (score line and winner); solo `roundText` with found and not found (`beaten` of 120 and the best pick); every text under 2000 characters including a duel with long extra rounds; `parseId` round trips all four id kinds.
- [ ] **Step 2: Run** `node --test test/memoryPokerMessages.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** in `src/memoryPokerMessages.js`. Board cells are `"A K♠ "` padded to a fixed width, four per row, in a code block.
- [ ] **Step 4: Run** the same command and then `npm test` — Expected: PASS, all suites green.
- [ ] **Step 5: Commit** ("Add Memory Poker message text").

### Task 4: Durable Object, handlers and wiring

**Files:**
- Create: `src/memorypoker.js`
- Modify: `src/commands.js` (add `MEMORYPOKER_COMMAND`), `src/register.js` (add it to the list), `src/server.js` (route `memorypoker` commands, `mp:` components, `mp_modal:` modals, re-export `MemoryPokerGame`), `wrangler.toml` (binding `MEMORY_POKER`, migration `v3` with `new_sqlite_classes = ["MemoryPokerGame"]`), `README.md` (a Memory Poker section)
- Test: extend `test/memoryPokerMessages.test.js` with a guild-only check on `MEMORYPOKER_COMMAND` (`contexts` is `[0]`, `opponent` option optional, not required).

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: `MemoryPokerGame` (`start(players, mode)`, `show(userId, round, token, appId)`, `check(userId, round)`, `answer(userId, round, text)`, `next(userId, round)`, `alarm()`), `handleMemoryPokerCommand(interaction, env)`, `handleMemoryPokerComponent(interaction, env)`, `handleMemoryPokerModal(interaction, env)`.

- [ ] **Step 1: Write the failing command test** (guild-only, optional `opponent`).
- [ ] **Step 2: Run** `node --test test/memoryPokerMessages.test.js` — Expected: FAIL (export missing).
- [ ] **Step 3: Implement.** DO: persists `state` and a `queue` of `{ at, type: 'hide'|'deadline', userId, token, appId }`; `show` enqueues a hide at `hideAt`; the alarm takes due items: `hide` calls `markHidden` and edits the player's private message with `PATCH /webhooks/{appId}/{token}/messages/@original` (hidden text plus the answer button; errors ignored), enqueues a `deadline`; `deadline` calls `forfeitExpired` and, if that resolved a round, posts the result as a followup with the forfeiting player's token (public for duel, private for solo). The alarm always re-arms at `nextAlarmAt(queue, updatedAt + 24h)`; past expiry it calls `deleteAll`. Handlers: command validates opponent not self and not a bot, starts the game (id = `interaction.id`), replies publicly for a duel (pinging both) and privately for solo; `show` replies privately with `boardText`; `answer` opens the modal after `check` passes; modal submit parses the squares, calls `answer`, replies privately for waiting and refusals, and with the result text (and a Next round button unless the match is over) once resolved. `next` replies with a fresh round start card. Everything refused by round number or membership is private.
- [ ] **Step 4: Run** `npm test` and `node --check src/memorypoker.js src/server.js` — Expected: all tests pass; no syntax errors. Record in the ledger that the DO and handlers cannot be exercised in plain node, so the live check with two accounts is the user's.
- [ ] **Step 5: Commit** each of the changed files by name ("Add Memory Poker Durable Object, handlers and wiring").
