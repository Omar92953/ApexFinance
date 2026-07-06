import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { asset } from '@/lib/asset';

export default function AuthPage() {
  const { signIn, signUp } = useAuthStore();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const fn = mode === 'signin' ? signIn : signUp;
      const { error } = await fn(email.trim(), password);
      if (error) {
        setError(error);
      } else if (mode === 'signup') {
        setNotice('Account created. If email confirmation is on, check your inbox — otherwise you can sign in now.');
        setMode('signin');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <img src={asset('icon.png')} alt="Apex Business Manager" className="h-14 w-14 object-contain mb-3" />
          <h1 className="text-2xl font-bold tracking-tight">Apex Business Manager</h1>
          <p className="text-sm text-muted-foreground mt-1">Finance, cost & customer management for your businesses</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-lg">
          <div className="flex rounded-lg bg-muted p-1 mb-6">
            {(['signin', 'signup'] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(null); setNotice(null); }}
                className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                  mode === m ? 'bg-background text-foreground shadow' : 'text-muted-foreground'
                }`}
              >
                {m === 'signin' ? 'Sign in' : 'Sign up'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
            {notice && <p className="text-sm text-success">{notice}</p>}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Your data is protected by row-level security — only you can read it.
        </p>
      </div>
    </div>
  );
}
