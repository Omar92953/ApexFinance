import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, RefreshCw, CreditCard, AlertTriangle, Copy } from 'lucide-react';
import type { Business, SubscriptionRow } from '@/services/db';
import { subscriptionsApi } from '@/services/db';
import {
  monthlyCost, annualCost, totalMonthlySpend, assessWaste, totalWaste,
  upcomingRenewals, realisedSavings, duplicateCategories, type Subscription,
} from '@/finance/subscriptions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatCurrency, cn } from '@/lib/utils';

const DECISION_TONE: Record<string, string> = {
  keep: 'bg-success/15 text-success',
  renegotiate: 'bg-warning/15 text-warning',
  cancel: 'bg-destructive/15 text-destructive',
  undecided: 'bg-muted text-muted-foreground',
};

// Maps the DB row onto the shape the pure engine expects.
const toDomain = (r: SubscriptionRow): Subscription => ({
  id: r.id, name: r.name, vendor: r.vendor, amount: Number(r.amount) || 0, cycle: r.cycle,
  renewsOn: r.renews_on, seats: r.seats, activeSeats: r.active_seats, lastUsedOn: r.last_used_on,
  decision: r.decision, autoRenew: r.auto_renew, category: r.category,
});

export default function SubscriptionsTab({ business }: { business: Business }) {
  const cur = business.currency ?? 'EGP';
  const today = new Date().toISOString().slice(0, 10);
  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [form, setForm] = useState<Partial<SubscriptionRow>>({ cycle: 'monthly', amount: 0, auto_renew: true });

  const load = async () => setRows(await subscriptionsApi.list(business.id));
  useEffect(() => { load(); }, [business.id]);

  const subs = useMemo(() => rows.map(toDomain), [rows]);
  const monthly = useMemo(() => totalMonthlySpend(subs), [subs]);
  const waste = useMemo(() => totalWaste(subs, today), [subs, today]);
  const renewals = useMemo(() => upcomingRenewals(subs, today), [subs, today]);
  const saved = useMemo(() => realisedSavings(subs), [subs]);
  const dupes = useMemo(() => duplicateCategories(subs), [subs]);

  const create = async () => {
    if (!form.name?.trim()) return;
    setSaving(true);
    try {
      await subscriptionsApi.create({
        business_id: business.id, name: form.name.trim(), vendor: form.vendor || null,
        category: form.category || null, amount: Number(form.amount) || 0,
        cycle: form.cycle ?? 'monthly', renews_on: form.renews_on || null,
        seats: form.seats ? Number(form.seats) : null,
        active_seats: form.active_seats ? Number(form.active_seats) : null,
      });
      setForm({ cycle: 'monthly', amount: 0, auto_renew: true });
      setOpen(false);
      await load();
    } finally { setSaving(false); }
  };

  const runImport = async () => {
    setImporting(true);
    try {
      const n = await subscriptionsApi.importFromCostRules(business.id);
      alert(n === 0 ? 'No new recurring monthly cost rules to import.' : `Imported ${n} recurring cost${n === 1 ? '' : 's'}.`);
      await load();
    } finally { setImporting(false); }
  };

  const decide = async (id: string, decision: SubscriptionRow['decision']) => {
    await subscriptionsApi.decide(id, decision);
    await load();
  };

  const attestUsed = async (id: string) => {
    await subscriptionsApi.update(id, { last_used_on: today });
    await load();
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Recurring spend</div>
          <div className="text-2xl font-bold tabular-nums">{formatCurrency(monthly, cur)}</div>
          <p className="text-xs text-muted-foreground">{formatCurrency(monthly * 12, cur)} a year</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Likely waste</div>
          <div className={cn('text-2xl font-bold tabular-nums', waste > 0 && 'text-warning')}>{formatCurrency(waste, cur)}</div>
          <p className="text-xs text-muted-foreground">per month, on idle seats or unused tools</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Renewing soon</div>
          <div className="text-2xl font-bold tabular-nums">{renewals.length}</div>
          <p className="text-xs text-muted-foreground">{renewals.filter((r) => r.needsDecision).length} with no decision</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Saved so far</div>
          <div className="text-2xl font-bold tabular-nums text-success">{formatCurrency(saved, cur)}</div>
          <p className="text-xs text-muted-foreground">annual value of what you cancelled</p>
        </div>
      </div>

      {renewals.length > 0 && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-warning" /> Renewal calendar
          </h3>
          <div className="space-y-1.5">
            {renewals.map((r) => (
              <div key={r.subscription.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <span className="font-medium">{r.subscription.name}</span>
                  <span className="text-muted-foreground">
                    {' '}renews {r.daysUntil < 0 ? `${Math.abs(r.daysUntil)} days ago` : r.daysUntil === 0 ? 'today' : `in ${r.daysUntil} days`}
                    {' · '}{formatCurrency(r.amount, cur)}
                  </span>
                </span>
                {r.needsDecision && (
                  <div className="flex gap-1">
                    {(['keep', 'renegotiate', 'cancel'] as const).map((d) => (
                      <button key={d} onClick={() => decide(r.subscription.id, d)}
                        className="rounded px-1.5 py-0.5 text-[10px] bg-muted text-muted-foreground hover:text-foreground capitalize">{d}</button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {dupes.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs flex items-start gap-2">
          <Copy className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <span className="font-medium">Possible overlap: </span>
            {dupes.map((d) => `${d.subs.length} tools under "${d.category}"`).join('; ')}. Worth checking whether you need both.
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Every recurring charge, what it's worth, and an explicit decision on each — the alternative is renewing by default.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={runImport} disabled={importing}>
            <RefreshCw className={cn('h-4 w-4 mr-1.5', importing && 'animate-spin')} /> Import from cost rules
          </Button>
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> Add</Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <CreditCard className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">No subscriptions tracked</p>
          <p className="text-sm text-muted-foreground">Import your recurring monthly cost rules to start, then add anything else you pay for.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-muted-foreground"><tr className="text-left">
              <th className="px-4 py-2 font-medium">Tool</th>
              <th className="px-3 py-2 font-medium text-right">Per month</th>
              <th className="px-3 py-2 font-medium text-right">Per year</th>
              <th className="px-3 py-2 font-medium">Seats</th>
              <th className="px-3 py-2 font-medium">Assessment</th>
              <th className="px-3 py-2 font-medium">Decision</th>
              <th className="px-2 py-2" />
            </tr></thead>
            <tbody>
              {rows.map((r) => {
                const domain = toDomain(r);
                const w = assessWaste(domain, today);
                return (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-[11px] text-muted-foreground">{r.vendor || r.category || '—'}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(monthlyCost(domain), cur, true)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatCurrency(annualCost(domain), cur)}</td>
                    <td className="px-3 py-2 text-xs">{r.seats ? `${r.active_seats ?? 0}/${r.seats}` : '—'}</td>
                    <td className="px-3 py-2 text-xs">
                      {w.reason ? <span className="text-warning">{w.detail}</span> : <span className="text-muted-foreground">{w.detail}</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium capitalize', DECISION_TONE[r.decision])}>{r.decision}</span>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => attestUsed(r.id)} title="Confirm still in use"
                          className="rounded px-1.5 py-0.5 text-[10px] bg-muted text-muted-foreground hover:text-foreground">Used</button>
                        {(['keep', 'cancel'] as const).map((d) => (
                          <button key={d} onClick={() => decide(r.id, d)}
                            className="rounded px-1.5 py-0.5 text-[10px] bg-muted text-muted-foreground hover:text-foreground capitalize">{d}</button>
                        ))}
                        <button onClick={async () => { if (confirm(`Remove ${r.name}?`)) { await subscriptionsApi.remove(r.id); await load(); } }}
                          className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add subscription</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label>Name</Label><Input value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Shopify" /></div>
              <div className="space-y-1.5"><Label>Vendor</Label><Input value={form.vendor ?? ''} onChange={(e) => setForm({ ...form, vendor: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label>Amount per cycle</Label><Input type="number" step="any" value={form.amount ?? 0} onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })} /></div>
              <div className="space-y-1.5">
                <Label>Billing cycle</Label>
                <select className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={form.cycle} onChange={(e) => setForm({ ...form, cycle: e.target.value as SubscriptionRow['cycle'] })}>
                  <option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label>Renews on</Label><Input type="date" value={form.renews_on ?? ''} onChange={(e) => setForm({ ...form, renews_on: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Category</Label><Input value={form.category ?? ''} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Email" /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label>Seats paid for</Label><Input type="number" value={form.seats ?? ''} onChange={(e) => setForm({ ...form, seats: e.target.value ? parseInt(e.target.value) : null })} /></div>
              <div className="space-y-1.5"><Label>Seats actually used</Label><Input type="number" value={form.active_seats ?? ''} onChange={(e) => setForm({ ...form, active_seats: e.target.value ? parseInt(e.target.value) : null })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create} disabled={saving || !form.name?.trim()}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
