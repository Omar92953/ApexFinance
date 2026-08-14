import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { businessesApi, type Business } from '@/services/db';
import { computeBusinessProfit } from '@/finance/compute';
import type { ProfitCalculation } from '@/finance/profit-engine';
import { resolveSectionFor } from '@/config/businessSections';
import { useBusinessStore } from '@/stores/businessStore';
import { useCapabilities } from '@/hooks/useCapabilities';
import ProjectsTab from '@/components/projects/ProjectsTab';
import RateCardsTab from '@/components/projects/RateCardsTab';
import TimeBillingTab from '@/components/projects/TimeBillingTab';
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
import UnitEconomicsTab from '@/components/inventory/UnitEconomicsTab';
import SuppliersTab from '@/components/inventory/SuppliersTab';
import PurchaseOrdersTab from '@/components/inventory/PurchaseOrdersTab';
import BomTab from '@/components/inventory/BomTab';
import PayablesTab from '@/components/finance/PayablesTab';
import CapitalTab from '@/components/finance/CapitalTab';
import GeneralLedgerTab from '@/components/finance/GeneralLedgerTab';
import GoalsTab from '@/components/finance/GoalsTab';
import ProfitabilityTab from '@/components/finance/ProfitabilityTab';
import SalesOrdersTab from '@/components/sales/SalesOrdersTab';
import CustomerInvoicesTab from '@/components/sales/CustomerInvoicesTab';
import ReturnsTab from '@/components/sales/ReturnsTab';
import CodReconciliationTab from '@/components/sales/CodReconciliationTab';
import TicketsTab from '@/components/crm/TicketsTab';
import CrmDashboardTab from '@/components/crm/CrmDashboardTab';
import AuditLogTab from '@/components/finance/AuditLogTab';
import WorkspaceSetupTab from '@/components/finance/WorkspaceSetupTab';
import EmployeesTab from '@/components/hr/EmployeesTab';
import PayrollTab from '@/components/hr/PayrollTab';
import LeaveTab from '@/components/hr/LeaveTab';

function monthRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const end = now.toISOString().slice(0, 10);
  return { start, end };
}

export default function BusinessDetailPage() {
  const { id, section: sectionParam, subTab: subTabParam } = useParams<{ id: string; section: string; subTab?: string }>();
  const navigate = useNavigate();
  const setLastActiveId = useBusinessStore((s) => s.setLastActiveId);
  const [business, setBusiness] = useState<Business | null>(null);
  const init = useMemo(monthRange, []);
  const [start, setStart] = useState(init.start);
  const [end, setEnd] = useState(init.end);
  const [profit, setProfit] = useState<ProfitCalculation | null>(null);
  const [version, setVersion] = useState(0);

  const caps = useCapabilities(business);
  const { section, subTab: activeSubTab } = resolveSectionFor(caps, sectionParam, subTabParam);

  useEffect(() => {
    if (!id) return;
    businessesApi.get(id).then(setBusiness).catch(() => navigate('/businesses'));
    setLastActiveId(id);
  }, [id, navigate, setLastActiveId]);

  // Keep the URL in sync with the resolved (possibly corrected) section/subtab —
  // e.g. an invalid or missing param redirects to a valid one.
  // Wait for the business to load before correcting the URL — capabilities
  // depend on its type, and redirecting on the default preset would bounce a
  // service business out of a section it's actually allowed to see.
  useEffect(() => {
    if (!id || !business) return;
    if (sectionParam !== section) { navigate(`/businesses/${id}/${section}`, { replace: true }); return; }
    if (section !== 'overview' && subTabParam !== activeSubTab) {
      navigate(`/businesses/${id}/${section}/${activeSubTab}`, { replace: true });
    }
  }, [id, business, section, sectionParam, activeSubTab, subTabParam, navigate]);

  useEffect(() => {
    if (!business) return;
    setProfit(null);
    computeBusinessProfit(business, start, end).then(setProfit).catch(() => setProfit(null));
  }, [business, start, end, version]);

  const refresh = () => setVersion((v) => v + 1);

  if (!business) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div>
      <div className="flex items-center justify-end gap-2 text-sm mb-5">
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2" />
        <span className="text-muted-foreground">to</span>
        <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2" />
      </div>

      {section === 'overview' && <OverviewTab profit={profit} business={business} />}

      {section === 'finance' && activeSubTab === 'capital' && <CapitalTab business={business} profit={profit} />}
      {section === 'finance' && activeSubTab === 'data' && <DataEntryTab business={business} start={start} end={end} onChanged={refresh} />}
      {section === 'finance' && activeSubTab === 'costs' && <CostsTab business={business} start={start} end={end} onChanged={refresh} />}
      {section === 'finance' && activeSubTab === 'balance' && <BalanceTab business={business} onChanged={refresh} />}
      {section === 'finance' && activeSubTab === 'statements' && <StatementsTab profit={profit} business={business} start={start} end={end} />}
      {section === 'finance' && activeSubTab === 'ledger' && <GeneralLedgerTab business={business} start={start} end={end} />}
      {section === 'finance' && activeSubTab === 'goals' && <GoalsTab business={business} />}
      {section === 'finance' && activeSubTab === 'profitability' && <ProfitabilityTab business={business} start={start} end={end} />}
      {section === 'finance' && activeSubTab === 'payables' && <PayablesTab business={business} />}

      {section === 'projects' && activeSubTab === 'active' && <ProjectsTab business={business} />}
      {section === 'projects' && activeSubTab === 'time' && <TimeBillingTab business={business} />}
      {section === 'projects' && activeSubTab === 'rates' && <RateCardsTab business={business} />}

      {section === 'inventory' && activeSubTab === 'products' && <ProductsTab business={business} />}
      {section === 'inventory' && activeSubTab === 'unit-economics' && <UnitEconomicsTab business={business} start={start} end={end} />}
      {section === 'inventory' && activeSubTab === 'manufacturing' && <ManufacturingTab business={business} />}
      {section === 'inventory' && activeSubTab === 'suppliers' && <SuppliersTab business={business} />}
      {section === 'inventory' && activeSubTab === 'purchase-orders' && <PurchaseOrdersTab business={business} />}
      {section === 'inventory' && activeSubTab === 'bom' && <BomTab business={business} />}

      {section === 'sales' && activeSubTab === 'orders' && <SalesOrdersTab business={business} />}
      {section === 'sales' && activeSubTab === 'invoices' && <CustomerInvoicesTab business={business} />}
      {section === 'sales' && activeSubTab === 'returns' && <ReturnsTab business={business} />}
      {section === 'sales' && activeSubTab === 'cod' && <CodReconciliationTab business={business} />}

      {section === 'crm' && activeSubTab === 'crm-dashboard' && <CrmDashboardTab business={business} />}
      {section === 'crm' && activeSubTab === 'customers' && <CustomersTab business={business} />}
      {section === 'crm' && activeSubTab === 'deals' && <DealsTab business={business} />}
      {section === 'crm' && activeSubTab === 'tasks' && <TasksTab business={business} />}
      {section === 'crm' && activeSubTab === 'tickets' && <TicketsTab business={business} />}

      {section === 'hr' && activeSubTab === 'employees' && <EmployeesTab business={business} />}
      {section === 'hr' && activeSubTab === 'payroll' && <PayrollTab business={business} />}
      {section === 'hr' && activeSubTab === 'leave' && <LeaveTab business={business} />}

      {section === 'setup' && activeSubTab === 'workspace' && <WorkspaceSetupTab business={business} />}
      {section === 'setup' && activeSubTab === 'integrations' && <IntegrationsTab business={business} onChanged={refresh} />}
      {section === 'setup' && activeSubTab === 'audit-log' && <AuditLogTab business={business} />}
    </div>
  );
}
