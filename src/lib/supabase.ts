import { createClient } from '@supabase/supabase-js';

// The anon key is designed to be public — it only grants access that
// Row-Level Security policies allow. Real protection lives in the DB (RLS).
// Service-role keys and API secrets NEVER live here; they stay in Edge Functions.
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://gyqqrbchpepvchjgweep.supabase.co';
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5cXFyYmNocGVwdmNoamd3ZWVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4OTE2NTMsImV4cCI6MjA5NzQ2NzY1M30.u-QZVyko_G8_22_v8VHDRgRY9IQ-I1Rpbz4CQCrsfFs';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
