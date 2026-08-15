import { useEffect, useState } from 'react';
import { Plus, Trash2, FileText, Pencil, AlertTriangle } from 'lucide-react';
import type { Business, GovernanceDoc, GovernanceKind } from '@/services/db';
import { governanceApi } from '@/services/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export interface GovernanceDocsTabProps {
  business: Business;
  kinds: GovernanceKind[];
  heading: string;
  description: string;
  /** Ask for a "next review" date — SOPs and policies go stale silently otherwise. */
  withReview?: boolean;
  /** Ask for a due date + recurrence — compliance obligations repeat. */
  withDueDate?: boolean;
  bodyLabel?: string;
  bodyPlaceholder?: string;
  emptyHint?: string;
}

const KIND_LABEL: Record<GovernanceKind, string> = {
  profile: 'Business profile', role: 'Role', sop: 'Procedure', policy: 'Policy',
  vendor: 'Vendor', system: 'System', decision: 'Decision', kpi: 'KPI definition', compliance: 'Obligation',
};

export default function GovernanceDocsTab({
  business, kinds, heading, description, withReview, withDueDate, bodyLabel = 'Details', bodyPlaceholder, emptyHint,
}: GovernanceDocsTabProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [docs, setDocs] = useState<GovernanceDoc[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<GovernanceDoc | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<GovernanceDoc>>({ kind: kinds[0], status: 'active' });

  const load = async () => {
    const all = await Promise.all(kinds.map((k) => governanceApi.list(business.id, k)));
    setDocs(all.flat());
  };
  useEffect(() => { load(); }, [business.id, kinds.join(',')]);

  const openCreate = () => { setEditing(null); setForm({ kind: kinds[0], status: 'active' }); setOpen(true); };
  const openEdit = (d: GovernanceDoc) => { setEditing(d); setForm(d); setOpen(true); };

  const save = async () => {
    if (!form.title?.trim()) return;
    setSaving(true);
    try {
      const payload = {
        business_id: business.id,
        kind: (form.kind ?? kinds[0]) as GovernanceKind,
        title: form.title.trim(),
        body: form.body || null,
        owner: form.owner || null,
        review_due: form.review_due || null,
        due_date: form.due_date || null,
        recurrence: form.recurrence || null,
        status: form.status ?? 'active',
      };
      if (editing) await governanceApi.update(editing.id, payload);
      else await governanceApi.create(payload);
      setOpen(false);
      await load();
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{heading}</h3>
          <p className="text-sm text-muted-foreground max-w-2xl">{description}</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1.5" /> Add</Button>
      </div>

      {docs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">Nothing written down yet</p>
          {emptyHint && <p className="text-sm text-muted-foreground max-w-md mx-auto">{emptyHint}</p>}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
          {docs.map((d) => {
            const reviewOverdue = d.review_due && d.review_due < today;
            const dueSoon = d.due_date && d.due_date <= today;
            return (
              <div key={d.id} className="px-5 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-medium text-sm">{d.title}</span>
                      {kinds.length > 1 && <span className="text-[10px] rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground">{KIND_LABEL[d.kind]}</span>}
                      {d.status === 'draft' && <span className="text-[10px] rounded-full bg-warning/15 px-1.5 py-0.5 text-warning">Draft</span>}
                    </div>
                    {d.body && <p className="text-xs text-muted-foreground whitespace-pre-wrap mt-1">{d.body}</p>}
                    <div className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground mt-1">
                      {d.owner && <span>Owner: {d.owner}</span>}
                      {d.review_due && (
                        <span className={cn(reviewOverdue && 'text-warning font-medium')}>
                          {reviewOverdue && <AlertTriangle className="h-3 w-3 inline mr-0.5" />}
                          Review {d.review_due}
                        </span>
                      )}
                      {d.due_date && (
                        <span className={cn(dueSoon && 'text-destructive font-medium')}>
                          Due {d.due_date}{d.recurrence ? ` (${d.recurrence})` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => openEdit(d)} className="rounded p-1.5 hover:bg-muted"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={async () => { if (confirm(`Delete "${d.title}"?`)) { await governanceApi.remove(d.id); await load(); } }}
                      className="rounded p-1.5 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{editing ? 'Edit' : 'Add'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2 max-h-[65vh] overflow-y-auto">
            {kinds.length > 1 && (
              <div className="space-y-1.5">
                <Label>Type</Label>
                <select className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as GovernanceKind })}>
                  {kinds.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                </select>
              </div>
            )}
            <div className="space-y-1.5"><Label>Title</Label><Input value={form.title ?? ''} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div className="space-y-1.5">
              <Label>{bodyLabel}</Label>
              <textarea
                value={form.body ?? ''}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                placeholder={bodyPlaceholder}
                rows={6}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label>Owner</Label><Input value={form.owner ?? ''} onChange={(e) => setForm({ ...form, owner: e.target.value })} placeholder="Who is accountable" /></div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <select className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as GovernanceDoc['status'] })}>
                  <option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option>
                </select>
              </div>
            </div>
            {withReview && (
              <div className="space-y-1.5">
                <Label>Next review</Label>
                <Input type="date" value={form.review_due ?? ''} onChange={(e) => setForm({ ...form, review_due: e.target.value })} />
                <p className="text-[11px] text-muted-foreground">Procedures rot quietly. A review date makes that visible.</p>
              </div>
            )}
            {withDueDate && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5"><Label>Next due</Label><Input type="date" value={form.due_date ?? ''} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
                <div className="space-y-1.5">
                  <Label>Repeats</Label>
                  <select className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={form.recurrence ?? ''} onChange={(e) => setForm({ ...form, recurrence: (e.target.value || null) as GovernanceDoc['recurrence'] })}>
                    <option value="">One-off</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option>
                  </select>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.title?.trim()}>{editing ? 'Save' : 'Add'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
