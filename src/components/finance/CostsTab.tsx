import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Business, AdditionalCostRow } from '@/services/db';
import { costsApi } from '@/services/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/utils';
import ShippingZonesCard from './ShippingZonesCard';

const TYPES = [
  { value: 'per_order', label: 'Per order', hint: 'charged once per order (e.g. fulfillment)' },
  { value: 'per_product', label: 'Per product', hint: 'charged per unit sold (e.g. COGS)' },
  { value: 'fixed', label: 'Fixed', hint: 'recurring overhead (rent, salary, software)' },
] as const;

export default function CostsTab({ business, onChanged }: { business: Business; onChanged: () => void }) {
  const cur = business.currency ?? 'USD';
  const [rows, setRows] = useState<AdditionalCostRow[]>([]);
  const [form, setForm] = useState<{ name: string; type: AdditionalCostRow['type']; value: string; period: 'daily' | 'weekly' | 'monthly' }>({ name: '', type: 'per_order', value: '', period: 'monthly' });
  const [saving, setSaving] = useState(false);

  const load = async () => setRows(await costsApi.list(business.id));
  useEffect(() => { load(); }, [business.id]);

  const add = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await costsApi.create({
        business_id: business.id,
        name: form.name.trim(),
        type: form.type,
        value: parseFloat(form.value) || 0,
        period: form.type === 'fixed' ? form.period : null,
        is_active: true,
      });
      setForm({ name: '', type: 'per_order', value: '', period: 'monthly' });
      await load();
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const del = async (id: string) => { await costsApi.remove(id); await load(); onChanged(); };

  const grouped = TYPES.map((t) => ({ ...t, items: rows.filter((r) => r.type === t.value) }));

  return (
    <div className="space-y-5">
      <ShippingZonesCard business={business} onChanged={onChanged} />

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-4">Add a cost</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Shipping" />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as AdditionalCostRow['type'] })}>
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Amount</Label>
            <Input type="number" step="any" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="0" />
          </div>
          {form.type === 'fixed' ? (
            <div className="space-y-1.5">
              <Label>Period</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value as any })}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          ) : <div className="flex items-end"><p className="text-xs text-muted-foreground">{TYPES.find((t) => t.value === form.type)?.hint}</p></div>}
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={add} disabled={saving || !form.name.trim()}><Plus className="h-4 w-4 mr-1.5" /> Add cost</Button>
        </div>
      </div>

      {grouped.map((g) => (
        <div key={g.value} className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold">{g.label} costs</h3>
          <p className="text-xs text-muted-foreground mb-3">{g.hint}</p>
          {g.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">None yet.</p>
          ) : (
            <div className="space-y-2">
              {g.items.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                  <span>{c.name} {c.type === 'fixed' && c.period ? <span className="text-muted-foreground">· {c.period}</span> : null}</span>
                  <div className="flex items-center gap-3">
                    <span className="tabular-nums font-medium">{formatCurrency(Number(c.value), cur, true)}</span>
                    <button onClick={() => del(c.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
