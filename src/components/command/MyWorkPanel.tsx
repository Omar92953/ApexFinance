import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, ClipboardList } from 'lucide-react';
import type { Business, TaskRow } from '@/services/db';
import { tasksApi } from '@/services/db';
import { cn } from '@/lib/utils';

const PRIORITY_TONE: Record<string, string> = {
  urgent: 'bg-destructive/15 text-destructive',
  high: 'bg-warning/15 text-warning',
  normal: 'bg-muted text-muted-foreground',
  low: 'bg-muted text-muted-foreground',
};

export default function MyWorkPanel({ business }: { business: Business }) {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const today = new Date().toISOString().slice(0, 10);

  const load = async () => {
    setLoading(true);
    try { setTasks(await tasksApi.listOpen(business.id)); }
    catch { setTasks([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [business.id]);

  const complete = async (t: TaskRow) => {
    setTasks((prev) => prev.filter((x) => x.id !== t.id));   // optimistic
    try { await tasksApi.update(t.id, { is_done: true }); }
    catch { load(); }
  };

  if (loading) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold mb-3">My open work</h3>

      {tasks.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ClipboardList className="h-4 w-4" /> Nothing queued. Add something from the list above.
        </div>
      ) : (
        <div className="space-y-1.5">
          {tasks.slice(0, 8).map((t) => {
            const overdue = t.due_date && t.due_date < today;
            return (
              <div key={t.id} className="flex items-start gap-2.5 text-sm">
                <button onClick={() => complete(t)} className="mt-0.5 text-muted-foreground hover:text-success shrink-0" aria-label="Mark done">
                  <Circle className="h-4 w-4" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span>{t.title}</span>
                    {t.priority && t.priority !== 'normal' && (
                      <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize', PRIORITY_TONE[t.priority])}>{t.priority}</span>
                    )}
                  </div>
                  {t.notes && <div className="text-xs text-muted-foreground truncate">{t.notes}</div>}
                </div>
                {t.due_date && (
                  <span className={cn('text-xs shrink-0 tabular-nums', overdue ? 'text-destructive font-medium' : 'text-muted-foreground')}>
                    {overdue ? 'overdue' : t.due_date}
                  </span>
                )}
              </div>
            );
          })}
          {tasks.length > 8 && <p className="text-xs text-muted-foreground pt-1">+{tasks.length - 8} more in CRM → Tasks</p>}
        </div>
      )}
    </div>
  );
}
