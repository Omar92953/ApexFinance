import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Sparkles, BookOpen, Download } from 'lucide-react';
import type { Business, ChartAccount, JournalEntryRow, JournalLineRow } from '@/services/db';
import { glApi } from '@/services/db';
import { computeIncomeStatementFromTrialBalance, computeBalanceSheetFromTrialBalance, type TrialBalance } from '@/finance/ledger';
import { Button } from '@/components/ui/button';
import { cn, formatCurrency } from '@/lib/utils';
import { exportToCsv } from '@/lib/csv';
import JournalEntryDialog from './JournalEntryDialog';

const SUBTYPE_LABEL: Record<string, string> = {
  cogs: 'COGS', fulfillment: 'Fulfillment', marketing: 'Marketing', overhead: 'Overhead', fees: 'Fees', other: 'Other',
};

export default function GeneralLedgerTab({ business, start, end }: { business: Business; start: string; end: string }) {
  const cur = business.currency ?? 'EGP';
  const [accounts, setAccounts] = useState<ChartAccount[]>([]);
  const [tb, setTb] = useState<TrialBalance | null>(null);
  const [entries, setEntries] = useState<Array<JournalEntryRow & { lines: JournalLineRow[] }>>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [a, t, e] = await Promise.all([
        glApi.listAccounts(business.id),
        glApi.getTrialBalance(business.id, end),
        glApi.listEntries(business.id, { start, end, limit: 100 }),
      ]);
      setAccounts(a); setTb(t); setEntries(e);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [business.id, start, end]);

  const seedChart = async () => {
    setBusy('seed'); setMsg(null);
    try { await glApi.seedDefaultChart(business.id); await load(); setMsg('Chart of accounts created.'); }
    finally { setBusy(null); }
  };

  const postOpening = async () => {
    setBusy('opening'); setMsg(null);
    try {
      const res = await glApi.postOpeningBalances(business.id);
      setMsg(`Posted ${res.posted} opening entr${res.posted === 1 ? 'y' : 'ies'}${res.skipped ? ` · ${res.skipped} already existed` : ''}.`);
      await load();
    } catch (e) {
      setMsg(`Error: ${e instanceof Error ? e.message : e}`);
    } finally { setBusy(null); }
  };

  const toggle = (id: string) => setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  if (loading) return <p className="text-muted-foreground">Loading…</p>;

  if (accounts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-12 text-center">
        <BookOpen className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
        <p className="font-medium">No chart of accounts yet</p>
        <p className="text-sm text-muted-foreground mb-4">Sets up a standard 26-account chart (cash, inventory, payables, revenue, expenses…) so every action can auto-post a balanced entry.</p>
        <Button onClick={seedChart} disabled={busy === 'seed'}><Sparkles className="h-4 w-4 mr-1.5" /> Set up chart of accounts</Button>
      </div>
    );
  }

  const income = tb ? computeIncomeStatementFromTrialBalance(tb) : null;
  const balanceSheet = tb && income ? computeBalanceSheetFromTrialBalance(tb, income.netIncome) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium', tb?.balanced ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive')}>
            {tb?.balanced ? '✓ Ledger balanced' : '✗ Ledger out of balance'}
          </span>
          <span className="text-xs text-muted-foreground">as of {end}</span>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={postOpening} disabled={busy === 'opening'}>{busy === 'opening' ? 'Posting…' : 'Post opening balances'}</Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> New entry</Button>
        </div>
      </div>
      {msg && <p className={cn('text-xs', msg.toLowerCase().includes('error') ? 'text-destructive' : 'text-success')}>{msg}</p>}

      {/* GL-derived statements */}
      {income && balanceSheet && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold mb-3">Income statement (from ledger)</h3>
            <div className="space-y-1.5 text-sm">
              <Row label="Revenue" value={formatCurrency(income.revenue, cur)} />
              {Object.entries(income.expensesBySubtype).map(([k, v]) => (
                <Row key={k} label={`− ${SUBTYPE_LABEL[k] ?? k}`} value={formatCurrency(v, cur)} muted />
              ))}
              <div className="border-t border-border my-2" />
              <Row label="Net income" value={formatCurrency(income.netIncome, cur)} bold tone={income.netIncome >= 0 ? 'positive' : 'negative'} />
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold mb-3">Balance sheet (from ledger)</h3>
            <div className="space-y-1.5 text-sm">
              <Row label="Total assets" value={formatCurrency(balanceSheet.totalAssets, cur)} bold />
              <Row label="Total liabilities" value={formatCurrency(balanceSheet.totalLiabilities, cur)} />
              <Row label="Total equity" value={formatCurrency(balanceSheet.totalEquity, cur)} />
              <Row label="(incl. period net income)" value={formatCurrency(balanceSheet.netIncome, cur)} muted />
              <div className="border-t border-border my-2" />
              <Row label="Liabilities + equity" value={formatCurrency(balanceSheet.totalLiabilities + balanceSheet.totalEquity, cur)} bold tone={balanceSheet.balanced ? 'positive' : 'negative'} />
            </div>
          </div>
        </div>
      )}

      {/* Trial balance */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-5 py-3 text-sm font-semibold">Trial balance</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-muted-foreground"><tr className="text-left">
              <th className="px-4 py-2 font-medium">Code</th><th className="px-4 py-2 font-medium">Account</th>
              <th className="px-4 py-2 font-medium">Type</th><th className="px-4 py-2 font-medium text-right">Balance</th>
            </tr></thead>
            <tbody>
              {(tb?.rows ?? []).filter((r) => r.debit || r.credit).map((r) => (
                <tr key={r.account_id} className="border-b border-border last:border-0">
                  <td className="px-4 py-1.5 text-muted-foreground">{r.account_code}</td>
                  <td className="px-4 py-1.5">{r.account_name}</td>
                  <td className="px-4 py-1.5 text-muted-foreground capitalize">{r.account_type}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{formatCurrency(r.balance, cur, true)}</td>
                </tr>
              ))}
              {(tb?.rows ?? []).every((r) => !r.debit && !r.credit) && (
                <tr><td colSpan={4} className="px-4 py-4 text-center text-muted-foreground">No activity yet — post an entry or run "Post opening balances".</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Journal */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-5 py-3 text-sm font-semibold flex items-center justify-between">
          Journal — {start} to {end}
          <Button variant="outline" size="sm" onClick={() => exportToCsv(`${business.name}-journal-${start}-to-${end}`, entries.flatMap((e) => e.lines.map((l) => ({
            date: e.date, memo: e.memo ?? '', source_type: e.source_type ?? '', account_code: l.account?.code ?? '', account_name: l.account?.name ?? '', debit: l.debit, credit: l.credit,
          }))))} disabled={entries.length === 0}><Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV</Button>
        </div>
        {entries.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted-foreground">No entries in this period.</p>
        ) : (
          <div className="divide-y divide-border">
            {entries.map((e) => {
              const total = e.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
              return (
                <div key={e.id}>
                  <button onClick={() => toggle(e.id)} className="flex w-full items-center justify-between px-5 py-2.5 text-left hover:bg-muted/40">
                    <div className="flex items-center gap-2 text-sm">
                      {expanded.has(e.id) ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                      <span className="text-muted-foreground">{e.date}</span>
                      <span>{e.memo || e.source_type || 'Entry'}</span>
                    </div>
                    <span className="tabular-nums text-sm font-medium">{formatCurrency(total, cur, true)}</span>
                  </button>
                  {expanded.has(e.id) && (
                    <div className="bg-muted/20 px-5 py-2">
                      {e.lines.map((l) => (
                        <div key={l.id} className="flex items-center justify-between py-1 text-xs">
                          <span className="text-muted-foreground">{l.account?.code} {l.account?.name}{l.description ? ` · ${l.description}` : ''}</span>
                          <span className="tabular-nums">{l.debit > 0 ? `Dr ${formatCurrency(l.debit, cur, true)}` : `Cr ${formatCurrency(l.credit, cur, true)}`}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <JournalEntryDialog business={business} accounts={accounts} open={dialogOpen} onOpenChange={setDialogOpen} onPosted={load} />
    </div>
  );
}

function Row({ label, value, muted, bold, tone }: { label: string; value: string; muted?: boolean; bold?: boolean; tone?: 'positive' | 'negative' }) {
  const toneClass = tone === 'positive' ? 'text-success' : tone === 'negative' ? 'text-destructive' : '';
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? 'text-muted-foreground' : ''}>{label}</span>
      <span className={`tabular-nums ${bold ? 'font-bold' : ''} ${toneClass}`}>{value}</span>
    </div>
  );
}
