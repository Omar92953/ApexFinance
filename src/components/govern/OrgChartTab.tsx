import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Network, Pencil } from 'lucide-react';
import type { Business, GovernanceDoc } from '@/services/db';
import { governanceApi } from '@/services/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

// The accountability chart: seats and what each one owns. Deliberately about
// ROLES, not people — one person can hold several seats in a small business,
// and naming the seats is what makes it possible to hand one over later.
export default function OrgChartTab({ business }: { business: Business }) {
  const [roles, setRoles] = useState<GovernanceDoc[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<GovernanceDoc | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<GovernanceDoc>>({});

  const load = async () => setRoles(await governanceApi.list(business.id, 'role'));
  useEffect(() => { load(); }, [business.id]);

  // Build the hierarchy from parent_id; anything orphaned renders at top level
  // rather than disappearing.
  const tree = useMemo(() => {
    const byParent = new Map<string | null, GovernanceDoc[]>();
    const ids = new Set(roles.map((r) => r.id));
    for (const r of roles) {
      const key = r.parent_id && ids.has(r.parent_id) ? r.parent_id : null;
      const arr = byParent.get(key) ?? [];
      arr.push(r);
      byParent.set(key, arr);
    }
    return byParent;
  }, [roles]);

  const openCreate = () => { setEditing(null); setForm({}); setOpen(true); };
  const openEdit = (r: GovernanceDoc) => { setEditing(r); setForm(r); setOpen(true); };

  const save = async () => {
    if (!form.title?.trim()) return;
    setSaving(true);
    try {
      const payload = {
        business_id: business.id,
        kind: 'role' as const,
        title: form.title.trim(),
        owner: form.owner || null,
        body: form.body || null,
        parent_id: form.parent_id || null,
      };
      if (editing) await governanceApi.update(editing.id, payload);
      else await governanceApi.create(payload);
      setOpen(false);
      await load();
    } finally { setSaving(false); }
  };

  const renderBranch = (parentId: string | null, depth: number): JSX.Element[] =>
    (tree.get(parentId) ?? []).flatMap((r) => [
      <div key={r.id} className="flex items-start justify-between gap-3 px-5 py-2.5 border-b border-border last:border-0"
        style={{ paddingLeft: `${20 + depth * 24}px` }}>
        <div className="min-w-0">
          <div className="text-sm font-medium">
            {r.title}
            {r.owner && <span className="text-muted-foreground font-normal"> — {r.owner}</span>}
          </div>
          {r.body && <div className="text-xs text-muted-foreground whitespace-pre-wrap">{r.body}</div>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => openEdit(r)} className="rounded p-1.5 hover:bg-muted"><Pencil className="h-3.5 w-3.5" /></button>
          <button onClick={async () => { if (confirm(`Delete the "${r.title}" seat?`)) { await governanceApi.remove(r.id); await load(); } }}
            className="rounded p-1.5 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      </div>,
      ...renderBranch(r.id, depth + 1),
    ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Accountability chart</h3>
          <p className="text-sm text-muted-foreground max-w-2xl">
            The seats in this business and what each one owns. Seats, not people — one person can hold several, and naming them is what
            makes handing one over possible.
          </p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1.5" /> Add seat</Button>
      </div>

      {roles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Network className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">No seats defined</p>
          <p className="text-sm text-muted-foreground">Start at the top and work down — even if your name is in every box today.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {renderBranch(null, 0)}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Edit seat' : 'Add seat'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label>Seat</Label><Input value={form.title ?? ''} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Operations" /></div>
            <div className="space-y-1.5"><Label>Held by</Label><Input value={form.owner ?? ''} onChange={(e) => setForm({ ...form, owner: e.target.value })} placeholder="Person's name" /></div>
            <div className="space-y-1.5">
              <Label>Reports to</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={form.parent_id ?? ''} onChange={(e) => setForm({ ...form, parent_id: e.target.value || null })}>
                <option value="">— top level —</option>
                {roles.filter((r) => r.id !== editing?.id).map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Owns / accountable for</Label>
              <textarea value={form.body ?? ''} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={4}
                placeholder="The 3-5 things this seat is answerable for"
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
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
