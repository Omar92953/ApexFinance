import { useEffect, useMemo, useState } from 'react';
import { Plus, Briefcase, Trash2 } from 'lucide-react';
import type { Business, Project, TimeEntry, RateCard, Contact } from '@/services/db';
import { projectsApi, timeEntriesApi, rateCardsApi, contactsApi } from '@/services/db';
import { computeProjectEconomics, classifyProjectHealth, PROJECT_HEALTH_LABELS, type ProjectHealth } from '@/finance/projects';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatCurrency, cn } from '@/lib/utils';

const HEALTH_TONE: Record<ProjectHealth, string> = {
  healthy: 'bg-success/15 text-success',
  at_risk: 'bg-warning/15 text-warning',
  over_budget: 'bg-destructive/15 text-destructive',
  no_budget: 'bg-muted text-muted-foreground',
};

const STATUS_FILTERS = ['active', 'quoted', 'on_hold', 'completed', 'all'] as const;

export default function ProjectsTab({ business }: { business: Business }) {
  const cur = business.currency ?? 'EGP';
  const [projects, setProjects] = useState<Project[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [rates, setRates] = useState<RateCard[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filter, setFilter] = useState<(typeof STATUS_FILTERS)[number]>('active');
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<Partial<Project>>({ billing_type: 'fixed', status: 'active', budget_amount: 0 });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [p, e, r, c] = await Promise.all([
      projectsApi.list(business.id),
      timeEntriesApi.list(business.id),
      rateCardsApi.list(business.id),
      contactsApi.list(business.id).catch(() => []),
    ]);
    setProjects(p); setEntries(e); setRates(r); setContacts(c);
  };
  useEffect(() => { load(); }, [business.id]);

  const rateById = useMemo(() => new Map(rates.map((r) => [r.id, r])), [rates]);

  // Resolve each entry's bill/cost rate from its rate card so project margin
  // reflects what the hours actually cost, not just what they billed.
  const econFor = (projectId: string) => {
    const mine = entries.filter((e) => e.project_id === projectId);
    return computeProjectEconomics(mine.map((e) => {
      const rc = e.rate_card_id ? rateById.get(e.rate_card_id) : undefined;
      return {
        hours: Number(e.hours) || 0,
        is_billable: e.is_billable,
        billRate: Number(rc?.hourly_rate) || 0,
        costRate: Number(rc?.cost_rate) || 0,
      };
    }));
  };

  const create = async () => {
    if (!form.name?.trim()) return;
    setSaving(true);
    try {
      await projectsApi.create({
        business_id: business.id,
        name: form.name.trim(),
        code: form.code || null,
        contact_id: form.contact_id || null,
        billing_type: form.billing_type ?? 'fixed',
        status: form.status ?? 'active',
        budget_amount: Number(form.budget_amount) || 0,
        budget_hours: form.budget_hours ? Number(form.budget_hours) : null,
      });
      setForm({ billing_type: 'fixed', status: 'active', budget_amount: 0 });
      setAddOpen(false);
      await load();
    } finally { setSaving(false); }
  };

  const filtered = projects.filter((p) => filter === 'all' || p.status === filter);
  const clientName = (id?: string | null) => {
    const c = contacts.find((x) => x.id === id);
    return c ? [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email : null;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1.5">
          {STATUS_FILTERS.map((s) => (
            <button key={s} onClick={() => setFilter(s)}
              className={cn('rounded-full px-2.5 py-1 text-xs font-medium capitalize', filter === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>
        <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> New project</Button>
      </div>

      {rates.length === 0 && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs">
          No rate cards yet — set them up in <span className="font-medium">Rate Cards</span> first, otherwise logged hours
          have no value or cost and every project will show a zero margin.
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Briefcase className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">No {filter !== 'all' ? filter.replace('_', ' ') : ''} projects</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
          {filtered.map((p) => {
            const econ = econFor(p.id);
            const health = classifyProjectHealth(p.billing_type, Number(p.budget_amount) || 0, p.budget_hours, econ);
            const client = clientName(p.contact_id);
            return (
              <div key={p.id} className="px-5 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-sm">
                      {p.name}
                      {p.code && <span className="text-xs text-muted-foreground ml-1.5">{p.code}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {p.billing_type} · {client ?? 'no client'} · {econ.hoursTotal.toFixed(1)}h logged
                      {econ.hoursTotal > 0 && <> · {econ.utilizationPct.toFixed(0)}% billable</>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className={cn('text-sm font-semibold tabular-nums', econ.margin < 0 ? 'text-destructive' : '')}>
                        {formatCurrency(econ.margin, cur)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {formatCurrency(econ.billableValue, cur)} billed − {formatCurrency(econ.laborCost, cur)} cost
                      </div>
                    </div>
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', HEALTH_TONE[health])}>
                      {PROJECT_HEALTH_LABELS[health]}
                    </span>
                    <button onClick={async () => { if (confirm(`Delete "${p.name}" and its time entries?`)) { await projectsApi.remove(p.id); await load(); } }}
                      className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New project</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label>Name</Label><Input value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Website rebuild" /></div>
              <div className="space-y-1.5"><Label>Code (optional)</Label><Input value={form.code ?? ''} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5">
              <Label>Client</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={form.contact_id ?? ''} onChange={(e) => setForm({ ...form, contact_id: e.target.value || null })}>
                <option value="">— none —</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{[c.first_name, c.last_name].filter(Boolean).join(' ') || c.email}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Billing type</Label>
                <select className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={form.billing_type} onChange={(e) => setForm({ ...form, billing_type: e.target.value as Project['billing_type'] })}>
                  <option value="fixed">Fixed price</option>
                  <option value="hourly">Hourly</option>
                  <option value="retainer">Retainer</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>{form.billing_type === 'retainer' ? 'Monthly fee' : 'Budget / fee'}</Label>
                <Input type="number" step="any" value={form.budget_amount ?? 0} onChange={(e) => setForm({ ...form, budget_amount: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>
            {form.billing_type !== 'fixed' && (
              <div className="space-y-1.5">
                <Label>Hours cap (optional)</Label>
                <Input type="number" step="any" value={form.budget_hours ?? ''} onChange={(e) => setForm({ ...form, budget_hours: e.target.value ? parseFloat(e.target.value) : null })} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={create} disabled={saving || !form.name?.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
