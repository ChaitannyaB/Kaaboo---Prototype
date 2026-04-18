import { create } from 'zustand';
import type { GameState } from '@/types/game';

interface GameStoreState {
  gameState: GameState | null;
  setGameState: (s: GameState | null) => void;
  reset: () => void;
}

export const useGameStore = create<GameStoreState>((set) => ({
  gameState: null,
  setGameState: (s) => set({ gameState: s }),
  reset: () => set({ gameState: null }),
}));
