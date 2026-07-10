import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Layers, AlertTriangle } from 'lucide-react';
import type { Business, ProductVariant, Product, CapitalAccount, BillOfMaterials, BomComponentRow } from '@/services/db';
import { productsApi, capitalApi, bomApi } from '@/services/db';
import { computeMaterialShortfall, computeMaxBuildable } from '@/finance/mrp';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

const CATEGORIES = ['labor', 'overhead', 'other'];

export default function BomTab({ business }: { business: Business }) {
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [accounts, setAccounts] = useState<CapitalAccount[]>([]);
  const [boms, setBoms] = useState<BillOfMaterials[]>([]);
  const [componentsByBom, setComponentsByBom] = useState<Record<string, BomComponentRow[]>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [finishedId, setFinishedId] = useState('');
  const [bomName, setBomName] = useState('');
  const [lines, setLines] = useState<Array<{ component_variant_id: string; quantity_per_unit: string }>>([{ component_variant_id: '', quantity_per_unit: '1' }]);

  const [batchBom, setBatchBom] = useState<BillOfMaterials | null>(null);
  const [batchQty, setBatchQty] = useState('');
  const [batchAccount, setBatchAccount] = useState('');
  const [extraCosts, setExtraCosts] = useState<Array<{ name: string; category: string; value: string }>>([{ name: '', category: 'labor', value: '' }]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [v, p, a, b] = await Promise.all([
      productsApi.listVariants(business.id), productsApi.listProducts(business.id),
      capitalApi.listAccounts(business.id), bomApi.list(business.id),
    ]);
    setVariants(v); setProducts(p); setAccounts(a); setBoms(b);
    if (!finishedId && v[0]) setFinishedId(v[0].id);
    if (!batchAccount && a[0]) setBatchAccount(a[0].id);
    const compEntries = await Promise.all(b.map(async (bom) => [bom.id, await bomApi.listComponents(bom.id)] as const));
    setComponentsByBom(Object.fromEntries(compEntries));
  };
  useEffect(() => { load(); }, [business.id]);

  const productTitle = useMemo(() => new Map(products.map((p) => [p.id, p.title])), [products]);
  const variantById = useMemo(() => new Map(variants.map((v) => [v.id, v])), [variants]);
  const variantLabel = (id: string) => {
    const v = variantById.get(id);
    if (!v) return '—';
    return `${productTitle.get(v.product_id) || 'Product'} · ${v.title || 'Default'}${v.sku ? ` (${v.sku})` : ''}`;
  };

  const createBom = async () => {
    if (!finishedId || lines.every((l) => !l.component_variant_id)) return;
    setSaving(true);
    try {
      await bomApi.create(business.id, finishedId, bomName || undefined, lines.filter((l) => l.component_variant_id).map((l) => ({ component_variant_id: l.component_variant_id, quantity_per_unit: parseFloat(l.quantity_per_unit) || 1 })));
      setBomName(''); setLines([{ component_variant_id: '', quantity_per_unit: '1' }]); setAddOpen(false);
      await load();
    } finally { setSaving(false); }
  };

  const openBatch = (bom: BillOfMaterials) => { setBatchBom(bom); setBatchQty(''); setExtraCosts([{ name: '', category: 'labor', value: '' }]); };

  const shortfall = useMemo(() => {
    if (!batchBom) return [];
    const comps = componentsByBom[batchBom.id] || [];
    return computeMaterialShortfall(comps.map((c) => ({ componentVariantId: c.component_variant_id, quantityPerUnit: c.quantity_per_unit, stockQty: Number(variantById.get(c.component_variant_id)?.inventory_qty) || 0 })), parseFloat(batchQty) || 0);
  }, [batchBom, componentsByBom, batchQty, variantById]);

  const hasShortfall = shortfall.some((s) => s.shortfall > 0);

  const recordBatch = async () => {
    if (!batchBom || !(parseFloat(batchQty) > 0) || hasShortfall) return;
    setSaving(true);
    try {
      await bomApi.recordBatch(business.id, batchBom.id, parseFloat(batchQty) || 0,
        extraCosts.filter((c) => c.name || c.value).map((c) => ({ name: c.name, category: c.category, value: parseFloat(c.value) || 0 })),
        batchAccount || null);
      setBatchBom(null);
      await load();
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Bills of Materials link a finished product to the components it's built from — recording a batch auto-fills cost and deducts component stock.</p>
        <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> New BOM</Button>
      </div>

      {boms.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Layers className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">No bills of materials yet</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
          {boms.map((bom) => {
            const comps = componentsByBom[bom.id] || [];
            const maxBuildable = computeMaxBuildable(comps.map((c) => ({ componentVariantId: c.component_variant_id, quantityPerUnit: c.quantity_per_unit, stockQty: Number(variantById.get(c.component_variant_id)?.inventory_qty) || 0 })));
            return (
              <div key={bom.id} className="px-5 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium text-sm">{bom.name || variantLabel(bom.finished_variant_id)}</div>
                    <div className="text-xs text-muted-foreground">Produces {variantLabel(bom.finished_variant_id)} · buildable now: <span className="font-medium text-foreground">{maxBuildable}</span> units</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => openBatch(bom)}>Record batch</Button>
                    <button onClick={async () => { await bomApi.remove(bom.id); await load(); }} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {comps.map((c) => <span key={c.id}>{variantLabel(c.component_variant_id)} × {c.quantity_per_unit}</span>)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>New bill of materials</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label>Name (optional)</Label><Input value={bomName} onChange={(e) => setBomName(e.target.value)} placeholder="e.g. Standard build" /></div>
            <div className="space-y-1.5">
              <Label>Finished product</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={finishedId} onChange={(e) => setFinishedId(e.target.value)}>
                {variants.map((v) => <option key={v.id} value={v.id}>{variantLabel(v.id)}</option>)}
              </select>
            </div>
            <Label>Components</Label>
            {lines.map((l, idx) => (
              <div key={idx} className="flex gap-2">
                <select className="flex h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm" value={l.component_variant_id} onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, component_variant_id: e.target.value } : x))}>
                  <option value="">— select component —</option>
                  {variants.map((v) => <option key={v.id} value={v.id}>{variantLabel(v.id)}</option>)}
                </select>
                <Input type="number" step="any" value={l.quantity_per_unit} onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, quantity_per_unit: e.target.value } : x))} placeholder="Qty" className="w-24" />
                <button onClick={() => setLines(lines.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-destructive px-1"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setLines([...lines, { component_variant_id: '', quantity_per_unit: '1' }])}><Plus className="h-3.5 w-3.5 mr-1.5" /> Add component</Button>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button><Button onClick={createBom} disabled={saving || !finishedId}>Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={batchBom !== null} onOpenChange={(v) => !v && setBatchBom(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Record batch — {batchBom?.name || (batchBom && variantLabel(batchBom.finished_variant_id))}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label>Quantity to produce</Label><Input type="number" step="any" value={batchQty} onChange={(e) => setBatchQty(e.target.value)} /></div>
              <div className="space-y-1.5">
                <Label>Debit capital account (extra costs)</Label>
                <select className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={batchAccount} onChange={(e) => setBatchAccount(e.target.value)}>
                  <option value="">— none —</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            </div>

            {shortfall.length > 0 && (
              <div className="space-y-1 text-xs">
                {shortfall.map((s) => (
                  <div key={s.componentVariantId} className={s.shortfall > 0 ? 'flex justify-between text-destructive' : 'flex justify-between text-muted-foreground'}>
                    <span>{variantLabel(s.componentVariantId)}</span>
                    <span>{s.qtyAvailable} in stock, need {s.qtyNeeded}{s.shortfall > 0 ? ` — short ${s.shortfall}` : ''}</span>
                  </div>
                ))}
                {hasShortfall && (
                  <div className="flex items-center gap-1.5 text-destructive font-medium mt-1"><AlertTriangle className="h-3.5 w-3.5" /> Not enough component stock — reduce quantity or restock first.</div>
                )}
              </div>
            )}

            <div>
              <Label>Extra costs (labor/overhead — paid in cash)</Label>
              <div className="mt-2 space-y-2">
                {extraCosts.map((it, idx) => (
                  <div key={idx} className="flex flex-wrap gap-2">
                    <Input value={it.name} onChange={(e) => setExtraCosts(extraCosts.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))} placeholder="Item (e.g. stitching labor)" className="flex-1 min-w-[140px]" />
                    <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={it.category} onChange={(e) => setExtraCosts(extraCosts.map((x, i) => i === idx ? { ...x, category: e.target.value } : x))}>
                      {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <Input type="number" step="any" value={it.value} onChange={(e) => setExtraCosts(extraCosts.map((x, i) => i === idx ? { ...x, value: e.target.value } : x))} placeholder="Cost" className="w-28" />
                    <button onClick={() => setExtraCosts(extraCosts.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-destructive px-1"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setExtraCosts([...extraCosts, { name: '', category: 'labor', value: '' }])}><Plus className="h-3.5 w-3.5 mr-1.5" /> Add cost line</Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchBom(null)}>Cancel</Button>
            <Button onClick={recordBatch} disabled={saving || !(parseFloat(batchQty) > 0) || hasShortfall}>{saving ? 'Recording…' : 'Record batch'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
