import { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Plus, Search, Package, Trash2, Check, ListTree } from 'lucide-react';
import type { Business, Product, ProductVariant } from '@/services/db';
import { productsApi } from '@/services/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { cn, formatCurrency } from '@/lib/utils';
import CostBreakdownDialog from './CostBreakdownDialog';
import { classifyStockHealth, computeAvgDailyUnits, type StockHealth } from '@/finance/stock-health';

const STOCK_TONE: Record<StockHealth['status'], string> = {
  out_of_stock: 'bg-destructive/15 text-destructive',
  below_safe_level: 'bg-warning/15 text-warning',
  healthy: 'bg-success/15 text-success',
  overstocked: 'bg-chart-4/15 text-chart-4',
  no_sales_data: 'bg-muted text-muted-foreground',
};

const STOCK_WINDOW_DAYS = 30;

export default function ProductsTab({ business }: { business: Business }) {
  const cur = business.currency ?? 'USD';
  const [products, setProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [drafts, setDrafts] = useState<Record<string, { cost?: string; price?: string; stock?: string }>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkField, setBulkField] = useState<'cost' | 'price' | 'stock'>('cost');
  const [bulkValue, setBulkValue] = useState('');
  const [csvText, setCsvText] = useState<string | null>(null);
  const [csvName, setCsvName] = useState('');
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ title: '', sku: '', price: '', cost: '', stock: '' });
  const [breakdownFor, setBreakdownFor] = useState<ProductVariant | null>(null);
  const [unitsSold, setUnitsSold] = useState<Record<string, number>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [p, v, sold] = await Promise.all([
        productsApi.listProducts(business.id),
        productsApi.listVariants(business.id),
        productsApi.unitsSoldBySku(business.id, STOCK_WINDOW_DAYS),
      ]);
      setProducts(p); setVariants(v); setUnitsSold(sold);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [business.id]);

  const stockHealthFor = (v: ProductVariant): StockHealth => {
    const sold = (v.sku && unitsSold[v.sku]) || 0;
    const avgDaily = computeAvgDailyUnits(sold, STOCK_WINDOW_DAYS);
    return classifyStockHealth(Number(v.inventory_qty) || 0, avgDaily);
  };

  const productTitle = useMemo(() => new Map(products.map((p) => [p.id, p.title])), [products]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return variants.filter((v) => !term || [productTitle.get(v.product_id), v.title, v.sku].filter(Boolean).join(' ').toLowerCase().includes(term));
  }, [variants, q, productTitle]);

  const allSelected = rows.length > 0 && rows.every((v) => selected.has(v.id));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((v) => v.id)));

  const commit = async (v: ProductVariant, field: 'cost' | 'price' | 'stock') => {
    const d = drafts[v.id]?.[field];
    if (d === undefined) return;
    const value = parseFloat(d) || 0;
    if (field === 'stock') await productsApi.setStock(business.id, v.id, value, Number(v.inventory_qty) || 0);
    else await productsApi.updateVariant(v.id, field === 'cost' ? { cost_per_item: value } : { price: value });
    setDrafts((prev) => { const n = { ...prev }; if (n[v.id]) delete n[v.id][field]; return n; });
    const key = field === 'cost' ? 'cost_per_item' : field === 'price' ? 'price' : 'inventory_qty';
    setVariants((prev) => prev.map((x) => (x.id === v.id ? { ...x, [key]: value } : x)));
  };

  const applyBulk = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    const value = parseFloat(bulkValue) || 0;
    const field = bulkField === 'cost' ? 'cost_per_item' : bulkField === 'price' ? 'price' : 'inventory_qty';
    await productsApi.bulkSet(ids, field, value);
    setBulkValue('');
    await load();
  };

  const bulkDelete = async () => {
    const ids = [...selected];
    if (!ids.length || !confirm(`Delete ${ids.length} variant(s)?`)) return;
    for (const id of ids) await productsApi.removeVariant(id);
    setSelected(new Set());
    await load();
  };

  const onFile = async (f: File | null) => { if (!f) return; setCsvName(f.name); setCsvText(await f.text()); setImportMsg(null); };
  const runImport = async () => {
    if (!csvText) return;
    setImporting(true); setImportMsg(null);
    try {
      const res = await productsApi.importFromShopifyCsv(business.id, csvText);
      setImportMsg(`Imported ${res.products} products, ${res.variants} variants.`);
      setCsvText(null); setCsvName(''); load();
    } catch (e) { setImportMsg(`Import failed: ${e instanceof Error ? e.message : e}`); }
    finally { setImporting(false); }
  };

  const addProduct = async () => {
    if (!form.title.trim()) return;
    const p = await productsApi.createProduct({ business_id: business.id, title: form.title.trim(), handle: form.title.trim().toLowerCase().replace(/\s+/g, '-') });
    await productsApi.createVariant({ business_id: business.id, product_id: p.id, sku: form.sku || null, title: 'Default', price: parseFloat(form.price) || 0, cost_per_item: parseFloat(form.cost) || 0, inventory_qty: parseFloat(form.stock) || 0 });
    setForm({ title: '', sku: '', price: '', cost: '', stock: '' });
    setAddOpen(false); load();
  };

  const margin = (v: ProductVariant) => { const p = Number(v.price) || 0, c = Number(v.cost_per_item) || 0; return p > 0 ? ((p - c) / p) * 100 : 0; };
  const cell = (v: ProductVariant, field: 'cost' | 'price' | 'stock', current: number) => (
    <Input className="h-8 w-24 text-right ml-auto" type="number" step="any"
      value={drafts[v.id]?.[field] ?? current}
      onChange={(e) => setDrafts((p) => ({ ...p, [v.id]: { ...p[v.id], [field]: e.target.value } }))}
      onBlur={() => commit(v, field)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
  );

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

      {/* Bulk edit bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <span className="text-muted-foreground">· Set</span>
          <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={bulkField} onChange={(e) => setBulkField(e.target.value as any)}>
            <option value="cost">Cost</option>
            <option value="price">Price</option>
            <option value="stock">Stock</option>
          </select>
          <Input type="number" step="any" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} placeholder="value" className="h-9 w-28" />
          <Button size="sm" onClick={applyBulk} disabled={bulkValue === ''}>Apply to {selected.size}</Button>
          <Button size="sm" variant="outline" onClick={bulkDelete}><Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

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
                  <th className="px-3 py-2.5 w-8"><button onClick={toggleAll} className={cn('h-4 w-4 rounded border flex items-center justify-center', allSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-input')}>{allSelected && <Check className="h-3 w-3" />}</button></th>
                  <th className="px-4 py-2.5 font-medium">Product</th>
                  <th className="px-4 py-2.5 font-medium">SKU</th>
                  <th className="px-4 py-2.5 font-medium text-right">Price</th>
                  <th className="px-4 py-2.5 font-medium text-right">Cost</th>
                  <th className="px-4 py-2.5 font-medium text-right">Margin</th>
                  <th className="px-4 py-2.5 font-medium text-right">Stock</th>
                  <th className="px-4 py-2.5 font-medium">Stock Health</th>
                  <th className="px-2 py-2.5" />
                  <th className="px-2 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => (
                  <tr key={v.id} className={cn('border-b border-border last:border-0', selected.has(v.id) && 'bg-primary/5')}>
                    <td className="px-3 py-2"><button onClick={() => toggle(v.id)} className={cn('h-4 w-4 rounded border flex items-center justify-center', selected.has(v.id) ? 'bg-primary border-primary text-primary-foreground' : 'border-input')}>{selected.has(v.id) && <Check className="h-3 w-3" />}</button></td>
                    <td className="px-4 py-2 font-medium">{productTitle.get(v.product_id) || '—'}<span className="text-muted-foreground">{v.title && v.title !== 'Default' ? ` · ${v.title}` : ''}</span></td>
                    <td className="px-4 py-2 text-muted-foreground">{v.sku || '—'}</td>
                    <td className="px-2 py-2 text-right">{cell(v, 'price', Number(v.price) || 0)}</td>
                    <td className="px-2 py-2 text-right">{cell(v, 'cost', Number(v.cost_per_item) || 0)}</td>
                    <td className={`px-4 py-2 text-right tabular-nums ${margin(v) < 0 ? 'text-destructive' : margin(v) >= 50 ? 'text-success' : ''}`}>{margin(v).toFixed(0)}%</td>
                    <td className="px-2 py-2 text-right">{cell(v, 'stock', Number(v.inventory_qty) || 0)}</td>
                    <td className="px-4 py-2">
                      {(() => {
                        const h = stockHealthFor(v);
                        return (
                          <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium', STOCK_TONE[h.status])}>
                            {h.label}
                            {h.daysOfCover !== null && <span className="opacity-70">· {h.daysOfCover.toFixed(0)}d</span>}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-2 py-2 text-right"><button onClick={() => setBreakdownFor(v)} title="Cost breakdown" className="text-muted-foreground hover:text-foreground"><ListTree className="h-3.5 w-3.5" /></button></td>
                    <td className="px-2 py-2 text-right"><button onClick={async () => { if (confirm('Delete this variant?')) { await productsApi.removeVariant(v.id); load(); } }} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">{rows.length} variants · Tick rows to bulk-set cost, price, or stock. Cost feeds COGS in your profit & statements.</p>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add product</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Batman Keychain" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label>SKU</Label><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Stock</Label><Input type="number" step="any" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></div>
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

      <CostBreakdownDialog
        business={business}
        variant={breakdownFor}
        label={breakdownFor ? `${productTitle.get(breakdownFor.product_id) || ''}${breakdownFor.title && breakdownFor.title !== 'Default' ? ' · ' + breakdownFor.title : ''}` : ''}
        open={breakdownFor !== null}
        onOpenChange={(v) => !v && setBreakdownFor(null)}
        onApplied={(newCost) => {
          if (breakdownFor) setVariants((prev) => prev.map((x) => (x.id === breakdownFor.id ? { ...x, cost_per_item: newCost } : x)));
        }}
      />
    </div>
  );
}
