import { useEffect, useMemo, useState } from 'react';
import { Plus, FileText, AlertOctagon } from 'lucide-react';
import type { Business, Contact, ProductVariant, Product, SalesOrder } from '@/services/db';
import { contactsApi, productsApi, salesOrdersApi } from '@/services/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { cn, formatCurrency } from '@/lib/utils';

type DraftLine = { variant_id: string; quantity: string; unit_price: string };
const STATUS_TONE: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground', confirmed: 'bg-chart-3/20 text-chart-3',
  invoiced: 'bg-success/15 text-success', cancelled: 'bg-destructive/15 text-destructive',
};

export default function SalesOrdersTab({ business }: { business: Business }) {
  const cur = business.currency ?? 'EGP';
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ contact_id: string; payment_method: 'prepaid' | 'cod'; courier: string }>({ contact_id: '', payment_method: 'prepaid', courier: '' });
  const [lines, setLines] = useState<DraftLine[]>([{ variant_id: '', quantity: '', unit_price: '' }]);
  const [saving, setSaving] = useState(false);

  const productTitle = useMemo(() => new Map(products.map((p) => [p.id, p.title])), [products]);
  const variantLabel = (v: ProductVariant) => `${productTitle.get(v.product_id) || 'Product'}${v.title && v.title !== 'Default' ? ' · ' + v.title : ''}`;
  const contactName = (id?: string | null) => { const c = contacts.find((x) => x.id === id); return c ? [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email : '—'; };

  const load = async () => {
    const [o, c, v, p] = await Promise.all([salesOrdersApi.list(business.id), contactsApi.list(business.id), productsApi.listVariants(business.id), productsApi.listProducts(business.id)]);
    setOrders(o); setContacts(c); setVariants(v); setProducts(p);
  };
  useEffect(() => { load(); }, [business.id]);

  const createOrder = async () => {
    const finalLines = lines.filter((l) => l.variant_id && l.quantity).map((l) => ({ variant_id: l.variant_id, quantity: parseFloat(l.quantity) || 0, unit_price: parseFloat(l.unit_price) || 0 }));
    if (!finalLines.length) return;
    setSaving(true);
    try {
      await salesOrdersApi.create(business.id, { contact_id: form.contact_id || null, payment_method: form.payment_method, courier: form.courier || undefined }, finalLines);
      setOpen(false); setLines([{ variant_id: '', quantity: '', unit_price: '' }]); setForm({ contact_id: '', payment_method: 'prepaid', courier: '' });
      await load();
    } finally { setSaving(false); }
  };

  const invoiceOrder = async (o: SalesOrder) => { await salesOrdersApi.invoice(business.id, o.id); await load(); };
  const markRto = async (o: SalesOrder) => { if (confirm('Mark as RTO (customer refused delivery)? This cancels the order.')) { await salesOrdersApi.markRto(o.id, true); await load(); } };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Manual/wholesale sales — quotes through invoicing. Shopify orders sync automatically and don't appear here.</p>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> New order</Button>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">No manual sales orders yet</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
          {orders.map((o) => (
            <div key={o.id} className="flex items-center justify-between px-5 py-3 text-sm">
              <div>
                <div className="font-medium">{o.order_number || `Order ${o.id.slice(0, 8)}`} <span className="text-muted-foreground">· {contactName(o.contact_id)}</span></div>
                <div className="text-xs text-muted-foreground">{o.order_date} · {o.payment_method.toUpperCase()}{o.courier ? ` via ${o.courier}` : ''}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium capitalize', STATUS_TONE[o.status])}>{o.is_rto ? 'RTO' : o.status}</span>
                {o.status === 'draft' && <Button size="sm" onClick={() => invoiceOrder(o)}>Invoice</Button>}
                {o.payment_method === 'cod' && !o.is_rto && o.status !== 'cancelled' && (
                  <Button size="sm" variant="outline" onClick={() => markRto(o)}><AlertOctagon className="h-3.5 w-3.5 mr-1.5" /> RTO</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>New sales order</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5"><Label>Customer</Label>
                <select className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={form.contact_id} onChange={(e) => setForm({ ...form, contact_id: e.target.value })}>
                  <option value="">— none —</option>
                  {contacts.map((c) => <option key={c.id} value={c.id}>{[c.first_name, c.last_name].filter(Boolean).join(' ') || c.email}</option>)}
                </select>
              </div>
              <div className="space-y-1.5"><Label>Payment</Label>
                <select className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value as 'prepaid' | 'cod' })}>
                  <option value="prepaid">Prepaid</option>
                  <option value="cod">Cash on delivery</option>
                </select>
              </div>
              {form.payment_method === 'cod' && <div className="space-y-1.5"><Label>Courier</Label><Input value={form.courier} onChange={(e) => setForm({ ...form, courier: e.target.value })} /></div>}
            </div>
            <div className="space-y-2">
              <Label>Lines</Label>
              {lines.map((l, idx) => (
                <div key={idx} className="flex flex-wrap gap-2">
                  <select className="h-9 flex-1 min-w-[160px] rounded-md border border-input bg-background px-2 text-sm" value={l.variant_id} onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, variant_id: e.target.value } : x))}>
                    <option value="">— product —</option>
                    {variants.map((v) => <option key={v.id} value={v.id}>{variantLabel(v)}</option>)}
                  </select>
                  <Input type="number" step="any" className="h-9 w-24" placeholder="Qty" value={l.quantity} onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, quantity: e.target.value } : x))} />
                  <Input type="number" step="any" className="h-9 w-28" placeholder="Unit price" value={l.unit_price} onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, unit_price: e.target.value } : x))} />
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setLines([...lines, { variant_id: '', quantity: '', unit_price: '' }])}><Plus className="h-3.5 w-3.5 mr-1.5" /> Add line</Button>
            </div>
            <div className="text-sm text-muted-foreground">Total: <b className="text-foreground">{formatCurrency(lines.reduce((s, l) => s + (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_price) || 0), 0), cur)}</b></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={createOrder} disabled={saving}>{saving ? 'Creating…' : 'Create order'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
