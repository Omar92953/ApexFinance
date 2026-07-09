import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Business, ProductVariant, CostBreakdownItem } from '@/services/db';
import { productCostItemsApi } from '@/services/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatCurrency } from '@/lib/utils';

const CATEGORIES = ['materials', 'labor', 'packaging', 'other'];

export default function CostBreakdownDialog({
  business, variant, label, open, onOpenChange, onApplied,
}: { business: Business; variant: ProductVariant | null; label: string; open: boolean; onOpenChange: (v: boolean) => void; onApplied: (newCost: number) => void }) {
  const cur = business.currency ?? 'USD';
  const [items, setItems] = useState<CostBreakdownItem[]>([]);
  const [form, setForm] = useState({ name: '', category: 'materials', value: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => { if (variant) setItems(await productCostItemsApi.list(variant.id)); };
  useEffect(() => { if (open) load(); }, [open, variant]);

  if (!variant) return null;
  const total = items.reduce((s, i) => s + (Number(i.value) || 0), 0);

  const add = async () => {
    if (!form.name.trim() || !form.value) return;
    await productCostItemsApi.add(business.id, variant.id, { name: form.name.trim(), category: form.category, value: parseFloat(form.value) || 0 });
    setForm({ name: '', category: 'materials', value: '' });
    await load();
  };

  const del = async (id: string) => { await productCostItemsApi.remove(id); await load(); };

  const applyAndClose = async () => {
    setSaving(true);
    try {
      const newCost = await productCostItemsApi.applyToVariant(variant.id);
      onApplied(newCost);
      onOpenChange(false);
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Cost breakdown — {label}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-xs text-muted-foreground">Break the unit cost into materials, labor, packaging, etc. The total replaces this variant's cost per item.</p>

          <div className="space-y-2">
            {items.map((i) => (
              <div key={i.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <span>{i.name} <span className="text-muted-foreground capitalize">· {i.category}</span></span>
                <div className="flex items-center gap-2">
                  <span className="tabular-nums font-medium">{formatCurrency(Number(i.value) || 0, cur, true)}</span>
                  <button onClick={() => del(i.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
            {items.length === 0 && <p className="text-sm text-muted-foreground">No line items yet.</p>}
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Acrylic sheet" className="flex-1 min-w-[140px]" />
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <Input type="number" step="any" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="Cost" className="w-28" />
            <Button size="sm" variant="outline" onClick={add} disabled={!form.name.trim() || !form.value}><Plus className="h-3.5 w-3.5 mr-1.5" /> Add</Button>
          </div>

          <div className="flex justify-between border-t border-border pt-3 text-sm font-semibold">
            <span>Total unit cost</span>
            <span className="tabular-nums">{formatCurrency(total, cur, true)}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={applyAndClose} disabled={saving}>{saving ? 'Applying…' : 'Apply to cost'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
