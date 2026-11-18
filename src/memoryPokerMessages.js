// Message text and custom ids for Memory Poker. Plain Discord markdown, kept under 2000 characters.
import { SQUARES, handName } from './pokerRules.js';
import { STANDARD_ROUNDS, FLASH_MS, ANSWER_MS, winsNeeded, toggleMarker } from './pokerGame.js';
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

// The title, the one-line idea and the four steps. Solo reads step 4 for one player.
const howToText = (solo) => {
  const flash = FLASH_MS / 1000;
  const answer = ANSWER_MS / 1000;
  return [
    '# 🃏 Memory Poker',
    '*Memorize sixteen cards, then build the best five-card hand from two of them plus three shared cards.*',
    '',
    '## How to play:',
    '',
    `1. 16 cards are dealt face up on squares A to P. You have ${flash} seconds to memorize them.`,
    '2. The cards turn face down and three shared cards are revealed.',
    `3. You have ${answer} seconds to place your two markers on the squares you think make the best hand.`,
    solo
      ? '4. Your hand is revealed, and you find out whether it was the best one on the board.'
      : '4. Both hands are revealed. The stronger poker hand wins the round.',
  ].join('\n');
};

const MATCH_LABEL = { 1: 'Single round', 3: 'Best of 3', 5: 'Best of 5' };

// A taken spot shows the player's avatar beside their name; an open one is just text.
const spotPart = (i, id, avatar) =>
  id && avatar
    ? { type: 9, components: [text(`Player ${i + 1}: ${mention(id)}`)], accessory: { type: 11, media: { url: avatar } } }
    : text(`Player ${i + 1}: ${spotLabel(id)}`);

const gap = { type: 14, divider: false, spacing: 2 };

// The instructions, the match length, who holds each spot right above the join buttons, and
// last the time left. Gaps keep the dropdown and the buttons apart.
export function lobbyComponents(gameId, spots, closesAtSec, bestOf = 1, avatars = {}) {
  return [
    text(howToText(false)),
    {
      type: 1,
      components: [{
        type: 3,
        custom_id: modeId(gameId),
        placeholder: 'Match length',
        options: Object.entries(MATCH_LABEL).map(([value, label]) => ({ label, value, default: Number(value) === bestOf })),
      }],
    },
    gap,
    ...spots.map((id, i) => spotPart(i, id, avatars[id])),
    {
      type: 1,
      components: [button(1, 'Join as Player 1', joinId(gameId, 0)), button(1, 'Join as Player 2', joinId(gameId, 1))],
    },
    gap,
    text(`-# Lobby closes <t:${closesAtSec}:R>. The countdown starts when both spots are taken.`),
  ];
}

// Solo practice: the instructions, then the countdown starts when the player presses Start.
export const soloStartComponents = (gameId) => [
  text(howToText(true)),
  { type: 1, components: [button(3, 'Start', startId(gameId))] },
];

export const lobbyClosedComponents = () => [
  text('## 🃏 Lobby closed\nNobody took both spots in time. Run `/memorypoker` to start a new one.'),
];

export function countdownComponents(n, players, round, wins, bestOf = STANDARD_ROUNDS) {
  if (players.length === 1) return [text(`# 🃏 ${round > 1 ? 'New board' : 'Memory Poker'}\n## Starting in ${n}…`)];
  const [a, b] = players;
  const tail = round > bestOf ? 'extra round, the next win takes the match' : `first to ${winsNeeded(bestOf)}`;
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
  text(`-# Your private picker has opened below. Place two markers, then Lock in <t:${deadlineSec}:R>\n${status}`),
];

// Each player's private copy of the grid: their picked squares are highlighted. `markers` is
// the squares picked so far, like 'CJ'.
export const pickerComponents = (gameId, round, deadlineSec, markers, sharedImage) => [
  text(`## 🃏 Place your markers\n-# Pick two squares, then Lock in <t:${deadlineSec}:R>` + (markers ? `\nSelected: **${[...markers].join(' + ')}**` : '')),
  ...(sharedImage ? [text('The three shared cards:'), gallery(sharedImage)] : []),
  ...[0, 1, 2, 3].map((r) => ({
    type: 1,
    components: [...SQUARES.slice(r * 4, r * 4 + 4)].map((letter) => button(markers.includes(letter) ? 1 : 2, letter, ppickId(gameId, round, letter))),
  })),
  { type: 1, components: [button(3, 'Lock in', plockId(gameId, round, /\/shared\/([A-Za-z0-9]+)\.png$/.exec(sharedImage ?? '')?.[1]), markers.length < 2 ? { disabled: true } : {})] },
];

// The picker as it will look after a press on `letter`, worked out from the message the
// player pressed on, so the answer can go back at once without waiting for the game's storage.
// Null if that message is not a picker we can read.
export function nextPicker(message, gameId, round, letter, origin) {
  const content = (message?.components ?? []).filter((c) => c.type === 10).map((c) => c.content).join('\n');
  const deadline = /<t:(\d+):R>/.exec(content)?.[1];
  const lock = (message?.components ?? []).filter((c) => c.type === 1).flatMap((r) => r.components).find((b) => b.custom_id?.startsWith('mp:plock:'));
  const shared = lock && parseId(lock.custom_id).letter;
  const square = SQUARES.indexOf(letter);
  if (!deadline || !shared || square < 0) return null;
  const selected = /Selected: \*\*(.+?)\*\*/.exec(content)?.[1].split(' + ').map((l) => SQUARES.indexOf(l)) ?? [];
  const markers = toggleMarker(selected, square).map((i) => SQUARES[i]).join('');
  return pickerComponents(gameId, round, Number(deadline), markers, `${origin}/mp/shared/${shared}.png`);
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

const readyLine = (players, ready) => text(readyStatus(players, ready));

// ✅ pressed Ready, ⏳ not yet.
export const readyStatus = (players, ready) =>
  `${players.map((id) => `${ready.includes(id) ? '✅' : '⏳'} ${mention(id)}`).join(' · ')} ready for the next round`;

// The result, then (unless the match is over) the button for the next round. In a duel both
// players press it, so the Ready line shows who has.
export function roundComponents(players, result, deal, origin, gameId, ready = []) {
  const solo = result.outcome === 'solo';
  const parts = solo ? soloParts(origin, deal, result) : duelParts(players, result, deal, origin);
  if (result.finished) return parts;
  return [
    ...parts,
    ...(!solo && ready.length ? [readyLine(players, ready)] : []),
    { type: 1, components: [button(1, solo ? 'New board' : 'Ready for next round', nextId(gameId, result.round))] },
  ];
}

function duelParts(players, result, deal, origin) {
  const [a, b] = players;
  const verdict = result.outcome === 'draw' ? '## 🤝 Draw' : `## 🏆 ${mention(result.winner)} takes the round`;
  const parts = [text(`## 🃏 Round ${result.round}`), ...playerParts(origin, deal, result, a), ...playerParts(origin, deal, result, b)];
  if (result.finished) {
    const loser = result.matchWinner === a ? b : a;
    return [...parts, text(`${verdict}\n# 🏆 ${mention(result.matchWinner)} wins the match, ${result.wins[result.matchWinner]} to ${result.wins[loser]}`)];
  }
  return [...parts, text(`${verdict}\n-# Score: ${mention(a)} ${result.wins[a]} · ${mention(b)} ${result.wins[b]} · first to ${winsNeeded(result.bestOf)}`)];
}

// ── Custom ids ────────────────────────────────────────────────────────────────

// A join button carries its spot (0 or 1) where other ids carry the round.
export const joinId = (gameId, spot) => `mp:join:${gameId}:${spot}`;
export const modeId = (gameId) => `mp:mode:${gameId}:0`;
export const startId = (gameId) => `mp:start:${gameId}:0`;
export const ppickId = (gameId, round, letter) => `mp:ppick:${gameId}:${round}:${letter}`;
// Lock in also carries the shared cards' codes, so a press can rebuild the picker from the message.
export const plockId = (gameId, round, shared = '') => `mp:plock:${gameId}:${round}${shared ? `:${shared}` : ''}`;
export const nextId = (gameId, round) => `mp:next:${gameId}:${round}`;

export function parseId(customId) {
  const [, action, gameId, round, letter = ''] = customId.split(':');
  return { action, gameId, round: Number(round), letter };
}
