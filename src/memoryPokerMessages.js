// Message text and custom ids for Memory Poker. Plain Discord markdown, kept under 2000 characters.
import { SQUARES, handName } from './pokerRules.js';
import { WINS_NEEDED, STANDARD_ROUNDS, FLASH_MS } from './pokerGame.js';
import { imageUrl } from './cardImage.js';

// Discord trims blank lines after a header and at the end of a message, so those gaps use this.
const SPACER = '​';
const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' };
const RANK_LABEL = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

export const modalLabel = 'Two squares, like C J';

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
  const intro = solo
    ? '*Memorize the board, pick two squares, and find out whether you found the best poker hand on it.*'
    : `*Memorize the board, then pick the two squares that make the best poker hand. It is best of ${STANDARD_ROUNDS}, so the first to win ${WINS_NEEDED} rounds takes the duel.*`;
  return [
    title,
    SPACER,
    intro,
    '',
    '## How to play:',
    '',
    `1. Press **Show me my board**. You get ${seconds} seconds to memorize the 16 cards before they are hidden.`,
    '2. Three shared cards are revealed.',
    '3. Pick two squares. Those two cards plus the three shared cards make your hand.',
    solo ? '4. I tell you whether you found the best hand.' : '4. The stronger poker hand wins the round.',
    SPACER,
  ].join('\n');
}

const text = (content) => ({ type: 10, content });
const gallery = (url) => ({ type: 12, items: [{ media: { url } }] });

export const boardComponents = (board, hideAtSec, origin) => [
  text(`## 🃏 Memorize the board\n-# Hides <t:${hideAtSec}:R>`),
  gallery(imageUrl(origin, 'board', board)),
];

export const hiddenComponents = (shared, deadlineSec, origin) => [
  text('## 🃏 Board hidden\nThe shared cards:'),
  gallery(imageUrl(origin, 'shared', shared)),
  text(`-# Pick your two squares <t:${deadlineSec}:R>`),
];

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
export const answerId = (gameId, round) => `mp:answer:${gameId}:${round}`;
export const nextId = (gameId, round) => `mp:next:${gameId}:${round}`;
export const modalId = (gameId, round) => `mp_modal:${gameId}:${round}`;

export function parseId(customId) {
  const parts = customId.split(':');
  if (parts[0] === 'mp_modal') return { action: 'modal', gameId: parts[1], round: Number(parts[2]) };
  return { action: parts[1], gameId: parts[2], round: Number(parts[3]) };
}
