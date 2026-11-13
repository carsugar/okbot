// Message text for Mind Meld. Plain Discord markdown (big headers, quote bars and
// small print), kept under the 2000-character message limit.
const MAX_ROUNDS_SHOWN = 6;
const DIVIDER = '▰'.repeat(16);
const OMITTED = '-# …earlier rounds not shown';
const FOOTER = "-# Think this should've been a match? Ping the hosts!";

const escapeMarkdown = (word) => word.replace(/[\\*_`~|<>@\[\]()]/g, '\\$&');
const mention = (id) => `<@${id}>`;
const rounds = (n) => `${n} round${n === 1 ? '' : 's'}`;

// Last MAX_ROUNDS_SHOWN rounds as [realRoundNumber, round] pairs, plus whether any were cut.
function lastRounds(history) {
  const first = Math.max(0, history.length - MAX_ROUNDS_SHOWN);
  return { cut: first > 0, shown: history.slice(first).map((round, i) => [first + i + 1, round]) };
}

const roundLine = (players, number, round, bold) =>
  `Round ${number} · ${players.map((p) => `${mention(p)} ${bold ? `**${escapeMarkdown(round[p])}**` : escapeMarkdown(round[p])}`).join(' · ')}`;

export function lobbyText(players) {
  return [
    '# 🧠 MIND MELD',
    '',
    `### ${mention(players[0])} ⚔️ ${mention(players[1])}`,
    '',
    '## 🎯 The goal',
    '> Mind Meld is a **collaborative word association game**. You are not competing, you are trying to get on the same wavelength.',
    '> Say the **same word** at the same time. The fewer rounds it takes, the better your score.',
    '',
    '## 🕹️ How to play',
    '> **1.** Press **Submit word** and privately enter any starting word. Nobody sees it yet.',
    '> **2.** When you have both entered one, the two words are revealed together.',
    '> **3.** Now each of you enters a **new word that connects the two revealed words**.',
    '> **4.** Repeat until you both enter the same word. 🎉',
    '',
    '## 💡 Example',
    '> 🌧️ **rain** + 🏜️ **desert** → one of you says **oasis**, the other says **cactus**',
    '> Those two are revealed, so now find a word that connects *oasis* and *cactus*...',
    '> Each round, you are both aiming for the middle ground between the last two words, so think about what your partner is likely to say.',
  ].join('\n');
}

export function revealText({ players, history, words, matched, exact }) {
  if (matched) {
    const { cut, shown } = lastRounds(history);
    const chain = shown.map(([n, round], i) =>
      i === shown.length - 1 ? `> ### ${roundLine(players, n, round, true)}` : `> ${roundLine(players, n, round, true)}`);
    return [
      '# 🎉 MIND MELD! 🎉',
      '',
      `## ⭐ ${rounds(history.length)} ⭐`,
      '',
      DIVIDER,
      '',
      ...(cut ? [OMITTED, ''] : []),
      ...chain,
      ...(exact ? [] : ['', '-# (counted as a match)']),
    ].join('\n');
  }

  const [x, y] = players.map((p) => escapeMarkdown(words[p]));
  const { cut, shown } = lastRounds(history.slice(0, -1));
  const earlier = shown.length
    ? ['-# 📜 Earlier rounds', ...(cut ? [OMITTED] : []), ...shown.map(([n, round]) => `-# ${roundLine(players, n, round, false)}`), '']
    : [];
  return [
    ...earlier,
    `## 🧠 Round ${history.length}`,
    '',
    ...players.map((p) => `> ### ${mention(p)} → **${escapeMarkdown(words[p])}**`),
    '',
    `### 🔗 Connect **${x}** ⟷ **${y}**`,
    '',
    FOOTER,
  ].join('\n');
}

export function endedText({ players, history, endedBy }) {
  const { cut, shown } = lastRounds(history);
  return [
    '## 🏁 Game ended',
    '',
    `${mention(endedBy)} called it after **${rounds(history.length)}**. No score.`,
    ...(shown.length
      ? ['', DIVIDER, '', ...(cut ? [OMITTED] : []), ...shown.map(([n, round]) => `> ${roundLine(players, n, round, true)}`)]
      : []),
  ].join('\n');
}

// A "Use this word" button carries its word, which may itself contain ':'.
export const useButtonId = (gameId, round, word) => `mm:use:${gameId}:${round}:${word}`;

export function parseUseId(customId) {
  const [, , gameId, round, ...word] = customId.split(':');
  return { gameId, round: Number(round), word: word.join(':') };
}
