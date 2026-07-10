import { useEffect, useMemo, useState } from 'react';
import { Plus, Check, ChevronDown, ChevronRight, PackageCheck, AlertTriangle } from 'lucide-react';
import type { Business, Supplier, PurchaseOrder, PurchaseOrderLine, ProductVariant, Product } from '@/services/db';
import { suppliersApi, purchaseOrdersApi, productsApi } from '@/services/db';
import { computeReorderSuggestions, type ReorderSuggestionRow } from '@/finance/compute';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { cn, formatCurrency } from '@/lib/utils';

type DraftLine = { variant_id: string; description: string; quantity_ordered: string; unit_cost: string };
const STATUS_TONE: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground', sent: 'bg-chart-3/20 text-chart-3',
  partially_received: 'bg-warning/15 text-warning', received: 'bg-success/15 text-success',
  closed: 'bg-muted text-muted-foreground', cancelled: 'bg-destructive/15 text-destructive',
};

export default function PurchaseOrdersTab({ business }: { business: Business }) {
  const cur = business.currency ?? 'EGP';
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [linesByPo, setLinesByPo] = useState<Record<string, PurchaseOrderLine[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [suggestions, setSuggestions] = useState<ReorderSuggestionRow[]>([]);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(new Set());

  const [newOpen, setNewOpen] = useState(false);
  const [newForm, setNewForm] = useState<{ supplier_id: string; po_number: string; expected_date: string }>({ supplier_id: '', po_number: '', expected_date: '' });
  const [draftLines, setDraftLines] = useState<DraftLine[]>([{ variant_id: '', description: '', quantity_ordered: '', unit_cost: '' }]);
  const [saving, setSaving] = useState(false);

  const [receiveFor, setReceiveFor] = useState<PurchaseOrder | null>(null);
  const [receiveQtys, setReceiveQtys] = useState<Record<string, { qty: string; cost: string }>>({});
  const [receiving, setReceiving] = useState(false);

  const productTitle = useMemo(() => new Map(products.map((p) => [p.id, p.title])), [products]);
  const supplierName = (id?: string | null) => suppliers.find((s) => s.id === id)?.name ?? '—';
  const variantLabel = (v: ProductVariant) => `${productTitle.get(v.product_id) || 'Product'}${v.title && v.title !== 'Default' ? ' · ' + v.title : ''}${v.sku ? ` (${v.sku})` : ''}`;

  const load = async () => {
    const [s, v, p, list, sugg] = await Promise.all([
      suppliersApi.list(business.id), productsApi.listVariants(business.id), productsApi.listProducts(business.id),
      purchaseOrdersApi.list(business.id), computeReorderSuggestions(business),
    ]);
    setSuppliers(s); setVariants(v); setProducts(p); setPos(list); setSuggestions(sugg);
  };
  useEffect(() => { load(); }, [business.id]);

  const toggleExpand = async (po: PurchaseOrder) => {
    setExpanded((s) => { const n = new Set(s); n.has(po.id) ? n.delete(po.id) : n.add(po.id); return n; });
    if (!linesByPo[po.id]) {
      const lines = await purchaseOrdersApi.listLines(po.id);
      setLinesByPo((m) => ({ ...m, [po.id]: lines }));
    }
  };

  const openNewFromSuggestions = () => {
    const lines: DraftLine[] = suggestions.filter((s) => selectedSuggestions.has(s.variantId))
      .map((s) => ({ variant_id: s.variantId, description: s.title, quantity_ordered: String(s.suggestedQty), unit_cost: '' }));
    setDraftLines(lines.length ? lines : [{ variant_id: '', description: '', quantity_ordered: '', unit_cost: '' }]);
    setNewForm({ supplier_id: suppliers[0]?.id ?? '', po_number: '', expected_date: '' });
    setNewOpen(true);
  };

  const createPO = async () => {
    const lines = draftLines.filter((l) => l.variant_id && l.quantity_ordered).map((l) => ({
      variant_id: l.variant_id, description: l.description || undefined,
      quantity_ordered: parseFloat(l.quantity_ordered) || 0, unit_cost: parseFloat(l.unit_cost) || 0,
    }));
    if (!lines.length) return;
    setSaving(true);
    try {
      await purchaseOrdersApi.create(business.id, { supplier_id: newForm.supplier_id || null, po_number: newForm.po_number || undefined, expected_date: newForm.expected_date || undefined }, lines);
      setNewOpen(false); setSelectedSuggestions(new Set()); setDraftLines([{ variant_id: '', description: '', quantity_ordered: '', unit_cost: '' }]);
      await load();
    } finally { setSaving(false); }
  };

  const openReceive = async (po: PurchaseOrder) => {
    const lines = linesByPo[po.id] ?? await purchaseOrdersApi.listLines(po.id);
    setLinesByPo((m) => ({ ...m, [po.id]: lines }));
    const initial: Record<string, { qty: string; cost: string }> = {};
    for (const l of lines) {
      const remaining = Number(l.quantity_ordered) - Number(l.quantity_received);
      if (remaining > 0) initial[l.id] = { qty: String(remaining), cost: String(l.unit_cost) };
    }
    setReceiveQtys(initial);
    setReceiveFor(po);
  };

  const submitReceive = async () => {
    if (!receiveFor) return;
    const lines = Object.entries(receiveQtys).filter(([, v]) => parseFloat(v.qty) > 0)
      .map(([po_line_id, v]) => ({ po_line_id, quantity_received: parseFloat(v.qty) || 0, unit_cost: parseFloat(v.cost) || 0 }));
    if (!lines.length) return;
    setReceiving(true);
    try {
      await purchaseOrdersApi.receive(business.id, receiveFor.id, lines);
      setReceiveFor(null);
      setLinesByPo((m) => { const n = { ...m }; delete n[receiveFor.id]; return n; });
      await load();
    } finally { setReceiving(false); }
  };

  return (
    <div className="space-y-5">
      {/* Reorder suggestions */}
      {suggestions.length > 0 && (
        <div className="rounded-xl border border-warning/40 bg-warning/5 p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold flex items-center gap-1.5"><AlertTriangle className="h-4 w-4 text-warning" /> Reorder suggestions</h3>
            <Button size="sm" onClick={openNewFromSuggestions} disabled={selectedSuggestions.size === 0}>Create PO from {selectedSuggestions.size || ''} selected</Button>
          </div>
          <div className="space-y-1.5">
            {suggestions.map((s) => (
              <label key={s.variantId} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm cursor-pointer">
                <input type="checkbox" checked={selectedSuggestions.has(s.variantId)} onChange={() => setSelectedSuggestions((set) => { const n = new Set(set); n.has(s.variantId) ? n.delete(s.variantId) : n.add(s.variantId); return n; })} />
                <span className="flex-1">{s.title}</span>
                <span className="text-xs text-muted-foreground">Stock {s.stockQty} · {s.avgDailyUnits.toFixed(1)}/day</span>
                <span className="font-medium tabular-nums">Order {s.suggestedQty}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Purchase orders track what you've ordered from suppliers, full or partial receiving, and the resulting cost/stock/AP updates.</p>
        <Button onClick={() => { setNewForm({ supplier_id: suppliers[0]?.id ?? '', po_number: '', expected_date: '' }); setDraftLines([{ variant_id: '', description: '', quantity_ordered: '', unit_cost: '' }]); setNewOpen(true); }}>
          <Plus className="h-4 w-4 mr-1.5" /> New purchase order
        </Button>
      </div>

      {pos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <PackageCheck className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">No purchase orders yet</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="divide-y divide-border">
            {pos.map((po) => {
              const lines = linesByPo[po.id];
              return (
                <div key={po.id}>
                  <button onClick={() => toggleExpand(po)} className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-muted/40">
                    <div className="flex items-center gap-2 text-sm">
                      {expanded.has(po.id) ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                      <span className="font-medium">{po.po_number || `PO ${po.id.slice(0, 8)}`}</span>
                      <span className="text-muted-foreground">{supplierName(po.supplier_id)} · {po.order_date}</span>
                    </div>
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium capitalize', STATUS_TONE[po.status])}>{po.status.replace(/_/g, ' ')}</span>
                  </button>
                  {expanded.has(po.id) && lines && (
                    <div className="bg-muted/20 px-5 py-3 space-y-2">
                      {lines.map((l) => (
                        <div key={l.id} className="flex items-center justify-between text-xs">
                          <span>{variants.find((v) => v.id === l.variant_id)?.sku || l.description || 'Line item'}</span>
                          <span className="tabular-nums">{l.quantity_received}/{l.quantity_ordered} received · {formatCurrency(Number(l.unit_cost), cur, true)}/unit</span>
                        </div>
                      ))}
                      {po.status !== 'received' && po.status !== 'closed' && po.status !== 'cancelled' && (
                        <Button size="sm" onClick={() => openReceive(po)}><Check className="h-3.5 w-3.5 mr-1.5" /> Receive</Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* New PO dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>New purchase order</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5"><Label>Supplier</Label>
                <select className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={newForm.supplier_id} onChange={(e) => setNewForm({ ...newForm, supplier_id: e.target.value })}>
                  <option value="">— none —</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5"><Label>PO number</Label><Input value={newForm.po_number} onChange={(e) => setNewForm({ ...newForm, po_number: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Expected date</Label><Input type="date" value={newForm.expected_date} onChange={(e) => setNewForm({ ...newForm, expected_date: e.target.value })} /></div>
            </div>

            <div className="space-y-2">
              <Label>Lines</Label>
              {draftLines.map((l, idx) => (
                <div key={idx} className="flex flex-wrap gap-2">
                  <select className="h-9 flex-1 min-w-[160px] rounded-md border border-input bg-background px-2 text-sm" value={l.variant_id} onChange={(e) => setDraftLines(draftLines.map((x, i) => i === idx ? { ...x, variant_id: e.target.value } : x))}>
                    <option value="">— product —</option>
                    {variants.map((v) => <option key={v.id} value={v.id}>{variantLabel(v)}</option>)}
                  </select>
                  <Input type="number" step="any" className="h-9 w-24" placeholder="Qty" value={l.quantity_ordered} onChange={(e) => setDraftLines(draftLines.map((x, i) => i === idx ? { ...x, quantity_ordered: e.target.value } : x))} />
                  <Input type="number" step="any" className="h-9 w-28" placeholder="Unit cost" value={l.unit_cost} onChange={(e) => setDraftLines(draftLines.map((x, i) => i === idx ? { ...x, unit_cost: e.target.value } : x))} />
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setDraftLines([...draftLines, { variant_id: '', description: '', quantity_ordered: '', unit_cost: '' }])}><Plus className="h-3.5 w-3.5 mr-1.5" /> Add line</Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button onClick={createPO} disabled={saving}>{saving ? 'Creating…' : 'Create draft PO'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receive dialog */}
      <Dialog open={receiveFor !== null} onOpenChange={(v) => !v && setReceiveFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Receive {receiveFor?.po_number || 'purchase order'}</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2">
            {receiveFor && (linesByPo[receiveFor.id] ?? []).map((l) => {
              const remaining = Number(l.quantity_ordered) - Number(l.quantity_received);
              if (remaining <= 0) return null;
              const v = receiveQtys[l.id] ?? { qty: '0', cost: String(l.unit_cost) };
              return (
                <div key={l.id} className="flex items-center gap-2">
                  <span className="flex-1 text-sm">{variants.find((x) => x.id === l.variant_id)?.sku || l.description} <span className="text-muted-foreground">(of {remaining} remaining)</span></span>
                  <Input type="number" step="any" className="h-8 w-24" value={v.qty} onChange={(e) => setReceiveQtys({ ...receiveQtys, [l.id]: { ...v, qty: e.target.value } })} />
                  <Input type="number" step="any" className="h-8 w-24" value={v.cost} onChange={(e) => setReceiveQtys({ ...receiveQtys, [l.id]: { ...v, cost: e.target.value } })} />
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveFor(null)}>Cancel</Button>
            <Button onClick={submitReceive} disabled={receiving}>{receiving ? 'Receiving…' : 'Confirm receipt'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
