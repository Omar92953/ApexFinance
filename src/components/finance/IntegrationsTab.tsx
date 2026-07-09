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

// Each Shopify data type syncs via its own Edge Function, on its own schedule.
const SHOPIFY_SYNCS: { fn: string; label: string; hint: string; resultKey: string }[] = [
  { fn: 'sync-shopify', label: 'Orders & sales', hint: 'Sales, order count, line items, auto stock deduction. Every 15 min.', resultKey: 'orders' },
  { fn: 'sync-shopify-products', label: 'Products & cost', hint: 'Catalog, price, cost per item, stock levels. Daily.', resultKey: 'products' },
  { fn: 'sync-shopify-customers', label: 'Customers', hint: 'Imports into the CRM contact list. Daily.', resultKey: 'imported' },
];

export default function IntegrationsTab({ business, onChanged }: { business: Business; onChanged: () => void }) {
  const [status, setStatus] = useState<ConnectionStatus[]>([]);
  const [forms, setForms] = useState<Record<Platform, Record<string, string>>>({ shopify: {}, meta: {} });
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, string | null>>({});

  const load = async () => setStatus(await credentialsApi.status(business.id));
  useEffect(() => { load(); }, [business.id]);

  const connectedOf = (p: Platform) => status.find((s) => s.platform === p);

  const connect = async (p: Platform) => {
    setBusy(`connect-${p}`); setMsg((m) => ({ ...m, [p]: null }));
    try {
      await credentialsApi.connect(business.id, p, forms[p]);
      setForms({ ...forms, [p]: {} });
      await load();
      setMsg((m) => ({ ...m, [p]: 'Saved. Use the sync buttons below to pull data.' }));
    } catch (e) {
      setMsg((m) => ({ ...m, [p]: `Error: ${e instanceof Error ? e.message : e}` }));
    } finally { setBusy(null); }
  };

  const disconnect = async (p: Platform) => {
    if (!confirm(`Disconnect ${p}? Synced data stays, but auto-sync stops.`)) return;
    await credentialsApi.disconnect(business.id, p);
    await load();
  };

  const runSync = async (fn: string, resultKey: string) => {
    setBusy(fn); setMsg((m) => ({ ...m, [fn]: null }));
    try {
      const res = await credentialsApi.sync(business.id, fn);
      if (res?.error) setMsg((m) => ({ ...m, [fn]: `Error: ${res.error}` }));
      else {
        const count = res?.[resultKey] ?? res?.days_written ?? 0;
        const extra = res?.stock_movements !== undefined ? ` · ${res.stock_movements} stock movements` : '';
        setMsg((m) => ({ ...m, [fn]: `Synced ${count}${extra}.` }));
      }
      await load();
      onChanged();
    } catch (e) {
      setMsg((m) => ({ ...m, [fn]: `Sync failed: ${e instanceof Error ? e.message : e}` }));
    } finally { setBusy(null); }
  };

  const shopifyConn = connectedOf('shopify');
  const metaConn = connectedOf('meta');

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
        Connect your store and ad account to auto-fill sales, products, and ad spend. Your tokens are stored securely
        and used only by server-side sync — they are never exposed in the app.
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Shopify */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2"><Plug className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">Shopify</h3></div>
            {shopifyConn ? (
              <span className={`inline-flex items-center gap-1 text-xs ${shopifyConn.is_valid ? 'text-success' : 'text-warning'}`}>
                {shopifyConn.is_valid ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                {shopifyConn.is_valid ? 'Connected' : 'Saved (not synced)'}
              </span>
            ) : <span className="text-xs text-muted-foreground">Not connected</span>}
          </div>
          <p className="text-xs text-muted-foreground mb-4">Requires Admin API scopes: read_orders, read_products, read_inventory, read_customers.</p>

          {shopifyConn ? (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground">Last synced: {shopifyConn.last_verified ? new Date(shopifyConn.last_verified).toLocaleString() : 'never'}</div>
              <div className="space-y-2">
                {SHOPIFY_SYNCS.map((s) => (
                  <div key={s.fn} className="rounded-lg border border-border p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium">{s.label}</div>
                        <div className="text-xs text-muted-foreground">{s.hint}</div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => runSync(s.fn, s.resultKey)} disabled={busy === s.fn}>
                        <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${busy === s.fn ? 'animate-spin' : ''}`} /> Sync
                      </Button>
                    </div>
                    {msg[s.fn] && <p className={`mt-1.5 text-xs ${msg[s.fn]!.toLowerCase().includes('error') || msg[s.fn]!.toLowerCase().includes('fail') ? 'text-destructive' : 'text-success'}`}>{msg[s.fn]}</p>}
                  </div>
                ))}
              </div>
              <Button size="sm" variant="ghost" onClick={() => disconnect('shopify')} className="text-muted-foreground">
                <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Disconnect
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {FIELDS.shopify.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label>{f.label}</Label>
                  <Input value={forms.shopify[f.key] ?? ''} onChange={(e) => setForms({ ...forms, shopify: { ...forms.shopify, [f.key]: e.target.value } })} placeholder={f.placeholder} />
                </div>
              ))}
              <Button size="sm" onClick={() => connect('shopify')} disabled={busy === 'connect-shopify'}>Connect</Button>
              {msg.shopify && <p className={`text-xs ${msg.shopify.toLowerCase().includes('error') ? 'text-destructive' : 'text-success'}`}>{msg.shopify}</p>}
            </div>
          )}
        </div>

        {/* Meta */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2"><Plug className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">Meta Ads</h3></div>
            {metaConn ? (
              <span className={`inline-flex items-center gap-1 text-xs ${metaConn.is_valid ? 'text-success' : 'text-warning'}`}>
                {metaConn.is_valid ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                {metaConn.is_valid ? 'Connected' : 'Saved (not synced)'}
              </span>
            ) : <span className="text-xs text-muted-foreground">Not connected</span>}
          </div>
          <p className="text-xs text-muted-foreground mb-4">Pulls daily insights → ad spend & conversion value. Every 15 min.</p>

          {metaConn ? (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground">Last synced: {metaConn.last_verified ? new Date(metaConn.last_verified).toLocaleString() : 'never'}</div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => runSync('sync-meta', 'days_written')} disabled={busy === 'sync-meta'}>
                  <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${busy === 'sync-meta' ? 'animate-spin' : ''}`} /> Sync now
                </Button>
                <Button size="sm" variant="ghost" onClick={() => disconnect('meta')} className="text-muted-foreground"><Trash2 className="h-3.5 w-3.5 mr-1.5" /> Disconnect</Button>
              </div>
              {msg['sync-meta'] && <p className={`text-xs ${msg['sync-meta']!.toLowerCase().includes('error') || msg['sync-meta']!.toLowerCase().includes('fail') ? 'text-destructive' : 'text-success'}`}>{msg['sync-meta']}</p>}
            </div>
          ) : (
            <div className="space-y-3">
              {FIELDS.meta.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label>{f.label}</Label>
                  <Input value={forms.meta[f.key] ?? ''} onChange={(e) => setForms({ ...forms, meta: { ...forms.meta, [f.key]: e.target.value } })} placeholder={f.placeholder} />
                </div>
              ))}
              <Button size="sm" onClick={() => connect('meta')} disabled={busy === 'connect-meta'}>Connect</Button>
              {msg.meta && <p className={`text-xs ${msg.meta.toLowerCase().includes('error') ? 'text-destructive' : 'text-success'}`}>{msg.meta}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
