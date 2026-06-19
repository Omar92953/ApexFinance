import { create } from 'zustand';
import { settingsApi } from '@/services/db';

interface SettingsState {
  currency: string;
  theme: 'dark' | 'light';
  loaded: boolean;
  fetch: () => Promise<void>;
  setCurrency: (c: string) => Promise<void>;
  setTheme: (t: 'dark' | 'light') => Promise<void>;
}

function applyTheme(theme: 'dark' | 'light') {
  const root = document.documentElement;
  if (theme === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  currency: 'USD',
  theme: 'dark',
  loaded: false,

  fetch: async () => {
    try {
      const s = await settingsApi.get();
      const currency = s?.default_currency ?? 'USD';
      const theme = (s?.theme as 'dark' | 'light') ?? 'dark';
      applyTheme(theme);
      set({ currency, theme, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  setCurrency: async (currency) => {
    set({ currency });
    await settingsApi.save({ default_currency: currency });
  },

  setTheme: async (theme) => {
    applyTheme(theme);
    set({ theme });
    await settingsApi.save({ theme });
  },
}));
