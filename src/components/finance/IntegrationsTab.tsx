import { useEffect, useState } from 'react';
import { RefreshCw, Plug, CheckCircle2, XCircle, Trash2 } from 'lucide-react';
import type { Business, ConnectionStatus } from '@/services/db';
import { credentialsApi } from '@/services/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Platform = 'shopify' | 'meta';

const FIELDS: Record<Platform, { key: string; label: string; placeholder: string }[]> = {
  shopify: [
    { key: 'shopUrl', label: 'Store URL', placeholder: 'your-store.myshopify.com' },
    { key: 'accessToken', label: 'Admin API access token', placeholder: 'shpat_...' },
  ],
  meta: [
    { key: 'adAccountId', label: 'Ad Account ID', placeholder: '1234567890 (without act_)' },
    { key: 'accessToken', label: 'Access token', placeholder: 'EAAG...' },
  ],
};

export default function IntegrationsTab({ business, onChanged }: { business: Business; onChanged: () => void }) {
  const [status, setStatus] = useState<ConnectionStatus[]>([]);
  const [forms, setForms] = useState<Record<Platform, Record<string, string>>>({ shopify: {}, meta: {} });
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<Platform, string | null>>({ shopify: null, meta: null });

  const load = async () => setStatus(await credentialsApi.status(business.id));
  useEffect(() => { load(); }, [business.id]);

  const connectedOf = (p: Platform) => status.find((s) => s.platform === p);

  const connect = async (p: Platform) => {
    setBusy(`connect-${p}`); setMsg({ ...msg, [p]: null });
    try {
      await credentialsApi.connect(business.id, p, forms[p]);
      setForms({ ...forms, [p]: {} });
      await load();
      setMsg({ ...msg, [p]: 'Saved. Click "Sync now" to pull data.' });
    } catch (e) {
      setMsg({ ...msg, [p]: `Error: ${e instanceof Error ? e.message : e}` });
    } finally { setBusy(null); }
  };

  const sync = async (p: Platform) => {
    setBusy(`sync-${p}`); setMsg({ ...msg, [p]: null });
    try {
      const res = await credentialsApi.sync(business.id, p);
      if (res?.error) setMsg({ ...msg, [p]: `Sync error: ${res.error}` });
      else setMsg({ ...msg, [p]: `Synced ${res.days_written ?? 0} days${res.orders !== undefined ? ` · ${res.orders} orders` : ''}.` });
      await load();
      onChanged();
    } catch (e) {
      setMsg({ ...msg, [p]: `Sync failed: ${e instanceof Error ? e.message : e}` });
    } finally { setBusy(null); }
  };

  const disconnect = async (p: Platform) => {
    if (!confirm(`Disconnect ${p}? Synced data stays, but auto-sync stops.`)) return;
    await credentialsApi.disconnect(business.id, p);
    await load();
  };

  const Card = ({ p, title, hint }: { p: Platform; title: string; hint: string }) => {
    const conn = connectedOf(p);
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Plug className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">{title}</h3>
          </div>
          {conn ? (
            <span className={`inline-flex items-center gap-1 text-xs ${conn.is_valid ? 'text-success' : 'text-warning'}`}>
              {conn.is_valid ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
              {conn.is_valid ? 'Connected' : 'Saved (not synced)'}
            </span>
          ) : <span className="text-xs text-muted-foreground">Not connected</span>}
        </div>
        <p className="text-xs text-muted-foreground mb-4">{hint}</p>

        {conn ? (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              Last synced: {conn.last_verified ? new Date(conn.last_verified).toLocaleString() : 'never'}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => sync(p)} disabled={busy === `sync-${p}`}>
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${busy === `sync-${p}` ? 'animate-spin' : ''}`} /> Sync now
              </Button>
              <Button size="sm" variant="outline" onClick={() => disconnect(p)}>
                <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Disconnect
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {FIELDS[p].map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label>{f.label}</Label>
                <Input
                  value={forms[p][f.key] ?? ''}
                  onChange={(e) => setForms({ ...forms, [p]: { ...forms[p], [f.key]: e.target.value } })}
                  placeholder={f.placeholder}
                />
              </div>
            ))}
            <Button size="sm" onClick={() => connect(p)} disabled={busy === `connect-${p}`}>Connect</Button>
          </div>
        )}

        {msg[p] && <p className={`mt-3 text-xs ${msg[p]!.toLowerCase().includes('error') || msg[p]!.toLowerCase().includes('fail') ? 'text-destructive' : 'text-success'}`}>{msg[p]}</p>}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
        Connect your store and ad account to auto-fill sales and ad spend. Your tokens are stored securely and used only
        by the server-side sync — they are never exposed in the app. Auto-sync runs on a schedule; use <b>Sync now</b> for an immediate pull.
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card p="shopify" title="Shopify" hint="Pulls orders → gross/net sales, order count, units sold." />
        <Card p="meta" title="Meta Ads" hint="Pulls daily insights → ad spend & conversion value." />
      </div>
    </div>
  );
}
