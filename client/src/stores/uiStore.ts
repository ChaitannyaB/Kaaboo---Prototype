import { create } from 'zustand';

const SOCIAL_COLLAPSED_KEY = 'social-collapsed';

interface UiState {
  socialCollapsed: boolean;
  chatOpen: boolean;
  rulesOpen: boolean;
  toggleSocial: () => void;
  setChatOpen: (v: boolean) => void;
  setRulesOpen: (v: boolean) => void;
}

const initialSocialCollapsed = ((): boolean => {
  try { return localStorage.getItem(SOCIAL_COLLAPSED_KEY) === '1'; } catch { return false; }
})();

export const useUiStore = create<UiState>((set, get) => ({
  socialCollapsed: initialSocialCollapsed,
  chatOpen: false,
  rulesOpen: false,
  toggleSocial: () => {
    const next = !get().socialCollapsed;
    try { localStorage.setItem(SOCIAL_COLLAPSED_KEY, next ? '1' : '0'); } catch { /* ignore */ }
    set({ socialCollapsed: next });
  },
  setChatOpen: (v) => set({ chatOpen: v }),
  setRulesOpen: (v) => set({ rulesOpen: v }),
}));
