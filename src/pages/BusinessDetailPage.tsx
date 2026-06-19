import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { businessesApi, type Business } from '@/services/db';
import { computeBusinessProfit } from '@/finance/compute';
import type { ProfitCalculation } from '@/finance/profit-engine';
import OverviewTab from '@/components/finance/OverviewTab';
import DataEntryTab from '@/components/finance/DataEntryTab';
import CostsTab from '@/components/finance/CostsTab';
import BalanceTab from '@/components/finance/BalanceTab';
import StatementsTab from '@/components/finance/StatementsTab';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'data', label: 'Data' },
  { key: 'costs', label: 'Costs' },
  { key: 'balance', label: 'Assets & Liabilities' },
  { key: 'statements', label: 'Statements' },
] as const;

function monthRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const end = now.toISOString().slice(0, 10);
  return { start, end };
}

export default function BusinessDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [business, setBusiness] = useState<Business | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('overview');
  const init = useMemo(monthRange, []);
  const [start, setStart] = useState(init.start);
  const [end, setEnd] = useState(init.end);
  const [profit, setProfit] = useState<ProfitCalculation | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!id) return;
    businessesApi.get(id).then(setBusiness).catch(() => navigate('/businesses'));
  }, [id, navigate]);

  useEffect(() => {
    if (!business) return;
    setProfit(null);
    computeBusinessProfit(business, start, end).then(setProfit).catch(() => setProfit(null));
  }, [business, start, end, version]);

  const refresh = () => setVersion((v) => v + 1);

  if (!business) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div>
      <button onClick={() => navigate('/businesses')} className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All businesses
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-lg">
            {business.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{business.name}</h1>
            <p className="text-xs text-muted-foreground capitalize">{business.profit_model.replace(/_/g, ' ')} · {business.currency}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2" />
          <span className="text-muted-foreground">to</span>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2" />
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border mb-5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab profit={profit} business={business} />}
      {tab === 'data' && <DataEntryTab business={business} start={start} end={end} onChanged={refresh} />}
      {tab === 'costs' && <CostsTab business={business} onChanged={refresh} />}
      {tab === 'balance' && <BalanceTab business={business} onChanged={refresh} />}
      {tab === 'statements' && <StatementsTab profit={profit} business={business} start={start} end={end} />}
    </div>
  );
}
