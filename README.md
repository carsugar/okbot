# okbot

Discord bot that generates [Carl-bot](https://docs.carl.gg/#/tagstriggers?id=tags) tags from templates, and hosts a two-player Mind Meld game.

## How to use

1. Run a `/tag_template` command (needs Manage Server). The bot replies privately with one or more code blocks.
2. Copy each code block and paste it into any channel. Each starts with an `@Carl-bot tag + <name> <content>` mention command, so pasting it creates the tag.
3. Players run the tag by typing its name after the Carl-bot prefix, e.g. `!SJ-Arrived`.

To change a tag later, use `/tag edit <name> <content>` or the Carl-bot dashboard.

## Commands

| Command | Options | Makes |
| --- | --- | --- |
| `/tag_template routeinfo_legstart` | `leg` | Route Info: Leg Start |
| `/tag_template routeinfo_task` | | Route Info: Task |
| `/tag_template routeinfo_travel` | | Route Info: Travel |
| `/tag_template detour` | `leg`, optional `switch_time` (e.g. `10 minutes`) | Detour: arrival, both options, switch (4 tags) |
| `/tag_template roadblock` | | Roadblock: arrival and clue (2 tags) |
| `/tag_template pitstop` | `leg`, `season` | Pit Stop |

## Mind Meld

A two-player word game. Run `/mindmeld partner:@someone` in a server channel (anyone can) to post a lobby message with **Submit word** and **End game** buttons.

1. Each player clicks **Submit word** and privately enters a starting word. The first to submit sees "Locked in"; when the second submits, the bot posts both words together.
2. Each round, both players privately enter a word that connects the last two revealed words, and the bot reveals them together.
3. The game ends when the two words match, with a score: "Mind meld in N rounds" (the starting words are round 1). Plurals, tenses and irregular forms count (rain / raining, mouse / mice), but derived forms do not (happy / happiness). If you think the bot missed a valid match, ping the hosts.

Rules and extras:
- A word can't be changed once locked in, and a word already said in the game (by either player, including forms like `rains` after `rain`) can't be used again.
- Words are checked against [Datamuse](https://www.datamuse.com/api/). An unrecognized word gets a private warning with "did you mean" buttons, or **Use it anyway**. If Datamuse can't be reached, the word is simply accepted. Only the word is sent.
- Either player can press **End game** (after a confirm) to abandon the game with no score.
- Games can be played live or over hours, and expire after 24 hours with no activity. Game state is stored in a Durable Object (`MIND_MELD`), so `npm run deploy` creates it on first deploy.

## Notes

- Carl-bot deprecated `!tag add`, and slash commands can't be pasted. Output uses the pasteable mention form (`<@235148962103951360> tag + ...`). Tags are still invoked with the `!` prefix.
- Discord caps messages at 2000 characters. For a longer tag, use `/tag procreate <name> <pastebin link>`.
- The Leg Start template also outputs a Mimu `/autoresponder add ...` line. That is a slash command, so fill it in by hand from the slash menu.
