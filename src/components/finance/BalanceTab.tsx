import { useEffect, useState } from 'react';
import type { Business } from '@/services/db';
import { financialInputsApi } from '@/services/db';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/utils';

// Field names must match exactly what src/finance/statements.ts reads.
interface Field { name: string; category: string; kind?: 'money' | 'percent' }
interface Section { title: string; hint?: string; fields: Field[] }

const SECTIONS: Section[] = [
  {
    title: 'Current assets',
    fields: [
      { name: 'Cash Balance', category: 'current_asset', kind: 'money' },
      { name: 'A/R Payouts', category: 'current_asset', kind: 'money' },
      { name: 'Inventory Value', category: 'current_asset', kind: 'money' },
      { name: 'Prepaid Credits', category: 'current_asset', kind: 'money' },
    ],
  },
  {
    title: 'Fixed assets',
    fields: [
      { name: 'Equipment', category: 'fixed_asset', kind: 'money' },
      { name: 'Accum. Depreciation', category: 'fixed_asset', kind: 'money' },
    ],
  },
  {
    title: 'Current liabilities',
    fields: [
      { name: 'Supplier Payable', category: 'current_liability', kind: 'money' },
      { name: 'Credit Card Balance', category: 'current_liability', kind: 'money' },
      { name: 'Tax Payable', category: 'current_liability', kind: 'money' },
      { name: 'Accrued Expenses', category: 'current_liability', kind: 'money' },
    ],
  },
  {
    title: 'Long-term liabilities',
    fields: [{ name: 'Business Loans', category: 'long_term_liability', kind: 'money' }],
  },
  {
    title: 'Equity & dividends',
    hint: 'Owner investment is capital you put in; withdrawals are dividends/money you take out.',
    fields: [
      { name: 'Owner Investment', category: 'equity', kind: 'money' },
      { name: 'Withdrawals', category: 'distribution', kind: 'money' },
    ],
  },
  {
    title: 'Operating expenses (monthly)',
    fields: [
      { name: 'Salaries & Wages', category: 'financing', kind: 'money' },
      { name: 'Software & Tools', category: 'financing', kind: 'money' },
      { name: 'Other Operating Expenses', category: 'financing', kind: 'money' },
      { name: 'Depreciation/mo', category: 'depreciation', kind: 'money' },
    ],
  },
  {
    title: 'Tax & interest',
    fields: [
      { name: 'Tax Rate', category: 'tax', kind: 'percent' },
      { name: 'Interest Rate', category: 'tax', kind: 'percent' },
    ],
  },
];

export default function BalanceTab({ business, onChanged }: { business: Business; onChanged: () => void }) {
  const cur = business.currency ?? 'USD';
  const [values, setValues] = useState<Record<string, number>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const rows = await financialInputsApi.list(business.id);
      const map: Record<string, number> = {};
      for (const r of rows) map[r.name] = Number(r.value);
      setValues(map);
    })();
  }, [business.id]);

  const commit = async (field: Field) => {
    const raw = drafts[field.name];
    if (raw === undefined) return;
    const value = parseFloat(raw) || 0;
    setSavingKey(field.name);
    try {
      await financialInputsApi.save(business.id, { category: field.category, name: field.name, value });
      setValues((v) => ({ ...v, [field.name]: value }));
      setDrafts((d) => { const n = { ...d }; delete n[field.name]; return n; });
      onChanged();
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {SECTIONS.map((s) => (
        <div key={s.title} className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold">{s.title}</h3>
          {s.hint && <p className="text-xs text-muted-foreground mb-3">{s.hint}</p>}
          <div className="mt-3 space-y-2.5">
            {s.fields.map((f) => {
              const draft = drafts[f.name];
              const display = draft !== undefined ? draft : (values[f.name] ?? '').toString();
              return (
                <div key={f.name} className="flex items-center justify-between gap-3">
                  <label className="text-sm text-muted-foreground">{f.name}{f.kind === 'percent' ? ' (%)' : ''}</label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      step="any"
                      className="h-8 w-32 text-right"
                      value={display}
                      onChange={(e) => setDrafts((d) => ({ ...d, [f.name]: e.target.value }))}
                      onBlur={() => commit(f)}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    />
                    {savingKey === f.name && <span className="text-[10px] text-muted-foreground">…</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="lg:col-span-2 rounded-xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
        These values feed the Balance Sheet, Cash Flow, and Income Statement on the Statements tab. Amounts shown in {formatCurrency(0, cur).replace(/[\d.,\s]/g, '') || cur}.
      </div>
    </div>
  );
}
