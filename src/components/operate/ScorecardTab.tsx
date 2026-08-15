import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Gauge } from 'lucide-react';
import type { Business, ScorecardMetric, ScorecardEntry } from '@/services/db';
import { scorecardApi } from '@/services/db';
import { buildScorecard, scorecardHealth, recentWeeks, type Comparator } from '@/finance/eos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const WEEKS_SHOWN = 8;

export default function ScorecardTab({ business }: { business: Business }) {
  const [metrics, setMetrics] = useState<ScorecardMetric[]>([]);
  const [entries, setEntries] = useState<ScorecardEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<ScorecardMetric>>({ comparator: 'gte', target_value: 0 });

  const today = new Date().toISOString().slice(0, 10);
  const weeks = useMemo(() => recentWeeks(today, WEEKS_SHOWN), [today]);

  const load = async () => {
    const [m, e] = await Promise.all([
      scorecardApi.listMetrics(business.id),
      scorecardApi.listEntries(business.id, weeks[0]),
    ]);
    setMetrics(m); setEntries(e);
  };
  useEffect(() => { load(); }, [business.id]);

  const rows = useMemo(() => buildScorecard(
    metrics.filter((m) => m.is_active).map((m) => ({
      metricId: m.id,
      name: m.name,
      owner: m.owner,
      target: Number(m.target_value) || 0,
      comparator: m.comparator,
      valuesByWeek: Object.fromEntries(
        entries.filter((e) => e.metric_id === m.id).map((e) => [e.week_start, e.value ?? undefined]),
      ),
    })),
    weeks,
  ), [metrics, entries, weeks]);

  const health = useMemo(() => scorecardHealth(rows), [rows]);

  const setValue = async (metricId: string, week: string, raw: string) => {
    const value = raw.trim() === '' ? null : parseFloat(raw);
    if (value !== null && Number.isNaN(value)) return;
    await scorecardApi.setEntry(business.id, metricId, week, value);
    await load();
  };

  const create = async () => {
    if (!form.name?.trim()) return;
    setSaving(true);
    try {
      await scorecardApi.createMetric({
        business_id: business.id,
        name: form.name.trim(),
        owner: form.owner || null,
        target_value: Number(form.target_value) || 0,
        comparator: (form.comparator as Comparator) ?? 'gte',
        unit: form.unit || null,
      });
      setForm({ comparator: 'gte', target_value: 0 });
      setOpen(false);
      await load();
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            A handful of leading numbers, reviewed every week. Aim for 5–15 — enough to see trouble coming, few enough to actually fill in.
          </p>
          {rows.length > 0 && (
            <p className="text-xs mt-1">
              This week: <span className="font-semibold text-success">{health.hit} hit</span>
              {health.miss > 0 && <> · <span className="font-semibold text-destructive">{health.miss} missed</span></>}
              {health.noData > 0 && <> · <span className="text-muted-foreground">{health.noData} not filled in</span></>}
            </p>
          )}
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> Add metric</Button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Gauge className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">No scorecard yet</p>
          <p className="text-sm text-muted-foreground">Pick the few numbers that tell you early whether the week is going well.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr className="text-left">
                <th className="px-4 py-2 font-medium sticky left-0 bg-card">Metric</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Target</th>
                {weeks.map((w) => (
                  <th key={w} className="px-2 py-2 font-medium text-center whitespace-nowrap text-xs">{w.slice(5)}</th>
                ))}
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.metricId} className="border-b border-border last:border-0">
                  <td className="px-4 py-1.5 sticky left-0 bg-card">
                    <div className="font-medium">{r.name}</div>
                    {r.owner && <div className="text-[11px] text-muted-foreground">{r.owner}</div>}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap text-muted-foreground">
                    {r.comparator === 'gte' ? '≥' : '≤'} {r.target}
                  </td>
                  {r.cells.map((c) => (
                    <td key={c.week} className="px-1 py-1">
                      <input
                        type="number"
                        step="any"
                        defaultValue={c.value ?? ''}
                        onBlur={(e) => setValue(r.metricId, c.week, e.target.value)}
                        className={cn(
                          'h-8 w-16 rounded border bg-background px-1.5 text-center text-xs tabular-nums',
                          c.status === 'hit' ? 'border-success/50 text-success'
                            : c.status === 'miss' ? 'border-destructive/50 text-destructive'
                            : 'border-input text-muted-foreground',
                        )}
                      />
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right">
                    <button
                      onClick={async () => { if (confirm(`Remove "${r.name}" from the scorecard?`)) { await scorecardApi.removeMetric(r.metricId); await load(); } }}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add scorecard metric</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label>Metric</Label><Input value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Weekly revenue" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Goal direction</Label>
                <select className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={form.comparator} onChange={(e) => setForm({ ...form, comparator: e.target.value as Comparator })}>
                  <option value="gte">At or above target</option>
                  <option value="lte">At or below target</option>
                </select>
              </div>
              <div className="space-y-1.5"><Label>Target</Label><Input type="number" step="any" value={form.target_value ?? 0} onChange={(e) => setForm({ ...form, target_value: parseFloat(e.target.value) || 0 })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label>Owner</Label><Input value={form.owner ?? ''} onChange={(e) => setForm({ ...form, owner: e.target.value })} placeholder="Who watches this" /></div>
              <div className="space-y-1.5"><Label>Unit (optional)</Label><Input value={form.unit ?? ''} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="EGP, %, orders" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create} disabled={saving || !form.name?.trim()}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
