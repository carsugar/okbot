const MAX_ROUNDS_SHOWN = 8;

const escapeMarkdown = (word) => word.replace(/[\\*_`~|<>@]/g, '\\$&');

const roundLine = (players, round, number) =>
  `Round ${number}: ${players.map((p) => `<@${p}> **${escapeMarkdown(round[p])}**`).join(' · ')}`;

export function revealText({ players, history, words, matched, exact }) {
  const firstShown = Math.max(0, history.length - MAX_ROUNDS_SHOWN);
  const lines = history.slice(firstShown).map((round, i) => roundLine(players, round, firstShown + i + 1));
  if (firstShown > 0) lines.unshift('-# …earlier rounds not shown');

  if (matched) {
    return `🎉 **Mind meld!**${exact ? '' : ' (counted as a match)'}\n${lines.join('\n')}`;
  }
  const [x, y] = players.map((p) => escapeMarkdown(words[p]));
  return [
    ...lines,
    `Next: a word that connects **${x}** and **${y}**.`,
    '-# Think a pair should have matched? Tell the organizers.',
  ].join('\n');
}
