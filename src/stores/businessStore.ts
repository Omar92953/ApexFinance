import { create } from 'zustand';
import { businessesApi, type Business } from '@/services/db';

interface BusinessState {
  businesses: Business[];
  loading: boolean;
  loaded: boolean;
  fetch: () => Promise<void>;
  create: (b: Partial<Business>) => Promise<Business>;
  update: (id: string, patch: Partial<Business>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useBusinessStore = create<BusinessState>((set, get) => ({
  businesses: [],
  loading: false,
  loaded: false,

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
    set({ businesses: get().businesses.filter((x) => x.id !== id) });
  },
}));
