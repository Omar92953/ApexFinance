import { useSettingsStore } from '@/stores/settingsStore';
import { useAuthStore } from '@/stores/authStore';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'AED', 'SAR', 'EGP'];

export default function SettingsPage() {
  const { currency, theme, setCurrency, setTheme } = useSettingsStore();
  const { user } = useAuthStore();

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight mb-6">Settings</h1>

      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold mb-4">Preferences</h3>
          <div className="flex items-center justify-between py-2">
            <div>
              <Label>Default currency</Label>
              <p className="text-xs text-muted-foreground">Used for the global overview.</p>
            </div>
            <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex items-center justify-between py-2 border-t border-border">
            <div>
              <Label>Dark mode</Label>
              <p className="text-xs text-muted-foreground">Apex's signature dark theme.</p>
            </div>
            <Switch checked={theme === 'dark'} onCheckedChange={(v) => setTheme(v ? 'dark' : 'light')} />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold mb-3">Account</h3>
          <div className="text-sm">
            <div className="flex justify-between py-1.5"><span className="text-muted-foreground">Email</span><span>{user?.email}</span></div>
            <div className="flex justify-between py-1.5 border-t border-border"><span className="text-muted-foreground">Data security</span><span className="text-success">Row-level security · only you can read</span></div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold mb-1">About</h3>
          <p className="text-sm text-muted-foreground">Apex Finance v1.0 — web + desktop, backed by Supabase. Shopify & Meta live sync arrives in Phase 2.</p>
        </div>
      </div>
    </div>
  );
}
