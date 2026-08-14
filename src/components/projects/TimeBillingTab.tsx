import { useEffect, useMemo, useState } from 'react';
import { Plus, Clock, Trash2 } from 'lucide-react';
import type { Business, Project, TimeEntry, RateCard, Employee } from '@/services/db';
import { projectsApi, timeEntriesApi, rateCardsApi, employeesApi } from '@/services/db';
import { computeUnbilledValue } from '@/finance/projects';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatCurrency, cn } from '@/lib/utils';

export default function TimeBillingTab({ business }: { business: Business }) {
  const cur = business.currency ?? 'EGP';
  const [projects, setProjects] = useState<Project[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [rates, setRates] = useState<RateCard[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<TimeEntry>>({
    entry_date: new Date().toISOString().slice(0, 10), hours: 0, is_billable: true,
  });

  const load = async () => {
    const [p, e, r, emp] = await Promise.all([
      projectsApi.list(business.id),
      timeEntriesApi.list(business.id),
      rateCardsApi.list(business.id),
      employeesApi.list(business.id).catch(() => []),
    ]);
    setProjects(p); setEntries(e); setRates(r); setEmployees(emp);
  };
  useEffect(() => { load(); }, [business.id]);

  const rateById = useMemo(() => new Map(rates.map((r) => [r.id, r])), [rates]);
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? '—';

  const withRates = useMemo(() => entries.map((e) => {
    const rc = e.rate_card_id ? rateById.get(e.rate_card_id) : undefined;
    return {
      ...e,
      billRate: Number(rc?.hourly_rate) || 0,
      costRate: Number(rc?.cost_rate) || 0,
    };
  }), [entries, rateById]);

  const unbilled = useMemo(() => computeUnbilledValue(withRates), [withRates]);
  const unbilledHours = useMemo(
    () => withRates.filter((e) => e.is_billable && !e.invoiced_on).reduce((s, e) => s + (Number(e.hours) || 0), 0),
    [withRates],
  );

  const create = async () => {
    if (!form.project_id || !(Number(form.hours) > 0)) return;
    setSaving(true);
    try {
      await timeEntriesApi.create({
        business_id: business.id,
        project_id: form.project_id,
        employee_id: form.employee_id || null,
        rate_card_id: form.rate_card_id || null,
        entry_date: form.entry_date || new Date().toISOString().slice(0, 10),
        hours: Number(form.hours) || 0,
        description: form.description || null,
        is_billable: form.is_billable ?? true,
      });
      setForm({ entry_date: new Date().toISOString().slice(0, 10), hours: 0, is_billable: true, project_id: form.project_id });
      setOpen(false);
      await load();
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Unbilled work in progress</div>
          <div className="text-2xl font-bold tabular-nums">{formatCurrency(unbilled, cur)}</div>
          <p className="text-xs text-muted-foreground">{unbilledHours.toFixed(1)}h delivered but not yet invoiced</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Hours logged</div>
          <div className="text-2xl font-bold tabular-nums">{entries.reduce((s, e) => s + (Number(e.hours) || 0), 0).toFixed(1)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Active projects</div>
          <div className="text-2xl font-bold tabular-nums">{projects.filter((p) => p.status === 'active').length}</div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Unbilled work is revenue you've already earned — chase it into an invoice.</p>
        <Button onClick={() => setOpen(true)} disabled={projects.length === 0}><Plus className="h-4 w-4 mr-1.5" /> Log time</Button>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Clock className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">No time logged yet</p>
          {projects.length === 0 && <p className="text-sm text-muted-foreground">Create a project first.</p>}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
          {entries.slice(0, 50).map((e) => {
            const rc = e.rate_card_id ? rateById.get(e.rate_card_id) : undefined;
            const value = (Number(e.hours) || 0) * (Number(rc?.hourly_rate) || 0);
            return (
              <div key={e.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="font-medium truncate">{projectName(e.project_id)}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {e.entry_date} · {Number(e.hours).toFixed(1)}h{e.description ? ` · ${e.description}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {!e.is_billable
                    ? <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Non-billable</span>
                    : <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', e.invoiced_on ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning')}>
                        {e.invoiced_on ? 'Invoiced' : 'Unbilled'}
                      </span>}
                  <span className="tabular-nums w-24 text-right">{e.is_billable ? formatCurrency(value, cur, true) : '—'}</span>
                  <button onClick={async () => { await timeEntriesApi.remove(e.id); await load(); }} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log time</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Project</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={form.project_id ?? ''} onChange={(e) => setForm({ ...form, project_id: e.target.value })}>
                <option value="">— select —</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={form.entry_date ?? ''} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Hours</Label><Input type="number" step="any" value={form.hours ?? 0} onChange={(e) => setForm({ ...form, hours: parseFloat(e.target.value) || 0 })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Rate card</Label>
                <select className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={form.rate_card_id ?? ''} onChange={(e) => setForm({ ...form, rate_card_id: e.target.value || null })}>
                  <option value="">— none —</option>
                  {rates.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Who</Label>
                <select className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={form.employee_id ?? ''} onChange={(e) => setForm({ ...form, employee_id: e.target.value || null })}>
                  <option value="">— none —</option>
                  {employees.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1.5"><Label>Description</Label><Input value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_billable ?? true} onChange={(e) => setForm({ ...form, is_billable: e.target.checked })} />
              Billable
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create} disabled={saving || !form.project_id || !(Number(form.hours) > 0)}>Log</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
