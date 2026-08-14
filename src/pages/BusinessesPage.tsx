import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Building2, Pencil, Trash2, ChevronRight } from 'lucide-react';
import { useBusinessStore } from '@/stores/businessStore';
import type { Business } from '@/services/db';
import { Button } from '@/components/ui/button';
import BusinessAvatar from '@/components/business/BusinessAvatar';
import BusinessFormDialog from '@/components/business/BusinessFormDialog';

export default function BusinessesPage() {
  const navigate = useNavigate();
  const { businesses, loaded, fetch, remove } = useBusinessStore();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Business | null>(null);

  useEffect(() => { if (!loaded) fetch(); }, [loaded, fetch]);

  const openCreate = () => { setEditing(null); setOpen(true); };
  const openEdit = (b: Business) => { setEditing(b); setOpen(true); };

  const del = async (b: Business) => {
    if (confirm(`Delete "${b.name}" and all its finance data? This cannot be undone.`)) {
      await remove(b.id);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Manage businesses</h1>
          <p className="text-sm text-muted-foreground">Each business has its own full finance & cost workspace. Use the switcher (top right) for quick switching.</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1.5" /> New business</Button>
      </div>

      {!loaded ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : businesses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Building2 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">No businesses yet</p>
          <p className="text-sm text-muted-foreground mb-4">Create your first business to start tracking finances.</p>
          <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1.5" /> New business</Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {businesses.map((b) => (
            <div key={b.id} className="group rounded-xl border border-border bg-card p-4 hover:border-primary/50 transition-colors">
              <div className="flex items-start justify-between">
                <button onClick={() => navigate(`/businesses/${b.id}/overview`)} className="flex items-center gap-3 text-left">
                  <BusinessAvatar business={b} size="md" />
                  <div className="font-semibold">{b.name}</div>
                </button>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(b)} className="rounded p-1.5 hover:bg-muted" aria-label="Edit"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => del(b)} className="rounded p-1.5 hover:bg-destructive hover:text-destructive-foreground" aria-label="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              <button onClick={() => navigate(`/businesses/${b.id}/overview`)} className="mt-4 flex w-full items-center justify-between text-sm text-primary font-medium">
                Open workspace <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <BusinessFormDialog open={open} onOpenChange={setOpen} editing={editing} />
    </div>
  );
}
