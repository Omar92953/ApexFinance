import { useEffect, useMemo, useState } from 'react';
import { Truck, AlertOctagon } from 'lucide-react';
import type { Business, CustomerInvoice, CapitalAccount, CodRemittanceRow, SalesOrder } from '@/services/db';
import { customerInvoicesApi, capitalApi, codApi, salesOrdersApi } from '@/services/db';
import { computeRtoRate } from '@/finance/cod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn, formatCurrency } from '@/lib/utils';

export default function CodReconciliationTab({ business }: { business: Business }) {
  const cur = business.currency ?? 'EGP';
  const [codInvoices, setCodInvoices] = useState<CustomerInvoice[]>([]);
  const [accounts, setAccounts] = useState<CapitalAccount[]>([]);
  const [remittances, setRemittances] = useState<CodRemittanceRow[]>([]);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [courier, setCourier] = useState('');
  const [fee, setFee] = useState('');
  const [accountId, setAccountId] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [inv, a, r, o] = await Promise.all([customerInvoicesApi.list(business.id), capitalApi.listAccounts(business.id), codApi.listRemittances(business.id), salesOrdersApi.list(business.id)]);
    setCodInvoices(inv.filter((i) => i.payment_method === 'cod' && i.status !== 'paid'));
    setAccounts(a); setRemittances(r); setOrders(o);
  };
  useEffect(() => { load(); }, [business.id]);

  const outstandingTotal = useMemo(() => codInvoices.reduce((s, i) => s + (Number(i.amount) - Number(i.amount_paid)), 0), [codInvoices]);
  const selectedGross = useMemo(() => codInvoices.filter((i) => selected.has(i.id)).reduce((s, i) => s + (Number(i.amount) - Number(i.amount_paid)), 0), [codInvoices, selected]);
  const rto = useMemo(() => computeRtoRate(orders.map((o) => ({ payment_method: o.payment_method, is_rto: !!o.is_rto }))), [orders]);

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const submit = async () => {
    if (!courier || !accountId || selected.size === 0) return;
    setSaving(true);
    try {
      await codApi.recordRemittance(business.id, courier, selectedGross, parseFloat(fee) || 0, accountId, Array.from(selected));
      setCourier(''); setFee(''); setSelected(new Set());
      await load();
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-xs text-muted-foreground">Outstanding COD receivable</div>
          <div className="text-3xl font-bold tabular-nums">{formatCurrency(outstandingTotal, cur)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5"><AlertOctagon className="h-3.5 w-3.5" /> RTO rate (all-time)</div>
          <div className={cn('text-3xl font-bold tabular-nums', rto.ratePct > 15 ? 'text-destructive' : rto.ratePct > 5 ? 'text-warning' : 'text-success')}>{rto.ratePct.toFixed(1)}%</div>
          <div className="text-xs text-muted-foreground">{rto.rtoCount} of {rto.codCount} COD orders refused</div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-1">Record a courier remittance</h3>
        <p className="text-xs text-muted-foreground mb-4">Select which delivered COD orders this remittance settles, enter the courier's fee — the net amount lands in your account automatically.</p>
        {codInvoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No outstanding COD invoices.</p>
        ) : (
          <div className="space-y-1.5 mb-4">
            {codInvoices.map((i) => (
              <label key={i.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm cursor-pointer">
                <input type="checkbox" checked={selected.has(i.id)} onChange={() => toggle(i.id)} />
                <span className="flex-1">{i.invoice_number || i.id.slice(0, 8)}</span>
                <span className="tabular-nums">{formatCurrency(Number(i.amount) - Number(i.amount_paid), cur)}</span>
              </label>
            ))}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5"><Label>Courier</Label><Input value={courier} onChange={(e) => setCourier(e.target.value)} placeholder="e.g. Bosta" /></div>
          <div className="space-y-1.5"><Label>Courier fee</Label><Input type="number" step="any" value={fee} onChange={(e) => setFee(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Deposit to</Label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">— select —</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
          <span>Gross <b>{formatCurrency(selectedGross, cur)}</b> − Fee <b>{formatCurrency(parseFloat(fee) || 0, cur)}</b></span>
          <span className="font-semibold">Net {formatCurrency(selectedGross - (parseFloat(fee) || 0), cur)}</span>
        </div>
        <div className="mt-3 flex justify-end">
          <Button onClick={submit} disabled={saving || !courier || !accountId || selected.size === 0}>{saving ? 'Recording…' : 'Record remittance'}</Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-5 py-3 text-sm font-semibold">Remittance history</div>
        {remittances.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground"><Truck className="h-8 w-8 mx-auto mb-2 opacity-50" /> No remittances yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {remittances.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <span className="text-muted-foreground">{r.date} · {r.courier}</span>
                <span className="tabular-nums">Gross {formatCurrency(Number(r.gross_amount), cur)} − Fee {formatCurrency(Number(r.courier_fee), cur, true)} = <b>{formatCurrency(Number(r.net_amount), cur)}</b></span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
