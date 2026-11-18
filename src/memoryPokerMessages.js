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

const text = (content) => ({ type: 10, content });
const gallery = (url) => ({ type: 12, items: [{ media: { url } }] });
const button = (style, label, custom_id, extra = {}) => ({ type: 2, style, label, custom_id, ...extra });

const spotLabel = (id) => (id ? mention(id) : 'open');

export function lobbyComponents(gameId, spots, closesAtSec) {
  const flash = FLASH_MS / 1000;
  const answer = ANSWER_MS / 1000;
  return [
    text(
      [
        '# 🃏 Memory Poker',
        '*Memorize sixteen cards, then build the best five-card hand from two of them plus three shared cards.*',
        '',
        '## How to play:',
        '',
        `1. 16 cards are dealt face up on squares A to P. You have ${flash} seconds to memorize them.`,
        '2. The cards turn face down and three shared cards are revealed.',
        `3. You have ${answer} seconds to place your two markers on the squares you think make the best hand.`,
        '4. Both hands are revealed. The stronger poker hand wins the round.',
        '',
        `-# Best of ${STANDARD_ROUNDS}: the first to win ${WINS_NEEDED} rounds takes the duel.`,
      ].join('\n'),
    ),
    text(`Player 1: ${spotLabel(spots[0])}\nPlayer 2: ${spotLabel(spots[1])}\n-# Lobby closes <t:${closesAtSec}:R>. The countdown starts when both spots are taken.`),
    {
      type: 1,
      components: [button(1, 'Join as Player 1', joinId(gameId, 0)), button(1, 'Join as Player 2', joinId(gameId, 1))],
    },
  ];
}

export const lobbyClosedComponents = () => [
  text('## 🃏 Lobby closed\nNobody took both spots in time. Run `/memorypoker` to start a new one.'),
];

export function countdownComponents(n, players, round, wins) {
  if (players.length === 1) return [text(`# 🃏 ${round > 1 ? 'New board' : 'Memory Poker'}\n## Starting in ${n}…`)];
  const [a, b] = players;
  const tail = round > STANDARD_ROUNDS ? 'extra round, the next win takes the match' : `first to ${WINS_NEEDED}`;
  return [
    text(
      `# 🃏 Round ${round}: ${mention(a)} 🆚 ${mention(b)}\n` +
        (round > 1 ? `Score: ${mention(a)} ${wins[a]} · ${mention(b)} ${wins[b]} · ${tail}\n` : '') +
        `## Starting in ${n}…`,
    ),
  ];
}

// ✅ locked in, ⌛ ran out of time, ⏳ still picking.
export const lockStatus = (players, per) =>
  players.map((id) => `${per[id].answer !== null ? '✅' : per[id].forfeited ? '⌛' : '⏳'} ${mention(id)}`).join(' · ');


export const boardComponents = (board, hideAtSec, origin) => [
  text(`## 🃏 Memorize the board\n-# Hides <t:${hideAtSec}:R>`),
  gallery(imageUrl(origin, 'board', board)),
];

export const hiddenComponents = (shared, deadlineSec, origin, status) => [
  text('## 🃏 Board hidden\nYour cards are face down, lettered A to P. The three shared cards are on the bottom row.'),
  gallery(imageUrl(origin, 'hidden', shared)),
  text(`-# Press two squares to place your markers <t:${deadlineSec}:R>\n${status}`),
];

// The sixteen squares as buttons, on the public message. Two presses lock in a player's answer.
export const markerRows = (gameId, round) =>
  [0, 1, 2, 3].map((r) => ({
    type: 1,
    components: [...SQUARES.slice(r * 4, r * 4 + 4)].map((letter) => button(2, letter, pickId(gameId, round, letter))),
  }));

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

// A join button carries its spot (0 or 1) where other ids carry the round.
export const joinId = (gameId, spot) => `mp:join:${gameId}:${spot}`;
export const pickId = (gameId, round, letter) => `mp:pick:${gameId}:${round}:${letter}`;
export const nextId = (gameId, round) => `mp:next:${gameId}:${round}`;

export function parseId(customId) {
  const [, action, gameId, round, letter = ''] = customId.split(':');
  return { action, gameId, round: Number(round), letter };
}
