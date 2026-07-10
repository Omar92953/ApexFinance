import { useEffect, useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import type { Business, CustomerInvoice, CapitalAccount } from '@/services/db';
import { customerInvoicesApi, capitalApi } from '@/services/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { cn, formatCurrency } from '@/lib/utils';

const BUCKETS = [
  { key: 'current', label: 'Not yet due', test: (d: number) => d < 0 },
  { key: 'b1', label: '0–30 days overdue', test: (d: number) => d >= 0 && d <= 30 },
  { key: 'b2', label: '31–60 days overdue', test: (d: number) => d > 30 && d <= 60 },
  { key: 'b3', label: '61+ days overdue', test: (d: number) => d > 60 },
];
function daysOverdue(dueDate?: string | null): number {
  if (!dueDate) return -1;
  return Math.floor((Date.now() - new Date(dueDate).getTime()) / 86400000);
}

export default function CustomerInvoicesTab({ business }: { business: Business }) {
  const cur = business.currency ?? 'EGP';
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
  const [accounts, setAccounts] = useState<CapitalAccount[]>([]);
  const [payFor, setPayFor] = useState<CustomerInvoice | null>(null);
  const [payAccount, setPayAccount] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [paying, setPaying] = useState(false);

  const load = async () => {
    const [i, a] = await Promise.all([customerInvoicesApi.list(business.id), capitalApi.listAccounts(business.id)]);
    setInvoices(i); setAccounts(a);
  };
  useEffect(() => { load(); }, [business.id]);

  const outstanding = useMemo(() => invoices.filter((i) => i.status !== 'paid'), [invoices]);
  const totalAR = useMemo(() => outstanding.reduce((s, i) => s + (Number(i.amount) - Number(i.amount_paid)), 0), [outstanding]);
  const aging = useMemo(() => {
    const buckets = BUCKETS.map((b) => ({ ...b, total: 0 }));
    for (const inv of outstanding) {
      const bucket = buckets.find((b) => b.test(daysOverdue(inv.due_date))) ?? buckets[0];
      bucket.total += Number(inv.amount) - Number(inv.amount_paid);
    }
    return buckets;
  }, [outstanding]);

  const openPay = (i: CustomerInvoice) => { setPayFor(i); setPayAccount(accounts[0]?.id ?? ''); setPayAmount(String(Number(i.amount) - Number(i.amount_paid))); };
  const submitPay = async () => {
    if (!payFor || !payAccount) return;
    setPaying(true);
    try { await customerInvoicesApi.pay(business.id, payFor.id, payAccount, parseFloat(payAmount) || 0); setPayFor(null); await load(); }
    finally { setPaying(false); }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="text-xs text-muted-foreground">Total accounts receivable</div>
        <div className="text-3xl font-bold tabular-nums mb-4">{formatCurrency(totalAR, cur)}</div>
        <div className="grid gap-2 sm:grid-cols-4">
          {aging.map((b) => (
            <div key={b.key} className="rounded-lg border border-border p-3 text-center">
              <div className="text-xs text-muted-foreground">{b.label}</div>
              <div className={cn('text-sm font-semibold tabular-nums', b.total > 0 && b.key !== 'current' && b.key !== 'b1' ? 'text-destructive' : '')}>{formatCurrency(b.total, cur, true)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-5 py-3 text-sm font-semibold">Outstanding invoices</div>
        {outstanding.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground"><FileText className="h-8 w-8 mx-auto mb-2 opacity-50" /> No outstanding invoices.</div>
        ) : (
          <div className="divide-y divide-border">
            {outstanding.map((i) => {
              const balance = Number(i.amount) - Number(i.amount_paid);
              return (
                <div key={i.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <div>
                    <div className="font-medium">{i.invoice_number || `Invoice ${i.id.slice(0, 8)}`} <span className="text-muted-foreground uppercase text-xs">{i.payment_method}</span></div>
                    <div className="text-xs text-muted-foreground">{i.due_date ? `Due ${i.due_date}` : 'No due date'} · {i.status.replace(/_/g, ' ')}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tabular-nums font-medium">{formatCurrency(balance, cur)}</span>
                    {i.payment_method === 'prepaid' ? (
                      <Button size="sm" onClick={() => openPay(i)}>Pay</Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">via COD reconciliation</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={payFor !== null} onOpenChange={(v) => !v && setPayFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record payment</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label>To account</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={payAccount} onChange={(e) => setPayAccount(e.target.value)}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5"><Label>Amount</Label><Input type="number" step="any" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayFor(null)}>Cancel</Button>
            <Button onClick={submitPay} disabled={paying || !payAccount}>{paying ? 'Recording…' : 'Confirm payment'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
