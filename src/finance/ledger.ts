// Double-entry ledger — pure math shared by the UI (pre-validation, Trial
// Balance, GL-derived statements) and proven by tests. The actual write path
// is the `post_journal_entry` Postgres RPC (see supabase/gl_schema.sql), which
// re-validates server-side so the ledger can never be left unbalanced even if
// a caller skips this check.

export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';

export interface JournalLineInput {
  account_id: string;
  debit?: number;
  credit?: number;
  description?: string;
}

export interface TrialBalanceLine {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: AccountType;
  account_subtype: string | null;
  debit: number;
  credit: number;
}

export interface TrialBalanceRow extends TrialBalanceLine {
  balance: number; // net debit-normal balance: debit - credit for asset/expense, credit - debit for liability/equity/income
}

export interface TrialBalance {
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
}

const EPSILON = 0.01;

export function sumLines(lines: JournalLineInput[]): { totalDebit: number; totalCredit: number } {
  let totalDebit = 0, totalCredit = 0;
  for (const l of lines) {
    totalDebit += l.debit ?? 0;
    totalCredit += l.credit ?? 0;
  }
  return { totalDebit: Math.round(totalDebit * 100) / 100, totalCredit: Math.round(totalCredit * 100) / 100 };
}

export function isBalanced(lines: JournalLineInput[]): boolean {
  const { totalDebit, totalCredit } = sumLines(lines);
  return Math.abs(totalDebit - totalCredit) < EPSILON;
}

// Debit-increases accounts (asset, expense) show a positive balance for debit > credit;
// credit-increases accounts (liability, equity, income) show a positive balance for credit > debit.
export function accountBalance(type: AccountType, debit: number, credit: number): number {
  return type === 'asset' || type === 'expense' ? debit - credit : credit - debit;
}

// Aggregates raw journal lines (already joined to their account) into one row
// per account with a signed, debit-normal-adjusted balance, plus totals.
export function computeTrialBalance(lines: TrialBalanceLine[]): TrialBalance {
  const byAccount = new Map<string, TrialBalanceRow>();
  for (const l of lines) {
    const existing = byAccount.get(l.account_id);
    if (existing) {
      existing.debit += l.debit;
      existing.credit += l.credit;
    } else {
      byAccount.set(l.account_id, { ...l, balance: 0 });
    }
  }
  let totalDebit = 0, totalCredit = 0;
  const rows = Array.from(byAccount.values()).map((r) => {
    r.balance = accountBalance(r.account_type, r.debit, r.credit);
    totalDebit += r.debit;
    totalCredit += r.credit;
    return r;
  }).sort((a, b) => a.account_code.localeCompare(b.account_code));

  return {
    rows,
    totalDebit: Math.round(totalDebit * 100) / 100,
    totalCredit: Math.round(totalCredit * 100) / 100,
    balanced: Math.abs(totalDebit - totalCredit) < EPSILON,
  };
}

export interface GLIncomeStatement {
  revenue: number;
  expensesBySubtype: Record<string, number>;
  totalExpenses: number;
  netIncome: number;
}

export function computeIncomeStatementFromTrialBalance(tb: TrialBalance): GLIncomeStatement {
  let revenue = 0;
  const expensesBySubtype: Record<string, number> = {};
  let totalExpenses = 0;
  for (const r of tb.rows) {
    if (r.account_type === 'income') revenue += r.balance;
    else if (r.account_type === 'expense') {
      const key = r.account_subtype ?? 'other';
      expensesBySubtype[key] = (expensesBySubtype[key] ?? 0) + r.balance;
      totalExpenses += r.balance;
    }
  }
  return { revenue, expensesBySubtype, totalExpenses, netIncome: revenue - totalExpenses };
}

export interface GLBalanceSheet {
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  netIncome: number; // period income folded into equity, shown separately
  balanced: boolean;
}

// netIncome (from computeIncomeStatementFromTrialBalance) is passed in because
// income/expense accounts aren't part of assets/liabilities/equity themselves —
// their net effect on the balance sheet is the period's undistributed profit.
export function computeBalanceSheetFromTrialBalance(tb: TrialBalance, netIncome: number): GLBalanceSheet {
  let totalAssets = 0, totalLiabilities = 0, totalEquity = 0;
  for (const r of tb.rows) {
    if (r.account_type === 'asset') totalAssets += r.balance;
    else if (r.account_type === 'liability') totalLiabilities += r.balance;
    else if (r.account_type === 'equity') totalEquity += r.balance;
  }
  totalEquity += netIncome;
  const balanced = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < EPSILON;
  return { totalAssets, totalLiabilities, totalEquity, netIncome, balanced };
}
