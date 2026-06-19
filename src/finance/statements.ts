// Financial statement generators — ported from electron/handlers/financialStatements.ts
// Pure functions: take a ProfitCalculation + a financial-inputs map; no DB access.
import type { ProfitCalculation } from './profit-engine';

export interface DateRange {
  start: string;
  end: string;
}

// Profit calc plus the optional COGS/shipping fields the statements read.
export type ProfitLike = Partial<ProfitCalculation> & {
  cogsTotal?: number;
  shippingCost?: number;
};

export type InputsMap = Record<string, number>;

export function generateIncomeStatement(profit: ProfitLike, inputs: InputsMap, dateRange: DateRange) {
  const grossSales = profit?.grossSales ?? 0;
  const refunds = (profit?.grossSales ?? 0) - (profit?.netSales ?? 0);
  const discounts = 0;
  const netRevenue = profit?.netSales ?? 0;
  const cogs = profit?.cogsTotal ?? 0;
  const shipping = profit?.shippingCost ?? 0;
  const fees = 0;
  const totalCogs = cogs + shipping + fees;
  const grossProfit = netRevenue - totalCogs;
  const grossMargin = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;

  const metaSpend = profit?.metaSpend ?? 0;
  const tiktokSpend = profit?.tiktokSpend ?? 0;
  const salaries = inputs['Salaries & Wages'] ?? 0;
  const software = inputs['Software & Tools'] ?? 0;
  const depreciation = inputs['Depreciation/mo'] ?? 0;
  const otherOpex = inputs['Other Operating Expenses'] ?? 0;
  const totalOpex = metaSpend + tiktokSpend + salaries + software + depreciation + otherOpex;

  const ebit = grossProfit - totalOpex;
  const operatingMargin = netRevenue > 0 ? (ebit / netRevenue) * 100 : 0;
  const interestRate = inputs['Interest Rate'] ?? 0;
  const loanBalance = (inputs['Business Loans'] ?? 0) + (inputs['Credit Card Balance'] ?? 0);
  const interestExpense = (loanBalance * interestRate) / 100 / 12;
  const incomeBeforeTax = ebit - interestExpense;
  const taxRate = inputs['Tax Rate'] ?? 0;
  const taxExpense = incomeBeforeTax > 0 ? incomeBeforeTax * (taxRate / 100) : 0;
  const netIncome = incomeBeforeTax - taxExpense;
  const netMargin = netRevenue > 0 ? (netIncome / netRevenue) * 100 : 0;

  const agencyFee = profit?.userProfit !== undefined ? (profit.netProfit ?? 0) - (profit.userProfit ?? 0) : 0;
  const ownerNetIncome = netIncome - agencyFee;

  return {
    type: 'income_statement',
    dateRange,
    revenue: { grossSales, refunds: -refunds, discounts: -discounts, netRevenue },
    cogs: { productCosts: cogs, shipping, fees, totalCogs },
    grossProfit, grossMargin,
    opex: { metaSpend, tiktokSpend, salaries, software, depreciation, other: otherOpex, totalOpex },
    ebit, operatingMargin,
    interestExpense: -interestExpense,
    incomeBeforeTax,
    taxRate, taxExpense: -taxExpense,
    netIncome, netMargin,
    agencyFee: -agencyFee, ownerNetIncome,
  };
}

export function generateBalanceSheet(profit: ProfitLike, inputs: InputsMap, dateRange: DateRange) {
  const cash = inputs['Cash Balance'] ?? (profit?.netProfit ?? 0);
  const accountsReceivable = inputs['A/R Payouts'] ?? 0;
  const inventory = inputs['Inventory Value'] ?? 0;
  const prepaidCredits = inputs['Prepaid Credits'] ?? 0;
  const equipment = inputs['Equipment'] ?? 0;
  const accumDeprec = inputs['Accum. Depreciation'] ?? 0;
  const totalCurrentAssets = cash + accountsReceivable + inventory + prepaidCredits;
  const totalNonCurrentAssets = Math.max(0, equipment - accumDeprec);
  const totalAssets = totalCurrentAssets + totalNonCurrentAssets;

  const supplierPayable = inputs['Supplier Payable'] ?? 0;
  const creditCard = inputs['Credit Card Balance'] ?? 0;
  const taxPayable = inputs['Tax Payable'] ?? 0;
  const accruedExpenses = inputs['Accrued Expenses'] ?? 0;
  const businessLoans = inputs['Business Loans'] ?? 0;
  const totalCurrentLiabilities = supplierPayable + creditCard + taxPayable + accruedExpenses;
  const totalLongTermLiabilities = businessLoans;
  const totalLiabilities = totalCurrentLiabilities + totalLongTermLiabilities;

  const ownerInvestment = inputs['Owner Investment'] ?? 0;
  const retainedEarnings = totalAssets - totalLiabilities - ownerInvestment;
  const totalEquity = ownerInvestment + retainedEarnings;
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;
  const balanced = Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01;

  return {
    type: 'balance_sheet',
    dateRange,
    assets: { cash, accountsReceivable, inventory, prepaidCredits, totalCurrentAssets, equipment, accumDeprec: -accumDeprec, totalNonCurrentAssets, totalAssets },
    liabilities: { supplierPayable, creditCard, taxPayable, accruedExpenses, totalCurrentLiabilities, businessLoans, totalLongTermLiabilities, totalLiabilities },
    equity: { ownerInvestment, retainedEarnings, totalEquity },
    totalLiabilitiesAndEquity,
    balanced,
  };
}

export function generateCashFlow(profit: ProfitLike, inputs: InputsMap, incomeStatement: any, dateRange: DateRange) {
  const netIncome = incomeStatement?.netIncome ?? (profit?.netProfit ?? 0);
  const depreciation = inputs['Depreciation/mo'] ?? 0;
  const changeAR = -(inputs['A/R Payouts'] ?? 0) * 0.1;
  const changeInventory = -(inputs['Inventory Value'] ?? 0) * 0.05;
  const changeAP = (inputs['Supplier Payable'] ?? 0) * 0.05;
  const netOperating = netIncome + depreciation + changeAR + changeInventory + changeAP;

  const equipmentBought = -(inputs['Equipment Bought'] ?? 0);
  const netInvesting = equipmentBought;

  const ownerWithdrawals = -(inputs['Withdrawals'] ?? 0);
  const loanPayments = -(inputs['Loan Payments'] ?? 0);
  const newLoans = inputs['New Loans'] ?? 0;
  const netFinancing = ownerWithdrawals + loanPayments + newLoans;

  const netChange = netOperating + netInvesting + netFinancing;
  const beginningCash = (inputs['Cash Balance'] ?? 0) - netChange;
  const endingCash = inputs['Cash Balance'] ?? (profit?.netProfit ?? 0);

  return {
    type: 'cash_flow',
    dateRange,
    operating: { netIncome, depreciation, changeAR, changeInventory, changeAP, netOperating },
    investing: { equipmentBought, netInvesting },
    financing: { ownerWithdrawals, loanPayments, newLoans, netFinancing },
    netChange, beginningCash, endingCash,
  };
}

// openingBalance comes from retained_earnings_history (passed by caller); 0 if none.
export function generateRetainedEarnings(profit: ProfitLike, inputs: InputsMap, incomeStatement: any, dateRange: DateRange, openingBalance = 0) {
  const netIncome = incomeStatement?.netIncome ?? (profit?.netProfit ?? 0);
  const withdrawals = inputs['Withdrawals'] ?? 0;
  const closingBalance = openingBalance + netIncome - withdrawals;

  return {
    type: 'retained_earnings',
    dateRange,
    openingBalance, netIncome, withdrawals: -withdrawals, closingBalance,
  };
}

export function generateBreakEven(profit: ProfitLike, inputs: InputsMap, dateRange: DateRange) {
  const netRevenue = profit?.netSales ?? 0;
  const orders = profit?.orders ?? 1;
  const asp = orders > 0 ? netRevenue / orders : 0;
  const cogs = profit?.cogsTotal ?? 0;
  const shipping = profit?.shippingCost ?? 0;
  const variableCostPerUnit = orders > 0 ? (cogs + shipping) / orders : 0;
  const contributionMarginPerUnit = asp - variableCostPerUnit;
  const contributionMarginRatio = asp > 0 ? (contributionMarginPerUnit / asp) * 100 : 0;

  const salaries = inputs['Salaries & Wages'] ?? 0;
  const software = inputs['Software & Tools'] ?? 0;
  const depreciation = inputs['Depreciation/mo'] ?? 0;
  const other = inputs['Other Operating Expenses'] ?? 0;
  const totalFixedCosts = salaries + software + depreciation + other;

  const breakEvenUnits = contributionMarginPerUnit > 0 ? Math.ceil(totalFixedCosts / contributionMarginPerUnit) : 0;
  const breakEvenRevenue = breakEvenUnits * asp;
  const currentRoas = profit?.roas ?? 0;
  const breakEvenRoas = profit?.breakevenRoas ?? 1.5;
  const safetyMarginRevenue = netRevenue - breakEvenRevenue;
  const safetyMarginPct = netRevenue > 0 ? (safetyMarginRevenue / netRevenue) * 100 : 0;

  return {
    type: 'break_even',
    dateRange,
    asp, variableCostPerUnit, contributionMarginPerUnit, contributionMarginRatio,
    fixedCosts: { salaries, software, depreciation, other, total: totalFixedCosts },
    breakEvenUnits, breakEvenRevenue,
    actual: { units: orders, revenue: netRevenue, roas: currentRoas },
    breakEvenRoas,
    safetyMarginRevenue, safetyMarginPct,
  };
}

export function generateFinancialRatios(profit: ProfitLike, _inputs: InputsMap, incomeStatement: any, balanceSheet: any) {
  const revenue = incomeStatement?.revenue?.netRevenue ?? profit?.netSales ?? 0;
  const grossProfit = incomeStatement?.grossProfit ?? 0;
  const ebit = incomeStatement?.ebit ?? 0;
  const netIncome = incomeStatement?.netIncome ?? profit?.netProfit ?? 0;
  const totalAssets = balanceSheet?.assets?.totalAssets ?? 1;
  const totalEquity = balanceSheet?.equity?.totalEquity ?? 1;
  const totalLiabilities = balanceSheet?.liabilities?.totalLiabilities ?? 0;
  const currentAssets = balanceSheet?.assets?.totalCurrentAssets ?? 0;
  const currentLiabilities = balanceSheet?.liabilities?.totalCurrentLiabilities ?? 1;
  const cash = balanceSheet?.assets?.cash ?? 0;
  const receivables = balanceSheet?.assets?.accountsReceivable ?? 0;
  const adSpend = profit?.totalAdSpend ?? 0;
  const cogs = incomeStatement?.cogs?.totalCogs ?? 0;
  const interestExpense = Math.abs(incomeStatement?.interestExpense ?? 0);

  const ratios = {
    grossMargin: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
    operatingMargin: revenue > 0 ? (ebit / revenue) * 100 : 0,
    netMargin: revenue > 0 ? (netIncome / revenue) * 100 : 0,
    roe: totalEquity > 0 ? (netIncome / totalEquity) * 100 : 0,
    roa: totalAssets > 0 ? (netIncome / totalAssets) * 100 : 0,
    adSpendRatio: revenue > 0 ? (adSpend / revenue) * 100 : 0,
    cogsRatio: revenue > 0 ? (cogs / revenue) * 100 : 0,
    roas: profit?.roas ?? 0,
    cac: profit?.cac ?? 0,
    currentRatio: currentLiabilities > 0 ? currentAssets / currentLiabilities : 0,
    quickRatio: currentLiabilities > 0 ? (cash + receivables) / currentLiabilities : 0,
    debtToEquity: totalEquity > 0 ? totalLiabilities / totalEquity : 0,
    interestCoverage: interestExpense > 0 ? ebit / interestExpense : 0,
    revenueGrowth: 0,
    profitGrowth: 0,
  };

  return { type: 'financial_ratios', ratios };
}

// Convenience: build the full package in one call.
export function generateStatement(
  type: string,
  profit: ProfitLike,
  inputs: InputsMap,
  dateRange: DateRange,
  openingRetainedBalance = 0,
) {
  const incomeStatement = generateIncomeStatement(profit, inputs, dateRange);
  switch (type) {
    case 'income_statement':
      return incomeStatement;
    case 'balance_sheet':
      return generateBalanceSheet(profit, inputs, dateRange);
    case 'cash_flow':
      return generateCashFlow(profit, inputs, incomeStatement, dateRange);
    case 'retained_earnings':
      return generateRetainedEarnings(profit, inputs, incomeStatement, dateRange, openingRetainedBalance);
    case 'break_even':
      return generateBreakEven(profit, inputs, dateRange);
    case 'financial_ratios': {
      const bs = generateBalanceSheet(profit, inputs, dateRange);
      return generateFinancialRatios(profit, inputs, incomeStatement, bs);
    }
    case 'financial_package': {
      const bs = generateBalanceSheet(profit, inputs, dateRange);
      const cf = generateCashFlow(profit, inputs, incomeStatement, dateRange);
      const re = generateRetainedEarnings(profit, inputs, incomeStatement, dateRange, openingRetainedBalance);
      const be = generateBreakEven(profit, inputs, dateRange);
      const ratios = generateFinancialRatios(profit, inputs, incomeStatement, bs);
      return { type: 'financial_package', dateRange, incomeStatement, balanceSheet: bs, cashFlow: cf, retainedEarnings: re, breakEven: be, ratios };
    }
    default:
      return incomeStatement;
  }
}
