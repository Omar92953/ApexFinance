import { useEffect, useState } from 'react';
import { Plus, Trash2, Users } from 'lucide-react';
import type { Business, Employee } from '@/services/db';
import { employeesApi } from '@/services/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatCurrency, cn } from '@/lib/utils';

export default function EmployeesTab({ business }: { business: Business }) {
  const cur = business.currency ?? 'EGP';
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<Partial<Employee>>({ monthly_salary: 0 });
  const [saving, setSaving] = useState(false);

  const load = async () => setEmployees(await employeesApi.list(business.id));
  useEffect(() => { load(); }, [business.id]);

  const create = async () => {
    if (!form.name?.trim()) return;
    setSaving(true);
    try {
      await employeesApi.create({ business_id: business.id, name: form.name, role: form.role, monthly_salary: Number(form.monthly_salary) || 0, phone: form.phone, email: form.email, hire_date: form.hire_date });
      setForm({ monthly_salary: 0 }); setAddOpen(false); await load();
    } finally { setSaving(false); }
  };

  const toggleActive = async (e: Employee) => { await employeesApi.update(e.id, { is_active: !e.is_active }); await load(); };
  const del = async (id: string) => { await employeesApi.remove(id); await load(); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Employees on payroll — inactive employees are skipped when creating a new payroll run.</p>
        <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> Add employee</Button>
      </div>

      {employees.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Users className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">No employees yet</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
          {employees.map((e) => (
            <div key={e.id} className="flex items-center justify-between px-5 py-3 text-sm">
              <div>
                <div className="font-medium">{e.name} {!e.is_active && <span className="text-xs text-muted-foreground">(inactive)</span>}</div>
                <div className="text-xs text-muted-foreground">{e.role || '—'} · {e.phone || e.email || 'no contact info'}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="tabular-nums font-medium">{formatCurrency(e.monthly_salary, cur)}/mo</span>
                <button onClick={() => toggleActive(e)} className={cn('rounded-full px-2.5 py-1 text-xs font-medium', e.is_active ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground')}>{e.is_active ? 'Active' : 'Inactive'}</button>
                <button onClick={() => del(e.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add employee</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label>Name</Label><Input value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Role</Label><Input value={form.role ?? ''} onChange={(e) => setForm({ ...form, role: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label>Monthly salary</Label><Input type="number" step="any" value={form.monthly_salary ?? 0} onChange={(e) => setForm({ ...form, monthly_salary: parseFloat(e.target.value) || 0 })} /></div>
              <div className="space-y-1.5"><Label>Hire date</Label><Input type="date" value={form.hire_date ?? ''} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Email</Label><Input value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button><Button onClick={create} disabled={saving || !form.name?.trim()}>Add</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
