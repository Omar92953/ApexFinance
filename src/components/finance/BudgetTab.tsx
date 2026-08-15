import { useEffect, useMemo, useState } from 'react';
import { Wallet, Plus, Trash2 } from 'lucide-react';
import type { Business, BudgetCommitment } from '@/services/db';
import { costBudgetsApi, costRulesApi, commitmentsApi } from '@/services/db';
import { buildCostRuleContext } from '@/finance/compute';
import { computeCostRules } from '@/finance/cost-rules';
import { COST_CATEGORIES } from '@/finance/cost-rules';
import { evaluateBudgets, budgetTotals, allocateBudget, BUDGET_STATUS_LABELS, type BudgetLineResult } from '@/finance/budget';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatCurrency, cn } from '@/lib/utils';

const STATUS_TONE: Record<string, string> = {
  under: 'bg-success/15 text-success',
  tight: 'bg-warning/15 text-warning',
  over: 'bg-destructive/15 text-destructive',
  no_budget: 'bg-muted text-muted-foreground',
};

export default function BudgetTab({ business }: { business: Business }) {
  const cur = business.currency ?? 'EGP';
  const month = new Date().toISOString().slice(0, 7);
  const monthStart = `${month}-01`;
  const today = new Date().toISOString().slice(0, 10);

  const [results, setResults] = useState<BudgetLineResult[]>([]);
  const [commitments, setCommitments] = useState<BudgetCommitment[]>([]);
  const [loading, setLoading] = useState(true);
  const [allocOpen, setAllocOpen] = useState(false);
  const [envelope, setEnvelope] = useState(0);
  const [weights, setWeights] = useState<Record<string, number>>(() =>
    Object.fromEntries(COST_CATEGORIES.map((c) => [c, 1])));
  const [commitOpen, setCommitOpen] = useState(false);
  const [commitForm, setCommitForm] = useState<{ category: string; amount: number; description: string }>({
    category: COST_CATEGORIES[0], amount: 0, description: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const [budgets, rules, commits] = await Promise.all([
        costBudgetsApi.list(business.id, month).catch(() => []),
        costRulesApi.list(business.id).catch(() => []),
        commitmentsApi.list(business.id, month).catch(() => []),
      ]);
      setCommitments(commits);

      let actual: Record<string, number> = {};
      try {
        const ctx = await buildCostRuleContext(business, monthStart, today);
        actual = computeCostRules(rules.filter((r) => r.is_active), ctx).totalsByCategory as unknown as Record<string, number>;
      } catch { /* leave actuals at zero if costs can't be computed */ }

      const lines = COST_CATEGORIES.map((category) => {
        const budget = budgets.find((b) => b.category === category);
        return {
          category,
          budget: Number(budget?.budget_amount) || 0,
          spent: actual[category] || 0,
          committed: commits.filter((c) => c.category === category).reduce((s, c) => s + (Number(c.amount) || 0), 0),
          approvalLimit: (budget as { approval_limit?: number } | undefined)?.approval_limit ?? null,
        };
      });
      setResults(evaluateBudgets(lines));
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [business.id]);

  const totals = useMemo(() => budgetTotals(results), [results]);

  const setBudget = async (category: string, amount: number) => {
    await costBudgetsApi.save(business.id, category, month, amount);
    await load();
  };

  const applyAllocation = async () => {
    const split = allocateBudget(envelope, COST_CATEGORIES.map((c) => ({ category: c, weight: weights[c] ?? 0 })));
    for (const s of split) await costBudgetsApi.save(business.id, s.category, month, s.amount);
    setAllocOpen(false);
    await load();
  };

  const addCommitment = async () => {
    if (!(commitForm.amount > 0)) return;
    await commitmentsApi.create({
      business_id: business.id, category: commitForm.category, amount: commitForm.amount,
      month, source_type: 'manual', source_id: null, description: commitForm.description || null,
    });
    setCommitForm({ category: COST_CATEGORIES[0], amount: 0, description: '' });
    setCommitOpen(false);
    await load();
  };

  if (loading) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Budget this month</div>
          <div className="text-2xl font-bold tabular-nums">{formatCurrency(totals.budget, cur)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Spent</div>
          <div className="text-2xl font-bold tabular-nums">{formatCurrency(totals.spent, cur)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Committed</div>
          <div className="text-2xl font-bold tabular-nums text-warning">{formatCurrency(totals.committed, cur)}</div>
          <p className="text-xs text-muted-foreground">approved, not yet billed</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Truly remaining</div>
          <div className={cn('text-2xl font-bold tabular-nums', totals.remaining < 0 && 'text-destructive')}>
            {formatCurrency(totals.remaining, cur)}
          </div>
          {totals.overCount > 0 && <p className="text-xs text-destructive">{totals.overCount} category over</p>}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground max-w-2xl">
          Remaining counts commitments, not just paid bills — money is gone the moment you approve the spend, not when the invoice arrives.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCommitOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> Commitment</Button>
          <Button onClick={() => setAllocOpen(true)}><Wallet className="h-4 w-4 mr-1.5" /> Allocate envelope</Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-muted-foreground"><tr className="text-left">
            <th className="px-4 py-2 font-medium">Category</th>
            <th className="px-3 py-2 font-medium text-right">Budget</th>
            <th className="px-3 py-2 font-medium text-right">Spent</th>
            <th className="px-3 py-2 font-medium text-right">Committed</th>
            <th className="px-3 py-2 font-medium text-right">Remaining</th>
            <th className="px-3 py-2 font-medium">Used</th>
          </tr></thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.category} className="border-b border-border last:border-0">
                <td className="px-4 py-2 capitalize">{r.category}</td>
                <td className="px-3 py-2 text-right">
                  <Input type="number" step="any" defaultValue={r.budget}
                    onBlur={(e) => { const v = parseFloat(e.target.value) || 0; if (v !== r.budget) setBudget(r.category, v); }}
                    className="h-8 w-28 text-right tabular-nums ml-auto" />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.spent, cur, true)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-warning">{r.committed > 0 ? formatCurrency(r.committed, cur, true) : '—'}</td>
                <td className={cn('px-3 py-2 text-right tabular-nums font-medium', r.remaining < 0 && 'text-destructive')}>
                  {formatCurrency(r.remaining, cur, true)}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
                      <div className={cn('h-full rounded-full', r.status === 'over' ? 'bg-destructive' : r.status === 'tight' ? 'bg-warning' : 'bg-success')}
                        style={{ width: `${Math.min(100, r.usedPct)}%` }} />
                    </div>
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap', STATUS_TONE[r.status])}>
                      {BUDGET_STATUS_LABELS[r.status]}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {commitments.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="border-b border-border px-5 py-3 text-sm font-semibold">Open commitments</div>
          <div className="divide-y divide-border">
            {commitments.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <div>
                  <span className="capitalize font-medium">{c.category}</span>
                  {c.description && <span className="text-muted-foreground"> · {c.description}</span>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="tabular-nums">{formatCurrency(c.amount, cur)}</span>
                  <button onClick={async () => { await commitmentsApi.release(c.id); await load(); }}
                    className="text-xs text-muted-foreground hover:text-foreground">Release</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={allocOpen} onOpenChange={setAllocOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Allocate a monthly envelope</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Total to spread across categories</Label>
              <Input type="number" step="any" value={envelope} onChange={(e) => setEnvelope(parseFloat(e.target.value) || 0)} />
            </div>
            <Label>Relative weights</Label>
            {COST_CATEGORIES.map((c) => (
              <div key={c} className="flex items-center gap-2">
                <span className="text-sm capitalize w-28">{c}</span>
                <Input type="number" step="any" value={weights[c] ?? 0}
                  onChange={(e) => setWeights({ ...weights, [c]: parseFloat(e.target.value) || 0 })} className="h-8" />
                <span className="text-xs text-muted-foreground w-24 text-right tabular-nums">
                  {formatCurrency(allocateBudget(envelope, COST_CATEGORIES.map((x) => ({ category: x, weight: weights[x] ?? 0 })))
                    .find((a) => a.category === c)?.amount ?? 0, cur, true)}
                </span>
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground">This overwrites the budgets for {month}.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAllocOpen(false)}>Cancel</Button>
            <Button onClick={applyAllocation} disabled={!(envelope > 0)}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={commitOpen} onOpenChange={setCommitOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record a commitment</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              Something approved but not yet billed — a signed PO, an agreed campaign. It consumes budget immediately.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <select className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={commitForm.category} onChange={(e) => setCommitForm({ ...commitForm, category: e.target.value })}>
                  {COST_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1.5"><Label>Amount</Label><Input type="number" step="any" value={commitForm.amount}
                onChange={(e) => setCommitForm({ ...commitForm, amount: parseFloat(e.target.value) || 0 })} /></div>
            </div>
            <div className="space-y-1.5"><Label>What for</Label><Input value={commitForm.description}
              onChange={(e) => setCommitForm({ ...commitForm, description: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCommitOpen(false)}>Cancel</Button>
            <Button onClick={addCommitment} disabled={!(commitForm.amount > 0)}>Record</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
