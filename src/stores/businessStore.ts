import { create } from 'zustand';
import { businessesApi, type Business } from '@/services/db';

const LAST_ACTIVE_KEY = 'apex.lastActiveBusinessId';

interface BusinessState {
  businesses: Business[];
  loading: boolean;
  loaded: boolean;
  lastActiveId: string | null;
  setLastActiveId: (id: string) => void;
  fetch: () => Promise<void>;
  create: (b: Partial<Business>) => Promise<Business>;
  update: (id: string, patch: Partial<Business>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useBusinessStore = create<BusinessState>((set, get) => ({
  businesses: [],
  loading: false,
  loaded: false,
  lastActiveId: typeof localStorage !== 'undefined' ? localStorage.getItem(LAST_ACTIVE_KEY) : null,

  setLastActiveId: (id) => {
    try { localStorage.setItem(LAST_ACTIVE_KEY, id); } catch { /* best-effort */ }
    set({ lastActiveId: id });
  },

  fetch: async () => {
    set({ loading: true });
    try {
      const businesses = await businessesApi.list();
      set({ businesses, loaded: true });
    } finally {
      set({ loading: false });
    }
  },

  create: async (b) => {
    const created = await businessesApi.create(b);
    set({ businesses: [...get().businesses, created] });
    return created;
  },

  update: async (id, patch) => {
    const updated = await businessesApi.update(id, patch);
    set({ businesses: get().businesses.map((x) => (x.id === id ? updated : x)) });
  },

  remove: async (id) => {
    await businessesApi.remove(id);
    set((s) => ({
      businesses: s.businesses.filter((x) => x.id !== id),
      lastActiveId: s.lastActiveId === id ? null : s.lastActiveId,
    }));
  },
}));
