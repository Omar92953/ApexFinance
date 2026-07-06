import { useEffect, useState } from 'react';
import { Plus, Trash2, Check } from 'lucide-react';
import type { Business, TaskRow, Contact } from '@/services/db';
import { tasksApi, contactsApi } from '@/services/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export default function TasksTab({ business }: { business: Business }) {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [contactId, setContactId] = useState('');

  const load = async () => setTasks(await tasksApi.list(business.id));
  useEffect(() => { load(); contactsApi.list(business.id).then(setContacts); }, [business.id]);

  const contactName = (id?: string | null) => {
    const c = contacts.find((x) => x.id === id);
    return c ? ([c.first_name, c.last_name].filter(Boolean).join(' ') || c.email) : null;
  };

  const add = async () => {
    if (!title.trim()) return;
    await tasksApi.create({ business_id: business.id, title: title.trim(), due_date: due || null, contact_id: contactId || null, is_done: false });
    setTitle(''); setDue(''); setContactId('');
    load();
  };
  const toggle = async (t: TaskRow) => { await tasksApi.update(t.id, { is_done: !t.is_done }); load(); };
  const del = async (id: string) => { await tasksApi.remove(id); load(); };

  const open = tasks.filter((t) => !t.is_done);
  const done = tasks.filter((t) => t.is_done);
  const overdue = (t: TaskRow) => t.due_date && !t.is_done && new Date(t.due_date) < new Date(new Date().toDateString());

  const Row = (t: TaskRow) => (
    <div key={t.id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
      <button onClick={() => toggle(t)} className={cn('h-5 w-5 rounded border flex items-center justify-center shrink-0', t.is_done ? 'bg-success border-success text-success-foreground' : 'border-input')}>
        {t.is_done && <Check className="h-3.5 w-3.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className={cn('text-sm', t.is_done && 'line-through text-muted-foreground')}>{t.title}</div>
        <div className="text-xs text-muted-foreground">
          {t.due_date && <span className={cn(overdue(t) && 'text-destructive font-medium')}>Due {t.due_date}</span>}
          {contactName(t.contact_id) && <span>{t.due_date ? ' · ' : ''}{contactName(t.contact_id)}</span>}
        </div>
      </div>
      <button onClick={() => del(t.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap gap-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New task…" className="flex-1 min-w-[200px]" onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="w-40" />
          <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={contactId} onChange={(e) => setContactId(e.target.value)}>
            <option value="">No contact</option>
            {contacts.map((c) => <option key={c.id} value={c.id}>{[c.first_name, c.last_name].filter(Boolean).join(' ') || c.email}</option>)}
          </select>
          <Button onClick={add} disabled={!title.trim()}><Plus className="h-4 w-4 mr-1.5" /> Add</Button>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Open ({open.length})</h3>
        {open.length === 0 ? <p className="text-sm text-muted-foreground">Nothing to do 🎉</p> : open.map(Row)}
      </div>

      {done.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Done ({done.length})</h3>
          {done.map(Row)}
        </div>
      )}
    </div>
  );
}
