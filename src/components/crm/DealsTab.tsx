import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Business, DealRow, Contact } from '@/services/db';
import { dealsApi, contactsApi } from '@/services/db';
import { computeWeightedPipelineValue, computeStageFunnel } from '@/finance/rfm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatCurrency } from '@/lib/utils';

const STAGES: { key: string; label: string }[] = [
  { key: 'lead', label: 'Lead' },
  { key: 'qualified', label: 'Qualified' },
  { key: 'proposal', label: 'Proposal' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
];
const STAGE_ORDER = ['lead', 'qualified', 'proposal', 'won'];

export default function DealsTab({ business }: { business: Business }) {
  const cur = business.currency ?? 'EGP';
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<Partial<DealRow>>({ stage: 'lead', value: 0 });

  const load = async () => setDeals(await dealsApi.list(business.id));
  useEffect(() => { load(); contactsApi.list(business.id).then(setContacts); }, [business.id]);

  const contactName = (id?: string | null) => {
    const c = contacts.find((x) => x.id === id);
    return c ? ([c.first_name, c.last_name].filter(Boolean).join(' ') || c.email) : null;
  };

  const openPipeline = useMemo(() => deals.filter((d) => d.stage !== 'won' && d.stage !== 'lost'), [deals]);
  const weightedValue = useMemo(() => computeWeightedPipelineValue(openPipeline), [openPipeline]);
  const funnel = useMemo(() => computeStageFunnel(deals, STAGE_ORDER), [deals]);

  const add = async () => {
    if (!form.title?.trim()) return;
    await dealsApi.create({ business_id: business.id, title: form.title, value: Number(form.value) || 0, stage: form.stage ?? 'lead', contact_id: form.contact_id || null, expected_close: form.expected_close || null });
    setForm({ stage: 'lead', value: 0 });
    setAddOpen(false);
    load();
  };

  const move = async (d: DealRow, stage: string) => {
    let win_loss_reason = d.win_loss_reason;
    if ((stage === 'won' || stage === 'lost') && d.stage !== stage) {
      win_loss_reason = prompt(`Why was this deal ${stage}?`) ?? undefined;
    }
    await dealsApi.update(d.id, { stage, win_loss_reason });
    load();
  };
  const del = async (id: string) => { await dealsApi.remove(id); load(); };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Weighted open pipeline</div>
          <div className="text-2xl font-bold tabular-nums">{formatCurrency(weightedValue, cur)}</div>
          <p className="text-xs text-muted-foreground">Expected value, weighted by how far along each deal is</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground mb-1.5">Stage funnel (all deals ever)</div>
          <div className="flex gap-2">
            {funnel.map((f) => (
              <div key={f.stage} className="flex-1 text-center">
                <div className="text-sm font-semibold tabular-nums">{f.count}</div>
                <div className="text-[10px] text-muted-foreground capitalize">{f.stage}</div>
                <div className="text-[10px] text-muted-foreground">{f.pct.toFixed(0)}%</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Drag-free pipeline — use each card's dropdown to move stages.</p>
        <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> New deal</Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
        {STAGES.map((s) => {
          const items = deals.filter((d) => d.stage === s.key);
          const total = items.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
          return (
            <div key={s.key} className="rounded-xl border border-border bg-card/50 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold">{s.label}</span>
                <span className="text-xs text-muted-foreground">{items.length} · {formatCurrency(total, cur)}</span>
              </div>
              <div className="space-y-2">
                {items.map((d) => (
                  <div key={d.id} className="rounded-lg border border-border bg-card p-2.5">
                    <div className="flex justify-between gap-2">
                      <span className="text-sm font-medium">{d.title}</span>
                      <button onClick={() => del(d.id)} className="text-muted-foreground hover:text-destructive shrink-0"><Trash2 className="h-3 w-3" /></button>
                    </div>
                    <div className="text-xs text-muted-foreground">{formatCurrency(Number(d.value) || 0, cur)}{contactName(d.contact_id) ? ` · ${contactName(d.contact_id)}` : ''}</div>
                    {d.expected_close && <div className="text-[10px] text-muted-foreground">Expected close {d.expected_close}</div>}
                    {d.win_loss_reason && <div className="text-[10px] text-muted-foreground italic">"{d.win_loss_reason}"</div>}
                    <select className="mt-2 h-7 w-full rounded border border-input bg-background px-1.5 text-xs" value={d.stage} onChange={(e) => move(d, e.target.value)}>
                      {STAGES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                    </select>
                  </div>
                ))}
                {items.length === 0 && <p className="text-xs text-muted-foreground py-2 text-center">—</p>}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New deal</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label>Title</Label><Input value={form.title ?? ''} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Wholesale order" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label>Value</Label><Input type="number" step="any" value={form.value ?? 0} onChange={(e) => setForm({ ...form, value: parseFloat(e.target.value) || 0 })} /></div>
              <div className="space-y-1.5">
                <Label>Stage</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.stage ?? 'lead'} onChange={(e) => setForm({ ...form, stage: e.target.value })}>
                  {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Contact (optional)</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.contact_id ?? ''} onChange={(e) => setForm({ ...form, contact_id: e.target.value || null })}>
                <option value="">— none —</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{[c.first_name, c.last_name].filter(Boolean).join(' ') || c.email}</option>)}
              </select>
            </div>
            <div className="space-y-1.5"><Label>Expected close (optional)</Label><Input type="date" value={form.expected_close ?? ''} onChange={(e) => setForm({ ...form, expected_close: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={add} disabled={!form.title?.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
