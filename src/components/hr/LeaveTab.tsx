import { useEffect, useState } from 'react';
import { Plus, CalendarOff } from 'lucide-react';
import type { Business, Employee, LeaveRecord } from '@/services/db';
import { employeesApi, leaveApi } from '@/services/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const STATUS_TONE: Record<string, string> = { pending: 'bg-warning/15 text-warning', approved: 'bg-success/15 text-success', rejected: 'bg-destructive/15 text-destructive' };

export default function LeaveTab({ business }: { business: Business }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [records, setRecords] = useState<LeaveRecord[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<{ employee_id: string; leave_type: string; start_date: string; end_date: string; notes: string }>({ employee_id: '', leave_type: 'annual', start_date: '', end_date: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [e, r] = await Promise.all([employeesApi.list(business.id), leaveApi.list(business.id)]);
    setEmployees(e); setRecords(r);
    if (!form.employee_id && e[0]) setForm((f) => ({ ...f, employee_id: e[0].id }));
  };
  useEffect(() => { load(); }, [business.id]);

  const employeeName = (id: string) => employees.find((e) => e.id === id)?.name || '—';

  const create = async () => {
    if (!form.employee_id || !form.start_date || !form.end_date) return;
    setSaving(true);
    try {
      await leaveApi.create({ business_id: business.id, employee_id: form.employee_id, leave_type: form.leave_type, start_date: form.start_date, end_date: form.end_date, notes: form.notes || undefined });
      setForm({ ...form, start_date: '', end_date: '', notes: '' }); setAddOpen(false); await load();
    } finally { setSaving(false); }
  };

  const setStatus = async (r: LeaveRecord, status: LeaveRecord['status']) => { await leaveApi.updateStatus(r.id, status); await load(); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Basic leave tracking — no accrual balances, just a log of requested/approved time off.</p>
        <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> New leave request</Button>
      </div>

      {records.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <CalendarOff className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">No leave records yet</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
          {records.map((r) => (
            <div key={r.id} className="flex items-center justify-between px-5 py-3 text-sm">
              <div>
                <div className="font-medium">{employeeName(r.employee_id)} <span className="text-xs text-muted-foreground capitalize">· {r.leave_type}</span></div>
                <div className="text-xs text-muted-foreground">{r.start_date} → {r.end_date}{r.notes ? ` · ${r.notes}` : ''}</div>
              </div>
              <div className="flex gap-1.5">
                {(['pending', 'approved', 'rejected'] as const).map((s) => (
                  <button key={s} onClick={() => setStatus(r, s)} className={cn('rounded-full px-2.5 py-1 text-xs font-medium capitalize', r.status === s ? STATUS_TONE[s] : 'bg-muted text-muted-foreground')}>{s}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New leave request</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Employee</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label>Start date</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>End date</Label><Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={form.leave_type} onChange={(e) => setForm({ ...form, leave_type: e.target.value })}>
                {['annual', 'sick', 'unpaid', 'other'].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="space-y-1.5"><Label>Notes (optional)</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button><Button onClick={create} disabled={saving || !form.employee_id || !form.start_date || !form.end_date}>Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
