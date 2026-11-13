const MAX_ROUNDS_SHOWN = 8;
const COLORS = { play: 0x5865f2, match: 0xf1c40f, ended: 0x95a5a6 };
const FOOTER = "Think this should've been a match? Ping the hosts!";

const escapeMarkdown = (word) => word.replace(/[\\*_`~|<>@\[\]()]/g, '\\$&');
const mention = (id) => `<@${id}>`;
const rounds = (n) => `${n} round${n === 1 ? '' : 's'}`;

const roundLine = (players, round, number) =>
  `Round ${number}: ${players.map((p) => `${mention(p)} **${escapeMarkdown(round[p])}**`).join(' · ')}`;

// Last MAX_ROUNDS_SHOWN rounds, numbered by their real position in the game.
function historyLines(players, history) {
  const first = Math.max(0, history.length - MAX_ROUNDS_SHOWN);
  const lines = history.slice(first).map((round, i) => roundLine(players, round, first + i + 1));
  return first > 0 ? ['-# …earlier rounds not shown', ...lines] : lines;
}

export function lobbyEmbed(players) {
  return {
    title: 'Mind Meld',
    color: COLORS.play,
    description: [
      `${mention(players[0])} and ${mention(players[1])}, it's time for **Mind Meld**!`,
      'Each of you privately enters a word. When both are in, they are revealed together.',
      'Then keep entering a word that connects the last two, until you land on the same one.',
    ].join('\n'),
  };
}

export function revealEmbed({ players, history, words, matched, exact }) {
  if (matched) {
    const note = exact ? [] : ['*(counted as a match)*'];
    return {
      title: `🎉 Mind meld in ${rounds(history.length)}!`,
      color: COLORS.match,
      description: [...note, ...historyLines(players, history)].join('\n'),
    };
  }
  const [x, y] = players.map((p) => escapeMarkdown(words[p]));
  const earlier = historyLines(players, history.slice(0, -1));
  return {
    title: `Round ${history.length}`,
    color: COLORS.play,
    description: [`Connect **${x}** ⟷ **${y}**`, ...(earlier.length ? ['', ...earlier] : [])].join('\n'),
    fields: players.map((p, i) => ({
      name: `Player ${i + 1}`,
      value: `**${escapeMarkdown(words[p])}**\n${mention(p)}`,
      inline: true,
    })),
    footer: { text: FOOTER },
  };
}

export function endedEmbed({ players, history, endedBy }) {
  const lines = historyLines(players, history);
  return {
    title: 'Game ended',
    color: COLORS.ended,
    description: [`${mention(endedBy)} ended the game after ${rounds(history.length)}.`, ...(lines.length ? ['', ...lines] : [])].join('\n'),
  };
}

// A "Use this word" button carries its word, which may itself contain ':'.
export const useButtonId = (gameId, round, word) => `mm:use:${gameId}:${round}:${word}`;

export function parseUseId(customId) {
  const [, , gameId, round, ...word] = customId.split(':');
  return { gameId, round: Number(round), word: word.join(':') };
}
