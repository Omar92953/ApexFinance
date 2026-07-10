import { useEffect, useState } from 'react';
import { Trash2, StickyNote, Clock, Mail, Phone, MapPin, Tag } from 'lucide-react';
import type { Business, Contact } from '@/services/db';
import { contactsApi, notesApi, activitiesApi } from '@/services/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatCurrency } from '@/lib/utils';

const STATUSES = ['lead', 'prospect', 'customer', 'vip', 'churned'];

export default function ContactDetailDialog({
  business, contact, open, onOpenChange, onChanged,
}: { business: Business; contact: Contact | null; open: boolean; onOpenChange: (v: boolean) => void; onChanged: () => void }) {
  const cur = business.currency ?? 'USD';
  const [form, setForm] = useState<Partial<Contact>>({});
  const [notes, setNotes] = useState<Array<{ id: string; body: string; created_at: string }>>([]);
  const [activities, setActivities] = useState<Array<{ id: string; type: string; description: string; created_at: string }>>([]);
  const [newNote, setNewNote] = useState('');
  const [tab, setTab] = useState<'notes' | 'activity'>('notes');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (contact) {
      setForm(contact);
      notesApi.list(contact.id).then(setNotes);
      activitiesApi.list(contact.id).then(setActivities);
    }
  }, [contact]);

  if (!contact) return null;

  const save = async () => {
    setSaving(true);
    try {
      await contactsApi.update(contact.id, {
        first_name: form.first_name, last_name: form.last_name, email: form.email, phone: form.phone,
        company: form.company, city: form.city, country: form.country, status: form.status,
        follow_up_date: form.follow_up_date || null,
        tags: typeof form.tags === 'string' ? String(form.tags).split(',').map((t) => t.trim()).filter(Boolean) : form.tags,
      });
      onChanged();
      onOpenChange(false);
    } finally { setSaving(false); }
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    await notesApi.add(business.id, contact.id, newNote.trim());
    setNewNote('');
    setNotes(await notesApi.list(contact.id));
    setActivities(await activitiesApi.list(contact.id));
  };

  const tagsValue = Array.isArray(form.tags) ? form.tags.join(', ') : (form.tags ?? '');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{[form.first_name, form.last_name].filter(Boolean).join(' ') || form.email || 'Contact'}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-2 py-2 max-h-[70vh] overflow-y-auto">
          {/* Profile */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label="First name" value={form.first_name} onChange={(v) => setForm({ ...form, first_name: v })} />
              <Field label="Last name" value={form.last_name} onChange={(v) => setForm({ ...form, last_name: v })} />
            </div>
            <Field label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} icon={<Mail className="h-3.5 w-3.5" />} />
            <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} icon={<Phone className="h-3.5 w-3.5" />} />
            <Field label="Company" value={form.company} onChange={(v) => setForm({ ...form, company: v })} />
            <div className="grid grid-cols-2 gap-2">
              <Field label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} icon={<MapPin className="h-3.5 w-3.5" />} />
              <Field label="Country" value={form.country} onChange={(v) => setForm({ ...form, country: v })} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.status ?? 'lead'} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <Field label="Tags (comma-separated)" value={tagsValue} onChange={(v) => setForm({ ...form, tags: v as any })} icon={<Tag className="h-3.5 w-3.5" />} />
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />Next follow-up</Label>
              <Input type="date" value={form.follow_up_date ?? ''} onChange={(e) => setForm({ ...form, follow_up_date: e.target.value || null })} />
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Total spent</span><span className="tabular-nums font-medium">{formatCurrency(Number(contact.total_spent) || 0, cur)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Orders</span><span>{contact.orders_count || 0}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Source</span><span className="capitalize">{contact.source}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Marketing consent</span><span>{contact.accepts_marketing ? 'Yes' : 'No'}</span></div>
            </div>
            <Button onClick={save} disabled={saving} className="w-full">{saving ? 'Saving…' : 'Save changes'}</Button>
          </div>

          {/* Notes / Activity */}
          <div className="space-y-3">
            <div className="flex gap-1 border-b border-border">
              <button onClick={() => setTab('notes')} className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px ${tab === 'notes' ? 'border-primary' : 'border-transparent text-muted-foreground'}`}><StickyNote className="h-3.5 w-3.5 inline mr-1" />Notes</button>
              <button onClick={() => setTab('activity')} className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px ${tab === 'activity' ? 'border-primary' : 'border-transparent text-muted-foreground'}`}><Clock className="h-3.5 w-3.5 inline mr-1" />Activity</button>
            </div>

            {tab === 'notes' ? (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Add a note…" onKeyDown={(e) => { if (e.key === 'Enter') addNote(); }} />
                  <Button size="sm" onClick={addNote}>Add</Button>
                </div>
                <div className="space-y-2">
                  {notes.length === 0 && <p className="text-sm text-muted-foreground">No notes yet.</p>}
                  {notes.map((n) => (
                    <div key={n.id} className="rounded-lg border border-border p-2.5 text-sm">
                      <div className="flex justify-between gap-2">
                        <span>{n.body}</span>
                        <button onClick={async () => { await notesApi.remove(n.id); setNotes(await notesApi.list(contact.id)); }} className="text-muted-foreground hover:text-destructive shrink-0"><Trash2 className="h-3 w-3" /></button>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {activities.length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
                {activities.map((a) => (
                  <div key={a.id} className="flex gap-2 text-sm">
                    <div className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                    <div>
                      <div><span className="capitalize font-medium">{a.type}</span> — {a.description}</div>
                      <div className="text-[10px] text-muted-foreground">{new Date(a.created_at).toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, onChange, icon }: { label: string; value?: string | null; onChange: (v: string) => void; icon?: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5">{icon}{label}</Label>
      <Input value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
