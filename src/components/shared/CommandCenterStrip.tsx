import { useEffect, useState } from 'react';
import { Wallet, Package, ArrowDownCircle, ArrowUpCircle, Truck } from 'lucide-react';
import type { Business } from '@/services/db';
import { capitalApi, productsApi, supplierBillsApi, customerInvoicesApi } from '@/services/db';
import { formatCurrency } from '@/lib/utils';
import KpiCard from '@/components/shared/KpiCard';

export default function CommandCenterStrip({ business }: { business: Business }) {
  const cur = business.currency ?? 'EGP';
  const [cash, setCash] = useState(0);
  const [inventoryValue, setInventoryValue] = useState(0);
  const [apOutstanding, setApOutstanding] = useState(0);
  const [arOutstanding, setArOutstanding] = useState(0);
  const [codOutstanding, setCodOutstanding] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [accounts, variants, bills, invoices] = await Promise.all([
        capitalApi.listAccounts(business.id),
        productsApi.listVariants(business.id),
        supplierBillsApi.list(business.id),
        customerInvoicesApi.list(business.id),
      ]);
      if (cancelled) return;
      setCash(accounts.reduce((s, a) => s + (Number(a.current_balance) || 0), 0));
      setInventoryValue(variants.reduce((s, v) => s + (Number(v.inventory_qty) || 0) * (Number(v.cost_per_item) || 0), 0));
      setApOutstanding(bills.filter((b) => b.status !== 'paid').reduce((s, b) => s + ((Number(b.amount) || 0) - (Number(b.amount_paid) || 0)), 0));
      setArOutstanding(invoices.filter((i) => i.status !== 'paid' && i.payment_method !== 'cod').reduce((s, i) => s + ((Number(i.amount) || 0) - (Number(i.amount_paid) || 0)), 0));
      setCodOutstanding(invoices.filter((i) => i.status !== 'paid' && i.payment_method === 'cod').reduce((s, i) => s + ((Number(i.amount) || 0) - (Number(i.amount_paid) || 0)), 0));
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [business.id]);

  if (!loaded) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <KpiCard label="Cash Position" value={formatCurrency(cash, cur)} sub="Across all capital accounts" icon={<Wallet className="h-4 w-4" />} delay={0} />
      <KpiCard label="Inventory Value" value={formatCurrency(inventoryValue, cur)} sub="At weighted average cost" icon={<Package className="h-4 w-4" />} delay={40} />
      <KpiCard label="Outstanding Payables" value={formatCurrency(apOutstanding, cur)} sub="Unpaid supplier bills" icon={<ArrowUpCircle className="h-4 w-4" />} delay={80} />
      <KpiCard label="Outstanding Receivables" value={formatCurrency(arOutstanding, cur)} sub="Unpaid customer invoices" icon={<ArrowDownCircle className="h-4 w-4" />} delay={120} />
      <KpiCard label="COD Receivable" value={formatCurrency(codOutstanding, cur)} sub="Awaiting courier remittance" icon={<Truck className="h-4 w-4" />} delay={160} />
    </div>
  );
}
