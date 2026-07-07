import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Factory } from 'lucide-react';
import type { Business, ProductVariant, Product, CapitalAccount, ManufacturingBatch } from '@/services/db';
import { productsApi, capitalApi, manufacturingApi } from '@/services/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/utils';

const CATEGORIES = ['materials', 'labor', 'overhead', 'other'];

export default function ManufacturingTab({ business }: { business: Business }) {
  const cur = business.currency ?? 'USD';
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [accounts, setAccounts] = useState<CapitalAccount[]>([]);
  const [batches, setBatches] = useState<ManufacturingBatch[]>([]);
  const [variantId, setVariantId] = useState('');
  const [qty, setQty] = useState('');
  const [accountId, setAccountId] = useState('');
  const [items, setItems] = useState<Array<{ name: string; category: string; value: string }>>([{ name: '', category: 'materials', value: '' }]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [v, p, a, b] = await Promise.all([
      productsApi.listVariants(business.id), productsApi.listProducts(business.id),
      capitalApi.listAccounts(business.id), manufacturingApi.listBatches(business.id),
    ]);
    setVariants(v); setProducts(p); setAccounts(a); setBatches(b);
    if (!variantId && v[0]) setVariantId(v[0].id);
    if (!accountId && a[0]) setAccountId(a[0].id);
  };
  useEffect(() => { load(); }, [business.id]);

  const productTitle = useMemo(() => new Map(products.map((p) => [p.id, p.title])), [products]);
  const variantLabel = (v: ProductVariant) => `${productTitle.get(v.product_id) || 'Product'} · ${v.title || 'Default'}${v.sku ? ` (${v.sku})` : ''}`;

  const totalCost = items.reduce((s, i) => s + (parseFloat(i.value) || 0), 0);
  const unitCost = (parseFloat(qty) || 0) > 0 ? totalCost / (parseFloat(qty) || 1) : 0;

  const save = async () => {
    if (!variantId || !(parseFloat(qty) > 0)) return;
    setSaving(true);
    try {
      const v = variants.find((x) => x.id === variantId);
      await manufacturingApi.createBatch({
        business_id: business.id, variant_id: variantId, product_id: v?.product_id ?? null,
        quantity: parseFloat(qty) || 0,
        costItems: items.filter((i) => i.name || i.value).map((i) => ({ name: i.name, category: i.category, value: parseFloat(i.value) || 0 })),
        accountId: accountId || null,
      });
      setQty(''); setItems([{ name: '', category: 'materials', value: '' }]);
      await load();
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      {variants.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Factory className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">Add products first</p>
          <p className="text-sm text-muted-foreground">Manufacturing batches produce units of a product variant — import or add products in the Products tab.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold mb-4">New production batch</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5 lg:col-span-2">
              <Label>Product / variant</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={variantId} onChange={(e) => setVariantId(e.target.value)}>
                {variants.map((v) => <option key={v.id} value={v.id}>{variantLabel(v)}</option>)}
              </select>
            </div>
            <div className="space-y-1.5"><Label>Quantity produced</Label><Input type="number" step="any" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Debit capital account</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">— none —</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>

          <div className="mt-4">
            <Label>Cost breakdown</Label>
            <div className="mt-2 space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="flex flex-wrap gap-2">
                  <Input value={it.name} onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))} placeholder="Item (e.g. fabric)" className="flex-1 min-w-[140px]" />
                  <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={it.category} onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, category: e.target.value } : x))}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <Input type="number" step="any" value={it.value} onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, value: e.target.value } : x))} placeholder="Cost" className="w-28" />
                  <button onClick={() => setItems(items.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-destructive px-1"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setItems([...items, { name: '', category: 'materials', value: '' }])}><Plus className="h-3.5 w-3.5 mr-1.5" /> Add cost line</Button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <div className="text-sm text-muted-foreground">
              Total cost <span className="font-semibold text-foreground tabular-nums">{formatCurrency(totalCost, cur)}</span>
              <span className="mx-2">·</span>
              Unit cost <span className="font-semibold text-foreground tabular-nums">{formatCurrency(unitCost, cur, true)}</span>
            </div>
            <Button onClick={save} disabled={saving || !variantId || !(parseFloat(qty) > 0)}>{saving ? 'Saving…' : 'Record batch'}</Button>
          </div>
        </div>
      )}

      {/* Inventory summary */}
      {variants.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="border-b border-border px-5 py-3 text-sm font-semibold">Inventory (WAC)</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-muted-foreground"><tr className="text-left">
                <th className="px-4 py-2 font-medium">Variant</th><th className="px-4 py-2 font-medium text-right">Stock</th>
                <th className="px-4 py-2 font-medium text-right">Unit cost</th><th className="px-4 py-2 font-medium text-right">Stock value</th>
              </tr></thead>
              <tbody>
                {variants.map((v) => (
                  <tr key={v.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">{variantLabel(v)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{Number(v.inventory_qty) || 0}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(Number(v.cost_per_item) || 0, cur, true)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatCurrency((Number(v.inventory_qty) || 0) * (Number(v.cost_per_item) || 0), cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Batch history */}
      {batches.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="border-b border-border px-5 py-3 text-sm font-semibold">Batch history</div>
          <div className="divide-y divide-border">
            {batches.map((b) => (
              <div key={b.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <span className="text-muted-foreground">{b.date} · {Number(b.quantity_produced)} units</span>
                <span className="tabular-nums">{formatCurrency(Number(b.total_cost) || 0, cur)} <span className="text-muted-foreground">({formatCurrency(Number(b.cost_per_unit) || 0, cur, true)}/unit)</span></span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
