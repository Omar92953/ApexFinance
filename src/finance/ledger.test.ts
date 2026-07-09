import { describe, it, expect } from 'vitest';
import {
  isBalanced, sumLines, accountBalance, computeTrialBalance,
  computeIncomeStatementFromTrialBalance, computeBalanceSheetFromTrialBalance,
  type TrialBalanceLine,
} from './ledger';

describe('isBalanced / sumLines', () => {
  it('accepts a simple balanced two-line entry', () => {
    const lines = [{ account_id: 'cash', debit: 1000 }, { account_id: 'sales', credit: 1000 }];
    expect(isBalanced(lines)).toBe(true);
    expect(sumLines(lines)).toEqual({ totalDebit: 1000, totalCredit: 1000 });
  });

  it('rejects an unbalanced entry', () => {
    const lines = [{ account_id: 'cash', debit: 1000 }, { account_id: 'sales', credit: 900 }];
    expect(isBalanced(lines)).toBe(false);
  });

  it('accepts a balanced multi-line entry (one debit, many credits)', () => {
    const lines = [
      { account_id: 'inventory', debit: 10000 },
      { account_id: 'cash', credit: 6000 },
      { account_id: 'ap', credit: 4000 },
    ];
    expect(isBalanced(lines)).toBe(true);
  });

  it('tolerates sub-cent floating point noise but not a real mismatch', () => {
    expect(isBalanced([{ account_id: 'a', debit: 0.1 + 0.2 }, { account_id: 'b', credit: 0.3 }])).toBe(true);
    expect(isBalanced([{ account_id: 'a', debit: 100 }, { account_id: 'b', credit: 99.5 }])).toBe(false);
  });
});

describe('accountBalance', () => {
  it('is debit-normal for asset and expense accounts', () => {
    expect(accountBalance('asset', 500, 200)).toBe(300);
    expect(accountBalance('expense', 500, 200)).toBe(300);
  });
  it('is credit-normal for liability, equity, and income accounts', () => {
    expect(accountBalance('liability', 200, 500)).toBe(300);
    expect(accountBalance('equity', 200, 500)).toBe(300);
    expect(accountBalance('income', 200, 500)).toBe(300);
  });
});

function line(overrides: Partial<TrialBalanceLine>): TrialBalanceLine {
  return { account_id: 'x', account_code: '0000', account_name: 'X', account_type: 'asset', account_subtype: null, debit: 0, credit: 0, ...overrides };
}

describe('computeTrialBalance', () => {
  it('aggregates multiple lines per account and nets a debit-normal balance', () => {
    const tb = computeTrialBalance([
      line({ account_id: 'cash', account_code: '1010', account_name: 'Cash', account_type: 'asset', debit: 10000 }),
      line({ account_id: 'cash', account_code: '1010', account_name: 'Cash', account_type: 'asset', credit: 3000 }),
      line({ account_id: 'sales', account_code: '4010', account_name: 'Sales', account_type: 'income', credit: 7000 }),
    ]);
    const cashRow = tb.rows.find((r) => r.account_id === 'cash')!;
    expect(cashRow.balance).toBe(7000);
    expect(tb.totalDebit).toBe(10000);
    expect(tb.totalCredit).toBe(10000);
    expect(tb.balanced).toBe(true);
  });

  it('sorts rows by account code', () => {
    const tb = computeTrialBalance([
      line({ account_id: 'b', account_code: '5010', debit: 100 }),
      line({ account_id: 'a', account_code: '1010', debit: 100 }),
    ]);
    expect(tb.rows.map((r) => r.account_code)).toEqual(['1010', '5010']);
  });

  it('flags an unbalanced trial balance (would indicate a ledger bug, since post_journal_entry should prevent this)', () => {
    const tb = computeTrialBalance([line({ account_code: '1010', debit: 100 })]);
    expect(tb.balanced).toBe(false);
  });
});

describe('computeIncomeStatementFromTrialBalance', () => {
  it('computes revenue minus expenses grouped by subtype', () => {
    const tb = computeTrialBalance([
      line({ account_id: 'sales', account_code: '4010', account_type: 'income', credit: 10000 }),
      line({ account_id: 'cogs', account_code: '5010', account_type: 'expense', account_subtype: 'cogs', debit: 4000 }),
      line({ account_id: 'ads', account_code: '5030', account_type: 'expense', account_subtype: 'marketing', debit: 2000 }),
    ]);
    const is = computeIncomeStatementFromTrialBalance(tb);
    expect(is.revenue).toBe(10000);
    expect(is.expensesBySubtype.cogs).toBe(4000);
    expect(is.expensesBySubtype.marketing).toBe(2000);
    expect(is.totalExpenses).toBe(6000);
    expect(is.netIncome).toBe(4000);
  });
});

describe('computeBalanceSheetFromTrialBalance', () => {
  it('balances when assets equal liabilities + equity + period net income', () => {
    const tb = computeTrialBalance([
      line({ account_id: 'cash', account_code: '1010', account_type: 'asset', debit: 6000 }),
      line({ account_id: 'ap', account_code: '2010', account_type: 'liability', credit: 1000 }),
      line({ account_id: 'equity', account_code: '3010', account_type: 'equity', credit: 1000 }),
    ]);
    // Assets(6000) = Liabilities(1000) + Equity(1000) + NetIncome(4000)
    const bs = computeBalanceSheetFromTrialBalance(tb, 4000);
    expect(bs.totalAssets).toBe(6000);
    expect(bs.balanced).toBe(true);
  });

  it('flags out-of-balance when net income is wrong', () => {
    const tb = computeTrialBalance([
      line({ account_id: 'cash', account_code: '1010', account_type: 'asset', debit: 6000 }),
      line({ account_id: 'ap', account_code: '2010', account_type: 'liability', credit: 1000 }),
    ]);
    const bs = computeBalanceSheetFromTrialBalance(tb, 1000); // should be 5000
    expect(bs.balanced).toBe(false);
  });
});
