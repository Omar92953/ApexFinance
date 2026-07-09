import { useEffect, useState } from 'react';
import type { Business, ProductVariant, Product } from '@/services/db';
import { costRulesApi, productsApi } from '@/services/db';
import type { CostRule, CostCategory, AllocationBasis } from '@/finance/cost-rules';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

const CATEGORIES: { value: CostCategory; label: string }[] = [
  { value: 'cogs', label: 'COGS' },
  { value: 'fulfillment', label: 'Fulfillment' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'overhead', label: 'Overhead' },
  { value: 'fees', label: 'Fees' },
];

const BASES: { value: AllocationBasis; label: string; unit: string }[] = [
  { value: 'per_unit', label: 'Per unit sold', unit: 'EGP / unit' },
  { value: 'per_order', label: 'Per order', unit: 'EGP / order' },
  { value: 'percent_of_revenue', label: '% of revenue', unit: '% of net revenue' },
  { value: 'fixed_daily', label: 'Fixed — daily', unit: 'EGP / day' },
  { value: 'fixed_weekly', label: 'Fixed — weekly', unit: 'EGP / week' },
  { value: 'fixed_monthly', label: 'Fixed — monthly', unit: 'EGP / month' },
];

type FormState = {
  name: string; category: CostCategory; basis: AllocationBasis; value: string;
  scope_type: 'none' | 'product'; scope_id: string;
  effective_from: string; effective_to: string; is_active: boolean;
};

const emptyForm = (): FormState => ({
  name: '', category: 'overhead', basis: 'fixed_monthly', value: '',
  scope_type: 'none', scope_id: '',
  effective_from: new Date().toISOString().slice(0, 10), effective_to: '', is_active: true,
});

export default function CostRuleDialog({
  business, editing, open, onOpenChange, onSaved,
}: { business: Business; editing: (CostRule & { business_id: string }) | null; open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const [form, setForm] = useState<FormState>(emptyForm());
  const [products, setProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    productsApi.listProducts(business.id).then(setProducts);
    productsApi.listVariants(business.id).then(setVariants);
    if (editing) {
      setForm({
        name: editing.name, category: editing.category, basis: editing.basis, value: String(editing.value),
        scope_type: editing.scope_type, scope_id: editing.scope_id ?? '',
        effective_from: editing.effective_from, effective_to: editing.effective_to ?? '', is_active: editing.is_active,
      });
    } else {
      setForm(emptyForm());
    }
  }, [open, editing, business.id]);

  const productTitle = (id: string) => products.find((p) => p.id === id)?.title ?? '';

  const save = async () => {
    if (!form.name.trim() || !form.value) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(), category: form.category, basis: form.basis, value: parseFloat(form.value) || 0,
        scope_type: form.scope_type, scope_id: form.scope_type === 'product' ? (form.scope_id || null) : null,
        effective_from: form.effective_from, effective_to: form.effective_to || null, is_active: form.is_active,
      };
      if (editing) await costRulesApi.update(editing.id, payload);
      else await costRulesApi.create(business.id, payload);
      onSaved();
      onOpenChange(false);
    } finally { setSaving(false); }
  };

  const basisInfo = BASES.find((b) => b.value === form.basis);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? 'Edit cost rule' : 'New cost rule'}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. COD handling fee" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as CostCategory })}>
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Allocation</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.basis} onChange={(e) => setForm({ ...form, basis: e.target.value as AllocationBasis })}>
                {BASES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Value ({basisInfo?.unit})</Label>
            <Input type="number" step="any" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="0" />
          </div>

          <div className="space-y-1.5">
            <Label>Applies to</Label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.scope_type} onChange={(e) => setForm({ ...form, scope_type: e.target.value as 'none' | 'product', scope_id: '' })}>
              <option value="none">Whole business</option>
              <option value="product">One specific product</option>
            </select>
          </div>
          {form.scope_type === 'product' && (
            <div className="space-y-1.5">
              <Label>Product / variant</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.scope_id} onChange={(e) => setForm({ ...form, scope_id: e.target.value })}>
                <option value="">— select —</option>
                {variants.map((v) => <option key={v.id} value={v.id}>{productTitle(v.product_id)}{v.title && v.title !== 'Default' ? ` · ${v.title}` : ''}{v.sku ? ` (${v.sku})` : ''}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Effective from</Label>
              <Input type="date" value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Effective to (optional)</Label>
              <Input type="date" value={form.effective_to} onChange={(e) => setForm({ ...form, effective_to: e.target.value })} />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            Active
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || !form.name.trim() || !form.value}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create rule'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
