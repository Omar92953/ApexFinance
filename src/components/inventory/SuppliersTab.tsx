import { useEffect, useState } from 'react';
import { Plus, Trash2, Truck } from 'lucide-react';
import type { Business, Supplier } from '@/services/db';
import { suppliersApi } from '@/services/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

export default function SuppliersTab({ business }: { business: Business }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Supplier>>({});
  const [saving, setSaving] = useState(false);

  const load = async () => setSuppliers(await suppliersApi.list(business.id));
  useEffect(() => { load(); }, [business.id]);

  const save = async () => {
    if (!form.name?.trim()) return;
    setSaving(true);
    try {
      await suppliersApi.create({ ...form, business_id: business.id, is_active: true });
      setForm({}); setOpen(false); await load();
    } finally { setSaving(false); }
  };

  const remove = async (s: Supplier) => { if (confirm(`Delete supplier "${s.name}"?`)) { await suppliersApi.remove(s.id); await load(); } };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Suppliers you buy raw materials or products from.</p>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> New supplier</Button>
      </div>

      {suppliers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Truck className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">No suppliers yet</p>
          <p className="text-sm text-muted-foreground">Add one to start creating purchase orders.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {suppliers.map((s) => (
            <div key={s.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">{s.name}</div>
                  {s.contact_name && <div className="text-xs text-muted-foreground">{s.contact_name}</div>}
                </div>
                <button onClick={() => remove(s)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                {s.phone && <div>{s.phone}</div>}
                {s.email && <div>{s.email}</div>}
                {s.payment_terms && <div>Terms: {s.payment_terms}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New supplier</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label>Name</Label><Input value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Acrylic World" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label>Contact name</Label><Input value={form.contact_name ?? ''} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Email</Label><Input value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Payment terms</Label><Input value={form.payment_terms ?? ''} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })} placeholder="e.g. Net 30" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.name?.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
