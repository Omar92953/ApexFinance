import { useEffect, useMemo, useState } from 'react';
import { Plus, Download, Search, Trash2, Users, MessageCircle, Phone, Clock, Merge } from 'lucide-react';
import type { Business, Contact } from '@/services/db';
import { contactsApi } from '@/services/db';
import { classifyRfmSegment, RFM_LABELS, type RfmSegment } from '@/finance/rfm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { cn, formatCurrency } from '@/lib/utils';
import ContactDetailDialog from './ContactDetailDialog';

const STATUS_TONE: Record<string, string> = {
  lead: 'bg-muted text-muted-foreground',
  prospect: 'bg-chart-3/20 text-chart-3',
  customer: 'bg-primary/15 text-primary',
  vip: 'bg-success/15 text-success',
  churned: 'bg-destructive/15 text-destructive',
};

const SEGMENT_TONE: Record<RfmSegment, string> = {
  champion: 'bg-success/15 text-success', loyal: 'bg-primary/15 text-primary',
  promising: 'bg-chart-3/20 text-chart-3', at_risk: 'bg-warning/15 text-warning',
  lost: 'bg-destructive/15 text-destructive', none: 'bg-muted text-muted-foreground',
};

function waLink(phone?: string | null) {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, '');
  return digits ? `https://wa.me/${digits}` : null;
}

export default function CustomersTab({ business }: { business: Business }) {
  const cur = business.currency ?? 'EGP';
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [segmentFilter, setSegmentFilter] = useState<RfmSegment | 'all'>('all');
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<Partial<Contact>>({ status: 'lead', source: 'manual' });
  const [selected, setSelected] = useState<Contact | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [dupOpen, setDupOpen] = useState(false);
  const [selectedBulk, setSelectedBulk] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    try { setContacts(await contactsApi.list(business.id)); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [business.id]);

  const segmentOf = (c: Contact) => classifyRfmSegment({ ordersCount: c.orders_count || 0, lastOrderDate: c.last_order_date ?? null });

  const overdueFollowUps = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return contacts.filter((c) => c.follow_up_date && c.follow_up_date <= today);
  }, [contacts]);

  const duplicates = useMemo(() => contactsApi.findDuplicates(contacts), [contacts]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return contacts.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (segmentFilter !== 'all' && segmentOf(c) !== segmentFilter) return false;
      if (!term) return true;
      return [c.first_name, c.last_name, c.email, c.phone, c.company, ...(c.tags || [])]
        .filter(Boolean).join(' ').toLowerCase().includes(term);
    });
  }, [contacts, q, statusFilter, segmentFilter]);

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

  const bulkSetStatus = async (status: string) => {
    for (const id of selectedBulk) await contactsApi.update(id, { status });
    setSelectedBulk(new Set());
    await load();
  };

  const openDetail = (c: Contact) => { setSelected(c); setDetailOpen(true); };
  const name = (c: Contact) => [c.first_name, c.last_name].filter(Boolean).join(' ') || '—';

  return (
    <div className="space-y-4">
      {overdueFollowUps.length > 0 && (
        <div className="rounded-xl border border-warning/40 bg-warning/5 p-3">
          <div className="flex items-center gap-1.5 text-sm font-medium mb-1.5"><Clock className="h-4 w-4 text-warning" /> {overdueFollowUps.length} follow-up{overdueFollowUps.length > 1 ? 's' : ''} due</div>
          <div className="flex flex-wrap gap-2">
            {overdueFollowUps.map((c) => (
              <button key={c.id} onClick={() => openDetail(c)} className="rounded-full bg-card border border-border px-2.5 py-1 text-xs hover:border-warning">{name(c)} · {c.follow_up_date}</button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, phone, tag…" className="pl-8" />
        </div>
        <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          {['lead', 'prospect', 'customer', 'vip', 'churned'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {duplicates.length > 0 && <Button variant="outline" onClick={() => setDupOpen(true)}><Merge className="h-4 w-4 mr-1.5" /> {duplicates.length} possible duplicate{duplicates.length > 1 ? 's' : ''}</Button>}
        <Button variant="outline" onClick={importShopify} disabled={importing}><Download className={`h-4 w-4 mr-1.5 ${importing ? 'animate-pulse' : ''}`} /> Import from Shopify</Button>
        <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> Add contact</Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(['all', 'champion', 'loyal', 'promising', 'at_risk', 'lost', 'none'] as const).map((s) => (
          <button key={s} onClick={() => setSegmentFilter(s)} className={cn('rounded-full px-2.5 py-1 text-xs font-medium', segmentFilter === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
            {s === 'all' ? 'All segments' : RFM_LABELS[s]}
          </button>
        ))}
      </div>

      {importMsg && <p className={`text-xs ${importMsg.toLowerCase().includes('error') || importMsg.toLowerCase().includes('fail') ? 'text-destructive' : 'text-success'}`}>{importMsg}</p>}

      {selectedBulk.size > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 p-2 text-sm">
          <span className="font-medium">{selectedBulk.size} selected</span>
          <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" onChange={(e) => e.target.value && bulkSetStatus(e.target.value)} defaultValue="">
            <option value="" disabled>Set status…</option>
            {['lead', 'prospect', 'customer', 'vip', 'churned'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <Button size="sm" variant="ghost" onClick={() => setSelectedBulk(new Set())}>Clear</Button>
        </div>
      )}

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
                  <th className="px-3 py-2.5 w-8"><input type="checkbox" onChange={(e) => setSelectedBulk(e.target.checked ? new Set(filtered.map((c) => c.id)) : new Set())} /></th>
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Segment</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium text-right">Spent</th>
                  <th className="px-4 py-2.5 font-medium text-right">Orders</th>
                  <th className="px-4 py-2.5 font-medium">Contact</th>
                  <th className="px-2 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const seg = segmentOf(c);
                  const wa = waLink(c.phone);
                  return (
                    <tr key={c.id} onClick={() => openDetail(c)} className="border-b border-border last:border-0 hover:bg-muted/40 cursor-pointer">
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selectedBulk.has(c.id)} onChange={() => setSelectedBulk((s) => { const n = new Set(s); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })} />
                      </td>
                      <td className="px-4 py-2.5 font-medium">{name(c)}</td>
                      <td className="px-4 py-2.5"><span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', SEGMENT_TONE[seg])}>{RFM_LABELS[seg]}</span></td>
                      <td className="px-4 py-2.5"><span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_TONE[c.status] || STATUS_TONE.lead}`}>{c.status}</span></td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(Number(c.total_spent) || 0, cur)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{c.orders_count || 0}</td>
                      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          {wa && <a href={wa} target="_blank" rel="noreferrer" className="text-success hover:opacity-70"><MessageCircle className="h-4 w-4" /></a>}
                          {c.phone && <a href={`tel:${c.phone}`} className="text-primary hover:opacity-70"><Phone className="h-4 w-4" /></a>}
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-right"><button onClick={(e) => del(e, c)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button></td>
                    </tr>
                  );
                })}
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

      {/* Duplicates */}
      <Dialog open={dupOpen} onOpenChange={setDupOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Possible duplicate contacts</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
            {duplicates.map((g) => (
              <div key={g.key} className="rounded-lg border border-border p-3">
                <div className="text-xs text-muted-foreground mb-2">Matched by {g.key}</div>
                <div className="space-y-1.5">
                  {g.contacts.map((c) => (
                    <div key={c.id} className="flex items-center justify-between text-sm">
                      <span>{name(c)} · {c.email || c.phone} · {formatCurrency(Number(c.total_spent) || 0, cur)}</span>
                      <Button size="sm" variant="outline" onClick={async () => {
                        const others = g.contacts.filter((x) => x.id !== c.id);
                        for (const o of others) await contactsApi.merge(c.id, o.id);
                        await load();
                      }}>Keep this one</Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDupOpen(false)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <ContactDetailDialog business={business} contact={selected} open={detailOpen} onOpenChange={setDetailOpen} onChanged={load} />
    </div>
  );
}
