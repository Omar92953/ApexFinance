import { useEffect, useMemo, useState } from 'react';
import { useMatch, useNavigate } from 'react-router-dom';
import { ChevronDown, Check, Plus, Settings2, Search } from 'lucide-react';
import { useBusinessStore } from '@/stores/businessStore';
import type { Business } from '@/services/db';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import BusinessAvatar from './BusinessAvatar';
import BusinessFormDialog from './BusinessFormDialog';
import { cn } from '@/lib/utils';

const SEARCH_THRESHOLD = 6;

export default function BusinessSwitcher() {
  const navigate = useNavigate();
  const match = useMatch('/businesses/:id/*');
  const currentId = match?.params.id;
  const { businesses, loaded, fetch } = useBusinessStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => { if (!loaded) fetch(); }, [loaded, fetch]);

  const current = businesses.find((b) => b.id === currentId) ?? null;

  const filtered = useMemo(() => {
    if (!query.trim()) return businesses;
    const q = query.trim().toLowerCase();
    return businesses.filter((b) => b.name.toLowerCase().includes(q));
  }, [businesses, query]);

  const switchTo = (b: Business) => {
    navigate(`/businesses/${b.id}/overview`);
    setOpen(false);
  };

  const onOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) setQuery('');
  };

  return (
    <>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted transition-colors max-w-[220px]">
            {current ? <BusinessAvatar business={current} size="sm" /> : (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground shrink-0">
                <Settings2 className="h-4 w-4" />
              </div>
            )}
            <span className="truncate font-medium">{current?.name ?? 'Select a business'}</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          {businesses.length > SEARCH_THRESHOLD && (
            <div className="p-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search businesses…" className="h-8 pl-8 text-sm" autoFocus />
              </div>
            </div>
          )}

          <div className="max-h-80 overflow-y-auto p-1.5">
            {filtered.length === 0 ? (
              <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                {businesses.length === 0 ? (
                  <>
                    <p className="mb-2">No businesses yet</p>
                    <button onClick={() => { setOpen(false); setFormOpen(true); }} className="text-primary font-medium hover:underline">Create one</button>
                  </>
                ) : 'No matches'}
              </div>
            ) : filtered.map((b) => (
              <button
                key={b.id}
                onClick={() => switchTo(b)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-left hover:bg-muted transition-colors',
                  b.id === currentId && 'bg-muted/60',
                )}
              >
                <BusinessAvatar business={b} size="sm" />
                <span className="flex-1 truncate">{b.name}</span>
                {b.id === currentId && <Check className="h-4 w-4 text-primary shrink-0" />}
              </button>
            ))}
          </div>

          <Separator />
          <div className="p-1.5">
            <button
              onClick={() => { setOpen(false); setFormOpen(true); }}
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-left hover:bg-muted transition-colors"
            >
              <Plus className="h-4 w-4 text-muted-foreground" /> New business
            </button>
            <button
              onClick={() => { setOpen(false); navigate('/businesses'); }}
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-left hover:bg-muted transition-colors"
            >
              <Settings2 className="h-4 w-4 text-muted-foreground" /> Manage businesses
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <BusinessFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={null}
        onSaved={(b) => navigate(`/businesses/${b.id}/overview`)}
      />
    </>
  );
}
