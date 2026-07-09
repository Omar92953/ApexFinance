import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Business, ChartAccount } from '@/services/db';
import { glApi } from '@/services/db';
import { isBalanced } from '@/finance/ledger';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { cn, formatCurrency } from '@/lib/utils';

type Row = { account_id: string; side: 'debit' | 'credit'; amount: string; description: string };
const emptyRow = (): Row => ({ account_id: '', side: 'debit', amount: '', description: '' });

export default function JournalEntryDialog({
  business, accounts, open, onOpenChange, onPosted,
}: { business: Business; accounts: ChartAccount[]; open: boolean; onOpenChange: (v: boolean) => void; onPosted: () => void }) {
  const cur = business.currency ?? 'EGP';
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState('');
  const [rows, setRows] = useState<Row[]>([emptyRow(), emptyRow()]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const lines = rows
    .filter((r) => r.account_id && r.amount)
    .map((r) => ({ account_id: r.account_id, debit: r.side === 'debit' ? parseFloat(r.amount) || 0 : 0, credit: r.side === 'credit' ? parseFloat(r.amount) || 0 : 0, description: r.description || undefined }));
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  const balanced = lines.length >= 2 && isBalanced(lines);

  const reset = () => { setDate(new Date().toISOString().slice(0, 10)); setMemo(''); setRows([emptyRow(), emptyRow()]); setError(null); };

  const post = async () => {
    if (!balanced) { setError('Debits must equal credits.'); return; }
    setSaving(true); setError(null);
    try {
      await glApi.postEntry({ business_id: business.id, date, memo: memo || undefined, source_type: 'manual', lines });
      reset();
      onPosted();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>New journal entry</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Memo</Label><Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="What is this entry for?" /></div>
          </div>

          <div className="space-y-2">
            {rows.map((r, idx) => (
              <div key={idx} className="flex flex-wrap items-center gap-2">
                <select className="h-9 flex-1 min-w-[160px] rounded-md border border-input bg-background px-2 text-sm" value={r.account_id} onChange={(e) => setRows(rows.map((x, i) => i === idx ? { ...x, account_id: e.target.value } : x))}>
                  <option value="">— account —</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                </select>
                <select className="h-9 w-24 rounded-md border border-input bg-background px-2 text-sm" value={r.side} onChange={(e) => setRows(rows.map((x, i) => i === idx ? { ...x, side: e.target.value as 'debit' | 'credit' } : x))}>
                  <option value="debit">Debit</option>
                  <option value="credit">Credit</option>
                </select>
                <Input type="number" step="any" className="h-9 w-28" value={r.amount} onChange={(e) => setRows(rows.map((x, i) => i === idx ? { ...x, amount: e.target.value } : x))} placeholder="0" />
                <button onClick={() => setRows(rows.filter((_, i) => i !== idx))} disabled={rows.length <= 2} className="text-muted-foreground hover:text-destructive disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setRows([...rows, emptyRow()])}><Plus className="h-3.5 w-3.5 mr-1.5" /> Add line</Button>
          </div>

          <div className={cn('flex items-center justify-between rounded-lg border px-3 py-2 text-sm', balanced ? 'border-success/40 bg-success/5' : 'border-border')}>
            <span>Debits <b className="tabular-nums">{formatCurrency(totalDebit, cur, true)}</b> · Credits <b className="tabular-nums">{formatCurrency(totalCredit, cur, true)}</b></span>
            <span className={cn('font-medium', balanced ? 'text-success' : 'text-muted-foreground')}>{balanced ? 'Balanced' : 'Not balanced yet'}</span>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={post} disabled={!balanced || saving}>{saving ? 'Posting…' : 'Post entry'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
