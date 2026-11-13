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
