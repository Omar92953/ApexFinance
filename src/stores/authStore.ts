import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

// Login page is bypassed "for now": the app auto-signs into a single shared
// account so it opens straight to the dashboard. NOTE: because the web build is
// public, anyone with the URL enters this same account — re-enable the real
// login (AuthPage) before storing sensitive data.
const DEFAULT_EMAIL = 'owner@apexbusiness.app';
const DEFAULT_PASSWORD = 'ApexOwner!2026';

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  init: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

async function autoLogin(): Promise<Session | null> {
  // Try to sign in; if the account doesn't exist yet, create it then sign in.
  let res = await supabase.auth.signInWithPassword({ email: DEFAULT_EMAIL, password: DEFAULT_PASSWORD });
  if (res.error) {
    await supabase.auth.signUp({ email: DEFAULT_EMAIL, password: DEFAULT_PASSWORD });
    res = await supabase.auth.signInWithPassword({ email: DEFAULT_EMAIL, password: DEFAULT_PASSWORD });
  }
  return res.data.session ?? null;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  loading: true,

  init: async () => {
    const { data } = await supabase.auth.getSession();
    let session = data.session;
    if (!session) {
      try { session = await autoLogin(); } catch { /* fall back to AuthPage */ }
    }
    set({ session, user: session?.user ?? null, loading: false });
    supabase.auth.onAuthStateChange((_event, s) => {
      set({ session: s, user: s?.user ?? null });
    });
  },

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  },

  signUp: async (email, password) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error?.message ?? null };
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null });
  },
}));
