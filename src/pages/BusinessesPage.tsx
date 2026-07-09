import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Building2, Pencil, Trash2, ChevronRight } from 'lucide-react';
import { useBusinessStore } from '@/stores/businessStore';
import type { Business } from '@/services/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

// Every business is EGP-only and keeps 100% of its own net profit — no
// per-business currency or profit-split configuration to manage.
const EMPTY: Partial<Business> = {
  name: '',
  profit_model: 'owner',
  percentage_value: 0,
  fixed_amount: 0,
  is_owner: true,
  currency: 'EGP',
};

export default function BusinessesPage() {
  const navigate = useNavigate();
  const { businesses, loaded, fetch, create, update, remove } = useBusinessStore();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Business | null>(null);
  const [form, setForm] = useState<Partial<Business>>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!loaded) fetch(); }, [loaded, fetch]);

  const openCreate = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (b: Business) => { setEditing(b); setForm(b); setOpen(true); };

  const save = async () => {
    if (!form.name?.trim()) return;
    setSaving(true);
    try {
      const payload: Partial<Business> = {
        ...form,
        name: form.name.trim(),
        currency: 'EGP',
        profit_model: 'owner',
        is_owner: true,
      };
      if (editing) await update(editing.id, payload);
      else await create(payload);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const del = async (b: Business) => {
    if (confirm(`Delete "${b.name}" and all its finance data? This cannot be undone.`)) {
      await remove(b.id);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Businesses</h1>
          <p className="text-sm text-muted-foreground">Each business has its own full finance & cost workspace.</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1.5" /> New business</Button>
      </div>

      {!loaded ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : businesses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Building2 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">No businesses yet</p>
          <p className="text-sm text-muted-foreground mb-4">Create your first business to start tracking finances.</p>
          <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1.5" /> New business</Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {businesses.map((b) => (
            <div key={b.id} className="group rounded-xl border border-border bg-card p-4 hover:border-primary/50 transition-colors">
              <div className="flex items-start justify-between">
                <button onClick={() => navigate(`/businesses/${b.id}`)} className="flex items-center gap-3 text-left">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold">
                    {b.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="font-semibold">{b.name}</div>
                </button>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(b)} className="rounded p-1.5 hover:bg-muted" aria-label="Edit"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => del(b)} className="rounded p-1.5 hover:bg-destructive hover:text-destructive-foreground" aria-label="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              <button onClick={() => navigate(`/businesses/${b.id}`)} className="mt-4 flex w-full items-center justify-between text-sm text-primary font-medium">
                Open workspace <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit business' : 'New business'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Business name</Label>
              <Input value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Acme Store" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.name?.trim()}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
