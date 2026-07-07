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
import IntegrationsTab from '@/components/finance/IntegrationsTab';
import CustomersTab from '@/components/crm/CustomersTab';
import DealsTab from '@/components/crm/DealsTab';
import TasksTab from '@/components/crm/TasksTab';
import ProductsTab from '@/components/inventory/ProductsTab';
import ManufacturingTab from '@/components/inventory/ManufacturingTab';
import CapitalTab from '@/components/finance/CapitalTab';

const TABS = [
  { key: 'overview', label: 'Overview', group: 'Finance' },
  { key: 'capital', label: 'Capital', group: 'Finance' },
  { key: 'data', label: 'Data', group: 'Finance' },
  { key: 'costs', label: 'Costs', group: 'Finance' },
  { key: 'balance', label: 'Assets & Liabilities', group: 'Finance' },
  { key: 'statements', label: 'Statements', group: 'Finance' },
  { key: 'products', label: 'Products', group: 'Inventory' },
  { key: 'manufacturing', label: 'Manufacturing', group: 'Inventory' },
  { key: 'customers', label: 'Customers', group: 'CRM' },
  { key: 'deals', label: 'Deals', group: 'CRM' },
  { key: 'tasks', label: 'Tasks', group: 'CRM' },
  { key: 'integrations', label: 'Integrations', group: 'Setup' },
] as const;

const GROUPS = ['Finance', 'Inventory', 'CRM', 'Setup'] as const;

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

      <div className="flex flex-wrap items-end gap-x-5 gap-y-2 border-b border-border mb-5">
        {GROUPS.map((g) => (
          <div key={g} className="flex flex-col">
            <span className="px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">{g}</span>
            <div className="flex">
              {TABS.filter((t) => t.group === g).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    tab === t.key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab profit={profit} business={business} />}
      {tab === 'capital' && <CapitalTab business={business} profit={profit} />}
      {tab === 'data' && <DataEntryTab business={business} start={start} end={end} onChanged={refresh} />}
      {tab === 'costs' && <CostsTab business={business} onChanged={refresh} />}
      {tab === 'balance' && <BalanceTab business={business} onChanged={refresh} />}
      {tab === 'statements' && <StatementsTab profit={profit} business={business} start={start} end={end} />}
      {tab === 'products' && <ProductsTab business={business} />}
      {tab === 'manufacturing' && <ManufacturingTab business={business} />}
      {tab === 'customers' && <CustomersTab business={business} />}
      {tab === 'deals' && <DealsTab business={business} />}
      {tab === 'tasks' && <TasksTab business={business} />}
      {tab === 'integrations' && <IntegrationsTab business={business} onChanged={refresh} />}
    </div>
  );
}
