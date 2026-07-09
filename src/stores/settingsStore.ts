import { create } from 'zustand';
import { settingsApi } from '@/services/db';

interface SettingsState {
  theme: 'dark' | 'light';
  loaded: boolean;
  fetch: () => Promise<void>;
  setTheme: (t: 'dark' | 'light') => Promise<void>;
}

function applyTheme(theme: 'dark' | 'light') {
  const root = document.documentElement;
  if (theme === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
}

// App is EGP-only — no currency picker/state.
export const useSettingsStore = create<SettingsState>((set) => ({
  theme: 'dark',
  loaded: false,

  fetch: async () => {
    try {
      const s = await settingsApi.get();
      const theme = (s?.theme as 'dark' | 'light') ?? 'dark';
      applyTheme(theme);
      set({ theme, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  setTheme: async (theme) => {
    applyTheme(theme);
    set({ theme });
    await settingsApi.save({ theme });
  },
}));
