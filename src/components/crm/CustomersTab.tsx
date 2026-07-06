import { useEffect, useMemo, useState } from 'react';
import { Plus, Download, Search, Trash2, Users } from 'lucide-react';
import type { Business, Contact } from '@/services/db';
import { contactsApi } from '@/services/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatCurrency } from '@/lib/utils';
import ContactDetailDialog from './ContactDetailDialog';

const STATUS_TONE: Record<string, string> = {
  lead: 'bg-muted text-muted-foreground',
  prospect: 'bg-chart-3/20 text-chart-3',
  customer: 'bg-primary/15 text-primary',
  vip: 'bg-success/15 text-success',
  churned: 'bg-destructive/15 text-destructive',
};

export default function CustomersTab({ business }: { business: Business }) {
  const cur = business.currency ?? 'USD';
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<Partial<Contact>>({ status: 'lead', source: 'manual' });
  const [selected, setSelected] = useState<Contact | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setContacts(await contactsApi.list(business.id)); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [business.id]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return contacts.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (!term) return true;
      return [c.first_name, c.last_name, c.email, c.phone, c.company, ...(c.tags || [])]
        .filter(Boolean).join(' ').toLowerCase().includes(term);
    });
  }, [contacts, q, statusFilter]);

  const addContact = async () => {
    if (!form.first_name && !form.email) return;
    await contactsApi.create({
      business_id: business.id,
      first_name: form.first_name, last_name: form.last_name, email: form.email, phone: form.phone,
      company: form.company, status: form.status ?? 'lead', source: 'manual',
    });
    setForm({ status: 'lead', source: 'manual' });
    setAddOpen(false);
    load();
  };

  const importShopify = async () => {
    setImporting(true); setImportMsg(null);
    try {
      const res = await contactsApi.importFromShopify(business.id);
      setImportMsg(res?.error ? `Error: ${res.error}` : `Imported ${res.imported ?? 0} contacts.`);
      load();
    } catch (e) {
      setImportMsg(`Import failed: ${e instanceof Error ? e.message : e}. Connect Shopify in Integrations first.`);
    } finally { setImporting(false); }
  };

  const del = async (e: React.MouseEvent, c: Contact) => {
    e.stopPropagation();
    if (confirm(`Delete ${c.first_name || c.email}?`)) { await contactsApi.remove(c.id); load(); }
  };

  const openDetail = (c: Contact) => { setSelected(c); setDetailOpen(true); };
  const name = (c: Contact) => [c.first_name, c.last_name].filter(Boolean).join(' ') || '—';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, phone, tag…" className="pl-8" />
        </div>
        <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          {['lead', 'prospect', 'customer', 'vip', 'churned'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <Button variant="outline" onClick={importShopify} disabled={importing}><Download className={`h-4 w-4 mr-1.5 ${importing ? 'animate-pulse' : ''}`} /> Import from Shopify</Button>
        <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> Add contact</Button>
      </div>

      {importMsg && <p className={`text-xs ${importMsg.toLowerCase().includes('error') || importMsg.toLowerCase().includes('fail') ? 'text-destructive' : 'text-success'}`}>{importMsg}</p>}

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Users className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">No contacts{contacts.length ? ' match your search' : ' yet'}</p>
          <p className="text-sm text-muted-foreground mb-4">Add one manually or import from your connected Shopify store.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-muted-foreground">
                <tr className="text-left">
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Email</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium text-right">Spent</th>
                  <th className="px-4 py-2.5 font-medium text-right">Orders</th>
                  <th className="px-4 py-2.5 font-medium">Tags</th>
                  <th className="px-2 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} onClick={() => openDetail(c)} className="border-b border-border last:border-0 hover:bg-muted/40 cursor-pointer">
                    <td className="px-4 py-2.5 font-medium">{name(c)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{c.email || '—'}</td>
                    <td className="px-4 py-2.5"><span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_TONE[c.status] || STATUS_TONE.lead}`}>{c.status}</span></td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(Number(c.total_spent) || 0, cur)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{c.orders_count || 0}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {(c.tags || []).slice(0, 3).map((t) => <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{t}</span>)}
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-right"><button onClick={(e) => del(e, c)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">{filtered.length} of {contacts.length} contacts</p>

      {/* Add contact */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add contact</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label>First name</Label><Input value={form.first_name ?? ''} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Last name</Label><Input value={form.last_name ?? ''} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Company</Label><Input value={form.company ?? ''} onChange={(e) => setForm({ ...form, company: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.status ?? 'lead'} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {['lead', 'prospect', 'customer', 'vip', 'churned'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={addContact} disabled={!form.first_name && !form.email}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ContactDetailDialog business={business} contact={selected} open={detailOpen} onOpenChange={setDetailOpen} onChanged={load} />
    </div>
  );
}
