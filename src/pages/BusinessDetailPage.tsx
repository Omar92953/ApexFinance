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
import { cn } from '@/lib/utils';

const SECTIONS = [
  { key: 'overview', label: 'Overview' },
  { key: 'finance', label: 'Finance' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'crm', label: 'CRM' },
  { key: 'setup', label: 'Setup' },
] as const;

type SectionKey = (typeof SECTIONS)[number]['key'];

const SUB_TABS: Record<Exclude<SectionKey, 'overview'>, { key: string; label: string }[]> = {
  finance: [
    { key: 'capital', label: 'Capital' },
    { key: 'data', label: 'Data' },
    { key: 'costs', label: 'Costs' },
    { key: 'balance', label: 'Assets & Liabilities' },
    { key: 'statements', label: 'Statements' },
  ],
  inventory: [
    { key: 'products', label: 'Products' },
    { key: 'manufacturing', label: 'Manufacturing' },
  ],
  crm: [
    { key: 'customers', label: 'Customers' },
    { key: 'deals', label: 'Deals' },
    { key: 'tasks', label: 'Tasks' },
  ],
  setup: [
    { key: 'integrations', label: 'Integrations' },
  ],
};

const DEFAULT_SUB_TAB: Record<Exclude<SectionKey, 'overview'>, string> = {
  finance: 'capital',
  inventory: 'products',
  crm: 'customers',
  setup: 'integrations',
};

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
  const [section, setSection] = useState<SectionKey>('overview');
  const [subTabBySection, setSubTabBySection] = useState<Record<string, string>>(DEFAULT_SUB_TAB);
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

  const activeSubTab = section === 'overview' ? null : subTabBySection[section];
  const setActiveSubTab = (key: string) => setSubTabBySection((s) => ({ ...s, [section]: key }));

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
          <h1 className="text-2xl font-bold tracking-tight">{business.name}</h1>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2" />
          <span className="text-muted-foreground">to</span>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2" />
        </div>
      </div>

      {/* Top-level sections */}
      <div className="flex flex-wrap gap-1 mb-1">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-semibold transition-colors',
              section === s.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Sub-tabs for the active section (Overview has none) */}
      {section !== 'overview' && (
        <div className="flex flex-wrap gap-1 border-b border-border mb-5 mt-2">
          {SUB_TABS[section].map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveSubTab(t.key)}
              className={cn(
                'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                activeSubTab === t.key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      {section === 'overview' && <div className="mb-5" />}

      {section === 'overview' && <OverviewTab profit={profit} business={business} />}

      {section === 'finance' && activeSubTab === 'capital' && <CapitalTab business={business} profit={profit} />}
      {section === 'finance' && activeSubTab === 'data' && <DataEntryTab business={business} start={start} end={end} onChanged={refresh} />}
      {section === 'finance' && activeSubTab === 'costs' && <CostsTab business={business} onChanged={refresh} />}
      {section === 'finance' && activeSubTab === 'balance' && <BalanceTab business={business} onChanged={refresh} />}
      {section === 'finance' && activeSubTab === 'statements' && <StatementsTab profit={profit} business={business} start={start} end={end} />}

      {section === 'inventory' && activeSubTab === 'products' && <ProductsTab business={business} />}
      {section === 'inventory' && activeSubTab === 'manufacturing' && <ManufacturingTab business={business} />}

      {section === 'crm' && activeSubTab === 'customers' && <CustomersTab business={business} />}
      {section === 'crm' && activeSubTab === 'deals' && <DealsTab business={business} />}
      {section === 'crm' && activeSubTab === 'tasks' && <TasksTab business={business} />}

      {section === 'setup' && activeSubTab === 'integrations' && <IntegrationsTab business={business} onChanged={refresh} />}
    </div>
  );
}
