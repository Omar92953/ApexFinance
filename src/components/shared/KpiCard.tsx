import { cn } from '@/lib/utils';

interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  delta?: number; // percentage change
  tone?: 'default' | 'positive' | 'negative' | 'warning';
  icon?: React.ReactNode;
  delay?: number;
}

export default function KpiCard({ label, value, sub, delta, tone = 'default', icon, delay = 0 }: KpiCardProps) {
  const toneClass =
    tone === 'positive' ? 'text-success'
    : tone === 'negative' ? 'text-destructive'
    : tone === 'warning' ? 'text-warning'
    : 'text-foreground';

  return (
    <div
      className="rounded-xl border border-border bg-card p-4 shadow-sm"
      style={{ animation: `kpi-fade-in 0.4s ease both`, animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <div className={cn('mt-2 text-2xl font-bold tabular-nums', toneClass)}>{value}</div>
      <div className="mt-1 flex items-center gap-2">
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
        {delta !== undefined && Number.isFinite(delta) && (
          <span className={cn('text-xs font-medium', delta >= 0 ? 'text-success' : 'text-destructive')}>
            {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}
