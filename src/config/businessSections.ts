// Shared taxonomy of a business workspace's sections and sub-tabs — the
// single source of truth for both the left sidebar navigation and
// BusinessDetailPage's routing/validation, so the two can never drift.
import {
  LayoutDashboard, Wallet, Package, ShoppingCart, Users, UserCog, Settings2,
  type LucideIcon,
} from 'lucide-react';

export const SECTIONS = [
  { key: 'overview', label: 'Command', icon: LayoutDashboard },
  { key: 'finance', label: 'Finance', icon: Wallet },
  { key: 'inventory', label: 'Inventory', icon: Package },
  { key: 'sales', label: 'Sales', icon: ShoppingCart },
  { key: 'crm', label: 'CRM', icon: Users },
  { key: 'hr', label: 'HR', icon: UserCog },
  { key: 'setup', label: 'Setup', icon: Settings2 },
] as const satisfies ReadonlyArray<{ key: string; label: string; icon: LucideIcon }>;

export type SectionKey = (typeof SECTIONS)[number]['key'];

export const SUB_TABS: Record<Exclude<SectionKey, 'overview'>, { key: string; label: string }[]> = {
  finance: [
    { key: 'capital', label: 'Capital' },
    { key: 'data', label: 'Data' },
    { key: 'costs', label: 'Costs' },
    { key: 'balance', label: 'Assets & Liabilities' },
    { key: 'statements', label: 'Statements' },
    { key: 'ledger', label: 'General Ledger' },
    { key: 'goals', label: 'Goals' },
    { key: 'profitability', label: 'Profitability' },
    { key: 'payables', label: 'Payables' },
  ],
  inventory: [
    { key: 'products', label: 'Products' },
    { key: 'unit-economics', label: 'Unit Economics' },
    { key: 'manufacturing', label: 'Manufacturing' },
    { key: 'suppliers', label: 'Suppliers' },
    { key: 'purchase-orders', label: 'Purchase Orders' },
    { key: 'bom', label: 'Bill of Materials' },
  ],
  sales: [
    { key: 'orders', label: 'Orders' },
    { key: 'invoices', label: 'Invoices' },
    { key: 'returns', label: 'Returns' },
    { key: 'cod', label: 'COD' },
  ],
  crm: [
    { key: 'crm-dashboard', label: 'Dashboard' },
    { key: 'customers', label: 'Customers' },
    { key: 'deals', label: 'Deals' },
    { key: 'tasks', label: 'Tasks' },
    { key: 'tickets', label: 'Tickets' },
  ],
  hr: [
    { key: 'employees', label: 'Employees' },
    { key: 'payroll', label: 'Payroll' },
    { key: 'leave', label: 'Leave' },
  ],
  setup: [
    { key: 'integrations', label: 'Integrations' },
    { key: 'audit-log', label: 'Audit Log' },
  ],
};

export const DEFAULT_SUB_TAB: Record<Exclude<SectionKey, 'overview'>, string> = {
  finance: 'capital',
  inventory: 'products',
  sales: 'orders',
  crm: 'customers',
  hr: 'employees',
  setup: 'integrations',
};

// Resolves a (possibly missing/invalid) section+subTab route param pair to a
// guaranteed-valid one — pure, so it's easy to unit test independent of the
// routing/JSX that calls it.
export function resolveSection(sectionParam?: string, subTabParam?: string): { section: SectionKey; subTab: string | null } {
  const section = (SECTIONS.some((s) => s.key === sectionParam) ? sectionParam : 'overview') as SectionKey;
  if (section === 'overview') return { section, subTab: null };
  const subTabs = SUB_TABS[section];
  const subTab = subTabParam && subTabs.some((t) => t.key === subTabParam) ? subTabParam : DEFAULT_SUB_TAB[section];
  return { section, subTab };
}
