# okbot

Discord bot that generates [Carl-bot](https://docs.carl.gg/#/tagstriggers?id=tags) tags from templates.

## How to use

1. Run a `/tag_template` command (needs Manage Server). The bot replies privately with one or more code blocks.
2. Copy each code block and paste it into any channel. Each starts with `/tag create <name> <content>`.
3. Players run the tag by typing its name after the Carl-bot prefix, e.g. `!SJ-Arrived`.

To change a tag later, use `/tag edit <name> <content>`.

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

- Carl-bot deprecated `!tag add`. Tags are created with `/tag create`; they are still invoked with the `!` prefix.
- Discord caps messages at 2000 characters. For a longer tag, use `/tag procreate <name> <pastebin link>`.
