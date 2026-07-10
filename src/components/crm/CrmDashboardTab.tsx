import { useEffect, useMemo, useState } from 'react';
import type { Business, Contact, DealRow } from '@/services/db';
import { contactsApi, dealsApi } from '@/services/db';
import { classifyRfmSegment, RFM_LABELS, computeWeightedPipelineValue, type RfmSegment } from '@/finance/rfm';
import { formatCurrency } from '@/lib/utils';

const SEGMENT_ORDER: RfmSegment[] = ['champion', 'loyal', 'promising', 'at_risk', 'lost', 'none'];

export default function CrmDashboardTab({ business }: { business: Business }) {
  const cur = business.currency ?? 'EGP';
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<DealRow[]>([]);

  useEffect(() => {
    Promise.all([contactsApi.list(business.id), dealsApi.list(business.id)]).then(([c, d]) => { setContacts(c); setDeals(d); });
  }, [business.id]);

  const newPerMonth = useMemo(() => {
    const byMonth = new Map<string, number>();
    for (const c of contacts) {
      if (!c.created_at) continue;
      const key = c.created_at.slice(0, 7);
      byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
    }
    return Array.from(byMonth.entries()).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6);
  }, [contacts]);

  const withOrders = useMemo(() => contacts.filter((c) => (c.orders_count || 0) > 0), [contacts]);
  const repeatRate = withOrders.length > 0 ? (withOrders.filter((c) => (c.orders_count || 0) > 1).length / withOrders.length) * 100 : 0;

  const topCustomers = useMemo(() => [...contacts].sort((a, b) => (Number(b.total_spent) || 0) - (Number(a.total_spent) || 0)).slice(0, 10), [contacts]);

  const segmentCounts = useMemo(() => {
    const counts = new Map<RfmSegment, number>();
    for (const c of contacts) {
      const seg = classifyRfmSegment({ ordersCount: c.orders_count || 0, lastOrderDate: c.last_order_date ?? null });
      counts.set(seg, (counts.get(seg) ?? 0) + 1);
    }
    return counts;
  }, [contacts]);

  const weightedPipeline = useMemo(() => computeWeightedPipelineValue(deals.filter((d) => d.stage !== 'won' && d.stage !== 'lost')), [deals]);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Total contacts</div>
          <div className="text-2xl font-bold tabular-nums">{contacts.length}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Repeat purchase rate</div>
          <div className="text-2xl font-bold tabular-nums">{repeatRate.toFixed(0)}%</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Weighted pipeline value</div>
          <div className="text-2xl font-bold tabular-nums">{formatCurrency(weightedPipeline, cur)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">New contacts (this month)</div>
          <div className="text-2xl font-bold tabular-nums">{newPerMonth[0]?.[1] ?? 0}</div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold mb-3">Segment distribution</h3>
          <div className="space-y-2">
            {SEGMENT_ORDER.map((s) => {
              const count = segmentCounts.get(s) ?? 0;
              const pct = contacts.length > 0 ? (count / contacts.length) * 100 : 0;
              return (
                <div key={s}>
                  <div className="flex justify-between text-xs mb-1"><span>{RFM_LABELS[s]}</span><span className="tabular-nums text-muted-foreground">{count}</span></div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold mb-3">Top 10 customers by revenue</h3>
          <div className="space-y-1.5">
            {topCustomers.length === 0 ? <p className="text-sm text-muted-foreground">No customer data yet.</p> : topCustomers.map((c, i) => (
              <div key={c.id} className="flex items-center justify-between text-sm">
                <span><span className="text-muted-foreground mr-1.5">{i + 1}.</span>{[c.first_name, c.last_name].filter(Boolean).join(' ') || c.email}</span>
                <span className="tabular-nums font-medium">{formatCurrency(Number(c.total_spent) || 0, cur)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-3">New contacts per month</h3>
        <div className="space-y-1.5">
          {newPerMonth.length === 0 ? <p className="text-sm text-muted-foreground">No data yet.</p> : newPerMonth.map(([month, count]) => (
            <div key={month} className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{month}</span><span className="font-medium tabular-nums">{count}</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}
