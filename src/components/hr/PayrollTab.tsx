import { useEffect, useMemo, useState } from 'react';
import { Plus, Wallet } from 'lucide-react';
import type { Business, Employee, PayrollRun, PayrollRunLine, CapitalAccount } from '@/services/db';
import { employeesApi, payrollApi, capitalApi } from '@/services/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatCurrency, cn } from '@/lib/utils';

function thisMonth(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export default function PayrollTab({ business }: { business: Business }) {
  const cur = business.currency ?? 'EGP';
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [accounts, setAccounts] = useState<CapitalAccount[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [openRun, setOpenRun] = useState<PayrollRun | null>(null);
  const [lines, setLines] = useState<PayrollRunLine[]>([]);
  const [payAccount, setPayAccount] = useState('');
  const [newRunOpen, setNewRunOpen] = useState(false);
  const [period, setPeriod] = useState(thisMonth());
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [e, a, r] = await Promise.all([employeesApi.list(business.id), capitalApi.listAccounts(business.id), payrollApi.listRuns(business.id)]);
    setEmployees(e); setAccounts(a); setRuns(r);
    if (!payAccount && a[0]) setPayAccount(a[0].id);
  };
  useEffect(() => { load(); }, [business.id]);

  const employeeName = (id?: string | null) => employees.find((e) => e.id === id)?.name || '—';

  const createRun = async () => {
    setSaving(true);
    try {
      await payrollApi.createRun(business.id, period, employees);
      setNewRunOpen(false); await load();
    } finally { setSaving(false); }
  };

  const openThread = async (r: PayrollRun) => { setOpenRun(r); setLines(await payrollApi.listLines(r.id)); };

  const updateLine = async (line: PayrollRunLine, field: 'bonus' | 'deductions', value: number) => {
    await payrollApi.updateLine(line.id, { [field]: value }, line.base_salary);
    setLines(await payrollApi.listLines(line.payroll_run_id));
  };

  const total = useMemo(() => lines.reduce((s, l) => s + (Number(l.net_amount) || 0), 0), [lines]);

  const pay = async () => {
    if (!openRun || !payAccount) return;
    setSaving(true);
    try {
      await payrollApi.pay(business.id, openRun.id, payAccount);
      setOpenRun(null); await load();
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Create a monthly run for active employees, adjust bonus/deductions, then pay to post the ledger entry.</p>
        <Button onClick={() => setNewRunOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> New payroll run</Button>
      </div>

      {runs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Wallet className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">No payroll runs yet</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
          {runs.map((r) => (
            <button key={r.id} onClick={() => openThread(r)} className="flex w-full items-center justify-between px-5 py-3 text-left text-sm hover:bg-muted/40">
              <div>
                <div className="font-medium">{new Date(r.period_month).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div>
                <div className="text-xs text-muted-foreground">{r.paid_date ? `Paid ${r.paid_date}` : 'Draft'}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="tabular-nums font-medium">{formatCurrency(Number(r.total_amount) || 0, cur)}</span>
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium capitalize', r.status === 'paid' ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning')}>{r.status}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      <Dialog open={newRunOpen} onOpenChange={setNewRunOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New payroll run</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label>Pay period (month)</Label><Input type="date" value={period} onChange={(e) => setPeriod(e.target.value)} /></div>
            <p className="text-xs text-muted-foreground">{employees.filter((e) => e.is_active).length} active employees will be added at their monthly salary.</p>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setNewRunOpen(false)}>Cancel</Button><Button onClick={createRun} disabled={saving}>Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openRun !== null} onOpenChange={(v) => !v && setOpenRun(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{openRun && new Date(openRun.period_month).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} payroll</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground"><tr className="text-left">
                <th className="py-1.5 font-medium">Employee</th><th className="py-1.5 font-medium text-right">Base</th>
                <th className="py-1.5 font-medium text-right">Bonus</th><th className="py-1.5 font-medium text-right">Deductions</th>
                <th className="py-1.5 font-medium text-right">Net</th>
              </tr></thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="border-t border-border">
                    <td className="py-1.5">{employeeName(l.employee_id)}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatCurrency(Number(l.base_salary) || 0, cur, true)}</td>
                    <td className="py-1.5 text-right">
                      <Input type="number" step="any" disabled={openRun?.status === 'paid'} defaultValue={l.bonus} className="h-7 w-24 text-right ml-auto" onBlur={(e) => updateLine(l, 'bonus', parseFloat(e.target.value) || 0)} />
                    </td>
                    <td className="py-1.5 text-right">
                      <Input type="number" step="any" disabled={openRun?.status === 'paid'} defaultValue={l.deductions} className="h-7 w-24 text-right ml-auto" onBlur={(e) => updateLine(l, 'deductions', parseFloat(e.target.value) || 0)} />
                    </td>
                    <td className="py-1.5 text-right tabular-nums font-medium">{formatCurrency(Number(l.net_amount) || 0, cur, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between border-t border-border pt-3">
              <span className="text-sm font-semibold">Total: {formatCurrency(total, cur)}</span>
              {openRun?.status !== 'paid' && (
                <div className="flex items-center gap-2">
                  <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={payAccount} onChange={(e) => setPayAccount(e.target.value)}>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  <Button onClick={pay} disabled={saving || !payAccount}>{saving ? 'Paying…' : 'Pay run'}</Button>
                </div>
              )}
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpenRun(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
