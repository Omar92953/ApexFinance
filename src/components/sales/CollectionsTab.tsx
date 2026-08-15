import { useEffect, useMemo, useState } from 'react';
import { Send, MessageCircle, CalendarClock, AlertOctagon, CheckCircle2 } from 'lucide-react';
import type { Business, CustomerInvoice, Contact, DunningEvent } from '@/services/db';
import { customerInvoicesApi, contactsApi, dunningApi } from '@/services/db';
import {
  dueDunningActions, renderTemplate, agingBuckets, overdueRatio, computeDso, outstandingOf,
  type DunningAction,
} from '@/finance/dunning';
import { computeBusinessProfit } from '@/finance/compute';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatCurrency, cn } from '@/lib/utils';

const TONE_STYLE: Record<string, string> = {
  reminder: 'border-border bg-muted/30',
  firm: 'border-warning/30 bg-warning/5',
  escalation: 'border-destructive/30 bg-destructive/5',
  final: 'border-destructive/50 bg-destructive/10',
};

const waLink = (phone: string, text: string) =>
  `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;

export default function CollectionsTab({ business, start, end }: { business: Business; start: string; end: string }) {
  const cur = business.currency ?? 'EGP';
  const today = new Date().toISOString().slice(0, 10);
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [events, setEvents] = useState<DunningEvent[]>([]);
  const [dso, setDso] = useState(0);
  const [promiseFor, setPromiseFor] = useState<DunningAction | null>(null);
  const [promiseDate, setPromiseDate] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [inv, con, ev, calc] = await Promise.all([
        customerInvoicesApi.list(business.id),
        contactsApi.list(business.id).catch(() => []),
        dunningApi.list(business.id).catch(() => []),
        computeBusinessProfit(business, start, end).catch(() => null),
      ]);
      setInvoices(inv); setContacts(con); setEvents(ev);

      const outstanding = inv.filter((i) => i.status !== 'paid' && i.payment_method !== 'cod')
        .reduce((s, i) => s + outstandingOf(i), 0);
      const days = Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000));
      setDso(computeDso(outstanding, calc?.netSales ?? 0, days));
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [business.id, start, end]);

  const sentSteps = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const e of events) map[e.invoice_id] = [...(map[e.invoice_id] ?? []), e.step_key];
    return map;
  }, [events]);

  const actions = useMemo(() => dueDunningActions(invoices, sentSteps, today), [invoices, sentSteps, today]);
  const buckets = useMemo(() => agingBuckets(invoices, today), [invoices, today]);
  const overdue = useMemo(() => overdueRatio(buckets), [buckets]);

  const invoiceById = useMemo(() => new Map(invoices.map((i) => [i.id, i])), [invoices]);
  const contactFor = (invoiceId: string) => {
    const inv = invoiceById.get(invoiceId);
    return contacts.find((c) => c.id === inv?.contact_id) ?? null;
  };

  const messageFor = (a: DunningAction) => {
    const inv = invoiceById.get(a.invoiceId);
    const contact = contactFor(a.invoiceId);
    return renderTemplate(a.step.template, {
      name: contact ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') : null,
      invoice: inv?.invoice_number ?? inv?.id.slice(0, 8),
      amount: formatCurrency(a.outstanding, cur),
      due: inv?.due_date,
    });
  };

  const markSent = async (a: DunningAction, channel: string) => {
    await dunningApi.logSent(business.id, a.invoiceId, a.step.key, channel, messageFor(a));
    await load();
  };

  const savePromise = async () => {
    if (!promiseFor) return;
    await dunningApi.setPromiseToPay(promiseFor.invoiceId, promiseDate || null);
    setPromiseFor(null); setPromiseDate('');
    await load();
  };

  const toggleDispute = async (invoiceId: string, current: boolean) => {
    const reason = current ? null : prompt('What is being disputed?');
    if (!current && reason === null) return;
    await dunningApi.setDispute(invoiceId, !current, reason);
    await load();
  };

  if (loading) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Days sales outstanding</div>
          <div className="text-2xl font-bold tabular-nums">{dso.toFixed(0)} days</div>
          <p className="text-xs text-muted-foreground">How long your money sits with customers</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Overdue share</div>
          <div className={cn('text-2xl font-bold tabular-nums', overdue > 30 ? 'text-destructive' : overdue > 10 ? 'text-warning' : '')}>
            {overdue.toFixed(0)}%
          </div>
          <p className="text-xs text-muted-foreground">of receivables past their due date</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Needs chasing today</div>
          <div className="text-2xl font-bold tabular-nums">{actions.length}</div>
          <p className="text-xs text-muted-foreground">
            {formatCurrency(actions.reduce((s, a) => s + a.outstanding, 0), cur)} at stake
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-3">Ageing</h3>
        <div className="grid gap-2 sm:grid-cols-5">
          {buckets.map((b) => (
            <div key={b.key} className="rounded-lg border border-border p-3 text-center">
              <div className="text-xs text-muted-foreground">{b.label}</div>
              <div className={cn('text-sm font-semibold tabular-nums', b.key === 'b3' || b.key === 'b4' ? 'text-destructive' : '')}>
                {formatCurrency(b.total, cur, true)}
              </div>
              <div className="text-[10px] text-muted-foreground">{b.count} invoice{b.count === 1 ? '' : 's'}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2">Chase list</h3>
        {actions.length === 0 ? (
          <div className="rounded-xl border border-success/30 bg-success/5 p-5 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
            <div>
              <div className="font-medium text-sm">Nobody needs chasing today</div>
              <p className="text-xs text-muted-foreground">Every overdue invoice has had its current reminder sent, or is on a promise to pay.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {actions.map((a) => {
              const inv = invoiceById.get(a.invoiceId);
              const contact = contactFor(a.invoiceId);
              const message = messageFor(a);
              return (
                <div key={a.invoiceId} className={cn('rounded-lg border p-3', TONE_STYLE[a.step.tone])}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">
                        {inv?.invoice_number || `Invoice ${a.invoiceId.slice(0, 8)}`} · {formatCurrency(a.outstanding, cur)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {contact ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') : 'No contact linked'}
                        {' · '}{a.daysOverdue > 0 ? `${a.daysOverdue} days overdue` : 'due shortly'}
                        {' · '}<span className="font-medium">{a.step.label}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {contact?.phone && (
                        <a href={waLink(contact.phone, message)} target="_blank" rel="noreferrer"
                          onClick={() => markSent(a, 'whatsapp')}>
                          <Button size="sm" className="h-7 text-xs"><MessageCircle className="h-3 w-3 mr-1" /> WhatsApp</Button>
                        </a>
                      )}
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => markSent(a, 'other')}>
                        <Send className="h-3 w-3 mr-1" /> Mark sent
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs"
                        onClick={() => { setPromiseFor(a); setPromiseDate(''); }}>
                        <CalendarClock className="h-3 w-3 mr-1" /> Promised
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground"
                        onClick={() => toggleDispute(a.invoiceId, false)}>
                        <AlertOctagon className="h-3 w-3 mr-1" /> Dispute
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2 rounded bg-background/60 border border-border p-2 text-xs text-muted-foreground">{message}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={promiseFor !== null} onOpenChange={(v) => !v && setPromiseFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Promise to pay</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>When did they commit to pay?</Label>
              <Input type="date" value={promiseDate} onChange={(e) => setPromiseDate(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">Chasing pauses until this date — nagging someone who already committed costs you goodwill.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPromiseFor(null)}>Cancel</Button>
            <Button onClick={savePromise} disabled={!promiseDate}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
