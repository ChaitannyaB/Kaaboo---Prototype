const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, id: `${rank}_${suit}` });
    }
  }
  // Two jokers
  deck.push({ suit: 'joker', rank: 'JKR', id: 'joker_1' });
  deck.push({ suit: 'joker', rank: 'JKR', id: 'joker_2' });
  return deck; // 54 cards
}

function shuffle(arr) {
  const d = [...arr];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function createShuffledDeck() {
  return shuffle(createDeck());
}

// Scoring: A=1, 2-10=face value, J=10, Q=10, K=0, Joker=-1. Suits ignored.
const CARD_VALUES = { A: 1, J: 10, Q: 10, K: 0, JKR: -1 };

function cardValue(card) {
  if (card.suit === 'joker') return -1;
  if (card.rank in CARD_VALUES) return CARD_VALUES[card.rank];
  return parseInt(card.rank, 10); // '2'..'10'
}

module.exports = { createDeck, shuffle, createShuffledDeck, cardValue };
