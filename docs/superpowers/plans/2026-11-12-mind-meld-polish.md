# Mind Meld Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add embed formatting, a rounds score, a Datamuse dictionary check with "did you mean", an End game button, and a no-repeated-words rule to the deployed Mind Meld game.

**Architecture:** Rules stay pure in `src/mindmeldRules.js` (repeat rule, end game, preflight). Message building stays pure in `src/mindmeldMessages.js` (embeds and button ids). A new pure `src/dictionary.js` wraps Datamuse with an injectable fetch. `src/mindmeld.js` (Durable Object plus Discord handlers) only glues these together.

**Tech Stack:** Existing Cloudflare Worker, Durable Objects, `wink-lemmatizer`, `node:test`. No new dependencies; Datamuse is called with the built-in `fetch`.

**Spec:** `docs/superpowers/specs/2026-11-12-mind-meld-design.md`, section "Update: polish round" (items 1-6). The base design above it still applies.

## Global Constraints

- Embed colors: play `0x5865F2`, match `0xF1C40F`, ended `0x95A5A6`.
- Embed limits: description at most 4096, each field value at most 1024, whole embed at most 6000 characters. Only the last 8 rounds are shown, with an "earlier rounds not shown" note.
- Footer text exactly: `Think this should've been a match? Ping the hosts!` (non-final reveals only).
- Score: "Mind meld in N rounds" where N is the matching round; starting words are round 1; N=1 reads "1 round".
- Datamuse: `https://api.datamuse.com/words?sp=<encoded word>&max=4`, 1500 ms timeout, only the word is sent, fail open on any error or non-200. Recognized = top result equals the word case-insensitively. Suggestions = up to 2 other results.
- Repeat rule: a word is a repeat if it matches (`wordsMatch`) any word in `history`, either player. Pending words never count.
- `custom_id` formats: `mm:submit:<gameId>`, `mm:use:<gameId>:<word>`, `mm:end:<gameId>`, `mm:endyes:<gameId>`, `mm:keep:<gameId>`; modal `mm_modal:<gameId>`. A word may contain `:`. All under 100 characters.
- Refusal and "locked in" replies stay short ephemeral text (flag 64). Reveals use `allowed_mentions: { parse: [] }`.
- Deploy and push only after the user says so.

## Review Focus

- Your partner's hidden word equals yours: a normal match, never a repeat refusal. (Task 1 test)
- `rains` after `rain` was revealed: refused as a repeat, nothing locked in. (Task 1 test)
- Datamuse down, slow, non-200 or malformed: word accepted, no warning. (Task 3 tests)
- A word containing `:` survives the `mm:use:` button round trip. (Task 2 test)
- Outsider, double press, or ending an already won or ended game: refused, state unchanged. (Task 1 tests)
- 60 worst-case rounds stay within all embed limits. (Task 2 test)

---

### Task 1: Rules: repeat, preflight, end game

**Files:**
- Modify: `src/mindmeldRules.js`
- Test: `test/mindmeldRules.test.js`

**Interfaces:**
- Consumes: existing `normalizeWord`, `wordsMatch`, `newGame`, `submitWord`, `GameState`.
- Produces:
  - `preflight(state: GameState, userId: string, rawWord: string): { type: 'ok' } | { type: 'not_player' | 'finished' | 'ended' | 'invalid' | 'already_submitted' | 'repeat' }`. Check order: not_player, won (`finished`), ended (`ended`), invalid, already_submitted, repeat.
  - `submitWord` now calls `preflight` first and returns `{ state, result: refusal }` with `state` unchanged for any non-`ok`. New result types `ended` and `repeat` join `SubmitResult`.
  - `endGame(state: GameState, userId: string, now: number): { state: GameState, result: { type: 'ended_now', rounds: number } | { type: 'not_player' | 'finished' | 'ended' } }`. On success `status` becomes `'ended'`; `rounds` is `history.length`.
  - `GameState.status` is now `'active' | 'won' | 'ended'`.

- [ ] **Step 1: Write failing tests** (extend `test/mindmeldRules.test.js`, same helpers):
  - `preflight` returns `ok` for a fresh valid word; `invalid` for `'two words'`; `not_player` for an outsider; `already_submitted` after the same player locked in; `finished` after a win; `ended` after `endGame`.
  - Repeat: after round 1 reveals `rain`/`desert`, `preflight` and `submitWord` refuse `'Rain'` (`repeat`), refuse `'rains'` (`repeat`), refuse `'desert'` from the other player, and leave state unchanged; `'oasis'` is accepted.
  - Pending is not a repeat: A has pending `'oasis'`; B submitting `'oasis'` returns `revealed` with `matched: true` (not `repeat`).
  - `endGame`: by a player on an active game after 2 revealed rounds returns `ended_now` with `rounds: 2`, status `'ended'`, `updatedAt` equal to `now`; by an outsider returns `not_player` with state unchanged; on a won game returns `finished`; twice returns `ended`; `submitWord` on an ended game returns `ended`.

- [ ] **Step 2: Run `npm test`.** Expected: new tests FAIL (`preflight`/`endGame` not exported); earlier 14 still pass.

- [ ] **Step 3: Implement** `preflight` and `endGame` per the signatures; refactor `submitWord` to delegate its validation to `preflight` (keep its non-mutating behavior and the existing reveal logic). Repeat check normalizes both sides before `wordsMatch`.

- [ ] **Step 4: Run `npm test`.** Expected: all PASS, including the original 14.

- [ ] **Step 5: Commit** (`git add -A`, which also commits the staged design-doc update, README and footer wording; message: "Add repeat rule, preflight and end game to Mind Meld rules, plus polish design").

---

### Task 2: Messages: embeds and button ids

**Files:**
- Modify: `src/mindmeldMessages.js` (replace `revealText`), `test/mindmeldMessages.test.js` (replace the `revealText` tests)

**Interfaces:**
- Produces (all pure, no Discord calls):
  - `lobbyEmbed(players: [string, string]): Embed`
  - `revealEmbed({ players, history, words, matched, exact }): Embed` (same argument shape as the old `revealText`; `history` includes the just-revealed round)
  - `endedEmbed({ players, history, endedBy: string }): Embed`
  - `useButtonId(gameId: string, word: string): string` and `parseUseId(customId: string): { gameId: string, word: string }`
  - `Embed = { title: string, description: string, color: number, fields?: Array<{ name: string, value: string, inline: boolean }>, footer?: { text: string } }`
- Behavior:
  - `revealEmbed` not matched: title `Round N`, blurple, two inline fields (`Player 1`, `Player 2`) whose values are `**word**` (escaped) plus a newline and the player mention; description is `Connect **x** ⟷ **y**` followed by the earlier-round history (empty section omitted); footer is the exact footer text.
  - `revealEmbed` matched: gold, title `🎉 Mind meld in N rounds!` (`1 round` when N=1), description is the full chain (last 8 rounds), plus `(counted as a match)` when `exact` is false; no footer.
  - `endedEmbed`: grey, title `Game ended`, description names `<@endedBy>` and how many rounds were played, then the chain.
  - `lobbyEmbed`: blurple, title `Mind Meld`, description mentions both players and gives the three-line how-to from the current lobby message.
  - Words are escaped with the existing markdown escape.

- [ ] **Step 1: Write failing tests:** blurple/gold/grey colors; titles (`Round 2`, `Mind meld in 3 rounds!`, `1 round`); footer present only on non-final reveals; `(counted as a match)` only when not exact; ended embed mentions the ender and the round count; last-8 cap with the "earlier rounds not shown" note and correct absolute numbering; markdown/mention escaping (carry over the existing cases); after 60 worst-case rounds (32 `*` characters each) every embed has description at most 4096, every field value at most 1024, and total at most 6000 characters; `parseUseId(useButtonId('123', 'a:b:c'))` returns `{ gameId: '123', word: 'a:b:c' }`; `useButtonId` stays under 100 characters for a 32-character word and a 19-digit game id.

- [ ] **Step 2: Run `npm test`.** Expected: FAIL (new exports missing).

- [ ] **Step 3: Implement** the functions above. Keep `MAX_ROUNDS_SHOWN = 8` and `escapeMarkdown`; delete `revealText` and its old tests.

- [ ] **Step 4: Run `npm test`.** Expected: all PASS.

- [ ] **Step 5: Commit** (`src/mindmeldMessages.js`, `test/mindmeldMessages.test.js`). Note: `src/mindmeld.js` still imports `revealText` until Task 4, so do not deploy between tasks.

---

### Task 3: Dictionary lookup

**Files:**
- Create: `src/dictionary.js`
- Test: `test/dictionary.test.js`

**Interfaces:**
- Produces: `lookupWord(word: string, fetchFn?: typeof fetch): Promise<{ known: boolean, suggestions: string[] }>`. `fetchFn` defaults to the global `fetch`. Datamuse returns `[{ word, score }, ...]`.

- [ ] **Step 1: Write failing tests** with a fake `fetchFn`:
  - Top result equals the word (`'Rain'` vs `'rain'`): `{ known: true, suggestions: [] }`.
  - Top result differs (`'raibn'` returns `rain`, `rabin`, `ruin`): `known: false`, suggestions `['rain', 'rabin']` (two at most, never the typed word).
  - Empty array: `known: false`, no suggestions.
  - Fail open: fetch rejects, fetch returns `ok: false`, `.json()` throws, and a fetch that never resolves until its abort signal fires: all give `known: true`.
  - The requested URL contains `sp=raibn` and `max=4` and no other query parameters.

- [ ] **Step 2: Run `npm test`.** Expected: FAIL (module not found).

- [ ] **Step 3: Implement `lookupWord`** with `AbortSignal.timeout(1500)` passed to `fetchFn`, wrapped so any error returns the fail-open value.

- [ ] **Step 4: Run `npm test`.** Expected: all PASS.

- [ ] **Step 5: Commit** (`src/dictionary.js`, `test/dictionary.test.js`).

---

### Task 4: Handlers, Durable Object, README

**Files:**
- Modify: `src/mindmeld.js`, `README.md`

**Interfaces:**
- Consumes: Task 1 (`preflight`, `endGame`, new result types), Task 2 (embeds, `useButtonId`, `parseUseId`), Task 3 (`lookupWord`).
- Produces: Durable Object methods `preflight(userId: string, word: string): Promise<{ type: string }>` (loads state, calls rules `preflight`, `{ type: 'expired' }` when no state) and `end(userId: string): Promise<{ type: string, rounds?: number, players?: string[], history?: object[] }>` (saves state on `ended_now`, returns players and history with it). `check` also returns `'ended'`.

- [ ] **Step 1: Message plumbing.** Replace `revealMessage`/`submitButton` usage: lobby and non-final reveals send `embeds: [embed]` plus one action row with **Submit word** (`mm:submit:<gameId>`) and **End game** (`mm:end:<gameId>`, style 4/danger); a match or ended game sends the embed with no components. Extend `REFUSALS` with `repeat` ("**x** was already said in this game. Pick a different word.") and `ended` ("This game was ended. Start a new one with `/mindmeld`.").

- [ ] **Step 2: Modal submit flow.** `preflight` first and refuse on anything but `ok`; then `lookupWord`; if `known` is false reply ephemerally with a warning ("`x` isn't in my dictionary.") and an action row of up to 2 `Use "<suggestion>"` buttons, one `Use "<x>" anyway` button (all `useButtonId`, style 2/secondary) and **Change word** (`mm:submit:<gameId>`, style 1); otherwise call `submit` as today and reply with the Task 2 embed or the "Locked in" text.

- [ ] **Step 3: Component handlers** in `handleMindMeldComponent`, dispatched on `custom_id.split(':')[1]`:
  - `submit`: as today (via `check`, which now covers `ended`).
  - `use`: `parseUseId`, then `submit`; `waiting` replies with a type 7 update of the ephemeral message to "Locked in. Waiting for your partner."; `revealed` replies with a public type 4 embed message; other results use `REFUSALS`.
  - `end`: `check` the player and state, then reply ephemeral "End the game? Nothing will be scored." with buttons **Yes, end it** (`mm:endyes:<gameId>`, danger) and **Keep playing** (`mm:keep:<gameId>`).
  - `endyes`: call `end`; on `ended_now` reply with a public type 4 `endedEmbed`; refusals as ephemeral text.
  - `keep`: type 7 update to "Okay, keep playing."

- [ ] **Step 4: README.** Update the Mind Meld section: embed cards and score, dictionary warning with suggestions (Datamuse, accepts the word if the service is unreachable), End game button, and that repeated words aren't allowed. Fix the "tell the organizers" wording to "ping the hosts".

- [ ] **Step 5: Verify.** Run `npm test` (all PASS) and `npx wrangler deploy --dry-run` (bundles, `MIND_MELD` binding listed). Run `OKBOT_TOKEN=x OKBOT_APPLICATION_ID=1 node src/register.js` and expect a 401 (confirms `register.js` still loads under node).

- [ ] **Step 6: Commit** (`src/mindmeld.js`, `README.md`).

- [ ] **Step 7: Live check (needs the user)** after `npm run deploy`, with two accounts: embeds render and look roomier; a typo (`raibn`) shows the warning with a suggestion and both buttons work; a repeated word is refused privately; End game shows the confirm, then the grey card, and later Submit clicks say the game was ended; a match shows "Mind meld in N rounds". No `npm run register` is needed (the command definition is unchanged).
