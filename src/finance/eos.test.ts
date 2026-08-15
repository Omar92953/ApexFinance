import { describe, it, expect } from 'vitest';
import {
  weekStart, recentWeeks, metricStatus, buildScorecard, scorecardHealth,
  rockHealth, quarterOf, oldestOpenIssueDays,
} from './eos';

describe('weekStart', () => {
  it('snaps any weekday back to its Monday', () => {
    expect(weekStart('2026-08-12')).toBe('2026-08-10'); // Wed -> Mon
    expect(weekStart('2026-08-10')).toBe('2026-08-10'); // Mon stays
  });

  it('treats Sunday as the end of the week it belongs to, not the start', () => {
    expect(weekStart('2026-08-16')).toBe('2026-08-10'); // Sunday -> previous Monday
  });

  it('crosses month and year boundaries correctly', () => {
    expect(weekStart('2026-01-01')).toBe('2025-12-29');
  });
});

describe('recentWeeks', () => {
  it('returns the requested number of Mondays ending with the current week', () => {
    const weeks = recentWeeks('2026-08-12', 4);
    expect(weeks).toEqual(['2026-07-20', '2026-07-27', '2026-08-03', '2026-08-10']);
  });

  it('returns just this week when asked for one', () => {
    expect(recentWeeks('2026-08-12', 1)).toEqual(['2026-08-10']);
  });
});

describe('metricStatus', () => {
  it('handles higher-is-better targets', () => {
    expect(metricStatus(120, 100, 'gte')).toBe('hit');
    expect(metricStatus(80, 100, 'gte')).toBe('miss');
    expect(metricStatus(100, 100, 'gte')).toBe('hit'); // exactly on target counts
  });

  it('handles lower-is-better targets', () => {
    expect(metricStatus(3, 5, 'lte')).toBe('hit');
    expect(metricStatus(9, 5, 'lte')).toBe('miss');
  });

  it('distinguishes a missing number from a zero', () => {
    expect(metricStatus(null, 5, 'gte')).toBe('no_data');
    expect(metricStatus(undefined, 5, 'gte')).toBe('no_data');
    expect(metricStatus(0, 5, 'gte')).toBe('miss');   // 0 is real data, and it missed
  });
});

describe('buildScorecard', () => {
  const weeks = ['2026-08-03', '2026-08-10'];
  const rows = buildScorecard([
    { metricId: 'm1', name: 'Revenue', target: 1000, comparator: 'gte', valuesByWeek: { '2026-08-03': 1200, '2026-08-10': 800 } },
    { metricId: 'm2', name: 'RTO rate', target: 10, comparator: 'lte', valuesByWeek: { '2026-08-03': 5 } },
  ], weeks);

  it('produces one cell per requested week, in order', () => {
    expect(rows[0].cells.map((c) => c.week)).toEqual(weeks);
  });

  it('scores each cell against the target', () => {
    expect(rows[0].cells.map((c) => c.status)).toEqual(['hit', 'miss']);
  });

  it('leaves weeks with no entry as no_data rather than zero', () => {
    expect(rows[1].cells[1]).toMatchObject({ value: null, status: 'no_data' });
  });

  it('computes hit rate over weeks that actually have data', () => {
    expect(rows[0].hitRate).toBe(50);
    expect(rows[1].hitRate).toBe(100); // 1 of 1 scored week
  });

  it('reports the latest week as the current status', () => {
    expect(rows[0].currentStatus).toBe('miss');
    expect(rows[1].currentStatus).toBe('no_data');
  });
});

describe('scorecardHealth', () => {
  it('summarises this week and ignores no-data rows in the percentage', () => {
    const rows = buildScorecard([
      { metricId: 'a', name: 'A', target: 10, comparator: 'gte', valuesByWeek: { w: 20 } },
      { metricId: 'b', name: 'B', target: 10, comparator: 'gte', valuesByWeek: { w: 5 } },
      { metricId: 'c', name: 'C', target: 10, comparator: 'gte', valuesByWeek: {} },
    ], ['w']);
    expect(scorecardHealth(rows)).toEqual({ hit: 1, miss: 1, noData: 1, pctHit: 50 });
  });

  it('does not divide by zero when nothing has been filled in', () => {
    const rows = buildScorecard([{ metricId: 'a', name: 'A', target: 10, comparator: 'gte', valuesByWeek: {} }], ['w']);
    expect(scorecardHealth(rows).pctHit).toBe(0);
  });
});

describe('rockHealth', () => {
  const today = '2026-08-15';

  it('keeps a finished rock done even if its date has passed', () => {
    expect(rockHealth('done', '2026-01-01', today)).toBe('done');
  });

  it('marks an unfinished rock past its date as overdue', () => {
    expect(rockHealth('on_track', '2026-08-01', today)).toBe('overdue');
    expect(rockHealth('off_track', '2026-08-01', today)).toBe('overdue');
  });

  it('otherwise passes the owner-declared status through', () => {
    expect(rockHealth('on_track', '2026-12-01', today)).toBe('on_track');
    expect(rockHealth('off_track', null, today)).toBe('off_track');
  });
});

describe('quarterOf', () => {
  it('maps months to the right quarter', () => {
    expect(quarterOf('2026-01-15')).toBe('2026-Q1');
    expect(quarterOf('2026-04-01')).toBe('2026-Q2');
    expect(quarterOf('2026-08-15')).toBe('2026-Q3');
    expect(quarterOf('2026-12-31')).toBe('2026-Q4');
  });
});

describe('oldestOpenIssueDays', () => {
  const today = '2026-08-15';

  it('measures from the oldest unsolved issue', () => {
    const days = oldestOpenIssueDays([
      { status: 'open', created_at: '2026-08-01T10:00:00Z' },
      { status: 'discussing', created_at: '2026-08-10T10:00:00Z' },
    ], today);
    expect(days).toBe(14);
  });

  it('ignores solved issues entirely', () => {
    const days = oldestOpenIssueDays([
      { status: 'solved', created_at: '2020-01-01T00:00:00Z' },
      { status: 'open', created_at: '2026-08-14T00:00:00Z' },
    ], today);
    expect(days).toBe(1);
  });

  it('is zero when nothing is outstanding', () => {
    expect(oldestOpenIssueDays([], today)).toBe(0);
    expect(oldestOpenIssueDays([{ status: 'solved', created_at: '2026-01-01T00:00:00Z' }], today)).toBe(0);
  });
});
