import { useEffect, useMemo, useState } from 'react';
import { CreditCard, Download } from 'lucide-react';
import type { Business, SupplierBill, CapitalAccount } from '@/services/db';
import { supplierBillsApi, capitalApi } from '@/services/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { cn, formatCurrency } from '@/lib/utils';
import { exportToCsv } from '@/lib/csv';

const BUCKETS = [
  { key: 'current', label: 'Not yet due', test: (d: number) => d < 0 },
  { key: 'b1', label: '0–30 days overdue', test: (d: number) => d >= 0 && d <= 30 },
  { key: 'b2', label: '31–60 days overdue', test: (d: number) => d > 30 && d <= 60 },
  { key: 'b3', label: '61–90 days overdue', test: (d: number) => d > 60 && d <= 90 },
  { key: 'b4', label: '90+ days overdue', test: (d: number) => d > 90 },
];

function daysOverdue(dueDate: string | null | undefined): number {
  if (!dueDate) return -1; // no due date = treat as not yet due
  return Math.floor((Date.now() - new Date(dueDate).getTime()) / 86400000);
}

export default function PayablesTab({ business }: { business: Business }) {
  const cur = business.currency ?? 'EGP';
  const [bills, setBills] = useState<SupplierBill[]>([]);
  const [accounts, setAccounts] = useState<CapitalAccount[]>([]);
  const [payFor, setPayFor] = useState<SupplierBill | null>(null);
  const [payAccount, setPayAccount] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [paying, setPaying] = useState(false);

  const load = async () => {
    const [b, a] = await Promise.all([supplierBillsApi.list(business.id), capitalApi.listAccounts(business.id)]);
    setBills(b); setAccounts(a);
  };
  useEffect(() => { load(); }, [business.id]);

  const outstanding = useMemo(() => bills.filter((b) => b.status !== 'paid'), [bills]);
  const totalOutstanding = useMemo(() => outstanding.reduce((s, b) => s + (Number(b.amount) - Number(b.amount_paid)), 0), [outstanding]);

  const aging = useMemo(() => {
    const buckets = BUCKETS.map((b) => ({ ...b, total: 0 }));
    for (const bill of outstanding) {
      const days = daysOverdue(bill.due_date);
      const balance = Number(bill.amount) - Number(bill.amount_paid);
      const bucket = buckets.find((b) => b.test(days)) ?? buckets[0];
      bucket.total += balance;
    }
    return buckets;
  }, [outstanding]);

  const openPay = (b: SupplierBill) => {
    setPayFor(b); setPayAccount(accounts[0]?.id ?? ''); setPayAmount(String(Number(b.amount) - Number(b.amount_paid)));
  };

  const submitPay = async () => {
    if (!payFor || !payAccount) return;
    setPaying(true);
    try {
      await supplierBillsApi.pay(business.id, payFor.id, payAccount, parseFloat(payAmount) || 0);
      setPayFor(null); await load();
    } finally { setPaying(false); }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="text-xs text-muted-foreground">Total accounts payable</div>
        <div className="text-3xl font-bold tabular-nums mb-4">{formatCurrency(totalOutstanding, cur)}</div>
        <div className="grid gap-2 sm:grid-cols-5">
          {aging.map((b) => (
            <div key={b.key} className="rounded-lg border border-border p-3 text-center">
              <div className="text-xs text-muted-foreground">{b.label}</div>
              <div className={cn('text-sm font-semibold tabular-nums', b.total > 0 && b.key !== 'current' && b.key !== 'b1' ? 'text-destructive' : '')}>{formatCurrency(b.total, cur, true)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-5 py-3 text-sm font-semibold flex items-center justify-between">
          Outstanding bills
          <Button variant="outline" size="sm" onClick={() => exportToCsv(`${business.name}-payables`, outstanding.map((b) => ({ bill_number: b.bill_number ?? '', due_date: b.due_date ?? '', status: b.status, amount: b.amount, amount_paid: b.amount_paid, balance: Number(b.amount) - Number(b.amount_paid) })))} disabled={outstanding.length === 0}><Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV</Button>
        </div>
        {outstanding.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-50" /> No outstanding bills.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {outstanding.map((b) => {
              const balance = Number(b.amount) - Number(b.amount_paid);
              const days = daysOverdue(b.due_date);
              return (
                <div key={b.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <div>
                    <div className="font-medium">{b.bill_number || `Bill ${b.id.slice(0, 8)}`}</div>
                    <div className="text-xs text-muted-foreground">{b.due_date ? `Due ${b.due_date}${days > 0 ? ` · ${days}d overdue` : ''}` : 'No due date'} · {b.status.replace(/_/g, ' ')}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tabular-nums font-medium">{formatCurrency(balance, cur)}</span>
                    <Button size="sm" onClick={() => openPay(b)}>Pay</Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={payFor !== null} onOpenChange={(v) => !v && setPayFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Pay bill</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>From account</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={payAccount} onChange={(e) => setPayAccount(e.target.value)}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5"><Label>Amount</Label><Input type="number" step="any" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayFor(null)}>Cancel</Button>
            <Button onClick={submitPay} disabled={paying || !payAccount}>{paying ? 'Paying…' : 'Confirm payment'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
