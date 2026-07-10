import { useEffect, useState } from 'react';
import { Download, History } from 'lucide-react';
import type { Business } from '@/services/db';
import { auditApi } from '@/services/db';
import { Button } from '@/components/ui/button';
import { exportToCsv } from '@/lib/csv';

type AuditRow = { id: string; table_name: string; row_id: string | null; action: string; new_data: any; created_at: string };

export default function AuditLogTab({ business }: { business: Business }) {
  const [rows, setRows] = useState<AuditRow[]>([]);

  useEffect(() => { auditApi.list(business.id).then(setRows); }, [business.id]);

  const exportCsv = () => exportToCsv(`${business.name}-audit-log`, rows.map((r) => ({
    date: r.created_at, action: r.action, table: r.table_name, row_id: r.row_id ?? '', details: JSON.stringify(r.new_data ?? {}),
  })));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Log of significant actions — money moved, stock adjusted, records merged. Not every field edit is tracked, only hard-to-reverse events.</p>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}><Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV</Button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <History className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">No audit events yet</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
              <div>
                <span className="font-medium">{r.action}</span>
                <span className="text-xs text-muted-foreground ml-2">{r.table_name}{r.row_id ? ` · ${r.row_id.slice(0, 8)}` : ''}</span>
              </div>
              <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
