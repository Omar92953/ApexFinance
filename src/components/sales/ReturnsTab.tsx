import { useEffect, useMemo, useState } from 'react';
import { Undo2 } from 'lucide-react';
import type { Business, ProductVariant, Product, CapitalAccount, CustomerInvoice, SalesReturnRow } from '@/services/db';
import { productsApi, capitalApi, customerInvoicesApi, salesReturnsApi } from '@/services/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/utils';

export default function ReturnsTab({ business }: { business: Business }) {
  const cur = business.currency ?? 'EGP';
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [accounts, setAccounts] = useState<CapitalAccount[]>([]);
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
  const [returns, setReturns] = useState<SalesReturnRow[]>([]);

  const [invoiceId, setInvoiceId] = useState('');
  const [variantId, setVariantId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundViaCash, setRefundViaCash] = useState(false);
  const [accountId, setAccountId] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const productTitle = useMemo(() => new Map(products.map((p) => [p.id, p.title])), [products]);
  const variantLabel = (id?: string | null) => { const v = variants.find((x) => x.id === id); return v ? `${productTitle.get(v.product_id) || 'Product'}${v.title && v.title !== 'Default' ? ' · ' + v.title : ''}` : '—'; };

  const load = async () => {
    const [v, p, a, i, r] = await Promise.all([
      productsApi.listVariants(business.id), productsApi.listProducts(business.id), capitalApi.listAccounts(business.id),
      customerInvoicesApi.list(business.id), salesReturnsApi.list(business.id),
    ]);
    setVariants(v); setProducts(p); setAccounts(a); setInvoices(i); setReturns(r);
  };
  useEffect(() => { load(); }, [business.id]);

  const submit = async () => {
    if (!quantity && !refundAmount) return;
    setSaving(true);
    try {
      await salesReturnsApi.process(business.id, {
        customer_invoice_id: invoiceId || null, variant_id: variantId || null,
        quantity: parseFloat(quantity) || 0, refund_amount: parseFloat(refundAmount) || 0,
        refund_via_cash: refundViaCash, capital_account_id: refundViaCash ? accountId : null, reason: reason || undefined,
      });
      setInvoiceId(''); setVariantId(''); setQuantity(''); setRefundAmount(''); setRefundViaCash(false); setReason('');
      await load();
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-1">Process a return</h3>
        <p className="text-xs text-muted-foreground mb-4">Restocks the returned unit and reverses the sale — either as a cash refund or a credit note against the customer's balance.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Invoice (optional)</Label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}>
              <option value="">— none —</option>
              {invoices.map((i) => <option key={i.id} value={i.id}>{i.invoice_number || i.id.slice(0, 8)} · {formatCurrency(Number(i.amount), cur)}</option>)}
            </select>
          </div>
          <div className="space-y-1.5"><Label>Product returned</Label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={variantId} onChange={(e) => setVariantId(e.target.value)}>
              <option value="">— none —</option>
              {variants.map((v) => <option key={v.id} value={v.id}>{variantLabel(v.id)}</option>)}
            </select>
          </div>
          <div className="space-y-1.5"><Label>Quantity</Label><Input type="number" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Refund amount</Label><Input type="number" step="any" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} /></div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={refundViaCash} onChange={(e) => setRefundViaCash(e.target.checked)} /> Refund via cash (uncheck for a credit note against AR)</label>
          </div>
          {refundViaCash && (
            <div className="space-y-1.5"><Label>From account</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">— select —</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}
          <div className="space-y-1.5 sm:col-span-2"><Label>Reason</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. wrong size, damaged in transit" /></div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={submit} disabled={saving || (!quantity && !refundAmount)}>{saving ? 'Processing…' : 'Process return'}</Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-5 py-3 text-sm font-semibold">Return history</div>
        {returns.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground"><Undo2 className="h-8 w-8 mx-auto mb-2 opacity-50" /> No returns yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {returns.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <span className="text-muted-foreground">{r.date} · {variantLabel(r.variant_id)} × {r.quantity}{r.reason ? ` · ${r.reason}` : ''}</span>
                <span className="tabular-nums font-medium">{formatCurrency(Number(r.refund_amount), cur, true)} {r.refund_via_cash ? '(cash)' : '(credit)'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
