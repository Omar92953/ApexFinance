import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';

// Login is disabled "for now": the app runs on a single shared local identity so
// it opens straight to the dashboard with no login page. Data access is opened up
// in the DB (see supabase/open_access.sql). NOTE: this means anyone with the URL
// can read/write the data — re-enable real auth before storing sensitive info.
// To restore login: revert this file + authStore usage and re-run the RLS section
// of supabase/schema.sql + supabase/crm_schema.sql.
export const LOCAL_USER_ID = '00000000-0000-0000-0000-000000000001';

const STUB_USER = { id: LOCAL_USER_ID, email: 'owner@apexbusiness.app' } as unknown as User;

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  init: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: STUB_USER,
  loading: false,

  init: async () => {
    // No authentication step — go straight in.
    set({ user: STUB_USER, session: null, loading: false });
  },

  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signOut: async () => { /* no-op while login is disabled */ },
}));
