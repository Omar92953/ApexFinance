import { useEffect, useState } from 'react';
import { Plus, Trash2, MessagesSquare } from 'lucide-react';
import type { Business, Issue } from '@/services/db';
import { issuesApi } from '@/services/db';
import { oldestOpenIssueDays } from '@/finance/eos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const STATUS_TONE: Record<Issue['status'], string> = {
  open: 'bg-destructive/15 text-destructive',
  discussing: 'bg-warning/15 text-warning',
  solved: 'bg-success/15 text-success',
};
const PRIORITY_TONE: Record<Issue['priority'], string> = {
  high: 'text-destructive font-semibold',
  normal: 'text-foreground',
  low: 'text-muted-foreground',
};

const STALE_DAYS = 30;

export default function IssuesTab({ business }: { business: Business }) {
  const today = new Date().toISOString().slice(0, 10);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [filter, setFilter] = useState<'open' | 'solved' | 'all'>('open');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<Issue>>({ priority: 'normal' });
  const [solving, setSolving] = useState<Issue | null>(null);
  const [resolution, setResolution] = useState('');

  const load = async () => setIssues(await issuesApi.list(business.id));
  useEffect(() => { load(); }, [business.id]);

  const oldest = oldestOpenIssueDays(issues, today);

  const shown = issues.filter((i) =>
    filter === 'all' ? true : filter === 'solved' ? i.status === 'solved' : i.status !== 'solved');

  const create = async () => {
    if (!form.title?.trim()) return;
    setSaving(true);
    try {
      await issuesApi.create({
        business_id: business.id,
        title: form.title.trim(),
        description: form.description || null,
        priority: form.priority ?? 'normal',
        raised_by: form.raised_by || null,
      });
      setForm({ priority: 'normal' });
      setOpen(false);
      await load();
    } finally { setSaving(false); }
  };

  const solve = async () => {
    if (!solving) return;
    await issuesApi.update(solving.id, { status: 'solved', resolution: resolution || null });
    setSolving(null); setResolution('');
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1.5">
          {(['open', 'solved', 'all'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn('rounded-full px-2.5 py-1 text-xs font-medium capitalize', filter === f ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
              {f}
            </button>
          ))}
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> Raise issue</Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Everything blocking the business, worked through in the weekly meeting — identify, discuss, solve. An issue list that never clears
        means the meeting is discussing instead of deciding.
      </p>

      {oldest >= STALE_DAYS && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs">
          Your oldest open issue has been sitting for <span className="font-semibold">{oldest} days</span>. Solve it, drop it, or turn it into a rock.
        </div>
      )}

      {shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <MessagesSquare className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">No {filter !== 'all' ? filter : ''} issues</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
          {shown.map((i) => (
            <div key={i.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <div className={cn('text-sm', PRIORITY_TONE[i.priority], i.status === 'solved' && 'line-through text-muted-foreground')}>{i.title}</div>
                {i.description && <div className="text-xs text-muted-foreground">{i.description}</div>}
                <div className="text-[11px] text-muted-foreground">
                  {i.raised_by ? `raised by ${i.raised_by} · ` : ''}{i.created_at.slice(0, 10)}
                </div>
                {i.resolution && <div className="text-xs text-success mt-0.5">Solved: {i.resolution}</div>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium capitalize', STATUS_TONE[i.status])}>{i.status}</span>
                {i.status !== 'solved' && (
                  <>
                    {i.status === 'open' && (
                      <button onClick={async () => { await issuesApi.update(i.id, { status: 'discussing' }); await load(); }}
                        className="rounded px-1.5 py-0.5 text-[10px] bg-muted text-muted-foreground hover:text-foreground">Discussing</button>
                    )}
                    <Button size="sm" className="h-7 text-xs" onClick={() => { setSolving(i); setResolution(''); }}>Solve</Button>
                  </>
                )}
                <button onClick={async () => { if (confirm('Delete this issue?')) { await issuesApi.remove(i.id); await load(); } }}
                  className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Raise an issue</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label>Issue</Label><Input value={form.title ?? ''} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="What's blocking things?" /></div>
            <div className="space-y-1.5"><Label>Detail (optional)</Label><Input value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <select className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Issue['priority'] })}>
                  <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option>
                </select>
              </div>
              <div className="space-y-1.5"><Label>Raised by</Label><Input value={form.raised_by ?? ''} onChange={(e) => setForm({ ...form, raised_by: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create} disabled={saving || !form.title?.trim()}>Raise</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={solving !== null} onOpenChange={(v) => !v && setSolving(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Solve: {solving?.title}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>What was decided?</Label>
              <Input value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="The decision, so it isn't re-litigated later" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSolving(null)}>Cancel</Button>
            <Button onClick={solve}>Mark solved</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
