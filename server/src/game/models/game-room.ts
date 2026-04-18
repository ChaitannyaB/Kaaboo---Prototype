import { Card, createShuffledDeck, shuffle, cardValue } from './deck';

const POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
const PEEK_POSITIONS = new Set(['bottom-left', 'bottom-right']);
const PEEK_DURATION_MS = 10_000;

export interface GridSlot { position: string; card: Card | null; }
export interface Player {
  id: string;
  userId: string | null;
  name: string;
  isHost: boolean;
  grid: GridSlot[];
  hand: Card[];
  score: number;
  scoreBoard: number;
  sessionScoreBoard: number;
}
interface PlaydownWindow {
  endsAt: number;
  topCard: Card;
  eligiblePlayers: string[];
  claimed: boolean;
}
interface GiveCardWindow { endsAt: number; giverId: string; receiverId: string; }
interface PowerWindow {
  phase: 'decision' | 'action';
  playerId: string;
  endsAt: number;
  cardRank: string;
  powerType: string;
  powerLabel: string;
  remainingPowers: string[] | null;
  swapSelection: { playerId: string; gridPosition: string } | null;
  peekedCards: { ownerId: string; position: string }[];
}
interface LastSwap {
  swapperName: string;
  first: { playerId: string; position: string };
  second: { playerId: string; position: string };
}

export function getPowerInfo(rank: string) {
  if (rank === '7' || rank === '8')  return { type: 'peek-self',  label: 'Peek one of your own cards' };
  if (rank === '9' || rank === '10') return { type: 'peek-other', label: 'Peek one opponent card' };
  if (rank === 'J')                  return { type: 'swap',       label: 'Blind-swap any two cards' };
  if (rank === 'Q')                  return { type: 'double',     label: 'Peek any card + Swap any two cards' };
  return null;
}

export class GameRoom {
  roomId: string;
  isPublic: boolean;
  phase: string;
  players: Player[];
  deck: Card[];
  discardPile: Card[];
  turnOrder: string[];
  currentTurnIndex: number;
  peekEndsAt: number | null;
  kaabooCallerId: string | null;
  _kaabooCallerWon: boolean | null;
  finishedAt: number | null;
  playdownWindow: PlaydownWindow | null;
  giveCardWindow: GiveCardWindow | null;
  powerWindow: PowerWindow | null;
  _lastDiscard: { rank: string; wasDrawn: boolean } | null;
  roundNumber: number;
  lastSwap: LastSwap | null;
  lastReplace: { playerId: string; position: string } | null;

  constructor(
    roomId: string,
    hostId: string,
    hostName: string,
    hostUserId: string | null = null,
    hostScoreBoard = 0,
    isPublic = true,
  ) {
    this.roomId = roomId;
    this.isPublic = isPublic;
    this.phase = 'lobby';
    this.players = [];
    this.deck = [];
    this.discardPile = [];
    this.turnOrder = [];
    this.currentTurnIndex = 0;
    this.peekEndsAt = null;
    this.kaabooCallerId = null;
    this._kaabooCallerWon = null;
    this.finishedAt = null;
    this.playdownWindow = null;
    this.giveCardWindow = null;
    this.powerWindow = null;
    this._lastDiscard = null;
    this.roundNumber = 0;
    this.lastSwap = null;
    this.lastReplace = null;

    this.addPlayer(hostId, hostName, true, hostUserId, hostScoreBoard);
  }

  // ── Lobby ──────────────────────────────────────────────────────────────────

  addPlayer(socketId: string, name: string, isHost = false, userId: string | null = null, scoreBoard = 0) {
    if (this.players.length >= 8) return { error: 'Room is full' };
    if (this.phase !== 'lobby') return { error: 'Game already in progress' };
    this.players.push({ id: socketId, userId, name, isHost, grid: [], hand: [], score: 0, scoreBoard, sessionScoreBoard: 0 });
    return { ok: true };
  }

  removePlayer(socketId: string) {
    const idx = this.players.findIndex((p) => p.id === socketId);
    if (idx === -1) return;
    const wasHost = this.players[idx].isHost;
    this.players.splice(idx, 1);
    if (wasHost && this.players.length > 0) this.players[0].isHost = true;
    if (this.players.length > 0) {
      this.turnOrder = this.turnOrder.filter((id) => id !== socketId);
      this.currentTurnIndex = this.currentTurnIndex % (this.turnOrder.length || 1);
    }
  }

  startGame() {
    if (this.players.length < 2) return { error: 'Need at least 2 players' };
    if (this.phase !== 'lobby' && this.phase !== 'finished') return { error: 'Game already in progress' };

    this.roundNumber++;
    this.kaabooCallerId = null;
    this._kaabooCallerWon = null;
    this.finishedAt = null;
    this._lastDiscard = null;
    this.playdownWindow = null;
    this.giveCardWindow = null;
    this.powerWindow = null;
    this.lastSwap = null;
    this.lastReplace = null;
    this.discardPile = [];

    this.deck = createShuffledDeck();
    for (const p of this.players) {
      p.grid = POSITIONS.map((pos) => ({ position: pos, card: this.deck.pop() }));
      p.hand = [];
    }

    this.turnOrder = shuffle(this.players.map((p) => p.id));
    this.currentTurnIndex = 0;
    this.phase = 'dealing';
    return { ok: true };
  }

  startPeek() {
    if (this.phase !== 'dealing') return;
    this.phase = 'peek';
    this.peekEndsAt = Date.now() + PEEK_DURATION_MS;
  }

  endPeek() {
    if (this.phase !== 'peek') return;
    this.phase = 'playing';
    this.peekEndsAt = null;
  }

  get currentTurnPlayerId(): string | null {
    return this.turnOrder[this.currentTurnIndex] ?? null;
  }

  nextTurn() {
    this.currentTurnIndex = (this.currentTurnIndex + 1) % this.turnOrder.length;
  }

  // ── Kaaboo ─────────────────────────────────────────────────────────────────

  callKaaboo(playerId: string) {
    this.lastSwap = null;
    if (this.phase !== 'playing') return { error: 'Game not in progress' };
    if (this.currentTurnPlayerId !== playerId) return { error: 'Not your turn' };
    if (this.kaabooCallerId) return { error: 'Kaaboo has already been called' };
    if (this.playdownWindow || this.giveCardWindow || this.powerWindow) {
      return { error: 'Cannot call Kaaboo during an active window' };
    }
    const player = this.players.find((p) => p.id === playerId);
    if (player?.hand.length > 0) return { error: 'Cannot call Kaaboo after drawing' };
    this.kaabooCallerId = playerId;
    return { ok: true };
  }

  endGame() {
    if (this.phase !== 'playing') return;
    this.phase = 'finished';
    this.finishedAt = Date.now();
    this.playdownWindow = null;
    this.giveCardWindow = null;
    this.powerWindow = null;

    const callerScore = this.calculatePlayerScore(this.kaabooCallerId);
    const otherScores = this.players
      .filter((p) => p.id !== this.kaabooCallerId)
      .map((p) => this.calculatePlayerScore(p.id));

    const minOther = otherScores.length > 0 ? Math.min(...otherScores) : Infinity;
    this._kaabooCallerWon = callerScore < minOther;

    const caller = this.players.find((p) => p.id === this.kaabooCallerId);
    if (caller) {
      const delta = this._kaabooCallerWon ? 1 : -1;
      caller.scoreBoard += delta;
      caller.sessionScoreBoard += delta;
    }
  }

  // ── Deck ───────────────────────────────────────────────────────────────────

  _reshuffleDiscardIntoDeck(): boolean {
    if (this.deck.length > 0) return true;
    if (this.discardPile.length <= 1) return false;
    const topCard = this.discardPile[this.discardPile.length - 1];
    const toReshuffle = this.discardPile.slice(0, -1);
    this.discardPile = [topCard];
    this.deck = shuffle(toReshuffle);
    console.log(`[deck] reshuffled ${this.deck.length} cards from discard pile`);
    return true;
  }

  // ── Draw ───────────────────────────────────────────────────────────────────

  drawCard(playerId: string) {
    this.lastSwap = null;
    this.lastReplace = null;
    this._reshuffleDiscardIntoDeck();
    if (this.deck.length === 0) return { error: 'Deck is empty' };
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return { error: 'Player not found' };
    if (player.hand.length > 0) return { error: 'Already holding a drawn card' };
    player.hand.push(this.deck.pop());
    return { ok: true };
  }

  // ── Discard / replace ──────────────────────────────────────────────────────

  discardDrawnCard(playerId: string) {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return { error: 'Player not found' };
    if (player.hand.length === 0) return { error: 'No drawn card to discard' };
    const card = player.hand.pop();
    this.discardPile.push(card);
    this._lastDiscard = { rank: card.rank, wasDrawn: true };
    return { ok: true, discardType: 'drawn' };
  }

  replaceGridCard(playerId: string, gridPosition: string) {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return { error: 'Player not found' };
    if (player.hand.length === 0) return { error: 'No drawn card to place' };
    const slot = player.grid.find((s) => s.position === gridPosition);
    if (!slot) return { error: 'Invalid grid position' };
    if (!slot.card) return { error: 'That grid position is empty' };
    const oldCard = slot.card;
    slot.card = player.hand.pop();
    this.discardPile.push(oldCard);
    this._lastDiscard = { rank: oldCard.rank, wasDrawn: false };
    this.lastReplace = { playerId, position: gridPosition };
    return { ok: true, discardType: 'replacement' };
  }

  // ── Play-down window ────────────────────────────────────────────────────────

  openPlaydownWindow(discardType: string, currentTurnPlayerId: string) {
    const eligible = discardType === 'replacement'
      ? this.players.filter((p) => p.id !== currentTurnPlayerId).map((p) => p.id)
      : this.players.map((p) => p.id);
    this.playdownWindow = {
      endsAt: Date.now() + 5_000,
      topCard: { ...this.discardPile.at(-1) },
      eligiblePlayers: eligible,
      claimed: false,
    };
  }

  closePlaydownWindow() { this.playdownWindow = null; }

  attemptPlayDown(attempterId: string, cardOwnerId: string, gridPosition: string) {
    if (!this.playdownWindow) return { error: 'No play-down window open' };
    if (this.playdownWindow.claimed) return { error: 'Already claimed' };
    if (!this.playdownWindow.eligiblePlayers.includes(attempterId)) {
      return { error: 'Not eligible to play down this turn' };
    }
    const owner = this.players.find((p) => p.id === cardOwnerId);
    if (!owner) return { error: 'Target player not found' };
    const slot = owner.grid.find((s) => s.position === gridPosition);
    if (!slot?.card) return { error: 'No card at that position' };

    if (slot.card.rank === this.playdownWindow.topCard.rank) {
      const card = slot.card;
      slot.card = null;
      this.discardPile.push(card);
      this.playdownWindow.claimed = true;
      const isOther = cardOwnerId !== attempterId;
      return { ok: true, giveCard: isOther, giverId: attempterId, receiverId: cardOwnerId };
    }

    const attempter = this.players.find((p) => p.id === attempterId);
    this._reshuffleDiscardIntoDeck();
    if (this.deck.length > 0) {
      attempter.grid.push({ position: `extra-${attempter.grid.filter(s => s.position.startsWith('extra-')).length}`, card: this.deck.pop() });
    }
    return { ok: false, penalty: true };
  }

  // ── Give-card window ────────────────────────────────────────────────────────

  openGiveCardWindow(giverId: string, receiverId: string) {
    this.giveCardWindow = { endsAt: Date.now() + 5_000, giverId, receiverId };
  }

  closeGiveCardWindow() { this.giveCardWindow = null; }

  giveCard(giverId: string, gridPosition: string) {
    if (!this.giveCardWindow) return { error: 'No give-card window open' };
    if (this.giveCardWindow.giverId !== giverId) return { error: 'Not the designated giver' };
    const giver = this.players.find((p) => p.id === giverId);
    const receiver = this.players.find((p) => p.id === this.giveCardWindow.receiverId);
    if (!giver || !receiver) return { error: 'Player not found' };
    const slot = giver.grid.find((s) => s.position === gridPosition);
    if (!slot?.card) return { error: 'No card at that position' };
    receiver.grid.push({ position: `extra-${receiver.grid.filter(s => s.position.startsWith('extra-')).length}`, card: slot.card });
    slot.card = null;
    this.closeGiveCardWindow();
    return { ok: true };
  }

  giveRandomCard() {
    if (!this.giveCardWindow) return;
    const giver = this.players.find((p) => p.id === this.giveCardWindow.giverId);
    const receiver = this.players.find((p) => p.id === this.giveCardWindow.receiverId);
    if (!giver || !receiver) { this.closeGiveCardWindow(); return; }
    const valid = giver.grid.filter((s) => s.card);
    if (valid.length > 0) {
      const slot = valid[Math.floor(Math.random() * valid.length)];
      receiver.grid.push({ position: `extra-${receiver.grid.filter(s => s.position.startsWith('extra-')).length}`, card: slot.card });
      slot.card = null;
    }
    this.closeGiveCardWindow();
  }

  // ── Power window ────────────────────────────────────────────────────────────

  openPowerDecisionWindow(playerId: string, cardRank: string): boolean {
    const info = getPowerInfo(cardRank);
    if (!info) return false;
    this.powerWindow = {
      phase: 'decision',
      playerId,
      endsAt: Date.now() + 5_000,
      cardRank,
      powerType: info.type,
      powerLabel: info.label,
      remainingPowers: info.type === 'double' ? ['peek', 'swap'] : null,
      swapSelection: null,
      peekedCards: [],
    };
    return true;
  }

  activatePowerAction(): boolean {
    if (!this.powerWindow || this.powerWindow.phase !== 'decision') return false;
    this.powerWindow.phase = 'action';
    this.powerWindow.endsAt = Date.now() + 20_000;
    return true;
  }

  closePowerWindow() { this.powerWindow = null; }

  powerPeek(playerId: string, targetPlayerId: string, gridPosition: string) {
    const pw = this.powerWindow;
    if (!pw || pw.phase !== 'action') return { error: 'No active power action' };
    if (pw.playerId !== playerId) return { error: 'Not your power' };
    if (pw.powerType === 'peek-self' && targetPlayerId !== playerId) {
      return { error: 'You can only peek at your own cards' };
    }
    if (pw.powerType === 'peek-other' && targetPlayerId === playerId) {
      return { error: "You can only peek at an opponent's card" };
    }
    if (pw.powerType === 'double' && !pw.remainingPowers.includes('peek')) {
      return { error: 'Peek power already used' };
    }
    const target = this.players.find((p) => p.id === targetPlayerId);
    if (!target) return { error: 'Target player not found' };
    const slot = target.grid.find((s) => s.position === gridPosition);
    if (!slot?.card) return { error: 'No card at that position' };

    pw.peekedCards.push({ ownerId: targetPlayerId, position: gridPosition });
    if (pw.remainingPowers) pw.remainingPowers = pw.remainingPowers.filter((p) => p !== 'peek');

    const complete = pw.remainingPowers === null || pw.remainingPowers.length === 0;
    return { ok: true, complete };
  }

  powerSwapSelect(playerId: string, targetPlayerId: string, gridPosition: string) {
    const pw = this.powerWindow;
    if (!pw || pw.phase !== 'action') return { error: 'No active power action' };
    if (pw.playerId !== playerId) return { error: 'Not your power' };
    if (pw.powerType !== 'swap' && pw.powerType !== 'double') return { error: 'No swap power' };
    if (pw.powerType === 'double' && !pw.remainingPowers.includes('swap')) {
      return { error: 'Swap power already used' };
    }
    const target = this.players.find((p) => p.id === targetPlayerId);
    if (!target) return { error: 'Player not found' };
    const slot = target.grid.find((s) => s.position === gridPosition);
    if (!slot?.card) return { error: 'No card at that position' };

    if (!pw.swapSelection) {
      pw.swapSelection = { playerId: targetPlayerId, gridPosition };
      return { ok: true, step: 'first', complete: false };
    }

    if (pw.swapSelection.playerId === targetPlayerId && pw.swapSelection.gridPosition === gridPosition) {
      return { error: 'Cannot swap a card with itself' };
    }

    const firstOwner = this.players.find((p) => p.id === pw.swapSelection.playerId);
    const firstSlot = firstOwner.grid.find((s) => s.position === pw.swapSelection.gridPosition);
    const swapper = this.players.find((p) => p.id === pw.playerId);

    const swapFirst = { playerId: pw.swapSelection.playerId, position: pw.swapSelection.gridPosition };
    const swapSecond = { playerId: targetPlayerId, position: gridPosition };

    [firstSlot.card, slot.card] = [slot.card, firstSlot.card];
    pw.swapSelection = null;

    this.lastSwap = { swapperName: swapper?.name ?? '?', first: swapFirst, second: swapSecond };

    if (pw.remainingPowers) pw.remainingPowers = pw.remainingPowers.filter((p) => p !== 'swap');
    const complete = pw.remainingPowers === null || pw.remainingPowers.length === 0;
    return { ok: true, step: 'second', complete };
  }

  powerSkipRemaining(playerId: string) {
    const pw = this.powerWindow;
    if (!pw || pw.phase !== 'action') return { error: 'No active power action' };
    if (pw.playerId !== playerId) return { error: 'Not your power' };
    pw.swapSelection = null;
    if (pw.remainingPowers) pw.remainingPowers = [];
    return { ok: true, complete: true };
  }

  // ── Scoring ─────────────────────────────────────────────────────────────────

  calculatePlayerScore(playerId: string): number {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return 0;
    return player.grid.reduce((sum, s) => sum + (s.card ? cardValue(s.card) : 0), 0);
  }

  isEmpty(): boolean { return this.players.length === 0; }

  // ── State serialization ─────────────────────────────────────────────────────

  _resolveCardVisibility(ownerId: string, position: string, card: Card | null, viewerId: string) {
    if (this.phase === 'finished') return card;
    if (this.phase === 'peek' && ownerId === viewerId && PEEK_POSITIONS.has(position)) return card;
    if (this.powerWindow?.phase === 'action' && this.powerWindow.playerId === viewerId) {
      if (this.powerWindow.peekedCards.some((p) => p.ownerId === ownerId && p.position === position)) {
        return card;
      }
    }
    return null;
  }

  getPublicState() {
    return {
      roomId: this.roomId,
      isPublic: this.isPublic,
      phase: this.phase,
      roundNumber: this.roundNumber,
      peekEndsAt: this.peekEndsAt,
      deckSize: this.deck.length,
      discardPile: this.discardPile,
      currentTurnPlayerId: this.currentTurnPlayerId,
      turnOrder: this.turnOrder,
      kaabooCallerId: this.kaabooCallerId,
      playdownWindow: this.playdownWindow
        ? {
            endsAt: this.playdownWindow.endsAt,
            topCardRank: this.playdownWindow.topCard.rank,
            eligiblePlayers: this.playdownWindow.eligiblePlayers,
            claimed: this.playdownWindow.claimed,
          }
        : null,
      giveCardWindow: this.giveCardWindow
        ? { endsAt: this.giveCardWindow.endsAt, giverId: this.giveCardWindow.giverId, receiverId: this.giveCardWindow.receiverId }
        : null,
      powerWindow: this.powerWindow
        ? {
            phase: this.powerWindow.phase,
            playerId: this.powerWindow.playerId,
            endsAt: this.powerWindow.endsAt,
            cardRank: this.powerWindow.cardRank,
            powerType: this.powerWindow.powerType,
            powerLabel: this.powerWindow.powerLabel,
            remainingPowers: this.powerWindow.remainingPowers,
            swapSelection: this.powerWindow.swapSelection,
            peekedCards: this.powerWindow.peekedCards,
          }
        : null,
      lastSwap: this.lastSwap,
      lastReplace: this.lastReplace,
      finalResult: this.phase === 'finished'
        ? {
            kaabooCallerId: this.kaabooCallerId,
            kaabooCallerWon: this._kaabooCallerWon,
            scores: this.players
              .map((p) => ({
                id: p.id,
                name: p.name,
                cardScore: this.calculatePlayerScore(p.id),
                scoreBoard: p.sessionScoreBoard,
              }))
              .sort((a, b) => a.cardScore - b.cardScore),
          }
        : null,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        isHost: p.isHost,
        score: p.score,
        scoreBoard: p.scoreBoard,
        sessionScoreBoard: p.sessionScoreBoard,
        handSize: p.hand.length,
        grid: p.grid.map((s) => ({ position: s.position, hasCard: s.card !== null })),
      })),
    };
  }

  getPlayerState(viewerId: string) {
    const pub = this.getPublicState();
    return {
      ...pub,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        isHost: p.isHost,
        score: p.score,
        scoreBoard: p.scoreBoard,
        sessionScoreBoard: p.sessionScoreBoard,
        handSize: p.hand.length,
        grid: p.grid.map((s) => ({
          position: s.position,
          hasCard: s.card !== null,
          card: this._resolveCardVisibility(p.id, s.position, s.card, viewerId),
        })),
      })),
      myHand: this.players.find((p) => p.id === viewerId)?.hand ?? [],
    };
  }
}
