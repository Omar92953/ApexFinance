// Pipeline analytics — where deals die, and how long they take to get there.
//
// A kanban board tells you what's open. This tells you whether the pipeline is
// healthy: conversion between stages, how long deals sit, and how much of the
// forecast is real versus wishful.

export interface DealForAnalysis {
  id: string;
  title: string;
  value: number;
  stage: string;
  created_at?: string | null;
  updated_at?: string | null;
  expected_close?: string | null;
  win_loss_reason?: string | null;
}

export interface StageConversion {
  from: string;
  to: string;
  entered: number;
  advanced: number;
  conversionPct: number;
}

const daysBetween = (from: string, to: string) =>
  Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000);

// Stage-to-stage conversion, measured by how far each deal ever got. A deal
// currently in 'proposal' is counted as having passed through every earlier
// stage, which is the only inference available without a full stage-change log.
export function computeStageConversions(deals: DealForAnalysis[], stageOrder: string[]): StageConversion[] {
  const reachedIndex = (stage: string) => {
    if (stage === 'won') return stageOrder.length - 1;
    if (stage === 'lost') return -1;    // lost deals are handled separately below
    return stageOrder.indexOf(stage);
  };

  const out: StageConversion[] = [];
  for (let i = 0; i < stageOrder.length - 1; i++) {
    // A lost deal still counts as having entered the stage it died in.
    const entered = deals.filter((d) => {
      if (d.stage === 'lost') return true;
      const idx = reachedIndex(d.stage);
      return idx >= i;
    }).length;
    const advanced = deals.filter((d) => d.stage !== 'lost' && reachedIndex(d.stage) >= i + 1).length;
    out.push({
      from: stageOrder[i],
      to: stageOrder[i + 1],
      entered,
      advanced,
      conversionPct: entered > 0 ? (advanced / entered) * 100 : 0,
    });
  }
  return out;
}

export interface StageAging {
  stage: string;
  count: number;
  totalValue: number;
  avgDaysInStage: number;
  oldestDays: number;
}

// How long open deals have been sitting where they are. `updated_at` is the
// best available proxy for "last moved" — it's what the board writes on a
// stage change.
export function computeStageAging(deals: DealForAnalysis[], today: string, stageOrder: string[]): StageAging[] {
  return stageOrder.map((stage) => {
    const inStage = deals.filter((d) => d.stage === stage);
    const ages = inStage.map((d) => (d.updated_at ? daysBetween(d.updated_at.slice(0, 10), today) : 0));
    return {
      stage,
      count: inStage.length,
      totalValue: inStage.reduce((s, d) => s + (Number(d.value) || 0), 0),
      avgDaysInStage: ages.length > 0 ? ages.reduce((s, a) => s + a, 0) / ages.length : 0,
      oldestDays: ages.length > 0 ? Math.max(...ages) : 0,
    };
  });
}

export interface WinLossSummary {
  won: number;
  lost: number;
  winRatePct: number;
  wonValue: number;
  lostValue: number;
  avgDaysToClose: number;
  topLossReasons: Array<{ reason: string; count: number }>;
}

export function computeWinLoss(deals: DealForAnalysis[]): WinLossSummary {
  const won = deals.filter((d) => d.stage === 'won');
  const lost = deals.filter((d) => d.stage === 'lost');
  const closed = won.length + lost.length;

  const cycleTimes = won
    .filter((d) => d.created_at && d.updated_at)
    .map((d) => daysBetween(d.created_at!.slice(0, 10), d.updated_at!.slice(0, 10)))
    .filter((n) => n >= 0);

  const reasons = new Map<string, number>();
  for (const d of lost) {
    const reason = (d.win_loss_reason || 'Not recorded').trim();
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }

  return {
    won: won.length,
    lost: lost.length,
    winRatePct: closed > 0 ? (won.length / closed) * 100 : 0,
    wonValue: won.reduce((s, d) => s + (Number(d.value) || 0), 0),
    lostValue: lost.reduce((s, d) => s + (Number(d.value) || 0), 0),
    avgDaysToClose: cycleTimes.length > 0 ? cycleTimes.reduce((s, n) => s + n, 0) / cycleTimes.length : 0,
    topLossReasons: Array.from(reasons.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
  };
}

// Deals with no movement for this long are, statistically, already lost —
// they just haven't been marked yet, and they inflate the forecast until they are.
export const STALE_AFTER_DAYS = 14;

export function staleDeals(deals: DealForAnalysis[], today: string, days = STALE_AFTER_DAYS): DealForAnalysis[] {
  return deals.filter((d) => {
    if (d.stage === 'won' || d.stage === 'lost') return false;
    if (!d.updated_at) return false;
    return daysBetween(d.updated_at.slice(0, 10), today) >= days;
  });
}
