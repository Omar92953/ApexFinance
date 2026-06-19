import { useEffect, useMemo, useState } from 'react';
import type { ProfitCalculation } from '@/finance/profit-engine';
import type { Business } from '@/services/db';
import { financialInputsApi, retainedApi } from '@/services/db';
import {
  generateIncomeStatement, generateBalanceSheet, generateCashFlow,
  generateBreakEven, generateFinancialRatios, type InputsMap, type DateRange,
} from '@/finance/statements';
import { formatCurrency } from '@/lib/utils';

const TYPES = [
  { value: 'income_statement', label: 'Income Statement' },
  { value: 'balance_sheet', label: 'Balance Sheet' },
  { value: 'cash_flow', label: 'Cash Flow' },
  { value: 'break_even', label: 'Break-Even' },
  { value: 'financial_ratios', label: 'Ratios' },
];

export default function StatementsTab({ profit, business, start, end }: { profit: ProfitCalculation | null; business: Business; start: string; end: string }) {
  const cur = business.currency ?? 'USD';
  const [type, setType] = useState('income_statement');
  const [inputs, setInputs] = useState<InputsMap>({});
  const [opening, setOpening] = useState(0);

  useEffect(() => {
    (async () => {
      const rows = await financialInputsApi.list(business.id);
      const map: InputsMap = {};
      for (const r of rows) map[r.name] = Number(r.value);
      setInputs(map);
      setOpening(await retainedApi.latestClosing(business.id));
    })();
  }, [business.id]);

  const range: DateRange = { start, end };
  const money = (v: number) => formatCurrency(v, cur, true);

  const income = useMemo(() => (profit ? generateIncomeStatement(profit, inputs, range) : null), [profit, inputs, start, end]);

  if (!profit) return <p className="text-muted-foreground">Computing…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => setType(t.value)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${type === t.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        {type === 'income_statement' && income && (
          <Table rows={[
            ['Gross sales', money(income.revenue.grossSales)],
            ['Refunds & returns', money(income.revenue.refunds)],
            ['Net revenue', money(income.revenue.netRevenue), 'subtotal'],
            ['Product costs (COGS)', money(-income.cogs.productCosts)],
            ['Shipping', money(-income.cogs.shipping)],
            ['Gross profit', `${money(income.grossProfit)}  ·  ${income.grossMargin.toFixed(1)}%`, 'subtotal'],
            ['Meta ads', money(-income.opex.metaSpend)],
            ['TikTok ads', money(-income.opex.tiktokSpend)],
            ['Salaries', money(-income.opex.salaries)],
            ['Software', money(-income.opex.software)],
            ['Depreciation', money(-income.opex.depreciation)],
            ['Other opex', money(-income.opex.other)],
            ['EBIT', `${money(income.ebit)}  ·  ${income.operatingMargin.toFixed(1)}%`, 'subtotal'],
            ['Interest expense', money(income.interestExpense)],
            ['Tax', money(income.taxExpense)],
            ['Net income', `${money(income.netIncome)}  ·  ${income.netMargin.toFixed(1)}%`, 'total'],
          ]} />
        )}

        {type === 'balance_sheet' && (() => {
          const bs = generateBalanceSheet(profit, inputs, range);
          return (
            <>
              <Table rows={[
                ['Cash', money(bs.assets.cash)],
                ['Accounts receivable', money(bs.assets.accountsReceivable)],
                ['Inventory', money(bs.assets.inventory)],
                ['Prepaid credits', money(bs.assets.prepaidCredits)],
                ['Equipment (net)', money(bs.assets.totalNonCurrentAssets)],
                ['Total assets', money(bs.assets.totalAssets), 'total'],
                ['Supplier payable', money(bs.liabilities.supplierPayable)],
                ['Credit card', money(bs.liabilities.creditCard)],
                ['Tax payable', money(bs.liabilities.taxPayable)],
                ['Accrued expenses', money(bs.liabilities.accruedExpenses)],
                ['Business loans', money(bs.liabilities.businessLoans)],
                ['Total liabilities', money(bs.liabilities.totalLiabilities), 'subtotal'],
                ['Owner investment', money(bs.equity.ownerInvestment)],
                ['Retained earnings', money(bs.equity.retainedEarnings)],
                ['Total equity', money(bs.equity.totalEquity), 'subtotal'],
                ['Liabilities + equity', money(bs.totalLiabilitiesAndEquity), 'total'],
              ]} />
              <div className={`mt-3 text-sm font-medium ${bs.balanced ? 'text-success' : 'text-destructive'}`}>
                {bs.balanced ? '✓ Balanced' : '✗ Out of balance — review inputs'}
              </div>
            </>
          );
        })()}

        {type === 'cash_flow' && income && (() => {
          const cf = generateCashFlow(profit, inputs, income, range);
          return (
            <Table rows={[
              ['Net income', money(cf.operating.netIncome)],
              ['+ Depreciation', money(cf.operating.depreciation)],
              ['Δ Receivables', money(cf.operating.changeAR)],
              ['Δ Inventory', money(cf.operating.changeInventory)],
              ['Δ Payables', money(cf.operating.changeAP)],
              ['Cash from operations', money(cf.operating.netOperating), 'subtotal'],
              ['Equipment bought', money(cf.investing.equipmentBought)],
              ['Cash from investing', money(cf.investing.netInvesting), 'subtotal'],
              ['Owner withdrawals', money(cf.financing.ownerWithdrawals)],
              ['Loan payments', money(cf.financing.loanPayments)],
              ['New loans', money(cf.financing.newLoans)],
              ['Cash from financing', money(cf.financing.netFinancing), 'subtotal'],
              ['Net change in cash', money(cf.netChange), 'total'],
            ]} />
          );
        })()}

        {type === 'break_even' && (() => {
          const be = generateBreakEven(profit, inputs, range);
          return (
            <Table rows={[
              ['Avg selling price', money(be.asp)],
              ['Variable cost / unit', money(be.variableCostPerUnit)],
              ['Contribution margin / unit', money(be.contributionMarginPerUnit)],
              ['Contribution margin', `${be.contributionMarginRatio.toFixed(1)}%`],
              ['Total fixed costs', money(be.fixedCosts.total)],
              ['Break-even units', String(be.breakEvenUnits), 'subtotal'],
              ['Break-even revenue', money(be.breakEvenRevenue), 'subtotal'],
              ['Break-even ROAS', `${be.breakEvenRoas.toFixed(2)}x`],
              ['Safety margin', `${money(be.safetyMarginRevenue)}  ·  ${be.safetyMarginPct.toFixed(1)}%`, 'total'],
            ]} />
          );
        })()}

        {type === 'financial_ratios' && income && (() => {
          const bs = generateBalanceSheet(profit, inputs, range);
          const { ratios: r } = generateFinancialRatios(profit, inputs, income, bs);
          return (
            <Table rows={[
              ['Gross margin', `${r.grossMargin.toFixed(1)}%`],
              ['Operating margin', `${r.operatingMargin.toFixed(1)}%`],
              ['Net margin', `${r.netMargin.toFixed(1)}%`],
              ['Return on equity (ROE)', `${r.roe.toFixed(1)}%`],
              ['Return on assets (ROA)', `${r.roa.toFixed(1)}%`],
              ['Ad spend ratio', `${r.adSpendRatio.toFixed(1)}%`],
              ['COGS ratio', `${r.cogsRatio.toFixed(1)}%`],
              ['ROAS', `${r.roas.toFixed(2)}x`],
              ['CAC', money(r.cac)],
              ['Current ratio', r.currentRatio.toFixed(2)],
              ['Quick ratio', r.quickRatio.toFixed(2)],
              ['Debt-to-equity', r.debtToEquity.toFixed(2)],
              ['Interest coverage', `${r.interestCoverage.toFixed(1)}x`],
            ]} />
          );
        })()}
      </div>
    </div>
  );
}

function Table({ rows }: { rows: Array<[string, string, ('subtotal' | 'total')?]> }) {
  return (
    <div className="divide-y divide-border">
      {rows.map(([label, value, weight], i) => (
        <div
          key={i}
          className={`flex items-center justify-between py-2 text-sm ${
            weight === 'total' ? 'font-bold text-base' : weight === 'subtotal' ? 'font-semibold' : ''
          }`}
        >
          <span className={weight ? '' : 'text-muted-foreground'}>{label}</span>
          <span className="tabular-nums">{value}</span>
        </div>
      ))}
    </div>
  );
}
