export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades' | 'joker';
export type Rank =
  | 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10'
  | 'J' | 'Q' | 'K' | 'JKR';

export interface Card {
  rank: Rank;
  suit: Suit;
  id?: string;
}

export type GridPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface GridSlotPublic {
  position: GridPosition;
  hasCard: boolean;
}

export interface GridSlotPrivate extends GridSlotPublic {
  card: Card | null;
}

export type GamePhase = 'lobby' | 'dealing' | 'peek' | 'playing' | 'finished';

export interface PlayerPublic {
  id: string;
  name: string;
  isHost: boolean;
  score: number;
  scoreBoard: number;
  sessionScoreBoard: number;
  handSize: number;
  grid: GridSlotPrivate[];
}

export interface PlaydownWindow {
  endsAt: number;
  topCardRank: Rank;
  eligiblePlayers: string[];
  claimed: boolean;
}

export interface GiveCardWindow {
  endsAt: number;
  giverId: string;
  receiverId: string;
}

export type PowerType = 'peek-self' | 'peek-other' | 'swap' | 'double';

export interface PowerWindow {
  phase: 'decision' | 'action';
  playerId: string;
  endsAt: number;
  cardRank: Rank;
  powerType: PowerType;
  powerLabel: string;
  remainingPowers: ('peek' | 'swap')[] | null;
  swapSelection: { playerId: string; gridPosition: GridPosition } | null;
  peekedCards: { ownerId: string; position: GridPosition }[];
}

export interface LastSwap {
  swapperName: string;
  first: { playerId: string; position: GridPosition };
  second: { playerId: string; position: GridPosition };
}

export interface FinalResult {
  kaabooCallerId: string | null;
  kaabooCallerWon: boolean | null;
  scores: {
    id: string;
    name: string;
    cardScore: number;
    scoreBoard: number;
  }[];
}

export interface GameState {
  roomId: string;
  isPublic: boolean;
  phase: GamePhase;
  roundNumber: number;
  peekEndsAt: number | null;
  deckSize: number;
  discardPile: Card[];
  currentTurnPlayerId: string | null;
  turnOrder: string[];
  kaabooCallerId: string | null;
  playdownWindow: PlaydownWindow | null;
  giveCardWindow: GiveCardWindow | null;
  powerWindow: PowerWindow | null;
  lastSwap: LastSwap | null;
  lastReplace: { playerId: string; position: GridPosition } | null;
  finalResult: FinalResult | null;
  players: PlayerPublic[];
  myHand: Card[];
}
