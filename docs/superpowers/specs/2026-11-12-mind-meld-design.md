# Mind Meld game: design

## Intent
Two people play Mind Meld in a Discord channel as a challenge inside an Amazing Race-style game run for a challenge-based org. Each player privately enters a word. The bot reveals both at once (the "1, 2, 3, say it" moment). Each later round, both players privately enter a word that bridges the two previous words, and the bot reveals both. The game ends when the two words match.

## Goals
- Hidden entry, simultaneous reveal, repeat until a match.
- Works live (both players at the keyboard) and slowly (hours between answers) with no extra mechanism.
- Self-contained: a new file plus small wiring. The existing tag-template code is untouched.

## Non-goals / anti-goals
- No scoring, round limit, dictionary or word validation, or more than two players.
- No derivational matching (happy / happiness) and no part-of-speech tagging; the lemmatizer is conservative on purpose.
- No gateway connection and no message reading. A word must never be visible to the other player before the reveal.

## Constraints
- okbot is a Cloudflare Worker handling HTTP interactions only (`src/server.js`). It currently stores nothing.
- Existing conventions: modals and buttons are routed by `custom_id` prefix; `register.js` PUTs the full command list.

## Approaches considered
- **A. Workers KV with long TTL.** Simplest, but not atomic. Two same-second submits in live play can both see "partner not in yet", so the reveal is skipped or posted twice.
- **B. One Durable Object per game. (Chosen.)** Requests for one game run one at a time, so the same-second case is safe. State persists, so slow play is free. Cost is a small class plus a `wrangler.toml` binding and migration.
- Words stored in the Discord message: rejected, it leaks them.

## Design
**Flow**
1. `/mindmeld partner:@user` (open to everyone, not Manage Server) posts a public lobby message naming both players with a **Submit word** button. Game id = the command interaction id, carried in every `custom_id` (`mm:submit:<gameId>`, modal `mm_modal:<gameId>`).
2. Clicking the button opens a modal with one short text field. Only the two players may; anyone else gets an ephemeral "not your game".
3. Modal submit goes to the game's Durable Object. If the partner hasn't answered, the reply is ephemeral ("Locked in, waiting for your partner"). If both are in, the reply is a public message revealing both words with the round history.
   - Words match: the game is over, and the message says so with the full chain.
   - No match: the reveal message carries a fresh **Submit word** button for the next round, with a one-line prompt (a word that connects X and Y).
4. The reveal is the interaction response of whoever submitted last, so no bot-token message posting is needed.

**State (Durable Object storage):** player ids, round number, pending words for the current round, history of revealed rounds, status. A 24-hour idle alarm clears the state. A click on an expired game gets "this game expired, start a new one".

**Files**
- `src/mindmeld.js`: command definition, button/modal handlers, the `MindMeldGame` Durable Object, and a pure `applyWord(state, userId, word)` function holding the rules.
- `src/server.js`: route `mindmeld` commands, `mm:` buttons and `mm_modal:` modal submits to it; `export { MindMeldGame }`.
- `src/register.js`: add the command to the registered list.
- `wrangler.toml`: `MIND_MELD` Durable Object binding plus a `new_sqlite_classes` migration.
- `README.md`: a short Mind Meld section.

**My calls (not yet discussed, easy to change)**
- Words are trimmed and lowercased, and must be a single word of at most 32 characters.
- **Match means equal after lemmatizing** (requested): plurals, tenses and irregular forms count as a match, e.g. rain / raining / rains, run / ran, mouse / mice, leaf / leaves. Two words match if any noun, verb or adjective lemma of one equals one of the other (as tested). Done with the `wink-lemmatizer` npm package (68 KB, dictionary based, no dependencies). New dependency by my call, since nothing existing does this. Chosen over stemmers after a 20-pair comparison: 18/20 correct and no false merges, where stemmers got 11-12 and merged unrelated words (universe / university).
- Lemmatizing is only used for the match check. The reveal shows the words as typed, and when they match only through lemmatizing it says so (e.g. "rain / raining").
- Known limits, accepted: derived forms (happy / happiness, beauty / beautiful) won't match. The reveal message tells players to report a missed match to the organizers so the rule can be revisited.
- Once locked in, a word can't be changed for that round.
- If the two starting words are identical, that counts as an immediate match.
- No round cap and no give-up button. The game ends on a match or after 24 hours idle.
- The partner can't be yourself or a bot.
- No test framework exists, so verification is a node script exercising `applyWord`, plus a manual run in `wrangler dev`.

## Update: polish round (2026-11-12)

Requested after the first deploy. Supersedes the earlier non-goal "no dictionary or word validation".

**1. Nicer, roomier messages.** Lobby, reveal, win and ended messages become Discord embeds (colored card, title, fields) instead of plain text. Colors: blurple for play, gold for a match, grey for an ended game. Refusals and "locked in" stay short ephemeral text. Embeds also lift the 2000-character limit (description 4096), but the last-8-rounds cap stays.

**2. Score.** A match shows **"Mind meld in N rounds"** where N is the round that matched. The starting words are round 1, so identical starting words score 1 round. (My call.)

**3. Dictionary check with "did you mean".** Uses the Datamuse API (`https://api.datamuse.com/words?sp=<word>&max=4`), free and keyless. A word is recognized when the top result equals it (case-insensitive). Otherwise it is "unrecognized" and the top other results are the suggestions.
- Only the word is sent, never player or game ids.
- Fail open: on a timeout (1.5 s), network error or non-200, treat the word as recognized and skip the warning.
- Unrecognized word: the player gets a private message "`x` isn't in my dictionary", with up to 2 buttons `Use "<suggestion>"`, one `Use "<x>" anyway`, and `Change word` (reopens the modal). The word is carried in the button's custom id (`mm:use:<gameId>:<word>`; limits make it fit), so no extra storage. A `Use` button submits that word without another dictionary check.
- Known gaps, accepted: some brands (whatsapp) are unrecognized, and some common misspellings (beleive) are in Datamuse's vocabulary and pass.
- Option rejected: a bundled 275k-word list (~700 KB gzipped, no brands or slang).

**4. End the game.** An **End game** button on the lobby and on every non-final reveal. Either player can press it; it asks privately "End the game?" with `Yes, end it` / `Keep playing`. On yes, the game status becomes `ended`, a grey public message says who ended it and after how many rounds, and further Submit clicks get "This game was ended." No score. (Confirm step is my call, since ending is irreversible.)

**5. Footer wording.** "Think this should've been a match? Ping the hosts!" (done).

**Files:** `src/mindmeldRules.js` (+`endGame`, `ended` status), `src/mindmeldMessages.js` (embeds), new `src/dictionary.js` (`lookupWord(word, fetchFn)`, node-safe, tested with a fake fetch), `src/mindmeld.js` (handlers, DO `end`), tests, README.

**6. No repeated words.** A word already revealed in the game can't be used again, by either player. A repeat is refused privately ("**x** was already said in this game. Pick a different word.") and nothing is locked in, so the player can retry.
- "Already said" means every word in `history` (all revealed rounds), compared with the same lemma rule as matching, so `rains` after `rain` counts as a repeat. (My call: otherwise players could dodge the rule with a plural.)
- A partner's still-hidden pending word never counts. Entering the same word as your partner's pending word is a normal match and must not be refused, or the refusal would leak their word.
- Enforced in `submitWord` (new result `{ type: 'repeat' }`). The handler also asks the Durable Object up front (`preflight(userId, word)`, which also catches already-submitted) so a repeat or double submit is refused before the dictionary warning, not after. Preflight is advisory; `submit` stays the authority.
