import { useEffect, useState } from 'react';
import { Trash2, Upload } from 'lucide-react';
import type { Business, MetricRow } from '@/services/db';
import { metricsApi } from '@/services/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/utils';

const FIELDS: { key: string; label: string; money?: boolean }[] = [
  { key: 'gross_sales', label: 'Gross sales', money: true },
  { key: 'net_sales', label: 'Net sales', money: true },
  { key: 'orders', label: 'Orders' },
  { key: 'units_sold', label: 'Units sold' },
  { key: 'meta_spend', label: 'Meta ad spend', money: true },
  { key: 'tiktok_spend', label: 'TikTok ad spend', money: true },
  { key: 'google_spend', label: 'Google ad spend', money: true },
];

const today = () => new Date().toISOString().slice(0, 10);

export default function DataEntryTab({ business, start, end, onChanged }: { business: Business; start: string; end: string; onChanged: () => void }) {
  const cur = business.currency ?? 'USD';
  const [date, setDate] = useState(today());
  const [vals, setVals] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<MetricRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csv, setCsv] = useState('');

  const load = async () => setRows(await metricsApi.listForRange(business.id, start, end));
  useEffect(() => { load(); }, [business.id, start, end]);

  const save = async () => {
    const payload = FIELDS
      .filter((f) => vals[f.key] !== undefined && vals[f.key] !== '')
      .map((f) => ({ platform: 'manual', metric_date: date, metric_type: f.key, metric_value: parseFloat(vals[f.key]) || 0 }));
    if (payload.length === 0) return;
    setSaving(true);
    try {
      await metricsApi.upsertMany(business.id, payload);
      setVals({});
      await load();
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const del = async (id?: string) => { if (!id) return; await metricsApi.remove(id); await load(); onChanged(); };

  // CSV: header row with date,gross_sales,net_sales,orders,units_sold,meta_spend,...
  const importCsv = async () => {
    const lines = csv.trim().split(/\r?\n/);
    if (lines.length < 2) return;
    const headers = lines[0].split(',').map((h) => h.trim());
    const dateIdx = headers.findIndex((h) => /date/i.test(h));
    const payload: Array<{ platform: string; metric_date: string; metric_type: string; metric_value: number }> = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(',');
      const d = (cells[dateIdx] || '').trim();
      if (!d) continue;
      headers.forEach((h, idx) => {
        if (idx === dateIdx) return;
        const key = h.trim();
        if (!FIELDS.some((f) => f.key === key)) return;
        const v = parseFloat((cells[idx] || '').trim());
        if (!Number.isNaN(v)) payload.push({ platform: 'manual', metric_date: d, metric_type: key, metric_value: v });
      });
    }
    if (payload.length) {
      await metricsApi.upsertMany(business.id, payload);
      setCsv(''); setCsvOpen(false); await load(); onChanged();
    }
  };

  // Group rows by date for display
  const byDate = rows.reduce<Record<string, MetricRow[]>>((acc, r) => {
    (acc[r.metric_date] ||= []).push(r);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">Add data for a date</h3>
          <Button variant="outline" size="sm" onClick={() => setCsvOpen((v) => !v)}><Upload className="h-3.5 w-3.5 mr-1.5" /> CSV import</Button>
        </div>

        {csvOpen && (
          <div className="mb-4 space-y-2 rounded-lg border border-dashed border-border p-3">
            <p className="text-xs text-muted-foreground">Paste CSV with a <code>date</code> column plus any of: {FIELDS.map((f) => f.key).join(', ')}.</p>
            <textarea className="h-28 w-full rounded-md border border-input bg-background p-2 text-xs font-mono" value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={'date,net_sales,orders,meta_spend\n2026-06-01,1200,8,300'} />
            <div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => setCsvOpen(false)}>Cancel</Button><Button size="sm" onClick={importCsv}>Import</Button></div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          {FIELDS.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label>{f.label}</Label>
              <Input type="number" step="any" value={vals[f.key] ?? ''} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} placeholder="0" />
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save entry'}</Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-3">Entries in selected period</h3>
        {Object.keys(byDate).length === 0 ? (
          <p className="text-sm text-muted-foreground">No data in this range. Add an entry above or import a CSV.</p>
        ) : (
          <div className="space-y-3">
            {Object.entries(byDate).sort((a, b) => b[0].localeCompare(a[0])).map(([d, items]) => (
              <div key={d} className="rounded-lg border border-border p-3">
                <div className="text-xs font-medium text-muted-foreground mb-2">{d}</div>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  {items.map((it) => {
                    const f = FIELDS.find((x) => x.key === it.metric_type);
                    return (
                      <span key={it.id} className="inline-flex items-center gap-1.5">
                        <span className="text-muted-foreground">{f?.label ?? it.metric_type}:</span>
                        <span className="tabular-nums">{f?.money ? formatCurrency(Number(it.metric_value), cur) : Number(it.metric_value)}</span>
                        <button onClick={() => del(it.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
