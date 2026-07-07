import { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Plus, Search, Package, Trash2 } from 'lucide-react';
import type { Business, Product, ProductVariant } from '@/services/db';
import { productsApi } from '@/services/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatCurrency } from '@/lib/utils';

export default function ProductsTab({ business }: { business: Business }) {
  const cur = business.currency ?? 'USD';
  const [products, setProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [drafts, setDrafts] = useState<Record<string, { cost?: string; price?: string }>>({});
  const [csvText, setCsvText] = useState<string | null>(null);
  const [csvName, setCsvName] = useState('');
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ title: '', sku: '', price: '', cost: '' });
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [p, v] = await Promise.all([productsApi.listProducts(business.id), productsApi.listVariants(business.id)]);
      setProducts(p); setVariants(v);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [business.id]);

  const productTitle = useMemo(() => new Map(products.map((p) => [p.id, p.title])), [products]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return variants.filter((v) => {
      if (!term) return true;
      return [productTitle.get(v.product_id), v.title, v.sku].filter(Boolean).join(' ').toLowerCase().includes(term);
    });
  }, [variants, q, productTitle]);

  const commit = async (v: ProductVariant, field: 'cost' | 'price') => {
    const d = drafts[v.id]?.[field];
    if (d === undefined) return;
    const value = parseFloat(d) || 0;
    await productsApi.updateVariant(v.id, field === 'cost' ? { cost_per_item: value } : { price: value });
    setDrafts((prev) => { const n = { ...prev }; if (n[v.id]) delete n[v.id][field]; return n; });
    setVariants((prev) => prev.map((x) => (x.id === v.id ? { ...x, [field === 'cost' ? 'cost_per_item' : 'price']: value } : x)));
  };

  const onFile = async (f: File | null) => {
    if (!f) return;
    setCsvName(f.name);
    setCsvText(await f.text());
    setImportMsg(null);
  };

  const runImport = async () => {
    if (!csvText) return;
    setImporting(true); setImportMsg(null);
    try {
      const res = await productsApi.importFromShopifyCsv(business.id, csvText);
      setImportMsg(`Imported ${res.products} products, ${res.variants} variants.`);
      setCsvText(null); setCsvName('');
      load();
    } catch (e) {
      setImportMsg(`Import failed: ${e instanceof Error ? e.message : e}`);
    } finally { setImporting(false); }
  };

  const addProduct = async () => {
    if (!form.title.trim()) return;
    const p = await productsApi.createProduct({ business_id: business.id, title: form.title.trim(), handle: form.title.trim().toLowerCase().replace(/\s+/g, '-') });
    await productsApi.createVariant({
      business_id: business.id, product_id: p.id, sku: form.sku || null, title: 'Default',
      price: parseFloat(form.price) || 0, cost_per_item: parseFloat(form.cost) || 0,
    });
    setForm({ title: '', sku: '', price: '', cost: '' });
    setAddOpen(false);
    load();
  };

  const margin = (v: ProductVariant) => {
    const p = Number(v.price) || 0, c = Number(v.cost_per_item) || 0;
    return p > 0 ? ((p - c) / p) * 100 : 0;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product, variant, SKU…" className="pl-8" />
        </div>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
        <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4 mr-1.5" /> Choose Shopify CSV</Button>
        <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> Add product</Button>
      </div>

      {csvText && (
        <div className="flex items-center justify-between rounded-lg border border-dashed border-border p-3 text-sm">
          <span className="text-muted-foreground">Ready to import <b>{csvName}</b></span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { setCsvText(null); setCsvName(''); }}>Cancel</Button>
            <Button size="sm" onClick={runImport} disabled={importing}>{importing ? 'Importing…' : 'Import now'}</Button>
          </div>
        </div>
      )}
      {importMsg && <p className={`text-xs ${importMsg.toLowerCase().includes('fail') ? 'text-destructive' : 'text-success'}`}>{importMsg}</p>}

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Package className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">No products{products.length ? ' match your search' : ' yet'}</p>
          <p className="text-sm text-muted-foreground">Import your Shopify product CSV (Products → Export in Shopify admin) or add one manually.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-muted-foreground">
                <tr className="text-left">
                  <th className="px-4 py-2.5 font-medium">Product</th>
                  <th className="px-4 py-2.5 font-medium">Variant</th>
                  <th className="px-4 py-2.5 font-medium">SKU</th>
                  <th className="px-4 py-2.5 font-medium text-right">Price</th>
                  <th className="px-4 py-2.5 font-medium text-right">Cost</th>
                  <th className="px-4 py-2.5 font-medium text-right">Margin</th>
                  <th className="px-4 py-2.5 font-medium text-right">Stock</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => (
                  <tr key={v.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-medium">{productTitle.get(v.product_id) || '—'}</td>
                    <td className="px-4 py-2 text-muted-foreground">{v.title || 'Default'}</td>
                    <td className="px-4 py-2 text-muted-foreground">{v.sku || '—'}</td>
                    <td className="px-2 py-2 text-right">
                      <Input className="h-8 w-24 text-right ml-auto" type="number" step="any"
                        value={drafts[v.id]?.price ?? (Number(v.price) || 0)}
                        onChange={(e) => setDrafts((p) => ({ ...p, [v.id]: { ...p[v.id], price: e.target.value } }))}
                        onBlur={() => commit(v, 'price')} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <Input className="h-8 w-24 text-right ml-auto" type="number" step="any"
                        value={drafts[v.id]?.cost ?? (Number(v.cost_per_item) || 0)}
                        onChange={(e) => setDrafts((p) => ({ ...p, [v.id]: { ...p[v.id], cost: e.target.value } }))}
                        onBlur={() => commit(v, 'cost')} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                    </td>
                    <td className={`px-4 py-2 text-right tabular-nums ${margin(v) < 0 ? 'text-destructive' : margin(v) >= 50 ? 'text-success' : ''}`}>{margin(v).toFixed(0)}%</td>
                    <td className="px-4 py-2 text-right tabular-nums">{Number(v.inventory_qty) || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">{rows.length} variants · Cost edits feed COGS in your profit & statements.</p>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add product</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Hydrating Serum" /></div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5"><Label>SKU</Label><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Price</Label><Input type="number" step="any" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Cost</Label><Input type="number" step="any" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={addProduct} disabled={!form.title.trim()}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
