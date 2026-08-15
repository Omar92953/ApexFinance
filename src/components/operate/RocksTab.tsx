import { useEffect, useState } from 'react';
import { Plus, Trash2, Mountain, AlertTriangle } from 'lucide-react';
import type { Business, Rock } from '@/services/db';
import { rocksApi } from '@/services/db';
import { rockHealth, quarterOf, ROCK_HEALTH_LABELS, MAX_HEALTHY_ROCKS, type RockHealth } from '@/finance/eos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const HEALTH_TONE: Record<RockHealth, string> = {
  on_track: 'bg-success/15 text-success',
  off_track: 'bg-warning/15 text-warning',
  overdue: 'bg-destructive/15 text-destructive',
  done: 'bg-muted text-muted-foreground',
};

export default function RocksTab({ business }: { business: Business }) {
  const today = new Date().toISOString().slice(0, 10);
  const thisQuarter = quarterOf(today);
  const [rocks, setRocks] = useState<Rock[]>([]);
  const [quarter, setQuarter] = useState(thisQuarter);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<Rock>>({ status: 'on_track' });

  const load = async () => setRocks(await rocksApi.list(business.id));
  useEffect(() => { load(); }, [business.id]);

  const quarters = Array.from(new Set([thisQuarter, ...rocks.map((r) => r.quarter)])).sort().reverse();
  const shown = rocks.filter((r) => r.quarter === quarter);
  const unfinished = shown.filter((r) => r.status !== 'done');

  const create = async () => {
    if (!form.title?.trim()) return;
    setSaving(true);
    try {
      await rocksApi.create({
        business_id: business.id,
        title: form.title.trim(),
        owner: form.owner || null,
        quarter,
        status: form.status ?? 'on_track',
        due_date: form.due_date || null,
        notes: form.notes || null,
      });
      setForm({ status: 'on_track' });
      setOpen(false);
      await load();
    } finally { setSaving(false); }
  };

  const setStatus = async (r: Rock, status: Rock['status']) => { await rocksApi.update(r.id, { status }); await load(); };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={quarter} onChange={(e) => setQuarter(e.target.value)}>
            {quarters.map((q) => <option key={q} value={q}>{q}</option>)}
          </select>
          <p className="text-sm text-muted-foreground">The few things that must get done this quarter.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> New rock</Button>
      </div>

      {unfinished.length > MAX_HEALTHY_ROCKS && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
          {unfinished.length} open rocks this quarter. More than {MAX_HEALTHY_ROCKS} and focus splinters — consider moving some to next quarter.
        </div>
      )}

      {shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Mountain className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">No rocks for {quarter}</p>
          <p className="text-sm text-muted-foreground">Pick 2–4 priorities that would make this quarter a win.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
          {shown.map((r) => {
            const health = rockHealth(r.status, r.due_date, today);
            return (
              <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <div className={cn('font-medium text-sm', r.status === 'done' && 'line-through text-muted-foreground')}>{r.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.owner || 'unassigned'}{r.due_date ? ` · due ${r.due_date}` : ''}
                  </div>
                  {r.notes && <div className="text-xs text-muted-foreground mt-0.5">{r.notes}</div>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', HEALTH_TONE[health])}>{ROCK_HEALTH_LABELS[health]}</span>
                  <div className="flex gap-1">
                    {(['on_track', 'off_track', 'done'] as const).map((s) => (
                      <button key={s} onClick={() => setStatus(r, s)}
                        className={cn('rounded px-1.5 py-0.5 text-[10px] capitalize', r.status === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}>
                        {s.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                  <button onClick={async () => { if (confirm(`Delete "${r.title}"?`)) { await rocksApi.remove(r.id); await load(); } }}
                    className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New rock — {quarter}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label>What must be done</Label><Input value={form.title ?? ''} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Launch the wholesale channel" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label>Owner</Label><Input value={form.owner ?? ''} onChange={(e) => setForm({ ...form, owner: e.target.value })} placeholder="One person" /></div>
              <div className="space-y-1.5"><Label>Due date</Label><Input type="date" value={form.due_date ?? ''} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label>Notes (optional)</Label><Input value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create} disabled={saving || !form.title?.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
