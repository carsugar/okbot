// Message text and custom ids for Memory Poker. Plain Discord markdown, kept under 2000 characters.
import { SQUARES, handName } from './pokerRules.js';
import { WINS_NEEDED, STANDARD_ROUNDS, FLASH_MS } from './pokerGame.js';

// Discord trims blank lines after a header and at the end of a message, so those gaps use this.
const SPACER = '​';
const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' };
const RANK_LABEL = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

export const modalLabel = 'Two squares, like C J';

export const cardLabel = (card) => `${RANK_LABEL[card.rank] ?? card.rank}${SUIT_SYMBOL[card.suit]}`;
const mention = (id) => `<@${id}>`;
const squaresLabel = ([i, j]) => `${SQUARES[i]} + ${SQUARES[j]}`;
const sharedLabel = (shared) => shared.map(cardLabel).join(' ');
const squareCards = (deal, picks) =>
  `${picks.map((i) => `${SQUARES[i]} ${cardLabel(deal.board[i])}`).join(' + ')} with ${sharedLabel(deal.shared)}`;

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

export function boardText(board, hideAtSec) {
  const cell = (i) => `${SQUARES[i]} ${cardLabel(board[i]).padEnd(3)}`;
  const rows = [0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((c) => cell(r * 4 + c)).join('   ').trimEnd());
  return ['## 🃏 Memorize the board', `-# Hides <t:${hideAtSec}:R>`, '', '```', ...rows, '```'].join('\n');
}

export function hiddenText(shared, deadlineSec) {
  return [
    '## 🃏 Board hidden',
    `Shared cards: **${shared.map(cardLabel).join('  ')}**`,
    `-# Pick your two squares <t:${deadlineSec}:R>`,
    SPACER,
  ].join('\n');
}

const playerBlock = (deal, result, id) => {
  if (result.picks[id] === null) return [`### ${mention(id)} · ran out of time`];
  return [`### ${mention(id)} · **${handName(result.hands[id])}**`, squareCards(deal, result.picks[id])];
};

function soloText(deal, result) {
  const a = result.analysis;
  if (!a) return ['## 🃏 Out of time', 'You did not pick in time.', SPACER].join('\n');
  const entry = (label, e) => [`${label} **${squaresLabel(e.picks)}** · **${handName(e.hand)}**`, squareCards(deal, e.picks)];
  if (a.found) {
    return [
      '## 🃏 You found the best hand!',
      ...entry('You picked', a.yours),
      '-# No other pick on this board beats it.',
      SPACER,
    ].join('\n');
  }
  return [
    '## 🃏 Not quite',
    ...entry('You picked', a.yours),
    '',
    ...entry('The best was', a.best),
    `-# Your hand beat ${a.beaten} of the ${a.total} possible picks.`,
    SPACER,
  ].join('\n');
}

export function roundText(players, result, deal) {
  if (result.outcome === 'solo') return soloText(deal, result);
  const [a, b] = players;
  const verdict = result.outcome === 'draw' ? '## 🤝 Draw' : `## 🏆 ${mention(result.winner)} takes the round`;
  const lines = [`## 🃏 Round ${result.round}`, '', ...playerBlock(deal, result, a), '', ...playerBlock(deal, result, b), '', verdict];
  if (result.finished) {
    const loser = result.matchWinner === a ? b : a;
    lines.push('', `# 🏆 ${mention(result.matchWinner)} wins the match, ${result.wins[result.matchWinner]} to ${result.wins[loser]}`);
    return lines.join('\n');
  }
  lines.push(`-# Score: ${mention(a)} ${result.wins[a]} · ${mention(b)} ${result.wins[b]} · first to ${WINS_NEEDED}`, SPACER);
  return lines.join('\n');
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
