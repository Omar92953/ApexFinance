import { useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, Info, CheckCircle2, ListPlus, BellOff, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Business } from '@/services/db';
import { tasksApi, signalsApi } from '@/services/db';
import { collectSignalsForBusiness } from '@/finance/compute';
import { totalAtStake, type Signal, type SignalSeverity } from '@/finance/signals';
import { Button } from '@/components/ui/button';
import { formatCurrency, cn } from '@/lib/utils';

const SEVERITY_UI: Record<SignalSeverity, { icon: typeof AlertCircle; box: string; tint: string }> = {
  critical: { icon: AlertCircle, box: 'border-destructive/30 bg-destructive/5', tint: 'text-destructive' },
  warning: { icon: AlertTriangle, box: 'border-warning/30 bg-warning/5', tint: 'text-warning' },
  info: { icon: Info, box: 'border-border bg-muted/30', tint: 'text-muted-foreground' },
};

// Where each signal domain sends you when you click through.
const DOMAIN_ROUTE: Record<string, string> = {
  receivables: 'sales/invoices',
  payables: 'finance/payables',
  inventory: 'inventory/products',
  cash: 'finance/profitability',
  costs: 'finance/costs',
  sales: 'crm/deals',
  crm: 'crm/customers',
};

const SNOOZE_DAYS = 7;

export default function SignalFeed({ business }: { business: Business }) {
  const cur = business.currency ?? 'EGP';
  const navigate = useNavigate();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [queued, setQueued] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setSignals(await collectSignalsForBusiness(business)); }
    catch { setSignals([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [business.id]);

  const queueTask = async (s: Signal) => {
    setBusyId(s.id);
    try {
      await tasksApi.createFromSignal(business.id, s);
      setQueued((q) => new Set(q).add(s.id));
    } finally { setBusyId(null); }
  };

  const snooze = async (s: Signal) => {
    setBusyId(s.id);
    try {
      const until = new Date(Date.now() + SNOOZE_DAYS * 86_400_000).toISOString().slice(0, 10);
      await signalsApi.dismiss(business.id, s.id, until, 'Snoozed from Command');
      setSignals((prev) => prev.filter((x) => x.id !== s.id));
    } finally { setBusyId(null); }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking what needs your attention…
      </div>
    );
  }

  if (signals.length === 0) {
    return (
      <div className="rounded-xl border border-success/30 bg-success/5 p-5 flex items-center gap-3">
        <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
        <div>
          <div className="font-medium text-sm">Nothing needs deciding right now</div>
          <p className="text-xs text-muted-foreground">No overdue invoices or bills, stock is healthy, and cash stays positive across the forecast.</p>
        </div>
      </div>
    );
  }

  const visible = showAll ? signals : signals.slice(0, 5);
  const atStake = totalAtStake(signals);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold">Needs deciding</h3>
          <p className="text-xs text-muted-foreground">
            {signals.length} {signals.length === 1 ? 'item' : 'items'}
            {atStake > 0 && <> · <span className="font-medium text-foreground">{formatCurrency(atStake, cur)}</span> at stake</>}
          </p>
        </div>
        {signals.length > 5 && (
          <Button variant="outline" size="sm" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Show top 5' : `Show all ${signals.length}`}
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {visible.map((s) => {
          const ui = SEVERITY_UI[s.severity];
          const Icon = ui.icon;
          const isQueued = queued.has(s.id);
          const route = DOMAIN_ROUTE[s.domain];

          return (
            <div key={s.id} className={cn('rounded-lg border p-3', ui.box)}>
              <div className="flex items-start gap-2.5">
                <Icon className={cn('h-4 w-4 shrink-0 mt-0.5', ui.tint)} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-medium">{s.title}</span>
                    {s.impactEgp > 0 && (
                      <span className="text-xs tabular-nums text-muted-foreground">{formatCurrency(s.impactEgp, cur)}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.why}</p>
                  <p className="text-xs mt-1"><span className="text-muted-foreground">Do this: </span>{s.suggestedAction}</p>

                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <Button
                      size="sm"
                      variant={isQueued ? 'outline' : 'default'}
                      disabled={busyId === s.id || isQueued}
                      onClick={() => queueTask(s)}
                      className="h-7 text-xs"
                    >
                      {isQueued ? <><CheckCircle2 className="h-3 w-3 mr-1" /> Added to tasks</> : <><ListPlus className="h-3 w-3 mr-1" /> Add to tasks</>}
                    </Button>
                    {route && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs"
                        onClick={() => navigate(`/businesses/${business.id}/${route}`)}>
                        Open
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground"
                      disabled={busyId === s.id} onClick={() => snooze(s)}>
                      <BellOff className="h-3 w-3 mr-1" /> Snooze {SNOOZE_DAYS}d
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
