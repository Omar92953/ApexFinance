import { useEffect, useState } from 'react';
import { Plus, Trash2, Tags } from 'lucide-react';
import type { Business, RateCard } from '@/services/db';
import { rateCardsApi } from '@/services/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatCurrency, cn } from '@/lib/utils';

export default function RateCardsTab({ business }: { business: Business }) {
  const cur = business.currency ?? 'EGP';
  const [rates, setRates] = useState<RateCard[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<RateCard>>({ hourly_rate: 0, cost_rate: 0 });
  const [saving, setSaving] = useState(false);

  const load = async () => setRates(await rateCardsApi.list(business.id));
  useEffect(() => { load(); }, [business.id]);

  const create = async () => {
    if (!form.name?.trim()) return;
    setSaving(true);
    try {
      await rateCardsApi.create({
        business_id: business.id,
        name: form.name.trim(),
        hourly_rate: Number(form.hourly_rate) || 0,
        cost_rate: Number(form.cost_rate) || 0,
      });
      setForm({ hourly_rate: 0, cost_rate: 0 });
      setOpen(false);
      await load();
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          What each kind of work bills at, and what it costs you to deliver — the gap is your real margin on every hour.
        </p>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> New rate</Button>
      </div>

      {rates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Tags className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">No rate cards yet</p>
          <p className="text-sm text-muted-foreground">Without these, logged hours can't be valued or costed.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-muted-foreground"><tr className="text-left">
              <th className="px-4 py-2 font-medium">Rate</th>
              <th className="px-4 py-2 font-medium text-right">Bills at</th>
              <th className="px-4 py-2 font-medium text-right">Costs</th>
              <th className="px-4 py-2 font-medium text-right">Margin / hr</th>
              <th className="px-4 py-2" />
            </tr></thead>
            <tbody>
              {rates.map((r) => {
                const margin = (Number(r.hourly_rate) || 0) - (Number(r.cost_rate) || 0);
                return (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">{r.name}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(r.hourly_rate, cur, true)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{formatCurrency(r.cost_rate, cur, true)}</td>
                    <td className={cn('px-4 py-2 text-right tabular-nums font-medium', margin < 0 ? 'text-destructive' : 'text-success')}>
                      {formatCurrency(margin, cur, true)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={async () => { await rateCardsApi.remove(r.id); await load(); }} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
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
          <DialogHeader><DialogTitle>New rate card</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label>Name</Label><Input value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Senior developer" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label>Hourly rate (billed)</Label><Input type="number" step="any" value={form.hourly_rate ?? 0} onChange={(e) => setForm({ ...form, hourly_rate: parseFloat(e.target.value) || 0 })} /></div>
              <div className="space-y-1.5"><Label>Cost per hour</Label><Input type="number" step="any" value={form.cost_rate ?? 0} onChange={(e) => setForm({ ...form, cost_rate: parseFloat(e.target.value) || 0 })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create} disabled={saving || !form.name?.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
