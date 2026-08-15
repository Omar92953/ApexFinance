// Shared taxonomy of a business workspace's sections and sub-tabs — the
// single source of truth for both the left sidebar navigation and
// BusinessDetailPage's routing/validation, so the two can never drift.
import {
  LayoutDashboard, Wallet, Package, ShoppingCart, Users, UserCog, Settings2, Briefcase,
  Compass, BookOpen, FileBarChart,
  type LucideIcon,
} from 'lucide-react';
import type { Capabilities } from './businessTypes';

export const SECTIONS = [
  { key: 'overview', label: 'Command', icon: LayoutDashboard },
  { key: 'finance', label: 'Finance', icon: Wallet },
  { key: 'projects', label: 'Projects', icon: Briefcase },
  { key: 'inventory', label: 'Inventory', icon: Package },
  { key: 'sales', label: 'Sales', icon: ShoppingCart },
  { key: 'crm', label: 'CRM', icon: Users },
  { key: 'hr', label: 'HR', icon: UserCog },
  { key: 'reports', label: 'Reports', icon: FileBarChart },
  { key: 'operate', label: 'Operate', icon: Compass },
  { key: 'govern', label: 'Govern', icon: BookOpen },
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
    { key: 'budget', label: 'Budget' },
    { key: 'payables', label: 'Payables' },
    { key: 'subscriptions', label: 'Subscriptions' },
  ],
  projects: [
    { key: 'active', label: 'Active Work' },
    { key: 'time', label: 'Time & Billing' },
    { key: 'rates', label: 'Rate Cards' },
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
    { key: 'collections', label: 'Collections' },
    { key: 'returns', label: 'Returns' },
    { key: 'cod', label: 'COD' },
  ],
  crm: [
    { key: 'crm-dashboard', label: 'Dashboard' },
    { key: 'customers', label: 'Customers' },
    { key: 'deals', label: 'Deals' },
    { key: 'pipeline-analytics', label: 'Pipeline Analytics' },
    { key: 'tasks', label: 'Tasks' },
    { key: 'tickets', label: 'Tickets' },
  ],
  hr: [
    { key: 'employees', label: 'Employees' },
    { key: 'payroll', label: 'Payroll' },
    { key: 'leave', label: 'Leave' },
  ],
  reports: [
    { key: 'financial', label: 'Financial' },
    { key: 'operational', label: 'Operational' },
  ],
  operate: [
    { key: 'scorecard', label: 'Scorecard' },
    { key: 'rocks', label: 'Rocks' },
    { key: 'issues', label: 'Issues' },
  ],
  govern: [
    { key: 'handbook', label: 'Handbook' },
    { key: 'org', label: 'Accountability' },
    { key: 'policies', label: 'Policies' },
    { key: 'registers', label: 'Vendors & Systems' },
    { key: 'decisions', label: 'Decisions' },
    { key: 'kpis', label: 'KPI Dictionary' },
    { key: 'compliance', label: 'Compliance' },
  ],
  setup: [
    { key: 'workspace', label: 'Workspace' },
    { key: 'integrations', label: 'Integrations' },
    { key: 'audit-log', label: 'Audit Log' },
  ],
};

export const DEFAULT_SUB_TAB: Record<Exclude<SectionKey, 'overview'>, string> = {
  finance: 'capital',
  projects: 'active',
  inventory: 'products',
  sales: 'orders',
  crm: 'customers',
  hr: 'employees',
  reports: 'financial',
  operate: 'scorecard',
  govern: 'handbook',
  setup: 'workspace',
};

// --- Capability gating -------------------------------------------------------
// Which capability (if any) each sub-tab depends on. Anything unlisted is
// universal and shows for every business type.
const SUB_TAB_REQUIRES: Record<string, keyof Capabilities> = {
  products: 'inventory',
  'unit-economics': 'inventory',
  manufacturing: 'manufacturing',
  bom: 'manufacturing',
  suppliers: 'purchasing',
  'purchase-orders': 'purchasing',
  cod: 'cod',
  active: 'projects',
  time: 'projects',
  rates: 'projects',
  // Physical returns only make sense where physical goods move.
  returns: 'inventory',
};

export function visibleSubTabs(section: Exclude<SectionKey, 'overview'>, caps: Capabilities) {
  return SUB_TABS[section].filter((t) => {
    const need = SUB_TAB_REQUIRES[t.key];
    return !need || caps[need];
  });
}

// A section is shown only when at least one of its sub-tabs survives gating —
// so a service business never sees an empty Inventory shell, and a shop never
// sees Projects. Overview/Command is always present.
export function visibleSections(caps: Capabilities) {
  return SECTIONS.filter((s) => s.key === 'overview' || visibleSubTabs(s.key as Exclude<SectionKey, 'overview'>, caps).length > 0);
}

// The Inventory section carries stock for product businesses but is really just
// purchasing for a service business — name it for what it actually holds.
export function sectionLabel(key: SectionKey, caps: Capabilities): string {
  const base = SECTIONS.find((s) => s.key === key)?.label ?? key;
  if (key === 'inventory' && !caps.inventory && caps.purchasing) return 'Purchasing';
  return base;
}

// Capability-aware resolution: falls back to the first *visible* sub-tab, so a
// deep link into a disabled area lands somewhere real rather than blank.
export function resolveSectionFor(caps: Capabilities, sectionParam?: string, subTabParam?: string): { section: SectionKey; subTab: string | null } {
  const allowed = visibleSections(caps);
  const section = (allowed.some((s) => s.key === sectionParam) ? sectionParam : 'overview') as SectionKey;
  if (section === 'overview') return { section, subTab: null };
  const subTabs = visibleSubTabs(section as Exclude<SectionKey, 'overview'>, caps);
  if (subTabs.length === 0) return { section: 'overview', subTab: null };
  const preferred = DEFAULT_SUB_TAB[section as Exclude<SectionKey, 'overview'>];
  const fallback = subTabs.some((t) => t.key === preferred) ? preferred : subTabs[0].key;
  const subTab = subTabParam && subTabs.some((t) => t.key === subTabParam) ? subTabParam : fallback;
  return { section, subTab };
}

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
