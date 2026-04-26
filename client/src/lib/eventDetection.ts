import type { GameState, PlayerPublic } from '@/types/game';

export interface DetectedEvent {
  text: string;
  type: string;
  clearBefore?: boolean;
}

export function detectGameEvents(
  prev: GameState | null,
  cur: GameState | null,
  myId: string | null,
): DetectedEvent[] {
  const entries: DetectedEvent[] = [];
  if (!cur) return entries;

  const players: PlayerPublic[] = cur.players ?? [];
  const pName = (id: string | null | undefined) => players.find((p) => p.id === id)?.name ?? '?';
  const you = (id: string | null | undefined) => (id === myId ? 'You' : pName(id));
  const pos = (p: string | null | undefined) => (p?.startsWith('extra') ? 'extra card' : p ?? '?');

  if (cur.roundNumber > 0 && cur.roundNumber !== (prev?.roundNumber ?? 0)) {
    return [{ text: `Round ${cur.roundNumber} started`, type: 'round', clearBefore: true }];
  }

  if (cur.phase === 'peek' && prev?.phase === 'lobby') {
    entries.push({ text: 'Game started — memorise your bottom two cards!', type: 'info' });
  }
  if (cur.phase === 'playing' && prev?.phase === 'peek') {
    entries.push({ text: 'Cards hidden — play begins', type: 'info' });
  }

  if (cur.phase === 'playing' && cur.currentTurnPlayerId && cur.currentTurnPlayerId !== prev?.currentTurnPlayerId) {
    const label = cur.currentTurnPlayerId === myId ? 'Your turn' : `${pName(cur.currentTurnPlayerId)}'s turn`;
    entries.push({ text: label, type: 'turn' });
  }

  if (cur.kaabooCallerId && !prev?.kaabooCallerId) {
    entries.push({ text: `${you(cur.kaabooCallerId)} called KAABOO!`, type: 'kaaboo' });
  }

  if ((cur.discardPile?.length ?? 0) > (prev?.discardPile?.length ?? 0) && !cur.playdownWindow?.claimed) {
    const topCard = cur.discardPile?.at(-1);
    for (const p of players) {
      const prevP = prev?.players?.find((pp) => pp.id === p.id);
      if (prevP && prevP.handSize === 1 && p.handSize === 0) {
        entries.push({ text: `${you(p.id)} played a ${topCard?.rank ?? '?'}`, type: 'action' });
        break;
      }
    }
  }

  if (cur.playdownWindow && !prev?.playdownWindow) {
    entries.push({ text: `Playdown window: ${cur.playdownWindow.topCardRank}s in play!`, type: 'playdown' });
  }
  if (cur.playdownWindow?.claimed && !prev?.playdownWindow?.claimed) {
    entries.push({ text: `Playdown! ${cur.playdownWindow.topCardRank} matched`, type: 'playdown-win' });
  }

  if (cur.giveCardWindow && !prev?.giveCardWindow) {
    entries.push({
      text: `${you(cur.giveCardWindow.giverId)} must give a card to ${you(cur.giveCardWindow.receiverId)}`,
      type: 'give',
    });
  }

  if (cur.powerWindow?.phase === 'decision' && prev?.powerWindow?.phase !== 'decision') {
    entries.push({
      text: `${you(cur.powerWindow.playerId)} drew a ${cur.powerWindow.cardRank} — ${cur.powerWindow.powerLabel}`,
      type: 'power',
    });
  }
  if (cur.powerWindow?.phase === 'action' && prev?.powerWindow?.phase === 'decision') {
    entries.push({ text: `${you(cur.powerWindow.playerId)} used their ${cur.powerWindow.cardRank} power`, type: 'power-used' });
  }
  if (!cur.powerWindow && prev?.powerWindow?.phase === 'decision') {
    entries.push({
      text: `${you(prev.powerWindow.playerId)} skipped their ${prev.powerWindow.cardRank} power`,
      type: 'power-skip',
    });
  }

  const prevPeeked = prev?.powerWindow?.peekedCards?.length ?? 0;
  const curPeeked = cur.powerWindow?.peekedCards?.length ?? 0;
  if (curPeeked > prevPeeked && cur.powerWindow) {
    const newest = cur.powerWindow.peekedCards[curPeeked - 1]!;
    const peeker = you(cur.powerWindow.playerId);
    const target = newest.ownerId === cur.powerWindow.playerId ? 'their own' : `${you(newest.ownerId)}'s`;
    entries.push({ text: `${peeker} peeked at ${target} card`, type: 'peek' });
  }

  if (cur.playdownWindow && !cur.playdownWindow.claimed) {
    for (const curP of cur.players) {
      const prevP = prev?.players?.find((pp) => pp.id === curP.id);
      const prevPosSet = new Set(prevP?.grid?.map((s) => s.position) ?? []);
      const newSlot = curP.grid.find((s) => s.hasCard && !prevPosSet.has(s.position));
      if (newSlot) entries.push({ text: `${you(curP.id)} got a penalty card!`, type: 'penalty' });
    }
  }

  if (prev?.giveCardWindow && !cur.giveCardWindow && cur.phase !== 'finished') {
    const { giverId, receiverId } = prev.giveCardWindow;
    entries.push({ text: `${you(giverId)} gave a card to ${you(receiverId)}`, type: 'give' });
  }

  if (!prev?.lastSwap && cur.lastSwap) {
    const swap = cur.lastSwap;
    const aOwner = swap.first.playerId === myId ? 'your' : `${pName(swap.first.playerId)}'s`;
    const bOwner = swap.second.playerId === myId ? 'your' : `${pName(swap.second.playerId)}'s`;
    entries.push({
      text: `${swap.swapperName} swapped ${aOwner} ${pos(swap.first.position)} with ${bOwner} ${pos(swap.second.position)}`,
      type: 'swap',
    });
  }

  if (cur.phase === 'finished' && prev?.phase !== 'finished' && cur.finalResult) {
    const caller = you(cur.finalResult.kaabooCallerId);
    const outcome = cur.finalResult.kaabooCallerWon ? 'WON' : 'LOST';
    entries.push({ text: `${caller} called Kaaboo and ${outcome}!`, type: cur.finalResult.kaabooCallerWon ? 'win' : 'loss' });
  }

  return entries;
}
