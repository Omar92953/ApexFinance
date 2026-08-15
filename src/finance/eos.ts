// The operating rhythm — EOS ("Traction") in code.
//
// A business runs on a weekly cadence: a Scorecard of leading numbers, a
// handful of quarterly Rocks, and an Issues list worked through in a weekly
// meeting. This module holds the pure maths behind all three so the UI (and
// the signal engine) can just ask questions of it.

export type Comparator = 'gte' | 'lte';
export type MetricStatus = 'hit' | 'miss' | 'no_data';

// --- Week handling -----------------------------------------------------------
// Weeks are Monday-based and identified by their Monday's ISO date, so a metric
// entry always lands in exactly one bucket regardless of when it was typed in.
export function weekStart(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  const day = d.getUTCDay();               // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;   // shift back to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function recentWeeks(todayIso: string, count: number): string[] {
  const start = weekStart(todayIso);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(start + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - i * 7);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

// --- Scorecard ---------------------------------------------------------------
export function metricStatus(value: number | null | undefined, target: number, comparator: Comparator): MetricStatus {
  if (value === null || value === undefined || Number.isNaN(value)) return 'no_data';
  return comparator === 'gte' ? (value >= target ? 'hit' : 'miss') : (value <= target ? 'hit' : 'miss');
}

export interface ScorecardRowInput {
  metricId: string;
  name: string;
  owner?: string | null;
  target: number;
  comparator: Comparator;
  valuesByWeek: Record<string, number | undefined>;
}

export interface ScorecardCell { week: string; value: number | null; status: MetricStatus }
export interface ScorecardRow extends Omit<ScorecardRowInput, 'valuesByWeek'> {
  cells: ScorecardCell[];
  hitRate: number;      // share of weeks WITH data that hit target
  currentStatus: MetricStatus;
}

export function buildScorecard(rows: ScorecardRowInput[], weeks: string[]): ScorecardRow[] {
  return rows.map((r) => {
    const cells: ScorecardCell[] = weeks.map((w) => {
      const raw = r.valuesByWeek[w];
      const value = raw === undefined ? null : raw;
      return { week: w, value, status: metricStatus(value, r.target, r.comparator) };
    });
    const scored = cells.filter((c) => c.status !== 'no_data');
    const hits = scored.filter((c) => c.status === 'hit').length;
    return {
      metricId: r.metricId,
      name: r.name,
      owner: r.owner,
      target: r.target,
      comparator: r.comparator,
      cells,
      hitRate: scored.length > 0 ? (hits / scored.length) * 100 : 0,
      currentStatus: cells[cells.length - 1]?.status ?? 'no_data',
    };
  });
}

// Share of metrics hitting target in the most recent week — the single number
// that answers "are we on track this week?".
export function scorecardHealth(rows: ScorecardRow[]): { hit: number; miss: number; noData: number; pctHit: number } {
  let hit = 0, miss = 0, noData = 0;
  for (const r of rows) {
    if (r.currentStatus === 'hit') hit++;
    else if (r.currentStatus === 'miss') miss++;
    else noData++;
  }
  const scored = hit + miss;
  return { hit, miss, noData, pctHit: scored > 0 ? (hit / scored) * 100 : 0 };
}

// --- Rocks (quarterly priorities) --------------------------------------------
export type RockStatus = 'on_track' | 'off_track' | 'done';
export type RockHealth = RockStatus | 'overdue';

export const ROCK_HEALTH_LABELS: Record<RockHealth, string> = {
  on_track: 'On track',
  off_track: 'Off track',
  done: 'Done',
  overdue: 'Overdue',
};

export function rockHealth(status: RockStatus, dueDate: string | null | undefined, today: string): RockHealth {
  if (status === 'done') return 'done';
  if (dueDate && dueDate < today) return 'overdue';
  return status;
}

// EOS says 2-4 Rocks per quarter. More than that and nothing gets finished —
// worth surfacing rather than silently allowing a wish-list.
export const MAX_HEALTHY_ROCKS = 4;

export function quarterOf(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

// --- Issues ------------------------------------------------------------------
export type IssueStatus = 'open' | 'discussing' | 'solved';

// Age of the oldest unsolved issue — a list that never clears is the classic
// sign the weekly meeting is discussing rather than deciding.
export function oldestOpenIssueDays(issues: Array<{ status: IssueStatus; created_at: string }>, today: string): number {
  const open = issues.filter((i) => i.status !== 'solved');
  if (open.length === 0) return 0;
  const oldest = open.reduce((a, b) => (a.created_at < b.created_at ? a : b));
  return Math.floor((new Date(today).getTime() - new Date(oldest.created_at.slice(0, 10)).getTime()) / 86_400_000);
}
