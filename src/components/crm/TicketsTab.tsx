import { useEffect, useState } from 'react';
import { Plus, LifeBuoy } from 'lucide-react';
import type { Business, Contact, TicketRow } from '@/services/db';
import { contactsApi, ticketsApi, ticketMessagesApi } from '@/services/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const STATUS_TONE: Record<string, string> = { open: 'bg-destructive/15 text-destructive', pending: 'bg-warning/15 text-warning', resolved: 'bg-success/15 text-success' };
const PRIORITY_TONE: Record<string, string> = { low: 'text-muted-foreground', normal: 'text-foreground', high: 'text-warning', urgent: 'text-destructive font-semibold' };

export default function TicketsTab({ business }: { business: Business }) {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<{ contact_id: string; subject: string; priority: string }>({ contact_id: '', subject: '', priority: 'normal' });
  const [openTicket, setOpenTicket] = useState<TicketRow | null>(null);
  const [messages, setMessages] = useState<Array<{ id: string; body: string; created_at: string }>>([]);
  const [newMsg, setNewMsg] = useState('');
  const [filter, setFilter] = useState<'open' | 'pending' | 'resolved' | 'all'>('open');

  const contactName = (id?: string | null) => { const c = contacts.find((x) => x.id === id); return c ? [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email : '—'; };

  const load = async () => {
    const [t, c] = await Promise.all([ticketsApi.list(business.id), contactsApi.list(business.id)]);
    setTickets(t); setContacts(c);
  };
  useEffect(() => { load(); }, [business.id]);

  const create = async () => {
    if (!form.subject.trim()) return;
    await ticketsApi.create({ business_id: business.id, contact_id: form.contact_id || null, subject: form.subject, priority: form.priority });
    setForm({ contact_id: '', subject: '', priority: 'normal' }); setAddOpen(false); await load();
  };

  const openThread = async (t: TicketRow) => { setOpenTicket(t); setMessages(await ticketMessagesApi.list(t.id)); };
  const sendMsg = async () => {
    if (!openTicket || !newMsg.trim()) return;
    await ticketMessagesApi.add(business.id, openTicket.id, newMsg.trim());
    setNewMsg(''); setMessages(await ticketMessagesApi.list(openTicket.id));
  };
  const setStatus = async (t: TicketRow, status: string) => { await ticketsApi.updateStatus(t.id, status); await load(); if (openTicket?.id === t.id) setOpenTicket({ ...t, status }); };

  const filtered = tickets.filter((t) => filter === 'all' || t.status === filter);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {(['open', 'pending', 'resolved', 'all'] as const).map((s) => (
            <button key={s} onClick={() => setFilter(s)} className={cn('rounded-full px-2.5 py-1 text-xs font-medium capitalize', filter === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{s}</button>
          ))}
        </div>
        <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> New ticket</Button>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <LifeBuoy className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">No {filter !== 'all' ? filter : ''} tickets</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
          {filtered.map((t) => (
            <button key={t.id} onClick={() => openThread(t)} className="flex w-full items-center justify-between px-5 py-3 text-left text-sm hover:bg-muted/40">
              <div>
                <div className="font-medium">{t.subject}</div>
                <div className="text-xs text-muted-foreground">{contactName(t.contact_id)} · <span className={PRIORITY_TONE[t.priority]}>{t.priority}</span></div>
              </div>
              <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium capitalize', STATUS_TONE[t.status])}>{t.status}</span>
            </button>
          ))}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New ticket</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label>Subject</Label><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label>Contact</Label>
                <select className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={form.contact_id} onChange={(e) => setForm({ ...form, contact_id: e.target.value })}>
                  <option value="">— none —</option>
                  {contacts.map((c) => <option key={c.id} value={c.id}>{[c.first_name, c.last_name].filter(Boolean).join(' ') || c.email}</option>)}
                </select>
              </div>
              <div className="space-y-1.5"><Label>Priority</Label>
                <select className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  {['low', 'normal', 'high', 'urgent'].map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button><Button onClick={create} disabled={!form.subject.trim()}>Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openTicket !== null} onOpenChange={(v) => !v && setOpenTicket(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{openTicket?.subject}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex gap-1.5">
              {['open', 'pending', 'resolved'].map((s) => (
                <button key={s} onClick={() => openTicket && setStatus(openTicket, s)} className={cn('rounded-full px-2.5 py-1 text-xs font-medium capitalize', openTicket?.status === s ? STATUS_TONE[s] : 'bg-muted text-muted-foreground')}>{s}</button>
              ))}
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {messages.length === 0 ? <p className="text-sm text-muted-foreground">No messages yet.</p> : messages.map((m) => (
                <div key={m.id} className="rounded-lg border border-border p-2.5 text-sm">
                  <div>{m.body}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">{new Date(m.created_at).toLocaleString()}</div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={newMsg} onChange={(e) => setNewMsg(e.target.value)} placeholder="Add a message…" onKeyDown={(e) => { if (e.key === 'Enter') sendMsg(); }} />
              <Button size="sm" onClick={sendMsg}>Send</Button>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpenTicket(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
