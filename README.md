# okbot

Discord bot that generates [Carl-bot](https://docs.carl.gg/#/tagstriggers?id=tags) tags from templates.

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

## Notes

- Carl-bot deprecated `!tag add`, and slash commands can't be pasted. Output uses the pasteable mention form (`<@235148962103951360> tag + ...`). Tags are still invoked with the `!` prefix.
- Discord caps messages at 2000 characters. For a longer tag, use `/tag procreate <name> <pastebin link>`.
- The Leg Start template also outputs a Mimu `/autoresponder add ...` line. That is a slash command, so fill it in by hand from the slash menu.
