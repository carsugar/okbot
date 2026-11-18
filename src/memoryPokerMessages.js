// Message text and custom ids for Memory Poker. Plain Discord markdown, kept under 2000 characters.
import { SQUARES, handName } from './pokerRules.js';
import { WINS_NEEDED, STANDARD_ROUNDS, FLASH_MS, ANSWER_MS } from './pokerGame.js';
import { imageUrl } from './cardImage.js';

// Discord trims blank lines after a header and at the end of a message, so those gaps use this.
const SPACER = '​';
const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' };
const RANK_LABEL = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

export const cardLabel = (card) => `${RANK_LABEL[card.rank] ?? card.rank}${SUIT_SYMBOL[card.suit]}`;
const mention = (id) => `<@${id}>`;
const squaresLabel = ([i, j]) => `${SQUARES[i]} + ${SQUARES[j]}`;

export function startText(players, round, wins) {
  const solo = players.length === 1;
  const seconds = FLASH_MS / 1000;
  if (round > 1) {
    if (solo) {
      return ['# 🃏 New board', SPACER, 'Press **Show me my board** when you are ready.', SPACER].join('\n');
    }
    const [a, b] = players;
    const tail = round > STANDARD_ROUNDS ? 'extra round, the next win takes the match' : `first to ${WINS_NEEDED}`;
    return [
      `# 🃏 Round ${round}: ${mention(a)} 🆚 ${mention(b)}`,
      SPACER,
      `Score: ${mention(a)} ${wins[a]} · ${mention(b)} ${wins[b]} · ${tail}`,
      '',
      'Press **Show me my board** when you are ready.',
      SPACER,
    ].join('\n');
  }

  const title = solo ? '# 🃏 Memory Poker' : `# 🃏 Memory Poker: ${mention(players[0])} 🆚 ${mention(players[1])}`;
  const answerSeconds = ANSWER_MS / 1000;
  return [
    title,
    SPACER,
    '*Memorize sixteen cards, then build the best five-card hand from two of them plus three shared cards.*',
    '',
    '## How to play:',
    '',
    `1. 16 cards are dealt face up on squares A to P. You have ${seconds} seconds to memorize them.`,
    '2. The cards turn face down and three shared cards are revealed.',
    `3. You have ${answerSeconds} seconds to place your two markers on the squares you think make the best hand.`,
    solo
      ? '4. Your hand is revealed, and you find out whether it was the best one on the board.'
      : '4. Both hands are revealed. The stronger poker hand wins the round.',
    '',
    ...(solo ? [] : [`-# Best of ${STANDARD_ROUNDS}: the first to win ${WINS_NEEDED} rounds takes the duel.`]),
    'Press **Show me my board** when you are ready.',
    SPACER,
  ].join('\n');
}

const text = (content) => ({ type: 10, content });
const gallery = (url) => ({ type: 12, items: [{ media: { url } }] });

export const boardComponents = (board, hideAtSec, origin) => [
  text(`## 🃏 Memorize the board\n-# Hides <t:${hideAtSec}:R>`),
  gallery(imageUrl(origin, 'board', board)),
];

// `sel` is the squares picked so far, like 'CJ'.
export const hiddenComponents = (shared, deadlineSec, origin, sel = '') => [
  text('## 🃏 Board hidden\nYour cards are face down, lettered A to P. The three shared cards are on the bottom row.'),
  gallery(imageUrl(origin, 'hidden', shared)),
  text(
    `-# Place your two markers <t:${deadlineSec}:R>` +
      (sel ? `\nSelected: **${[...sel].join(' + ')}**` : ''),
  ),
];

// Sixteen square buttons (the picks so far are highlighted), then Lock in and Clear.
export function pickerRows(gameId, round, sel) {
  const rows = [0, 1, 2, 3].map((r) => ({
    type: 1,
    components: [...SQUARES.slice(r * 4, r * 4 + 4)].map((letter) => ({
      type: 2,
      style: sel.includes(letter) ? 1 : 2,
      label: letter,
      custom_id: pickId(gameId, round, sel, letter),
    })),
  }));
  rows.push({
    type: 1,
    components: [
      { type: 2, style: 3, label: 'Lock in', custom_id: lockId(gameId, round, sel), ...(sel.length < 2 && { disabled: true }) },
      { type: 2, style: 2, label: 'Clear', custom_id: clearId(gameId, round), ...(!sel && { disabled: true }) },
    ],
  });
  return rows;
}

// A hand is the two picked squares followed by the three shared cards.
const handImage = (origin, deal, picks) => gallery(imageUrl(origin, 'hand', [...picks.map((i) => deal.board[i]), ...deal.shared]));

// A heading line, then that hand's picture.
const handParts = (origin, deal, heading, picks) => [text(heading), handImage(origin, deal, picks)];

const playerParts = (origin, deal, result, id) =>
  result.picks[id] === null
    ? [text(`### ${mention(id)} · ran out of time`)]
    : handParts(origin, deal, `### ${mention(id)} · **${handName(result.hands[id])}** · ${squaresLabel(result.picks[id])}`, result.picks[id]);

function soloParts(origin, deal, result) {
  const a = result.analysis;
  if (!a) return [text('## 🃏 Out of time\nYou did not pick in time.')];
  const entry = (label, e) => handParts(origin, deal, `${label} **${squaresLabel(e.picks)}** · **${handName(e.hand)}**`, e.picks);
  if (a.found) {
    return [text('## 🃏 You found the best hand!'), ...entry('You picked', a.yours), text('-# No other pick on this board beats it.')];
  }
  return [
    text('## 🃏 Not quite'),
    ...entry('You picked', a.yours),
    ...entry('The best was', a.best),
    text(`-# Your hand beat ${a.beaten} of the ${a.total} possible picks.`),
  ];
}

export function roundComponents(players, result, deal, origin) {
  if (result.outcome === 'solo') return soloParts(origin, deal, result);
  const [a, b] = players;
  const verdict = result.outcome === 'draw' ? '## 🤝 Draw' : `## 🏆 ${mention(result.winner)} takes the round`;
  const parts = [text(`## 🃏 Round ${result.round}`), ...playerParts(origin, deal, result, a), ...playerParts(origin, deal, result, b)];
  if (result.finished) {
    const loser = result.matchWinner === a ? b : a;
    return [...parts, text(`${verdict}\n# 🏆 ${mention(result.matchWinner)} wins the match, ${result.wins[result.matchWinner]} to ${result.wins[loser]}`)];
  }
  return [...parts, text(`${verdict}\n-# Score: ${mention(a)} ${result.wins[a]} · ${mention(b)} ${result.wins[b]} · first to ${WINS_NEEDED}`)];
}

// ── Custom ids ────────────────────────────────────────────────────────────────

export const showId = (gameId, round) => `mp:show:${gameId}:${round}`;
export const pickId = (gameId, round, sel, letter) => `mp:pick:${gameId}:${round}:${sel}:${letter}`;
export const lockId = (gameId, round, sel) => `mp:lock:${gameId}:${round}:${sel}`;
export const clearId = (gameId, round) => `mp:clear:${gameId}:${round}`;
export const nextId = (gameId, round) => `mp:next:${gameId}:${round}`;

export function parseId(customId) {
  const [, action, gameId, round, sel = '', letter = ''] = customId.split(':');
  return { action, gameId, round: Number(round), sel, letter };
}
