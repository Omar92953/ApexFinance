import { useEffect, useMemo, useState } from 'react';
import { Plus, ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, Wallet, Trash2, TrendingUp, Banknote } from 'lucide-react';
import type { Business, CapitalAccount, CapitalTransaction } from '@/services/db';
import type { ProfitCalculation } from '@/finance/profit-engine';
import { capitalApi } from '@/services/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatCurrency } from '@/lib/utils';

type Mode = 'expense' | 'income' | 'transfer' | 'account' | 'profit' | 'withdrawal' | null;

export default function CapitalTab({ business, profit }: { business: Business; profit: ProfitCalculation | null }) {
  const cur = business.currency ?? 'EGP';
  const [accounts, setAccounts] = useState<CapitalAccount[]>([]);
  const [txs, setTxs] = useState<CapitalTransaction[]>([]);
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState<any>({});
  const [filterAccount, setFilterAccount] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');

  const load = async () => {
    const [a, t] = await Promise.all([capitalApi.listAccounts(business.id), capitalApi.listTransactions(business.id)]);
    setAccounts(a); setTxs(t);
  };
  useEffect(() => { load(); }, [business.id]);

  const total = useMemo(() => accounts.reduce((s, a) => s + (Number(a.current_balance) || 0), 0), [accounts]);
  const acctName = (id: string) => accounts.find((a) => a.id === id)?.name ?? '—';
  const drawnThisYear = useMemo(() => {
    const yr = new Date().getFullYear().toString();
    return txs.filter((t) => t.transaction_type === 'withdrawal' && t.date.startsWith(yr)).reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
  }, [txs]);

  const txTypes = useMemo(() => Array.from(new Set(txs.map((t) => t.transaction_type))), [txs]);
  const filteredTxs = useMemo(() => txs.filter((t) => {
    if (filterAccount !== 'all' && t.account_id !== filterAccount) return false;
    if (filterType !== 'all' && t.transaction_type !== filterType) return false;
    if (filterStart && t.date < filterStart) return false;
    if (filterEnd && t.date > filterEnd) return false;
    return true;
  }), [txs, filterAccount, filterType, filterStart, filterEnd]);

  const open = (m: Mode) => {
    setF({ account_id: accounts[0]?.id, to_id: accounts[1]?.id, date: new Date().toISOString().slice(0, 10), amount: '', description: '', category: '', name: '', account_type: 'cash' });
    setMode(m);
  };

  const submit = async () => {
    setBusy(true);
    try {
      if (mode === 'account') {
        await capitalApi.createAccount({ business_id: business.id, name: f.name || 'Cash', account_type: f.account_type, opening_balance: parseFloat(f.amount) || 0, currency: cur });
      } else if (mode === 'transfer') {
        if (f.account_id && f.to_id && f.account_id !== f.to_id) await capitalApi.transfer(business.id, f.account_id, f.to_id, parseFloat(f.amount) || 0, f.description);
      } else if (mode === 'profit') {
        const amt = profit?.netProfit ?? 0;
        if (f.account_id && amt) await capitalApi.recordTransaction({ business_id: business.id, account_id: f.account_id, transaction_type: 'income', amount: amt, category: 'profit', description: 'Profit transferred to capital' });
      } else if (mode === 'withdrawal') {
        const raw = parseFloat(f.amount) || 0;
        if (f.account_id && raw) await capitalApi.recordTransaction({ business_id: business.id, account_id: f.account_id, transaction_type: 'withdrawal', amount: -Math.abs(raw), category: 'drawings', description: f.description || 'Owner drawings', date: f.date });
      } else if (mode === 'expense' || mode === 'income') {
        const raw = parseFloat(f.amount) || 0;
        const amt = mode === 'expense' ? -Math.abs(raw) : Math.abs(raw);
        if (f.account_id && raw) await capitalApi.recordTransaction({ business_id: business.id, account_id: f.account_id, transaction_type: mode, amount: amt, category: f.category, description: f.description, date: f.date });
      }
      setMode(null);
      await load();
    } finally { setBusy(false); }
  };

  const delTx = async (id: string) => { if (confirm('Delete this transaction? (balance is not auto-recalculated)')) { await capitalApi.removeTransaction(id); await load(); } };

  return (
    <div className="space-y-5">
      {/* Total + quick actions */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-6">
            <div>
              <div className="text-xs text-muted-foreground">Total capital</div>
              <div className="text-3xl font-bold tabular-nums">{formatCurrency(total, cur)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Drawn this year</div>
              <div className="text-xl font-semibold tabular-nums text-muted-foreground">{formatCurrency(drawnThisYear, cur)}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => open('expense')}><ArrowDownCircle className="h-4 w-4 mr-1.5 text-destructive" /> Expense</Button>
            <Button size="sm" variant="outline" onClick={() => open('income')}><ArrowUpCircle className="h-4 w-4 mr-1.5 text-success" /> Income</Button>
            <Button size="sm" variant="outline" onClick={() => open('transfer')} disabled={accounts.length < 2}><ArrowLeftRight className="h-4 w-4 mr-1.5" /> Transfer</Button>
            <Button size="sm" variant="outline" onClick={() => open('withdrawal')} disabled={!accounts.length}><Banknote className="h-4 w-4 mr-1.5" /> Withdraw</Button>
            <Button size="sm" variant="outline" onClick={() => open('profit')} disabled={!accounts.length}><TrendingUp className="h-4 w-4 mr-1.5" /> Profit → capital</Button>
            <Button size="sm" onClick={() => open('account')}><Plus className="h-4 w-4 mr-1.5" /> Account</Button>
          </div>
        </div>
      </div>

      {/* Account cards */}
      {accounts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Wallet className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">No capital accounts yet</p>
          <p className="text-sm text-muted-foreground mb-4">Add cash, bank, or wallet accounts to track your money.</p>
          <Button onClick={() => open('account')}><Plus className="h-4 w-4 mr-1.5" /> Add account</Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((a) => (
            <div key={a.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{a.name}</span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{a.account_type}</span>
              </div>
              <div className="mt-2 text-2xl font-bold tabular-nums">{formatCurrency(Number(a.current_balance) || 0, cur)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Ledger */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-5 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">Transaction log</span>
            <span className="text-xs text-muted-foreground">{filteredTxs.length} of {txs.length}</span>
          </div>
          {txs.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={filterAccount} onChange={(e) => setFilterAccount(e.target.value)}>
                <option value="all">All accounts</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <select className="h-8 rounded-md border border-input bg-background px-2 text-xs capitalize" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                <option value="all">All types</option>
                {txTypes.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
              </select>
              <Input type="date" value={filterStart} onChange={(e) => setFilterStart(e.target.value)} className="h-8 w-36 text-xs" />
              <span className="self-center text-xs text-muted-foreground">to</span>
              <Input type="date" value={filterEnd} onChange={(e) => setFilterEnd(e.target.value)} className="h-8 w-36 text-xs" />
              {(filterAccount !== 'all' || filterType !== 'all' || filterStart || filterEnd) && (
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setFilterAccount('all'); setFilterType('all'); setFilterStart(''); setFilterEnd(''); }}>Clear</Button>
              )}
            </div>
          )}
        </div>
        {txs.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted-foreground">No transactions yet.</p>
        ) : filteredTxs.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted-foreground">No transactions match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {filteredTxs.map((t) => (
                  <tr key={t.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{t.date}</td>
                    <td className="px-4 py-2">{t.description || t.category || t.transaction_type}<span className="text-muted-foreground"> · {acctName(t.account_id)}</span></td>
                    <td className={`px-4 py-2 text-right tabular-nums ${Number(t.amount) >= 0 ? 'text-success' : 'text-destructive'}`}>{Number(t.amount) >= 0 ? '+' : ''}{formatCurrency(Number(t.amount), cur, true)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{formatCurrency(Number(t.running_balance) || 0, cur)}</td>
                    <td className="px-2 py-2 text-right"><button onClick={() => delTx(t.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Action dialog */}
      <Dialog open={mode !== null} onOpenChange={(v) => !v && setMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {mode === 'expense' ? 'Record expense' : mode === 'income' ? 'Record income' : mode === 'transfer' ? 'Transfer between accounts' : mode === 'withdrawal' ? 'Owner withdrawal (drawings)' : mode === 'profit' ? 'Transfer profit to capital' : 'Add account'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {mode === 'account' ? (
              <>
                <div className="space-y-1.5"><Label>Name</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Cash drawer" /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5"><Label>Type</Label>
                    <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={f.account_type} onChange={(e) => setF({ ...f, account_type: e.target.value })}>
                      {['cash', 'bank', 'wallet', 'other'].map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5"><Label>Opening balance</Label><Input type="number" step="any" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
                </div>
              </>
            ) : mode === 'profit' ? (
              <>
                <p className="text-sm text-muted-foreground">Adds the current period's net profit ({formatCurrency(profit?.netProfit ?? 0, cur)}) as income to the selected account.</p>
                <AccountSelect accounts={accounts} value={f.account_id} onChange={(v) => setF({ ...f, account_id: v })} label="Deposit to" />
              </>
            ) : mode === 'transfer' ? (
              <>
                <AccountSelect accounts={accounts} value={f.account_id} onChange={(v) => setF({ ...f, account_id: v })} label="From" />
                <AccountSelect accounts={accounts} value={f.to_id} onChange={(v) => setF({ ...f, to_id: v })} label="To" />
                <div className="space-y-1.5"><Label>Amount</Label><Input type="number" step="any" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
              </>
            ) : (
              <>
                <AccountSelect accounts={accounts} value={f.account_id} onChange={(v) => setF({ ...f, account_id: v })} label="Account" />
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5"><Label>Amount</Label><Input type="number" step="any" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
                </div>
                <div className="space-y-1.5"><Label>Category</Label><Input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="e.g. manufacturing, salary, ad spend" /></div>
                <div className="space-y-1.5"><Label>Description</Label><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMode(null)}>Cancel</Button>
            <Button onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AccountSelect({ accounts, value, onChange, label }: { accounts: CapitalAccount[]; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
        {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
    </div>
  );
}
